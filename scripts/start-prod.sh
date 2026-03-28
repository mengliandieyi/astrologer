#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p logs data backups

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ".env created from .env.example (please review values)."
fi

# 前端 Vite 依赖在 web/，仅装根目录会导致 build:web 报找不到 vite
npm ci
npm ci --prefix web

npm run build
npx pm2 start ecosystem.config.cjs --update-env
npx pm2 save

echo "Production app started with PM2."
npx pm2 status astrologer || true
