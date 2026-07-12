# EDIM 미구현 기능 목록 — 단계별 구현 계획

> 전수 감사 결과 (2026-07-09, 프론트 24화면 + 백엔드 48엔드포인트 + 54테이블 + 요구사항 문서 대조).
> 위에서 아래로 순서대로 구현한다. 완료 시 체크 + 진행현황 문서 갱신.
> 규칙: 배치마다 **백엔드 + 프론트 + 테스트 + 문서 + 배포 + 라이브 검증**까지 한 번에 끝낸다.

## 현황 요약

| 구분 | 수치 |
|------|------|
| DB 테이블 사용률 | 28/54 (52%) — 26개 미사용 |
| 화면 내 가짜 버튼 (statusMsg 만) | 약 35개 |
| 로컬 상태만 있고 미영속 | Work Process·UI Designer·Print Set-up·Duct 배치 |
| 메뉴 '— 예정' | 7개 (Material·Quality·Arrangement·Raw Material·Variant·Templet·통합검색) |
| i18n 미적용 화면 | 20개 (셸·로그인·C-1·CAD 만 적용) |
| 보안 공백 | 비밀번호 변경·자동 잠금·로그인 감사·토큰 갱신 없음 |

---

## A. 즉시 구현 가능 배치 (외부 의존 없음 — 순서대로)

### B1. 승인 워크플로 전면 실배선 ✅ (v4.3, 2026-07-09)
지금 모든 "승인 요청" 버튼이 메시지만 출력한다. 공통 승인 API 로 전부 실동작화.
- [x] `POST /approvals` 범용 승인 요청 (target_table/target_id/type/comment → sys_approval_request + 알림)
- [x] `PUT /macros/{name}` — Macro Studio 저장 (tbx_macro DRAFT 버전 영속)
- [x] 배선: Design Editor 승인 요청 · Macro Studio 저장(F12 포함)+검증·승인 요청 · Print Set-up 승인 요청→게시 · UI Designer 게시 (mock 모드에서는 정직 거부)
- [x] 승인함에서 위 요청들이 실제로 보이고 승인/반려 → 요청자 알림까지 왕복 검증 (라이브 7체크)
- [x] 테스트: tests/live_b1_approval_flow.py (요청→수신→결정→이력→알림→Macro 영속)

### B2. 편집 영속화 — "저장이 진짜 저장" ✅ (v4.5~4.6, 2026-07-09)
- [x] `PUT /drawings/dimensions` — Design Editor 임시저장 F12 (VARIANT=variant_value · =식=tbx_macro 갱신)
- [x] `GET/PUT /erp/work-process` — Work Process MAKE/BUY 토글 F12 저장 + 진입 시 복원 (erp_work_process upsert)
- [x] `GET/PUT /toolbox/forms/{name}` — UI Designer 레이아웃 저장(버전+1)·복원 (tbx_ui_form JSONB, 게시=저장 후 승인 요청)
- [x] 새로고침 후 저장값 유지 라이브 검증 — tests/live_b2_persistence.py 6/6 (경로 세그먼트 '/' 라우팅 버그 수정 포함)

### B3. 단가 관리 쓰기 완성 ✅ (v4.8~5.3, 2026-07-09)
- [x] `POST /prices` — ＋ 단가 등록 (다이얼로그 + cst_price insert, 공급처 com_company 자동 생성, EXCLUDE 409 안내 — 라이브 검증)
- [x] 단가 Excel Import — `POST /prices/import-excel` (헤더 Code·공급처·단가·Table·적용시작·종료, 행 단위 거부 리포트 — 등록2·거부1 라이브 검증, autocommit 환경 SAVEPOINT 버그 수정)
- [x] "단가 Table 전체(4종)" 콤보 실필터 (5→1 재고 필터 라이브 검증)
- [x] 등록 행이 대장에 즉시 반영 (5→6 라이브 검증, 테스트 행 정리 완료)

### B4. 문서 도메인 완성 + 인쇄 렌더 (P2-4) ✅ (v5.5~5.8, 2026-07-09)
- [x] `POST /documents` — ＋ 문서 등록 다이얼로그 (doc_control insert + 승인 요청 자동, 중복 409 — 라이브 검증)
- [x] `GET /documents/{no}/render.pdf` — build_doc_pdf, **S-1/S-2 CONFIDENTIAL 워터마크 강제** (pypdf 텍스트 추출로 게이트 검증; doc_no 중복 시 최신 행 렌더 버그 수정)
- [x] 문서함 미리보기 = 실 PDF iframe(blob) · Print = 실렌더 새 창
- [x] Print Set-up "Print Test" = 자리표시자 치환 실렌더 (범용 `POST /render/pdf`, 워터마크 토글 연동 — 라이브 검증)
- [x] Doc Templet Print = 계산값 포함 PDF (Density ρ 실측치 렌더 — pypdf 추출 검증)

### B5. 통합 검색 ✅ (v6.0, 2026-07-09)
- [x] `GET /search?q=` — product_code·doc_control·dwg_file ILIKE (그룹별 LIMIT 8) + 화면 레지스트리 프론트 병합
- [x] 툴바 ⌘K 검색창: 300ms 디바운스 드롭다운 — 화면=탭 · 코드=코드 상세 · 문서=문서함 · 파일=CAD 뷰어 (라이브 4검증)
- [x] 공통 메뉴 '통합 검색' — 툴바 ⌘K 가 전역 검색을 담당 (별도 화면 불요, 메뉴는 ⌘K 안내로 유지)

### B6. 이벤트·알림 액션 완성 ✅ (v6.2, 2026-07-09)
- [x] `PATCH /erp/events/{id}` — 재배정 (assignee 변경 + 담당자 알림 + sys_history — 라이브 검증)
- [x] `POST /erp/events/{id}/escalate` — 에스컬레이션 (ADMIN 전원 알림 + 이력 — 라이브 검증)
- [x] 알림 벨: 모두 읽음(서버 미읽음 0 검증) · 알림 클릭 → 유형별 화면 탭 이동 (승인함/업무함/Dashboard)
- [x] 이벤트 상세 = 실 이벤트 필드 + 재배정/에스컬 기록은 sys_history (mock history 는 시연용 전후 공정 표시로 유지)

### B7. PLM 도면 대장 — 미사용 핵심 도메인 개방 ✅ (v6.5, 2026-07-10)
dwg_drawing·dwg_revision·dwg_supersedure 개방 — 신규 화면 도면 대장(M-4-1, PLM Design management).
- [x] `GET/POST /drawings` — 도면 대장 목록·등록 (dwg_drawing + Rev.A 자동, 중복 409 — 라이브 검증)
- [x] `GET/POST /drawings/{no}/revisions` — Rev 이력 + Rev 올리기 (dwg_revision, A→B 라이브 검증; 시드 v8 = KDCR 3-13 Rev A/B)
- [x] Supersedure 실데이터: `GET/POST /drawings/supersedures` — 구도면 KDCR 3-12→3-13 시드 + 대체 등록 실동작, 툴바/코드 상세 Supersedure 버튼 = 도면 대장 화면
- [x] 코드 상세 "도면 열기" = 연결 DXF CAD 뷰어 (dwg_file.drawing_id — Run 파이프라인 DXF 자동 연결 + 시드 v8 소급 연결)
- [x] 코드 상세 승인 이력 = `GET /codes/{code}/approval-history` (sys_approval_request 실조회, 백엔드 불가 시에만 MOCK 칩)
- [x] 테스트: tests/live_b7_drawings.py 17/17 (등록→409→Rev up→Supersedure→승인 이력→CAD·sys_history)
- dwg_approval 테이블은 범용 sys_approval_request 로 갈음 (도면 승인도 POST /approvals 사용) — 별도 개방 불요

### B8. 보안 강화 배치 ✅ (v6.7, 2026-07-10)
- [x] `PUT /users/me/password` + 타이틀바 사용자 메뉴에 비밀번호 변경 다이얼로그 (구비밀번호 검증·mock 정직 거부)
- [x] 로그인 5회 실패 → 자동 LOCKED (sys_user), 실패 시도 sys_history 기록 (연속 실패 = 마지막 LOGIN_OK/UNLOCK 이후 집계 — 스키마 무변경)
- [x] 토큰 슬라이딩 갱신: 만료 30분 전 `X-EDIM-Token` 응답 헤더로 재발급, 프론트 자동 교체 (8시간 하드컷 제거; login `ttlSeconds` 로 검증)
- [x] 감사 확장: LOGIN_OK/FAIL/DENY·LOCK·UNLOCK·PW_CHANGE·LEVEL_CHANGE 전부 sys_history (+ `PATCH /users/{login}/level` — M-14-6 레벨 변경 실배선)
- [x] 테스트: tests/live_security.py 27/27 (변경→구비밀번호 거부·5회 실패 잠금·해제 후 카운터 초기화·갱신 헤더·감사 행·UI 다이얼로그)

### B9. i18n 전면 확장 (시드 v9) ✅ (v6.8, 2026-07-10)
- [x] 미적용 화면 전 라벨 키 추출·t() 배선 — 24화면 크롬(그리드 헤더·그룹박스·버튼·콤보·상태 칩·placeholder) 신규 557키, Combo value/label 분리(필터 로직 값 무변경)
- [x] en/ja/zh 번역 생산 + sys_translation 시드 v9 (646키×3, 키 단위 멱등) + OFFLINE_BUNDLES 동기 — `tools/gen_i18n_bundles.py` 로 시드에서 생성 (단일 원천, 직접 편집 금지)
- [x] EN 전환 한글 잔존 0 — `tests/check_i18n_en.py` (프리뷰 mock 폴백 + 라이브 실DB 24화면+로그인 크롬), ja/zh 라이브 스모크, KO 폴백 스위트 52/52 유지
- 데이터 콘텐츠(품명·공급처·문서 제목 등) 번역은 별도 트랙 (§B 번역 콘텐츠 제작) — 크롬만 B9 범위

### B10. C-1 마감 + CommandLine 실명령 ✅ (v7.1, 2026-07-10)
- [x] 견적 미리보기 = `POST /cpq/quote-preview.pdf` (전개+단가→견적서 PDF 즉석 렌더, 영속 없음 — pypdf 검증·새 창)
- [x] 사양 Excel ⬆ = `POST /cpq/spec-import` (Slot·Value 2열 → 슬롯 자동 세팅 + 재전개 — B=21·E=15 라이브 검증)
- [x] CommandLine 실명령: ZOOM [IN|OUT]·FIT·MEASURE(CustomEvent→CadSvg)·SELECT <code>(BOM 하이라이트)·RUN — 라이브 4검증
- [x] Design Editor Simulation = 전체 Macro 재평가+CAD 재작도 (A=690→도면 B(H)=746 재작도 검증)

### B11. Mobile 실동작 ✅ (v7.4, 2026-07-10)
- [x] 모바일 승인/반려 = approvalService.decide 실호출 — 카드가 실 승인함 최신 건 표시, 승인→인박스 제거 라이브 검증 (APP-002)
- [x] 입고 처리 = eventService.complete 실호출 (첫 미완료 이벤트 → DONE 라이브 검증, 처리 후 다음 건 자동 로드)
- [x] 사진 첨부 = fileService.upload RECEIVED (MinIO 등재 + Folder 목록 확인 — 테스트 데이터 원복 완료)

