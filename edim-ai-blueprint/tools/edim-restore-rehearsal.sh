#!/bin/bash
# EDIM 백업 복구 리허설 (C8) — 최신 pg 덤프를 임시 DB 로 복원 → 스모크 검증 → 정리.
#
# 목적: 백업이 실제로 복원 가능한지 주기 검증. 실 서비스 DB(edim) 무영향(별도 임시 DB).
#       **DB 덤프와 파일(MinIO) 백업을 함께** 본다 — 납품물은 전부 객체 저장소에 있으므로
#       DB 만 확인하고 통과를 알리면 복구가 필요한 날 반쪽만 돌아온다 (18.88).
# 설치: sudo cp edim-ai-blueprint/tools/edim-restore-rehearsal.sh /usr/local/bin/ && sudo chmod +x ...
# 실행: sudo /usr/local/bin/edim-restore-rehearsal.sh   (또는 분기 cron/timer)
set -uo pipefail

DEST=/var/backups/edim
TMPDB=edim_rehearsal
PSQL="docker exec edim-postgres psql -U edim"

LATEST=$(ls -t "$DEST"/pg_edim_*.sql.gz 2>/dev/null | head -1)
[ -z "$LATEST" ] && { echo "REHEARSAL FAIL — 덤프 없음 ($DEST)"; exit 1; }
echo "rehearsal: $(basename "$LATEST")"

# 1) 임시 DB 재생성 (실 DB 무관)
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $TMPDB;" >/dev/null
$PSQL -d postgres -c "CREATE DATABASE $TMPDB;" >/dev/null

# 2) 복원
if ! gunzip -c "$LATEST" | docker exec -i edim-postgres psql -U edim -d "$TMPDB" >/tmp/edim_restore.log 2>&1; then
  echo "REHEARSAL FAIL — 복원 오류 (/tmp/edim_restore.log)"
  $PSQL -d postgres -c "DROP DATABASE IF EXISTS $TMPDB;" >/dev/null
  exit 1
fi

# 3) 스모크 검증 — 핵심 테이블 존재·행수
q() { $PSQL -d "$TMPDB" -tA -c "$1" 2>/dev/null | tr -d '[:space:]'; }
TABLES=$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
TENANTS=$(q "SELECT count(*) FROM sys_tenant;")
CODES=$(q "SELECT count(*) FROM product_code;")
FILES=$(q "SELECT count(*) FROM dwg_file WHERE file_path IS NOT NULL;")

# 3b) **파일 백업까지 검증한다** (18.88).
#
# 종전에는 DB 덤프만 열어 보고 "REHEARSAL OK" 를 찍었다. 그런데 이 제품의 납품물은 전부
# 객체 저장소(MinIO)에 있다 — DB 만 복구하면 파일 행은 살아나지만 **그 행이 가리키는
# 바이트가 없다**. 복구 리허설이 절반만 훑고 통과를 알리면, 정작 복구가 필요한 날 반쪽만
# 돌아온다. 파일 백업이 (1) 같은 날짜로 존재하고 (2) 열리며 (3) DB 가 가리키는 객체를
# 실제로 담고 있는지까지 확인한다.
STAMP=$(basename "$LATEST"); STAMP=${STAMP#pg_edim_}; STAMP=${STAMP%.sql.gz}
MINIO_TAR="$DEST/minio_${STAMP}.tar.gz"
OBJ=0; SAMPLED=0; MISSING=0
if [ -f "$MINIO_TAR" ] && tar -tzf "$MINIO_TAR" >/tmp/edim_minio_list.txt 2>/dev/null; then
  OBJ=$(grep -c 'xl\.meta$' /tmp/edim_minio_list.txt || true)
  # DB 가 가리키는 경로를 표본으로 뽑아 tar 안에 있는지 대조한다 — '있다는데 없는' 상태를
  # 잡는 유일한 방법이다(개수만 세면 서로 다른 것을 세고 통과할 수 있다).
  for KEY in $($PSQL -d "$TMPDB" -tA -c       "SELECT file_path FROM dwg_file WHERE file_path IS NOT NULL ORDER BY random() LIMIT 20;"       2>/dev/null); do
    SAMPLED=$((SAMPLED+1))
    grep -qF "./edim/${KEY}/" /tmp/edim_minio_list.txt || MISSING=$((MISSING+1))
  done
fi

# 4) 정리 (임시 DB 삭제)
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $TMPDB;" >/dev/null
rm -f /tmp/edim_minio_list.txt

# 5) 판정 — DB 와 **파일** 을 함께 본다
DB_OK=0
[ "${TABLES:-0}" -ge 50 ] && [ "${TENANTS:-0}" -ge 1 ] && [ "${CODES:-0}" -ge 1 ] && DB_OK=1
FILE_OK=0
# 표본 20건 중 누락 0 이어야 통과. 표본을 못 뽑았으면(파일 행 자체가 없으면) 파일 검증은
# '해당 없음' 으로 통과시키되, 그 사실을 출력에 남긴다 — 조용히 통과시키지 않는다.
if [ "$OBJ" -ge 1 ] && [ "$MISSING" -eq 0 ]; then FILE_OK=1; fi
if [ "${FILES:-0}" -eq 0 ]; then FILE_OK=1; fi

SUMMARY="tables=$TABLES tenants=$TENANTS codes=$CODES dbFiles=$FILES minioObjects=$OBJ sampled=$SAMPLED missing=$MISSING"
if [ "$DB_OK" -eq 1 ] && [ "$FILE_OK" -eq 1 ]; then
  echo "REHEARSAL OK — $SUMMARY"
else
  echo "REHEARSAL FAIL — $SUMMARY (DB_OK=$DB_OK FILE_OK=$FILE_OK)"
  exit 1
fi
