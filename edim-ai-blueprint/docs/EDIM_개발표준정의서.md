# EDIM 개발 표준 정의서

> P1(RCCS 코어) 착수 전 합의해야 하는 개발 규약.
> **핵심 규약은 언어 중립**이며, 언어 종속 절(§4·§5)은 현 프로토타입 스택 기준으로 작성 —
> 백엔드 언어 확정(컴포넌트정의서 §11-1) 시 §5만 개정한다.

| 항목 | 내용 |
|---|---|
| 문서 버전 | v0.1 (초안) |
| 작성일 | 2026-07-07 |
| 적용 범위 | EDIM 전 컴포넌트 (FE·SVC·ENG·AI·INT) 및 문서·인프라 코드 |
| 기준 스택 | Frontend: React 19 + TypeScript + Vite / Backend(잠정): Python 3.12 + FastAPI |
| 관련 문서 | DB정의서 §1(명명·공통컬럼) · 컴포넌트정의서 §1.2(아키텍처 결정)·§4(API 규약) · 권한승인정의서 |

---

## 1. 공통 원칙

1. **API-First** — 모든 화면은 공개 API만 사용. 내부 전용 API 금지 (Toolbox 사용자 UI가 동일 API 호출)
2. **승인 게이트 준수** — Set-up 자산 쓰기는 `approval_status=DRAFT`로만 저장, `APPROVED` 전이는 Approval Service 경유. 우회 코드 금지
3. **모듈 경계** — 모듈러 모놀리스: 도메인 간 직접 DB 접근 금지, 모듈 공개 인터페이스(서비스 계층)만 호출. 경계를 지켜야 MSA 전환 가능
4. **테넌트 필수** — 모든 조회·쓰기에 `tenant_id` 조건. 누락은 리뷰 반려 사유 (RLS 이중 방어)
5. **설정은 환경변수** — 코드에 환경별 분기·시크릿 하드코딩 금지 (`.env.example` 갱신 의무)
6. **결정 기록** — 아키텍처 결정은 ADR(`docs/adr/NNN-제목.md`)로 남긴다 (컨텍스트→결정→결과)

---

## 2. 명명 표준 (공통)

| 대상 | 규칙 | 예 |
|---|---|---|
| API 경로 | kebab-case, 리소스 복수형 | `/api/v1/doc-controls`, `/supplier-code-maps` |
| JSON 필드 | **camelCase** (프로토타입 관례 승계) | `entityType`, `promptText`, `runId` |
| DB | DB정의서 §1.1 (snake_case, 도메인 접두어) | `dwg_supersedure` |
| 환경변수 | UPPER_SNAKE | `ANTHROPIC_API_KEY` |
| 이벤트/큐 토픽 | `도메인.동사` 소문자 점 표기 | `run.completed`, `approval.decided` |
| 기능·요구·메뉴 ID | 문서 체계 준수 (README §3) — 코드 주석·커밋에 인용 가능 | `CODE-009`, `REQ-F-028` |
| 용어 | 도메인 용어는 요구사항정의서 '용어정의' 시트를 따름 — 임의 동의어 금지 | Arrangement(○) 배치구성(✗) |

**금지**: 축약 남발(`mgr`, `tmp`), 한글 식별자, 의미 없는 번호 접미사(`data2`).

---

## 3. API 설계 규약

컴포넌트정의서 §4의 계약을 코드 수준으로 구체화한다.

- **버전**: `/api/v1` 경로 프리픽스. 하위 호환 깨는 변경은 v2 신설 (필드 추가는 non-breaking)
- **메서드**: 조회 GET / 생성 POST / 전체 교체 PUT / 부분 수정 PATCH / 삭제 DELETE. 동작형 엔드포인트는 `:action` 또는 하위 리소스 (`.../runs`, `.../finalize`)
- **페이지네이션**: 커서 방식 — `?cursor=&limit=` 요청, `{ items, nextCursor }` 응답. offset 금지
- **오류**: RFC 9457 Problem Details — `{ type, title, status, detail, instance, errors? }`. 도메인 오류코드는 `type` URI 말미에 (`.../errors/duplicate-main-code`)
- **비동기 잡** (EDIM Run·AI·변환): `POST → 202 + { runId }` → `GET .../runs/{runId}` 폴링 + 완료 알림(SSE). 동기 API에 장시간 작업 금지 (>5s)
- **멱등성**: 생성 계열은 `Idempotency-Key` 헤더 지원 (재시도 안전)
- **일시**: ISO 8601 UTC (`2026-07-07T03:00:00Z`), 금액: 문자열 아닌 number + `currency` 필드 분리
- **OpenAPI**: 스키마 자동 생성 필수 — 스펙과 코드 불일치 금지. 인터페이스 정의서는 OpenAPI를 원천으로 발행