### B12. Undo/Redo 실구현 ✅ (v7.6~7.7, 2026-07-10)
- [x] 공용 훅 `src/shell/useEditHistory.ts` — 화면별 50깊이 스택, 활성 화면만 수신, structuredClone 스냅샷
- [x] 적용: Design Editor 치수(undo 시 CAD 재작도)·Table12 셀(dirty 유지)·UI Designer 위젯 배치 — 라이브 5검증
- [x] 툴바 ↶↷(셸+에디터 로컬)·편집 메뉴·Ctrl+Z/Y = CustomEvent 'edim-undo/redo' 디스패치 (입력 필드 포커스 시 브라우저 기본 유지)

### B13. '— 예정' 메뉴 화면 신설 ✅ (v7.9~8.2, 2026-07-10 — 예정 메뉴 0)
- [x] Arrangement Set-Up (M-4-2) — arrangement_code/component GET·POST + 화면 (등록 다이얼로그·구성품 추가·승인 요청 자동, 시드 v10 2건 — 라이브 검증·테스트 데이터 정리)
- [x] Templet 관리 (S-2-3) — tbx_templet GET·PUT + 화면 (JSON 정의 편집기·F12 저장=DRAFT 회귀·구문 오류 가드·승인 요청, 시드 3건 — 라이브 5검증)
- [x] Variant·Constant (S-1-2) — code_item_value 값 목록/등록 (PENDING→승인 자동, 중복 409 — 라이브 검증)
- [x] Raw Material·GPI (M-3-2) — mat_material CRUD + 등록 다이얼로그 (시드 v11 4건, 중복 409 — 라이브 검증)
- [x] PLM Material (M-4-4) = 재질 마스터 공유 화면 · Quality (M-4-5) = dwg_verification 검증 규칙 실 CRUD (시드 2건 + 등록 검증)
- [x] 공통 '통합 검색' = ⌘K 검색창 포커스 — **전 모듈 '— 예정' 메뉴 0** (라이브 확인, 테스트 데이터 정리)

### B14. 마스터 데이터 + RBAC 동적화 ✅ (v8.4, 2026-07-10)
- [x] com_company CRUD — 공급처·거래처 대장 (M-14-2 신규 화면, 유형 4종·중복 409, 단가 등록 자동생성 업체 표시 — 라이브 검증)
- [x] sys_role·sys_role_permission 개방 — M-14-6 권한 매트릭스 실데이터 (셀 클릭 NONE→READ→WRITE 순환 영속 + PERM_CHANGE 감사, PLATFORM 와일드카드 — 라이브 검증·원복)
- [x] sys_hierarchy — Hierarchy 주소 체계 (M-3-1 신규 화면, PRODUCT/GENERAL_DB/CONFIG 트리, 시드 v12 9노드 — 라이브 검증)

### B15. 테스트·품질 마감 ✅ (v9.2, 2026-07-10 — live_all 10/10 green)
- [x] 라이브 스위트 통합 러너 (tests/live_all.py — 10개 스위트 순차+요약, 실서버 10/10 green) + CI nightly 잡 (edim-nightly.yml 03:00 UTC — 빌드+폴백52+EN잔존0)
- [x] auth 회귀 (만료·잠금·RBAC 403 매트릭스 — live_b15_regression.py: GENERAL×쓰기 10종 403·변조/무토큰 401·업로드 .exe/폴더 422·i18n 미지원 404·en 600+키)
- [x] 배치별 신규 기능 테스트는 각 배치에 포함 — 잔여 정리: 스위트 자체정리 원칙 확립(b7 decide+도면 삭제, cad 샘플 파일 삭제), 신규 API DELETE /drawings/{no}(DRAFT 한정)·DELETE /files/{id}(참조 409 보호), 승인 중복 요청 정직 409(uq_approval_pending), seed v13(신규 화면 i18n 키)

---

## A-2. 2차 백로그 (2026-07-10 전수 재감사 — B1~B15 완료 후 잔여) — 🏁 **B16~B22 전체 완료 (v11.0)**

> 3방향 감사: ① 프론트 no-op·mock 잔존 ② 백엔드 미사용 테이블 12종(grep 0회 검증)·OpenAPI 스펙 대비 미구현 op ③ 설계 문서(기능 179·요구 80·보완노트) 대조.
> 완료 결과: **DB 54테이블 사용률 100%** · no-op 버튼 0 · 라이브 스위트 14종(live_all) · 신규 화면 3종(부품 대장·창고·+상세 탭들) · API 148 op.

### B16. 도면 상세·CAD 심화 (DWG-024~027 + dwg_approval) ✅ (v9.8, 2026-07-10 — 라이브 24검증)
- [x] 도면 Viewer 탭 5종 완성 — 도면 대장 상세 탭 [Rev 이력|승인 단계|Variants|Referencers|첨부] (Variants=패밀리 접두 매칭+대체됨 플래그, 첨부=dwg_file.drawing_id 더블클릭→CAD 뷰어)
- [x] 설계 Simulation 우측 판넬 (DWG-024) — VARIANT 치수 입력(디바운스 400ms)→MACRO 치수 엔진 즉시 재평가 Δ표시, 적용=이력 push+치수 커밋+CAD 재작도
- [x] CAD 특성 편집 (DWG-025 1차) — 뷰어 레이어별 색 피커·선굵기 1×/2×/3× 오버라이드 + 원복 (표시 속성, 원본 DXF 불변; Trim·Block·단면은 §B 협의 항목으로 이동)
- [x] dwg_approval 개방 — WRITE→REVIEW→APPROVE 순서 강제(409)·반려=DRAFT 복귀+이력 초기화·APPROVE=도면 APPROVED, 시드 v14 체인
- [x] dwg_document·dwg_part_relation 개방 — Design Editor Block 캔버스=실 블록 7건, 부품 관계 패널=실 3건(Macro 연결 표시), 도면 삭제 시 연쇄 정리(RELEASED 만 보호)

### B17. 부품(Part) 마스터 + 도면 BOM ✅ (v10.0, 2026-07-10 — 라이브 19검증)
- [x] prt_part CRUD + 부품 대장 화면 (M-4-7 신규: 등록 F2 다이얼로그·재질/공급처/제품코드 연결·중복 409·재질 검증 422·F3 삭제 — BOM 참조 시 409 보호, 시드 v15 4부품)
- [x] dwg_bom 개방 — 조립순서 정렬 BOM API + 추가/삭제(중복 409), Design Editor 조립순서 ◆ = 실데이터(①~⑥ 노트 툴팁), 부품 상세 = 블록명 매칭 seq·노트·수량 표시
- [x] prt_supplier_code_map — 부품 대장 우측 매핑 패널(추가 폼) + 제품코드 경유 조회(GET /codes/{code}/supplier-codes) → 발주 화면 매핑 표 실데이터 (ERP-018)
- [x] product_code_item 개방 — GET /codes/{code}/slot-items + 코드 상세 '필수 슬롯 정의' 박스 (KDP 1-21 시드 3슬롯: A/B 필수·C 선택)

### B18. 원가·수익성 (CPQ Cost 완결) ✅ (v10.2, 2026-07-10 — 라이브 19검증)
- [x] cst_calc 개방 — Run 파이프라인이 원가 3분류 자동 적재 (재료비=BOM 단가 라인·제조비=dwg_bom 조립 스텝×표준 임율·직접경비=운송/검사) + GET /cpq/runs/{id}/costs + Run 화면 원가 패널
- [x] cst_pcr — POST /cost/pcr (최근 Run 원가 기반: 기여마진=매출-직접비·EBIT=마진-SGA 8%, 사업유형별 UNIQUE upsert — 누적 없음) + Run 화면 PCR 생성 버튼
- [x] 견적 lifecycle — POST /cost/quotations (PCR 기반 QT 채번·line_items=원가 라인) · render.pdf (영속 행 렌더) · DELETE (DRAFT 한정) + Run 화면 견적 확정·목록·미리보기
- [x] 재고 단가 4종 표기 — 확인 결과 기구현 (M-12-5 최고/최저/평균/최근 4열, 감사 시점 오판)

### B19. ERP 창고·구매 상세 (ERP-017~021) ✅ (v10.4, 2026-07-10 — 라이브 21검증)
- [x] erp_warehouse 개방 — 창고·저장위치 화면(M-8-4 신규): 5계층 순서 강제(422)·위험물 허용 칩·검사주기·중복 409·하위 존재 삭제 보호, 시드 v16 트리 7노드 (재귀 CTE 경로 정렬)
- [x] 구매 상세 필드 (ERP-017) — 발주 확정 시 PO 조건 다이얼로그(납품조건 EXW/FOB/CIP·운송수단·최소구매수량·인증서) → **PO 를 doc_control 문서로 영속** (공급자 코드 ERP-018 품목 병기, 문서함 노출·SET_UP 삭제)
- [x] "견적 요청 (QCR)" 실배선 — POST /erp/qcr: QCR 채번 + QCR_ISSUE 감사 기록 + 구매 담당(SETUP+) 알림 (공급자 회신 대기)

### B20. Toolbox 심화 — Macro CODING 모드 ✅ (v10.6, 2026-07-10 — 라이브 17검증)
- [x] tbx_macro 4-Way 전체 영속 — 저장 시 수식+코드+플로차트(JSONB)+설명+마지막 Test 입력/결과, 버전 자동 증가·진입 시 복원(칩 표기), 시드 v17 보강
- [x] apply_type='CODING' 모드 — 코드 필수 검증(422)·모드 콤보·엔진 v1 미실행 정직 게이트(수식만 실행, 코드 런타임은 협의 대상), 시드 데모 매크로
- [x] tbx_macro_ref — 저장 시 수식에서 Table 참조 자동 추출(내장함수 제외) 재구성 + GET /macros/{name}/refs · **영향도 GET /tables/{name}/impact** (Studio 참조 칩)
- [x] 함수 자연어 검색 (TBX-014) — 서버 카탈로그 11종(한글 키워드: 반올림→PreC·합계→SUM) + 기능 찾기 실검색·클릭 삽입, 함수 마법사 팔레트도 실삽입 배선

### B21. 시스템·UX 마감 (no-op 버튼 실배선 + read-only 개방) ✅ (v10.8, 2026-07-10 — 라이브 29검증)
- [x] sys_user_role 개방 — 다중 역할 체크박스(M-14-6, 전체 교체 PUT + ROLE_ASSIGN 감사), /auth/permissions 는 레벨 암묵 역할과 합집합(WRITE 우선)
- [x] Hierarchy 노드 편집 — 등록(주소 접두 검증 422·중복 409)·개명(주소 불변)·삭제(하위 보호), F2/F3 + 다이얼로그
- [x] 문서 채번 자동화 — POST /documents/allocate-code ({TYPE}-{seq:04d} 중복 회피) + 상태 전이 PATCH(SET_UP→CHECK→APPROVE→ACCEPTED·반려 복귀·유효 전이만 409)
- [x] no-op 버튼 실배선 완료: 초대=인앱 알림+감사(메일 서버 미설정 정직 표기) · 비활성화/재활성=DISABLED 로그인 거부(본인 보호 422) · 문서 미리보기/Print=워터마크 실렌더+실채번 표시 · 중복검토=prj_project ILIKE 실질의 · Print Set-up 호출=S-3-4 탭 · Child 추가=code_relationship DRAFT insert(중복 409) · 처리 Form 열기=UI Designer 탭(컨텍스트 전달) · UI Designer 미리보기=layout_def 동적 렌더 모달
- [x] GET /auth/me·/auth/permissions — 세션 사용자(역할 포함)·유효 권한 매트릭스

