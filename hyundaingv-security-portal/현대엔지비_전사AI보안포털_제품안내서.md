---
marp: true
theme: default
paginate: true
header: 'KYRA AI Guardrail — 현대엔지비 전사 AI 보안 포털'
size: 16:9
style: |
  section {
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background-color: #ffffff;
    color: #333333;
    padding: 60px 50px;
    font-size: 28px;
    line-height: 1.6;
  }
  header {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50px;
    padding: 10px 30px;
    background: linear-gradient(90deg, #002c5f 0%, #00aad2 100%);
    color: white;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: none;
  }
  footer {
    position: absolute;
    bottom: 20px;
    left: 30px;
    font-size: 12px;
    color: #999;
  }
  section.title {
    background: linear-gradient(160deg, #001a38 0%, #002c5f 35%, #002c5f 70%, #00aad2 100%);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    padding: 0;
    header { display: none; }
    footer { display: none; }
  }
  section.title h1 {
    font-size: 60px;
    font-weight: 800;
    margin: 0;
    letter-spacing: -1px;
    color: white;
  }
  section.title h2 {
    font-size: 30px;
    font-weight: 300;
    margin-top: 20px;
    opacity: 0.9;
    color: white;
  }
  section.section-break {
    background: linear-gradient(90deg, #002c5f 0%, #00aad2 100%);
    color: white;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0;
    header { display: none; }
  }
  section.section-break h1 {
    font-size: 52px;
    font-weight: 700;
    color: white;
    border: none;
    padding: 0;
    margin: 0;
    text-align: center;
  }
  section.section-break h2 {
    font-size: 26px;
    color: rgba(255,255,255,0.85);
    text-align: center;
    margin-top: 20px;
  }
  h1 {
    color: #002c5f;
    border-bottom: 4px solid #00aad2;
    padding-bottom: 15px;
    margin-bottom: 30px;
    font-size: 42px;
    font-weight: 700;
  }
  h2 {
    color: #00aad2;
    font-size: 30px;
    font-weight: 600;
    margin: 25px 0 15px 0;
  }
  h3 {
    color: #002c5f;
    font-size: 26px;
    margin: 20px 0 10px 0;
  }
  ul, ol {
    margin: 15px 0;
    padding-left: 40px;
  }
  li {
    margin: 9px 0;
    font-size: 25px;
  }
  strong { color: #00aad2; font-weight: 700; }
  code {
    background: #f5f5f5;
    border: 1px solid #ddd;
    padding: 3px 8px;
    border-radius: 3px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 0.85em;
  }
  pre {
    background: #001a38;
    color: #e6f6fb;
    padding: 18px 22px;
    border-radius: 6px;
    font-size: 20px;
    line-height: 1.5;
    overflow-x: auto;
  }
  pre code { background: none; border: none; color: inherit; padding: 0; }
  table {
    margin: 20px auto;
    font-size: 21px;
    width: 95%;
    border-collapse: collapse;
  }
  th {
    background: #002c5f;
    color: white;
    padding: 12px;
  }
  td {
    padding: 10px;
    border: 1px solid #ddd;
  }
  tr:nth-child(even) {
    background: #f4f8fb;
  }
  .callout {
    background: linear-gradient(135deg, #e3f4fa 0%, #d2ecf5 100%);
    border-left: 6px solid #00aad2;
    padding: 20px;
    margin: 20px 0;
    border-radius: 4px;
    font-size: 23px;
  }
  .spec-row {
    display: flex;
    gap: 20px;
    margin: 20px 0;
    justify-content: space-around;
  }
  .spec-card {
    flex: 1;
    padding: 20px;
    text-align: center;
    background: linear-gradient(135deg, #f9fafb 0%, #eef4f8 100%);
    border: 2px solid #00aad2;
    border-radius: 8px;
  }
  .spec-value {
    font-size: 44px;
    font-weight: 800;
    color: #00aad2;
    margin-bottom: 10px;
  }
  .spec-label {
    font-size: 17px;
    color: #555;
    font-weight: 600;
  }
  .two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
    margin: 20px 0;
  }
  .two-col > div { padding: 0; }

---

<!-- _class: title -->

# 현대엔지비 전사 AI 보안 포털

## KYRA AI Guardrail 기반 엔터프라이즈 AI 거버넌스

### 기술 제품 안내서

---

<!-- _class: section-break -->

# 목차

## I. 솔루션 개요
## II. 시스템 아키텍처
## III. 접근통제 — RBAC / ABAC
## IV. AI 보안 엔진
## V. RAG · Agentic AI 보안
## VI. 운영 · 연동 · 보안 하드닝

---

<!-- _class: section-break -->

# I. 솔루션 개요

## 전사(全社) 단일 AI 보안 게이트웨이

---

# 솔루션 개요

## 전사 AI 보안 포털

KYRA AI Guardrail은 사내 모든 LLM·AI 에이전트 트래픽이 통과하는
**단일 보안 게이트웨이**로, 전사 차원의 AI 거버넌스를 제공합니다.

- ✅ **프롬프트 인젝션 방어** — Jailbreak 및 명령 탈취 차단
- ✅ **데이터 유출 방지 (DLP)** — PII·기밀정보 실시간 탐지·마스킹
- ✅ **접근통제** — RBAC + ABAC 듀얼 정책 엔진
- ✅ **RAG 보안** — 분류등급 기반 지식베이스 격리
- ✅ **Agentic AI 보안** — 에이전트 Tool 호출 권한 통제
- ✅ **감사·컴플라이언스** — 전 요청 감사로그 및 정책 추적

---

# 전사 적용 모델

## 부서·시스템 무관 단일 통제 평면

<div class="two-col">

### 보호 대상 (Workload)

- 사내 AI 챗봇 / 어시스턴트
- 업무 자동화 AI 에이전트
- RAG 기반 사내 지식검색
- 외부 LLM API 호출 (OpenAI 등)
- 사내 자체 호스팅 모델

### 통제 평면 (Control Plane)

- 모든 트래픽 **단일 게이트웨이 경유**
- 부서별 **Multi-Tenancy 격리**
- 중앙 정책 콘솔에서 일괄 관리
- 전사 단일 감사 로그 저장소

</div>

<div class="callout">

**설계 원칙:** 개별 업무 단위가 아닌 <strong>전사 공통 보안 계층</strong>으로 배치되어,
모든 AI 워크로드에 동일한 보안·거버넌스 정책을 일관되게 강제합니다.

</div>

---

<!-- _class: section-break -->

# II. 시스템 아키텍처

## 컨테이너 기반 마이크로서비스

---

# 시스템 아키텍처

## 요청 처리 데이터 흐름

```
[사용자 / AI 에이전트]
        │
        ▼
[API Gateway]  ── JWT 인증 · Tenant 식별 · Rate Limit
        │
        ▼
[Guardrail 엔진]  ── 프롬프트 인젝션 · DLP · PII 검사
        │
        ▼
[정책 엔진 (OPA)]  ── RBAC + ABAC 평가 → ALLOW / DENY
        │
        ▼
[RAG / LLM 오케스트레이터]  ── 분류등급 기반 컨텍스트 주입
        │
        ▼
[감사 로그 저장소]  ── 전 요청 기록 (요청·판정·응답)
```

---

# 핵심 구성요소

| 계층 | 구성요소 | 역할 |
|------|---------|------|
| **게이트웨이** | API Gateway | 인증·테넌트 식별·라우팅·레이트리밋 |
| **보안 엔진** | Guardrail Engine | 인젝션 방어·DLP·PII 탐지 |
| **정책 엔진** | OPA (Open Policy Agent) | RBAC/ABAC 정책 평가 |
| **지식베이스** | Milvus (벡터 DB) | 임베딩 저장·유사도 검색 |
| **객체 스토리지** | MinIO | 원문 문서·첨부 저장 |
| **세션/캐시** | Redis | 세션·정책 캐시·레이트리밋 |
| **관리 콘솔** | Admin Console | 정책·사용자·감사로그 관리 |

---

# 배포 토폴로지

## 컨테이너 오케스트레이션

- **Docker Compose 기반 33개 컨테이너** 단일 스택 배포
- **On-Premise / Cloud / 하이브리드** 전 환경 지원
- 마이크로서비스 단위 **수평 확장(Scale-out)** 가능
- 폐쇄망(에어갭) 환경 배포 지원 — 외부 의존성 최소화

<div class="callout">

**배포 특성:** 모든 구성요소가 컨테이너화되어 있어 현대엔지비 내부
인프라(사내 K8s/VM)에 그대로 이식 가능하며, 데이터는 외부로 유출되지 않습니다.

</div>

---

<!-- _class: section-break -->

# III. 접근통제

## RBAC + ABAC 듀얼 정책 엔진

---

# RBAC 기반 역할 제어

## Role-Based Access Control

### 요청 처리 흐름

1. 🔹 **요청 수신** — 사용자/에이전트가 문서 조회·Tool 호출 요청
2. 🔹 **역할 추출** — Gateway가 JWT 토큰에서 role·tenant 확인
3. 🔹 **정책 평가** — OPA에서 `role : resource` 권한 검사
4. 🔹 **판정** — 허용(✓) / 거부(✗) + 감사로그 기록

---

# RBAC 역할 · 권한 매트릭스

| 역할 | 공개 | 내부 | 기밀 | 제한 | Tool 호출 |
|------|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✓ | ✓ | ✓ | ✓ | 전체 |
| **Manager** | ✓ | ✓ | ✓ | ✗ | 제한 |
| **Power User** | ✓ | ✓ | ✗ | ✗ | 지정 |
| **User** | ✓ | ✓ | ✗ | ✗ | 읽기 |
| **Viewer** | ✓ | ✗ | ✗ | ✗ | 없음 |

<div class="callout">

5단계 역할 체계로 부서·직급별 최소권한(Least Privilege) 원칙을 강제합니다.

</div>

---

# ABAC 기반 속성 제어

## Attribute-Based Access Control

### 동적 정책 평가

**[요청] → [속성 추출] → [OPA ABAC 정책] → [ALLOW / DENY]**

| 속성 | 설명 | 값 예시 |
|-----|------|------|
| `doc.classification` | 문서 분류등급 | public · internal · confidential · restricted |
| `user.role` | 사용자 역할 | admin · manager · user · viewer |
| `user.tenant_id` | 테넌트 격리 | 부서별 데이터 완전 분리 |
| `agent.action` | 에이전트 동작 | read · write · tool_call · export |
| `context.time` | 시간대 접근 제어 | 업무시간 기반 제한 (옵션) |

---

# 문서 분류 · 접근 정책

## 4단계 분류등급 체계

| 분류등급 | 정의 | 접근 범위 |
|---------|------|----------|
| **Public** | 공개 문서 | 전 사용자 |
| **Internal** | 사내 문서 | 내부 임직원 |
| **Confidential** | 기밀 문서 | 관리자·인가된 사용자 |
| **Restricted** | 제한 문서 | 관리자 전용 |

### 정책 관리 콘솔

- ✅ 비개발 운영팀도 **UI 매트릭스**로 정책 설정
- ✅ 역할 × 분류등급 교차 권한을 체크박스로 제어
- ✅ 변경사항 **즉시 반영**, 전 접근 감사로깅

---

<!-- _class: section-break -->

# IV. AI 보안 엔진

## 프롬프트 인젝션 방어 · DLP

---

# 프롬프트 인젝션 방어

## Jailbreak / 명령 탈취 차단

### 다층 탐지 파이프라인

1. **패턴 기반 탐지** — 알려진 인젝션·탈옥 시그니처 매칭
2. **의미 기반 탐지** — 시스템 프롬프트 무력화 의도 분석
3. **컨텍스트 격리** — 사용자 입력과 시스템 명령 분리 처리
4. **출력 검증** — 응답 단계에서 정책 위반 재검사

<div class="callout">

입력(Input)·출력(Output) **양방향 검사**로, 우회 프롬프트가 모델에 도달하거나
모델이 정책 위반 응답을 반환하는 것을 모두 차단합니다.

</div>

---

# 데이터 유출 방지 (DLP)

## PII · 기밀정보 실시간 통제

### 탐지 대상

- **개인정보(PII)** — 주민등록번호, 연락처, 이메일, 계좌번호
- **사내 식별자** — 사번, 사업자번호, 프로젝트 코드
- **기밀 키워드** — 분류등급 문서 내 민감 용어

### 처리 방식

- 🔸 **마스킹** — 민감 토큰 비식별화 후 처리
- 🔸 **차단** — 정책 위반 요청 즉시 거부
- 🔸 **경고** — 운영팀 알림 + 감사로그 적재

---

<!-- _class: section-break -->

# V. RAG · Agentic AI 보안

## 지식베이스 격리 · 에이전트 권한 통제

---

# RAG 보안 아키텍처

## 분류등급 인지 검색 (Classification-Aware Retrieval)

### 검색 파이프라인

1. 문서 수집 시 **분류등급 메타데이터** 부착
2. 임베딩 생성 → **Milvus** 벡터 DB 저장 (원문은 **MinIO**)
3. 검색 시 **요청자 권한으로 후보 필터링**
4. 인가된 문서만 LLM 컨텍스트로 주입

<div class="callout">

권한이 없는 문서는 검색 결과·컨텍스트에서 **원천 제외**되어,
RAG 응답을 통한 기밀정보 간접 유출을 차단합니다.

</div>

---

# Agentic AI 보안

## 에이전트 Tool 호출 통제

### 통제 메커니즘

- **Tool 권한 화이트리스트** — 역할별 호출 가능 Tool 지정
- **동작 단위 정책** — `read` / `write` / `tool_call` / `export` 개별 통제
- **테넌트 경계 강제** — 에이전트는 소속 테넌트 데이터만 접근
- **체인 추적** — 다단계 에이전트 호출 전 구간 감사로깅

### 권한 평가 예시

- **Admin** — 전체 Tool 호출 가능
- **Power User** — 지정된 Tool만 호출
- **User** — 읽기 계열 Tool만 호출
- **Viewer** — Tool 호출 불가

---

<!-- _class: section-break -->

# VI. 운영 · 연동 · 보안 하드닝

## 관리 콘솔 · API · 감사

---

# 관리 콘솔

## 중앙 집중 운영 관리

| 메뉴 | 기능 |
|------|------|
| **Dashboard** | 접근 패턴·분류 분포·감사 이벤트 현황 |
| **Documents** | 문서·분류등급 관리 |
| **Access Policies** | 역할 × 분류등급 권한 매트릭스 |
| **Users** | 사용자·역할·상태 관리 |
| **Audit Logs** | 접근·변경 이력 조회 및 내보내기 |
| **Agents** | AI 에이전트 등록·권한 관리 |
| **Settings** | 테넌트별 정책·환경 설정 |

---

# REST API · 시스템 연동

## 표준 API 기반 통합

- **REST API** — `/api/v1` 표준 엔드포인트 체계
- **OpenAPI 3.0 명세** — Swagger UI(`/api/docs`)로 탐색·테스트
- **세션 / 토큰 인증** — 쿠키 세션 + JWT 지원
- **페이지네이션·필터링** — 대규모 데이터 조회 표준화
- **감사로그 내보내기** — CSV / JSON 포맷 익스포트

<div class="callout">

표준 REST·OpenAPI 인터페이스로 현대엔지비 사내 SSO·SIEM·ITSM 등
기존 시스템과 손쉽게 연동됩니다.

</div>

---

# 보안 하드닝

## 다층 방어 적용

<div class="two-col">

### 전송·세션 보안

- HTTPS / **HSTS** 강제
- 세션 쿠키 `HttpOnly` · `Secure` · `SameSite=strict`
- **Redis** 기반 세션 저장소
- **CSRF** 토큰 검증

### 애플리케이션 보안

- **CSP** 콘텐츠 보안 정책
- **CORS** 화이트리스트 제어
- **Rate Limiting** (IP·계정 단위)
- 보안 헤더 일괄 적용 (Helmet)

</div>

---

# 감사 · 컴플라이언스

## 전 요청 추적성 확보

- 모든 요청의 **요청·정책판정·응답** 3요소 기록
- 사용자·에이전트·테넌트·동작·결과 단위 조회
- 기간·동작·사용자별 **필터 검색**
- **CSV / JSON 내보내기**로 외부 감사 대응
- 무결성 보존을 위한 중앙 단일 로그 저장소

---

# 기술 사양 요약

<div class="spec-row">
  <div class="spec-card">
    <div class="spec-value">&lt;5ms</div>
    <div class="spec-label">정책 평가 지연</div>
  </div>
  <div class="spec-card">
    <div class="spec-value">&lt;200ms</div>
    <div class="spec-label">게이트웨이 처리 지연</div>
  </div>
</div>

<div class="spec-row">
  <div class="spec-card">
    <div class="spec-value">&gt;99.5%</div>
    <div class="spec-label">위협 차단율</div>
  </div>
  <div class="spec-card">
    <div class="spec-value">33</div>
    <div class="spec-label">컨테이너 구성</div>
  </div>
</div>

---

<!-- _class: title -->

# Secure AI. Empower Enterprise.

## 현대엔지비 전사 AI 보안 포털

### KYRA AI Guardrail — 안전하고 신뢰할 수 있는 AI 거버넌스
