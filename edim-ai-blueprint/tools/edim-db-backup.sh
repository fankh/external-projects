#!/usr/bin/env bash
# EDIM 백업 (0.4 신설 → 0.5 확장) — 매일 pg_dump 커스텀 포맷(-Fc) + MinIO 볼륨 tar + 7일 보존 회전.
# 배경: 운영 점검(2026-07-20)에서 백업 자동화 부재 발견 — 디스크 장애/오조작 시 전 데이터 유실 위험.
# 설치: /etc/cron.d/edim-db-backup (매일 03:30, root).
# 복원: DB = pg_restore -U edim -d edim <dump> · MinIO = tar -xzf <tar> -C <volume>/_data
set -u

DIR=/home/seekers/backups
MINIO_SRC=/var/lib/docker/volumes/infra_minio_data/_data
mkdir -p "$DIR"
ts=$(date +%Y%m%d_%H%M%S)

# 1) PostgreSQL — 덤프 후 pg_restore --list 로 무결성 검증까지 통과해야 ok (0.5)
if docker exec edim-postgres pg_dump -U edim -d edim -Fc -f /tmp/edim_backup.dump \
   && docker exec edim-postgres pg_restore --list /tmp/edim_backup.dump >/dev/null; then
  docker cp edim-postgres:/tmp/edim_backup.dump "$DIR/edim_${ts}.dump"
  docker exec edim-postgres rm /tmp/edim_backup.dump
  logger -t edim-db-backup "db ok: edim_${ts}.dump ($(stat -c%s "$DIR/edim_${ts}.dump") bytes)"
else
  logger -t edim-db-backup "db backup FAILED"
  exit 1
fi

# 2) MinIO — 도면·산출물 파일 (11MB 수준, 0.5)
if tar -czf "$DIR/minio_${ts}.tar.gz" -C "$MINIO_SRC" . 2>/dev/null; then
  logger -t edim-db-backup "minio ok: minio_${ts}.tar.gz ($(stat -c%s "$DIR/minio_${ts}.tar.gz") bytes)"
else
  logger -t edim-db-backup "minio backup FAILED"
fi

# 3) 7일 보존 회전
find "$DIR" \( -name 'edim_*.dump' -o -name 'minio_*.tar.gz' \) -mtime +7 -delete