### B22. 산출물 문서 + 스펙 동기화 ✅ (v11.0, 2026-07-10)
- [x] OpenAPI 스펙 ↔ 라우터 동기화 — [EDIM_API_동기화현황.md](EDIM_API_동기화현황.md): 구현 148 op 인벤토리·대체 경로 매핑·후속 17 op 사유 명기·정합 규칙 (스펙 재생성은 본사업 착수 시 일괄)
- [x] 배치/보고서양식 정의서 — [EDIM_배치보고서양식정의서.md](EDIM_배치보고서양식정의서.md): 배치 6종(autodeploy·backup·CI·nightly·요구사항 라운드·라이브 스위트) + 보고서 7종 렌더 체계 + 채번 규칙
- [x] 사용자 가이드 + 관리자 가이드 — [EDIM_사용자가이드.md](EDIM_사용자가이드.md)(공통 조작·모듈별·트러블슈팅) · [EDIM_관리자가이드.md](EDIM_관리자가이드.md)(계정/권한·문서 통제·서버 운영·장애 대응)

---

## A-3. 3차 백로그 — 완성 단계 (2026-07-10 계획)

> 1·2차가 기능 공백을 닫았다면 3차는 **솔루션 완성**: ① 제품 깊이(멀티 견적·분석·그룹 관리) ② 운영 준비(단위 테스트·마이그레이션·무중단 배포·관측성 — 2차 마감 중 직접 겪은 배포-재시작 503 창 제거 포함) ③ 외부 의존 활성화 준비 ④ 잔여 실데이터화·품질 그물 확장(재감사 발견분). 순서대로 C1→C13, 각 배치 완결 기준(backend+frontend+tests+docs+deploy+verify) 동일. 권장 실행 순서: **C11→C12(빠른 마감) → C1→C4(제품) → C5→C8(운영) → C9·C10·C13**.

### 트랙 1 — 제품 완결

### C1. CPQ 멀티 견적 체계 (스펙 후속 op 해소) — 🔶 **핵심 완료 (v13.31)**
- [x] cpq/selections CRUD — `GET/POST/DELETE /cpq/selections`(프로젝트별 목록·저장·삭제, Run 참조 409 보호) + C-1 견적안 셀렉터·F12 실저장·불러오기(슬롯 로드+재전개). **E2E: 저장→목록(runCount)→Run 대상 실행→삭제 보호 409/미참조 200**
- [x] Run 이 지정 selection 대상 실행 — `start_run` selectionId 파라미터 + C-1이 저장/로드 견적안 id 를 Run 탭에 전달 (라이브 runId 66 검증)
- [x] spec_input JSONB 저장 — POST selections 에 specInput 영속 (사양 Excel 결과 보존 경로)
- [ ] 잔여: selection finalize + x_code_status 심사 흐름(x-code review UI) — 저장 시 X-code 판별→PENDING 은 구현, 검토·승인 UI 는 후속

### C2. 코드 그룹 관리 + Excel 왕복 — 🏁 **완료 (v13.33)**
- [x] codes/groups 목록·등록(DRAFT·유형 검증·중복 409) + 그룹별 `GET .../export.xlsx`(Slot·Item Name·Sort·Values). E2E: 목록 KOF 8슬롯·등록·409·export PK 5151B
- [x] code_item 일괄 `POST .../import-excel` (Slot·Item Name 헤더, Slot 중복=갱신, **행 단위 거부 리포트**). E2E: 추가 2·거부 2(4·5행 필수 누락)
- [x] S-1-1 그룹 셀렉터(실 목록)·그룹 등록·Excel ⬆⬇ 실배선 — 하드코딩 'KOF' 제거, 그룹 기반 로드/타이틀 (브라우저 검증)

### C3. 분석 대시보드 (누적 데이터 활용) — 🔶 **1차 완료 (v13.26)**
- [x] Run 통계 (실행 수·성공률·평균 소요) — `GET /erp/analytics` + Dashboard 분석 패널 (라이브 65 Run·성공률 100%·평균 3.2s 실측)
- [x] 원가 3분류 집계·추이 — cst_calc 누적(재료비·제조비·직접경비) 막대 + 최근 8 Run 추이 데이터
- [ ] 잔여: 월별 매출/기여마진 추이(수주 데이터=D1 선행) · PCR 보고서 PDF(RPT-07, 고객 양식 전 표준 양식)

### C4. 알림·이벤트 고도화 — 🏁 **완료 (v13.34)**
- [x] 지연 이벤트 자동 에스컬레이션 — `POST /erp/events/escalate-overdue`(기한 초과 미처리→ADMIN 상위 보고, `data.autoEscalated` **멱등**). E2E: 3건 에스컬·재실행 0건. JOB-05 실구현(스케줄러/수동 재실행 안전)
- [x] 알림 우선순위 파생(ESCALATION/DEADLINE_WARN=HIGH)·정렬(미읽음→우선순위→최신)·`?type=` 유형 필터 + `GET /notifications/digest`(미읽음 유형별·긴급·지연 요약) + NotificationBell 요약 라인·유형 셀렉터·긴급(!) 칩

### 트랙 2 — 운영 준비 (production readiness)

### C5. 백엔드 단위 테스트 체계 — 🔶 **1차 완료 (v13.36)**
- [x] pytest 유닛 — `backend/tests/test_macro_engine.py` **31케이스**(산술·비교·IF/IFERROR·AND/OR/NOT·SUM계열·Var 기본값·PreC·Table 단일/범위/별칭·오류: 미정의변수/0나눔/미지알집계). **DB 불요**(mock table resolver, live_s3 값과 정합) + pytest.ini·requirements-dev
- [x] GitHub Actions `backend-unit` 잡 추가 — 라이브 서버·DB 불요(macro_engine 무거운 의존성 0). **CI 실행 success 확인**
- [ ] 잔여: DB 필요 로직(승인 전이·창고 계층)은 services:postgres 잡으로 후속 · 커버리지 리포트

### C6. 스키마 마이그레이션 정식화 — 🏁 **완료 (v13.38)**
- [x] alembic 도입 — `backend/alembic/`: `0001_base`(54T edim_schema 번들, 문장별 실행)·`0002_dev_tables`(dev_requirement 이관). ORM 미사용(op.execute), env.py=DATABASE_URL→`+psycopg`
- [x] 시드는 데이터만 — `_ensure_dev_table` 호출 제거(마이그레이션 0002 소유)
- [x] **자동 베이스라인**(라이브 안전): 앱 기동 `_migrate()` — 핵심 테이블 존재+alembic 미도입 → base 재실행 없이 `stamp head`, 신규 DB → `upgrade head`. **라이브 검증: alembic_version=0002·57테이블·데이터(product_code 19·cpq_run 65) 무손상·API 정상**
- 배포 편입=앱 기동 시 자동 적용(모든 배포 방식 유효), non-fatal(데모 부팅 유지). ※autodeploy 가 requirements 변경 시 백엔드 이미지 강제 재빌드하도록 개선 필요 → C7

### C7. 무중단 배포 + 환경 분리 — 🔶 **1차 완료 (v13.40~41)**
- [x] health-gate + 자동 롤백 — `tools/edim-autodeploy.sh`(버전관리): 백엔드 이미지 빌드(다운타임 아님)→정적 먼저 rsync→백엔드 `--force-recreate --remove-orphans`(stale 충돌 해소)→**/health db:true 확인 후에만 "deploy done"**, 헬스 타임아웃 시 이전 커밋 reset+재빌드 롤백. **라이브 실증: `deploy done: 1ba89a0 (healthy)`**
- [x] staging/prod 프로파일 — `EDIM_DEV_MODE` env 게이트(GET /config devMode). dev 서버=1(요구사항 접수 노출), **prod=미설정(미노출)**. force-recreate 가 env_file 보존 확인
- [x] 배포 중 스위트 충돌 방지 — `live_all.py` `wait_ready()`(/health 연속 2회 OK) 시작 전 확인 (SKIP_WAIT=1 생략)
- 잔여: 완전 무중단(blue-green 2-슬롯)은 단일 서버 특성상 후속 — 현재 health-gate+정적 우선+nginx JSON 503 폴백으로 사용자 영향 최소화

### C8. 관측성·복구 — 🏁 **완료 (v13.43~46)**
- [x] 구조화 요청 로깅 — `observability.py` 미들웨어: traceId(8자)·method·path·status·latencyMs JSON(stderr `print(flush)` — uvicorn 런타임 스트림 캡처 우회) + `X-Trace-Id` 응답 헤더. **5xx & 개발모드 → dev_requirement 자동 접수(BUG, 중복 방지)**. 라이브 로그 실증
- [x] `GET /api/v1/metrics` — 요청 수·5xx/4xx·오류율·지연 avg/p95·상태별 (인메모리, INF-07 간이 지표). 라이브 검증(요청 카운트 증가)
- [x] 백업 복구 리허설 — `tools/edim-restore-rehearsal.sh`: 최신 덤프→임시 DB 복원→스모크(테이블≥50·테넌트≥1·코드≥1)→정리, 실 DB 무영향. **라이브 실행: REHEARSAL OK (tables=56·tenants=2·codes=19)**

### 트랙 3 — 외부 의존 활성화 준비

### C9. AI 활성화 시나리오 (ANTHROPIC_API_KEY 입력 즉시)
- [ ] 키 설정 시 스모크 스위트 — ai/macro-generate·ui-suggest live 검증 (샘플 모드와 분기)
- [ ] ai/chat 구현 (스펙 후속 op) — Toolbox 우측 Q&A 패널 (사내 데이터 컨텍스트: 코드/Table 요약 주입)

### C10. 성능·보안 심화 — 🔶 **1차 완료 (v13.48~49)**
- [x] 부하 기준선 — `tests/load_baseline.py`(BOM 전개 동시 5, 표준 라이브러리). **라이브 실측: 50/50 성공·47 req/s·avg 105ms·p95 125ms**(REQ-N BOM 30s 목표 대비 여유)
- [x] authz 전수 스윕 자동화 — `tests/live_c10_authz_sweep.py`: 라우터에서 SETUP/ADMIN write **89개 자동 도출**→GENERAL 403·무토큰 401 전수. **라이브 PASS 89/89** (b15 고정 10개 대비 대폭 확대) + live_all 회귀 편입
- [x] 로그인 레이트리밋 — 60s/30회 초과 429(계정 잠금 5회가 1차 방어, 2차 속도 제한). 라이브 검증
- [x] 부수: autodeploy 견고화 — `git pull`→`reset --hard origin/master`(dirty-tree 배포 실패 방지, C7 보강)
- 잔여: 업로드 요청 크기 상한(현행 확장자·매직바이트 검증은 기구현) · Run 동시 부하 별도 측정

### 트랙 4 — 잔여 실데이터화·품질 그물 확장 (2026-07-10 재감사 발견분)

