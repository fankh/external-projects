#!/bin/bash
# EDIM 백업 복구 리허설 (C8) — 최신 pg 덤프를 임시 DB 로 복원 → 스모크 검증 → 정리.
#
# 목적: 백업이 실제로 복원 가능한지 주기 검증(분기 1회 권장). 실 서비스 DB(edim) 무영향(별도 임시 DB).
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

# 4) 정리 (임시 DB 삭제)
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $TMPDB;" >/dev/null

# 5) 판정
if [ "${TABLES:-0}" -ge 50 ] && [ "${TENANTS:-0}" -ge 1 ] && [ "${CODES:-0}" -ge 1 ]; then
  echo "REHEARSAL OK — tables=$TABLES tenants=$TENANTS codes=$CODES"
else
  echo "REHEARSAL FAIL — tables=$TABLES tenants=$TENANTS codes=$CODES (복원 검증 미달)"
  exit 1
fi
