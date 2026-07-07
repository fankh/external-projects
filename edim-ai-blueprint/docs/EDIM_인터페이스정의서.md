# EDIM 인터페이스 정의서

> 내부 REST API와 외부 시스템 연계의 계약 정의.
> **내부 API의 원천은 OpenAPI 스펙** — [`api/edim-openapi.yaml`](api/edim-openapi.yaml)
> (컴포넌트정의서 APIS 목록에서 `make_openapi.py`로 자동 생성·검증, 개발표준 §11 "수기 API 문서 금지" 준수).
> 본 문서는 공통 규약·시나리오·실시간 채널·**외부 연계 8종(REQ-I)**을 다룬다.

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.1 |
| 작성일 | 2026-07-07 |
| 내부 API | 108 엔드포인트 (REST 107 + WS 1) — OpenAPI 3.1, 스키마 52종 |
| 관련 | 개발표준 §3(규약) · 권한승인정의서(인가) · DB정의서 v0.4(전체 필드) |

---

## 1. 내부 API 공통 규약

### 1.1 인증·헤더

| 헤더 | 방향 | 내용 |
|---|---|---|
| `Authorization: Bearer <JWT>` | 요청 | 필수. JWT claim: `sub`(user), `tenantId`, `userLevel`, `department` |
| `Idempotency-Key: <uuid>` | 요청 | 생성 계열 POST 재시도 안전 (개발표준 §3) |
| `X-Trace-Id` | 응답 | 요청 추적 ID — 로그·Run 상관관계 (개발표준 §9) |
| `Accept-Language` | 요청 | 선택 (`ko`/`en`/`ja`/`zh`) — locale 우선순위: 사용자 설정 > 테넌트 기본 > 본 헤더 |
| `Content-Type` | 양방향 | `application/json` (오류는 `application/problem+json`) |

- 테넌트는 **JWT claim으로만 결정** — 헤더/파라미터로 테넌트 지정 불가 (격리 원칙)
- 인가는 게이트웨이 통과 후 서비스에서 재검사 (권한승인정의서 매트릭스 — "프론트 숨김은 보안이 아님")

### 1.2 오류 — RFC 9457 Problem Details

```json
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
{
  "type": "https://edim.dev/errors/duplicate-main-code",
  "title": "Main Code 중복",
  "status": 409,
  "detail": "KDCR 3-13 은 이미 등록되어 있습니다 (중복검토 CODE-006)",
  "instance": "/api/v1/codes/products",
  "errors": [{ "field": "mainCode", "reason": "DUPLICATE" }]
}
```

주요 도메인 오류 type (말미 슬러그): `duplicate-main-code` · `running-test-failed` · `circular-reference` ·
`asset-not-approved`(미승인 자산 사용) · `pending-approval-exists`(중복 PENDING) · `price-period-overlap` ·
`dimension-binding-conflict`(macro XOR variant) · `grade-access-denied`(문서 등급)

### 1.3 페이지네이션 (커서)

```
GET /api/v1/codes/products?cursor=eyJpZCI6MTAwfQ&limit=50
→ 200 { "items": [ ... ], "nextCursor": "eyJpZCI6MTUwfQ" }   // 마지막 페이지: null
```

### 1.4 비동기 잡 패턴 — EDIM Run·AI·변환

```
POST /api/v1/cpq/selections/42/runs        { "runType": "ALL" }
→ 202 { "runId": 7, "status": "RUNNING", "statusUrl": "/api/v1/cpq/runs/7" }

GET  /api/v1/cpq/runs/7
→ 200 { "runId": 7, "status": "SUCCESS", "progress": 1.0,
        "dimensionValues": { "KDCR 3-13": { "A": 670, "B": 726 } } }

GET  /api/v1/cpq/runs/7/outputs
→ 200 { "outputs": [ { "outputType": "APPROVAL_DWG", "fileId": 31 },
                     { "outputType": "QUOTATION",   "fileId": 32 } ] }
```
완료·실패는 알림 채널(§3)로도 통지. 동기 API에 5초 초과 작업 금지 (개발표준 §3).

### 1.5 대표 시나리오 — BOM 전개 (RCCS 핵심)

```
POST /api/v1/codes/products/1/expand
{ "slotValues": { "B": "13", "C": "32", "E": "15" }, "maxDepth": 10 }
→ 200 {
  "finishedGoodsCode": "KDCR 3-13-13-15",
  "items": [
    { "level": 1, "mainCode": "KDP 1-21", "resolvedCode": "KDP 1-21-13-15",
      "resolvedSlots": { "B": "13", "E": "15" }, "quantity": 1, "path": "KDCR 3-13 > KDP 1-21" },
    { "level": 2, "mainCode": "KDP 9", "resolvedCode": "KDP 9-32", "quantity": 4,
      "path": "KDCR 3-13 > KDC 1 > KDP 9" } ]
}
```
> 응답 형식은 실 DB 검증(`ddl/verify_runtime.sql` T1)과 동일 구조 — 문서·스키마·실행 일치.

---

## 2. 서비스별 엔드포인트 총괄

상세 스펙(요청/응답/오류)은 OpenAPI 참조. Swagger UI/Redoc으로 열람 가능:
`npx -y @redocly/cli preview-docs docs/api/edim-openapi.yaml`