### C11. 셸·상세 화면 잔여 실데이터화 — 🏁 **전량 해소 (G1~G3·F1·v13.25)**
- [x] 상태바 "승인 대기 4" 하드코딩 → 승인함 실카운트 (G1, v13.14)
- [x] 타이틀바 "Micron #7 (Pre-Sales)" 컨텍스트 → 활성 프로젝트 (F1)
- [x] 문서 상세 승인 요청 → doc_control 상태 전이 영속 (G3-a, v13.19)
- [x] M-14-6 감사 로그 박스 → GET /history 실데이터·계정 작업 시 갱신 (v13.25)
- [x] 부품 상세 → 치수·Work Process 실데이터 (G3-b, v13.21)
- [x] C-1 캔버스 "전체 47" → 실 블록 수 (G2, v13.16). ※AHU_BLOCKS 캔버스 geometry 는 좌표 부재로 잔여(별도)

### C12. i18n 완전판 + 체커 확장 — 🏁 **완료 (v13.28~29)**
- [x] **gen_i18n_bundles.py 원천 수렴** — 이름 아닌 **형태 기반(AST) 판별**로 모든 번역 사전 수렴(UI_TRANSLATIONS*·TAB_LABELS_V14 등). **707→775키**(인라인 시드 키 유실 해소, 단일 진실 보장)
- [x] check_i18n_en 24→**34화면** 확장(B13~B19 포함) + 운영 로그인 진입 수정 → **라이브 34화면 EN 한글 잔존 0 PASS** (신규 화면 t() 라벨 이미 적용 확인)
- [x] e2e_fallback 신규 화면 10종 스모크 커버(렌더·콘솔에러 0)
- 신규 화면 라벨 t() 는 이미 적용 상태(체커 34/34 통과가 증명) — 별도 시드 키 추가 불요

### C13. 문서 파이프라인 개선 (감사 권고) — 🔶 **1차 완료 (v13.52)**
- [x] FVT 확정 판정 freeze — `make_fvt_xlsx.py` 가 재생성 전 기존 판정·확인자·결함번호(기능/비기능)를 ID 기준 보존. **검증: SYS-001 P·홍길동 기입→재생성→보존**(freeze 로그)
- [x] 포털 항목 해시/버전 — `make_docs_portal.py` 파일별 sha256 8자 표기(변경 감지, 38파일). tooltip "내용 해시"
- [ ] RTM C-단계 확장 — RTM 은 REQ-F 중심 추적 모델이라 C-배치(구현 증분)는 본 문서(미구현목록)가 추적. 형식 확장 대신 규칙 명문화로 갈음

---

## A-4. 4차 백로그 — 도메인 확장 (2026-07-10 계획, 업무 사이클 완결) — 🏁 **D1~D10 핵심 완료 (v13.65, 2026-07-12)**

> ✅ 진행 현황: D1 수주 · D2 재고 · D3 작업지시 · D4 검사·품질 · D5 설계변경(ECO/ECN) · D6 원가실적 · D7 일정·마일스톤 · D8 승인함 일괄처리 · D9 접근통제 심화 · D10 Head 메뉴 — **10개 배치 전부 핵심 고리 완료**(각 alembic 0003~0010 증분 마이그레이션 라이브 자동적용·E2E 검증). 각 배치의 [ ] 잔여 항목은 심화/부가 성격.

> 관점 전환: 화면·테이블 공백이 아니라 **업무 흐름의 끊긴 고리**. 현재 시스템은 "견적을 잘 만들고 설계를 잘 관리"하지만 — 견적이 수주가 되지 않고, 발주가 재고가 되지 않고, 설계 변경이 공식 절차 없이 Rev 만 오르고, 품질 규칙이 실제 검사 기록으로 이어지지 않는다. D1~D10 이 영업→설계→구매→생산→품질→정산의 사이클을 닫는다.
> ⚠️ 스키마 확장 필요 배치(D2·D4·D5·D6·D7)는 **C6(alembic) 선행** — 54-테이블 설계는 base revision 으로 보존하고 증분 마이그레이션으로 확장.

### D1. 수주 관리 (Sales Order) — 견적이 매출이 되는 고리 — 🏁 **완료 (v13.54)**
- [x] 견적 lifecycle 전이 — `PATCH /cost/quotations/{id}/status` DRAFT→SENT→ORDERED/LOST(유효 전이만 409). ORDERED = 계약금액·수주일·예상납기(**alembic 0003** 컬럼, C6 증분 마이그레이션 라이브 실증: 0002→0003 startup upgrade) + **프로젝트 영업단계 CONTRACT 자동 전이**
- [x] 수주 잔고 화면 — `GET /cost/orders`(ORDERED 견적·프로젝트별 계약·납기·단계) + 수주율(견적 대비)·총 수주액 KPI. 신규 화면 `수주 관리 (D-1)` (ERP>Sales). **E2E: SENT→ORDERED→409·수주율 100%·프로젝트 CONTRACT 전이 검증 + 브라우저 렌더**
> ※D1 이 C6 alembic 의 **증분 마이그레이션 경로(baseline stamp 이후 upgrade)**를 라이브에서 최초 실증 — 이후 D2·D4~D7 스키마 확장의 안전 경로 확보.
- [ ] 수주 시 프로젝트 영업 단계 자동 전이 + 후속 이벤트 생성 (설계 착수 TODO)

### D2. 입고·재고 관리 (MI) — 발주가 재고가 되는 고리 — 🔶 **핵심 완료 (v13.56)**
- [x] 재고 원장 — **alembic 0004**(inv_stock 품목×위치 수량·inv_movement 입출고이력, C6 2번째 증분 마이그레이션 라이브 자동적용 0003→0004). erp_warehouse 위치명 조인. 시드 v26 데모 2건
- [x] 입고 처리 — `POST /erp/stock/inbound`(PO→MI: inv_movement IN + inv_stock upsert) + `GET /erp/stock`·`/stock/movements`. **E2E: FDV-480 +5 입고→재고 5·이력 IN 기록**
- [x] Stock Check 실재고 기반화 — `pr-items` 가 mock stockOk → **inv_stock 실보유량 판정**(onHand≥소요). **E2E: EWT-3 보유5≥소요1 True·KDC-1 보유2<소요4 False·입고 후 FDV-480 False→True 전환**. 신규 화면 `재고 관리 (D-2)`(ERP>Purchasing)
- [ ] 잔여: 재고 단가(STOCK) 자동 적재 연계 · Mobile '입고처리' 실배선(프리뷰→QR I-006)

### D3. 작업지시 (Work Order) — 설계가 제작으로 넘어가는 고리 — 🏁 **완료 (v13.58)**
- [x] 작업지시 발행 — **alembic 0005**(erp_work_order: 도면·프로젝트·조립순서·담당·상태, C6 3번째 증분 마이그레이션 라이브 자동적용 0004→0005). `POST /erp/work-orders`(WO-{seq} 채번, ISSUED) + `GET /erp/work-orders`. 설계 패키지(도면·BOM·공정)→제작 지시
- [x] 작업지시 상태 (발행→착수→완료) — `PATCH /erp/work-orders/{no}/status` ISSUED→STARTED→DONE(유효 전이만, 그 외 409) + **완료 시 생산 관리자(ADMIN/PLATFORM) 알림**(sys_notification, 부서 후속 고리). 신규 화면 `작업지시 (D-3)`(ERP>Production). **E2E: WO-0001 발행→STARTED→DONE·DONE→STARTED 409·완료 알림 2건 생성 + 마이그레이션 0004→0005 라이브 자동적용 검증**

### D4. 검사·품질 기록 — 규칙이 판정이 되는 고리 — 🔶 **핵심 완료 (v13.59)**
- [x] 검사 기록 — **alembic 0006**(qc_inspection: 유형·참조·품목·판정·측정값, C6 4번째 증분 마이그레이션 라이브 자동적용 0005→0006). `POST /qc/inspections`(수입·공정·출하, 합/부/조건부·측정값, QC-{seq} 채번, 판정/유형 422 검증) + `GET /qc/inspections`(결과·유형 필터). 신규 화면 `검사·품질 (D-4)`(ERP>Production)
- [x] 불합격·조건부 → 이상 고리 — **불합격/조건부 판정 시 품질 관리자(ADMIN/PLATFORM) 알림**(sys_notification). **E2E: QC-0001 FAIL·QC-0002 CONDITIONAL 알림 2건씩·QC-0003 PASS 무알림·판정 오류 422·result=FAIL 필터 1건 + 마이그레이션 0005→0006 라이브 자동적용 검증**
- [x] QC 성적서 PDF (v13.74) — `GET /qc/certificate.pdf`(검사 이력 기반, refNo/item/result 필터, 종합 판정·합격/조건부/불합격 집계·측정 근거, **인증서 요구 PO(ERP-017 certRequired) 연계 표기**, render/pdf 재사용). 검사·품질 화면 성적서 PDF 버튼. **E2E: cert PO 연계 34KB·result=FAIL 31KB 유효 PDF·미매치 404 라이브 검증**
- [x] 이상 이벤트 승격 (v13.75) — 불합격/조건부 검사 등록 시 **sys_anomaly 자동 승격**(HIGH/MED). D4/D6/D7 공통 이상 통합의 일부(아래 통합 항목)
- [x] dwg_verification 규칙 자동 판정 (v13.80) — `POST /drawings/{no}/verify`: 측정값을 활성 규칙 Macro(Evaluator)로 평가 → **규칙별 합/부 + 합격/불합격 제안**(값≠0=통과·오류=위반+경고). Quality 화면 자동 판정 버튼(F9). **E2E: {A:800}→합격 2/2(B=856·K=1296)·측정값 결측→불합격+경고·미규칙 도면 404 라이브 검증**

### D5. 설계 변경 관리 (ECO/ECN) — Rev-up 을 공식 절차로 — 🔶 **핵심 완료 (v13.60)**
- [x] 변경 요청(ECR) — **alembic 0007**(eco_change: 대상유형·영향분석 jsonb·상태·Rev 이력, C6 5번째 증분 마이그레이션 라이브 자동적용 0006→0007). `POST /eco/changes`(ECO-{seq} 채번, 대상유형 422 검증) + **영향 분석 자동 첨부** — CODE=Where-Used 역참조(code_relationship), DRAWING=현재 Rev·개정 이력. `GET /eco/changes`·`/eco/changes/{no}`(상세+영향)
- [x] 변경 승인(ECO) — **기존 승인함(sys_approval_request) 재사용** 단계 승인(승인함에 '설계변경' 자산유형 표기) → `decide()` 확장: 승인 시 eco_change APPLIED + **대상 도면 Rev-up 자동 적용**(dwg_revision + current_rev 증가 + REV_UP 이력, rev_from→rev_to 기록)
- [x] 변경 통지(ECN) — 승인 적용 시 **영향 부서(SETUP/ADMIN) 알림**(설계변경 통지 + Rev 전이 명시). 신규 화면 `설계 변경 ECO/ECN (D-5)`(PLM). **E2E: ECO-0001(도면 KDCR 3-13) 영향 자동첨부→승인함 승인→Rev B→C 자동 적용·ECN 통지·상태 APPLIED · ECO-0002(코드) 반려→REJECTED · 대상유형 422 + 마이그레이션 0006→0007 라이브 자동적용 검증** (검증 후 KDCR 3-13 Rev B 복원)
- [x] Supersedure 자동 연계 (v13.78) — ECO(도면)에 `newDrawingNo` 지정 시 승인 후 Rev-up 대신 **dwg_supersedure(구→신 도면 대체) 자동 등록**(SUPERSEDE 이력·ECN 표기, old UNIQUE·old≠new 제약 준수). ECR 등록 시 대체 도면 프롬프트. **E2E: KDCR 3-13→KDCR 3-12 대체 ECR→승인→supersedure 자동 등록·Rev-up 없음(rev null)·KDCR 3-13 Rev B 유지 라이브 검증**
- [ ] 잔여: Table 영향도(B20) 영향 분석 합산 · 변경 이력 대장 전용 뷰

