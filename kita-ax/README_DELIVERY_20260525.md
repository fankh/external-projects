# KITA AI Guardrail 제안서 — 최종 납품 구성 (2026-05-25)

## 📋 개요

KT DS 강영진 책임님 대면 미팅 (2026-05-26(화)) 준비를 위해 **AI Guardrail 제안서를 업데이트**했습니다.

**핵심 업데이트:**
- ✅ Agentic AI RBAC 보호 섹션 추가 (Slide 17/20)
- ✅ Agentic AI ABAC 속성 제어 섹션 추가 (Slide 18/20)  
- ✅ 솔루션 + 커스터마이징 구축 방법론 추가 (Slide 19/20)
- ⏳ 실제 관리 콘솔 스크린샷 대기 (사용자 캡처 필요)

**전체 페이지:** 17 → **20 페이지로 확장**

---

## 📁 디렉토리 구조

```
/home/khchoi/external-projects/kita-ax/
├── 📄 AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html ⭐ [수정됨]
│   └── 3개 슬라이드 추가, 목차 업데이트
│       - Slide 17/20: RBAC 보호 아키텍처
│       - Slide 18/20: ABAC 속성 제어 (스크린샷 자리 대기)
│       - Slide 19/20: 구축 방법론 (Phase 1~3)
│       - Slide 20/20: Back Cover
│
├── 📄 AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf [재생성 필요]
│   └── HTML 최종 완성 후 Chrome headless로 재생성
│
├── 📁 screenshots/
│   ├── access_policies_placeholder.svg
│   └── access_policies.png ⏳ [사용자 캡처 필요]
│
├── 📖 UPDATE_SUMMARY_20260525.md ⭐
│   └── 작업 완료 내역, 다음 스텝 상세 가이드
│
├── 📖 SCREENSHOT_GUIDE.md ⭐
│   └── 스크린샷 캡처 방법 (Mac/Linux/Windows/브라우저 옵션)
│
├── 📖 KT_DS_TALKING_POINTS.md ⭐
│   └── 미팅용 핵심 메시지, Q&A 시나리오, 기술 설명
│
├── 📖 README_DELIVERY_20260525.md (이 파일)
│   └── 전체 구성 및 사용 방법
│
└── 기존 파일들 (수정 없음)
    ├── AI_GUARDRAIL_PROPOSAL.html (portrait version)
    ├── KITA_ARCHITECTURE_DESIGN.html
    ├── KITA_PROPOSAL_STRATEGY.md
    ├── (한국무역협회) KITA 차세대 무역플랫폼 구축 사업 1단계 제안요청서_vF_260512.pdf
    └── logo_colored.png, logo_white.png
```

---

## 🚀 빠른 시작 (Quick Start)

### 1단계: HTML 확인 (지금 할 수 있음)
```bash
# 브라우저에서 HTML 파일 열기 (실시간 미리보기)
open /home/khchoi/external-projects/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html
# 또는
firefox /home/khchoi/external-projects/kita-ax/AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html
```

✅ Slide 17, 18, 19가 제대로 표시되는지 확인  
✅ 페이지 번호가 1/20 ~ 20/20으로 표시되는지 확인

### 2단계: 스크린샷 캡처 (5/26 오전 전에)
```bash
# 1. https://kyra-guardrail-dev.seekerslab.com/admin/documents 접속
# 2. Access Policies 탭 → 권한 매트릭스 스크린샷
# 3. 파일명: access_policies.png
# 4. 저장 위치: /home/khchoi/external-projects/kita-ax/screenshots/

# 완료 후 확인
ls -lah /home/khchoi/external-projects/kita-ax/screenshots/access_policies.png
```

자세한 가이드: **[SCREENSHOT_GUIDE.md](./SCREENSHOT_GUIDE.md)** 참고

