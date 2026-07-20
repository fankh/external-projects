#!/usr/bin/env bash
# EDIM DB 백업 (0.4) — 매일 pg_dump 커스텀 포맷(-Fc) + 7일 보존 회전.
# 배경: 운영 점검(2026-07-20)에서 백업 자동화 부재 발견 — 디스크 장애/오조작 시 전 데이터 유실 위험.
# 설치: /etc/cron.d/edim-db-backup (매일 03:30, root). 복원: pg_restore -U edim -d edim <dump>
set -u

DIR=/home/seekers/backups
mkdir -p "$DIR"
ts=$(date +%Y%m%d_%H%M%S)

if docker exec edim-postgres pg_dump -U edim -d edim -Fc -f /tmp/edim_backup.dump; then
  docker cp edim-postgres:/tmp/edim_backup.dump "$DIR/edim_${ts}.dump"
  docker exec edim-postgres rm /tmp/edim_backup.dump
  find "$DIR" -name 'edim_*.dump' -mtime +7 -delete
  logger -t edim-db-backup "backup ok: edim_${ts}.dump ($(stat -c%s "$DIR/edim_${ts}.dump") bytes)"
else
  logger -t edim-db-backup "backup FAILED"
  exit 1
fi