### D6. 원가 실적 — 추정이 실적으로 검증되는 고리 — 🔶 **핵심 완료 (v13.61)**
- [x] 구매 실적 적재 — **alembic 0008**(cst_actual: 분류·품목·PO·수량·단가·금액, C6 6번째 증분 마이그레이션 라이브 자동적용 0007→0008). `POST /cost/actuals`(PO 확정 단가→실적 원가, 분류 3종 재료/제조/직접, cst_calc 추정과 **분리 기록**, 분류·수량 422 검증) + `GET /cost/actuals`
- [x] 견적 vs 실적 차이 분석 — `GET /cost/variance`: 추정(최근 SUCCESS Run `cst_calc` 분류 합계, `_latest_cost_base` 재사용) vs 실적(cst_actual 분류 합계) → 분류별 추정/실적/차이/차이율 + 총계. 신규 화면 `원가 실적·차이분석 (D-6)`(ERP>Finance)
- [x] 차이율 경보 — 실적이 추정 대비 **+10% 초과 시 경보**(분류별·총계 alert 플래그, 화면 Chip·⚠). **E2E: 추정 run 65 재료비 8.89M 대비 실적 11.12M(+25%)→경보·총 +14.7%→경보·제조비 -77.3%/직접비 -100% 정상·분류/수량 422 + 마이그레이션 0007→0008 라이브 자동적용 검증**
- [x] 차이 경보 이상 이벤트 승격 (v13.75) — `POST /anomalies/scan` 이 원가 차이경보(분류별 +임계 초과)를 sys_anomaly(COST)로 승격
- [ ] 잔여: 프로젝트별 실적 귀속(project_id 연계) · 실적→PCR 반영 재계산 · C3 Dashboard 차이 위젯

### D7. 프로젝트 일정·마일스톤 — 🔶 **핵심 완료 (v13.62)**
- [x] 단계별 납기 마일스톤 — **alembic 0009**(prj_milestone: 단계·계획일·실제일·상태, project×stage UNIQUE, C6 7번째 증분 마이그레이션 라이브 자동적용 0008→0009). `POST /erp/milestones`(수주→설계→구매→제작→출하, upsert, 단계 422·프로젝트 404 검증) + `PATCH /erp/milestones/{id}/done`(진척) + `GET /erp/milestones`(단계 순 정렬). 신규 화면 `일정·마일스톤 (D-7)`(ERP>Sales, 진척 바 롤업)
- [x] 지연 임박/초과 자동 판정 — 조회 시 서버 계산(실제일≥DONE, 계획일<오늘=OVERDUE 지연, D-7 이내=DUE_SOON 임박, 그 외 PENDING) + 잔여 일수. **E2E: 수주 2026-06-01→OVERDUE(-41일)·설계 07-15→DUE_SOON(D-3)·구매 09-01→PENDING(51일)·완료 처리→진척 33%·단계 422·프로젝트 404·stage upsert(재등록 시 개수 유지)**
- [x] Dashboard 일정 현황 요약 — `GET /erp/milestones/summary`(프로젝트별 total/done/overdue/dueSoon/진척% 롤업 + 총 지연·임박 카운트). **마이그레이션 0008→0009 라이브 자동적용 검증**
- [x] 지연 이상 이벤트 승격 (v13.75) — `POST /anomalies/scan` 이 계획일 초과·미완 마일스톤을 sys_anomaly(MILESTONE)로 승격
- [x] 마일스톤 자동 시딩 (v13.77) — 수주(ORDERED) 전이 시 **표준 5단계(수주→설계→구매→제작→출하) 자동 생성**(간격 0/14/30/50/70일, expectedDelivery=출하 계획일, 기존 단계 ON CONFLICT 보존). D1→D7 고리. **E2E: ORDERED 전이→PS-598 5단계 시딩·출하=2026-12-31(납기)·수주 DUE_SOON 라이브 검증**
- [x] C4 에스컬레이션 규칙 연계 (v13.79) — `POST /anomalies/escalate`: 미처리(OPEN) HIGH 또는 임계(3일) 방치 이상을 관리자(ADMIN/PLATFORM) **ESCALATION 통지**(detail.escalated 재통지 방지). 이상 화면 에스컬레이션 버튼. **E2E: HIGH 1건 에스컬레이션·MED 제외·재실행 0(dedup)·관리자 알림 생성 라이브 검증**

> ⚑ **이상 이벤트 통합 (D4/D6/D7 승격, v13.75)** — **alembic 0011**(sys_anomaly: source QC/COST/MILESTONE, severity, dedup_key, OPEN→ACK→RESOLVED). QC 불합격 자동 승격 + `POST /anomalies/scan`(원가 차이·마일스톤 지연 dedup 승격) + `GET /anomalies`(상태/출처 필터·요약)·`PATCH status`. 신규 화면 `이상 이벤트 (M-14-4A)`(ERP). **E2E: QC 자동승격·scan 2건(COST+MILESTONE)·재스캔 dedup 0·3출처 통합·OPEN→ACK→RESOLVED·RESOLVED→ACK 409·마이그레이션 0010→0011 라이브 검증**

### D8. 생산성 UX 팩 — 매일 쓰는 손맛 — 🏁 **완료 (v13.63~v13.86)**
- [x] 승인함 일괄 승인/반려 (다중 선택) — `decide()` 핵심 로직 헬퍼 추출(`_apply_decision`, 단건·배치 공용) + `POST /approvals/decide-batch`(다중 처리, 이미 결정 건 자동 건너뜀, 일괄 반려 코멘트 필수, 최대 200건). 승인함 화면 다중 선택(행 체크박스·헤더 전체선택)·일괄 승인/반려 버튼(Test 미통과 Macro 자동 제외). **E2E: 2건 일괄 승인·이미 결정 건 skip·반려 코멘트 422·빈 목록 422·1건 반려·인박스 잔여 0**
- [x] 주요 그리드 XLSX export 전면 (v13.72) — `/prices·/parts·/drawings·/erp/warehouses·/companies·/history export.xlsx`(openpyxl, X-Row-Count 헤더) + 각 대장 화면 `⬇ XLSX` 버튼·감사 로그 export(xlsxService 공용). BOM·코드그룹·데이터테이블에 이어 6개 그리드 확대. **E2E: 6개 엔드포인트 200·유효 xlsx(PK)·행수(단가12·부품4·도면2·창고7·거래처6·감사1000) 라이브 검증**
- [ ] 그리드 다중 선택 일괄 작업 패턴 확장 (삭제·상태 변경 등 승인함 외 그리드) + 확인 다이얼로그
- [x] 사용자별 화면 즐겨찾기 (v13.82) — **alembic 0012**(sys_user_pref key-value jsonb) + `GET/PUT /prefs/{key}`(본인 범위). Shell 툴바 ★ 즐겨찾기 토글·즐겨찾기 칩(서버 저장·재로그인 유지). **E2E: PUT/GET favorites 왕복·마이그레이션 0011→0012 라이브 검증**
- [x] 사이드 패널 전체 세로 스크롤 (v13.83) — Design Editor 등 사이드 패널의 섹션별 개별 스크롤 제거 → `.side-scroll`(박스 자연 높이 유지·내부 스크롤 제거)로 **전체 하나의 세로 스크롤** (사용자 요청)
- [x] 최근 항목 (v13.85) — activeTab 변경 시 최근 연 화면 기록(dedupe·최대 10, prefs `recent` 서버 영속) + 툴바 🕘 최근 드롭다운. **E2E: recent PUT/GET 왕복 검증**
- [x] 그리드 컬럼 표시 설정 저장 (v13.86) — DenseGrid `prefKey` 옵션(컬럼 ⚙ 표시/숨김 토글 + prefs `gridColumns[prefKey]` 서버 영속) + 부품·도면·단가·거래처·감사 대장 배선. **E2E: gridColumns PUT/GET 왕복 검증**. → **D8 생산성 UX 전체 완료**

### D9. 접근 통제·데이터 보호 심화 — 🔶 **핵심 완료 (v13.64)**
- [x] 문서 Grade 열람 enforcement — `GET /documents/{no}/render.pdf` 등급 통제(S-1=ADMIN+, S-2=SETUP+) 미달 레벨 **403 차단 + READ_DENY 거부 감사**(워터마크 위 실효 통제). 문서함 미리보기 🔒 마스킹. **E2E: S-1 ADMIN200/SETUP403/GENERAL403 · S-2 200/200/403 · S-3 200/200/200 (전 등급×레벨 매트릭스 라이브 검증)**
- [x] 동시 편집 보호 — 낙관적 잠금(optimistic lock): `GET /projects/{no}` 가 `updatedAt` 버전 토큰 반환 → `PATCH` 에 `baseUpdatedAt` 전달, 조회 이후 타인이 먼저 수정 시 **409 + 재조회 안내**. 프로젝트 화면 저장에 배선(충돌 시 자동 재조회·최신 반영). **E2E: v0 저장 200·stale v0 재저장 409·재조회 후 200·토큰 미전달 하위호환 200**
- [x] 전용 감사 조회 화면 (v13.73) — `GET /audit`(기간/사용자/작업/대상 필터 + facet, ADMIN 게이트) + `/history/export.xlsx` 동일 필터 확장. 신규 화면 `감사 조회 (M-14-6A)`(ERP>Company Info, M-14-6 분리 승격, before/after 상세·필터 XLSX export). **E2E: 전체 200건·action/user 필터 일치·GENERAL 403·필터 XLSX(action=APPROVED 54건) 라이브 검증**
- [x] optimistic lock 확대 (v13.76) — 부품 수정(`PUT /parts`)에 `baseUpdatedAt` 버전 토큰 적용(불일치 409 재조회) + `/parts` 목록 updatedAt 노출 + PartLedger 편집 배선. **E2E: v0 200·stale v0 409·fresh 200·토큰 미전달 하위호환 200(PRT-BRG-6210, 원복)**. 프로젝트(D9)에 이어 두 번째 도메인
- [ ] 잔여: optimistic lock 추가 도메인(단가/치수/Table 등) 확대 — 패턴 정착, 필요 화면에 순차 적용

### D10. Head 메뉴 편집 (SYS-019/020) — 🔶 **핵심 완료 (v13.65)**
- [x] 사용자별 모듈/메뉴 표시 구성 — **alembic 0010**(sys_menu_config: login×modules jsonb, C6 8번째 증분 마이그레이션 라이브 자동적용 0009→0010). `GET /menu/config`(본인 표시 모듈)·`/menu/modules`(구성 가능 목록)·`/menu/config/{login}`(ADMIN)·`PUT /menu/config/{login}`(ADMIN, 빈 목록=제한 해제, common 항상 표시, 모듈 422). Shell 이 표시 모듈로 헤더 필터 + 숨김 모듈 진입 시 이동. 사용자·권한 화면에 표시 모듈 패널. **E2E: kim01=[erp]→effective[erp,common]·본인 조회 반영·모듈 422·비관리자 PUT 403·미존재 404·제한 해제→전체 + 마이그레이션 0009→0010 라이브 자동적용 검증**
- [ ] 잔여: Head-Templet 연결(처리 Form head_key 매핑 관리) · 모듈 하위 메뉴(노드) 단위 세분 표시 제어

