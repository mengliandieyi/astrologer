#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
DB_FILE="$DATA_DIR/app.db"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/app-${TIMESTAMP}.db.gz"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "sqlite db not found: $DB_FILE"
  exit 1
fi

gzip -c "$DB_FILE" > "$OUT_FILE"
echo "backup written: $OUT_FILE"

# cleanup old backups
find "$BACKUP_DIR" -name "app-*.db.gz" -mtime +"$RETENTION_DAYS" -delete
echo "cleanup done: keep last ${RETENTION_DAYS} days"
