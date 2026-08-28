#!/bin/bash
# AIG SIEM v3 — 로그 수신 검증 (대상 서버에서 실행)
# 1) 플랫폼 기동 검증  2) 합성 syslog 프로브로 수집 경로 검증
# 3) logsources.csv 의 실제 장비별 최근 수신 여부 판정
set -uo pipefail
API="${API:-http://localhost:23001}"
OS_URL="${OS_URL:-http://localhost:19200}"
CSV="${CSV:-$(dirname "$0")/logsources.csv}"
WINDOW="${WINDOW:-15m}"          # 실제 장비 수신 판정 시간창
IDX="siem-logs-$(date +%Y-%m-%d)"
fail=0
ok(){ echo "  ✓ $*"; }; warn(){ echo "  △ $*"; }; bad(){ echo "  ✗ $*"; fail=$((fail+1)); }

echo "=== [1/4] 서비스 · 포트 ==="
for svc in ss-api ss-console ss-log-stream ss-syslog-receiver nginx; do
    s=$(systemctl is-active "$svc" 2>/dev/null)
    [ "$s" = active ] && ok "$svc" || bad "$svc: $s  → journalctl -u $svc -n 50"
done
for p in 15432 12181 19092 19200 23001 23002 443; do
    ss -tln | grep -q ":$p " && ok "tcp/$p" || bad "tcp/$p NOT listening"
done
ss -uln | grep -q ":514 " && ok "udp/514 (syslog 수신)" || bad "udp/514 NOT listening — 수집 불가"

echo
echo "=== [2/4] 수집 파이프라인 (Kafka → log-stream → OpenSearch) ==="
curl -sf "$OS_URL/_cluster/health" | grep -q '"status":"\(green\|yellow\)"' \
    && ok "OpenSearch cluster health" || bad "OpenSearch 응답 없음/red"
KBIN=$(ls -d /opt/kafka/bin 2>/dev/null | head -1)
if [ -n "$KBIN" ]; then
    topics=$("$KBIN/kafka-topics.sh" --bootstrap-server localhost:19092 --list 2>/dev/null | wc -l)
    [ "$topics" -gt 0 ] && ok "Kafka 토픽 ${topics}개" || bad "Kafka 토픽 없음"
else
    warn "Kafka bin 경로를 못 찾음 — 토픽 확인 생략"
fi

echo
echo "=== [3/4] 합성 Syslog 프로브 (수집 경로 end-to-end) ==="
MARK="AIG-INGEST-PROBE-$$-$(date +%s)"
logger -n 127.0.0.1 -P 514 -d -t aig-probe "$MARK test message from 30-verify-ingest.sh" 2>/dev/null \
    || warn "logger 실패 (util-linux 확인)"
echo -n "  색인 대기"
found=0
for _ in $(seq 1 20); do
    sleep 3; echo -n "."
    c=$(curl -s "$OS_URL/${IDX}/_count" -H 'Content-Type: application/json' \
        -d "{\"query\":{\"query_string\":{\"query\":\"\\\"$MARK\\\"\"}}}" \
        | sed -n 's/.*"count":\([0-9]*\).*/\1/p')
    if [ "${c:-0}" -gt 0 ]; then found=1; break; fi
done
echo
[ "$found" -eq 1 ] && ok "프로브 메시지가 $IDX 에 색인됨 — 수신·파싱·색인 정상" \
                   || bad "프로브 미도달 — ss-syslog-receiver/ss-log-stream 로그 및 Kafka 확인"

echo
echo "=== [4/4] 장비별 실제 수신 (최근 $WINDOW) ==="
printf '  %-26s %-16s %10s  %s\n' "LOG SOURCE" "IP" "EVENTS" "판정"
while IFS=, read -r system_type system_name protocol name ip port vendor device_type parser manager; do
    case "$system_type" in ''|\#*|system_type) continue ;; esac
    if [ "$ip" = "x.x.x.x" ] || [ -z "$ip" ]; then
        printf '  %-26s %-16s %10s  %s\n' "$name" "-" "-" "△ IP 미확정"; continue
    fi
    cnt=$(curl -s "$OS_URL/${IDX}/_count" -H 'Content-Type: application/json' -d "{
      \"query\":{\"bool\":{\"must\":[
        {\"query_string\":{\"query\":\"\\\"$ip\\\"\"}},
        {\"range\":{\"@timestamp\":{\"gte\":\"now-$WINDOW\"}}}]}}}" \
      | sed -n 's/.*"count":\([0-9]*\).*/\1/p')
    cnt=${cnt:-0}
    if [ "$cnt" -gt 0 ]; then
        printf '  %-26s %-16s %10s  %s\n' "$name" "$ip" "$cnt" "✓ 수신"
    else
        printf '  %-26s %-16s %10s  %s\n' "$name" "$ip" "0" "✗ 무수신"
        fail=$((fail+1))
    fi
done < "$CSV"

echo
echo "  인덱스 현황:"
curl -s "$OS_URL/_cat/indices/siem-*?v&h=index,docs.count,store.size" | sed 's/^/    /'
echo
[ "$fail" -eq 0 ] && echo "=== 수신 검증 PASS ===" || echo "=== 수신 검증 FAIL: ${fail}건 ==="
exit "$fail"
