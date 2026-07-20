#!/usr/bin/env bash
# EDIM 도커 정리 (1.0) — 주간 빌드 캐시 상한 유지 + dangling 이미지 회수.
# 배경: autodeploy 잦은 빌드로 캐시가 68GB 까지 누적(디스크 42% 점유)되어 1회 수동 정리(2026-07-20).
#       재발 방지를 위해 매주 일요일 04:00 상한 10GB 로 유지한다. 실행 컨테이너/볼륨은 건드리지 않는다.
set -u

before=$(df --output=used -BG / | tail -1 | tr -dc '0-9')
docker builder prune -f --keep-storage 10GB >/dev/null 2>&1
docker image prune -f >/dev/null 2>&1
after=$(df --output=used -BG / | tail -1 | tr -dc '0-9')
cache=$(docker system df 2>/dev/null | awk '/^Build Cache/ {print $5}')
logger -t edim-docker-gc "gc done: disk ${before}G -> ${after}G, build cache now ${cache:-?}"