---

## 4. 프론트엔드 표준 — React + TypeScript

### 구조·명명 (프로토타입 관례 승계)

```
src/
  api/        # API 클라이언트 — camelCase.ts (예: blueprintApiClient.ts)
  components/ # PascalCase.tsx — 1파일 1컴포넌트
  hooks/      # use*.ts
  types/      # 도메인 타입 — DrawingDocument 등 백엔드 스키마와 1:1
  pages/      # 라우트 단위 (본 개발 시)
```

- TypeScript **strict 모드**, `any` 금지 (불가피 시 `// oxlint-disable` + 사유)
- 컴포넌트: 함수형 + hooks만. props 인터페이스는 `<컴포넌트명>Props`
- 상태: 서버 상태는 쿼리 라이브러리(TanStack Query 잠정), 전역 UI 상태 최소화
- API 호출은 `api/` 클라이언트 경유만 — 컴포넌트에서 `fetch` 직접 호출 금지
- 스타일: 디자인 토큰(색·간격) 변수화. EDIM 팔레트: primary `#1a1a40`, accent `#2e8b57`
- **동적 Form 렌더러** 주의: `tbx_ui_form.layout_def` 해석 시 스크립트 실행 금지 (선언적 바인딩만) — 보안 결정 (컴포넌트정의서 §11-3)
- i18n: 표시 문자열은 리소스 키 사용 (REQ-N-015), 하드코딩 한글 금지 (프로토타입 예외)
- 린트: **oxlint** (`react/rules-of-hooks: error` 유지) + prettier. CI에서 강제

### 도면 캔버스 성능

- 5,000 엔티티까지 SVG, 초과 시 Canvas/WebGL 전환 검토 (REQ-N-004)
- 렌더 루프에서 상태 갱신 금지, 팬줌은 transform만 변경 (프로토타입 `usePanZoom` 패턴)

---

## 5. 백엔드 표준 — Python + FastAPI (잠정)

> 백엔드 언어 확정 시 본 절만 개정. 구조 원칙(계층·경계)은 언어 무관 유지.

### 구조 (프로토타입 승계 + 도메인 확장)

```
app/
  main.py              # 앱 조립만
  config.py            # pydantic-settings — 환경변수 단일 창구
  <domain>/            # code / drawing / cpq / cost / erp ... (모듈 경계)
    router.py          # HTTP 계층 — 검증·직렬화만, 로직 금지
    service.py         # 유스케이스 — 트랜잭션 경계
    repository.py      # DB 접근 — 이 파일 밖에서 SQL 금지
    schemas.py         # pydantic 모델 (JSON camelCase 필드)
```

- **계층 규칙**: router → service → repository 단방향. 타 도메인은 service 인터페이스만 호출
- 타입 힌트 필수 (mypy/pyright 통과), 포맷·린트: **ruff** (format + check)
- pydantic 필드는 camelCase 직접 선언 (프로토타입 관례: `entityType`) — DB snake_case와의 변환은 repository 계층
- 트랜잭션: service 메서드 단위. 승인 전이(approval_status)는 반드시 대상 갱신과 동일 트랜잭션
- **Macro 엔진 안전 규칙**: 평가기는 순수 함수·부수효과 금지, 타임아웃·재귀 깊이 제한, `eval()` 금지 (자체 AST 파서만)
- 예외: 도메인 예외 계층 정의 → 핸들러에서 Problem Details 변환. bare `except:` 금지
- 마이그레이션: 도구는 언어 확정과 함께 결정 (Alembic/Flyway). 규칙: 마이그레이션 파일은 불변, 롤백 스크립트 동반, DDL은 마이그레이션으로만

---

## 6. Git·리뷰 표준

### 브랜치·커밋

- 브랜치: `main`(보호) ← `feature/<기능ID>-<슬러그>` (예: `feature/CODE-009-running-test`), 수정: `fix/...`
- 커밋 메시지: `<type>(<scope>): <요약>` — type: feat/fix/refactor/test/docs/chore, scope는 모듈 또는 기능 ID
  - 예: `feat(code): CODE-009 Part List Running Test 검증 API`
  - 본문에는 변경 이유·영향. 이슈/기능 ID 참조
- `main` 직접 push 금지, force-push 금지. 릴리스는 태그 (`v0.1.0`, SemVer)

### PR·리뷰 체크리스트

- PR은 작게 (리뷰 가능 단위, ~400라인 목표), 설명에 기능 ID·테스트 방법 명기
- 승인 1인 이상 + CI 통과 필수. 리뷰 관점:
  1. 테넌트 조건 누락 여부 (§1-4)
  2. 승인 게이트 우회 여부 (§1-2)
  3. 모듈 경계 침범 (타 도메인 repository 직접 호출)
  4. 오류 처리·로그 (PII 노출, §9)
  5. 테스트 동반 여부 (§7)

