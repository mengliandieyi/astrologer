#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
MAX_FAILS="${MAX_FAILS:-3}"
STATE_FILE="$ROOT_DIR/data/health.state"
LOG_FILE="$ROOT_DIR/logs/healthcheck.log"

mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/logs"

fails=0
if [ -f "$STATE_FILE" ]; then
  fails="$(cat "$STATE_FILE" || echo 0)"
fi

if curl -fsS "$URL" >/dev/null; then
  echo 0 > "$STATE_FILE"
  echo "$(date '+%F %T') health ok" >> "$LOG_FILE"
  exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE_FILE"
echo "$(date '+%F %T') health fail count=$fails" >> "$LOG_FILE"

if [ "$fails" -ge "$MAX_FAILS" ]; then
  echo "$(date '+%F %T') restarting pm2 app astrologer" >> "$LOG_FILE"
  npx pm2 restart astrologer || true
  echo 0 > "$STATE_FILE"
fi
