#!/bin/bash
# AIG SIEM v3 — 설치 전 대상 서버 점검 (대상 서버에서 실행)
# INSTALLATION_GUIDE.md v6.10 기준. 아무것도 변경하지 않는다(읽기 전용).
set -u
PKG_DIR="${PKG_DIR:-$(pwd)}"
fail=0
ok()   { echo "  ✓ $*"; }
warn() { echo "  △ $*"; }
bad()  { echo "  ✗ $*"; fail=$((fail+1)); }

echo "=== [1/6] OS ==="
. /etc/os-release 2>/dev/null
case "${ID:-}:${VERSION_ID:-}" in
  rocky:9*|rhel:9*) ok "$PRETTY_NAME" ;;
  *) bad "Rocky/RHEL 9.x 가 아님: ${PRETTY_NAME:-unknown}" ;;
esac

echo "=== [2/6] 자원 ==="
cpu=$(nproc); mem=$(awk '/MemTotal/{printf "%d",$2/1048576}' /proc/meminfo)
[ "$cpu" -ge 8 ]  && ok "CPU ${cpu} core"  || warn "CPU ${cpu} core (8+ 권장)"
[ "$mem" -ge 32 ] && ok "RAM ${mem} GB"    || warn "RAM ${mem} GB (32+ 권장)"

echo "=== [3/6] 디스크 레이아웃 (MANDATORY) ==="
if mountpoint -q /opt/seekurity-siem/data; then
    avail=$(df -BG --output=avail /opt/seekurity-siem/data | tail -1 | tr -dc '0-9')
    [ "$avail" -ge 1000 ] && ok "data 볼륨 별도 마운트, ${avail}GB 가용" \
                          || warn "data 볼륨 ${avail}GB (1TB+ 권장)"
else
    bad "/opt/seekurity-siem/data 가 별도 볼륨이 아님 — root 디스크 가득 참으로 전체 중단 위험"
fi
root_avail=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
[ "$root_avail" -ge 100 ] && ok "root ${root_avail}GB 가용" || warn "root ${root_avail}GB (100GB+ 권장)"

echo "=== [4/6] 사전 설치 소프트웨어 ==="
if java -version 2>&1 | grep -q '1\.8\.'; then ok "Java 8"; else bad "Java 8 없음 (JAR 구동 불가)"; fi
command -v psql    >/dev/null && ok "psql"    || warn "PostgreSQL 없음 — bootstrap-infra.sh 가 설치"
command -v nginx   >/dev/null && ok "nginx"   || warn "Nginx 없음 — bootstrap-infra.sh 가 설치"
command -v snmptrap>/dev/null && ok "snmptrap"|| bad  "net-snmp-utils 없음 — ss-snmp-trap 필수 의존"
fc-list 2>/dev/null | grep -qi "nanum\|noto.*cjk" && ok "한글 폰트" || bad "한글 폰트 없음 — PDF 리포트 깨짐"

echo "=== [5/6] 포트 선점 여부 ==="
for p in 15432 12181 19092 19200 23001 23002 443; do
    if ss -tln 2>/dev/null | grep -q ":$p "; then bad "$p 이미 사용 중"; else ok "$p 비어 있음"; fi
done
ss -uln 2>/dev/null | grep -q ":514 " && bad "UDP 514 이미 사용 중 (rsyslog 등)" || ok "UDP 514 비어 있음"

echo "=== [6/6] 설치 패키지 ==="
for f in install.sh bootstrap-infra.sh nodejs/nodejs.tar.gz console/ss-console-full.tar.gz sql/init-schema.sql; do
    [ -e "$PKG_DIR/$f" ] && ok "$f" || bad "$f 없음 ($PKG_DIR)"
done
jars=$(ls "$PKG_DIR"/bin/*.jar 2>/dev/null | wc -l)
[ "$jars" -ge 7 ] && ok "JAR ${jars}개" || bad "JAR ${jars}개 (7개 필요)"
[ -d "$PKG_DIR/rpms" ] && ok "rpms/ 번들" || warn "rpms/ 없음 — 오프라인이면 bootstrap-infra.sh 실패"
[ -f "$PKG_DIR/license.json" ] && ok "license.json" || bad "license.json 없음 — 라이선스 INVALID 로 차단됨"

echo
if [ "$fail" -eq 0 ]; then echo "=== PREFLIGHT PASS — 10-install.sh 진행 가능 ==="; else
  echo "=== PREFLIGHT FAIL: ${fail}건 — 해소 후 재실행 ==="; fi
exit "$fail"
