param(
    [string]$ProjectId = "orkavi-atk",
    [string]$Region = "europe-west1"
)

Write-Host "Building and pushing Docker images..."

docker build -t "gcr.io/$ProjectId/eidw-security-poller:latest" -f pysrc/Dockerfile.security ./pysrc
docker push "gcr.io/$ProjectId/eidw-security-poller:latest"

docker build -t "gcr.io/$ProjectId/eidw-departure-poller:latest" -f pysrc/Dockerfile.departures ./pysrc
docker push "gcr.io/$ProjectId/eidw-departure-poller:latest"

$envContent = Get-Content "backend\.env"
$HfToken = ($envContent | Where-Object { $_ -match "^HF_TOKEN=" }) -replace "^HF_TOKEN=", ""
docker build --build-arg "HF_TOKEN=$HfToken" -t "gcr.io/$ProjectId/eidw-backend:latest" ./backend
docker push "gcr.io/$ProjectId/eidw-backend:latest"

docker build --build-arg "HF_TOKEN=$HfToken" -t "gcr.io/$ProjectId/eidw-predictor:latest" ./predictor
docker push "gcr.io/$ProjectId/eidw-predictor:latest"

docker build -t "gcr.io/$ProjectId/eidw-tweeter:latest" ./tweeter
docker push "gcr.io/$ProjectId/eidw-tweeter:latest"

Write-Host "Deploying infrastructure with Terraform..."
Push-Location terraform

terraform init
terraform apply -var="project_id=$ProjectId" -var="region=$Region" -auto-approve

Write-Host "Getting database connection details..."
$DbConnection = terraform output -raw database_connection_string

Write-Host "Deployment complete!"
$BackendUrl = terraform output -raw backend_url
Write-Host "Backend URL: $BackendUrl"

Pop-Location
