#!/bin/zsh

set -euo pipefail

APP_DIR="${0:A:h}"
cd "$APP_DIR"

if [ ! -d "node_modules" ]; then
  npm install
fi

npm run build

PYTHON="/Users/mvpstuido/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
if [ ! -x "$PYTHON" ]; then
  PYTHON="$(command -v python3)"
fi

"$PYTHON" main.py &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
sleep 1
open "http://127.0.0.1:8000/"
wait "$SERVER_PID"
