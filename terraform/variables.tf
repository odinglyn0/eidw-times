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

variable "bounce_token_secret" {
  description = "Secret key for signing elasticBounceTokenScreen JWTs (HS512)"
  type        = string
  sensitive   = true
}

variable "datagram_signing_key" {
  description = "Secret key for datagram v2 HMAC-SHA512 route obfuscation and cookie signing"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Redis connection string (redis://user:pass@host:port/db)"
  type        = string
  sensitive   = true
}

variable "twitter_username" {
  description = "Twitter account username for the tweeter service"
  type        = string
}

variable "twitter_email" {
  description = "Twitter account email for the tweeter service"
  type        = string
}

variable "twitter_password" {
  description = "Twitter account password for the tweeter service"
  type        = string
  sensitive   = true
}