---

## A-5. 5차 백로그 — 브라우저 실사용 탐색 발견분 (2026-07-10, 라이브 33화면 순회 + 버튼 실클릭 프로브)

> 방법: 실서버에서 전 화면 순회(콘솔 에러 0·실패 요청 0 확인) + 의심 버튼 실클릭 → 상태바 반응 관측 + 스크린샷 육안 검수.
> 발견 유형: **무반응 버튼(silent no-op — 메시지조차 없음)** · placeholder 시각 요소 · 데이터 누적 관리 부재.

### E1. C-2 기술 데이터 완결 (실클릭 검증: 생성 칩·Add Item 무반응) — 🏁 **완료 (v13.69)**
- [x] 성능 곡선 실그래프 — placeholder 제거, **실 SVG 렌더**(후보 모델 Pt 정압 곡선 + 효율 보조 곡선·축·모델 라벨, **선정점 빨강 하이라이트**). rows 실데이터 기반, 조회 전 안내
- [x] 'Fan 성능표 (PDF) 생성' — `POST /render/pdf` 실렌더(선정점 + 후보 모델 Table 포함) → 새 창. **라이브: render/pdf 200·application/pdf·%PDF 20KB 검증**
- [x] '밀도 보정 계산서 생성' — 습공기 밀도 근사(TBX-011) → 정압 밀도 보정 → `POST /render/pdf` 실렌더 (C-3 Document Templet 연계)
- [x] '＋ Add Item' — Design Editor(code_relationship BOM 관리) 실화면 이동 (무반응 제거)
- [x] 'DWG View' 콤보 — 선정 Fan 도면 뷰(Design Editor·CAD) 실화면 이동 (무반응 제거)

### E2. Project Folder 일괄 작업 실배선 (3버튼 중 1무반응·2메시지-온리) — 🔶 **핵심 완료 (v13.67)**
- [x] '⬆ 업로드 (DWG)' — 파일 선택 → `POST /files/upload`(폴더별, MinIO + dwg_file) 실배선 완료 (Folder·프로젝트 화면)
- [x] 'ZIP 다운로드' — `GET /files/zip?project=&folder=`(폴더/전체 dwg_file 을 MinIO 에서 수집→ZIP 스트림, arcname 중복 회피, X-File-Count 헤더). 메시지-온리 제거·실다운로드. **E2E: DWG 64건·전체 195건 유효 ZIP(PK) 스트림·미존재 프로젝트 404**
- [x] '고객 전달용 내보내기' — `GET /files/export-package`(산출물 폴더 DWG/PRICE/DATA/BOM 만 ZIP + `전달목록.txt` 매니페스트, **내부 접수자료 RECEIVED 제외**). **E2E: 192건(전체 195 − RECEIVED 3) ZIP·전달목록 포함·RECEIVED 미포함 검증**
- [ ] 잔여: 파일별 CONFIDENTIAL 워터마크 실적용(현재 RECEIVED 제외·매니페스트 고지) · doc_control Grade 연계 필터

### E3. Run 산출물 누적 관리 (Folder 에 동일 파일 58건 누적 실측) — 🔶 **핵심 완료 (v13.66)**
- [x] Run 이력 화면 — `GET /cpq/runs`(전체 Run 목록: 상태·유형·일시·소요·산출물 수·참조/최신 보호 플래그) + `GET /cpq/runs/{id}/outputs`(산출물 드릴다운). 신규 화면 `Run 이력·정리 (E-3)`(Toolbox) — 현재 최신 Run 만 접근하던 제약 해소
- [x] 오래된 Run 정리 — `DELETE /cpq/runs/{id}`(**견적(PCR) 참조·최신 SUCCESS Run 409 보호**, 자식 cst_calc·cpq_output 동반 정리) + `POST /cpq/runs/cleanup`(보관 정책: 최근 N건 유지, 미참조 일괄 정리). **E2E: 65 Run 목록·drilldown·최신 삭제 409·keep-all cleanup 0건·throwaway FAILED Run DELETE 200 + 자식 cascade 0/0/0 검증(원본 65건 무손실)**
- [x] MinIO 객체 GC (v13.81) — `POST /files/gc`(ADMIN, dry-run 기본·apply 실삭제): dwg_file + dev_requirement_image 참조 집합 union 으로 미참조 orphan 판정(샘플 오브젝트 보호·prefix 한정 지원). Run 이력 화면 MinIO 정리 버튼(dry→확인→삭제). **E2E: 전체 198개 중 dev-req 정상 참조(orphan 3→1)·prefix 격리 업로드→orphan화→apply removed 1→0·GENERAL 403 라이브 검증**
- [ ] 잔여: Folder 최신 Rev 기본 필터 · 테스트/업무 Run 구분 표기

### E4. Dashboard 이벤트 진입성 (프로브: 부서별 Event 행 더블클릭 무반응 관측) — 🏁 **완료 (v13.70)**
- [x] '부서별 Event 상황' 행 더블클릭 = 부서 업무함(M-15-3) 진입 (이상 경고 그리드 더블클릭과 **동선 통일**, 커서·타이틀 힌트). 부서 집계 행은 특정 이벤트가 아니므로 부서 업무함으로 드릴
- [x] 이벤트 상세 '전후 공정' 실데이터화 — `GET /erp/events/{id}/flow`(erp_process_edge 선행/후행 공정명) 로 mock prev/next 대체. **E2E: Part List(선행 수주→후행 BOM)·BOM(선행 Part List→후행 발주 요청)·제작의뢰(선행 승인 도서·후행 없음)·미존재 404 라이브 검증**

### E5. Work Process CAD Mapping 실배선 (DWG-023 — 화면상 Impeller 박스 1개뿐) — 🏁 **완료 (v13.71)**
- [x] 공정 항목 ↔ 도면 블록 매핑 — 하드코딩 2블록 제거, **실 BOM rows(dwg_bom×erp_work_process)에서 항목별 블록 생성** + 그리드 행↔블록 **양방향 선택 하이라이트**(행 클릭→블록·블록 클릭→행). 선택 블록 라벨 표기
- [x] 2D/3D 토글 실동작 — 정적 텍스트 제거, 실 토글(2D=도면 블록 뷰·CAD, 3D=§C 범위 외 안내). 2D 전환 시 선택 항목 블록 하이라이트

> ⚑ **E-track(E1~E6) 전체 완료** — 5차 브라우저 프로브 발견분(무반응 버튼·placeholder·데이터 누적) 6개 배치 모두 실동작 전환/실데이터화.

### E6. 알림 보관함 — 🏁 **완료 (v13.68)**
- [x] 벨 드롭다운 활성/보관함 탭 + 빈 상태 안내 — `GET /notifications?unreadOnly=` 파라미터(활성=미읽음만·보관함=읽음 포함 최근 50건). 배지는 전체 미읽음(digest 기준). 빈 상태 안내("모두 확인했습니다"+보관함 이동 링크). **'모두 읽음' 후에도 보관함에서 지난 알림 조회 가능 — 소실 체감 해소**. **E2E: unreadOnly=true 미읽음만(read 제외)·보관함 read/unread 모두·digest.unread 검증**

---

## A-6. 6차 백로그 — 핸들러 대조 + 네트워크 관측 프로브 발견분 (2026-07-10)

> 방법: ① 프론트 전 화면 핸들러 정적 대조(onClick 부재·메시지-온리 setStatusMsg) ② 라이브 서버에서 의심 지점 실클릭하며 **비-GET API 호출 캡처** — "쓰기 0 = no-op 증거" ③ GENERAL 계정(kim01) 실로그인 RBAC UX 관측 ④ 서비스 계층 CRUD 매트릭스 대조(등록만 있고 수정 없음).
> 프로브는 데이터를 만들지 않음(전부 no-op·403·로컬-휘발 확인). 우선순위순 F1→F10.

### F1. 프로젝트 도메인 실체화 ✅ (v12.1, 2026-07-10)
현재 화면 전체가 상수 `PS-61313-5` 고정: 목록·신규 등록·채번 전부 없음 (projectService = get/setStage 뿐).
- [x] prj_project 목록 + 신규 등록 (PS 자동 채번 PS-613…) + 프로젝트 선택 → 컨텍스트 전환 — `GET/POST /projects` + 대장 그리드 + F2 등록 다이얼로그 (Client = com_company 자동 연결, PROJECT_CREATE 감사)
- [x] 접수 자료 업로드 실배선 — 파일 선택 → `POST /files/upload`(RECEIVED, created_by 기록) + 목록·다운로드 실데이터, 시드 v18 로 mock 접수자료 2건도 MinIO 실객체화 (백엔드 RECEIVED_FILES 상수 제거)
- [x] 타이틀바 활성 프로젝트 연계 — ShellContext activeProject(localStorage) · 대장 선택 = 타이틀바 표시 (C11 하드코딩 제거), `DELETE /projects/{no}` 보호(기술 제안 + 무참조만 409)
- [x] 테스트: tests/live_f1_project.py (채번·403/422/409·업로드 왕복·시드 실파일·UI 컨텍스트 — 자체 정리) + e2e_fallback 대장/honest-write 갱신 (54체크) + EN 잔존 0 유지

### F2. 사용자 등록·수정 완결 ✅ (v12.2, 2026-07-10)
- [x] '＋ 사용자 등록' 실배선 — 등록 다이얼로그(login 형식 검증·부서·이메일·레벨 GENERAL/SETUP/ADMIN·초기 비밀번호 4자+) + `POST /users`(중복 409·PLATFORM 금지 422) + USER_CREATE 감사, F2 키 연동 — 신규 계정 즉시 실로그인 가능 (라이브 검증)
- [x] 사용자 정보 수정 — '정보 수정' 다이얼로그 + `PATCH /users/{login}`(이름·부서·이메일, before/after USER_UPDATE 감사) · 목록에 email 노출
- [x] 보너스: `DELETE /users/{login}`(무참조 하드 삭제 — 사용 이력 409는 FK 상 필연, 비활성화 안내·본인 422·USER_DELETE 감사) · 검색/레벨 필터 실동작 · F8 실재조회 (메시지-온리 제거)
- [x] 테스트: tests/live_f2_users.py (등록→실로그인→PATCH→삭제 보호→UI 왕복, 정리=API+ssh psql) + e2e_fallback 55체크(등록 정직 거부) + EN 잔존 0

