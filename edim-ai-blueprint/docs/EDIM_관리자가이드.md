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
| 비밀번호 재설정 | `비밀번호 재설정` — 임시 비밀번호 12자 발급, LOCKED 계정은 함께 해제 | PW_RESET (+UNLOCK) |

- 감사 조회: `GET /api/v1/history` 또는 M-14-6 감사 로그 박스 — LOGIN_OK/FAIL/DENY·LOCK·UNLOCK·PW_CHANGE 포함.
- 보안 정책: 5회 연속 실패 자동 LOCK · 토큰 만료 30분 전 슬라이딩 갱신 · 비밀번호 변경은 타이틀바 사용자 메뉴.
- 비밀번호 저장: PBKDF2-HMAC-SHA256(반복 260,000 · 계정별 솔트). 구형식(sha256) 계정은 **다음 로그인 시 자동 승격**되므로 일괄 재설정이 필요 없다.
- **비밀번호 분실 대응**: 사용자·권한 화면에서 대상 행 선택 → `비밀번호 재설정`. 임시 비밀번호는 **화면에 한 번만** 표시되므로 그 자리에서 본인에게 전달하고, 로그인 후 타이틀바 사용자 메뉴에서 변경하도록 안내한다. 잠긴 계정은 재설정만으로 함께 풀리므로 `잠금 해제`를 따로 누를 필요가 없다. 관리자 본인 계정은 재설정 대상이 아니다(현재 비밀번호 확인 흐름 우회 방지) — 관리자 본인이 분실한 경우 다른 ADMIN 계정으로 재설정한다.
- 세션 토큰 서명 키 `EDIM_SECRET` 은 설치 시 필수다(미설정이면 백엔드가 기동을 거부). 유출이 의심되면 키를 재발급해 재기동하면 전 세션이 즉시 무효화된다 — 설치·배포 매뉴얼 §환경변수 참조.

### 1-A. 승인 정책 — 요청자 본인 결정 금지 (4-eyes)

기본은 **꺼짐**이다(요청자가 자기 요청을 승인할 수 있음 — 종전 동작). 감사에서 승인자와
요청자의 분리를 요구하는 고객사는 켠다.

- 조회: `GET /api/v1/settings/approval-policy` · 변경: `PUT` 같은 경로 (ADMIN, 감사 `APPROVAL_POLICY_SET`)
- 켜면 요청자 본인의 승인·반려가 403 으로 막힌다. 일괄 승인에서는 본인 요청만 건너뛰고
  응답의 `selfBlocked`·`selfBlockedIds` 로 **몇 건이 정책 때문에 빠졌는지** 알려 준다
  (`skipped`= 이미 결정된 건과 구분된다).
- **도입 전 확인**: 승인 가능한 사용자가 2명 이상인지. 1명뿐이면 그 사용자가 올린 요청을
  아무도 결정할 수 없다. 사용자·권한 화면에서 APPROVE 가 가능한 계정을 먼저 확보한다.

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

## 4-A. AI 기능 운영 (ANTHROPIC_API_KEY)

AI 기능(Guide AI 질의응답·Macro 초안·UI 초안·도면 생성)은 **키가 없거나 크레딧이 없어도 제품이 멈추지 않도록** 설계돼 있습니다.
검색 근거·샘플 초안은 그대로 제공되고, 합성(LLM 호출)만 사유와 함께 보류됩니다.

| 상황 | 화면 표시 | 조치 |
|---|---|---|
| 키 미설정 | `sample` 배지 — 샘플 초안 제공 | `.env` 에 `ANTHROPIC_API_KEY` 추가 후 백엔드 재기동 |
| 키 O · 크레딧 부족 | `error` 배지 + 사유 문구, Q&A 는 검색 근거 정상 제공 | 아래 진단 순서 |
| 정상 | `live` 배지 — 합성 답변 | — |

**키 교체**: `.env` 의 `ANTHROPIC_API_KEY` 수정 → `docker compose up -d --force-recreate backend`.
`.env` 는 `.gitignore` 대상이라 커밋되지 않습니다(600 권한 유지).

**크레딧 차단 진단 순서** (화면이 아니라 API 원인을 직접 확인):

```bash
KEY=$(sudo grep -oP '(?<=^ANTHROPIC_API_KEY=).*' backend/.env)
curl -s -D - https://api.anthropic.com/v1/messages   -H "x-api-key: $KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json"   -d '{"model":"claude-haiku-4-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
```

응답 헤더의 `anthropic-organization-id` 가 **콘솔에서 충전한 조직과 같은지** 먼저 대조하십시오(가장 흔한 원인).
같다면 워크스페이스 spend limit → 결제 반영 여부 순으로 확인하고, 그래도 동일하면 응답의 `request-id` 를 Anthropic 지원에 전달합니다.

**활성화 검증**: 크레딧이 유효해지면 `PYTHONUTF8=1 py tests/live_c9_ai_smoke.py` (13체크 — 3종 엔드포인트 live 분기·산출물 계약·대화 문맥·질의 감사).
크레딧 유무와 무관한 상시 계약은 `tests/live_ai_degrade.py` 가 라이브 플릿에서 감시합니다.

**감사**: 모든 AI 질의는 `sys_history` 에 `AI_QUERY` 로 기록됩니다(질문 요지·근거 자산·이력 턴 수). M-14-6 감사 조회에서 확인.

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
