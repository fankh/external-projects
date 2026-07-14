# EDIM — Next.js SSR 마이그레이션 계획 (Option B)

Vite React SPA(`edim-web/`) → **Next.js App Router SSR**(`edim-web-next/`) 이관.
결정(사용자 승인): **페이지-퍼-라우트(진성 SSR)** · **병렬 앱(strangler-fig)** · **기능 프리즈 후 이관**.

## 원칙
- 백엔드(FastAPI `/api/v1`)는 **불변**. 프런트만 이관.
- `edim-web/`(라이브)는 그대로 유지. `edim-web-next/`를 병렬 구축, 경로별 nginx 라우팅으로 점진 컷오버.
- MDI 다중 탭 → **URL 라우트**(`/erp/audit`, `/plm/drawings` …). 브라우저 네이티브 네비게이션.
- 인증: sessionStorage Bearer → **httpOnly 쿠키 세션**(서버 컴포넌트가 fetch 시 토큰 전달).

## 아키텍처
- **세션**: 로그인 서버 액션이 FastAPI `/auth/login` 호출 → 토큰을 httpOnly 쿠키(`edim_session`)에 저장. `middleware.ts`가 미인증 시 `/login` 리다이렉트.
- **서버 API**(`lib/api.ts`): 쿠키 토큰을 읽어 `Authorization: Bearer` 로 FastAPI 호출. 서버 컴포넌트/route handler 전용.
- **클라이언트 API**(`lib/apiClient.ts`): 브라우저 상호작용(필터·편집)용. 쿠키 자동 전송(same-origin) 또는 `/bff` 프록시.
- **i18n**: locale 쿠키(`edim_locale`) → 서버에서 읽어 SSR, 하이드레이션 불일치 없음. 번들은 빌드타임 baked(`lib/i18n/bundles.ts`, 기존과 동일 원천).
- **레이아웃**: `app/(app)/layout.tsx` = 앱 크롬(타이틀바·네비). 각 화면은 `page.tsx`(서버) + 상호작용 아일랜드(`'use client'`).

## 화면 이관 레시피 (59개 공통 패턴)
1. `app/(app)/<모듈>/<화면>/page.tsx` — 서버 컴포넌트. `lib/api`(apiServer) 로 초기 데이터 SSR fetch(`dynamic='force-dynamic'`).
2. 상호작용부(그리드 필터·정렬·편집·CAD)는 `<X>Grid.tsx`(`'use client'`)로 분리, 초기 데이터를 props 로 주입.
3. **뮤테이션(P4 확립)**: `actions.ts`(`'use server'`) — apiServer POST/PUT/DELETE → `revalidatePath('/…')`.
   - 등록/수정 폼: 클라이언트 `useActionState(action)` → 에러/성공 state 표시, 성공 시 revalidate 로 그리드 자동 갱신.
   - 행 삭제/토글: 클라이언트에서 서버액션 import → `useTransition` + `router.refresh()`.
   - 확인 다이얼로그(파괴적): `confirm()` 또는 공용 다이얼로그.
4. 브라우저 전용 API(localStorage·window·canvas·getScreenCTM)는 클라이언트 아일랜드 내부로만.
   레퍼런스: `/erp/holidays`(read+write 서버액션 완성).

## 공유 컴포넌트 이관 (기반)
`DenseGrid`(그리드), `CadSvg`(CAD 편집), `Cvs`, `controls`, `chrome`, `cadBridge/cadOps`, i18n, hooks.
대부분 `'use client'` 경계. DenseGrid·CadSvg 는 상호작용 무거움 → 클라이언트 유지, 초기 rows 만 SSR props.

## 단계 로드맵
- **P1 — 기반 + 레퍼런스 화면(현재)**: 스캐폴드·쿠키 인증·미들웨어·서버/클라 API·i18n·앱 레이아웃 + 1개 화면(ERP 감사/변경이력) SSR. `next build` 통과.
- **P2 — 공유 컴포넌트**: controls·chrome·DenseGrid·CadSvg 이관(클라이언트 아일랜드화). 좌측 네비/타이틀바 완성.
- **P3 — 읽기 위주 화면(~25)**: 대장·조회·리포트·대시보드. SSR 이득 큰 것부터.
- **P4 — 상호작용 화면(~25)**: 편집 폼·CPQ Run·CAD·Toolbox. 서버 액션 뮤테이션.
- **P5 — 인증/권한 심화**: 역할 가드(미들웨어+서버), 알림, 프리퍼런스.
- **P6 — 배포/컷오버**: Node 런타임(Docker) + nginx 경로별 라우팅(이관 완료 경로는 next, 나머지 legacy) → 전면 컷오버.