### 3단계: PDF 생성 (스크린샷 완료 후)
```bash
cd /home/khchoi/external-projects/kita-ax/

# Option 1: Chrome/Chromium (권장, 가장 안정적)
google-chrome --headless --print-to-pdf=AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf \
  --print-to-pdf-no-header \
  --disable-gpu \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html

# Option 2: Chromium (Ubuntu 등)
chromium-browser --headless --print-to-pdf=AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html

# Option 3: Firefox + pdfkit (Python 기반, 설치 필요)
pip install pdfkit
wkhtmltopdf --enable-local-file-access AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html \
  AI_GUARDRAIL_PROPOSAL_LANDSCAPE.pdf
```

---

## 📖 핵심 파일 소개

### 1. UPDATE_SUMMARY_20260525.md
**용도:** 기술 인수인계  
**내용:**
- 추가된 3개 슬라이드 상세 구성
- 각 슬라이드별 콘텐츠 설명 (RBAC 흐름도, ABAC 속성, Phase 다이어그램)
- 페이지 번호 업데이트 내역
- 검증 체크리스트 (HTML 브라우저 열기 후 각 슬라이드 확인 항목)

**읽어야 할 사람:** 기술 담당자, 품질 검증 담당자

### 2. SCREENSHOT_GUIDE.md
**용도:** 스크린샷 캡처 실행 가이드  
**내용:**
- 캡처 대상 화면 명확히 지정 (Access Policies 탭)
- 각 OS별 캡처 방법 (Mac, Linux, Windows)
- 브라우저 개발자 도구를 이용한 캡처
- 파일 처리 (이동, 검증)
- 문제 해결 (404, 탭 없음, 화질 등)

**읽어야 할 사람:** 스크린샷 캡처 담당자

### 3. KT_DS_TALKING_POINTS.md ⭐ **미팅에서 이것을 주로 참고**
**용도:** KT DS 미팅 핵심 메시지 및 Q&A  
**내용:**
- **질문 1 대응:** "Agentic AI를 RBAC/ABAC로 어떻게 보호하나?"
  - RBAC 원리 + 5단계 역할 매트릭스
  - ABAC 동적 정책 (4가지 속성, 비식별화, 감사로깅)
  - 5개 체크포인트 (Gateway → Auth → OPA → RAG → Audit)
  
- **질문 2 대응:** "구축 시 솔루션 + 커스터마이징을 어떻게 병행하나?"
  - 3단계 Phase 상세 설명 (기간, 투입 인력, 산출물)
  - 비용 효율성 분석 (Full Custom vs KYRA 솔루션)
  - 상주 지원 모델 (온사이트 일정, 기술 이전)
  
- **추가 Q&A 시나리오 4가지** (예상 질문과 답변)
- **미팅 체크리스트** (PDF 준비, 인쇄본, 질문 예상 항목)

**읽어야 할 사람:** 미팅 주도자 (최경호님), 기술 담당자

---

## 📊 Slide 별 내용 요약

| Slide | 제목 | 상태 | 비고 |
|---|---|---|---|
| 1 | Cover | ✅ 기존 | KYRA AI Guardrail |
| 2 | Table of Contents | ✅ 수정 | VII, VIII 섹션 추가 |
| 3~16 | 기존 섹션 | ✅ 기존 | Executive Summary ~ 제조 사례 |
| **17** | **RBAC 보호 아키텍처** | ✅ 신규 | 에이전트 요청 흐름 + 역할 매트릭스 |
| **18** | **ABAC 속성 제어** | ⏳ 신규 | ABAC 속성 테이블 + **스크린샷 자리** |
| **19** | **구축 방법론** | ✅ 신규 | Phase 1~3 + 상주 지원 |
| 20 | Back Cover | ✅ 신규 | 20/20 페이지 표시 |

---

## ⚠️ 주의사항

### Slide 18 스크린샷
- 현재: `./screenshots/access_policies.png` 태그는 있지만 **이미지 파일 없음**
- HTML은 정상 렌더링 (브라우저가 404 무시함)
- **PDF 생성 시** 이미지를 로드할 수 없으면 공백으로 표시됨
  
**해결 방법:**
1. 스크린샷 캡처 완료
2. `/home/khchoi/external-projects/kita-ax/screenshots/access_policies.png` 저장
3. PDF 재생성

