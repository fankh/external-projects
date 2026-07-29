# SEEKERSLAB ITAM — AI 기반 IT 자산관리 플랫폼

`AI기반_IT자산관리시스템_제품안내서.pdf`(v1.0, 2026.07)를 구현 스코프로 한 웹 플랫폼 스캐폴드.
자산 수명주기 관리 · Shadow IT Discovery · AI 자산 인텔리전스를 단일 플랫폼에서 다룬다 —
"발견되지 않은 자산을 찾아 대장에 편입시키는 것까지"가 관리 범위.

## 실행

```powershell
cd itam-web
npm install
npm run dev        # http://localhost:3000
```

로그인 화면에서 권한그룹별 목업 계정(SSO 대체) 4종 중 선택:
**사용자**(김민준) · **자산담당**(박자산) · **보안담당**(윤보안) · **Admin**(시스템관리자).
권한그룹에 따라 사이드바 메뉴와 화면 내 기능(편입·격리·결재 버튼)이 다르게 노출되며,
모든 제한 화면은 `lib/authz.ts`의 서버사이드 가드로 직접 URL 진입도 차단한다.

## 테스트

```powershell
npm run build
npm run smoke      # 프로덕션 서버 기동 → 60개 검증 → 종료
```

`scripts/smoke.mjs`가 인증 리다이렉트, 라우트 × 권한그룹 접근 매트릭스(12 라우트 × 4 권한),
자산 대장 데이터 스코핑(사용자=본인 자산만), 핵심 화면 콘텐츠 렌더를 검증한다.

## 환경 변수 (선택)

| 변수 | 설명 |
|---|---|
| `ANTHROPIC_API_KEY` | AI 어시스턴트 실연동. 미설정 시 스토어 데이터 기반 **데모 모드**로 동작 (edim 패턴) |
| `ANTHROPIC_MODEL_ID` | 기본 `claude-opus-5` |

## 아키텍처

edim-ai-blueprint(`edim-web-next`)의 구조를 계승하되 현대화:

```
Next.js 15 App Router + React 19 + TS (외부 UI 라이브러리 없음)
├─ app/globals.css            디자인 시스템 — 제품안내서 비주얼 랭귀지의 모던-덴스판
│                             (다크 네이비 · 로열 블루 · 자간 넓은 키커 · KPI 스탯 블록)
├─ app/login                  SSO 목업 — 권한그룹별 계정 선택
├─ app/(app)/layout.tsx       셸: 다크 사이드바(8대 도메인 내비) + 톱바 + 상태바
├─ app/(app)/<domain>/<screen>/
│    page.tsx                 서버 컴포넌트 — 스토어 조회 + 권한 스코핑
│    actions.ts               서버 액션 — 편입/격리/결재 등 상태 변경
│    *View.tsx                클라이언트 컴포넌트 — 그리드·필터·상세 패널
├─ components/chrome          Sidebar · Topbar · menus(권한 매핑)
├─ components/ui.tsx          ScreenHeader · Card · Stat · Chip
└─ lib/                       types(도메인 모델) · store(인메모리 시드) · session(쿠키)
```

데이터는 `globalThis` 싱글턴 인메모리 스토어(시드 데이터)로, 결재 승인 → 대장 편입 →
사이드바 뱃지 갱신까지 폐쇄 루프가 실제로 동작한다. 실서비스에서는 자산 대장 RDB(CMDB)와
발견 저장소 분리 구조(제품안내서 §02)로 대체.

## 화면 ↔ 제품안내서 매핑

| 경로 | 화면 | 안내서 |
|---|---|---|
| `/dashboard` | 자산 현황·신규 발견·만료 임박·My Work | §01 Main |
| `/assets/register` | 자산 대장 (필터 그리드 + 구성정보·이력 타임라인) | §03 |
| `/assets/lifecycle` | 수명주기 5단계 파이프라인 + 처리 대기열 | §03 |
| `/inventory/stock` | 재고 현황 · 재물조사 계획/수행 | §03 |
| `/inventory/contracts` | 계약 만료 알림 · SW 라이선스 보유–사용 대사 | §03 |
| `/discovery/found` | 6채널 발견 자산 + 편입/격리 요청 (결재 생성) | §04 |
| `/discovery/reconcile` | CMDB 대사 워크플로 · 대사 결과 4상태 | §04 |
| `/discovery/saas` | Shadow SaaS 부서별 사용 현황 | §04 |
| `/ai/assistant` | 자연어 자산 질의 (권한 필터 · 근거 링크) | §05 |
| `/ai/insights` | AI 5대 기능 · 제안 목록 | §05 |
| `/workflow/approvals` | 결재함 — 승인/반려 → 대장 환류 | §01·§04 |
| `/settings/permissions` | 권한 파이프라인 · 권한그룹 × 메뉴·기능 매트릭스 | §02 |

## 데모 시나리오 (폐쇄 루프)

1. **자산담당(박자산)** 로그인 → Discovery › 발견 자산에서 미등록 자산 선택 → **편입 요청**
2. 워크플로 › 신청·결재에 결재 문서 생성 → **승인** → 자산 대장에 신규 자산 편입
   (발견 채널·일시가 자산 이력에 승계, 사이드바 미등록 뱃지 감소)
3. **보안담당(윤보안)** 로그인 → 격리 요청 결재 승인 → NAC 격리 조치 상태 반영

## v1 범위 제외

DB 영속화, 실제 스캐너·커넥터 연동(NAC·EDR·CSP API), SAML SSO, 바코드/QR 모바일 실사,
전자결재 다단계 결재선.
