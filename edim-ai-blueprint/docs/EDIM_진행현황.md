# EDIM 진행 현황

> 프로젝트 상태 스냅샷 — 세션·담당자 인수인계용. 문서 체계·규칙은 [README.md](README.md) 참조.

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-07-11 |
| 저장소 | https://github.com/fankh/external-projects (`edim-ai-blueprint/`, branch `master`) |
| 단계 | **FE 구현 착수** — 분석·설계 산출물 + 개발 환경 + edim-web(CPQ·PLM 1차) |

---

## 1. 산출물 현황

전체 레지스터(37종)는 [EDIM_산출물목록.xlsx](EDIM_산출물목록.xlsx). 요약:

| 상태 | 수 | 내용 |
|---|---|---|
| 완료 | 28 | 개요·요구사항(80)·기능(179)·메뉴(98)·화면설계(24)·디자인 A/B·컴포넌트(39)·DB(54T/462C)·DDL(실 DB 검증)·OpenAPI(107op)·인터페이스·클래스·권한승인·개발표준·데이터이행·WBS(38task/44주)·FVT(179+22)·RTM(179/179)·산출물목록·README·**문서 포털**·**착수 3종(사업수행계획·위험관리대장 14건·보안관리계획 — 2026-07-11)**·**배치/보고서양식 정의서(통합본 v0.2 — 2026-07-11)**·**사용자·운영자 매뉴얼(가이드 2종 레지스터 연결 — 2026-07-11)**·**설치·배포 매뉴얼(v0.1 — 2026-07-11)** |
| 진행 | 2 | **edim-web 화면 구현 (CPQ·PLM 1차 완료 — §1.5)** · 번역 콘텐츠 제작(en/ja/zh) |
| 예정 | 6 | 현행분석서·제안서·테스트 문서·교육/검수 문서 — **전부 고객사·사업 조건 확정 또는 본사업 단계 대기** |

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
- **🏁 배치 v13.4 (2026-07-11) — 6차 백로그 F10 조회 UX 소품 = F1~F10 전체 완료**: MDI 탭 오버플로(최소폭·가로 스크롤·▾ N 목록·활성 자동 스크롤) · Dashboard KPI 드릴다운 4종 · 승인함 자산 유형 실필터+검색. **6차 백로그(브라우저 프로브 발견분) 전량 마감** — 라이브 스위트 24종. 검증: tests/live_f10_ux.py·폴백 55·EN 0
- **배치 v13.3 (2026-07-11) — 6차 백로그 F9 다이얼로그 Escape 표준**: useEscapeClose 공용 훅(capture — 화면 단축키 전파 차단) 을 등록/수정/PO/바인딩/diff/요구사항 등 전 다이얼로그에 적용 (QuickEditDialog 는 1곳으로 전체 커버). 백드롭 닫기·딤 오버레이는 기구현 확인·정정. 검증: tests/live_f9_escape.py(5종+무해성)·폴백 55·EN 0
- **배치 v13.1 (2026-07-11) — 6차 백로그 F8 그리드 정렬**: DenseGrid 공통 헤더 클릭 정렬(asc→desc→해제·▲▼·aria-sort) — **원본 인덱스 보존으로 index 선택 화면 안전**(선택 무결성 라이브 검증), sortValue 옵션·JSX 열 자동 제외·ko numeric 비교 · `/prices`·`/history`·`/documents` 서버 정렬 파라미터(화이트리스트). 검증: tests/live_f8_sort.py·폴백 55·EN 0
- **배치 v13.0 (2026-07-11) — 6차 백로그 F7 이력 diff 뷰어**: `GET /history` 에 historyId·before_data/after_data 노출 → M-15-9 diff 칩 = **비교 모달**(필드 union · 변경 필드 하이라이트 · 무페이로드/mock 정직 안내). 검증: tests/live_f7_diff.py·폴백 55·EN 0
- **배치 v12.8 (2026-07-11) — 6차 백로그 F6 통합 검색 확장**: GET /search 에 부품·공급처·창고·매크로·프로젝트 그룹 + 사용자(SETUP 이상만 — M-14-6 읽기 가드 동일) 추가, ⌘K 드롭다운 그룹·딥링크(부품 상세 탭·M-14-2·M-8-4·Studio·**프로젝트=컨텍스트 전환+S-3-5**·M-14-6) + placeholder 확장. 검증: tests/live_f6_search.py(동적 6그룹·GENERAL 게이트·딥링크 3종)·폴백 55·EN 0
- **배치 v12.6 (2026-07-11) — 6차 백로그 F5 마스터 데이터 수정·정정 전면**: 등록만 있던 11개 도메인에 Update/마감/삭제 — `PUT /companies/{id}`(중복 409)·`PUT /parts/{no}`(재질 검증 422)·`PUT /materials/{code}`·`PUT /verifications/{id}`(활성 토글)·`PATCH /codes/values/{id}`(**폐기 DEPRECATED**)·`PATCH /erp/warehouses/{code}`(개명)·`PATCH /prices/{id}`(**적용 종료 마감**, 시작 이전 422)·`PATCH /documents/{no}/meta`(**ACCEPTED 409 통제**)·`DELETE /templets/{name}`(시스템/RELEASED 409)·`DELETE /macros/{name}`(치수식 등 참조 409 — **Studio F3 실배선**)·구성품 수량/삭제. 프론트 **공용 QuickEditDialog** + 화면별 수정 동선(더블클릭·✎·적용 종료·메타 수정·삭제 F3), 목록 응답에 id 노출(company/price/value/component/verification) + 문서 docType. 전부 _audit 감사. 검증: tests/live_f5_updates.py(왕복 수정·원복·보호 게이트, UI 샘플)·폴백 55·EN 0
- **배치 v12.5 (2026-07-11) — 6차 백로그 F4 무반응·메시지-온리 일소**: S-1-4 관계 승인 실배선(POST /approvals targetCode + **decide 시 mother 관계 세트 APPROVED 전이**, 승인함 유형 '관계') · S-1-1 저장F12=실등록 경로/값추가/F8 실재조회 · M-3-7 편집=인라인 에디터·**Export=GET /tables/{name}/export.xlsx**(D8 XLSX 1호) · S-3-4 캔버스 상태화(기본배치·Data/그래프 위젯 추가·경로 바인딩 다이얼로그 — 배치가 렌더 라인 실결정, Printer/PDF 실렌더, Office 정직 disabled) · 코드 상세 Variants/Referencers 실배선 · 문서함 F8 실재조회 · 툴바 Referencers **활성 코드 컨텍스트**(KDCR 3-13 고정 해소). 검증: tests/live_f4_noop.py(전이 psql 확인·XLSX 파싱·다운로드 2종 — 데이터 무생성)·폴백 55·EN 0
- **배치 v12.4 (2026-07-10) — 6차 백로그 F3 권한 기반 UI 게이팅 (SYS-005)**: **PermissionProvider**(GET /auth/permissions 소비 — canWrite=SETUP+ ∨ 매트릭스 WRITE, 서버 규칙 동일·mock 레벨 폴백) → 등록/쓰기 버튼 **disabled+사유 툴팁 13화면** + F2 키 가드 · GENERAL 트리 '사용자·권한' 미표시 + 직접 진입 시 **403 안내 화면**(SETUP 읽기 허용, ADMIN 전용 버튼만 잠금) · 승인함 **읽기 전용 칩 + 내 요청 실필터**(inbox requesterLogin — 하드코딩 (2)/위임(1) mock 제거). 프론트 숨김 ≠ 보안 — 서버 RBAC 이 게이트(원칙 유지). 검증: tests/live_f3_rbac_ui.py(GENERAL/SETUP/ADMIN 3계정 — f3.* psql 정리)·폴백 55·EN 0
- **배치 v12.2 (2026-07-10) — 6차 백로그 F2 사용자 등록·수정 완결**: `POST /users`(login 형식·레벨 화이트리스트·초기 비밀번호 4자+·중복 409·USER_CREATE 감사 — 신규 계정 즉시 로그인 가능) · `PATCH /users/{login}`(이름·부서·이메일, before/after 감사) · `DELETE /users/{login}`(무참조만 — 사용 이력 FK 409 = 비활성화 안내·본인 422) · M-14-6 **등록/정보수정 다이얼로그 실배선**(onClick 부재였던 '＋ 사용자 등록' 해소) + 검색·레벨 필터 실동작 + F8 실재조회 + 목록 email · 시드 v19(UI 키 10종). 검증: tests/live_f2_users.py(정리=API+ssh psql — 로그인 감사행 FK)·폴백 55체크·EN 잔존 0
- **배치 v12.1 (2026-07-10) — 6차 백로그 F1 프로젝트 도메인 실체화**: `GET/POST/DELETE /projects`(PS 자동 채번 PS-613…·Client=com_company 자동 연결·PROJECT_CREATE/DELETE 감사·기술 제안+무참조만 삭제 409) · S-3-5 **프로젝트 대장 그리드 + F2 등록 다이얼로그** (mock 단일 상수 제거) · **접수 자료 실업로드**(파일 선택→MinIO RECEIVED+dwg_file created_by, 목록·다운로드 실데이터 — 가짜 로컬 행 제거) · **타이틀바 활성 프로젝트 컨텍스트**(ShellContext+localStorage, 대장 선택=전환 — 'Micron #7 (Pre-Sales)' 하드코딩 제거) · 시드 v18(접수자료 2건 MinIO 실객체 + UI 키 11종 en/ja/zh). 검증: tests/live_f1_project.py(자체 정리)·e2e_fallback 54체크(B19 PO 다이얼로그 흐름 반영 — 구버전 기대값 정정)·EN 잔존 0. 발견·수정: gen_i18n_bundles 원천 불일치(→C12 등재), F9 백드롭 표현 정정
- **6차 백로그 F1~F10 등재 (2026-07-10)** — 정적 핸들러 대조 + 라이브 실클릭·네트워크 관측(쓰기 0 증거) + GENERAL RBAC UX 프로브. 주요: 프로젝트 도메인이 단일 mock(신규 등록·목록 없음, 접수자료 업로드 휘발) · '＋ 사용자 등록' onClick 부재(계정 생성 E2E 없음) · 권한 기반 UI 게이팅 부재(GENERAL 에 쓰기 버튼 전부 활성→403) · 무반응 버튼 잔존(S-1-1 저장/값추가 · M-3-7 편집/Export · S-3-4 6버튼 · 코드상세 Variants/Referencers · S-1-4 승인요청 메시지-온리) · 마스터 Update 전면 부재(공급처·부품·재질·창고·단가 정정) · ⌘K 부품/공급처 미검색 · 이력 diff 메시지-온리 · 그리드 정렬 없음 · 다이얼로그 Escape 미지원 · 탭 오버플로. 상세: [EDIM_미구현기능목록.md](EDIM_미구현기능목록.md) §A-6
- **🏁 2차 백로그 B16~B22 전체 완료 (v11.0, 2026-07-10)** — [EDIM_미구현기능목록.md](EDIM_미구현기능목록.md) §A-2 7개 배치 전부 ✅: 도면 상세·CAD 심화(B16) → 부품+BOM(B17) → 원가·수익성(B18) → 창고·구매(B19) → Toolbox 심화(B20) → 시스템·UX 마감(B21) → 문서·스펙 동기화(B22). **DB 54테이블 100% 사용** · API 148 op · 라이브 스위트 14종 · no-op 버튼 0. B22 산출물: [API 동기화현황](EDIM_API_동기화현황.md)·[배치/보고서양식 정의서](EDIM_배치보고서양식정의서.md)·[사용자 가이드](EDIM_사용자가이드.md)·[관리자 가이드](EDIM_관리자가이드.md). 잔여는 외부 의존(§B)뿐
- **배치 v10.8 (2026-07-10) — 2차 백로그 B21 시스템·UX 마감**: **auth/me·유효 권한 매트릭스** · **다중 역할**(sys_user_role, ROLE_ASSIGN 감사) · **Hierarchy 편집**(주소 검증 등록·개명·삭제) · **문서 채번+상태 전이**(allocate-code·SET_UP→…→ACCEPTED·반려 복귀) · **no-op 버튼 전면 실배선**(초대 인앱·비활성/재활성·문서 미리보기/Print 실렌더·중복검토 실질의·Print Set-up 탭·Child 추가·처리 Form 열기·UI Designer 동적 미리보기). 라이브 29검증(tests/live_b21_system.py)
- **배치 v10.6 (2026-07-10) — 2차 백로그 B20 Toolbox 심화**: **Macro 4-Way 전체 영속**(수식+코드+플로차트+설명+Test 입력/결과, 버전 증가·복원 칩) · **CODING 모드**(코드 필수 검증, 엔진 v1 정직 게이트) · **tbx_macro_ref 자동 추출**(저장 시 Table 참조 재구성) + 영향도 API(/tables/{name}/impact) · **함수 자연어 검색**(TBX-014 — 한글 키워드 카탈로그, 기능 찾기·함수 마법사 실삽입). 시드 v17 · **DB 54테이블 사용률 100% 달성** · 라이브 17검증(tests/live_b20_macro.py)
- **배치 v10.4 (2026-07-10) — 2차 백로그 B19 창고·구매 상세**: 신규 화면 **창고·저장위치(M-8-4)** — erp_warehouse 5계층(REGION→…→SECTOR 순서 강제)·위험물 허용·검사주기, 시드 v16 · **QCR 실배선**(채번+감사+구매 담당 알림) · **발주 = doc_control PO 문서 영속**(ERP-017 조건 다이얼로그 + ERP-018 공급자 코드 병기) · 문서 SET_UP 삭제 API. 라이브 21검증(tests/live_b19_warehouse.py)
- **배치 v10.2 (2026-07-10) — 2차 백로그 B18 원가·수익성**: Run 파이프라인이 **cst_calc 원가 3분류**(재료비=BOM 단가·제조비=조립 스텝×임율·직접경비) 자동 적재 → Run 화면 원가 패널 · **cst_pcr PCR 수익성**(기여마진·EBIT, 사업유형별 upsert) · **cst_quotation 견적 lifecycle**(QT 채번·PDF 렌더·DRAFT 삭제). 재고 단가 4종은 기구현 확인. 라이브 19검증(tests/live_b18_cost.py)
- **배치 v10.0 (2026-07-10) — 2차 백로그 B17 부품 마스터 + BOM**: 신규 화면 **부품 대장(M-4-7)** — prt_part CRUD(재질/공급처/제품코드 연결·BOM 참조 삭제 보호 409) + 우측 **공급자 코드 매핑**(ERP-018, prt_supplier_code_map) · **dwg_bom 개방** — Design Editor 조립순서 ◆·부품 상세 seq/노트가 실데이터 · 발주 화면 공급자 코드 표 실배선 · **product_code_item** 슬롯 정의(코드 상세 박스). 시드 v15(4부품·BOM 4행·매핑 2·슬롯 3) · 라이브 19검증(tests/live_b17_parts.py)
- **배치 v9.8 (2026-07-10) — 2차 백로그 B16 도면 상세·CAD 심화**: 도면 대장 상세 탭 5종 [Rev|승인 단계|Variants|Referencers|첨부] · **dwg_approval 단계별 승인**(WRITE→REVIEW→APPROVE 순서 강제, 반려=DRAFT 복귀+이력 초기화) · **dwg_document 블록 7건 = Design Editor 편집 캔버스 실데이터** · **dwg_part_relation 3건 = 부품 관계 패널 실데이터**(Macro 연결) · **Simulation 판넬**(DWG-024: VARIANT 입력→MACRO 즉시 재평가 Δ→적용) · CAD 뷰어 특성 편집(레이어 색·굵기, DWG-025 1차) · 도면 삭제 연쇄 정리(RELEASED 보호). 시드 v14 · 라이브 24검증(tests/live_b16_drawing_detail.py)
- **운영 도구 — 요구사항 접수 모달 (v9.5~9.6, 2026-07-10, 개발서버 전용)**: 타이틀바 📝 → 모달(등록/목록 탭)에서 운영자가 수정·개선 요구를 남기면 `dev_requirement`(+`dev_requirement_image`) 테이블(54-테이블 설계 외 운영 도구, 멱등 생성)에 저장 — 이후 개발 처리 라운드에서 일괄 반영 후 완료 처리. **스크린샷 첨부**: 파일 선택 또는 Ctrl+V 붙여넣기(png/jpg/gif/webp·10MB, MinIO dev-req/, 목록 행 펼침=썸네일 blob 표시, 삭제 시 객체 연쇄 정리). `GET /config` devMode 게이트(`EDIM_DEV_MODE=1` — 서버 backend/.env, 운영 배포에서는 버튼 자체 미노출), 등록=전 사용자·상태변경/삭제=SETUP+, 현재 화면 컨텍스트 자동 첨부. 라이브 20검증(tests/live_dev_requirements.py, 자체 정리)
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
2. ~~착수 문서 3종~~ — ✅ 완료 (2026-07-11, v0.1: 사업수행계획서 MD·위험관리대장 xlsx 14건·보안관리계획서 MD)
3. ~~배치 정의서 · 보고서/양식 정의서~~ — ✅ 완료 (2026-07-11, 통합본 v0.2: 배치 잡 JOB-01~08 + 양식 RPT/FORM — 고객 양식 확정 시 v0.3)
4. edim-web 잔여 모듈 화면 구현 (Code Set-up·Toolbox·ERP·공통·Mobile — 전 화면 dense 확정) + mock→실 API 전환(FastAPI + 서버 PG 54테이블)
5. `ANTHROPIC_API_KEY` 설정 → 앱 AI 샘플 모드 해제
6. 번역 콘텐츠 제작 (sys_translation en/ja/zh 실데이터) — **UI 크롬은 v34.9~ N7 시드 단일화 진행 중**(t() 키 전수 시드·check_i18n_en Next 개편); 잔여 = 데이터 콘텐츠(품명·문서 제목 등) 번역 트랙
7. 고객 협의 대기: 보안 솔루션 범위 · DUCT 사업 범위 · ERP 자체구현/연계 경계 · WBS 시작일(현재 2026-08-03 가정) · Digital Twin 연계 스펙 · ODA 라이선스
8. **라이브 스위트 현대화 백로그 (v34.8 트리아지 잔여)** — 레거시 SPA 시대 F계열 스위트를 Next 실UI 로 재작성: f4(무반응 일소 — 관계 승인·SubCode·Table·PrintSetup·코드 상세·문서함 F8), f5(마스터 수정), f6(통합 검색→⌘K), f7(이력 diff→감사 before/after), f8(그리드 정렬), f9(Escape 표준), security(사용자 메뉴·비밀번호 다이얼로그), dev_requirements(요구사항 접수 — Next 이식 여부 판단 필요). 기능이 Next 에 없는 항목은 패리티 갭으로 구현 우선