### PDF 생성 시 주의
- **`--print-to-pdf-no-header` 옵션:** 헤더/푸터 제거 (슬라이드 깔끔함 유지)
- **`--disable-gpu` 옵션:** GPU 렌더링 비활성화 (호환성 향상)
- **로컬 이미지 경로:** `--enable-local-file-access` 필요시 사용

---

## 🔄 파일 수정 이력

| 날짜 | 파일 | 변경 내용 |
|---|---|---|
| 2026-05-21 | AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html | 원본 작성 (17 슬라이드) |
| 2026-05-25 | AI_GUARDRAIL_PROPOSAL_LANDSCAPE.html | 3 슬라이드 추가 (총 20 슬라이드) |
| 2026-05-25 | 목차 (Slide 2) | VII, VIII 섹션 추가 |
| 2026-05-25 | 페이지 번호 | 1/17 → 1/20, Back Cover 20/20 추가 |

---

## 📅 최종 일정

| 작업 | 일시 | 담당 | 상태 |
|---|---|---|---|
| HTML 3개 슬라이드 추가 | 2026-05-25 오전 | SeekersLab | ✅ 완료 |
| 스크린샷 캡처 | 2026-05-25~26 오전 | 사용자 | ⏳ 진행 중 |
| PDF 재생성 | 2026-05-26 오전 | SeekersLab | ⏳ 대기 |
| KT DS 전달 | 2026-05-26 오전 | 최경호님 | ⏳ 예정 |
| 대면 미팅 | 2026-05-26(화) | KT DS | ⏳ 예정 |

---

## 💡 활용 팁

### 미팅 중 자료 사용
1. **노트북/태블릿에서 PDF 전체 화면으로 표시**
   - 슬라이드 17, 18, 19에서 멈춰서 상세 설명
   
2. **인쇄본 5부 준비**
   - 칼라 출력, A4 landscape (가로 방향)
   - 마지막 페이지(20/20) 잘 나왔는지 확인

3. **추가 자료 준비**
   - KITA_ARCHITECTURE_DESIGN.html (기술 상세)
   - KT_DS_TALKING_POINTS.md 인쇄본 1부 (메모용)

### HTML 버전 수정 필요 시
- VSCode 또는 텍스트 에디터에서 직접 HTML 수정 가능
- CSS 변경 시 `<style>` 태그 (상단 100줄 내)에서 수정
- 새 슬라이드 추가 시 `<!-- ====== SLIDE N ====== -->` 주석 구조 유지

---

## 🆘 문제 해결

| 문제 | 해결 방법 |
|---|---|
| HTML에서 슬라이드 17, 18, 19가 보이지 않음 | 브라우저 캐시 삭제 (Cmd+Shift+Delete) 또는 시크릿 모드에서 열기 |
| PDF 생성 시 이미지가 공백으로 표시됨 | 스크린샷 파일 경로 확인: `/home/khchoi/external-projects/kita-ax/screenshots/access_policies.png` |
| Chrome/Chromium 설치 안 됨 | `apt install google-chrome-stable` (Linux) 또는 Mac App Store에서 Chrome 설치 |
| PDF 크기가 너무 크면 (>50MB) | 이미지 품질 낮추기: `--quality 85` 옵션 추가 |
| 페이지 번호가 틀렸으면 | 슬라이드 footer의 `<div>N / 20</div>` 부분 수정 |

---

## 📞 연락처 / 피드백

- **기술 문의:** UPDATE_SUMMARY_20260525.md 참고
- **미팅 전략:** KT_DS_TALKING_POINTS.md 참고
- **스크린샷 캡처:** SCREENSHOT_GUIDE.md 참고

**예상 소요 시간:**
- HTML 검증: 5분
- 스크린샷 캡처: 5분
- PDF 생성: 3분
- **총 준비 시간: 약 15분**

---

**작성:** 2026-05-25  
**대상:** KT DS 강영진 책임님, 최경호님  
**목표:** 2026-05-26 대면 미팅에서 KYRA의 Agentic AI 보호 기술과 구축 방법론 제시