### F3. 권한 기반 UI 게이팅 ✅ (v12.4, 2026-07-10)
GENERAL(kim01) 실측: 모든 쓰기 버튼 노출·활성 → 다이얼로그 작성까지 진행 후 `POST /parts→403`. 서버 RBAC 은 정상, UI 만 무권한.
- [x] PermissionProvider — 로그인 시 `GET /auth/permissions` 소비, `canWrite(key)`=SETUP+ 전역 ∨ 매트릭스 WRITE (서버 min_level 규칙과 동일, mock 은 레벨 폴백) → **등록/쓰기 버튼 disabled + 사유 툴팁 13개 화면** (단가·부품·문서·도면·창고·공급처·재질·Arrangement·Hierarchy·프로젝트·Variant·Quality·Templet) + F2 키 가드
- [x] 관리 화면: GENERAL 트리에서 '사용자·권한' 미표시 + 직접 진입(⌘K) 시 **403 안내 화면**(AccessDenied) — 데이터 fetch 도 skip · SETUP 은 읽기 허용 + ADMIN 전용 버튼(등록/정보수정/잠금해제/비활성/레벨)만 disabled
- [x] 승인함: 결정 권한 없으면 승인/반려 disabled + '읽기 전용' 칩 · **'내 요청' 뷰 실동작**(inbox 에 requesterLogin 추가 — 하드코딩 (2)·위임(1) mock 제거) · 빈 상태 안내
- [x] 테스트: tests/live_f3_rbac_ui.py (GENERAL 숨김/403/disabled·SETUP 부분 허용·ADMIN 과차단 회귀 — f3.* psql 정리) + 폴백 55체크·EN 잔존 0 · mock 로그인 레벨 ADMIN 정합(시드 v4 와 동일)

### F4. 잔존 무반응·메시지-온리 일소 ✅ (v12.5, 2026-07-11)
전부 라이브 네트워크 관측으로 확인 (클릭 시 쓰기 호출 0):
- [x] S-1-4 Code Relationship '승인 요청' 실배선 — POST /approvals `targetCode` 확장(코드 문자열→id 해석) + **승인 시 mother 관계 세트 APPROVED 전이**(decide 분기) + 승인함 유형 '관계' (중복 409 — 라이브 검증)
- [x] S-1-1: '저장 F12' = 실등록 경로(requestApproval, 검증 게이트) · '＋ 값 추가' = 구분자 추가+포커스 · '조회'/F8 = 실재조회 (code_item)
- [x] M-3-7: '✎ 편집' = 선택 행 인라인 에디터 · '⬆ Export' = **GET /tables/{name}/export.xlsx** 실다운로드 (D8 XLSX 트랙 1호)
- [x] S-3-4 Print Set-up: 캔버스 = 상태 기반 위젯 목록 — '기본 양식 배치'(6위젯 리셋)·'Data 호출'/'그래프 불러오기'(위젯 추가)·'Data 위치 지정'(선택 위젯 경로 바인딩 다이얼로그, **배치가 Print Test/렌더 라인을 실결정**)·Printer(실렌더 새 창)·PDF(실렌더 다운로드)·**Office = 정직 disabled**(P4-1 고객 양식 대기 툴팁)
- [x] 코드 상세 'Variants'(→Design Editor)·'Referencers'(→Where-Used 판넬 스크롤+실카운트) 실배선 — 셸 툴바와 동선 통일
- [x] M-5-4 문서함 F8 = 실재조회 (docService.list)
- [x] 셸 툴바 'Referencers' = **활성 코드 상세 탭 컨텍스트** (없으면 시드 데모 코드 폴백) · Variants 하드코딩 수치(C=45·E=320) 문구 제거
- [x] 테스트: tests/live_f4_noop.py (관계 승인→전이 psql 검증·Export XLSX 파싱·위젯 배치/바인딩·PDF 다운로드·컨텍스트 — 데이터 무생성) + 폴백 55·EN 잔존 0

### F5. 마스터 데이터 수정·정정 전면 ✅ (v12.6, 2026-07-11)
서비스 계층 실측: create 만 존재, update 부재. 잘못 입력하면 정정 불가(재등록도 중복 409).
- [x] 공급처(M-14-2): 행 더블클릭 = 수정 다이얼로그 (`PUT /companies/{id}` — 중복명 409·COMPANY_UPDATE 감사, 목록에 companyId·remarks 노출) — 비활성 플래그는 스키마 확장 대상(D 트랙)으로 유형·평가로 갈음
- [x] 부품(M-4-7): '✎ 수정' + `PUT /parts/{no}` (재질/코드 검증 422·공급처 자동 생성·PART_UPDATE 감사)
- [x] 재질(M-3-2) 더블클릭 수정 · 검증 규칙(M-4-5) 수정/활성 토글(`PUT /verifications/{id}`) · Variant 값(S-1-2) 명칭 수정+**폐기(DEPRECATED)**(`PATCH /codes/values/{id}`)
- [x] 창고(M-8-4): '✎ 수정' + `PATCH /erp/warehouses/{code}` (개명·위험물·검사주기·비고 — code 불변)
- [x] 단가(M-12-5): '적용 종료' + `PATCH /prices/{id}` (validTo 마감 — 시작 이전 422, PRICE_CLOSE 감사, 목록 priceId 노출)
- [x] 문서 메타 수정 `PATCH /documents/{no}/meta` (제목·유형·Grade — **ACCEPTED 409 통제**) · Templet 삭제(시스템/RELEASED 409) · **Macro 삭제 = Studio F3 실배선**(치수식·검증·구성 join 참조 409)
- [x] Arrangement(M-4-2): 구성품 행 ✎ 수량 수정(0 이하 422)·✕ 삭제 (componentId 노출)
- [x] 공용 QuickEditDialog 도입 (수정 동선 표준) · 테스트: tests/live_f5_updates.py (11도메인 왕복·원복·보호 게이트) + 폴백 55·EN 잔존 0

### F6. 통합 검색 커버리지 확장 ✅ (v12.8, 2026-07-11)
라이브 실측: 'Impeller'(부품)·'공조'(공급처) → **결과 0** (드롭다운 자체 미표시), 'KDP' → 코드만.
- [x] GET /search 그룹 확장: 부품(prt_part)·공급처(com_company)·창고(erp_warehouse)·매크로(tbx_macro)·프로젝트(prj_project) + **사용자(sys_user — SETUP 이상만**, M-14-6 읽기 가드와 동일)
- [x] 그룹별 클릭 딥링크: 부품=부품 상세 탭 · 공급처=M-14-2 · 창고=M-8-4 · Macro=Studio · **프로젝트=활성 컨텍스트 전환+S-3-5** · 사용자=M-14-6 — 검색창 placeholder 확장 반영
- [x] 테스트: tests/live_f6_search.py (6그룹 동적 검증·GENERAL 사용자 미노출·딥링크 3종) + 폴백 55·EN 잔존 0

