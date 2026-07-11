# EDIM 배치·보고서양식 정의서

> **배치(Job) 정의서 + 보고서·양식 정의서 통합본.**
> A부는 비동기 배치 잡(EDIM Run·AI 파이프라인·재고단가 산출 등)의 설계와 운영 배치 현황,
> B부는 보고서/양식(Print Form)의 렌더 체계·통제·카탈로그를 정의한다.
> 고객 양식(P4-1 Excel/Print 양식 협의) 확정 시 B부를 v0.3으로 갱신한다.

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.2 (v0.1 = 2026-07-10 구축 현황 기록 → v0.2 = 본사업 설계 확장) |
| 작성일 | 2026-07-11 |
| 관련 문서 | [컴포넌트 정의서](EDIM_컴포넌트_정의서.md) (SVC-09/11·AI-02·INF-07) · [기능정의서](EDIM_기능정의서.xlsx) (CPQ-013·ERP-021/022/024·AI-001) · [개발표준](EDIM_개발표준정의서.md) §9 로깅 |
| 원천 근거 | 슬라이드 46(자재·생산 상세) · 슬라이드 25(AI 파이프라인) · S-3-4 Print Set-up |

---

# A부. 배치(Job) 정의

## A.1 공통 실행 규약

| 규약 | 내용 |
|---|---|
| 실행 모델 | 요청형 잡은 **202 Accepted + 상태 폴링**(cpq_run 패턴), 주기형 잡은 스케줄러(systemd timer / 운영 이관 시 큐 워커) — Run·AI·변환 워커는 큐 기반 수평 확장(REQ-N-020) |
| 멱등성 | 모든 잡은 재실행 안전 — 시드·이행·집계는 upsert, 산출물은 버전 채번 (데이터이행 원칙 5와 동일) |
| 재시도 | 일시 오류 3회 지수 백오프, 실패 확정 시 상태 FAILED + `error_detail` 기록 (Run 파이프라인 패턴 준용) |
| 관측 | 구조화 로그 `traceId`/`runId` 전파, 단계별 실측(건수·소요) 기록 — 메트릭은 REQ-N 검증 지표와 일치(INF-07) |
| 통지 | 실패·이상 감지 시 sys_notification 생성 (승인·기한초과 알림과 동일 채널) |
| 권한 | AI 학습 잡은 **PLATFORM 전용**(REQ-N-022), 정산·단가 집계는 SETUP+ — 실행 이력은 감사 대상 |

## A.2 업무 배치 잡 카탈로그 (본사업)

| ID | 잡 | 트리거 | 내용 | 근거 | 상태 |
|---|---|---|---|---|---|
| JOB-01 | EDIM Run 파이프라인 | 요청형 (CPQ Run) | ① BOM 전개 영속 ② 치수 Macro 평가 ③ 제작 DXF ④ 단가 resolve ⑤ 견적 PDF+BOM XLSX ⑥ 산출물 저장(Folder) | RUN-001~009 | **구현** (개발 서버 가동) |
| JOB-02 | AI 학습 파이프라인 | 수동 (Platform) | CAD 변환→추출→구조화→RAG 인덱싱, 품질 리포트 — 단계: 메타데이터→2D 엔티티·OCR→3D Feature | AI-001 · 개요 §9 | 설계 (P5) |
| JOB-03 | 재고 단가 산출 | 일 1회 (마감 후) | 입출고 이력 기반 재고 단가 4종(최고/최저/평균/최근) 산출 → cst_price(STOCK) 갱신 | ERP-021 | 설계 (P5) |
| JOB-04 | MRP 소요 산출 | 생산계획 확정 시 | BOM 기반 자재 소요량·소요 시기 전개, PR 후보 생성 | ERP-022 | 설계 (P5) |
| JOB-05 | 기한초과·이상 스캔 | 10분 주기 | erp_process_event 기한 초과·시간/자금 이상 감지 → 경고 이벤트+알림 | ERP-003 · REQ-N-019 | 부분 (경고 표시 구현, 스캔 주기화는 본사업) |
| JOB-06 | 정산 집계 (매출·원가) | 일/월 마감 | cst_calc·cst_pcr 적재분 집계 → Dashboard KPI·월 보고 원천 | 슬라이드 46 | 본사업 확정 항목 — 집계 쿼리만 추가 |
| JOB-07 | 백업 | 일 1회 03:20 | PostgreSQL 전체 덤프 + 파일 스토리지 스냅샷, 보존 7일(운영 이관 시 원격지·PITR) | REQ-N-012 | **구현** (edim-backup.timer) |
| JOB-08 | 보관 주기 관리 | 월 1회 | 감사 로그 보관(5년 가정) 아카이브·알림 읽음 정리·만료 세션 정리 | REQ-N-009 · 보안관리계획서 §6 | 설계 (안정화 단계) |

