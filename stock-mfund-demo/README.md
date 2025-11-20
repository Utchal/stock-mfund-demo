# Stock & Mutual Fund Analysis — Demo (Zero-cost)

This is a demo scaffold for the Stock & Mutual Fund Analysis app (MVP).  
Built to run **locally** using free data sources (Yahoo Finance via `yfinance`) and free hosting for deployment.

## What’s included
- `backend/` — FastAPI app with a single `/analysis` endpoint using `yfinance` for demo data.
- `frontend/` — Vite + React minimal app to call the backend and display results.
- `README.md` — this file with setup instructions.
- `.gitignore` — ignores venv, node_modules, env files.

## Goals
- Fully functional prototype for demos with **no paid data providers**.
- Suitable for interviews, demos, and POCs.

## Local setup (Linux / macOS / WSL)
### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend expects backend at `http://localhost:8000`. If different, update `frontend/src/config.js`.

## Create Git repo (local)
```bash
cd /path/to/stock-mfund-demo
git init
git add .
git commit -m "Initial demo scaffold: FastAPI backend + Vite React frontend"
```

## Notes & Limitations
- Uses `yfinance` (unofficial) for demo price/history retrieval; OK for POC/demo but not production.
- Mutual fund NAVs should be sourced from AMFI for production use.
- Corporate actions adjustments are minimal in the demo.
- News/SWOT: demo uses simple RSS/headlines; extend for production.

