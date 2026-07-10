# EDIM 진행 현황

> 프로젝트 상태 스냅샷 — 세션·담당자 인수인계용. 문서 체계·규칙은 [README.md](README.md) 참조.

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-07-10 |
| 저장소 | https://github.com/fankh/external-projects (`edim-ai-blueprint/`, branch `master`) |
| 단계 | **FE 구현 착수** — 분석·설계 산출물 + 개발 환경 + edim-web(CPQ·PLM 1차) |

---

## 1. 산출물 현황

전체 레지스터(37종)는 [EDIM_산출물목록.xlsx](EDIM_산출물목록.xlsx). 요약:

| 상태 | 수 | 내용 |
|---|---|---|
| 완료 | 21 | 개요·요구사항(80)·기능(179)·메뉴(98)·화면설계(24)·디자인 A/B·컴포넌트(39)·DB(54T/462C)·DDL(실 DB 검증)·OpenAPI(107op)·인터페이스·클래스·권한승인·개발표준·데이터이행·WBS(38task/44주)·FVT(179+22)·RTM(179/179)·산출물목록·README·**문서 포털** |
| 진행 | 2 | **edim-web 화면 구현 (CPQ·PLM 1차 완료 — §1.5)** · 번역 콘텐츠 제작(en/ja/zh) |
| 예정 | 14 | 착수 3종(사업수행계획·위험관리대장·보안관리계획)·배치/보고서양식 정의서·매뉴얼 등 |

### 추적 체계 (자동 정합성)

REQ(80) → 기능(179) → 메뉴(98) → 화면(W-01~24) → 컴포넌트(39) → DB(54) → API(108) → FVT(179+22)
— RTM 커버리지 **179/179**, OpenAPI 스키마 검증 통과, DDL은 서버 PostgreSQL 16에 무오류 적용 + 슬라이드36 BOM 전개 재현(`KDP 1-21-13-15`) + 제약 6종 위반 테스트 + CJK i18n 스모크 통과.

### 문서 파이프라인 (docs-as-code)

- 원본: MD(설계 문서) + 생성 스크립트(`docs/tools/*.py`, xlsx/yaml/portal은 직접 편집 금지)
- 배포 형식: MD → `md2pdf.py` → `docs/pdf/` PDF 9종 (Mermaid 18개 렌더 포함) — 포털은 PDF만 노출
- 재생성 체인·명령: README §재생성 명령 (수정 → 재생성 → `make_docs_portal.py` → 배포)

---

## 1.5 프론트엔드 구현 (edim-web) — 2026-07-09 착수

