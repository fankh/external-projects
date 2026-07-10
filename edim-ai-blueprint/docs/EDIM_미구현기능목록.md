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

### B13. '— 예정' 메뉴 화면 신설 🔶 (1단계 v7.9 — 2단계 잔여)
- [x] Arrangement Set-Up (M-4-2) — arrangement_code/component GET·POST + 화면 (등록 다이얼로그·구성품 추가·승인 요청 자동, 시드 v10 2건 — 라이브 검증·테스트 데이터 정리)
- [x] Templet 관리 (S-2-3) — tbx_templet GET·PUT + 화면 (JSON 정의 편집기·F12 저장=DRAFT 회귀·구문 오류 가드·승인 요청, 시드 3건 — 라이브 5검증)
- [ ] Variant·Constant 관리 (code_item_value 기반)
- [ ] Raw Material·GPI (mat_material CRUD + 화면)
- [ ] PLM Material·Quality (스펙 단순 — 자재 매핑·검사 항목 그리드)

### B14. 마스터 데이터 + RBAC 동적화
- [ ] com_company CRUD (공급처 관리 — 단가·발주 화면 연동)
- [ ] sys_role·sys_role_permission 개방: 사용자·권한 화면 매트릭스 → 실 역할 편집
- [ ] sys_hierarchy 관리 (Hierarchy 주소 체계)

### B15. 테스트·품질 마감
- [ ] 라이브 스위트 통합 러너 (tests/live_all.py) + CI nightly 잡 (서버 대상 스모크)
- [ ] auth 회귀 (만료·잠금·RBAC 403 매트릭스) / 파일 업로드 에러 케이스 / i18n 폴백
- [ ] 배치별 신규 기능 테스트는 각 배치에 포함 (여기서 잔여만)

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

## C. 명시적 제외 (구현 안 함)

- Jenkins UI 파이프라인 — systemd auto-deploy + GitHub Actions CI 로 대체 완료
- 3D/STEP/IFC 뷰어 — 프로토타입(edim-ai-blueprint 스튜디오) 경로 유지, EDIM 범위 외
- WebSocket 알림 — 60초 폴링으로 충분 (고객 요구 시 전환)

---

*진행 방법: "do next" → 다음 미체크 배치를 통째로 구현·검증·배포·체크. 이 파일이 단일 진실 원천.*
