#!/usr/bin/env bash
# run_all.sh — Start backend and frontend for stock-mfund-demo

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/logs"

echo "Project root: $ROOT_DIR"
echo "Backend: $BACKEND_DIR"
echo "Frontend: $FRONTEND_DIR"
echo "Logs: $LOG_DIR"

mkdir -p "$LOG_DIR"

echo "Starting backend..."
if [ -f "$BACKEND_DIR/.venv/bin/activate" ]; then
  # shellcheck source=/dev/null
  source "$BACKEND_DIR/.venv/bin/activate"
else
  echo "Backend venv not found at $BACKEND_DIR/.venv — you can create it via:"
  echo "  python3 -m venv $BACKEND_DIR/.venv && source $BACKEND_DIR/.venv/bin/activate && pip install -r $BACKEND_DIR/requirements.txt"
fi

existing_pid=$(lsof -t -iTCP:8000 -sTCP:LISTEN || true)
if [ -n "$existing_pid" ]; then
  echo "Killing existing process on port 8000 (PID=$existing_pid)"
  kill "$existing_pid" || true
  sleep 1
fi

# Start backend in background; log to file
nohup python -m uvicorn main:app --host 127.0.0.1 --port 8000 > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID $BACKEND_PID — logs -> $LOG_DIR/backend.log"

sleep 1

echo "Starting frontend (Vite)..."
cd "$FRONTEND_DIR"
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "node_modules not present. Run 'npm install' inside $FRONTEND_DIR if needed."
fi

# Start Vite in foreground, teeing logs to file
npm run dev 2>&1 | tee "$LOG_DIR/frontend.log"
