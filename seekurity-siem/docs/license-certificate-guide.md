# Seekurity SIEM 라이선스 증서 생성 가이드

## 개요

Seekurity SIEM 라이선스 증서는 고객사의 라이선스 권리를 증명하는 공식 문서입니다. HTML 템플릿과 Python 생성기를 통해 고객별 맞춤 증서를 자동으로 생성할 수 있습니다.

## 파일 구조

```
siem-engineering/
├── projects/
│   ├── _template/
│   │   └── assets/
│   │       └── CUSTOMER_NAME_license_certificate.html    # 기본 템플릿
│   ├── kovan/
│   │   └── KOVAN_license_certificate.html                # 생성된 증서
│   └── aig/
│       └── AIG_license_certificate.html                  # 생성된 증서
├── scripts/
│   ├── license_certificate_generator.py                  # 생성 스크립트
│   └── examples/
│       ├── kovan_license_config.json                     # KOVAN 예제
│       └── aig_license_config.json                       # AIG 예제
└── docs/
    └── license-certificate-guide.md                      # 본 문서
```

## 생성 방법

### 1. Python 스크립트 사용 (권장)

#### 1-1. JSON 설정 파일로 생성

```bash
cd /home/khchoi/new-research/siem-engineering
python scripts/license_certificate_generator.py --config scripts/examples/kovan_license_config.json
```

#### 1-2. 명령행 인자로 생성

```bash
python scripts/license_certificate_generator.py \
  --customer "KOVAN" \
  --industry "금융" \
  --contact "김철수" \
  --phone "02-1234-5678" \
  --license-type "영구 라이선스" \
  --start-date "2025-09-01" \
  --end-date "2026-09-01" \
  --log-sources 67 \
  --users 50 \
  --scope "단일 사이트" \
  --issued-by "이준호" \
  --issuer-position "세큐리티 팀장"
```

### 2. HTML 직접 편집

증서를 수동으로 편집하려면:

1. `projects/_template/assets/CUSTOMER_NAME_license_certificate.html` 복사
2. 파일명을 `{CUSTOMER_NAME}_license_certificate.html`로 변경
3. 템플릿 변수(`{{VARIABLE_NAME}}`) 수동 치환
4. HTML 파일을 브라우저에서 열어 인쇄 또는 PDF 저장

## 설정 파일 형식 (JSON)

```json
{
  "CUSTOMER_NAME": "KOVAN",
  "INDUSTRY": "금융",
  "CONTACT_PERSON": "김철수",
  "CONTACT_PHONE": "02-1234-5678",
  "LICENSE_TYPE": "영구 라이선스",
  "START_DATE": "2025-09-01",
  "END_DATE": "2026-09-01",
  "LOG_SOURCE_COUNT": 67,
  "USER_COUNT": 50,
  "DEPLOYMENT_SCOPE": "단일 사이트",
  "ISSUED_BY": "이준호",
  "ISSUER_POSITION": "세큐리티 팀장",
  "LICENSE_NUMBER": "SK-KOV-202509-1234",
  "ISSUE_DATE": "2025-09-01"
}
```

### 필수 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `CUSTOMER_NAME` | 고객사명 | KOVAN, AIG |
| `START_DATE` | 라이선스 시작 날짜 | 2025-09-01 |
| `END_DATE` | 라이선스 종료 날짜 | 2026-09-01 |

### 선택 필드 (기본값 제공)

| 필드 | 설명 | 기본값 |
|------|------|--------|
| `INDUSTRY` | 업종 | 정보보안 |
| `CONTACT_PERSON` | 담당자 | 담당자 |
| `CONTACT_PHONE` | 연락처 | - |
| `LICENSE_TYPE` | 라이선스 유형 | 평가판 |
| `LOG_SOURCE_COUNT` | 최대 Log Source 수 | Unlimited |
| `USER_COUNT` | 최대 사용자 수 | Unlimited |
| `DEPLOYMENT_SCOPE` | 배포 범위 | 단일 사이트 |
| `ISSUED_BY` | 발급자 | Seekurity Team |
| `ISSUER_POSITION` | 발급자 직책 | Technical Director |
| `LICENSE_NUMBER` | 라이선스 번호 | 자동 생성 |
| `ISSUE_DATE` | 발급일 | 현재 날짜 |

