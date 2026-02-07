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
  name             = "eidwtimes-db"
  database_version = "POSTGRES_15"
  region           = var.region
  deletion_protection = false

  settings {
    tier = "db-f1-micro"
    
    backup_configuration {
      enabled = true
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

resource "google_cloud_run_v2_service" "poller" {
  name     = "eidwpoller"
  location = var.region

  template {
    containers {
      image = "gcr.io/${var.project_id}/eidw-poller:latest"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://${google_sql_user.user.name}:${var.db_password}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}"
      }
    }
  }

  depends_on = [google_sql_database_instance.postgres]
}

resource "google_cloud_run_v2_service" "backend" {
  name     = "eidwtimesbackend"
  location = var.region

  template {
    containers {
      image = "gcr.io/${var.project_id}/eidw-backend:latest"
      
      env {
        name  = "DATABASE_URL"
        value = "postgresql://${google_sql_user.user.name}:${var.db_password}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}"
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
    }
  }

  depends_on = [google_sql_database_instance.postgres]
}

resource "google_cloud_run_service_iam_binding" "backend_public" {
  location = google_cloud_run_v2_service.backend.location
  service  = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  members = [
    "allUsers"
  ]
}

resource "google_cloud_scheduler_job" "poller_frequent" {
  name             = "eidw-poller-frequent"
  description      = "Poll Dublin Airport API every 30 seconds during peak hours"
  schedule         = "*/30 4-23 * * *"
  time_zone        = "Europe/Dublin"
  attempt_deadline = "30s"

  http_target {
    http_method = "POST"
    uri         = google_cloud_run_v2_service.poller.uri
  }
}

resource "google_cloud_scheduler_job" "poller_off_peak" {
  name             = "eide-poller-off-peak"
  description      = "Poll Dublin Airport API every minute during off-peak hours"
  schedule         = "* 0-3 * * *"
  time_zone        = "Europe/Dublin"
  attempt_deadline = "30s"

  http_target {
    http_method = "POST"
    uri         = google_cloud_run_v2_service.poller.uri
  }
}

output "database_connection_string" {
  value = "postgresql://${google_sql_user.user.name}:${var.db_password}@${google_sql_database_instance.postgres.public_ip_address}:5432/${google_sql_database.database.name}"
  sensitive = true
}

output "backend_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "poller_url" {
  value = google_cloud_run_v2_service.poller.uri
}