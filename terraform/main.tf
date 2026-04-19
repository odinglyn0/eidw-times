terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_sql_database_instance" "postgres" {
  name                = "eidwtimes-db"
  database_version    = "POSTGRES_15"
  region              = var.region
  deletion_protection = true

  settings {
    tier = "db-f1-micro"

    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }

    ip_configuration {
      ipv4_enabled = true
      authorized_networks {
        name  = "all"
        value = "0.0.0.0/0"
      }
    }
  }
}

resource "google_sql_database" "database" {
  name     = "eidwtimes"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "user" {
  name     = "app_user"
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

locals {
  database_url = "postgresql://${google_sql_user.user.name}:${var.db_password}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}"
}

resource "google_cloud_run_v2_job" "security_poller" {
  name     = "eidw-security-poller"
  location = var.region

  template {
    template {
      containers {
        image = "gcr.io/${var.project_id}/eidw-security-poller:latest"

        env {
          name  = "DATABASE_URL"
          value = local.database_url
        }
      }
      timeout     = "60s"
      max_retries = 1
    }
  }

  depends_on = [google_sql_database_instance.postgres]
}

resource "google_cloud_run_v2_job" "departure_poller" {
  name     = "eidw-departure-poller"
  location = var.region

  template {
    template {
      containers {
        image = "gcr.io/${var.project_id}/eidw-departure-poller:latest"

        env {
          name  = "DATABASE_URL"
          value = local.database_url
        }
      }
      timeout     = "120s"
      max_retries = 1
    }
  }

  depends_on = [google_sql_database_instance.postgres]
}

resource "google_cloud_run_v2_service" "backend" {
  name     = "eidwtimesbackend"
  location = var.region

  template {
    scaling {
      min_instance_count = 1
      max_instance_count = 50
    }

    containers {
      image = "gcr.io/${var.project_id}/eidw-backend:latest"

      env {
        name  = "DATABASE_URL"
        value = local.database_url
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "RECAPTCHA_SITE_KEY"
        value = var.recaptcha_site_key
      }

      env {
        name  = "RECAPTCHA_ACTION"
        value = "submit_feature_request"
      }

      env {
        name  = "BOUNCE_TOKEN_SECRET"
        value = var.bounce_token_secret
      }

      env {
        name  = "DATAGRAM_SIGNING_KEY"
        value = var.datagram_signing_key
      }

      env {
        name  = "REDIS_URL"
        value = var.redis_url
      }
    }
  }

  depends_on = [google_sql_database_instance.postgres]
}

resource "google_service_account" "scheduler_sa" {
  account_id   = "eidw-scheduler-sa"
  display_name = "Cloud Scheduler SA"
}

resource "google_project_iam_member" "scheduler_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.scheduler_sa.email}"
}

resource "google_cloud_run_service_iam_binding" "backend_public" {
  location = google_cloud_run_v2_service.backend.location
  service  = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  members  = ["allUsers"]
}

resource "google_cloud_scheduler_job" "security_poller_peak" {
  name             = "eidw-security-poller-peak"
  description      = "Poll security times every minute during 04:00-23:55"
  schedule         = "* 4-23 * * *"
  time_zone        = "Europe/Dublin"
  attempt_deadline = "60s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/eidw-security-poller:run"

    oauth_token {
      service_account_email = google_service_account.scheduler_sa.email
    }
  }

  depends_on = [google_cloud_run_v2_job.security_poller]
}

resource "google_cloud_scheduler_job" "security_poller_offpeak" {
  name             = "eidw-security-poller-offpeak"
  description      = "Poll security times every minute during 00:00-03:59"
  schedule         = "* 0-3 * * *"
  time_zone        = "Europe/Dublin"
  attempt_deadline = "60s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/eidw-security-poller:run"

    oauth_token {
      service_account_email = google_service_account.scheduler_sa.email
    }
  }

  depends_on = [google_cloud_run_v2_job.security_poller]
}

resource "google_cloud_scheduler_job" "departure_poller_schedule" {
  name             = "eidw-departure-poller-schedule"
  description      = "Poll departure data every 3 minutes"
  schedule         = "*/3 * * * *"
  time_zone        = "Europe/Dublin"
  attempt_deadline = "120s"

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/eidw-departure-poller:run"

    oauth_token {
      service_account_email = google_service_account.scheduler_sa.email
    }
  }

  depends_on = [google_cloud_run_v2_job.departure_poller]
}

output "database_connection_string" {
  value     = local.database_url
  sensitive = true
}

output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}