## 라이선스 번호 자동 생성

라이선스 번호가 제공되지 않으면 다음 형식으로 자동 생성됩니다:

```
SK-{CUSTOMER_CODE}-{YYYYMM}-{RANDOM}
```

예시:
- `SK-KOV-202509-7823` (KOVAN, 2025년 9월)
- `SK-AIG-202601-4521` (AIG, 2026년 1월)

## PDF 변환

### 방법 1: 브라우저 인쇄 (권장)

1. HTML 파일을 브라우저에서 열기
2. `Ctrl+P` (또는 `Cmd+P` Mac) 또는 "인쇄 / PDF 저장" 버튼 클릭
3. "PDF로 저장" 선택
4. 파일명: `{CUSTOMER_NAME}_license_certificate.pdf`

### 방법 2: wkhtmltopdf 사용

```bash
wkhtmltopdf \
  --page-size A4 \
  --margin-top 10mm \
  --margin-bottom 10mm \
  projects/kovan/KOVAN_license_certificate.html \
  projects/kovan/KOVAN_license_certificate.pdf
```

### 방법 3: Python Selenium 사용

```python
from selenium import webdriver
from selenium.webdriver.common.by import By

driver = webdriver.Chrome()
driver.get('file:///path/to/KOVAN_license_certificate.html')
driver.print_page('projects/kovan/KOVAN_license_certificate.pdf')
driver.quit()
```

## 템플릿 커스터마이징

### 색상 변경

템플릿의 색상을 변경하려면 `<style>` 섹션의 색상 코드를 수정하세요:

```css
.header {
    color: #003366;  /* 헤더 색상 */
}

.title {
    color: #003366;  /* 제목 색상 */
}

.info-table th {
    background-color: #f0f0f0;  /* 표 배경 색상 */
}
```

### 로고/브랜딩 수정

템플릿의 "Seekurity" 로고 부분을 수정하려면:

```html
<div class="logo">Seekurity</div>  <!-- 이 부분 수정 -->
<div class="subtitle">Security Information and Event Management</div>
```

### 서명란 변경

발급사 정보를 변경하려면:

```html
<div class="signature-box">
    <div class="signature-title">발급사</div>
    <div class="signature-name">Seekurity Inc.</div>  <!-- 이 부분 수정 -->
    <div class="signature-name">대표이사</div>
</div>
```

## 예제

### KOVAN 라이선스 증서 생성

**kovan_license_config.json:**

```json
{
  "CUSTOMER_NAME": "KOVAN",
  "INDUSTRY": "금융",
  "CONTACT_PERSON": "김철수",
  "CONTACT_PHONE": "02-1234-5678",
  "LICENSE_TYPE": "영구 라이선스",
  "START_DATE": "2025-09-01",
  "END_DATE": "2026-09-01",
  "LOG_SOURCE_COUNT": 67,
  "USER_COUNT": 50,
  "DEPLOYMENT_SCOPE": "단일 사이트",
  "ISSUED_BY": "이준호",
  "ISSUER_POSITION": "세큐리티 팀장"
}
```

**생성 명령:**

```bash
python scripts/license_certificate_generator.py --config scripts/examples/kovan_license_config.json
```

**결과:**

- 생성 파일: `projects/kovan/KOVAN_license_certificate.html`
- 라이선스 번호: `SK-KOV-202509-XXXX` (자동 생성)

## 질문 및 지원

- 템플릿 수정 문의: CLAUDE.md 참조
- 스크립트 버그: GitHub 이슈 등록

---

**최종 수정일:** 2026-05-26