- **결정**: 전 화면 **Dense(B안)** 디자인으로 실코드 구현 (정적 시안 대신 실제 앱). 앱 경로는 nginx basic auth 해제 — **앱 dense 로그인 화면(edim/edim)** 사용 (sessionStorage 세션, 실 API 전환 시 JWT)
- **스택**: `edim-web/` React 19 + Vite + TS (base `/edim-static/`) — dense.css 토큰·클래스는 디자인시안 b02 그대로 이식
- **구성**: 디자인시스템 컴포넌트(chrome·DenseGrid·LnavTree·Cvs·CommandLine) + 셸(4모듈 CPQ/PLM/Code/ERP · MDI 탭 · F2/F3/F8/F9/F12 디스패처) + **mock API 계층**(`src/api/` — OpenAPI 경로·스키마 1:1 타입, 슬라이드36 KDCR 3-13 데이터; 실 API 전환 시 서비스 구현체만 교체)
- **화면 24종 (와이어프레임 W-01~W-24 전량 구현 완료)**:
  - CPQ: 제품선정(C-1: 슬롯→BOM 재전개 `KDP 1-21-13-15`·커맨드라인) · 기술데이터(C-2) · EDIM Run(단계→산출물·로그)
  - PLM: Design Editor(S-4-1-1: 파라메트릭 A=700→B=756) · Work Process(S-4-1-2: MAKE/BUY)
  - Code Set-up: Sub Code 등록(S-1-1: 중복검토→승인요청 PENDING) · Code Relationship(S-1-4: Running Test 통과해야 승인 — CODE-009) · 데이터 Table(M-3-7: Excel식 셀 편집)
  - ERP: Project 등록(S-3-5: 영업단계 상태기계) · Dashboard(M-14-4: KPI·공정 흐름) · 단가 관리(M-12-5: resolve 시뮬레이션 ①→④) · Process Set-up(M-14-7: 정의 편집→Platform 승인) · 구매·발주(M-8-2: Stock Check→PO 생성) · 사용자·권한(M-14-6: 매트릭스·잠금해제·감사)
  - CPQ 추가: 문서함(M-5-4: 상태 필터·Grade 통제) · Document Templet(C-3: Input→Macro 밀도 계산 실동작) · Print Set-up(S-3-4: 자리표시자·워터마크·DRAFT→게시)
  - PLM 추가: 건축설비 Duct(M-4-3: 자동 배치·설치불가 AI 판독 — 사업범위 미확정 표기)
  - Toolbox(/toolbox): Macro Studio(S-2-2: 4-Way Sync·Test Run 786→TESTED 게이트) · UI Designer(S-2-1: 팔레트 배치·Object Inspector·AI 초안)
  - 공통(/common): 승인함(M-15-2: 수식 전후 비교·승인/반려 실동작) · 부서 업무함(M-15-3: 완료 처리→경고 해제) · Project Folder·이력(M-15-8/9: 폴더 5종·sys_history diff) · Mobile 미리보기(M-16: .phone 3대)
- **상세(드릴다운) 4종** — 레거시 문법 "더블클릭=상세" 구현 (b01 채택 항목): **코드 상세**(BOM·Child·단가·발주 그리드에서 진입 — 도면·단가 이력·Referencers·승인 이력) · **문서 상세**(Run 산출물 — doc_control 상태 Set-up→Accepted·Grade M 워터마크) · **부품 상세**(Design Editor Block — 치수 바인딩·Work Process·조립순서 ◆) · **이벤트 상세**(Dashboard 이상경고 — 전후 공정·완료 처리→후행 생성)
- **실 백엔드 연동 (2026-07-09)**: FastAPI `/api/v1` — **서버 PostgreSQL 16 (54테이블 스키마)** 직결. 엔드포인트: auth/login(sys_user 검증·HMAC 토큰) · codes/groups/{g}/slots · **codes/products/expand(재귀 CTE+slot_map — verify_runtime T1 동일 로직)** · tables/tech-data · prices/resolve(APPLIED→PURCHASE→STOCK→QUOTE) · cpq/runs(202+폴링, cpq_run/cpq_output 영속). 멱등 시드(tenant nova·KOF·KDCR 3-13 관계·단가·TechData). 컨테이너는 `infra_default` 네트워크로 edim-postgres 접속(DATABASE_URL 은 서버 backend/.env — 커밋 금지)
- **프론트 서비스 계층**: fetch 우선 + **mock 폴백**(네트워크/503/라우트 부재 시) — 상태바에 `DB: EDIM-PRD (PG16)` / `DB: MOCK` 표시
- **🏁 백로그 B1~B15 전체 완료 (v9.2, 2026-07-10)** — [EDIM_미구현기능목록.md](EDIM_미구현기능목록.md) 15개 배치 전부 ✅, **'— 예정' 메뉴 0**, 라이브 통합 스위트 **10/10 green**:
  - B9~B12 (v7.x~8.x): i18n 4로케일(DB sys_translation + 오프라인 번들, EN 잔존 0 자동 검사) · CAD 뷰어 고도화(측정·스냅·레이어) · Mobile 실배선 · **Undo/Redo**(useEditHistory 50-deep — Design Editor·데이터 Table·UI Designer, Ctrl+Z/Y)
  - B13~B14 (v8.x): 신규 화면 7종 — Arrangement Set-Up(M-4-2)·Templet 관리(S-2-3)·Variant·Constant(S-1-2)·Raw Material·GPI(M-3-2, M-4-4 공유)·Quality(M-4-5)·공급처·거래처(M-14-2)·Hierarchy 주소(M-3-1) + **권한 매트릭스 실데이터**(sys_role_permission 셀 순환 NONE→READ→WRITE + PERM_CHANGE 감사) — 시드 v10~v13
  - B15 (v8.6~9.2): **tests/live_all.py 통합 러너 10스위트** + edim-nightly.yml(03:00 UTC) + RBAC 403 매트릭스·401·업로드 가드(.exe 등 9종 422)·i18n 폴백 회귀. 마감 중 발견·수정: 승인 중복 요청 500→**정직 409**(uq_approval_pending 사전 검사), **DELETE /drawings/{no}**(DRAFT 한정·이력 연쇄 정리), **DELETE /files/{id}**(Run 산출물·견적 참조 409 보호, 공유 key 안전 MinIO 제거), seed v13(신규 화면 번역 키), 스위트 자체정리 원칙(테스트 데이터 잔존 0)
  - 남은 항목은 **외부 의존(§B)** 뿐 — ANTHROPIC_API_KEY·ODA 라이선스·고객 확정 항목. 입력되는 즉시 처리 가능 상태
