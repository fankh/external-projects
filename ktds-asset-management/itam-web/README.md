# SEEKERSLAB ITAM — AI 기반 IT 자산관리 플랫폼

`AI기반_IT자산관리시스템_제품안내서.pdf`(v1.0, 2026.07)를 구현 스코프로 한 웹 플랫폼.
자산 수명주기 관리 · Shadow IT Discovery · AI 자산 인텔리전스를 단일 플랫폼에서 다룬다 —
"발견되지 않은 자산을 찾아 대장에 편입시키는 것까지"가 관리 범위.

제품안내서가 정의한 **8대 업무 도메인의 명시 화면 25종**이 모두 구현되어 있다.

## 실행

```powershell
cd itam-web
npm install
npm run dev        # http://localhost:3000
```

로그인 화면에서 권한그룹별 목업 계정(SSO 대체) 4종 중 선택:
**사용자**(김민준) · **자산담당**(박자산) · **보안담당**(윤보안) · **Admin**(시스템관리자).
권한그룹에 따라 메뉴바·좌측 내비와 화면 내 기능(편입·격리·결재·정책 변경)이 다르게 노출되며,
모든 제한 화면은 `lib/authz.ts`의 서버사이드 가드로 직접 URL 진입도 차단한다.

## 테스트

```powershell
npm run build
npm run smoke      # 프로덕션 서버 기동 → 131개 검증 → 종료
```

`scripts/smoke.mjs`가 인증 리다이렉트, 라우트 × 권한그룹 접근 매트릭스(25 라우트 × 4 권한),
자산 대장 데이터 스코핑(사용자=본인 자산만), 주요 화면 콘텐츠 렌더를 검증한다.
라우트 권한을 바꿀 때는 **세 곳**을 함께 갱신해야 한다 — `lib/authz.ts`의 `requireRole`,
`components/chrome/menus.ts`의 `roles`, `scripts/smoke.mjs`의 `ROUTES`.

## 환경 변수 (선택)

| 변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | AI 어시스턴트·리포트 서술 실연동. 미설정 시 스토어 데이터 기반 **규칙 모드**로 동작 (edim 패턴) |
| `ANTHROPIC_MODEL_ID` | 기본 `claude-opus-5` |
| `ITAM_TODAY` | 플랫폼 기준일 고정 (`YYYY-MM-DD`). 미설정 시 **실제 현재 날짜**를 사용한다 — 만료 잔여일이 매일 줄고 신규 기록에 오늘 날짜가 찍힌다. 시연에서 특정 날짜 화면을 재현할 때만 지정 (시드 데이터 기준일: 2026-07-29) |

## 아키텍처

edim-ai-blueprint(`edim-web-next`)의 구조를 계승하되 현대화:

```
Next.js 15 App Router + React 19 + TS (UI 라이브러리 없음, qrcode 만 사용)
├─ app/globals.css            디자인 시스템 — 제품안내서 비주얼 랭귀지의 모던-덴스판
│                             (다크 네이비 · 로열 블루 · 자간 넓은 키커 · KPI 스탯 · 인쇄/모바일)
├─ app/login                  SSO 목업 — 권한그룹별 계정 선택
├─ app/(app)/layout.tsx       셸(AppShell) — edim AppChrome 계승: 타이틀바 · 모듈 메뉴바(LV1)
│                             · MDI 탭(방문 화면, localStorage 유지) · 모듈 좌측 내비(LV2) · 상태바
├─ app/(app)/<domain>/<screen>/
│    page.tsx                 서버 컴포넌트 — 스토어 조회 + 권한 가드/스코핑
│    actions.ts               서버 액션 — 편입·격리·결재·스캔·정책 변경 등 상태 변경
│    *View.tsx                클라이언트 컴포넌트 — 그리드·필터·상세 패널
├─ app/api/reports/[id]       결재 첨부용 리포트 다운로드 (CSV · Markdown, 권한 가드 포함)
├─ components/chrome          AppShell(메뉴바·MDI 탭·모듈 내비) · menus(권한 매핑)
├─ components/ui.tsx          ScreenHeader · Card · Stat · Chip
└─ lib/                       types(도메인 모델) · store(인메모리 시드) · session(쿠키)
                              authz(화면 권한 가드) · reports(리포트 산출) · label(QR·Code128)
```

