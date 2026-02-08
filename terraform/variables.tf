variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "europe-west1"
}

variable "db_password" {
  description = "Password for the database user"
  type        = string
  sensitive   = true
}

variable "recaptcha_site_key" {
  description = "Google reCAPTCHA Enterprise site key"
  type        = string
}

variable "google_maps_api_key" {
  description = "Google Maps API key for Routes API travel time polling"
  type        = string
  sensitive   = true
}