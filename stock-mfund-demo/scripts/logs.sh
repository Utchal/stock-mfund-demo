#!/usr/bin/env bash
# logs.sh — tail backend + frontend logs

set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"

if [ ! -d "$LOG_DIR" ]; then
  echo "No logs directory found at $LOG_DIR"
  exit 0
fi

echo "Tailing backend log (backend.log) and frontend log (frontend.log) if present..."
echo "Press Ctrl+C to stop"
tail -n 200 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
