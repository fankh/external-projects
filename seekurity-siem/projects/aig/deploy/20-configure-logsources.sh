#!/bin/bash
# AIG SIEM v3 — Log Source 등록 (대상 서버에서 실행)
# logsources.csv 를 읽어 ss-api 의 v5 엔드포인트 /log/source 로 등록한다.
# 기본은 DRY-RUN: 전송할 payload 만 출력한다. 실제 등록은 --apply.
set -uo pipefail
API="${API:-http://localhost:23001}"
CSV="${CSV:-$(dirname "$0")/logsources.csv}"
ADMIN_ID="${ADMIN_ID:-admin}"
ADMIN_PW="${ADMIN_PW:-}"
APPLY=0; [ "${1:-}" = "--apply" ] && APPLY=1

[ -f "$CSV" ] || { echo "CSV 없음: $CSV"; exit 1; }

if [ -z "$ADMIN_PW" ]; then
    read -rsp "admin 비밀번호: " ADMIN_PW; echo
fi

echo "### 로그인 ($API)"
TOKEN=$(curl -s "$API/auth/login" -X POST -H 'Content-Type: application/json' \
        -d "{\"loginId\":\"$ADMIN_ID\",\"password\":\"$ADMIN_PW\",\"ipAddress\":\"127.0.0.1\"}" \
        | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "로그인 실패 — loginId 는 이메일이 아닌 로그인 ID (SSS-88)"; exit 1; }
echo "  ✓ 토큰 획득"

echo "### 기존 등록 현황 (필드명 확인용 — payload 를 이 응답 구조에 맞출 것)"
curl -s "$API/log/source" -H "Authorization: Bearer $TOKEN" | head -c 800; echo

registered=0; skipped=0
while IFS=, read -r system_type system_name protocol name ip port vendor device_type parser manager; do
    case "$system_type" in ''|\#*|system_type) continue ;; esac
    if [ "$ip" = "x.x.x.x" ] || [ -z "$ip" ]; then
        echo "  △ SKIP $name — IP 미확정 (CSV 를 실제 값으로 채울 것)"
        skipped=$((skipped+1)); continue
    fi
    payload=$(cat <<EOF
{"name":"$name","ipAddress":"$ip","port":${port:-514},"protocol":"$protocol",
 "systemType":"$system_type","systemName":"$system_name",
 "vendor":"$vendor","deviceType":"$device_type","deviceTypeSource":"template",
 "description":"AIG $system_name","manager":"$manager"}
EOF
)
    if [ "$APPLY" -eq 1 ]; then
        res=$(curl -s "$API/log/source" -X POST -H "Authorization: Bearer $TOKEN" \
              -H 'Content-Type: application/json' -d "$payload")
        if echo "$res" | grep -q '"code":200'; then
            echo "  ✓ $name ($ip)"; registered=$((registered+1))
        else
            echo "  ✗ $name — $res"
        fi
    else
        echo "  [DRY-RUN] $name ($ip:$port/$protocol)"
        echo "$payload" | tr -d '\n' | sed 's/  */ /g'; echo
    fi
done < "$CSV"

echo
if [ "$APPLY" -eq 1 ]; then
    echo "### 방화벽 (수집 포트 개방)"
    sudo firewall-cmd --permanent --add-service=https >/dev/null
    sudo firewall-cmd --permanent --add-port=514/udp  >/dev/null
    sudo firewall-cmd --permanent --add-port=162/udp  >/dev/null
    sudo firewall-cmd --reload >/dev/null && echo "  ✓ 443/tcp, 514/udp, 162/udp 개방"
    echo "### DB 확인"
    sudo -u postgres psql -p 15432 -d siem -tAc 'SELECT COUNT(*) FROM log_sources;' \
        | xargs -I{} echo "  log_sources 행 수: {}"
    echo "등록 $registered건, 건너뜀 $skipped건"
else
    echo "DRY-RUN 종료 (등록 대상 $((registered+0))건 중 $skipped건은 IP 미확정). 실제 등록: $0 --apply"
fi
