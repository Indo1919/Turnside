#!/bin/bash
set -e
cd "$(dirname "$0")"

TURNSIDE_NODE="$(command -v node || true)"
if [ -z "$TURNSIDE_NODE" ]; then
  TURNSIDE_NODE="/Users/matias/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [ ! -x "$TURNSIDE_NODE" ]; then
  echo "Install Node.js 22.12+ or 24+, then run npm install and npm run build in this folder."
  read -r -p "Press Return to close. "
  exit 1
fi
if [ ! -f node_modules/tsx/dist/cli.mjs ] || [ ! -f dist/index.html ]; then
  echo "First run npm install and npm run build in this folder."
  read -r -p "Press Return to close. "
  exit 1
fi
export PATH="$(dirname "$TURNSIDE_NODE"):$PATH"
export NODE_ENV=production
export PORT="${PORT:-4173}"
export HOST=127.0.0.1
echo "Turnside is starting. Open http://localhost:$PORT"
echo "Keep this window open. Press Control-C to stop the app."
exec "$TURNSIDE_NODE" node_modules/tsx/dist/cli.mjs server.ts
