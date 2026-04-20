@echo off
setlocal

set PROJECT_ID=%1
set REGION=%2

if "%PROJECT_ID%"=="" set PROJECT_ID=orkavi-atk
if "%REGION%"=="" set REGION=europe-west1

echo Building and pushing Docker images...

docker build -t gcr.io/%PROJECT_ID%/eidw-security-poller:latest -f pysrc/Dockerfile.security ./pysrc
docker push gcr.io/%PROJECT_ID%/eidw-security-poller:latest

docker build -t gcr.io/%PROJECT_ID%/eidw-departure-poller:latest -f pysrc/Dockerfile.departures ./pysrc
docker push gcr.io/%PROJECT_ID%/eidw-departure-poller:latest

for /f "tokens=1,2 delims==" %%a in (backend\.env) do (
    if "%%a"=="HF_TOKEN" set HF_TOKEN=%%b
)
docker build --build-arg HF_TOKEN=%HF_TOKEN% -t gcr.io/%PROJECT_ID%/eidw-backend:latest ./backend
docker push gcr.io/%PROJECT_ID%/eidw-backend:latest

docker build --build-arg HF_TOKEN=%HF_TOKEN% -t gcr.io/%PROJECT_ID%/eidw-predictor:latest ./predictor
docker push gcr.io/%PROJECT_ID%/eidw-predictor:latest

docker build -t gcr.io/%PROJECT_ID%/eidw-tweeter:latest ./tweeter
docker push gcr.io/%PROJECT_ID%/eidw-tweeter:latest

echo Deploying infrastructure with Terraform...
cd terraform

terraform init
terraform apply -var="project_id=%PROJECT_ID%" -var="region=%REGION%" -auto-approve

echo Getting database connection details...
for /f "tokens=*" %%i in ('terraform output -raw database_connection_string') do set DB_CONNECTION=%%i

echo Deployment complete!
for /f "tokens=*" %%i in ('terraform output -raw backend_url') do echo Backend URL: %%i