### F7. 이력 diff 뷰어 ✅ (v13.0, 2026-07-11)
- [x] diff 칩 실배선 — `GET /history` 에 historyId·before/after JSON 노출, 칩 클릭 = **비교 모달**(필드 union 테이블 · 변경 필드 red/green 하이라이트 · 일시/작업자/#id 푸터), 페이로드 없는 행(LOGIN_OK 등)·mock 행은 정직 안내
- [x] 테스트: tests/live_f7_diff.py (LEVEL_CHANGE 왕복으로 전후 페이로드 확보 → 모달·하이라이트·닫기·무페이로드 안내) + 폴백 55·EN 잔존 0

### F8. 그리드 정렬 ✅ (v13.1, 2026-07-11)
- [x] DenseGrid 공통 헤더 클릭 정렬 — asc→desc→해제 토글 + ▲▼ 표시·aria-sort. **원본 인덱스 보존**(rowKey/onRowClick/selectedKey 가 정렬과 무관 — index 선택 화면 안전, 선택 무결성 라이브 검증). 정렬값 = sortValue 옵션 > render 원시값 (JSX 칩·액션 열은 자동 제외, ko locale numeric 비교)
- [x] 대량 대장 서버 정렬 파라미터 — `/prices`·`/history`·`/documents` `?sort=&dir=` (화이트리스트 컬럼만 — 주입 무해 검증; UI 는 시드 볼륨에서 클라이언트 정렬 사용, 페이지네이션 도입 시(C 트랙) 전환)
- [x] 테스트: tests/live_f8_sort.py (서버 3종 + UI 토글·해제·선택 무결성·JSX 열 무해) + 폴백 55·EN 잔존 0

### F9. 다이얼로그 UX 표준 ✅ (v13.3, 2026-07-11)
- [x] **useEscapeClose 공용 훅** (capture 단계 — 화면 단축키로 전파 차단) 전면 적용: 등록 다이얼로그 전종(단가·문서·공급처·재질·Arrangement·도면·부품·창고·Hierarchy·프로젝트·사용자 등록/수정)·QuickEditDialog(F5 수정 전체)·PO 조건·PrintSetup 바인딩·이력 diff·요구사항 모달 — 도움말 다이얼로그는 기존 Escape 유지. 백드롭 클릭 닫기·초기 포커스(autoFocus)는 기구현 확인, 더티 시 확인은 소형 폼 특성상 미적용(명시)
- [x] 오버레이 시각 차단 — rgba(20,26,40,.35) 반투명 딤 기구현 확인 (프로브 당시 '투명' 표현은 과대 — 정정)
- [x] 테스트: tests/live_f9_escape.py (5종 다이얼로그 Escape 닫힘 + 무다이얼로그 Escape 무해) + 폴백 55·EN 잔존 0

### F10. 조회 UX 소품 ✅ (v13.4, 2026-07-11 — 🏁 6차 백로그 F1~F10 전체 완료)
- [x] MDI 탭 오버플로 — 탭 최소폭+말줄임(툴팁=전체 제목)·가로 스크롤·**▾ N 오버플로 목록**(클릭=활성·×=닫기)·활성 탭 자동 스크롤 (폭 압축 판독 불가 해소)
- [x] Dashboard KPI 카드 드릴다운 — 진행 Project→S-3-5 · 승인 대기→승인함 · 이번 달 수주→S-3-5(수주 관리는 D1 명기) · 이상 경고→부서 업무함
- [x] 승인함 자산 유형 체크박스 **실필터**(Code/도면/Macro/관계·문서·기타 — 기존 정적 ☑☐ 해소) + 대상·요청자 검색 input (일괄 결정은 D8 트랙)
- [x] 테스트: tests/live_f10_ux.py (탭 12종·오버플로 목록·KPI 2종·필터 왕복·검색) + 폴백 55·EN 잔존 0

---

## A-7. 7차 검증 — 실브라우저 읽기 전용 전수 프로브 (2026-07-11)

> 방법: Playwright(Chromium 실브라우저)로 **36 리프 화면 전수 순회**. 화면마다 모듈 라우트로 새로 진입(탭 누적 회피)해
> ① 콘솔 에러 ② 실패 GET(4xx/5xx) ③ 미구현 마커 텍스트("— 예정·MOCK·협의·고객 양식") ④ disabled 버튼+사유 ⑤ 첫 행 더블클릭 상세 동선을 관측.
> 별도로 버튼 실클릭 프로브도 시도(비-GET 네트워크 차단)했으나, 쓰기 차단이 앱 로딩 상태를 깨 순회를 방해 → 읽기 전용 방식이 정본.

**결론: 신규 미구현 기능 0건.** 36화면 전부 로드 성공, **콘솔 에러 0 · 실패 GET 0 · 미구현 마커 0**.
B1~F10(6차) 감사가 no-op·미구현을 이미 소진했음을 실브라우저로 재확인.

- **disabled 버튼은 전부 정직한 게이트** (미구현 아님): Print Set-up 'Office'=P4-1 고객 양식 대기(툴팁 명시) · 사용자·권한 5버튼=로그인 계정 권한 미달 시 'ADMIN 전용(SYS-005)' · ✎수정/폐기/승인요청 등=행 미선택 시 비활성(정상 UX).
- **더블클릭 '무반응'은 설계 정합** — 상세 드릴다운은 코드·문서·부품·이벤트·발주·단가 그리드 한정. 해당 화면(C-1·문서함·도면대장·발주 PR·PO·단가)은 정확히 '상세 탭' 진입 확인, 그 외 마스터 그리드 무반응은 스펙대로.

**관찰 1건 (기능 결함 아님 — 데이터 정합성) → ✅ 해소 (2026-07-11)**: 프로브 시점 라이브 DB의 데모 계정 `edim`이 **SETUP** 레벨이라 사용자·권한 화면 ADMIN 버튼이 정상 게이팅으로 비활성.
`seed_v4`(edim→ADMIN 승격)는 멱등(1회 실행)이라, 이후 라이브 RBAC 테스트/수동 조작이 edim 을 강등한 뒤 재승격되지 않은 것으로 추정.
[설치·배포 매뉴얼](EDIM_설치배포매뉴얼.md) §3.2·[관리자 가이드](EDIM_관리자가이드.md) 전제(edim=ADMIN)에 맞춰 **(a) 복원 선택** — 라이브 DB `UPDATE sys_user SET user_level='ADMIN'`(LEVEL_CHANGE 감사 기록) 적용, API 재검증(`userLevel:ADMIN`·`erp-access:WRITE`) 통과. 현재 ADMIN = `edim`·`park.f`.
> 재발 방지: ✅ 적용 (v13.11) — `edim_seed._seed_invariants` 가 버전 게이트 밖에서 매 기동 `edim=ADMIN` 재확정(레벨 상이 시에만 UPDATE+감사, 멱등). E2E 검증: 강등→백엔드 재기동→자동 복원(감사 `seed self-heal`) 확인.

---

## A-8. 8차 발견 — 코드/데이터 레이어 스캔 (2026-07-11)

> 방법: UI 표면(7차)이 아닌 **코드·데이터 레이어** 정적 스캔 — 백엔드 501/503/stub/TODO, 프론트 mock/하드코딩/no-op 핸들러, OpenAPI 후속 op 대조.
> 백엔드·프론트 모두 TODO/미구현 마커 0 (501=DWG ODA 대기, 503=정직한 인프라 오류, AI=키 대기 — 전부 문서화된 외부 의존). 아래 1건만 신규 실체.

### G1. 셸 크롬 카운트 하드코딩 (상태바 + LNAV To-Do 푸터)

`Shell.tsx` 크롬에 정적 숫자 3개가 실제 상태와 무관하게 고정 노출 (라이브 실측 대조):

| 위치 | 표시(하드코딩) | 실제 소스 | 실측 |
|---|---|---|---|
| 상태바 셀 (`Shell.tsx:521`) | `승인 대기 4` | `approvalService.inbox()` | 5 |
| LNAV To-Do (`:484`) | `승인 확인 1` | 동일 inbox 카운트 | 5 |
| LNAV To-Do (`:487`) | `PL 지연 1` | 부서 업무함 지연(erp_process_event 기한초과) | 미집계 |

- [x] 상태바 승인 대기 = `approvalService.inbox().length` 실카운트 — **C11 첫 항목 해소** ✅ (v13.14)
- [x] LNAV To-Do '승인 확인' = 동일 inbox 카운트 배선 ✅ (v13.14)
- [x] LNAV To-Do 'PL 지연' = 부서 이벤트 delayed 합(`erp/dashboard` 집계) ✅ (v13.14)
- 구현: `approvalService.request/decide` 성공 시 `edim-inbox-refresh` 전역 이벤트 → 셸이 초기+60s 폴링+이벤트 즉시 갱신. **라이브 검증: 상태바 5·To-Do 5·PL 지연 3 (하드코딩 4/1/1 제거 확인)**.

### G2. 하드코딩 프로젝트 컨텍스트 + C-1 캔버스 카운트 (2026-07-11 스캔)

F1 이 활성 프로젝트 컨텍스트(`useShell().activeProject`)와 실 프로젝트 대장을 도입했으나, 개별 화면의 프로젝트 콤보·캔버스 수치는 여전히 정적 리터럴:

| 위치 | 하드코딩 | 실 소스(기존재) |
|---|---|---|
| SelectionScreen·DocTemplate·ProjectFolder·Purchase 프로젝트 콤보 | `value="Micron #7"` options 2개, **onChange 미배선** | `useShell().activeProject` (F1) |
| DashboardScreen 프로젝트 콤보 | options `['Micron #7','PS-598','PS-612']` 고정 | `projectService.list()` (F1) |
| SelectionScreen (C-1) 캔버스 | `전체 47`(상태메시지·패널 리터럴) · `AHU_BLOCKS` 목 블록 | `arrangementService.components()` (B13) |

- [x] 프로젝트 콤보 4종(Selection·DocTemplate·ProjectFolder·Purchase) = `useShell().activeProject.name` 반영 ✅ (v13.16) · Dashboard 콤보 = `projectService.list()` 실옵션 ✅
- [x] C-1 캔버스 '전체 47' 매직넘버 → 실제 표시 블록 수(`AHU_BLOCKS.length`)로 정직화 ✅ (v13.16, 상태메시지·패널)
- [ ] **잔여(미완)**: C-1 캔버스 AHU_BLOCKS 자체를 arrangement_component 실블록으로 — `ArrangementComponent`(position·code·name·qty)에 **캔버스 좌표(x/y/w/h) 없음** → 배치 geometry 설계 선행 필요(M). C11 마지막 항목 중 이 부분만 잔존.

### G3. 상세/서브 화면의 mock 섹션 직접 렌더 (2026-07-11 mock-import 추적)

화면이 라이브에서도 mock 상수를 **직접 렌더**(fallback 아님) — 채워져 보이나 값이 가짜. G1/G2보다 오해 소지 큼. 실 엔드포인트는 대부분 기존재(배선만):

| 화면 | mock 직접 렌더 | 조치·판정 |
|---|---|---|
| **코드 상세** (CodeDetailScreen) | 단가 이력 섹션 = `PRICES` mock 필터(실fetch 없음) | ✅ **수정 (v13.18)** — `priceService.list()` 실단가로 배선(code 접두 매칭, mock 초기값 폴백) |
| **부품 상세** (PartDetailScreen) | `PART_INFO`·`DWG_DIMS`·`PROCESS_DEF` 전부 mock. BOM 만 실호출인데 `partService.bom('KDCR 3-13')` 코드 고정 | ✅ **수정 (v13.21)** — `GET /parts/detail?drawing=&block=`(도면 BOM 스코프 블록매칭→prt_part + 실 치수 dwg_dimension + 공정 erp_work_process 집계) + PartDetail 배선(real/mock 칩, drawing 컨텍스트). **E2E: Casing→PRT-CAS-900·공정 MAKE·치수 A=670/D==Table12(B,710) 실데이터, 공정 없는 부품은 null→MOCK 정직 폴백** |
| **문서 상세** (OutputDocScreen) | '승인 요청' = 로컬 `stageIdx+1` 만(영속 없음, **C11 항목**) · `DOC_HIST` mock | ✅ **수정 (v13.19)** — `POST /documents/register-output`(Run 산출물 doc_control find-or-create, 파일명 멱등) + OutputDoc 실 docNo·상태 전이 PATCH 배선. **E2E 검증: 등록→CHECK 전이→재진입 시 CHECK 유지**(C11 버그 해소). ※DOC_HIST 이력 표는 잔여 mock(경미) |
| **Work Process** (WorkProcessScreen) | 자재행 `MATERIAL_ROWS` mock·일부 행 JSX 하드코딩·코드 `KDCR 3-13` 고정 | ✅ **수정 (v13.23)** — `GET /erp/work-process/materials?code=`(도면 BOM 부품 + erp_work_process make/buy·창고·시간 조인) + WorkProcess **코드 셀렉터(실 도면)**·자재행 실로드·code 컨텍스트 저장. **E2E: 4부품 실데이터(Bearing/Shaft/Impeller/Casing·공급처 중원·효성), make/buy 부품별 영속(Impeller MAKE→BUY→반영 검증)** |

- 결론: **G3 4건 전량 해소** — 코드 상세 단가(v13.18)·문서 상세 승인 영속(v13.19)·부품 상세 집계(v13.21)·Work Process 자재행(v13.23). 신규 엔드포인트 3종(register-output·parts/detail·work-process/materials) + 화면 배선, 각 라이브/E2E 검증 완료.
- ※**EventDetail 전후공정 mock 은 B6 에서 시연용 의도 유지 — 제외**(설계 결정).

> 그 외 문서화된 미완 백로그(여전히 유효): **C1~C13**(제품 완결·운영 준비·품질 그물 — 3차) · **D1~D10**(수주→재고→작업지시→검사→ECO→원가실적→일정 업무 사이클 — 4차, D2·D4·D5·D6·D7 은 스키마 확장 필요→C6 alembic 선행) · **E1~E6**(5차 브라우저 발견분). 이들은 의도적 후순위(제품 심화·업무 사이클 확장)이며 외부 의존/스키마 확장에 물려 있음.

---

## B. 외부 의존 — 입력되는 즉시 처리

| 항목 | 대기 대상 | 준비 상태 |
|------|----------|----------|
| AI 실연동 (P4-2) | `ANTHROPIC_API_KEY` 1줄 | 코드 완료 — env 설정만 |
| DWG 지원 (P4-3) | ODA File Converter 라이선스 | 플러그블 완료 — 경로 env 만 |
| Excel 양식 전면 (P4-1) | 고객 양식 확정 | import 패턴 보유 |
| 외부 ERP 어댑터 (I-001) | 대상 ERP 확정 | 인터페이스 정의서 준비됨 |
| Digital Twin (I-002) | DTDesigner 스펙 | — |
| 보안 솔루션 (DOC-004) | DRM/워터마크 범위 협의 | Grade 워터마크는 B4 에서 자체 구현 |
| DUCT 고도화 | 사업 범위 확정 | v1 화면 존재 |
| Mobile 실앱 (P5) | 스펙 협의 | 프리뷰 + B11 실배선까지 자체 진행 |
| ERP 생산/MRP·외주 (ERP-025~030) | 기존 ERP 연계(INT-01) vs 자체 구현 경계 확정 | 상태기계·이벤트 흐름은 구현됨 |
| Process Set-up 규칙 컬럼 | 고객 협의 후 스키마 확장 | 화면 mock 보강 상태 (주석 표기) |
| 착수 문서 3종 (사업수행계획·위험관리대장·보안관리계획) | 본사업 착수 시점 | 템플릿 구조는 WBS·보안 구현에서 확보 |
| C-1 툴바 사용자 구성·모듈 실사 이미지 (CPQ-014/015) | 고객 이미지 자료·요건 | 고정 배치로 동작 중 |
| 업무용 SNS·Project 대화 (SYS-018) | 도입 여부 협의 | — |

## C. 명시적 제외 (구현 안 함)

- Jenkins UI 파이프라인 — systemd auto-deploy + GitHub Actions CI 로 대체 완료
- 3D/STEP/IFC 뷰어 — 프로토타입(edim-ai-blueprint 스튜디오) 경로 유지, EDIM 범위 외
- WebSocket 알림 — 60초 폴링으로 충분 (고객 요구 시 전환)

---

*진행 방법: "do next" → 다음 미체크 배치를 통째로 구현·검증·배포·체크. 이 파일이 단일 진실 원천.*