## nginx 컷오버 (P6)
```
location /erp/audit { proxy_pass http://edim-next; }   # 이관 완료 경로
location / { try_files ... /edim-static/index.html; }   # 미이관 = legacy SPA
```
경로별로 next 앱에 프록시, 이관 완료 시 legacy 제거.

### ⚠️ 사용자 지시: "이관 완료 후 nginx 중지"
- **조건**: 59화면 전부 이관 완료(컷오버) 시점에만 실행. 현재 10/59 → **미실행**.
- **주의(실행 전 확인 필요)**: 현재 nginx 는 단순 정적 서빙이 아니라 ① TLS 종단 ② Basic Auth(`/etc/nginx/.edim_htpasswd`) ③ `/api/v1` → FastAPI 프록시 ④ `/docs`·`/minio`·`/jenkins` 등 라우팅을 담당. `systemctl stop nginx` 를 문자대로 하면 사이트·API·TLS 전부 중단됨.
- **권장 해석**: "정적 SPA 서빙 역할의 nginx 를 걷어낸다" = Next.js Node 서버(`next start`, Docker)가 앱을 서빙하고, **nginx 는 리버스 프록시(TLS·auth·/api 유지)로 축소** 하거나, Next 앞단에 별도 리버스 프록시로 대체. 완전 중지는 TLS/백엔드까지 내려가므로 컷오버 시 사용자와 최종 확인.
- 컷오버 체크리스트에 반영. 실행은 마이그레이션 완료 + 사용자 재확인 후.

## 리스크
- 하이드레이션 불일치(상호작용 앱의 고전적 시간 소모원) — 화면별 E2E 로 방지.
- 인증 쿠키/CSRF — 서버 액션 + SameSite=Lax.
- MDI UX 상실 → URL 네비로 대체(사용자 승인). 최근/즐겨찾기로 다중 창 감각 일부 보완.

