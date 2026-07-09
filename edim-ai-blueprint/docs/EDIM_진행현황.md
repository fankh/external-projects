# EDIM 진행 현황

> 프로젝트 상태 스냅샷 — 세션·담당자 인수인계용. 문서 체계·규칙은 [README.md](README.md) 참조.

| 항목 | 내용 |
|---|---|
| 기준일 | 2026-07-09 |
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
- **검증**: tsc 무오류 · Playwright 스모크 48/48 · 콘솔 에러 0
- **배포**: dist 커밋 → 서버 rsync `/var/www/edim/edim-static/` + nginx `/cpq` `/plm` `/code` `/erp` `/toolbox` `/common` SPA fallback

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
| `~/apps/external-projects/edim-ai-blueprint` | 앱 compose — edim-backend 127.0.0.1:8000 |
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
