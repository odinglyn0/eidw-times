# Contributing to EIDW Times

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/eidw-times.git
   cd eidw-times
   ```

## Development Setup

### Requirements
- Node.js 18+ and pnpm
- Python 3.11+
- PostgreSQL
- Redis

### Frontend
```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
# Set DATABASE_URL, REDIS_URL, BOUNCE_TOKEN_SECRET, DATAGRAM_SIGNING_KEY
python -m flask run
```

## How to Contribute

### Reporting Bugs

Open an issue with:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Browser/OS if frontend, Python version if backend

### Suggesting Features

Open an issue, or use the feature request form on [eidwtimes.xyz](https://eidwtimes.xyz).

### Pull Requests

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Test locally (frontend: `pnpm build`, backend: run the Flask app)
4. Commit with clear messages
5. Push and open a PR

### Commit Messages

- `fix: resolve recommendation logic when T2 security is closed`
- `feat: add weekly trend comparison view`
- `docs: update env var table in README`
- `refactor: simplify Monte Carlo simulation paths`

## Project Structure

```
eidw-times/
├── src/                  # React frontend (TypeScript)
├── backend/              # Flask API (Python)
├── pysrc/                # Scrapy data pollers (Docker containers)
├── models/               # ML training, inference, data pulling
│   ├── train/XGBoost/    # Modal training script
│   ├── inference/XGBoost-SM/  # Inference + model cache
│   └── pretrain/         # Training data extraction
├── sql/                  # Database schema
└── deploy.bat            # Build + deploy script
```

## Code of Conduct

Be respectful and constructive.

## Questions?

Open an issue or email odin@odinglynn.com.

## License

By contributing, you agree that your contributions will be licensed under the project's existing license.
