EDIM 백로그 자동 계속 ("do next") — 무인 실행 회차.

절차 (반드시 순서대로):
1. `git pull` 로 최신화. `git log -1 --format=%ct` 로 마지막 커밋 시각 확인 — **최근 20분 내 커밋이 있으면** 다른 회차/사용자가 진행 중일 수 있으니 "skip — 최근 커밋 진행 중" 한 줄만 출력하고 종료하라.
2. `docs/EDIM_미구현기능목록.md` 를 읽고 **다음 미체크 배치**(B1~B15 순서, 🔶 표시는 잔여 항목부터)를 선택한다.
3. 그 배치를 **통째로** 구현한다:
   - 백엔드: `backend/app/routers/edim.py` + `backend/app/services/` (기존 패턴 준수 — require_auth/min_level, `_conn()` 은 autocommit, 정직한 4xx detail)
   - 프론트: `edim-web/` — `npm run build` 통과 필수. mock 스타일 가짜 성공 금지: 쓰기 실패는 붉은 "백엔드 연결 필요" 상태 메시지.
   - 회귀: `npm run preview` 백그라운드 + `PYTHONUTF8=1 py tests/e2e_fallback.py` → **52/52 유지** (honest-write 로 기대값이 바뀌면 스위트를 그에 맞게 수정).
   - 커밋: `v<다음버전>: <type>(<scope>): <설명>` — AI 표기·Co-Authored-By 절대 금지. master push (auto-deploy 가 2분 내 배포).
   - 배포 확인: `ssh edim-server 'journalctl -u edim-autodeploy.service ...'` 로 "deploy done: <sha>" 대기 + `/api/v1/health` ok.
   - 라이브 검증: Playwright 로 https://edim.seekerslab.com (edim/edim 로그인) 에서 신규 기능 실동작 확인. 테스트가 만든 DB 행은 psql(`sudo docker exec edim-postgres psql -U edim -d edim`) 로 정리.
   - 문서: 백로그 파일 해당 항목 `[x]` 체크(배치 제목에 ✅ + 버전), `docs/EDIM_진행현황.md` 에 한 줄 요약 추가, 커밋·push.
4. 한 회차에 **한 배치만** 완료하고 종료한다 (다음 회차가 이어감).
5. 모든 배치가 ✅ 이면: "백로그 전체 완료" 를 진행현황에 기록·커밋하고, `schtasks /delete /tn "EDIM Auto Next" /f` 로 이 예약 작업을 스스로 제거한 뒤 종료하라.

컨텍스트 문서: docs/EDIM_진행현황.md (아키텍처·결정·규칙 전체), docs/EDIM_미구현기능목록.md (작업 목록), tests/README.md.
환경: 서버 ssh edim-server (sudo 가능) · DB 컨테이너 edim-postgres · MinIO minio · 사이트 edim.seekerslab.com.