데이터는 `globalThis` 싱글턴 인메모리 스토어(시드 데이터)로, 아래 폐쇄 루프가 실제로 동작한다.
실서비스에서는 자산 대장 RDB(CMDB)와 발견 저장소 분리 구조(제품안내서 §02)로 대체.

## 화면 ↔ 제품안내서 매핑 (25종)

| 도메인 | 경로 | 화면 | 안내서 |
|---|---|---|---|
| **Main** | `/dashboard` | 자산 현황·신규 발견·만료 임박·My Work | §01 |
| | `/board/notices` | 공지사항 (필독 고정 · 관리자 등록) | §01 |
| | `/board/qna` | QnA — 분류별 문의 · 담당자 답변 | §01 |
| **자산관리** | `/assets/register` | 자산 대장 (필터 그리드 + 구성정보·이력 타임라인) | §03 |
| | `/assets/lifecycle` | 수명주기 5단계 파이프라인 + 처리 대기열 | §03 |
| | `/assets/intake` | 도입·검수 — 체크리스트 · 자산번호 채번 · 라벨(QR/바코드) 발행 | §03 |
| | `/assets/disposal` | 폐기 — 대상 선정 · 결재 · 데이터 소거 · 증적 보존 | §03 |
| **재고·계약** | `/inventory/stock` | 재고 현황 · 재물조사 계획 | §03 |
| | `/inventory/survey` | 재물조사 수행 — 바코드/QR 스캔 실사 · 차이 조정 | §03 |
| | `/inventory/contracts` | 계약 만료 알림 · SW 라이선스 보유–사용 대사 | §03 |
| **Discovery** | `/discovery/found` | 6채널 발견 자산 + 편입/격리 요청 | §04 |
| | `/discovery/reconcile` | CMDB 대사 워크플로 · 대사 결과 4상태 | §04 |
| | `/discovery/saas` | Shadow SaaS 부서별 사용 현황 | §04 |
| | `/discovery/external` | 외부 공격표면 — 수동/능동 탐지 · CVE · 다크웹 유출 | §04 |
| **AI 인텔리전스** | `/ai/assistant` | 자연어 자산 질의 (권한 필터 · 근거 링크) | §05 |
| | `/ai/insights` | AI 5대 기능 · 제안 목록 | §05 |
| | `/ai/reports` | 리포트 자동 생성 5종 · 결재 첨부용 문서 산출 | §05 |
| **워크플로** | `/workflow/approvals` | 결재함 — 승인/반려 → 대장 환류 | §01·§03·§04 |
| **환경설정** | `/settings/permissions` | 권한 파이프라인 · 권한그룹 × 메뉴·기능 매트릭스 | §02 |
| | `/settings/users` | 사용자·그룹 · 화면별 기본 결재선 | §01 |
| | `/settings/codes` | 공통코드 6종 (사용/미사용 전환) | §01 |
| | `/settings/scan-policy` | 탐지 채널·스캔 정책 — 대역·시간대·강도 통제 | §01·§07 |
| | `/settings/saas-catalog` | SaaS 카탈로그 — 인가/차단 판정 | §01 |
| | `/settings/ai-policy` | AI 정책 — 실행 환경 · 거버넌스 · 감사 | §05 |
| **기타 (기반)** | `/platform/integrations` | 연동 커넥터 7종 · 수집↔조치 · 감사 로그 | §06 |

## 동작하는 폐쇄 루프

화면이 서로 연결되어 있어, 한 화면의 판정이 다른 화면의 상태를 실제로 바꾼다.

