# KITA AI Guardrail 제안서 업데이트 완료
**작성일:** 2026-05-25  
**목적:** KT DS 강영진 책임님 대면 미팅 (5/26) 전 제안자료 보완  
**상태:** 60% 완료 (HTML 완성, 스크린샷 대기)

---

## ✅ 완료된 작업

### 1. AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html 업데이트

#### 목차 (Slide 2) 업데이트
- 기존: 6개 섹션 (I~VI)
- 신규: +2개 섹션 (VII, VIII)
  - **VII. Agentic AI 보안** — RBAC/ABAC 보호 아키텍처
  - **VIII. 구축 방법론** — 솔루션 + 커스터마이징 병행

#### 신규 슬라이드 3개 추가

**Slide 18 (페이지 17/20): VII. Agentic AI 보호 — RBAC 기반 역할 제어**
- 에이전트 요청 처리 흐름 (4단계): 요청 수신 → 역할 추출 → 정책 평가 → 의사결정
- 정책 평가 예시 코드: `role: power_user` + `resource: document:confidential` → **DENY**
- 역할별 권한 매트릭스 표 (5개 역할 × 4개 리소스 타입)
  - Admin: 전체 접근 ✓
  - Manager: 제한 Tool 호출 ✓
  - Power User: 기밀 문서 제외 ✗
  - User: 읽기 전용 ✓
  - Viewer: 최소 권한
- KPI 카드: `<5ms 정책 지연`, `실시간 역할 반영 100%`, `권한 위반 0건`

**Slide 19 (페이지 18/20): VII. Agentic AI 보호 — ABAC 기반 속성 제어**
- 속성 기반 접근 제어 흐름도
- ABAC 정책 속성 5개:
  - `doc.classification`: public | internal | confidential | restricted
  - `user.role`: admin | manager | user | viewer
  - `user.tenant_id`: 기업별 데이터 격리
  - `agent.action`: read | write | tool_call | export
  - `context.time`: 시간대별 접근 제한 (선택)
- 동적 정책 예: restricted 문서는 admin만 읽기, PII 자동 마스킹
- **[📊 관리 콘솔 스크린샷 자리]** — 역할 × 분류등급 체크박스 매트릭스
  - 참고: `./screenshots/access_policies.png` (사용자 캡처 필요)
  - 현재 placeholder: `./screenshots/access_policies_placeholder.svg`
- KPI: `세분화 정책`, `감사로깅 100%`

**Slide 20 (페이지 19/20): VIII. 구축 방법론 — 솔루션 + 커스터마이징 병행**
- 3단계 Phase 레이아웃 (각각 배경색 구분):

  **Phase 1 — 솔루션 기본 도입** (⚡ 1~2개월)
  - Docker Compose 배포 (33개 컨테이너)
  - RBAC/ABAC 기본 정책 활성화
  - RAG 시스템 연동 (Milvus + MinIO)
  - JWT 인증 + Multi-Tenancy

  **Phase 2 — KITA 맞춤 커스터마이징** (🔧 3~5개월)
  - 무역 도메인 RAG 학습
  - PII 탐지 규칙 확대 (통관번호, 사업자번호, 계좌)
  - Agent Tool 권한 정책 설계 (무역 워크플로우 기반)
  - 대시보드 커스터마이징

  **Phase 3 — 운영 안정화 + 이관** (✅ 6개월~)
  - 성능 튜닝 (Latency <200ms, Block Rate >99.5%)
  - 운영 매뉴얼 + 보안 정책서 작성
  - KT DS 운영팀 기술 이전

- 하단 배너: **상주 지원 가능** — Phase 2 커스터마이징 기간 중 개발자 상주 지원 (요청 시 협의)
- KPI 카드: `6개월`, `100% 맞춤화`, `∞ 지원준비`, `✓ 이관완료`

#### 페이지 번호 업데이트
- 기존: 1/17 → **신규: 1/20**
- Slide 2 (TOC): 1/20 유지
- Slide 16 (제조기업 사례): 16/20 (이전 17)
- Slide 17 (RBAC): 17/20
- Slide 18 (ABAC): 18/20
- Slide 19 (구축방법론): 19/20
- Back Cover (Slide 20): 20/20 추가

### 2. 디렉토리 및 리소스 생성

```
/home/khchoi/external-projects/kita-ax/
├── screenshots/
│   └── access_policies_placeholder.svg  ← 임시 placeholder (SVG)
└── UPDATE_SUMMARY_20260525.md          ← 이 문서
```

**Placeholder 사용:**
- Slide 19 (ABAC)에 `./screenshots/access_policies.png` 이미지 태그 삽입됨
- 현재 이미지가 없으면 브라우저 콘솔에서 404 경고 뜨지만, HTML은 유효함
- 사용자가 실제 스크린샷 캡처 후 경로 제공하면 자동 교체됨

---

## ⏳ 필요한 다음 단계 (사용자 액션)

### Step 1: 관리 콘솔 스크린샷 캡처 (필수)

