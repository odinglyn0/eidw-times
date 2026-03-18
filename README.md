# <img src="https://img.shields.io/badge/✈️-EIDW%20Times-black?style=for-the-badge&labelColor=0d1117" height="40" />

```
 ███████╗██╗██████╗ ██╗    ██╗  ████████╗██╗███╗   ███╗███████╗███████╗
 ██╔════╝██║██╔══██╗██║    ██║  ╚══██╔══╝██║████╗ ████║██╔════╝██╔════╝
 █████╗  ██║██║  ██║██║ █╗ ██║     ██║   ██║██╔████╔██║█████╗  ███████╗
 ██╔══╝  ██║██║  ██║██║███╗██║     ██║   ██║██║╚██╔╝██║██╔══╝  ╚════██║
 ███████╗██║██████╔╝╚███╔███╔╝     ██║   ██║██║ ╚═╝ ██║███████╗███████║
 ╚══════╝╚═╝╚═════╝  ╚══╝╚══╝      ╚═╝   ╚═╝╚═╝     ╚═╝╚══════╝╚══════╝
```

> **Live security queue wait times for Dublin Airport Terminal 1 & Terminal 2.**
> The data is already there. This just predicts it.

<p>
  <img src="https://img.shields.io/badge/react-18.3-61DAFB?style=flat-square&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/typescript-5.5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/vite-6.3-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/flask-2.3-000000?style=flat-square&logo=flask&logoColor=white" />
  <img src="https://img.shields.io/badge/postgres-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/redis-cache-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/xgboost-ML-FF6F00?style=flat-square" />
  <img src="https://img.shields.io/badge/docker-GCR-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/vercel-frontend-000000?style=flat-square&logo=vercel&logoColor=white" />
  <img src="https://img.shields.io/badge/GCP-Cloud%20Run-4285F4?style=flat-square&logo=googlecloud&logoColor=white" />
</p>

```
┌──────────────────────────────────────────────────────────────────────┐
│  Dublin Airport API ──► Scrapy pollers ──► PostgreSQL ──► Flask API  │
│                                                                      │
│  T1/T2 security times   polled every few minutes, stored forever     │
│  Departure board         polled daily, upserted on conflict          │
│  ML predictions     6 models (T1/T2 × 60/120/180 min ahead)           │
│  Monte Carlo sims        Liminal (A/B/D) + Trition (A/B/C/D)          │
│  React dashboard         live tiles, charts, recommendations, PWA    │
└──────────────────────────────────────────────────────────────────────┘
```

## What it is

Real-time dashboard for Dublin Airport (DUB/EIDW) security queue wait times. Shows T1 and T2 times, recommends which terminal to use, shows departure boards, historical trends, and predicted future wait times. Passengers at Dublin Airport can use either terminal's security regardless of which terminal their flight departs from — the app uses that to recommend the shorter queue.

Live at [eidwtimes.xyz](https://eidwtimes.xyz)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────┐
│ poll_security.py │────►│                 │     │              │
│ (Cloud Run Job)  │     │   PostgreSQL    │◄────│  Flask API   │
│                  │     │                 │     │  (Cloud Run) │
│ poll_departures  │────►│  6 tables:      │     │              │
│ (Cloud Run Job)  │     │  security_times │     │  /api/*      │
└─────────────────┘     │  departures     │     └──────┬───────┘
                        │  announcements  │     ┌──────┴───────┐
                        │  sec_current    │     │  rate limit  │
                        └─────────────────┘     │  response $  │
                                                └──────────────┘
                                                       │
                                                ┌──────┴───────┐
                                                │  React SPA   │
                                                │  (Vercel)    │
                                                └──────────────┘
```

**Pollers** — Scrapy spiders running as Docker containers on Cloud Run Jobs. `poll_security.py` hits Dublin Airport's security times API. `poll_departures.py` hits their departure listing API. Both write to Postgres.

**Backend** — Flask on Cloud Run behind Gunicorn. Serves all `/api/*` endpoints. Depends on Redis for rate limiting (token bucket, Lua script) and response caching (30s TTL). If Redis is down, all API requests return 503.

**Frontend** — React 18 + TypeScript + Vite, deployed to Vercel. Uses shadcn/ui, Recharts, Three.js background. PWA-installable.

**Bot protection** — Fingerprint Pro device fingerprint + reCAPTCHA Enterprise → JWT ("bounce token"). All API calls require this JWT. Requests also go through a "Datagram" layer that hashes API routes and signs them with HMAC-SHA512.

## Prediction models

Two engines, user picks via cookie (`forecast_model`):

**Liminal** — Monte Carlo simulations. No ML. Methods A (multi-path random walk), B (projected trend), D (departure-aware sim).

**Trition** — ML. 6 models: T1 and T2, each predicting 60/120/180 minutes ahead. Trained on Modal (A100 GPU), logged to W&B, published to Hugging Face Hub (`xgboost-sm`). Downloaded at Docker build time, not runtime. Features: 24h of lagged 5-min security bands, departure counts in sliding windows, sine/cosine time encoding.

## Data sources

| Source | What | How |
|--------|------|-----|
| `api.dublinairport.com/dap/get-security-times` | T1/T2 queue minutes | Scrapy spider, every few min |
| `api.dublinairport.com/dap/flight-listing/departures` | Departure board | Scrapy spider, 2-day lookahead |
| Google Maps Routes API | Drive times from 150+ origins | Periodic polling |
| Hugging Face Hub | XGBoost model weights | Downloaded at build |

## Running locally

```bash
# frontend
cp .env.example .env.local
pnpm install
pnpm dev

# backend
cd backend
pip install -r requirements.txt
# needs DATABASE_URL, REDIS_URL, BOUNCE_TOKEN_SECRET, DATAGRAM_SIGNING_KEY
python -m flask run
```

## Deploying

```bash
deploy.bat [PROJECT_ID] [REGION]
```

This builds 3 Docker images (security poller, departure poller, backend), pushes to GCR, runs Terraform, and inits the DB schema.

## Environment variables

**Frontend** (`.env.local`):
| Var | What |
|-----|------|
| `VITE_API_BASE_URL` | Backend URL (e.g. `https://datagram.eidwtimes.xyz`) |
| `VITE_GA_TRACKING_ID` | Google Analytics |
| `VITE_POSTHOG_KEY` | PostHog analytics |
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA Enterprise site key |
| `VITE_FINGERPRINT_API_KEY` | Fingerprint Pro |
| `DATAGRAM_SIGNING_KEY` | HMAC key for Datagram routing |

**Backend** (`backend/.env`):
| Var | What |
|-----|------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `HF_TOKEN` | Hugging Face token (model download) |
| `BOUNCE_TOKEN_SECRET` | JWT signing secret |
| `DATAGRAM_SIGNING_KEY` | HMAC key for Datagram verification |
| `RECAPTCHA_SITE_KEY` | reCAPTCHA Enterprise |
| `GCP_PROJECT_ID` | GCP project for reCAPTCHA |
| `PORT` | Gunicorn bind port |

## Database

Schema in `sql/schema.sql`. Run with:
```bash
python setup-db.py <connection_string>
```

All tables use `IF NOT EXISTS` — safe to re-run on every deploy.

## License

See [LICENSE](LICENSE).
