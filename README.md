# Dublin Airport Security Times - GCP Migration

This project has been migrated from Supabase to Google Cloud Platform with the following architecture:

## Architecture

- **Python Poller** (`/pysrc`): Cloud Run function that polls Dublin Airport API every 30 seconds (4am-11:55pm) or every minute (off-peak)
- **Backend API** (`/backend`): Flask API on Cloud Run that serves data to the frontend
- **Database**: Google Cloud SQL (PostgreSQL)
- **Frontend**: Vite app deployed on Vercel
- **Scheduling**: Google Cloud Scheduler triggers the poller

## Deployment

1. Set up GCP project and enable required APIs
2. Configure Docker and gcloud CLI
3. Run deployment script:

```bash
./deploy.sh your-project-id europe-west1
```

## Environment Variables

The Terraform configuration automatically sets up:
- `DATABASE_URL` for both services
- Cloud Run services with proper IAM bindings
- Cloud Scheduler jobs for polling

## API Endpoints

- `GET /api/current-security-data` - Current T1/T2 security times
- `GET /api/security-data` - Historical 7-day security data
- `POST /api/departure-data` - Departure data by terminal
- `POST /api/feature-requests` - Submit feature request
- `GET /api/acknowledged-feature-requests` - Get acknowledged requests
- `GET /api/active-announcements` - Get active announcements

## Database Schema

See `sql/schema.sql` for the complete database structure including:
- `security_times` - Historical security data
- `security_times_current` - Current security status
- `departures` - Flight departure data
- `feature_requests` - User feature requests
- `announcements` - System announcements