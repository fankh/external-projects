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

> 1·2차가 기능 공백을 닫았다면 3차는 **솔루션 완성**: ① 제품 깊이(멀티 견적·분석·그룹 관리) ② 운영 준비(단위 테스트·마이그레이션·무중단 배포·관측성 — 2차 마감 중 직접 겪은 배포-재시작 503 창 제거 포함) ③ 외부 의존 활성화 준비. 순서대로 C1→C10, 각 배치 완결 기준(backend+frontend+tests+docs+deploy+verify) 동일.

### 트랙 1 — 제품 완결

### C1. CPQ 멀티 견적 체계 (스펙 후속 op 해소)
- [ ] cpq/selections CRUD — 프로젝트별 selection 생성/목록/삭제 (현재 시드 1건 고정 → C-1 에서 "견적안 저장/불러오기")
- [ ] selection finalize + x_code_status 심사 흐름 (x-code review — 비표준 코드 검토 마킹)
- [ ] Run 이 활성 selection 대상 실행 (runs?selectionId=) — Run 이력에 selection 표시
- [ ] spec_input JSONB 활용 — 사양 Excel Import 결과 selection 에 보존·복원

### C2. 코드 그룹 관리 + Excel 왕복
- [ ] codes/groups CRUD (S-1-1 상위: 그룹 등록·슬롯 정의 편집) + 그룹별 export-excel
- [ ] code_item 일괄 Excel Import (기존 import 패턴 재사용, 행 단위 거부 리포트)

### C3. 분석 대시보드 (누적 데이터 활용)
- [ ] 원가·마진 추이 — cst_calc/cst_pcr/cpq_run 누적 → 월별 매출/직접비/기여마진 차트 (M-14-4 확장 탭)
- [ ] PCR 보고서 PDF (RPT-07 완성 — 고객 양식 전 표준 양식)
- [ ] Run 통계 (실행 수·평균 소요·warn 비율) — 파이프라인 건강 지표

### C4. 알림·이벤트 고도화
- [ ] 지연 이벤트 자동 에스컬레이션 규칙 (기한 초과 시 스케줄 감지 — 폴링 주기 내 서버측 판정)
- [ ] 알림 우선순위·유형 필터 + 일일 다이제스트 (로그인 시 요약)

### 트랙 2 — 운영 준비 (production readiness)

### C5. 백엔드 단위 테스트 체계 (현재 E2E 만 존재)
- [ ] pytest + 로컬 PG(도커) — macro_engine 평가·승인 전이·문서 채번/전이·창고 계층 검증 등 순수 로직 유닛 커버
- [ ] GitHub Actions CI 에 backend job 추가 (라이브 서버 불요 — services: postgres)
- [ ] 커버리지 리포트 + 핵심 모듈 기준선

### C6. 스키마 마이그레이션 정식화
- [ ] alembic 도입 — 현행 DDL 을 base revision 으로, dev_requirement 등 운영 테이블 포함
- [ ] 시드는 데이터만 담당하도록 분리 (CREATE TABLE IF NOT EXISTS 제거)
- [ ] 마이그레이션 적용을 배포 스크립트에 편입 (업그레이드 실패 시 중단)

### C7. 무중단 배포 + 환경 분리 ← 2차 마감 중 실측된 503 창(빌드~재기동 수 분) 제거
- [ ] 배포 스크립트 health-gate: 새 컨테이너 기동·/health OK 후 전환 (compose 2-슬롯 or 재시도 프록시), 실패 시 롤백
- [ ] staging/prod 프로파일 분리 — EDIM_DEV_MODE off 검증 스위트(요구사항 접수 미노출 확인)
- [ ] 배포 중 라이브 스위트 충돌 방지 자동화 — deploy-done 대기 헬퍼를 스위트 러너에 내장

### C8. 관측성·복구
- [ ] 구조화 로깅(요청 ID·지연) + 에러 시 dev_requirement 자동 접수 옵션 (개발서버)
- [ ] 백업 복구 리허설 스크립트 — 덤프→복원→스모크 검증 자동화 (분기 1회 실행 규칙)
- [ ] 간이 메트릭 endpoint (/metrics — 요청 수·오류율·엔진 평가 시간)

### 트랙 3 — 외부 의존 활성화 준비

### C9. AI 활성화 시나리오 (ANTHROPIC_API_KEY 입력 즉시)
- [ ] 키 설정 시 스모크 스위트 — ai/macro-generate·ui-suggest live 검증 (샘플 모드와 분기)
- [ ] ai/chat 구현 (스펙 후속 op) — Toolbox 우측 Q&A 패널 (사내 데이터 컨텍스트: 코드/Table 요약 주입)

### C10. 성능·보안 심화
- [ ] 부하 스크립트 (locust/간이) — BOM 전개·Run 동시 5 시나리오 기준선 측정 → 병목 기록
- [ ] authz 전수 스윕 자동화 — 148 op × GENERAL/무토큰 매트릭스 생성 검사 (b15 확장, 라우터 인벤토리 기반 자동 생성)
- [ ] 레이트리밋 (로그인·업로드) + 요청 크기 상한 점검

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
