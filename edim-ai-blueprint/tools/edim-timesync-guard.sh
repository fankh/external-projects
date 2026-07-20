#!/usr/bin/env bash
# EDIM 서버 시계 가드 (v34.73) — NTP 미동기 환경(UDP 123 차단 추정) 드리프트 재발 방지.
# 매시 실행: NTP 동기화면 무동작. 미동기이고 HTTPS Date 기준 |오차|>20s 면 1회 보정 + 로그.
# 배경: 2026-07-20 서버 시계 -99s 로 MFA(TOTP) 실사용 실패 소지 발견 (진행현황 v34.72).
set -u

if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = "yes" ]; then
  exit 0
fi

http_date=$(curl -sI --max-time 10 https://www.google.com | grep -i '^date:' | sed 's/^[Dd]ate: //' | tr -d '\r')
[ -z "$http_date" ] && { logger -t edim-timesync "reference fetch failed"; exit 0; }

ref_ts=$(date -d "$http_date" +%s)
now_ts=$(date +%s)
skew=$((now_ts - ref_ts))
abs=${skew#-}

if [ "$abs" -gt 20 ]; then
  date -s "@$ref_ts" >/dev/null
  logger -t edim-timesync "clock corrected: skew was ${skew}s (HTTPS Date reference)"
fi
