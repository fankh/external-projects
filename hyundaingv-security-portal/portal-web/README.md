# 전사 IT·보안 거버넌스 포털 — portal-web

`전사_IT보안_거버넌스포털_제품안내서.pdf`(16p)를 구현 스코프로 한 웹 포털.
IT 투자/비용 · IT Request(SR) · 인프라 운영 · 프로젝트 · 보안 컴플라이언스를
공통 전자결재·권한관리 기반 위의 단일 포털로 통합한다.

seekerslab-itam/itam-web 의 셸 패턴(도메인 메뉴바 + MDI 탭 + 좌측 내비 +
서버사이드 권한 가드)을 계승하되, 디자인은 뉴트럴 엔터프라이즈(그레이 기조,
도메인별 액센트 색 차등)로 구분한다.

## 현재 단계 — v0.1 셸 + 전체 스텁

- 로그인(권한그룹별 목업 계정 4종) · 앱 셸 · 10대 업무 도메인 메뉴 체계
- 개인별현황 대시보드(할일·결재·SR·서약 상태 — 스토어 시드 연동)
- 나머지 33개 화면은 캐치올 스텁(`app/(app)/[...stub]/page.tsx`)이
  `lib/screens.ts` 카탈로그로 렌더 — 실제 구현 시 해당 경로에 page.tsx 를
  만들면 정적 라우트가 캐치올보다 우선한다.

## 실행

```powershell
cd portal-web
npm install
npm run dev        # http://localhost:3000
```

로그인 화면에서 권한그룹별 목업 계정(SSO 대체) 4종 중 선택:
**사용자**(김현우) · **부서담당**(이수진) · **업무담당**(박정호) · **Admin**(시스템관리자).
권한그룹에 따라 메뉴바·좌측 내비 노출이 다르며, 모든 화면은 `lib/authz.ts`의
서버사이드 가드로 직접 URL 진입도 차단한다.

## 테스트

```powershell
npm run build
npm run smoke      # 프로덕션 서버 기동 → 권한 매트릭스·리다이렉트 검증 → 종료
```

## 구조

| 경로 | 역할 |
|------|------|
| `components/chrome/menus.ts` | 메뉴 체계(10대 도메인) × 권한그룹 — 권한의 단일 원천 |
| `components/chrome/AppShell.tsx` | 셸 — 타이틀바 · 메뉴바(LV1) · MDI 탭 · 좌측 내비(LV2) · 상태바 |
| `lib/screens.ts` | 스텁 화면 카탈로그(제품안내서 LV3 화면·기능) |
| `lib/store.ts` | in-memory 스토어(globalThis 싱글턴) — 실서비스에서는 MS-SQL 대체 |
| `lib/authz.ts` | 화면 단위 서버사이드 권한 게이트 |
| `scripts/smoke.mjs` | 라우트 × 권한 스모크 스위트 |
