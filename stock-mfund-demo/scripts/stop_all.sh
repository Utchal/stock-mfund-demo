#!/usr/bin/env bash
# stop_all.sh — stop backend and frontend dev servers (best-effort)

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"

echo "Stopping backend (port 8000) if running..."
backend_pid=$(lsof -t -iTCP:8000 -sTCP:LISTEN || true)
if [ -n "$backend_pid" ]; then
  echo "Killing backend PID(s): $backend_pid"
  echo "$backend_pid" | xargs -r kill
  sleep 1
else
  echo "No backend process found on port 8000"
fi

echo "Frontend (Vite) usually runs in foreground; if it's running in background, find and kill using:"
echo "  lsof -iTCP:5173 -sTCP:LISTEN || true"
echo
echo "Logs are in: $LOG_DIR (if created)"
