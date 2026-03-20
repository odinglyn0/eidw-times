# Maintaining EIDW Times

Guide for project maintainers.

## Deploying

```bash
deploy.bat [PROJECT_ID] [REGION]
```

This builds and pushes 3 Docker images (security poller, departure poller, backend) to GCR, runs Terraform, and inits the DB.

### Frontend

Frontend deploys to Vercel automatically on push to main.

### Backend + Pollers

Backend and pollers run on GCP Cloud Run. The `deploy.bat` script handles building, pushing, and Terraform apply. Models are baked into the backend Docker image at build time via `download_models.py` (requires `HF_TOKEN` in `backend/.env`).

### Database

```bash
python setup-db.py <connection_string>
```

Safe to re-run — all tables and indexes use `IF NOT EXISTS`.

## ML Model Updates

1. Pull fresh training data: `models/pretrain/pullDataRange/puller.py`
2. Train on Modal: `modal run models/train/XGBoost/train.py`
   - Logs to Weights & Biases
   - Publishes to Hugging Face Hub (`unknown-wdie/xgboost-sm`)
3. Rebuild and redeploy the backend Docker image (models download at build time)

## Issue Triage

### Labels
- `bug` — Something isn't working
- `enhancement` — New feature request
- `documentation` — Docs improvements

### Priority
- P0: Critical — security issues, data pipeline down, site unreachable
- P1: High — predictions broken, stale data, API errors
- P2: Medium — UI issues, performance, minor data inaccuracies
- P3: Low — nice to have

## Pull Request Review

### Checklist
- [ ] Frontend builds (`pnpm build`)
- [ ] Backend runs without errors
- [ ] No secrets or credentials committed
- [ ] README updated if env vars or architecture changed
- [ ] Backwards compatible with existing database schema

### Merging
- Squash and merge for most PRs
- Delete branch after merge

## Monitoring

- Redis must be up or all API requests return 503
- Check `X-Cache: HIT/MISS` headers to verify caching
- Security poller and departure poller run as Cloud Run Jobs on a schedule
- XGBoost model cache lives in `backend/.model_cache/` inside the Docker image

## Contacts

- Primary maintainer: Odin Glynn-Martin (odin@odinglynn.com)
