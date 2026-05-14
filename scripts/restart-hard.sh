#!/usr/bin/env bash
# 生产/自建机：重新构建并强制重启 PM2 应用（与 DEPLOY.md 中 astrologer 进程名一致）
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> npm run build"
npm run build

if command -v pm2 >/dev/null 2>&1; then
  echo "==> pm2 restart astrologer --update-env"
  pm2 restart astrologer --update-env
elif command -v npx >/dev/null 2>&1; then
  echo "==> npx pm2 restart astrologer --update-env"
  npx pm2 restart astrologer --update-env
else
  echo "ERROR: 未找到 pm2 或 npx，请先安装: npm i -g pm2 或见 DEPLOY.md" >&2
  exit 1
fi

echo "==> pm2 status (head)"
(pm2 status 2>/dev/null || npx pm2 status) | head -20 || true
echo "Done."
