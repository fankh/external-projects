#!/bin/bash
# AIG SIEM v3 — 설치 (대상 서버에서 root/sudo 로 실행)
# INSTALLATION_GUIDE.md v6.10 "방법 0: 인프라 부트스트랩" 경로를 따른다.
set -euo pipefail
PKG_DIR="${PKG_DIR:-$(pwd)}"
PGDATA_DIR="${PGDATA_DIR:-/opt/seekurity-siem/data/postgresql/14/data}"

echo "### [1/5] 사전 점검"
bash "$(dirname "$0")/00-preflight.sh" || { echo "preflight 실패 — 중단"; exit 1; }

echo "### [2/5] 인프라 부트스트랩 (PostgreSQL/Nginx/폰트, 오프라인 RPM)"
cd "$PKG_DIR"
sudo ./bootstrap-infra.sh --pgdata "$PGDATA_DIR"

echo "### [3/5] SIEM 설치 (Kafka/ZooKeeper/OpenSearch 는 번들에서 자동 설치)"
sudo ./install.sh

echo "### [4/5] 데이터 저장 위치 검증 (MANDATORY — 전부 data 볼륨이어야 함)"
sudo -u postgres psql -p 15432 -tAc 'SHOW data_directory;' | grep -q '^/opt/seekurity-siem/data/' \
    && echo "  ✓ PostgreSQL data_directory OK" \
    || { echo "  ✗ PostgreSQL 이 root 디스크에 있음 — 가이드 '데이터 디렉토리 이전' 절차 수행 필요"; exit 1; }
for pair in "opensearch:/opt/seekurity-siem/data/opensearch" \
            "kafka:/opt/seekurity-siem/data/kafka" \
            "zookeeper:/opt/seekurity-siem/data/zookeeper"; do
    name=${pair%%:*}; path=${pair#*:}
    [ -d "$path" ] && echo "  ✓ $name → $path" || echo "  ✗ $name 데이터 경로 없음: $path"
done

echo "### [5/5] 서비스 기동 (의존 순서 준수)"
for svc in postgresql zookeeper kafka opensearch \
           ss-api ss-log-stream ss-syslog-receiver ss-snmp-collector \
           ss-database-checker ss-console nginx; do
    sudo systemctl enable --now "$svc" 2>/dev/null || true
    printf '  %-22s %s\n' "$svc" "$(systemctl is-active "$svc" 2>/dev/null)"
done

echo
echo "설치 완료. 다음: 20-configure-logsources.sh → 30-verify-ingest.sh"