- **배치 v6.7 (2026-07-10) — 백로그 B8 보안 강화**: `PUT /users/me/password`(구비밀번호 검증 + 타이틀바 사용자 메뉴 ▾ 비밀번호 변경 다이얼로그), **로그인 5회 연속 실패 자동 LOCKED**(sys_history LOGIN_FAIL 집계 — 마지막 LOGIN_OK/UNLOCK 이후, 스키마 무변경, 해제 시 초기화), **토큰 슬라이딩 갱신**(만료 30분 전 `X-EDIM-Token` 헤더 재발급 → 프론트 자동 교체, 8h 하드컷 제거), 감사 확장(LOGIN_OK/FAIL/DENY·LOCK·UNLOCK·PW_CHANGE·LEVEL_CHANGE), `PATCH /users/{login}/level` + M-14-6 레벨 변경 실배선. 라이브 27검증(tests/live_security.py, 테스트 계정 원복·감사 행 정리) · 폴백 52/52 유지
- **배치 v6.5 (2026-07-10) — 백로그 B7 PLM 도면 대장**: dwg_drawing·dwg_revision·dwg_supersedure 개방 — 신규 화면 **도면 대장(M-4-1)**(등록 F2·Rev 올리기·Supersedure 대체 등록·더블클릭=연결 DXF CAD 뷰어), 코드 상세 **도면 열기 = CAD 뷰어**(dwg_file.drawing_id — Run DXF 자동 연결)·**승인 이력 = sys_approval_request 실조회**, 툴바 Supersedure 실배선, 시드 v8(Rev A/B·구도면 3-12 대체 이력). 라이브 17검증(tests/live_b7_drawings.py) · 폴백 52/52 유지. 백로그 잔여는 [EDIM_미구현기능목록.md](EDIM_미구현기능목록.md) (B4~B6 은 v5.5~6.4 에서 완료)
- **배치 v4.3~5.0 (2026-07-09) — 백로그 B1~B3 + 헤더 내비**: **B1 승인 워크플로 실배선**(POST /approvals 범용 + PUT /macros — Design Editor·Studio·Print·UI Designer 승인 버튼 전부 실동작, 요청→승인함→결정→알림 왕복 라이브 7검증) · **B2 편집 영속화**(PUT /drawings/dimensions F12·GET/PUT /erp/work-process MAKE/BUY·GET/PUT /toolbox/forms 레이아웃 버전 관리 — 새로고침 유지 6검증) · **B3 단가 쓰기**(POST /prices 등록 다이얼로그·EXCLUDE 409·Table 콤보 실필터 4검증) · **모듈 링크 헤더 이동**(타이틀바 내비 + 활성 pill, 메뉴라인은 드롭다운 전용). 테스트: tests/live_b1·b2 커밋
- **배치 v4.0 (2026-07-09) — 잔여 mock 실데이터화**: 신규 엔드포인트 4종 + 화면 배선 — **`GET /drawings/dimensions`**(dwg_dimension+tbx_macro → **Design Editor 치수 Set-up 이 실DB**, D==Table12(B,710) 검증) · **`GET /macros`**(tbx_macro 4건 → Macro Studio 진입 시 라이브러리 로드) · **`GET /erp/process-defs`**(def+edge → Process Set-up 실데이터, 선행/후행 = edge 계산; 규칙 컬럼은 스키마 확장 대기로 mock 보강) · **`GET /codes/{code}/referencers`**(code_relationship 역참조 → 코드 상세 Where-Used, KDP 1-21→KAD 900 FW 검증) · 재고 단가 4값 = cst_price 재고 이력 실산출 · 이벤트 상세 = erp_process_event 라이브 필드 · **메뉴바 드롭다운 ▾ 표기**(모듈 링크와 구분). 잔여 mock 은 시각 요소(캔버스 배치·팔레트)·고객 협의 대기 항목(공정 규칙 컬럼·Duct AI·문서 상태기계)만
- **배치 v3.6 (2026-07-09)**: **페이지 이동 시 좌측 메뉴 마킹** — 활성 탭의 화면을 트리에서 하이라이트(인스턴스 탭 `run:1` 등도 screenId 로 노드 매칭, 메뉴에 없는 상세 탭은 오탐 없이 무마킹), 접힌 조상 폴더 자동 펼침 + scrollIntoView. MDI 탭 클릭·브라우저 뒤로/앞으로·Alt 탭 이동·타 모듈 전환 전부 동작 (라이브 6검증)
- **배치 v3.4 (2026-07-09)**: **F-key 표준 완성** — 상태바 F2/F3/F8/F9/F12 셀 **클릭 = 실행**(키 디스패치), Shell 폴백(브라우저 기본동작 차단 + 미구현 화면 안내 "해당 동작이 없습니다"), 실동작 보강: C-1 F2=신규 견적(슬롯 초기화·재전개)·F12, Run F9=실행, Design Editor F8=CAD 재작도, 데이터 Table **F3=행 삭제(DELETE API·선택 가드)**, 승인함/Dashboard F8=재조회, Studio F12. 라이브 8검증
- **배치 v3.2~3.3 (2026-07-09)**: **메뉴바 드롭다운 실구현**(파일=신규/저장/인쇄/로그아웃 · 편집=취소/재실행/삭제 · 조회=F8/F9/데이터소스 재확인 · 도구=Macro Studio/UI Designer/Table/문서 포털 · 창=탭 이동/닫기/전체 닫기+열린 탭 목록 · 도움말=**단축키 안내 다이얼로그**/시연 시나리오 PDF) · **브라우저 이력 URL 동기**: 탭 열기/전환 시 `/{module}#{tabId}` pushState — **뒤로/앞으로가 탭·모듈 이력을 따라가고**, URL 딥링크로 특정 탭 직행, 다른 모듈 탭 클릭 시 좌측 트리 자동 전환 (dev `/edim-static/` 는 `#/module/tab` 해시 라우트로 reload 404 방지)
- **배치 v2.9~3.0 (2026-07-09)**: **전역 단축키**(Ctrl/⌘+K 검색 · Alt+W 탭 닫기 · Alt+←/→ 탭 이동 · Alt+1~9 n번째 탭 — Ctrl+W/Tab 은 브라우저 예약이라 Alt 조합) · **CAD 캔버스 키**(＋/－ 줌 · 0 맞춤 · M 측정 · Esc 해제, 마우스 진입 포커스 스코프) · **CAD 뷰어 ← 목록으로**(진입 원점 탭 복귀 후 뷰어 닫기 — Run 산출물·Folder·에디터 Import 3경로 `from` 전달) · **툴바 실배선**(▤=F2·💾=F12 디스패치, 🖨 인쇄, Variants→Design Editor, Referencers→코드 상세 KDCR 3-13, Supersedure→Folder·이력)
- **배치 v2.5~2.7 (2026-07-09)**: **시연 시나리오** 문서(`EDIM_시연시나리오.md/pdf` — 10분 표준 데모 절차·멘트·Q&A·트러블슈팅, 포털 등재) · **CI 회귀 게이트**(GitHub Actions `edim-ci.yml` — push 시 빌드+52체크 폴백 스위트, 3연속 green) · **CAD 측정·조회**(공용 CadSvg: 📏 두 점 거리(끝점/중심 스냅·Δx/Δy), 엔티티 클릭=하이라이트+속성(길이·반지름·호 각도·정점), 수학 히트테스트) · **i18n 확장 시드 v7**(+55키: 화면 제목 `screen.*`·메뉴 트리 `menu.*`·공통 버튼·CAD 문구 — 트리/MDI 탭 제목 런타임 번역, 상세 탭 동적 제목은 원제 유지; en/ja/zh 라이브 검증)
- **CAD 호환 v3 (2026-07-09)**: **Design Editor(S-4-1-1) 부품도 CAD 정본화** — Run 파이프라인 도면 생성부를 `build_part_dxf(dims)` 로 공유화(케이싱 K×B·임펠러 A·샤프트·베어링 C·흡입콘 E, DIM 레이어 치수선 A/B/K + C/E 라벨, 타이틀) → `POST /cad/part-drawing`(치수 미지정 시 dwg_dimension 엔진 평가), 에디터 툴바 **편집/CAD 토글**, Macro Run(F9) 성공 시 CAD 자동 재작도(A=700→도면에 B(H)=756·K=1134 반영 라이브 검증). **Run 제작도면과 에디터 CAD 가 동일 기하 정본**. **줌/팬 내장**(공용 `CadSvg`): 커서 기준 휠 줌·드래그 이동·더블클릭/⌂ 맞춤·＋/－ 오버레이·줌% 표시·화면상 선굵기 일정 — 에디터·C-1·CAD 뷰어 3곳 공통 (라이브 검증: viewBox 축소/이동/복원). **Design Editor 기본 모드 = CAD**(진입 즉시 서버 작도, 백엔드 불가 시 편집 캔버스 자동 폴백) · **모의 캔버스(Cvs) 11곳에도 줌/팬 동일 적용**(배경 드래그만 팬 — Block 클릭/더블클릭 유지)
- **CAD 호환 v2 (2026-07-09)**: **C-1 구성 캔버스 CAD 정본화** — 서버가 구성 배치를 실 DXF 로 작도(`build_arrangement_dxf`, 레이어 ARRANGEMENT/LABEL/DIM·전체 치수 4504×3254) → `GET /cad/arrangement`(문서)·`.dxf`(다운로드), C-1 에 **구성도/CAD 토글**+⬇DXF, 공용 `CadSvg` 컴포넌트로 뷰어와 렌더 일원화. **안정화**: 데이터 로더가 shell 객체 identity 에 의존해 발생한 **재조회 폭주 수정**(tech-data 17회→1회 검증), `res.json()` 타임아웃 시 Uncaught AbortError 수정, **nginx 502→JSON 503**(배포 재기동 창에서 프론트가 조용히 mock 폴백)
- **CAD 호환 (2026-07-09, P4-3 DXF 완료)**: `GET /cad/view/{fileId}`(MinIO DXF→ezdxf `dxf_importer` 재사용→정규화 DrawingDocument) · `POST /cad/import`(업로드+파싱 검증 후 Folder/DWG 등록) · `POST /cad/export-dxf`(dwg_dimension 엔진 평가 치수 반영) · **CadViewerScreen**(SVG — line/polyline/circle/arc/text, 레이어 색·표시 토글, 휠 줌·맞춤, ⬇ 다운로드, MOCK 모드 안내). 진입: Run 산출물 "미리보기"·Folder DXF 더블클릭·Design Editor "DXF 열기/내보내기". **DWG = ODA 플러그블 501**(라이선스 확정 대기). 라이브 검증: Run DXF 렌더(A=670 치수 텍스트)·샘플 import 4엔티티 렌더·export K=1134 반영·DWG 501
- **i18n 런타임 (2026-07-09, P2-3)**: `GET /i18n/{locale}`(sys_translation UI 키 — 시드 v6 40키×en/ja/zh=120행, 로그인 화면용 공개 엔드포인트) · I18nProvider(`t(key, ko)` KO 폴백·localStorage 유지·백엔드 불가 시 내장 사전) · 타이틀바/로그인 로케일 스위처 · 적용 범위: 셸 크롬(메뉴바·F-key·상태바)·로그인·C-1 제품선정 — **탭 영속 + MDI 탭 localStorage 복원**(Run 탭 제외)·fetch 타임아웃(행 방지)도 v1.4 에서 완료
- **후속 배치 (2026-07-09)**: **AI 연동 코드 완료**(`/ai/macro-generate`·`/ai/ui-suggest` — Claude+문법 제약, 키 미설정 시 샘플 모드; Studio ▶생성·Designer AI 초안 실배선, 생성 수식→엔진 평가 체인 검증. **활성화 = 서버 backend/.env ANTHROPIC_API_KEY**) · **일일 백업**(`edim-backup.timer` 03:20 — pg_dump+MinIO tar, 보존 7일, 첫 실행 검증) · 치수 정의 DB 이행(dwg_dimension+tbx_macro 시드 v5 — Run 이 DB 에서 로드) · 견적서 PDF **NanumGothic TTF 임베드**(뷰어 무관 한글) · 검증 스위트 저장소 이관(`tests/`)
- **스프린트 S5 완료 (2026-07-09) — 로드맵 S1~S5 전체 완료**: **EDIM Run 실 파이프라인**(`run_pipeline.py`): ① BOM 전개→cpq_selection_item 영속 ② 치수 Macro 엔진 평가(A/B/D/K) ③ **제작도면 DXF 생성**(ezdxf R2010, 계산 치수 반영) ④ 단가 resolve(누락 시 warn 로그) ⑤ **견적서 PDF**(reportlab — CJK CID·CONFIDENTIAL 워터마크·실 BOM/합계)+BOM XLSX ⑥ MinIO 업로드+dwg_file+cpq_output(file_id) → **Folder 화면 즉시 노출·Run 화면 ⬇ 다운로드**. 단계 실측(파트 수·식 수·소요 실시간)·실패 시 FAILED+error_detail. 검증: PDF `%PDF`·DXF `AC1024`·XLSX 파싱(KDP 1-21-13-15 포함)·UI 다운로드 실파일. 알림 드롭다운 대비 수정
- **스프린트 S4 완료 (2026-07-09)**: **알림**(sys_notification — 승인 요청 시 승인권자·결정 시 요청자 자동 생성, `GET /notifications`+읽음, 타이틀바 벨 60초 폴링·드롭다운) · **RBAC**(require_auth 가 sys_user 레벨 해석 → 엔드포인트별 최소 권한: 쓰기=SETUP+, users/unlock=ADMIN — GENERAL 403 검증, edim 은 시드 v4 로 ADMIN 승격) · **자동 배포**(systemd `edim-autodeploy.timer` 2분 폴링: fetch→pull→docker build→rsync dist/docs — 수동 배포 루프 폐지, Jenkins UI 파이프라인은 선택)
- **스프린트 S3 완료 (2026-07-09)**: **Macro 실행 엔진 v1 (ENG-01)** — eval 미사용 재귀하강 파서/평가기 (`backend/app/services/macro_engine.py`). 산술·비교·IF/IFERROR/AND/OR/NOT·SUM/MIN/MAX/AVG·`Var(이름,기본값)`·**Table 참조**(단일 key·`lo:hi` 범위 집계 — 실 tbl_data_row, Cos1/Cos2 별칭)·PreC. `POST /macros/evaluate`(trace 포함). **Macro Studio Run = 실평가**(수식 편집 가능·오류 시 TESTED 게이트 차단) · **Design Editor 파라메트릭 = 엔진**(수치 치수→변수, =식 순차 평가). 단위 13 + 라이브 11 검증
- **스프린트 S2 완료 (2026-07-09)**: **Table CRUD**(tbl_data_row — 행 추가/셀 편집 F12 저장/삭제, row_key_num 정렬) + **Excel Import**(openpyxl, Key upsert·수치 아닌 셀 거부 리포트) · **파일 업/다운로드**(MinIO 버킷 edim 백엔드 프록시 — presigned 공개는 I-008 결정 후, dwg_file 레지스트리·Folder 화면 업로드/다운로드 실동작, 바이트 일치 검증) · 시드 v3(Table12)
- **스프린트 S1 완료 (2026-07-09)**: **API 인증 강제**(HMAC Bearer — 무토큰 401·만료 시 재로그인, health/login 만 공개) · Dashboard KPI/부서 Event **실집계**(erp_process_event) · Child Group(code_relationship) · PR 품목(단가 resolve 연동) · **Folder 파일 = cpq_output 실산출물** · **Running Test API**(CODE-009, expand 재사용·미체크 서브트리 제외) · MDI 탭 라인 상시 유지
- **배치 A (2026-07-09)**: 승인함(sys_approval_request inbox+**decide 쓰기** — 승인 시 대상 approval_status 전이+이력) · 문서함(doc_control) · 사용자(sys_user+**unlock 쓰기**) · 업무함/Dashboard 경고(erp_process_def/edge/event+**complete 쓰기**) · Project 영업단계(**PATCH** — enum 매핑, 새로고침 유지 검증) · 단가 대장(cst_price) · 이력(sys_history) · **Sub Code 항목 등록 쓰기**(code_item PENDING+승인요청 자동 생성, 중복 409). 시드 v2(멱등). 잔여 mock: Dashboard KPI/부서Event·Relationship Child Group·Table12 행·발주 품목·Folder 파일목록·Toolbox
- **검증**: tsc 무오류 · Playwright 스모크 49/49(mock 폴백) · **라이브 E2E 5/5 (실 DB: 로그인 검증·BOM 재전개·Run 영속)** · 콘솔 에러 0
- **배포**: dist 커밋 → 서버 rsync `/var/www/edim/edim-static/` + nginx `/cpq` `/plm` `/code` `/erp` `/toolbox` `/common` SPA fallback + `/api/v1/`(auth off) 프록시. **캐시 정책(2026-07-09)**: `index.html`(+SPA 라우트)=`no-cache`(배포 즉시 반영), 해시 자산 `assets/*`=`immutable` 1년 — 배포 후 구버전 번들 잔존 문제 해소

