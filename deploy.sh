#!/bin/bash

set -e

PROJECT_ID=${1:-"your-project-id"}
REGION=${2:-"europe-west1"}

echo "Building and pushing Docker images..."

docker build -t gcr.io/$PROJECT_ID/dublin-airport-poller:latest ./pysrc
docker push gcr.io/$PROJECT_ID/dublin-airport-poller:latest

docker build -t gcr.io/$PROJECT_ID/dublin-airport-backend:latest ./backend
docker push gcr.io/$PROJECT_ID/dublin-airport-backend:latest

echo "Deploying infrastructure with Terraform..."
cd terraform

terraform init
terraform plan -var="project_id=$PROJECT_ID" -var="region=$REGION"
terraform apply -var="project_id=$PROJECT_ID" -var="region=$REGION" -auto-approve

echo "Getting database connection details..."
DB_CONNECTION=$(terraform output -raw database_connection_string)

echo "Setting up database schema..."
psql "$DB_CONNECTION" -f ../sql/schema.sql

echo "Deployment complete!"
echo "Backend URL: $(terraform output -raw backend_url)"