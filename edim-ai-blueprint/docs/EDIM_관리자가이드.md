# EDIM 관리자 가이드

> B22 산출물 (2026-07-10) — 대상: ADMIN/PLATFORM 운영자. 인프라 접근은 개발팀 문서(진행현황 §서버) 참조.

## 1. 계정·권한 (M-14-6 사용자·권한)

| 작업 | 방법 | 감사 |
|---|---|---|
| 잠금 해제 | 사용자 선택 → `잠금 해제` (LOCKED 만 활성) — 해제 시 실패 카운터 초기화 | UNLOCK |
| 레벨 변경 | 레벨 콤보 → `레벨 변경` (PLATFORM/ADMIN/SETUP/GENERAL) | LEVEL_CHANGE |
| 다중 역할 | 역할 체크박스 — sys_user_role 즉시 반영, 유효 권한 = 레벨 ∪ 역할 (WRITE 우선) | ROLE_ASSIGN |
| 비활성화/재활성 | `비활성화` → DISABLED(로그인 거부) / `재활성`. 본인 비활성화 불가 | DEACTIVATE/REACTIVATE |
| 초대 | `초대 (인앱)` — 인앱 알림 발송 (메일 서버 미설정 — 도입 시 채널 확장) | INVITE |
| 권한 매트릭스 | 역할×화면 셀 클릭 = NONE→READ→WRITE 순환 (PLATFORM 와일드카드는 편집 불가) | PERM_CHANGE |

- 감사 조회: `GET /api/v1/history` 또는 M-14-6 감사 로그 박스 — LOGIN_OK/FAIL/DENY·LOCK·UNLOCK·PW_CHANGE 포함.
- 보안 정책: 5회 연속 실패 자동 LOCK · 토큰 만료 30분 전 슬라이딩 갱신 · 비밀번호 변경은 타이틀바 사용자 메뉴.

## 2. 문서 통제 (doc_control)

- 채번: 유형별 `{TYPE}-{seq:04d}` 자동 (allocate-code). 상태 전이는 SET_UP→CHECK→APPROVE→ACCEPTED 만 허용 — ACCEPTED 시 승인자·승인일 기록.
- Grade: S-1/S-2 렌더는 CONFIDENTIAL 워터마크 강제. SET_UP 문서만 삭제 가능.

## 3. 승인 운영 (M-15-2)

- 동일 대상 PENDING 은 1건만(중복 요청 409 안내) — 인박스 적체가 사용자 요청 실패로 이어지므로 주기 처리.
- 도면은 별도 단계 승인(작성→검토→승인) — 반려 시 체인 초기화되어 재진행.

## 4. 서버 운영 (개발 서버)

| 항목 | 내용 |
|---|---|
| 배포 | git push → 2분 내 자동 배포 (`edim-autodeploy` timer). 확인: `journalctl -u edim-autodeploy | grep "deploy done"` |
| 헬스 | `GET /api/v1/health` → `{"status":"ok","db":true}` |
| 백업 | `edim-backup` 매일 03:20 KST (PG 덤프 + MinIO) |
| 시드 | 기동 시 멱등 실행 (v1~v17) — 테넌트 존재 시 버전별 증분만 |
| 환경 변수 | 서버 `backend/.env` (커밋 금지): DATABASE_URL·MINIO_*·`EDIM_DEV_MODE=1`(요구사항 접수 게이트)·ANTHROPIC_API_KEY(AI 활성화 시)·ODA_FILE_CONVERTER_PATH(DWG 지원 시) |
| DB 콘솔 | `sudo docker exec edim-postgres psql -U edim -d edim` |
| CI | push=빌드+폴백52 · nightly 03:00 UTC=+EN 잔존 0 · 라이브 스위트는 로컬 `py tests/live_all.py` |

## 5. 요구사항 접수 운영 (dev_requirement — 개발서버 전용)

1. 운영자 접수분 확인: 📝 목록 탭 또는 `GET /api/v1/dev/requirements?status=OPEN`.
2. 개발 라운드에 전달 → 반영 후 상태 DONE(처리 내용 기록)/REJECTED(사유 필수).
3. 운영 배포에서는 `EDIM_DEV_MODE` 미설정 → 버튼·API 자체가 비노출(404).

## 6. 장애 대응 빠른 표

| 증상 | 점검 |
|---|---|
| 전 화면 MOCK | 백엔드 컨테이너 (`sudo docker ps`, `docker logs edim-backend`) · health 의 db:false 면 PG 연결 |
| 배포 안 됨 | autodeploy journal — build 실패 로그 · git 충돌 여부 |
| 파일 다운로드 503 | MinIO 컨테이너·자격 (storage unavailable) |
| 로그인 전원 거부 | sys_user status·PG 연결 — LOCKED 대량 발생 시 감사 로그로 원인 추적 |
| 승인/쓰기 500 | journalctl 백엔드 트레이스 — psycopg 제약 위반이면 데이터 정합 검토 |