## 현황
- **P1 완료** — 기반(쿠키 인증·미들웨어·서버 API·i18n·앱 크롬) + 레퍼런스 화면 `/erp/eco-ledger`. 런타임 SSR 실증.
- **P2 완료** — 공유 컴포넌트 전부 이관: `controls`·`DenseGrid`·클라이언트 i18n·**`CadSvg`(최난도)**·`cadBridge`·`cadOps`. 하드 의존성 클리어. 남음: `Cvs`(블록 캔버스, 필요 화면 시).
- **P3 완료** — 전 59개 화면 이관 완료. 레시피 정착(page.tsx SSR fetch + `'use client'` 아일랜드, `ScreenHeader` 공용). 최난도 CAD 에디터(Design Editor·UI Designer·Selection) + 비동기 Run 파이프라인 + 바이너리/멀티파트 Route Handler(CAD import/export·PDF 렌더·견적서) 포함.
- **CPQ Run 39/59**: **비동기 파이프라인** — 서버액션 `startRun`(POST 202)→`pollRun` 800ms 폴링 루프, 진행률·단계 그리드·산출물·로그. 비동기 패턴 실증(서버 액션이 백엔드 백그라운드 태스크를 폴링). CostPanel(cst_calc·PCR·견적 확정)은 후속 슬라이스.
- **이관 43/59 화면**: +tech-data(`/tables/tech-data?airflow=&pressure=` 성능표, Enter 재조회)·eco-change(`/eco/changes` ECR/ECO 대장)·variant(`/codes/values?group=` 배리언트 상수, ?group= 전환)·projects(`/projects` 대장).
- **이관 45/59 화면**: +bom-compare(`/codes/bom-compare?base=&target=` 추가/삭제/변경 3분할 diff, Enter 비교)·detail/part(`/parts/detail`+`/drawings/{no}/bom` 병렬 — 속성·공정·치수바인딩·BOM 드릴다운).
- **P2 추가 이관**: **`Cvs`(블록 캔버스, 줌/팬/드래그 이동/CommandLine)** 이관 완료 — `@/lib/cadTypes`·`@/components/I18nProvider` 로 리포인트. design-editor·ui-designer 언블록.
- **이관 46/59 화면**: +code-relationship(Cvs 구성도 + Child 그리드 + Running Test/Add Child/승인요청 = 서버액션 3종). write 7(+running-test·relationship POST·approval).
- **이관 48/59 화면**: +data-i18n(`/i18n/data/{type}?locale=` 원문/번역 인라인 편집 → PUT 서버액션, 대상·언어 전환)·detail/event(`/erp/events`+`/erp/events/{id}/flow` — 이벤트 목록·상세·공정 흐름 prev→cur→next).
- **이관 50/59 화면**: +plm/quality(`/drawings/{no}/verifications` 규칙 그리드 + 활성 토글 PUT + 측정값 자동판정 `/verify` POST)·plm/work-process(`/erp/work-process/materials`+저장 오버레이 병렬, MAKE/BUY 토글 → PUT 저장). write 11.
- **이관 51/59 화면**: +detail/code(순수 SSR 드릴다운 — `/prices`·`/codes/{c}/referencers`·`/codes/{c}/slot-items`·`/codes/{c}/approval-history` 4병렬, Cvs 블록 프리뷰, 정직한 빈 상태).
- **이관 52/59 화면 — Design Editor(최난도)**: CAD 툴바 + CadSvg 편집(낙관적 이동) + Cvs 블록 캔버스 + 치수 Design Rule(인라인 편집) + Macro 평가(`/macros/evaluate`) + 파라메트릭 CAD 재작도(`/cad/part-drawing[/save]`·`/cad/view/{id}/edit`) + Simulation(What-if) + 임시저장/승인. **useEditHistory 훅 이관**(undo/redo). DXF 열기/내보내기 = Next Route Handler(`/api/cad/import`·`/api/cad/export`, multipart·바이너리 프록시 — JSON apiServer 불가분). SSR 초기로드: dimensions+part-drawing+blocks+relations+bom 병렬. write 많음(7 서버액션+2 라우트). 
- **이관 53/59 화면 — UI Designer**: Widget 팔레트 클릭 배치 + Object Inspector/Property Editor + 동적 렌더 미리보기 + layout_def 저장(`/toolbox/forms/{name}` PUT, version+1) + 게시 승인 + AI UI 초안(`/ai/ui-suggest`). useEditHistory(undo/redo) 재사용. SSR: 저장 레이아웃 복원. 두 최난도 에디터(design·ui) 완료. 
- **Run CostPanel 완결**: Run 성공 후 원가 상세(cst_calc)→PCR 수익성(`/cost/pcr`)→견적 확정(`/cost/quotations`, 통화·세금) 슬라이스. loadCostPanel 4병렬 서버액션 + 견적서 PDF Route Handler(`/api/cost/quotation-pdf`). Run 화면 기능 완비. 
- **이관 54/59 화면 — Selection(C-1)**: 슬롯 선택 → BOM 재전개(`/codes/products/expand` 재귀 CTE+slot_map) + 구성도 Cvs/CadSvg 토글(`/cad/arrangement`) + 견적안 저장/불러오기(`/cpq/selections`) + Run 실행(→`/cpq/run?selectionId=`) + CommandLine. SSR 초기: expand+selections+arrangement 병렬. 
- **이관 56/59 화면**: +doc-template(C-3 — Input→Macro 밀도 계산→습공기 선도 Cvs→Print, 공용 `/api/render/pdf` Route Handler + `lib/pdf` openRenderedPdf)·detail/output(G3-a — SSR register-output 채번→상태흐름 Set-up→Check→Approve→Accepted PATCH·워터마크 PDF). 공용 PDF 렌더 인프라 확보. 
- **이관 59/59 화면 — P3 완료** ✅: +print-setup(S-3-4 — 양식 자리표시자 캔버스·워터마크·PDF 실렌더·게시 승인)·mobile-preview(APP — 폰 프레임 3탭: 승인함 승인/반려·업무함 완료·입고 처리, 서버액션 revalidate). **전 59개 SPA 화면 이관 완료**(58 (app) 페이지 + /login). 전체 build 통과.
- **P5 진행 중 — 권한/역할 가드**: `lib/auth.ts`(SSR `getMe`·`getPermissions`·`hasLevel`) + `PermissionProvider`(클라 컨텍스트, me+perms 서버 시드, `canWrite`/`isAdmin`/`canReadAdmin`, LEVEL_RANK) + `AccessDenied`(서버 페이지 가드 표준). 레이아웃: me+perms SSR 로드→NAV `minLevel` 필터(roles·audit=SETUP 숨김)+타이틀바 사용자 표기. 페이지 가드: roles·audit `hasLevel('SETUP')` 미달 시 AccessDenied. 쓰기 게이팅 레퍼런스: CompanyForm `canWrite('company_master')` 로 폼 disable+사유 툴팁. **프론트=UX 게이팅, 서버 RBAC 이 실 가드**. 남음(P5): 알림·서버 동기 prefs.
- **P5 알림 + 쓰기 게이팅 확장**: `NotificationBell`(타이틀바 벨 — SSR digest 로 미읽음 배지 시드, 열 때 `/notifications` 로드, 항목 클릭=읽음 처리+링크 이동, 모두 읽음 `/notifications/read-all`) + `components/notifications/actions.ts`(list/digest/markRead/markAllRead 서버액션). 쓰기 게이팅을 holidays(`calendar`)·inventory(`inventory`)·cost-actual(`cost_actual`) 폼으로 확장(disable+🔒 사유). 
- **남은 작업**: P5 잔여(서버 동기 prefs — 현재 localStorage), **P6**(Node 런타임 배포 + nginx per-path 컷오버). ※현재까지 nginx 중지 = 빌드검증만, 런타임 배포 전.
