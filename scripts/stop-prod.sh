#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

npx pm2 stop astrologer || true
npx pm2 delete astrologer || true
npx pm2 save || true

echo "Production app stopped."
