#!/bin/sh
# KYRA backup script — runs inside the backup container.
# Dumps Postgres, mirrors MinIO bucket, and rotates old files.
#
# Layout under /backups (bind-mounted to /data/backups on host):
#   postgres/daily/YYYY-MM-DD.sql.gz
#   postgres/weekly/YYYY-WW.sql.gz   (Sunday only)
#   postgres/monthly/YYYY-MM.sql.gz  (1st of month only)
#   minio/YYYY-MM-DD/                 (mirror of kyra-documents)

set -eu

BACKUP_ROOT=/backups
PG_HOST=${PG_HOST:-postgres}
PG_USER=${PG_USER:-kyra}
PG_DB=${PG_DB:-kyra}
: "${PGPASSWORD?PGPASSWORD must be set}"

DATE=$(date -u +%Y-%m-%d)
WEEK=$(date -u +%Y-%V)
MONTH=$(date -u +%Y-%m)
DOW=$(date -u +%u)   # 1=Mon..7=Sun
DOM=$(date -u +%d)

mkdir -p "$BACKUP_ROOT/postgres/daily" "$BACKUP_ROOT/postgres/weekly" "$BACKUP_ROOT/postgres/monthly" "$BACKUP_ROOT/minio"

TARGET="$BACKUP_ROOT/postgres/daily/${DATE}.sql.gz"
echo "[$(date -u +%FT%TZ)] backup start — postgres → $TARGET"
PGPASSWORD="$PGPASSWORD" pg_dump --no-owner --clean --if-exists -h "$PG_HOST" -U "$PG_USER" "$PG_DB" \
  | gzip -9 > "$TARGET"
SIZE=$(stat -c%s "$TARGET")
echo "[$(date -u +%FT%TZ)] pg_dump done — $(numfmt --to=iec $SIZE)"

# Promote daily → weekly (Sunday)
[ "$DOW" = "7" ] && cp "$TARGET" "$BACKUP_ROOT/postgres/weekly/${WEEK}.sql.gz"
# Promote daily → monthly (1st)
[ "$DOM" = "01" ] && cp "$TARGET" "$BACKUP_ROOT/postgres/monthly/${MONTH}.sql.gz"

# MinIO snapshot (optional — skip on error)
if command -v mc >/dev/null 2>&1 && [ -n "${MINIO_ENDPOINT:-}" ]; then
  mc alias set src "$MINIO_ENDPOINT" "${MINIO_ACCESS_KEY:-minioadmin}" "${MINIO_SECRET_KEY:-minioadmin}" >/dev/null 2>&1 || true
  MINIO_TARGET="$BACKUP_ROOT/minio/$DATE"
  mkdir -p "$MINIO_TARGET"
  mc mirror --overwrite src/kyra-documents "$MINIO_TARGET" 2>/dev/null || echo "minio mirror skipped"
fi


# Off-site push to S3 (optional).
# Set AWS_BACKUP_BUCKET + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY in env to enable.
if [ -n "${AWS_BACKUP_BUCKET:-}" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    apk add --no-cache aws-cli >/dev/null 2>&1 || pip install awscli >/dev/null 2>&1 || true
  fi
  if command -v aws >/dev/null 2>&1; then
    echo "[2026-04-15T05:09:30Z] off-site upload: s3://${AWS_BACKUP_BUCKET}/"
    aws s3 cp "" "s3://${AWS_BACKUP_BUCKET}/postgres/daily/${DATE}.sql.gz"       --only-show-errors || echo "s3 upload failed (non-fatal)"
  else
    echo "aws cli unavailable — skipping off-site"
  fi
fi

# Retention: keep 7 daily, 4 weekly, 3 monthly
find "$BACKUP_ROOT/postgres/daily" -type f -name "*.sql.gz" -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_ROOT/postgres/weekly" -type f -name "*.sql.gz" -mtime +28 -delete 2>/dev/null || true
find "$BACKUP_ROOT/postgres/monthly" -type f -name "*.sql.gz" -mtime +93 -delete 2>/dev/null || true
find "$BACKUP_ROOT/minio" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true

echo "[$(date -u +%FT%TZ)] backup complete"
ls -la "$BACKUP_ROOT/postgres/daily/" | tail -5
