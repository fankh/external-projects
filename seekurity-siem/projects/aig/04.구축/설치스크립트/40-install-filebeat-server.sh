#!/usr/bin/env bash
# AIG SIEM — 원격 서버에 Filebeat 를 설치하고 SIEM(10.1.30.4:5044)으로 전송하도록 구성합니다.
#
#   사용법:  sudo ./40-install-filebeat-server.sh <이 서버의 IP>
#   예시:    sudo ./40-install-filebeat-server.sh 10.1.30.2
#
# 같은 디렉터리에 filebeat-server-template.yml 이 있어야 합니다.
# 폐쇄망이라 yum 저장소를 못 쓰는 경우 RPM 을 미리 받아 같은 디렉터리에 두면 그것을 씁니다.
set -euo pipefail

SIEM_HOST="10.1.30.4"
SIEM_PORT="5044"
FB_VERSION="8.14.3"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="${HERE}/filebeat-server-template.yml"

SERVER_IP="${1:-}"
if [[ -z "${SERVER_IP}" ]]; then
    echo "오류: 이 서버의 IP 를 인자로 주십시오. 예) $0 10.1.30.2" >&2
    exit 1
fi
if [[ ! -f "${TEMPLATE}" ]]; then
    echo "오류: 템플릿을 찾을 수 없습니다 — ${TEMPLATE}" >&2
    exit 1
fi

echo "=== 1. SIEM 수신 포트 연결 확인 (${SIEM_HOST}:${SIEM_PORT}) ==="
if command -v nc >/dev/null 2>&1; then
    nc -z -w5 "${SIEM_HOST}" "${SIEM_PORT}" \
        && echo "  연결 가능" \
        || { echo "  연결 실패 — 방화벽 또는 SIEM Filebeat 상태를 먼저 확인하십시오." >&2; exit 1; }
else
    timeout 5 bash -c "cat < /dev/null > /dev/tcp/${SIEM_HOST}/${SIEM_PORT}" 2>/dev/null \
        && echo "  연결 가능" \
        || { echo "  연결 실패 — 방화벽 또는 SIEM Filebeat 상태를 먼저 확인하십시오." >&2; exit 1; }
fi

echo "=== 2. Filebeat 설치 ==="
if command -v filebeat >/dev/null 2>&1; then
    echo "  이미 설치됨: $(filebeat version | head -1)"
else
    RPM_LOCAL="${HERE}/filebeat-${FB_VERSION}-x86_64.rpm"
    if [[ -f "${RPM_LOCAL}" ]]; then
        echo "  로컬 RPM 으로 설치합니다."
        rpm -Uvh "${RPM_LOCAL}"
    else
        echo "  Elastic 저장소를 등록하고 설치합니다."
        rpm --import https://artifacts.elastic.co/GPG-KEY-elasticsearch
        cat > /etc/yum.repos.d/elastic-8.x.repo <<'REPO'
[elastic-8.x]
name=Elastic repository for 8.x packages
baseurl=https://artifacts.elastic.co/packages/8.x/yum
gpgcheck=1
gpgkey=https://artifacts.elastic.co/GPG-KEY-elasticsearch
enabled=1
autorefresh=1
type=rpm-md
REPO
        yum install -y "filebeat-${FB_VERSION}"
    fi
fi

echo "=== 3. 설정 배치 (deviceIp=${SERVER_IP}) ==="
if [[ -f /etc/filebeat/filebeat.yml ]]; then
    BAK="/etc/filebeat/filebeat.yml.bak-aig-$(date +%Y%m%d-%H%M%S)"
    cp -a /etc/filebeat/filebeat.yml "${BAK}"
    echo "  기존 설정 백업: ${BAK}"
fi
sed "s|__SERVER_IP__|${SERVER_IP}|g" "${TEMPLATE}" > /tmp/aig-filebeat.yml
install -o root -g root -m 0600 /tmp/aig-filebeat.yml /etc/filebeat/filebeat.yml
rm -f /tmp/aig-filebeat.yml
mkdir -p /var/lib/filebeat/diskqueue /var/log/filebeat

echo "=== 4. 존재하지 않는 로그 경로 확인 ==="
# 템플릿에는 3개 서버 역할의 경로가 모두 들어 있습니다. 없는 경로는 무해하지만 알려 둡니다.
grep -oE '^\s+- (/[^*]*)' /etc/filebeat/filebeat.yml | awk '{print $2}' | while read -r p; do
    d="$(dirname "${p}")"
    [[ -d "${d}" ]] || echo "  없음(무시됨): ${d}"
done

echo "=== 5. 설정 검증 ==="
filebeat test config -c /etc/filebeat/filebeat.yml
filebeat test output -c /etc/filebeat/filebeat.yml || \
    echo "  경고: output 검사 실패 — SIEM 측 lumberjack 입력 상태를 확인하십시오."

echo "=== 6. 서비스 기동 ==="
systemctl enable filebeat
systemctl restart filebeat
sleep 5
systemctl is-active filebeat

echo
echo "완료했습니다. SIEM 에서 다음으로 수집을 확인하십시오."
echo "  curl -s 'http://localhost:19200/siem-logs-*/_search' -H 'Content-Type: application/json' \\"
echo "    -d '{\"size\":0,\"query\":{\"term\":{\"deviceIp\":\"${SERVER_IP}\"}}}'"
