#!/bin/bash
# EDIM 일일 백업 (P3-3) — PostgreSQL dump + MinIO 데이터, 보존 7일
#
# 18.89 — **이것이 실제로 도는 백업이다.** systemd `edim-backup.timer`(매일 03:20)가
# 부르며 `/var/backups/edim` 에 `pg_edim_YYYYMMDD.sql.gz` + `minio_YYYYMMDD.tar.gz` 를 남긴다.
# 종전에는 이 스크립트가 저장소에 없어 **서버에만 존재**했다 — 서버를 다시 세우면 사라지고,
# 저장소만 읽으면 백업이 다른 경로·다른 형식으로 도는 줄 알게 된다(tools/edim-db-backup.sh 는
# cron 03:30 으로 도는 **두 번째** 파이프라인이다. 둘 다 살아 있고 대상 데이터가 같다).
# 복구 리허설(edim-restore-rehearsal.sh)이 검증하는 것은 **이쪽** 산출물이다.
set -e
DEST=/var/backups/edim
DATE=$(date +%Y%m%d)

# 1. PostgreSQL
docker exec edim-postgres pg_dump -U edim edim | gzip > "$DEST/pg_edim_$DATE.sql.gz"

# 2. MinIO (버킷 데이터)
rm -rf "$DEST/minio_tmp"
docker cp minio:/data "$DEST/minio_tmp" >/dev/null
tar czf "$DEST/minio_$DATE.tar.gz" -C "$DEST/minio_tmp" .
rm -rf "$DEST/minio_tmp"

# 3. 보존 7일
find "$DEST" -name '*.gz' -mtime +7 -delete

# 4. 헬스 확인 (실패 시 journal 에 경고)
if ! curl -sf http://127.0.0.1:8000/api/v1/health | grep -q '"db":true'; then
  echo "WARN: backend health check failed" >&2
fi
echo "backup done: $(ls -sh $DEST/pg_edim_$DATE.sql.gz $DEST/minio_$DATE.tar.gz | tr '\n' ' ')"
