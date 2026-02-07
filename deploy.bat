@echo off
setlocal

set PROJECT_ID=%1
set REGION=%2

if "%PROJECT_ID%"=="" set PROJECT_ID=orkavi-atk
if "%REGION%"=="" set REGION=europe-west1

echo Building and pushing Docker images...

docker build -t gcr.io/%PROJECT_ID%/eidw-poller:latest ./pysrc
docker push gcr.io/%PROJECT_ID%/eidw-poller:latest

docker build -t gcr.io/%PROJECT_ID%/eidw-backend:latest ./backend
docker push gcr.io/%PROJECT_ID%/eidw-backend:latest

echo Deploying infrastructure with Terraform...
cd terraform

terraform init
terraform plan -var="project_id=%PROJECT_ID%" -var="region=%REGION%"
terraform apply -var="project_id=%PROJECT_ID%" -var="region=%REGION%" -auto-approve

echo Getting database connection details...
for /f "tokens=*" %%i in ('terraform output -raw database_connection_string') do set DB_CONNECTION=%%i

echo Setting up database schema...
psql "%DB_CONNECTION%" -f ../sql/schema.sql

echo Deployment complete!
for /f "tokens=*" %%i in ('terraform output -raw backend_url') do echo Backend URL: %%i