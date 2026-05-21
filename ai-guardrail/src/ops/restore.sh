#!/bin/sh
# KYRA restore script — run from HOST (not container).
#
#   Usage: bash restore.sh /data/backups/postgres/daily/2026-04-15.sql.gz
#
# Stops all app services, restores Postgres from the given dump, then restarts.
# Keeps infra (postgres/redis/milvus/opensearch) up while restoring.

set -eu

BACKUP="${1:?Usage: $0 <path-to-dump.sql.gz>}"
[ -f "$BACKUP" ] || { echo "ERROR: $BACKUP not found"; exit 1; }

echo "[$(date -u +%FT%TZ)] restore start: $BACKUP"
read -p "This will DROP current Postgres data and replace with $BACKUP. Type YES to continue: " confirm
[ "$confirm" = "YES" ] || { echo "aborted"; exit 0; }

cd "$(dirname "$0")/.."

echo "stopping app services..."
docker compose stop $(docker compose ps --services | grep -v -E "^(postgres|redis|milvus|milvus-etcd|milvus-minio|opensearch|nginx|otel-collector)$")

echo "streaming dump into postgres..."
gunzip -c "$BACKUP" | docker exec -i -e PGPASSWORD="$(grep POSTGRES_PASSWORD .env | cut -d= -f2)" \
  kyra-postgres psql -U kyra -d kyra

echo "restarting app services..."
docker compose up -d

echo "[$(date -u +%FT%TZ)] restore complete — verify with: docker compose ps"