| 서비스 | 수 | 대표 |
|---|---|---|
| SVC-01 Auth | 14 | login·refresh·me·password·users·roles·tenants·**i18n 번들** |
| SVC-02 Hierarchy | 9 | trees·children·move·resolve·search |
| SVC-03 Code | 10 | groups·products·check-duplicate·relationships·**expand**·running-test·excel |
| SVC-04 Drawing | 15 | document(Block)·dimensions·relations·referencers·variants·supersede·import/export·parts·materials |
| SVC-05 Table | 4 | rows:bulk·query(범위)·import-excel |
| SVC-06 Toolbox | 5 | forms·publish·templets |
| SVC-07 CPQ | 9 | selections·slots·finalize·x-code-review·**runs**·outputs·bom/export |
| SVC-08 Cost | 5 | prices·resolve·pcr·quotations·render |
| SVC-09 ERP | 11 | projects·processes·process-defs·events·dashboard·work-processes·supplier-code-maps |
| SVC-10 Approval | 4 | inbox·decide·history |
| SVC-11 Print/Doc | 5 | render·export-office·doc-controls·allocate-code |
| SVC-12 File | 3 | upload-url·download-url·목록(Project Folder) |
| SVC-13 Notify | 2+WS | notifications·read (+WS) |
| ENG-01 Macro | 6 | CRUD·test-run |
| AI | 5 | macro/generate·convert·ui/suggest·chat·learning/jobs |
| INT-05 QR | 2 | issue·resolve |

---

## 3. 실시간 채널

| 채널 | 프로토콜 | 용도 | 메시지 |
|---|---|---|---|
| `/ws/notifications` | WebSocket (JWT 쿼리/헤더 인증) | 알림·승인 요청·이상 경고 | `{ "notifyType", "title", "linkUrl", "at" }` |
| Run 진행률 | 알림 채널 재사용 (`notifyType: "RUN_PROGRESS"`) | EDIM Run 단계·% | `{ "runId", "stage", "progress" }` |

폴백: WS 불가 환경은 폴링 (`GET /notifications`, `GET /cpq/runs/{id}`).

---

## 4. 외부 연계 정의 (REQ-I-001 ~ 008)

| ID | 대상 | 방향 | 방식 | 데이터 | 주기 | 상태 |
|---|---|---|---|---|---|---|
| I-001 | 외부 ERP | 양방향 | REST/파일 어댑터 (INT-01, 플러그블) | BOM·발주(PO)·회계(매입/매출) | 이벤트+일배치 | **대상 ERP 미확정** — 어댑터 인터페이스만 고정 |
| I-002 | Digital Twin (DTDesigner) | 송신 | REST API (협의) | 치수 Table(Run 결과)·3D 모델·실시간 Code | Run 완료 시 | 스펙 협의 필요 (슬라이드 77) |
| I-003 | Excel | 양방향 | 파일 (INT-03) | 사양 Import(정형 양식)·Table 행·BOM/견적 Export | 수시 | 양식 확정: 설계 단계 |
| I-004 | CAD | 양방향 | 변환 워커 (INT-04, 바이너리 격리) | DWG↔DXF(ODA)·PDF→DXF·2D→3D(STEP) | 수시 | ODA 라이선스 확인 |
| I-005 | LLM (Claude API) | 송신 | HTTPS (AI-01 경유 단일화) | Macro/UI 생성·챗봇·학습 | 수시 | 온프레미스 옵션 협의 |
| I-006 | QR | 양방향 | 서명 토큰 (INT-05) | 도면·서류·Project·업무 링크 | 수시 | **상태 비저장 서명 QR** — 별도 테이블 없음 (만료·권한 검사는 resolve 시) |
| I-007 | 모바일 푸시 | 송신 | FCM/APNs (SVC-13) | 승인·공지·경고 | 이벤트 | P5 |
| I-008 | Object Storage | 양방향 | S3 API (SVC-12 경유만) | CAD·PDF·이미지, Project Folder | 수시 | 개발 환경 MinIO 구축완료. presigned URL 외부 노출 시 S3 호스트 공개 필요 (별도 결정) |

### 어댑터 공통 원칙 (I-001 등 플러그블 연계)

- 연계 실패는 **재시도 큐** (지수 백오프, 최대 N회) → 실패 시 이상 경고(Dashboard)
- 송수신 페이로드 원문은 감사 목적 보관 (기간 협의), PII 최소화
- 외부 장애가 내부 트랜잭션을 막지 않도록 **아웃박스 패턴** 적용 (이벤트 발행 후 비동기 전송)

---

## 5. 변경 관리

1. **API 추가·변경**: `make_component_xlsx.py` APIS 수정 → `make_openapi.py` 재생성(자동 검증) → 컴포넌트 xlsx 재생성 — 3산출물 동기 보장
2. 하위 호환 파괴 변경은 `/api/v2` 신설 (개발표준 §3), OpenAPI `info.version` SemVer
3. 스키마 상세화(전 필드)는 구현 착수 시 코드 자동 생성 OpenAPI로 대체 — 본 스펙은 계약 기준선
4. 외부 연계는 대상 확정 시 본 문서 §4를 연계별 상세 명세(항목 매핑표)로 분화

---

## 6. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v0.1 | 2026-07-07 | 최초 작성 — OpenAPI 3.1 자동 생성 체계(105 오퍼레이션·52 스키마) + 외부 연계 8종 |
