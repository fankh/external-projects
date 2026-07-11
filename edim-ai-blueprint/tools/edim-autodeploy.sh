#!/bin/bash
# EDIM auto-deploy (C7) — health-gated · rollback-safe · robust rebuild.
#
# 설치: sudo cp edim-ai-blueprint/tools/edim-autodeploy.sh /usr/local/bin/ && sudo chmod +x /usr/local/bin/edim-autodeploy.sh
# 실행: systemd edim-autodeploy.timer (2분 폴링) 또는 수동.
#
# 개선점 (구버전 대비):
#  1) health-gate — 새 백엔드 /health OK 확인 후에만 "deploy done" (구: up -d 직후 완료 처리)
#  2) 실패 시 자동 롤백 — 이전 커밋으로 reset + 재빌드 (헬스 타임아웃)
#  3) robust recreate — --force-recreate --remove-orphans (stale 컨테이너 이름 충돌 방지)
#  4) build-before-swap — 이미지 빌드·정적 rsync 를 먼저(다운타임 아님), 백엔드 교체는 마지막
set -uo pipefail

REPO=/home/seekers/apps/external-projects
APP="$REPO/edim-ai-blueprint"
HEALTH="http://127.0.0.1:8000/api/v1/health"

cd "$REPO"
git fetch origin master --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)
[ "$LOCAL" = "$REMOTE" ] && exit 0
echo "deploy: ${LOCAL:0:7} -> ${REMOTE:0:7}"

# 순수 배포 타깃 — 로컬 변경 폐기하고 origin 과 정확히 일치 (dirty-tree pull 실패 방지)
git reset --hard origin/master --quiet
cd "$APP"

# 1) 백엔드 이미지 빌드 (다운타임 아님 — 기존 컨테이너 계속 서비스)
if ! docker compose build backend; then
  echo "DEPLOY FAILED — build error; reset ${LOCAL:0:7}"
  git -C "$REPO" reset --hard "$LOCAL" --quiet
  exit 1
fi

# 2) 정적 자산 먼저 배포 (백엔드 무관, 즉시 반영)
rsync -a --delete edim-web/dist/ /var/www/edim/edim-static/
rsync -a --delete docs/ /var/www/edim/docs/files/
cp docs/portal.html /var/www/edim/docs/index.html
chown -R www-data:www-data /var/www/edim/edim-static /var/www/edim/docs

# 3) 백엔드 교체 — 빠른 recreate + stale 컨테이너 정리
docker compose up -d --force-recreate --remove-orphans backend

# 4) health-gate — /health OK 까지 대기 (최대 90s)
ok=0
for i in $(seq 1 30); do
  if curl -sf "$HEALTH" 2>/dev/null | grep -q '"db":true'; then ok=1; break; fi
  sleep 3
done

if [ "$ok" != "1" ]; then
  echo "DEPLOY FAILED — health timeout at ${REMOTE:0:7}; rollback -> ${LOCAL:0:7}"
  git -C "$REPO" reset --hard "$LOCAL" --quiet
  docker compose up -d --build --force-recreate backend
  exit 1
fi

echo "deploy done: ${REMOTE:0:7} (healthy)"