1. **발견 → 편입** — Discovery 발견 자산 편입 요청 → 결재 승인 → 자산 대장 등록
   (최초 발견 채널·일시가 자산 이력에 승계, 메뉴 뱃지 감소)
2. **발견 → 격리** — 격리 요청 → 보안담당 결재 → NAC 격리 조치 상태 반영
3. **입고 → 대장** — 검수 체크리스트 완료 → 자산번호 채번 → 대장 검수중 등록 + 라벨 발행
4. **실사 → 대장 보정** — 스캔 차이(위치·상태·미등록) → 조정 결재 → 대장 자동 보정 + 이력 기록
5. **폐기 → 증적** — 대상 선정 → 결재 → 데이터 소거 방식 기록 → 확인서 번호가 자산 이력에 영구 보존
6. **정책 → 운영** — SaaS 카탈로그 인가 판정 → Shadow SaaS 미인가 집계에서 제외 /
   탐지 채널 중지 → 상태바 커넥터 수(6/6→5/6) 즉시 반영
7. **문의 → 답변** — 사용자 QnA 등록 → 담당자 답변 → 상태 전환 + 감사 로그

라벨(QR·Code128)로 발행한 코드는 재물조사 스캔 실사에서 그대로 인식되어 3↔4가 연결된다.

## 데모 시나리오

1. **자산담당(박자산)** — Discovery › 발견 자산에서 미등록 자산 **편입 요청** →
   워크플로에서 **승인** → 자산 대장에 신규 자산 편입 확인
2. **자산담당** — 도입·검수에서 체크리스트 완료 → **채번** → 라벨 발행(인쇄) →
   재물조사 수행에서 그 자산번호를 스캔해 **일치** 확인
3. **자산담당** — 재물조사에서 다른 위치로 스캔 → 차이 발생 → **조정 결재 상신** →
   **Admin** 승인 → 자산 대장 위치가 실사값으로 보정됨
4. **Admin** — 환경설정 › SaaS 카탈로그에서 Notion **인가** → Discovery › Shadow SaaS에서
   미인가 집계가 줄어드는 것 확인
5. **사용자(김민준)** — QnA 질문 등록(답변창 없음) → **자산담당**이 답변 → 사용자 화면에서 답변 확인

## 배포

```powershell
docker build -t itam-web .
docker run -d --name itam-web --restart unless-stopped -p 127.0.0.1:3390:3390 \
  --env-file ~/.itam.env itam-web:latest
```

로컬호스트 바인딩이므로 접속은 SSH 터널을 사용한다 (`ssh -L 3390:localhost:3390 <host>`).
`--env-file`은 컨테이너 재생성 시에만 다시 읽히므로, 키를 바꾸면 `docker restart`가 아니라
`docker rm -f` 후 `docker run`으로 재기동해야 한다.

## v1 범위 제외

DB 영속화(컨테이너 재시작 시 시드 상태로 초기화), 실제 스캐너·커넥터 연동(NAC·EDR·CSP API),
SAML SSO 실연동, 전자결재 다단계 결재선 편집, 엑셀(.xlsx) 네이티브 출력(현재 CSV·Markdown).

## 관련 문서

| 문서 | 내용 |
|---|---|
| [`../docs/구축_요약.md`](../docs/구축_요약.md) | **구축 요약** — 구현 범위, 폐쇄 루프 7종 검증 결과, 설계 결정, 미완 항목 |
| [`../docs/샘플_리포트_설명.md`](../docs/샘플_리포트_설명.md) | AI 리포트 샘플 5종(문서·CSV) — 실제 생성한 결재 첨부용 산출물 |
| [`../docs/DISCOVERY_CONCEPT.md`](../docs/DISCOVERY_CONCEPT.md) | Shadow IT Discovery 초기 컨셉 (탐지 채널·파이프라인 설계) |
| [`../AI기반_IT자산관리시스템_제품안내서.pdf`](../AI기반_IT자산관리시스템_제품안내서.pdf) | 구현 스코프의 원천 — 제품안내서 |