---

## 7. 테스트 표준

| 계층 | 도구(잠정) | 기준 |
|---|---|---|
| 단위 | pytest / vitest | service·엔진 로직. 신규 코드 커버리지 **80%** 목표 (엔진류 90%) |
| 통합 | pytest + testcontainers | repository·API 계약 (실 DB) |
| E2E | Playwright | 핵심 여정: 코드 등록→Running Test→CPQ→Run→견적 (개요 §7) |
| 성능 | k6 (잠정) | REQ-N-001~005 — Run 1시간/BOM 30초/응답 2·3초 |

- 테스트 명명: `test_<대상>_<조건>_<기대>` / `it('...조건이면 ...한다')`
- **Macro 엔진은 golden test**: 수식·입력·기대값 테이블 기반 회귀 (특허 검토로 문법 변경 가능성 대비)
- BOM 전개·순환 검증은 경계 케이스 필수 (깊이 제한·순환·빈 관계)
- 테스트 데이터: 발표자료 예시 코드 체계(KDCR 3-13, KAD-450-…) 사용 — 문서와 대조 가능

---

## 8. 보안 표준

- 시크릿: `.env`(gitignore) + 서버는 600 권한. **저장소에 시크릿 커밋 금지** — pre-commit secret scan
- 입력 검증: 모든 외부 입력은 스키마 검증 (pydantic/zod). 파일 업로드는 확장자+매직바이트+크기 검증, 변환은 격리 워커(INT-04)
- SQL은 파라미터 바인딩만 (문자열 조립 금지) — Macro의 Table 참조도 식별자 화이트리스트 방식
- 인증·인가: 권한승인정의서 매트릭스 준수. **프론트 숨김은 보안이 아님** — 서버측 검사 필수
- 의존성: lock 파일 필수, 주 1회 취약점 스캔 (CI)
- 감사: 자산 변경은 sys_history 기록 (DB정의서) — 로깅과 별개

---

## 9. 로깅·관측 표준

- 구조화 JSON 로그: `timestamp, level, tenantId, userId, traceId, runId?, event, detail`
- 상관관계: 요청 진입 시 `traceId` 발급 → 서비스·워커·잡까지 전파 (Run 디버깅 필수)
- 레벨: ERROR(대응 필요) / WARN(비정상이나 진행) / INFO(업무 이벤트) / DEBUG(개발). 운영 기본 INFO
- **PII·시크릿 로그 금지** (비밀번호·토큰·API 키·개인 연락처). Macro 수식은 로그 가능(자산)이나 Table 데이터 값은 DEBUG만
- 메트릭: Run 소요시간·Macro 평가 시간·BOM 전개 깊이 — REQ-N 검증 지표와 일치 (INF-07)

---

## 10. CI/CD 표준 — Jenkins

개발 서버 Jenkins(`/jenkins`) 기준. 파이프라인 단계는 모든 컴포넌트 공통:

```
lint → typecheck → unit test → build → integration test → (main 병합 시) deploy dev
```

- PR 파이프라인 실패 = 병합 불가. 단계 스킵 금지
- 배포: docker compose 기반 (컴포넌트정의서 §8 구축 현황) — 이미지 태그는 git SHA
- 재현성: 빌드는 lock 파일 기준, "로컬에서 되는데" 금지 — 컨테이너 빌드가 기준

---

## 11. 문서화 표준

- 문서 수정 절차는 [`docs/README.md`](README.md) §4 준수 (xlsx 직접 편집 금지, RTM 재생성)
- 코드 주석: "왜"를 기록 (무엇은 코드가 말함). 공개 API·엔진 알고리즘은 docstring 필수
- API 문서: OpenAPI 자동 생성이 원천 — 수기 API 문서 금지
- Mermaid: 저장소 `MERMAID-STYLE-GUIDE.md` 준수

---

## 12. 개정 트리거 (미결정 연동)

| 트리거 | 개정 대상 |
|---|---|
| 백엔드 언어 확정 (컴포넌트정의서 §11-1) | §5 전체, §7 도구, 마이그레이션 도구 |
| 게이트웨이 제품 선정 (§11-2) | §3 인증 헤더·rate limit 규약 |
| Macro 문법 특허 검토 결과 (DB정의서 §12-4) | §5 Macro 엔진 규칙, §7 golden test 셋 |
| k8s 전환 | §10 배포 절 |
| 동적 Form 스크립트 허용 여부 (§11-3) | §4 렌더러 보안 규칙 |

---

## 13. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| v0.1 | 2026-07-07 | 최초 작성 — 언어 중립 핵심 + 프로토타입 스택(FastAPI·React/TS) 기준 |