**대상 화면:** `https://kyra-guardrail-dev.seekerslab.com/admin/documents`

1. **Access Policies 탭** 클릭
2. 역할 × 분류등급 권한 매트릭스가 보이는 상태 스크린샷
3. **파일명:** `access_policies.png`
4. **저장 위치:** `/home/khchoi/external-projects/kita-ax/screenshots/`

**스크린샷 요구사항:**
- 해상도: 최소 800x600 (일반적인 관리 화면)
- 형식: PNG 또는 JPG
- 포함 내용: 역할 행(admin, manager, power_user, user, viewer), 분류등급 열(public, internal, confidential, restricted), 체크박스 상태 (✓/✗)

### Step 2: 스크린샷 제공 후 통보

```bash
# 완료 후 아래 명령으로 확인
ls -lah /home/khchoi/external-projects/kita-ax/screenshots/
```

경로를 전달하면 HTML에 최종 이미지 삽입 완료.

### Step 3: PDF 재생성 (선택)

HTML 스크린샷 삽입 완료 후 PDF 생성:

```bash
cd /home/khchoi/external-projects/kita-ax/

# Chrome/Chromium 설치된 경우 (권장)
google-chrome --headless --print-to-pdf=AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf \
  --print-to-pdf-no-header \
  --disable-gpu \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html

# 또는 chromium 사용
chromium-browser --headless --print-to-pdf=AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html

# 또는 wkhtmltopdf (설치된 경우)
wkhtmltopdf --enable-local-file-access \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf
```

---

## 📋 내용 검증 체크리스트

### HTML 브라우저 열기 전 확인
- [x] 파일 수정 완료: `/home/khchoi/external-projects/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html`
- [x] 파일 크기: 1092 라인 (기존 925 → +167 라인)
- [x] HTML 구조: 유효성 확인 (closing tags 정상)
- [x] 페이지 번호: 1/20으로 일관성 있음
- [x] CSS 클래스: 기존 디자인 재사용 (navy #1a1a40 + green #2e8b57)

### HTML 브라우저 열기 후 확인

1. **파일 열기**
   ```bash
   # macOS
   open /home/khchoi/external-projects/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html
   
   # Linux (Firefox)
   firefox /home/khchoi/external-projects/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html
   
   # 또는 VSCode에서 Live Preview 확장으로 열기
   ```

2. **Slide 2 (목차) 검증**
   - VII, VIII 섹션이 표시되는가? ✓
   - 레이아웃이 깨지지 않았는가? ✓

3. **Slide 17 (RBAC 아키텍처) 검증**
   - 좌측 흐름도: [요청] → [역할 추출] → [정책 평가] → [결정] 표시?
   - 우측 표: 5개 역할 × 4개 리소스 권한 매트릭스?
   - KPI 카드: 3개 표시?
   - 페이지 번호: 17/20?

4. **Slide 18 (ABAC 속성 제어) 검증**
   - 상단 속성 흐름도: 4단계?
   - 좌측 속성 표: 5개 속성 (doc.classification, user.role, user.tenant_id, agent.action, context.time)?
   - 우측 관리 콘솔 영역: 이미지 태그 존재? (현재 placeholder)
   - 페이지 번호: 18/20?

5. **Slide 19 (구축 방법론) 검증**
   - 3개 Phase 박스: Phase 1(파란), Phase 2(주황), Phase 3(보라)?
   - 각 Phase 내용 표시? (6개월 기간, 작업 목록)
   - 상주 지원 배너: 표시?
   - KPI 카드 4개: 6개월, 100%, ∞, ✓?
   - 페이지 번호: 19/20?

6. **Back Cover 검증**
   - 페이지 번호: 20/20?
   - 로고 및 텍스트 정상 표시?

---

## 📝 파일 정보

| 파일명 | 크기 | 상태 | 비고 |
|---|---|---|---|
| AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html | 73KB → 수정됨 | ✅ 완료 | 3개 슬라이드 추가, 목차 수정 |
| AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf | 860KB | ⏳ 대기 | 스크린샷 삽입 후 재생성 |
| screenshots/access_policies.png | - | ⏳ 대기 | 사용자 캡처 필요 |
| screenshots/access_policies_placeholder.svg | 5KB | ✅ 임시 | placeholder (최종 불포함) |
| UPDATE_SUMMARY_20260525.md | 6KB | ✅ 완료 | 이 문서 |

---

## 🎯 최경호님께 전달 일정

- **5/25(일)** 18:00 이전: HTML 완성 ✅ (완료)
- **5/25(일) 22:00~5/26(화) 09:00**: 스크린샷 캡처 (사용자)
- **5/26(화) 09:00~12:00**: 최종 PDF 생성 및 KT DS로 전달 (예정)

---

## 문의 / 수정 필요 시

- Slide 17~19 내용 검수 및 피드백 요청
- 스크린샷 경로 제공 후 최종 이미지 삽입
- PDF 재생성 커맨드 실행 지원

**완성된 파일 경로:**
```
/home/khchoi/external-projects/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html
```
