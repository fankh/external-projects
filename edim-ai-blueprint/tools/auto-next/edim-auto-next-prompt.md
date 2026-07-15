EDIM 백로그 자동 계속 ("do next") — 무인 실행 회차.

절차 (반드시 순서대로):
1. `git status --porcelain` 확인 — **미커밋 변경이 있으면** 사용자/다른 회차가 작업 중이므로 "skip — 워크트리 사용 중" 한 줄만 출력하고 종료하라. 깨끗하면 `git pull` 로 최신화. (동시 실행은 러너의 lock 파일이 별도로 차단한다.)
2. `docs/EDIM_미구현기능목록.md` 를 읽고 **다음 미체크 배치**(B1~B15 순서, 🔶 표시는 잔여 항목부터)를 선택한다.
3. 그 배치를 **통째로** 구현한다:
   - 백엔드: `backend/app/routers/edim.py` + `backend/app/services/` (기존 패턴 준수 — require_auth/min_level, `_conn()` 은 autocommit, 정직한 4xx detail)
   - 프론트: **`edim-web-next/` (메인 웹 콘솔 — 2026-07-15 컷오버)** — `npm run build` 통과 필수. 화면 레시피=MIGRATION_NEXTJS.md(page.tsx SSR fetch + 'use client' 아일랜드 + 서버액션 뮤테이션). mock 스타일 가짜 성공 금지: 쓰기 실패는 정직한 오류 상태 표시. (`edim-web-react/`는 롤백 자산 — 신규 기능 작업 금지.)
   - 회귀: `cd edim-web-next && npm run build` + 스모크 `BASE=https://edim.seekerslab.com EDIM_USER=edim EDIM_PASS=edim npm run smoke` → **13/13 유지**(배포 후 실행). 신규 화면·핵심 변경은 smoke.mjs 에 마커 추가.
   - 커밋: `v<다음버전>: <type>(<scope>): <설명>` — AI 표기·Co-Authored-By 절대 금지. master push (auto-deploy 가 2분 내 배포 — backend+web-next 빌드·기동, Next 3000 health-gate).
   - 배포 확인: `ssh edim-server 'journalctl -u edim-autodeploy.service ...'` 로 "deploy done: <sha> (backend + Next SSR healthy)" 대기 + `/api/v1/health` ok.
   - 라이브 검증: Playwright 로 https://edim.seekerslab.com (edim/edim 로그인) 에서 신규 기능 실동작 확인. 테스트가 만든 DB 행은 psql(`sudo docker exec edim-postgres psql -U edim -d edim`) 로 정리.
   - 문서: 백로그 파일 해당 항목 `[x]` 체크(배치 제목에 ✅ + 버전), `docs/EDIM_진행현황.md` 에 한 줄 요약 추가, 커밋·push.
4. 한 회차에 **한 배치만** 완료하고 종료한다 (다음 회차가 이어감).
5. 모든 배치가 ✅ 이면: "백로그 전체 완료" 를 진행현황에 기록·커밋하고, `schtasks /delete /tn "EDIM Auto Next" /f` 로 이 예약 작업을 스스로 제거한 뒤 종료하라.

컨텍스트 문서: docs/EDIM_진행현황.md (아키텍처·결정·규칙 전체), docs/EDIM_미구현기능목록.md (작업 목록), tests/README.md.
환경: 서버 ssh edim-server (sudo 가능) · DB 컨테이너 edim-postgres · MinIO minio · 사이트 edim.seekerslab.com.