---

## 5. 변경 이력

| 일자 | 내용 |
|---|---|
| 2026-07-15 | **Next.js SSR 컷오버 완료** — 메인 웹 콘솔 = `edim-web-next`(컨테이너 :3000, nginx `/`→Next 프록시, 라이브 스모크 13/13). 레거시 React SPA 는 `/edim-static` 롤백 자산. 신 autodeploy(backend+web-next health-gate) 설치. 상세: MIGRATION_NEXTJS.md P6 |
| 2026-07-15 | C3 완료(v16.0) — 월별 매출·기여마진 추이(`/erp/analytics` monthlyOrders + Next Dashboard 패널). PCR PDF 는 v15.3 기구현 확인. auto-next 프롬프트 Next 시대 갱신(신규 프론트 작업=edim-web-next) |
| 2026-07-15 | C5 완료(v16.1) — CI `backend-db` 잡(postgres 서비스): 승인 전이·창고 계층 DB 테스트 8케이스 + 커버리지(33%). **CI 적색 복구**(edim-web 리네임 경로) + `web-next-build` 게이트 신설 |
| 2026-07-15 | v16.2~16.3 — 폴백 e2e 65/65 복구(lazy 렌더 경합 6건·Duct honest-write) + CI `web-next-e2e`: 메인 콘솔 풀스택 게이트(postgres+FastAPI+next start→스모크 13체크, 배포 전 SSR 회귀 차단) |
| 2026-07-15 | v16.4~16.8 — C13 RTM 명문화 · 모듈 루트 404 해소 · **앱 크롬 복원(v16.6)** · **기능 패리티 전수 감사(v16.7**, 쓰기 15/58 — 갭 문서+N1~N7 로드맵**)** · **N1 결재 복구(v16.8**: 승인함 단건/일괄·X-review·업무함 완료·이벤트 재배정/에스컬 — 라이브 결재 E2E·스모크 23/23**)** |
| 2026-07-15 | **N2 PLM 대장 CRUD 복구(v17.0~17.1)** — 도면(등록·Rev-up·단계승인·Supersedure, 라이브 E2E 등록→Rev.B→WRITE✓)·부품(등록+공급자 매핑)·ECR 등록·Arrangement M-4-2 복원·검증규칙 등록. Kind 검증 정합 수정. 스모크 28/28 |
| 2026-07-15 | **N3a ERP 대장 CRUD 복구(v17.3~17.5)** — 프로젝트(등록·단계 전이·삭제)·수주(견적 발송/수주/실주+후속 TODO)·마일스톤·환율세금(+계산기 스키마 수정)·창고(라이브 E2E 등록→삭제✓)·작업지시·이상이벤트(+**잠복 SSR 500 수정**). 스모크 35/35. 잔여 N3b=구매·PO·재고·검사·단가 |
| 2026-07-15 | **N3b ERP 공급망 복구(v17.7)** — 구매 QCR/PO 조건 발주·발주 라이프사이클(라이브 E2E: 생성→승인→부분입고 50%)·재고 예약/해제/ATP/이력·검사 등록+성적서 PDF(라이브 E2E: 등록→PDF 200, /api/qc nginx 라우트 추가)·단가 등록/Import/마감. 스모크 40/40 — **N3 전체 완료** |
| 2026-07-15 | **N4 관리자·Code 복구(v17.9)** — 사용자·권한 전면(대장+등록/잠금해제/레벨/활성 + 권한 매트릭스 셀 토글·역할 CRUD — 라이브 E2E: 사용자 등록→레벨→역할 생성/삭제) + 제품코드(등록/전이/삭제)·배리언트(등록/수정/폐기)·재질(등록/수정). 스모크 44/44. 잔여 N4b=subcode·datatable·Hierarchy |
| 2026-07-15 | **N4b Code 마감(v18.1)** — subcode(중복검토 게이트→승인·Excel 왕복)·datatable(행 편집/추가/삭제·Excel — 라이브 E2E 왕복)·**Hierarchy 트리 신설**(M-3-1 복원) + `/api/next/` 공용 프리픽스(XLSX 프록시·nginx 1회 라우팅). 스모크 47/47 — **N4 전체 완료** |
| 2026-07-15 | **N5a 문서 파이프라인 복구(v18.3)** — 문서함(등록→PDF 렌더→메타 수정 라이브 E2E)·PCR 보고서 그리드+PDF·Project Folder(업로드/개별·ZIP 다운로드/DXF 드릴다운)·Run 산출물(다운로드+상세) + `/api/next/bin` 바이너리 프록시. 스모크 50/50 |
| 2026-07-16 | **N5b 스튜디오·PDF 복구(v18.5~18.7)** — Macro Studio(식 편집·Test Run 실평가 라이브 E2E·저장·승인)·Templet 편집기(+잠복 SSR 500 수정)·Run 정리/MinIO GC·Fan 성능표/밀도 PDF·사양 Excel·견적 미리보기. 스모크 55/55 — **N5 전체 완료** |
| 2026-07-16 | **GDrive 재동기(v18.6)** — 사용자 Drive 파일 삭제 후 `tools/gdrive-sync.mjs` 신설(멱등: 동일명 files.update, id·공유 링크 불변)·30파일 재업로드(xlsx→Sheets 12·pptx→Slides 1·PDF 17). 이후 변경분은 사용자 트리거 시 재실행 |
| 2026-07-16 | **N6 셸 전역 복구(v18.9)** — ⌘K 통합검색(화면+코드·문서·파일·부품·프로젝트 딥링크)·전역 단축키(Alt+W/←→/1~9·Ctrl+K)·useFKeys 수신 체계(Macro F12/F9·Table F12/F3)·비밀번호 변경(B8). 라이브 E2E: Ctrl+K 포커스·Alt+← 탭·F9 평가. 스모크 56/56 — **패리티 감사 P1 35건 전량 해소 (N1~N6 완료)** |
| 2026-07-19 | **F계열 스위트 현대화 완주(v34.14~18)** — EN 크롬 잔존 0(check_i18n_en 33화면 PASS), 보안 27/27(사용자 메뉴·비밀번호 다이얼로그 표준화)·요구사항 21/21·f8/f9 그린. ⌘K F6 그룹 확장(공급처·창고·Macro·사용자), 감사 조회 필드별 diff 하이라이트(F7 이식), f4 무반응 일소 Next 재작성. **실버그 발견·수정**: 거래처 더블클릭 시 ?sel RSC 네비가 이후 폼 액션을 무효화 → 클릭/더블클릭 판별(260ms 지연 네비) |
| 2026-07-19 | **F5/devreq 이식(v34.13)** — 거래처 더블클릭 수정 다이얼로그(평가등급·결제조건, PUT — F5 스위트 UI 경로 복원) + 요구사항 접수 📝 전체 이식(devMode 게이트 타이틀바 버튼·등록/목록 모달·이미지 첨부(Ctrl+V/파일)·상태 변경·bin 프록시 이미지 표시) + CompanyGrid 크롬 t() 래핑(EN 잔존 마지막 7건). V32 33키 |
| 2026-07-19 | **CAD 뷰어 편집 실배선 + i18n 709키(v34.11~12)** — 뷰어 onEdit 미전달로 편집 도구 전체 no-op 이던 미구현 해소(작도·마퀴·트림 영속 — CAD 스위트 6종 전부 그린). t() 신설 709키 전수 번역 시드(V30, 누락 0 검증) → 번들 1,847키. EN 크롬 잔존 259→7건 |
| 2026-07-19 | **CAD 축척 PDF 이식 + N7 i18n 1차(v34.9)** — CadViewer ✎ 토글 마커+축척(1:50/100/200) 🖶 PDF(plot.pdf, bin 프록시 kind=cadplot). i18n: 라이브 EN 스캔 잔존 143키(V27)+Next 포팅기 직접 추가분 177키 시드 회수(V28, 유실 0 대조) → bundles 1101키 재생성·로그인/로그아웃 서버 번역. check_i18n_en 을 Next 네이티브(쿠키 로케일·실 라우트 33화면)로 개편 |
| 2026-07-19 | **라이브 전 스위트 완주 + 트리아지 1차(v34.8)** — live_all 57스위트 완주(21 그린)→실패 36 분류: Next 실회귀/미이식 5건 복구(/files 최신순 — 페이지네이션에 신규 업로드 은닉으로 CAD UI 6종 전멸 원인, 제품코드 인라인 편집, 부품 대장 rowActions, 승인함 유형 필터·검색, moduleOfPath 메뉴 소유 모듈 판정) + 테스트 드리프트 4건 현행화(빈 상태 표준행·필터 글리프·CLT 양식·열 오프셋) + 잔재 업로드 15건 정리. 재검증: inline·ctxmenu·report_center·f10·g2 3종 그린 |
| 2026-07-19 | **PW 통합 스윕 상설화(v34.7)** — 1~5차 스윕을 tests/live_pw_sweep.py 로 통합(전 60화면 로드+상호작용·공휴일 쓰기 왕복·결재 체인·명령줄, 정리 내장)·live_all 선두 등재. 첫 실행 7/7 PASS |
| 2026-07-19 | **미구현 스텁 스캔 + 명령줄 배선(v34.4~5)** — 프런트 스텁 전수 스캔(후속/mock/TODO): 실제 미구현 1건 발견 — Design Editor 명령줄이 에코만 수행 → s61 단축 명령(RO/MI/CO/E/TR/EX/DI/REG/CH/MOVE)→CAD 도구 실행 배선 + 도구 전환 무음 보완. 라이브 3/3(RO 실행·미지원 안내·전환 안내). 그 외 스텁은 정직 폴백 확인 |
| 2026-07-19 | **Playwright 5차 스윕 — Run 파이프라인 UI 왕복** — 견적안 저장(#14)→Run ▶→단계 완료·산출물 3건(다운로드)·JS 예외 0. 정리 시 보호 가드 2종 정상 발동 확인(최신 SUCCESS Run 409·Run 참조 견적안 409 — 설계 검증): run 86 이 신규 기준(기본 사양 동일, 직전 85 와 동등)으로 유지. 이슈 없음 |
| 2026-07-19 | **Playwright 4차 스윕 — 결재 흐름 UI 왕복** — Hierarchy 스트립 승인 요청 → 승인함(M-15-2) 행 표시 → 다중선택+의견 입력 → 반려 결재 → 목록·서버 제거 확인. 5/5 통과·잔존 0·이슈 없음 |
| 2026-07-19 | **Playwright 3차 스윕 — UI 쓰기 왕복** — 캘린더(공휴일 등록→행 확인→삭제)·Macro Studio(저장→목록→삭제)·데이터 Table(행 추가→F3 삭제) 3시나리오 UI 경로 전부 통과, JS 예외 0·잔존 데이터 0. 발견 이슈 없음 |
| 2026-07-19 | **Playwright 전수 스윕 + 수정(v33.9, 사용자 지시)** — 메뉴 전 60화면 자동 스윕(콘솔/JS 예외/실패 요청/오류 문구): 이슈 1건 /erp/process 500(process-defs {defs} 언랩 누락) 수정·라이브 확인, 2차 상호작용 스윕(모달 열기/닫기·행 클릭) 60화면 무결, 해당 화면 스모크 편입 83/83 |
| 2026-07-19 | **U34b·UI 수정(v33.4~6, 사용자 리포트 2건)** — ① 편집 초안 폴더 자동 주입(부분 마커 시 루트 구간만 주입·사용자 폴더 보존): 라이브 27행(그룹5+#test+리프21 전량) ② 등록 트리거 버튼 폭 fit-content(캘린더 57px). 크레딧 프로브는 사용자 지시로 중단 상태 |
| 2026-07-19 | **레거시 SPA 중단 + U34 폴더 추가(v33.1, 사용자 지시 2건)** — ① /edim-static 410 봉인·배포 동기화 차단(파일 보관) ② 메뉴 커스텀 폴더('#이름' 마커, 백엔드 무변경): SSR 폴더 트리·모달/관리 화면 📁 추가. 라이브 검증·원복 완료 |
| 2026-07-19 | **의존성 판정 갱신(최종)** — audit moderate 2건의 근원은 단일(next 가 고정한 postcss 8.4.31 <8.5.10 XSS, next 항목도 via postcss). 최신 안정판 next 16.2.10 도 동일 고정 → 메이저 업그레이드 보안 실익 0 확인, 시도 중단(무변경). 수정은 next 16.3 라인(현 preview 만) — **16.3 안정판 출시 시 패치 업그레이드**로 재분류. 실질 위험: 빌드타임 CSS 처리 이슈로 런타임 노출 미미 |
| 2026-07-19 | **의존성 보안 판정 확정** — moderate 2건(next 자체 취약점: 16.3-canary 이전 전 버전 대상 · postcss XSS: next 가 8.4.31 고정 의존) 모두 semver 호환 수정 불가 → next 16 메이저 업그레이드 단일 트랙으로 수렴(별도 검증 필요, 협의 유지). npm audit fix 시도 무변경(lock 청정). AI 크레딧: 여전히 미충전 |
| 2026-07-19 | **회귀 스모크 5차 — 82/82 그린** — U10 관련 코드 칩 SSR·related-codes API 계약 추가. AI 크레딧: 여전히 미충전 |
| 2026-07-19 | **U10 3단계 — 도면-코드 자동 연결(v32.6)** — related-codes 매칭·CAD 뷰어 🔗 칩(SSR). 라이브 E2E 5/5. AI 크레딧: 여전히 미충전 |
| 2026-07-19 | **U10 2단계 + 메뉴 SSR(v32.3~4)** — 도면 텍스트 인덱스(0026)·Q&A 도면 내용 검색(라이브 50건 인덱스·검색 적중) · 메뉴 커스텀 SSR 전환(사용자 지시: 첫 HTML 부터 커스텀 트리, JS 미실행 검증·스모크 80/80). 검증 중 배포 재기동과 겹쳐 테넌트 목록이 일시 훼손(3→0항목)됐으나 menus.ts 파싱으로 사용자 저장 21항목 정확 복원 |
| 2026-07-19 | **U10 선행 + 스모크 4차(v32.1)** — 내부 Q&A에 도면 대장 검색 통합(KDCR 질의 → 도면 3건 근거), 스모크 80/80 그린(AI 화면 마커, &amp; 이스케이프 마커 교정). AI 크레딧: 여전히 미충전 |
| 2026-07-19 | **U28 1단계 — 내부 Q&A(v31.9)** — /toolbox/assistant: 내부 자산 검색 근거+답변(항시)·live Claude 합성 대기. 라이브 E2E 8/8 |
| 2026-07-19 | **U7 실행분 — Prompt→Macro 배선(v31.7)** — Macro Studio 🤖 AI 생성(식 삽입·모드 배지), 크레딧 충전 시 자동 live. 라이브 E2E 5/5. U7 잔여=모드 변환·Q&A(라이브 전환 후)·인터넷 검색(협의) |
| 2026-07-19 | **개인 설정 가림 경고(v31.5)** — 테넌트 메뉴 관리에 현 계정 개인 설정 ⚠ 경고+모듈 단위 해제 버튼(재발 방지). 라이브 E2E 5/5. AI 크레딧: 여전히 400·스모크 78/78 재확인 |
| 2026-07-19 | **커스텀 메뉴 폴더 보존(v31.3, 사용자 리포트)** — 커스텀(개인/테넌트) 좌측 메뉴가 평탄화되던 것을 폴더 구조 유지(포함·순서만 적용, 빈 그룹 생략)로 수정 + menu.erp-tenant-menu 3로케일 시드. 진단: 개인 leftnav에 전체 목록 중복 저장(실험 잔재)이 테넌트 제어를 가림 → 개인 키 정리(테넌트 erp 21항목 유지). 라이브: 폴더+테넌트 목록 렌더 확인 |
| 2026-07-19 | **회귀 스모크 3차 확장 — 78/78 그린** — U32 스트립(2화면)·U33 관리 화면 마커 추가. AI 크레딧 재확인: 여전히 400(미충전) |
| 2026-07-19 | **U33 테넌트 메뉴 관리 화면(v31.0, 사용자 지시)** — M-14-6B: 모듈×대상 매트릭스·목록 편집·테넌트 저장/해제 통합 화면. 라이브 E2E 7/7(개인 우선 규칙 검증 포함, 설정 원복) |
| 2026-07-19 | **U32 2단계(v30.8)** — Product Code에 ApprovalStrip 확산(승인함 경유 요청 경로). 라이브 E2E 4/4. AI 크레딧 재확인 — 여전히 400(미충전) |
| 2026-07-19 | **ANTHROPIC_API_KEY 설치 + U32 Approval 스트립 1단계(v30.6)** — 키를 backend/.env(600)에 설치·컨테이너 반영·클라이언트 인증 확인, 단 API 크레딧 부족(400)으로 AI 3종 대기(충전 시 즉시 라이브·sample 폴백 정상). U32: 공용 ApprovalStrip(상태 칩·✍ 요청·📥 승인함)+Hierarchy 패널 장착 |
| 2026-07-19 | **추적성 매트릭스 종결판 생성** — docs/EDIM_원본PPT_추적성매트릭스.md: U1~U31 전 31건 요구→구현 버전→완료/잔여→차단 사유 자동 파생(완료 72·잔여 22 항목, 잔여 전건 외부 입력 대기 분류), 검증 방법론 명기 |
| 2026-07-19 | **U31 확산(v30.3) — U31 완결** — 계산서·기술자료 계열에도 WI 공통 헤더, 문서 렌더 3계열 양식 통일. 라이브 마커+회귀 검증 |
| 2026-07-19 | **회귀 스모크 2차 확장 — 75/75 그린** — U8 덕트 수동 조정·U29 3D 뷰어 SSR 마커 + U30 테넌트 메뉴·U27 공학 함수 API 계약 검사 추가, edimsol.com 전체 통과 |
| 2026-07-19 | **원본 PPT 9차 재대조 + U31 문서 헤더(v30.0)** — s09 WORK INSTRUCTION 공통 양식 표(6열 메타+Title) 발굴·구현, 문서 PDF·CLT 견적서 적용. 라이브 E2E 6/6(마커+회귀) |
| 2026-07-19 | **U30 확장 — 헤더 드롭다운 테넌트 기본(v29.8)** — /tenant/headnav·3단 해석·헤더 편집 모달 🏢 저장. 라이브 E2E 5/5(원복 포함) |
| 2026-07-19 | **U25 차트 문서 연계(v29.6) — U25 완결** — 차트 SVG 다운로드·인쇄 창. 라이브 E2E 5/5 |
| 2026-07-19 | **U8 덕트 수동 조정(v29.4)** — 자동 배치 편집 대상화(/cad/duct-layout/save)+U2 편집 트랙 통합(이동/삭제/트림 영속). 라이브 E2E 6/6. U8 잔여=건축도 판독(U10 AI 의존)만 |
| 2026-07-19 | **U30 테넌트 기본 좌측 메뉴(v29.2, 사용자 지시)** — 관리자가 메뉴 패널 구성 지정(/tenant/leftnav)·개인>테넌트>전체 3단 해석·편집 모달 🏢 저장 버튼. 라이브 E2E 7/7(원복 포함) |
| 2026-07-19 | **운영 감사 (유지보수 트랙)** — ① 라이브 로그: 금일 백엔드/DB 오류 0건(어제 흔적 3건은 v22.1 등에서 기수정), 컨테이너 전체 정상 기동 ② 성능: 주요 18화면 warm TTFB 전건 0.4s 이내·전건 200 ③ npm audit: moderate 2건(next 프레임워크 권고 — 업그레이드는 별도 검증 트랙으로 보류) |
| 2026-07-19 | **원본 PPT 8차 조사 + U29 3D 뷰어(v28.9)** — 내장 미디어 242건 스캔 → 18MB glTF 제품 3D 모델 발굴·정본 등재, three.js 3D 뷰어(/detail/model3d, 궤도 컨트롤)·CAD 뷰어 진입 링크 |
| 2026-07-19 | **회귀 스모크 확장 — 70/70 그린** — v25~v28 신규 기능 마커 11화면 추가(위젯 Set-up·Hierarchy 점검·Relationship 소품·헤더 편집·채번 규칙·함수 마법사·차트·SWP Child·분할통합·SYNC·Block 패널·설계 파라미터), edimsol.com 전체 통과 |
| 2026-07-19 | **U2 파라메트릭 전면 동기(v28.6) — U2 전 항목 완결** — 치수 변경 디바운스 자동 재작도·저장본 동시 갱신·SYNC 토글. 라이브 E2E 6/6(기하 해시 왕복 검증). CAD 심화 트랙 잔여=U1 6면 뷰(도면 자료 대기)만 |
| 2026-07-19 | **U2 Block 저장·호출(v28.4)** — Block 등록/목록/호출 API·INSERT 전개 렌더(b-id)·Design Editor Block 패널. 라이브 API 8+UI 5 검사(오류 가드 3종 포함). U2 잔여=파라메트릭 전면 동기만 |
| 2026-07-19 | **U2 UCS 사용자 좌표계(v28.2)** — CAD 캔버스 ⌖ UCS(클릭 원점 지정·스냅·마커·상대 좌표 판독·해제). 스냅/대칭/회전 편집은 G1~G2 기구현 확인 체크. 라이브 E2E 7/7. U2 잔여=파라메트릭 전면 동기·Block 상위 호출 |
| 2026-07-19 | **U1 3단계 분할/통합(v28.0)** — C-1 구성 모듈 분할 ⫽·통합 ⊞·SPLIT/MERGE 명령·RESET 복원(레이아웃 영속). 라이브 E2E 6/6. U1 잔여=6면 뷰(도면 DB 6면 자료 등재 시)만 |
| 2026-07-19 | **원본 PPT 7차 조사 + U27 공학 함수(v27.8)** — 발표자 노트 51건 전수 추출(python-pptx) → U27·U28 발굴. U27 즉시 구현: 매크로 엔진 공학 함수 17종+카탈로그 동기+테스트 35/35, 라이브 E2E 9/9. U28(AI 내부 질의응답)=API 키 대기 그룹 |
| 2026-07-19 | **U25 그래프 마법사(v27.6)** — 데이터 Table 차트 위저드(시리즈 다중 선택·라인/막대·순수 SVG). 라이브 E2E 7/7. 이로써 PPT 발굴 태스크 U1~U26 전량 소진(잔여=협의·API 키 대기분) |
| 2026-07-19 | **원본 PPT 6차 조사 + U26 SWP 보강(v27.4)** — 잔여 미열람 전수 열람(78장 완료)·기구현 확인 → U26 등록·즉시 구현: Child Component 패널(mother→child 표+상세 딥링크)·Table Excel Import 진입점. 라이브 E2E 7/7(Import 왕복 원상 복구) |
| 2026-07-19 | **원본 PPT 5차 조사 + U24 함수 마법사(v27.2)** — 미열람 14장 검증(대부분 기구현 확인) → U24·U25 등록. U24 즉시 구현: Macro Studio ƒx 함수 마법사(검색·설명·삽입, /macros/functions 배선), 라이브 E2E 7/7. 잔여 U25 그래프 마법사(협의) |
| 2026-07-19 | **U23 문서 채번 규칙(v27.0)** — 테넌트 채번 규칙(JSONB 템플릿+부문)·allocate-code 규칙화·numbering-rule GET/PUT·등록 폼 자동 채번+규칙 편집. 라이브 E2E 10/10(발급→중복 회피→UI→원복) |
| 2026-07-19 | **U22 Hierarchy 정합 점검(v26.7~8)** — /hierarchy/validate 4종 검사(중복·고아·부모 불일치·루트 형식, 구분자 혼용 대응) + 패널 점검 버튼·이상 배너. 라이브 E2E 7/7(주입→탐지→정리 왕복) |
| 2026-07-19 | **U21 헤더 메뉴 사용자 편집(v26.5)** — /prefs/headnav 모듈별 목록·커스텀 드롭다운 재구성·✎ 편집 모달(LeftNavEdit 재사용)·기본값 복원. 라이브 E2E 9/9(편집→축소→영속→이동→복원→정리) |
| 2026-07-19 | **원본 PPT 4차 조사** — 미열람 슬라이드 19장 추가 시각 검증: 대부분 기구현 확인(도면 개정·CAD 측정·매크로 함수·밀도 계산·PR 재고체크), 잔여 갭 3건 등록(U21 Head 메뉴 사용자 편집·U22 Hierarchy 정합 점검·U23 문서 채번 규칙) |
| 2026-07-19 | **U16 UI Designer 액션·바인딩(v26.2)** — Widget Set-up 다이얼로그(동작 8종·대상·Data)·Combo 테이블 열 바인딩(/toolbox/bind-options 화이트리스트)·미리보기 실데이터 옵션·layout_def 영속. 라이브 E2E 8/8(원 레이아웃 원복) |
| 2026-07-19 | **U20 Relationship 소품(v26.0)** — Child Data 링크(코드 상세 딥링크)·구성도 블록/CAD 토글(정본 SVG 미리보기)·EBOM Run 표기+CSV Export. 라이브 E2E 5/5 |
| 2026-07-19 | **U19 PCR 비용 트리 + CLT 견적서(v25.8)** — breakdown API(원가 3분류 라인+판관 분해·Full costs·EBIT)·Report Center 트리 패널 · 견적 렌더 CLT 공식 양식 전환. 라이브 E2E 8/8(정합 4종·견적 생성→pypdf 마커 검증→삭제 왕복) |
| 2026-07-18 | **U18 Hierarchy 편집 심화(v25.5~25.6)** — 노드 이동(주소 접두 연쇄 재계산·순환/시스템/타트리 가드)·속성 정보·우클릭 컨텍스트 메뉴·트리 검색. 라이브 E2E: API 4/4(이동 901.1·순환 422)+UI 3/3(검색 9→1·메뉴·속성), 테스트 노드 전량 정리. psycopg % 이스케이프 500 즉시 수정 |
| 2026-07-18 | **U17 설계우선순위 테이블(v25.3, alembic 0025)** — dwg_dimension 미사용 컬럼 개방+error_check, Work Process 화면 Dim.별 편집 그리드(우선순위·상위자료·기준점·오류체크). 라이브 왕복 6/6(저장→영속→원복) — U3 잔여 해소 |
| 2026-07-18 | **원본 PPT 3차 조사(v25.2)** — 미열람 슬라이드(27·36·44·64·70·74 등) 추가 시각 검증 → 신규 태스크 5건 등록(U16 위젯 액션 바인딩·U17 설계우선순위 테이블 구체 UI·U18 Hierarchy 편집 심화·U19 PCR 세부 비용/CLT 견적 양식·U20 Relationship 소품) |
| 2026-07-18 | **D10 Next 이식 + 단축키 안내(v25.0)** — 관리자 표시 모듈(sys_menu_config)을 Next 셸에 적용: 타이틀바 모듈 필터·차단 모듈 진입 시 첫 허용 모듈 리다이렉트. P3 단축키 안내 다이얼로그(도움말, 8항목). 라이브 E2E 6/6(제한→2모듈·리다이렉트→원복) |
| 2026-07-18 | **U15 인쇄 다이얼로그(v24.8)** — Print Set-up 🖨 인쇄(렌더 PDF→숨김 iframe→OS 인쇄 다이얼로그, 옵션 반영). 라이브 E2E 3/3. Approval 툴바 표준화는 no-noop 원칙 상충으로 협의 대상 명기 — **U15 실행 가능분 전량 완료** |
| 2026-07-18 | **U1 2단계(v24.6)** — C-1 블록 회전(RO)·반전(MI)·스냅(10px) + CommandLine 실명령(ROTATE/MIRROR/SNAP/RESET), geom 영속 확장. 라이브 E2E 7/7(RESET 자체 정리) |
| 2026-07-18 | **PPT 대조 트랙 종합 마감(v24.5)** — v20.0~v24.4 배치 20+건 회귀 검증: 라이브 스모크 **59/59 전체 그린**(edimsol.com). 요약 스냅샷 갱신 — 완결 2군(U11·U14)·핵심 7군(U3·U4·U5·U6·U8·U9·U13)·1단계 2군(U1·U2)·U15 4/7. 잔여 = CAD 심화(U1/U2 2단계)·U15 3건·API키 대기(U7/U10)·협의(U12) |
| 2026-07-18 | **U2 1단계(v24.3)** — 설계 우선순위·순환 참조 자동 점검(Design Editor 패널: 치수 참조 위상 정렬·순환 경고, 휴리스틱 한계 명시). 라이브: 실치수 3 MACRO 평가 순서·참조 그래프 렌더 |
| 2026-07-18 | **U4 스케줄링·Capacity(v24.1)** — GET /erp/production/schedule(미완료 WO × U3 공정 공수) + D-3 패널(작업장 부하 바·WO 공수·경과일). **잠복 버그 수정**: D-3 이 /erp/work-process 를 조회해 WO 그리드 공백 → /erp/work-orders 정정. 라이브 왕복: WO-0001 발행→공수 135분·부하 28.1%→완료 정리 |
| 2026-07-18 | **U14 완결(v23.9)** — To-Do 패널 Done items(최근 승인 결과 3) + 미니 달력(마일스톤 납기 점 마킹·오늘 하이라이트). 라이브 E2E 6/6 — **PPT Schedule management 패널 원형 완성** |
| 2026-07-18 | **U1 캔버스 1단계(v23.6~23.7)** — C-1 모듈 드래그 배치(좌표 영속)+더블클릭 세부선정 모달(슬라이드 7 옵션 9종, 블록 라벨 요약). 발견·수정: Cvs 루트 pointer capture 가 파생 dblclick 을 리타겟해 onOpen 미동작 → 블록 자신 캡처로 수정. 라이브 E2E 7/7(드래그·영속·모달·옵션 저장·정리) |
| 2026-07-18 | **U11 완결(v23.4)** — 색상 테마 4종(파일 메뉴·data-theme 토큰·localStorage) + 회사 로고(sys_tenant.settings, ADMIN 다이얼로그·타이틀바). 라이브 E2E 6/6(테마 적용/영속/복원·로고 업로드/렌더/제거) |
| 2026-07-18 | **U8 Duct 심화(v23.1~23.2)** — 층 선택(1F~RF)·기술계산표(압력손실 f=0.019·SMACNA C Leak·Magnus 결로·자중/행거·풍량 비교 + 계산서 PDF)·Duct BOM(도면 라인 길이 합산 산출)→PR 연결. 라이브 E2E 7/7. 중복 i18n 키로 1회 빌드 게이트 롤백→즉시 수정 재배포(무영향) |
| 2026-07-18 | **U15 소형(v22.9)** — Fan Direction 8방향+Installation Code 선택기(Arrangement 등록, 슬라이드 38) · 성능 곡선 SVG(C-2 Pt/효율 비교, 점 클릭 선정 — P2 잔여 해소) · BOM 단가 병기 기구현 확인 정정. 라이브 E2E 7/7 |
| 2026-07-18 | **U9 QR 딥링크 + Project 중심 대화(v22.7, alembic 0024)** — QrBadge(현장 스캔→모바일 딥링크, 프로젝트·모바일 화면)·sys_project_comment 코멘트 스레드(본인/ADMIN 삭제 가드, 프로젝트 대장 업무 소통 패널). 라이브 E2E 9/9(등록→삭제 왕복·QR 캔버스 픽셀 검증·자체 정리) |
| 2026-07-18 | **U5 창고·자재 심화(v22.5, alembic 0023)** — 로트 유통기한(입고 입력·PATCH·EXPIRED/EXPIRING 경고 패널) · 창고 정기점검 실적(erp_wh_inspection, 위치 선택 패널) · 대체 자재(prt_part_substitute, 부품 대장 패널). 마이그레이션 라이브 자동 적용, E2E 왕복(테스트 데이터 정리 완료) |
| 2026-07-18 | **알림 드롭다운 제목 미표시 수정(v22.3)** — 타이틀바 내부라 흰 글자색을 상속해 흰 배경에 안 보이던 잠복 버그(사용자 스크린샷 제보). 드롭다운에 color/fontWeight/textAlign 명시. 라이브: 제목 rgb(30,34,42) 렌더 확인 |
| 2026-07-18 | **U4 MRP 1차 + 판넬 접기/펼치기(v22.0~22.1)** — GET /erp/mrp(수주 ORDERED 자재 라인 × inv_stock 현재고 → 부족·발주 권장일) + M-8-5 신규 화면(Purchasing 드롭다운) · 좌측 트리/우측 Sub Work Place **접기·펼치기**(localStorage 영속, 사용자 요청). 라이브 E2E 8/8. 수정: erp_stock→inv_stock 테이블명·/cost/orders 데코레이터 복원 |
| 2026-07-18 | **U13 우측 공용 패널(v21.8, Sub Work Place E-4)** — 공통 3종(Data Up-Load·Table 미리보기/딥링크·Coding 즉석 Run) + GET /tables 신설, Set-up 3화면(S-1-1·M-3-8·C-3) 장착. 라이브 E2E 4/4·업로드 테스트 파일 정리 |
| 2026-07-18 | **U6 Print Set-up 완성(v21.6, P2)** — 출력 옵션(용지 A4/A3/LETTER·방향·여백mm·글꼴pt·칼라/흑백·바닥글) 렌더 반영 + **Office(xlsx) 내보내기**(POST /render/xlsx). 라이브: A3 가로 MediaBox·xlsx 다운로드 검증. RenderOpts 공용화(기존 호출 호환) |
| 2026-07-18 | **U3 Work Process 공정 파라미터 + U11 판넬 리사이즈(v21.4, P2)** — 작업장·인원·Skill·W.Time·창고·안전재고·비고 인라인 편집+F12 영속(erp_work_process 기존 컬럼, 스키마 무변경) · 좌측 트리 폭 드래그 리사이즈(140~420px, localStorage). 라이브 E2E 6/6(저장→리로드 영속→정리, 리사이즈 영속) |
| 2026-07-18 | **U14 To-do 그리드 + F1 프로젝트 컨텍스트 + XLSX export 전반(v21.2, P2)** — To-Do 푸터→미니 그리드(승인 inbox 상위3·PL 지연·임박 마일스톤 상위3) · 타이틀바 활성 프로젝트(행 클릭 갱신·첫 프로젝트 시드) · 대장 XLSX 5종(단가·부품·도면·창고·거래처) 버튼+프록시. 라이브 E2E: 패널 실데이터·컨텍스트 갱신·XLSX 5/5 200 |
| 2026-07-18 | **네비게이션 개편(v21.0)** — 원본 PPT Head 메뉴 설계 반영: 모듈 그룹(Sales/Purchasing/Production/Finance/Company Info. 등)을 **상단 헤더 드롭다운**으로 이동(전 모듈, 3단계 그룹=섹션 헤더 평탄화) + **좌측 패널 = 사용자 정의 목록**(✎ 편집 모달: 재정렬·제거·추가·기본값 복원, /prefs/leftnav 서버 영속, ERP-016). 라이브 E2E 8/8(드롭다운 이동·편집 저장·리로드 영속·복원·⌘K/★/To-Do 회귀). **메뉴정의서 Google Sheet v0.3**(표시 규칙 갱신+표시 위치 컬럼 98행, Drive update — ID·링크 불변) |
| 2026-07-16 | **P2 배치 2(v20.4~20.5)** — **즐겨찾기(D8)**: 메뉴바 ★토글+칩, /prefs/favorites 서버 영속(+레거시 SPA 항목 필터) · **감사 조회 풀 포팅**: 필터(facet)·F8·선택 CSV·XLSX(kind=audit)·before/after 상세 · **대시보드 드릴다운**: KPI 타일(F10)+부서 Event 행(E4). 라이브 E2E 7/7 |
| 2026-07-16 | **셸 To-Do 푸터 + 상태바 승인대기 카운트(v20.2, P2)** — 좌측 트리 하단 To-Do(승인 확인=inbox·PL 지연=deptEvents delayed 합, 클릭→승인함/대시보드) + 상태바 승인대기 셀. shellCounts 서버액션·60초 폴링·edim-inbox-refresh 즉시 갱신·신규 키 EN/JA/ZH 시드. 라이브: 상태바 `승인 대기 3` 실데이터 |
| 2026-07-16 | **등록 모달 전환 + 거래처 P1(v20.0)** — 등록 폼 15화면 인라인→RegisterModal 모달(창고·마일스톤·작업지시·단가·발주·공휴일·사용자·거래처 + 도면·부품·ECR·Arrangement·제품코드·재질·문서). components/Modal.tsx 신설(ESC/백드롭 닫기·성공 시 자동 닫힘). **거래처: 공급처 평가 스코어카드**(이행지표+평가이력+평가 저장)·Excel 대량등록 복구 — 패리티 감사 22항 해소로 **P1 전량(35+거래처) 완료**. 등록 시 projectType 옵션(신규→Client/Stock/R&D) 잠복 버그 동시 수정. 라이브 E2E 4/4·테스트 행 DB 정리 |
| 2026-07-16 | **N7 i18n 재배선 완료(v19.2~19.4)** — 전 59화면 하드코딩 한국어 → t() (병렬 6에이전트, ~85파일). 서버=getLocale+translate·클라=useI18n, 모듈 cols 컴포넌트 이동. KO 폴백 유지·EN 전환 라이브 검증(File/Edit/Tools…). 신규 키 EN/JA/ZH 시드는 후속. 전체 빌드+스모크 56/56 |
| 2026-07-16 | **edimsol.com 도메인 추가(v19.1)** — nginx server_name 3도메인 + certbot 확장, http→https·auth 가드·스모크 56/56 라이브 검증(edimsol.com) |
| 2026-07-16 | **변경관리대장 Google Sheet(v19.3)** — tools/gdrive-change-register.mjs(create/read), 엔지니어 변경요청 기입 → 담당자 read 로 수집. Drive 원본 정본(sync 제외). 시트 공유 EDIM 루트 |
| 2026-07-11 | 착수 3종(사업수행계획·위험관리대장·보안관리계획) + 배치·보고서양식 v0.2 + 매뉴얼 3종(사용자·관리자·설치배포) — **협의 불요 문서 산출물 전량 완료**, 레지스터 완료 27/37, 포털 38파일 |
| 2026-07-07 | 최초 작성 — 산출물 21종 완료·포털 공개(Basic Auth)·PDF 파이프라인 구축 시점 |