## A.3 운영·개발 배치 현황 (개발 서버)

| ID | 배치 | 주기 | 실행 위치 | 내용 | 실패 시 |
|---|---|---|---|---|---|
| BAT-01 | edim-autodeploy | 2분 | 서버 systemd timer | origin/master 신규 커밋 감지 → pull → docker build → 정적/docs rsync → `deploy done: <sha>` 로그 | journalctl 로그, 다음 주기 재시도 |
| BAT-02 | edim-backup | 매일 03:20 KST | 서버 systemd timer | PostgreSQL 덤프 + MinIO 스냅샷 보관 (JOB-07 구현체) | journalctl 로그 |
| BAT-03 | edim-ci | push 마다 | GitHub Actions | 웹 빌드 + 폴백 회귀 52체크 | PR/커밋 상태 red |
| BAT-04 | edim-nightly | 매일 03:00 UTC | GitHub Actions | 빌드 + 폴백 52 + EN 잔존 0 (프리뷰) | Actions 알림 |
| BAT-05 | 요구사항 처리 라운드 | 수시 (운영 지시) | 개발 세션 | dev_requirement OPEN 조회 → 구현 → DONE 마킹 | 목록 탭에서 상태 확인 |
| BAT-06 | 라이브 스위트 | 배치 완료 시 | 로컬 | `py tests/live_all.py` — 실서버 전 스위트 (서버 접근 필요로 CI 제외) | 요약 ❌ 스위트 개별 재실행 |

- 알림/이벤트 폴링(60초)은 프론트 상시 동작 — 배치 아님 (WebSocket 전환은 본사업 SVC-13 범위).

---

# B부. 보고서·양식 정의

## B.1 렌더 체계·통제

- **렌더러**: reportlab(NanumGothic CID 임베드 — 뷰어 무관 한글) PDF · openpyxl XLSX · ezdxf DXF(R2010)
- **양식 편집**: Print Set-up(S-3-4, CPQ-013·SVC-11) — 양식 배치·Data 위치(자리표시자)·그래프·워터마크·Font·용지·머리글/바닥글, Print Test 후 DRAFT→게시. Print Templet은 Toolbox Templet 관리(TBX-013)로 재사용
- **통제**: Grade S-1/S-2 문서는 **CONFIDENTIAL 워터마크 강제**(pypdf 검증 통과), 열람·출력은 Management Grade 통제([보안관리계획서](EDIM_보안관리계획서.md) §4) — 통제 문서는 Print 경로 경유만 허용
- **다국어**: 양식 라벨은 sys_translation 키 사용(REQ-N-015) — 로케일별 날짜·숫자·통화 포맷
- **채번·상태**: §B.4 문서 채번 규칙 — 발행 문서는 doc_control 영속

## B.2 양식 카탈로그

구현 완료(개발 서버 가동) 양식은 RPT, 본사업 예정 양식은 FORM 접두어.

