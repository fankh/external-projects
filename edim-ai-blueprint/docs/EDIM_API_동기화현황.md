# EDIM API 동기화 현황 — OpenAPI 스펙 ↔ 구현 라우터

> B22 산출물 (2026-07-10). 설계 시점 OpenAPI(107 op) 와 구현(166 op)의 정합 기록.
> 재생성: `py tests/_tmp_routes.py` 패턴 (edim.py `@router.*` 추출) — 신규 엔드포인트 추가 시 본 문서 갱신.

## 요약

| 구분 | 수 | 비고 |
|---|---|---|
| 구현 라우터 (edim.py `/api/v1`) | **166 op** | B1~B21 + F1~F5 (프로젝트 3·사용자 3·Table export 1·마스터 수정 11 op) 반영 |
| 설계 OpenAPI 정의 | 107 op | EDIM_OpenAPI (분석 단계 산출물) |
| 스펙 정의 → 구현 완료 (동일/대체 경로) | ~90 op | 대체 경로는 아래 매핑 표 |
| 스펙 정의 → 후속 (외부 의존·범위 제외) | 17 op | 사유 명기 |
| 스펙 외 신규 구현 | ~60 op | 2차 백로그(B16~B21)·운영 도구 |

## 스펙 → 구현 대체 매핑 (경로가 다른 항목)

| 스펙 op | 구현 경로 | 비고 |
|---|---|---|
| post_auth_refresh | (헤더 슬라이딩 갱신 `X-EDIM-Token`) | B8 — 별도 엔드포인트 불요 |
| get_hierarchy_trees / search / resolve | `GET /hierarchy?treeType=` | 트리 단위 조회로 통합 |
| patch_hierarchy_nodes_id_move | 미구현 (개명만) | 주소 이동 = 참조 무결성 영향 — Platform 협의 |
| post_codes_products_id_check_duplicate | `POST /documents` 409 · `GET /erp/projects/check-duplicate` | 도메인별 중복 검사로 분산 |
| get_cost_quotations_id_render | `GET /cost/quotations/{id}/render.pdf` | 동일 기능 |
| post_ai_macro_convert | `POST /ai/macro-generate` | Claude 생성으로 통합 (4-Way 동기) |
| get_approvals_history | `GET /codes/{code}/approval-history` + `GET /history` | 대상별 이력으로 분산 |
| files upload-url/download-url (presigned) | `POST /files/upload` · `GET /files/download/{id}` | 백엔드 프록시 방식 (I-008 결정 전) |

## 스펙 정의 — 후속 항목 (17 op, 사유)

| 그룹 | op | 사유 |
|---|---|---|
| AI | ai/chat · ai/learning/jobs | ANTHROPIC_API_KEY 활성화 후 (§B 외부 의존) |
| CPQ | cpq/selections CRUD·finalize·x-code-review | 시드 selection 단일 운용 중 — 멀티 견적 시나리오 확정 시 |
| Tenant | tenants CRUD | 단일 테넌트(nova) 운용 — 멀티테넌트 개시 시 |
| QR | qr/issue · qr/resolve | Mobile 실앱 스펙 협의(§B)와 함께 |
| Hierarchy | nodes/{id}/move | 주소 이동 참조 무결성 — Platform 승인 프로세스 협의 |
| Codes | groups POST · export-excel | 코드 그룹 등록 화면 범위 협의 |
| ERP | process-defs PATCH · dashboard/project/{id} | 공정 규칙 컬럼 스키마 확장(§B) 후 |

## 스펙 외 신규 구현 (주요 — 2차 백로그)

- **도면 상세** (B16): variants·files·blocks·relations·approvals(step)·bom
- **부품** (B17): parts CRUD·supplier-codes·codes/{code}/slot-items
- **원가** (B18): cpq/runs/{id}/costs·cost/pcr·cost/quotations lifecycle
- **창고·구매** (B19): erp/warehouses·erp/qcr·erp/po
- **Toolbox** (B20): macros/functions(검색)·macros/{name}/refs·tables/{name}/impact
- **시스템** (B21): auth/me·auth/permissions·users/{login}/roles·invite·active·hierarchy/nodes CRUD·documents/allocate-code·status
- **운영 도구**: config(devMode)·dev/requirements(+images) — 개발서버 전용, 스펙 비대상

## 정합 규칙 (지속)

1. 신규 엔드포인트는 배치 커밋에 포함하고 본 문서의 해당 절에 추가한다.
2. 스펙 문서(EDIM_OpenAPI) 재생성은 본사업 착수 시점에 일괄 수행 (docs/tools 체인) — 그 전까지 본 문서가 정합 기준.
3. 후속 항목이 구현되면 위 표에서 제거하고 미구현기능목록 §B 와 함께 갱신한다.

## 전체 라우터 인벤토리 (166 op)

<details>
<summary>도메인별 요약 (엔드포인트 수)</summary>

| 도메인 | op 수 | | 도메인 | op 수 |
|---|---|---|---|---|
| drawings (도면·치수·BOM·승인) | 21 | | erp (대시보드·이벤트·창고·구매) | 16 |
| dev (요구사항 접수) | 7 | | codes (코드·관계·슬롯) | 13 |
| macros·tables (Toolbox) | 13 | | documents·files (문서·파일) | 10 |
| cost·cpq (원가·견적·Run) | 11 | | users·auth·roles (인증·권한) | 16 |
| projects (프로젝트 대장 — F1) | 5 | | 기타 (검색·알림·이력·i18n·CAD·부품·자재·업체·마스터 수정 등) | 54 |

</details>