## 2. 인프라 현황 (edim.seekerslab.com)

Ubuntu 24.04 (16C/31GB) · `ssh edim-server` = seekers@115.90.24.205:**5022** · ufw 5022/80/443

### 공개 URL — 문서·프로토타입은 Basic Auth `edim`/`edim` · 앱 경로(/cpq 등)는 앱 로그인 `edim`/`edim`

| URL | 용도 |
|---|---|
| / | 프로토타입 앱 (AI 샘플 모드 — `ANTHROPIC_API_KEY` 미설정) |
| /docs/ | **산출물 다운로드 포털** (29종: PDF 9·XLSX 9·SQL 2·YAML 1·HTML 3·근거 4·기타) |
| **/cpq · /plm · /code · /erp · /toolbox · /common** | **EDIM 업무 앱 (edim-web, dense B안 — 24화면 + 상세 4종, mock API)** |
| /design/ · /design/hifi/ · /design/dense/ | 화면설계서(24) · 디자인 A · 디자인 B(★채택 — 전 화면 dense 확정) |
| /api/* | 백엔드 REST (health·models·drawings) |
| /jenkins/ | Jenkins LTS — **자체 로그인** (`auth_basic off`) |
| /minio/ui/ | MinIO 콘솔 — **자체 로그인** (edimadmin) |

### 컨테이너·데이터

| 위치 | 구성 |
|---|---|
| `~/apps/external-projects/edim-ai-blueprint` | 앱 compose — edim-backend 127.0.0.1:8000 (+`infra_default` 네트워크로 edim-postgres 접속, `backend/.env` 에 DATABASE_URL) |
| `~/apps/infra` | jenkins(:8080/:50000) · minio(:9000/:9001) · postgres:16 `edim-postgres`(:5432, db=edim) — 전부 127.0.0.1 바인딩 |
| `/var/www/edim` | nginx 정적 루트 — 앱 SPA + design/ + docs/(포털) |
| TLS | Let's Encrypt (certbot 자동 갱신, basic auth와 무충돌) |

### 시크릿 (커밋 금지)

- MinIO·Postgres 비밀번호: 서버 `~/apps/infra/.env` (chmod 600)
- Jenkins 초기 관리자 비밀번호: 컨테이너 `/var/jenkins_home/secrets/initialAdminPassword` — **초기 셋업 미완료(계정 생성 필요)**
- SSH 키: 로컬 `~/.ssh/seekers_id_rsa`

---

## 3. 작업 환경 규칙

| 항목 | 규칙 |
|---|---|
| 클론 3곳 | 주 `C:\repos\new-research\external-projects` → push → 보조 `C:\repos\external-projects`·서버 `~/apps/external-projects` pull |
| 스크립트 실행 | `PYTHONUTF8=1` 필수 (cp1252 오류 방지) |
| 서버 작업 | Bash 도구 + `ssh edim-server 'bash -s' < script.sh` (PowerShell 5.1 따옴표 손상 회피) |
| 배포 (docs) | 서버 pull 후 `sudo rsync -a --delete edim-ai-blueprint/docs/ /var/www/edim/docs/files/ && sudo cp edim-ai-blueprint/docs/portal.html /var/www/edim/docs/index.html` |
| 커밋 | `v0.1: <type>(<scope>): <내용>` — AI 표기 금지, author fankh |

---

## 4. 백로그 (우선순위순)

> **구현 우선순위 상세**: [EDIM_구현우선순위.md](EDIM_구현우선순위.md) — P0(인증)~P4, 의존성 체인(Table→Macro 엔진→Run), 스프린트 S1~S5 제안 (2026-07-09)

1. **Jenkins 초기 셋업 + CI 파이프라인** — "pipeline later" (사용자 보류 중)
2. 착수 문서 3종: 사업수행계획서 · 위험관리대장 · 보안관리계획서
3. 배치 정의서 · 보고서/양식 정의서
4. edim-web 잔여 모듈 화면 구현 (Code Set-up·Toolbox·ERP·공통·Mobile — 전 화면 dense 확정) + mock→실 API 전환(FastAPI + 서버 PG 54테이블)
5. `ANTHROPIC_API_KEY` 설정 → 앱 AI 샘플 모드 해제
6. 번역 콘텐츠 제작 (sys_translation en/ja/zh 실데이터)
7. 고객 협의 대기: 보안 솔루션 범위 · DUCT 사업 범위 · ERP 자체구현/연계 경계 · WBS 시작일(현재 2026-08-03 가정) · Digital Twin 연계 스펙 · ODA 라이선스

---

## 5. 변경 이력

| 일자 | 내용 |
|---|---|
| 2026-07-07 | 최초 작성 — 산출물 21종 완료·포털 공개(Basic Auth)·PDF 파이프라인 구축 시점 |
