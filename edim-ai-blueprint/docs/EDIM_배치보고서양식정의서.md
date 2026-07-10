# EDIM 배치·보고서양식 정의서

> B22 산출물 (2026-07-10) — 자동 배치 목록과 보고서/양식 렌더 체계 (진행현황 §4.2 예정분).

## 1. 자동 배치 (Batch Jobs)

| ID | 배치 | 주기 | 실행 위치 | 내용 | 실패 시 |
|---|---|---|---|---|---|
| BAT-01 | edim-autodeploy | 2분 | 서버 systemd timer | origin/master 신규 커밋 감지 → pull → docker build → 정적 rsync → `deploy done: <sha>` 로그 | journalctl 로그, 다음 주기 재시도 |
| BAT-02 | edim-backup | 매일 03:20 KST | 서버 systemd timer | PostgreSQL 덤프 + MinIO 스냅샷 보관 | journalctl 로그 |
| BAT-03 | edim-ci | push 마다 | GitHub Actions | 웹 빌드 + 폴백 회귀 52체크 | PR/커밋 상태 red |
| BAT-04 | edim-nightly | 매일 03:00 UTC | GitHub Actions | 빌드 + 폴백 52 + EN 잔존 0 (프리뷰) | Actions 알림 |
| BAT-05 | 요구사항 처리 라운드 | 수시 (운영 지시) | 개발 세션 | dev_requirement OPEN 조회 → 구현 → DONE 마킹 | 목록 탭에서 상태 확인 |
| BAT-06 | 라이브 스위트 | 배치 완료 시 | 로컬 | `py tests/live_all.py` — 실서버 전 스위트 (서버 접근 필요로 CI 제외) | 요약 ❌ 스위트 개별 재실행 |

- 알림/이벤트 폴링(60초)은 프론트 상시 동작 — 배치 아님 (WebSocket 전환은 §C 제외 항목).
- 야간 정산 배치(매출·원가 집계)는 **본사업 확정 항목** — cst_calc/cst_pcr 적재가 원천이므로 집계 쿼리만 추가하면 됨.

## 2. 보고서·양식 렌더 체계

모든 PDF 는 reportlab(NanumGothic) 실렌더 — Grade S-1/S-2 는 CONFIDENTIAL 워터마크 강제 (pypdf 검증 통과).

| ID | 양식 | 생성 경로 | 데이터 원천 | 통제 |
|---|---|---|---|---|
| RPT-01 | 견적서 (Quotation) | Run 5단계 / `POST /cpq/quote-preview.pdf` / `GET /cost/quotations/{id}/render.pdf` | BOM 전개 + 단가 resolve / cst_quotation.line_items | 워터마크 · QT 채번 |
| RPT-02 | BOM 명세 (XLSX) | Run 5단계 (openpyxl) | cpq_selection_item | Project Folder 저장 |
| RPT-03 | 제작 도면 (DXF) | Run 3단계 / `POST /cad/export-dxf` | dwg_dimension + Macro 평가 (ezdxf R2010) | dwg_file 연결 |
| RPT-04 | 발주서 (PO) | `POST /erp/po` | 선택 품목 + ERP-017 조건 + ERP-018 공급자 코드 | doc_control 영속 (S-3) |
| RPT-05 | 관리 문서 | `GET /documents/{no}/render.pdf` | doc_control (상태·버전·Grade) | S-1/S-2 워터마크 강제 |
| RPT-06 | 범용 렌더 | `POST /render/pdf` | 호출측 title·lines (Print Set-up 자리표시자 치환) | confidential 토글 |
| RPT-07 | PCR 수익성 | `GET /cost/pcr` (화면 표시) | cst_calc 합계 → 기여마진·EBIT | PDF 양식은 고객 양식 확정 후 (§B) |

## 3. 문서 채번 규칙 (DOC-001)

- 형식: `{TYPE}-{seq:04d}` — `POST /documents/allocate-code` 가 유형별 순번 채번 (중복 회피 루프).
- 특수 채번: 견적 `QT-{runId}-{seq:03d}` · 발주 `PO-61313-{seq}` · QCR `QCR-{seq:04d}`.
- 상태 전이: `SET_UP → CHECK → APPROVE → ACCEPTED` (반려 = SET_UP 복귀, `PATCH /documents/{no}/status` 유효 전이만 허용).
- 삭제 보호: SET_UP 만 삭제 가능 — ACCEPTED/발행 문서는 409.
