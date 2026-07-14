#!/bin/bash
# EDIM auto-deploy (C7) — health-gated · rollback-safe · robust rebuild.
#
# 메인 프론트엔드 = Next.js SSR (edim-web-next, 컨테이너 127.0.0.1:3000).
#   호스트 nginx: / → 3000 리버스 프록시 (deploy/nginx.edim.conf).
#   레거시 Vite React SPA(edim-web-react/dist) 는 롤백 자산으로만 /var/www/edim/edim-static 에 유지.
#
# 설치: sudo cp edim-ai-blueprint/tools/edim-autodeploy.sh /usr/local/bin/ && sudo chmod +x /usr/local/bin/edim-autodeploy.sh
# 실행: systemd edim-autodeploy.timer (2분 폴링) 또는 수동.
#
# 개선점:
#  1) health-gate — 백엔드 /health + Next 3000 200 확인 후에만 "deploy done"
#  2) 실패 시 자동 롤백 — 이전 커밋으로 reset + 재빌드
#  3) robust recreate — --force-recreate --remove-orphans (stale 컨테이너 이름 충돌 방지)
#  4) build-before-swap — 이미지 빌드를 먼저(다운타임 아님), 컨테이너 교체는 마지막
set -uo pipefail

REPO=/home/seekers/apps/external-projects
APP="$REPO/edim-ai-blueprint"
HEALTH="http://127.0.0.1:8000/api/v1/health"
WEB="http://127.0.0.1:3000/login"

cd "$REPO"
git fetch origin master --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "deploy: ${LOCAL:0:7} -> ${REMOTE:0:7}"

# 순수 배포 타깃 — 로컬 변경 폐기하고 origin 과 정확히 일치 (dirty-tree pull 실패 방지)
git reset --hard origin/master --quiet
cd "$APP"

# 1) 이미지 빌드 (다운타임 아님 — 기존 컨테이너 계속 서비스). backend + 메인 프론트(web-next)
if ! docker compose build backend web-next; then
  echo "DEPLOY FAILED — build error; reset ${LOCAL:0:7}"
  git -C "$REPO" reset --hard "$LOCAL" --quiet
  exit 1
fi

# 2) 롤백 자산 + 문서 (Next 장애 시 nginx root 를 정적으로 되돌리기 위한 백업 서빙본)
rsync -a --delete edim-web-react/dist/ /var/www/edim/edim-static/
rsync -a --delete docs/ /var/www/edim/docs/files/
cp docs/portal.html /var/www/edim/docs/index.html
chown -R www-data:www-data /var/www/edim/edim-static /var/www/edim/docs

# 3) 컨테이너 교체 — 백엔드 + 메인 프론트(Next SSR)
docker compose up -d --force-recreate --remove-orphans backend web-next

# 4) health-gate — 백엔드 /health + Next 3000 응답까지 대기 (최대 90s)
ok=0
for i in $(seq 1 30); do
  if curl -sf "$HEALTH" 2>/dev/null | grep -q '"db":true' \
     && curl -sf -o /dev/null "$WEB" 2>/dev/null; then ok=1; break; fi
  sleep 3
done

if [ "$ok" != "1" ]; then
  echo "DEPLOY FAILED — health timeout at ${REMOTE:0:7}; rollback -> ${LOCAL:0:7}"
  git -C "$REPO" reset --hard "$LOCAL" --quiet
  docker compose up -d --build --force-recreate backend web-next
  exit 1
fi

echo "deploy done: ${REMOTE:0:7} (backend + Next SSR healthy)"