| ID | 양식 | 생성 경로 | 데이터 원천 | 통제 | 상태 |
|---|---|---|---|---|---|
| RPT-01 | 견적서 (Quotation) | Run 5단계 / `POST /cpq/quote-preview.pdf` / `GET /cost/quotations/{id}/render.pdf` | BOM 전개 + 단가 resolve / cst_quotation.line_items | 워터마크 · QT 채번 | **구현** |
| RPT-02 | BOM 명세 (XLSX) | Run 5단계 (openpyxl) | cpq_selection_item | Project Folder 저장 | **구현** |
| RPT-03 | 제작 도면 (DXF) | Run 3단계 / `POST /cad/export-dxf` | dwg_dimension + Macro 평가 | dwg_file 연결 | **구현** |
| RPT-04 | 발주서 (PO) | `POST /erp/po` | 선택 품목 + ERP-017 조건 + ERP-018 공급자 코드 | doc_control 영속 (S-3) | **구현** |
| RPT-05 | 관리 문서 | `GET /documents/{no}/render.pdf` | doc_control (상태·버전·Grade) | S-1/S-2 워터마크 강제 | **구현** |
| RPT-06 | 범용 렌더 | `POST /render/pdf` | 호출측 title·lines (Print Set-up 자리표시자 치환) | confidential 토글 | **구현** |
| RPT-07 | PCR 수익성 | `GET /cost/pcr` (화면 표시) | cst_calc 합계 → 기여마진·EBIT | PDF 양식은 고객 양식 확정 후 | 부분 |
| FORM-01 | 작업지시서 | 생산 프로세스 WR 단계 발행 | erp_process_event + Work Process(자재/공정/조립) | 단계별 진행 기록·모니터링 | 예정 (ERP-024, P5) |
| FORM-02 | 검사성적서 | 검사 단계(ER 입고검사·EF 생산검사) 완료 시 | 검사 항목·판정 (부적합 NCF 분기) | doc_control 영속 | 예정 (ERP-007/008, P5) |
| FORM-03 | 승인도서 (도면 출력) | 도면 승인 완료 후 Print | dwg_document + 표제란 자리표시자 | Grade 통제·워터마크 | 예정 (P3 Print 연계) |
| FORM-04 | 사양 Import/BOM·견적 Export (Excel) | Excel Import/Export 전면 | 코드·Table·견적 | Import 거부 리포트 | 예정 (INT-03 — **고객 양식 확정 대기**) |

> FORM-01~04 는 항목·레이아웃이 고객 양식 협의 대상 — 확정 즉시 Print Set-up 템플릿으로 등록하고 본 표를 v0.3으로 갱신.

## B.3 문서 채번 규칙 (DOC-001)

- 형식: `{TYPE}-{seq:04d}` — `POST /documents/allocate-code` 가 유형별 순번 채번 (중복 회피 루프).
- 특수 채번: 견적 `QT-{runId}-{seq:03d}` · 발주 `PO-61313-{seq}` · QCR `QCR-{seq:04d}`.
- 상태 전이: `SET_UP → CHECK → APPROVE → ACCEPTED` (반려 = SET_UP 복귀, `PATCH /documents/{no}/status` 유효 전이만 허용).
- 삭제 보호: SET_UP 만 삭제 가능 — ACCEPTED/발행 문서는 409.

---

## 미결정·협의 항목

| 항목 | 차단 내용 | 확정 시점 |
|---|---|---|
| 고객 양식(작업지시서·검사성적서·Excel Import/Export) | FORM-01~04 레이아웃 | P4-1 협의 (INT-03) |
| 정산 집계 요건 (마감 주기·계정 체계) | JOB-06 상세 설계 | 본사업 분석 단계 |
| 감사 로그 보관 기간 (5년 가정) | JOB-08 아카이브 정책 | 착수 협의 (보안관리계획서 §8) |

## 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v0.2 | 2026-07-11 | 설계 확장 — A부(공통 규약·업무 잡 JOB-01~08)·B부(렌더 통제·FORM-01~04) 신설, 산출물 레지스터 2종(배치/보고서양식) 충족 |
| v0.1 | 2026-07-10 | 최초 작성 (B22) — 운영 배치 BAT-01~06·구현 양식 RPT-01~07·채번 규칙 기록 |
