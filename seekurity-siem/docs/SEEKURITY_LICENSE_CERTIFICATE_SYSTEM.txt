# Seekurity SIEM 라이선스 증서 시스템
## 완전 가이드 (2026-05-26)

---

## 목차

1. [개요](#개요)
2. [시스템 구성](#시스템-구성)
3. [설치 및 설정](#설치-및-설정)
4. [사용 방법](#사용-방법)
5. [예제](#예제)
6. [문제 해결](#문제-해결)

---

## 개요

Seekurity SIEM 라이선스 증서 시스템은 고객 SIEM 구축 프로젝트에 대한 공식 라이선스 증서를 자동으로 생성하고 배포하는 통합 솔루션입니다.

### 주요 기능

- **자동 생성**: JSON 설정으로 전문적인 증서 자동 생성
- **PDF 변환**: HTML → PDF 자동 변환 (Chromium/wkhtmltopdf)
- **패키징 통합**: 최종 프로젝트 패키지에 자동 포함
- **라이선스 번호**: 고유한 라이선스 번호 자동 생성 (SK-XXX-YYYYMM-XXXX)
- **한글 지원**: 완전한 한글 및 멀티바이트 문자 지원

---

## 시스템 구성

### 파일 구조

```
siem-engineering/
├── scripts/
│   ├── project.py (updated)
│   │   └── 패키징 시 증서 자동 생성/변환
│   │
│   ├── license_certificate_generator.py
│   │   └── 독립 실행형 증서 생성 스크립트
│   │
│   └── examples/
│       ├── kovan_license_config.json
│       └── aig_license_config.json
│
├── projects/
│   ├── _template/
│   │   ├── assets/
│   │   │   └── CUSTOMER_NAME_license_certificate.html
│   │   │       (기본 템플릿)
│   │   │
│   │   └── license_certificate_config.json
│   │       (신규 프로젝트 템플릿)
│   │
│   ├── kovan/
│   │   ├── license_certificate_config.json
│   │   ├── KOVAN_license_certificate.html
│   │   ├── KOVAN_license_certificate.pdf
│   │   └── KOVAN_산출물_20260526.zip
│   │
│   └── aig/
│       ├── license_certificate_config.json
│       ├── AIG_license_certificate.html
│       ├── AIG_license_certificate.pdf
│       └── AIG_산출물_20260526.zip
│
└── docs/
    ├── license-certificate-guide.md
    ├── certificate-packaging-integration.md
    ├── CERTIFICATE-SETUP-SUMMARY.md
    └── SEEKURITY_LICENSE_CERTIFICATE_SYSTEM.md (본 문서)
```

### 핵심 컴포넌트

#### 1. HTML 템플릿
**파일**: `projects/_template/assets/CUSTOMER_NAME_license_certificate.html`

- 전문적인 한국식 증서 디자인
- A4 크기 최적화
- 인쇄/PDF 저장 기능 내장
- 모든 필드를 변수로 처리하여 쉽게 커스터마이징

#### 2. 생성 스크립트
**파일**: `scripts/license_certificate_generator.py`

- 독립 실행형 Python 스크립트
- JSON 설정 파일 또는 명령행 인자로 동작
- 라이선스 번호 자동 생성
- HTML 파일 생성

#### 3. 패키징 통합
**파일**: `scripts/project.py` (수정됨)

- `python3 scripts/project.py package {customer}` 실행 시
- 증서 HTML 자동 생성
- PDF 자동 변환
- 최종 zip 패키지에 포함

---

## 설치 및 설정

### 필수 요구사항

#### Python 라이브러리

```bash
pip install openpyxl pandas markdown-it-py
```

#### PDF 변환 (둘 중 하나)

**Chromium (권장)**:
```bash
snap install chromium
```

**또는 wkhtmltopdf**:
```bash
sudo apt-get install wkhtmltopdf
```

### 빠른 시작

#### 1단계: 신규 프로젝트 초기화

```bash
cd /home/khchoi/new-research/siem-engineering
python3 scripts/project.py init {customer_name}
```

예시:
```bash
python3 scripts/project.py init newclient
```

자동으로 생성되는 파일:
- `projects/newclient/license_certificate_config.json` (템플릿)
- `projects/newclient/` 기타 산출물 폴더

#### 2단계: 라이선스 정보 입력

`projects/{customer}/license_certificate_config.json` 편집:

```json
{
  "CUSTOMER_NAME": "NEWCLIENT",
  "INDUSTRY": "금융",
  "CONTACT_PERSON": "홍길동",
  "CONTACT_PHONE": "02-1234-5678",
  "LICENSE_TYPE": "영구 라이선스",
  "START_DATE": "2026-06-01",
  "END_DATE": "2027-06-01",
  "LOG_SOURCE_COUNT": 50,
  "USER_COUNT": 30,
  "DEPLOYMENT_SCOPE": "단일 사이트",
  "ISSUED_BY": "이준호",
  "ISSUER_POSITION": "기술이사"
}
```

#### 3단계: 패키징 실행

```bash
python3 scripts/project.py package newclient
```

결과:
- `projects/newclient/NEWCLIENT_license_certificate.html` (생성됨)
- `projects/newclient/NEWCLIENT_license_certificate.pdf` (자동 생성됨)
- `projects/newclient/NEWCLIENT_산출물_YYYYMMDD.zip` (증서 포함)

---

## 사용 방법

### 방법 1: 자동 패키징 (권장)

프로젝트 패키징 시 증서가 자동으로 생성됩니다.

```bash
python3 scripts/project.py package {customer}
```

**동작**:
1. `license_certificate_config.json` 읽기
2. HTML 증서 생성
3. PDF 변환 (Chromium 또는 wkhtmltopdf)
4. 최종 zip에 포함

### 방법 2: 독립 실행형 스크립트

단독으로 증서를 생성하려면:

```bash
# JSON 설정으로 생성
python3 scripts/license_certificate_generator.py \
  --config projects/kovan/license_certificate_config.json

# 또는 명령행 인자로 생성
python3 scripts/license_certificate_generator.py \
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

### 방법 3: 브라우저 인쇄

HTML 파일을 브라우저에서 직접 인쇄:

1. `{CUSTOMER}_license_certificate.html` 브라우저에서 열기
2. `Ctrl+P` (또는 `Cmd+P` Mac) 누르기
3. "PDF로 저장" 선택
4. 파일명: `{CUSTOMER}_license_certificate.pdf`

---

## 설정 파일 (JSON)

### 필수 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `CUSTOMER_NAME` | 고객사명 (대문자) | KOVAN |
| `START_DATE` | 라이선스 시작 날짜 | 2025-09-01 |
| `END_DATE` | 라이선스 종료 날짜 | 2026-09-01 |

### 선택 필드 (기본값 제공)

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `INDUSTRY` | 정보보안 | 업종 분류 |
| `CONTACT_PERSON` | 담당자 | 고객 담당자명 |
| `CONTACT_PHONE` | - | 담당자 전화 |
| `LICENSE_TYPE` | 평가판 | 라이선스 유형 |
| `LOG_SOURCE_COUNT` | Unlimited | 최대 Log Source 수 |
| `USER_COUNT` | Unlimited | 최대 사용자 수 |
| `DEPLOYMENT_SCOPE` | 단일 사이트 | 배포 범위 |
| `ISSUED_BY` | Seekurity Team | 발급자 |
| `ISSUER_POSITION` | Technical Director | 발급자 직책 |

### 자동 생성 필드

다음 필드는 스크립트가 자동으로 생성합니다:

- `LICENSE_NUMBER` — 형식: `SK-{CODE}-{YYYYMM}-{RANDOM}`
- `ISSUE_DATE` — 현재 날짜 (YYYY-MM-DD)

#### 라이선스 번호 생성 규칙

```
SK-{첫3글자}-{YYYYMM}-{난수}
└─ SK: Seekurity
└─ KOV: KOVAN (고객명 첫 3글자)
└─ 202509: 2025년 9월
└─ 0860: 난수 (0000-9999)

예시:
SK-KOV-202509-0860 (KOVAN, 2025년 9월 생성)
SK-AIG-202601-4131 (AIG, 2026년 1월 생성)
```

---

## 예제

### 예제 1: KOVAN 프로젝트 (완료된 구축)

**설정 파일** (`projects/kovan/license_certificate_config.json`):

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

**실행**:
```bash
python3 scripts/project.py package kovan
```

**결과**:
```
✓ Certificate generated: KOVAN_license_certificate.html
  License Number: SK-KOV-202509-0860
  Period: 2025-09-01 ~ 2026-09-01

✓ PDF generated: KOVAN_license_certificate.pdf (178 KB)

✓ Package created: KOVAN_산출물_20260526.zip
  Files: 116
  PDFs: 9 (증서 포함)
```

### 예제 2: AIG 프로젝트 (평가판)

**설정 파일** (`projects/aig/license_certificate_config.json`):

```json
{
  "CUSTOMER_NAME": "AIG",
  "INDUSTRY": "보험",
  "CONTACT_PERSON": "박민준",
  "CONTACT_PHONE": "031-123-4567",
  "LICENSE_TYPE": "평가판",
  "START_DATE": "2026-01-15",
  "END_DATE": "2026-04-15",
  "LOG_SOURCE_COUNT": 30,
  "USER_COUNT": 20,
  "DEPLOYMENT_SCOPE": "단일 사이트",
  "ISSUED_BY": "이준호",
  "ISSUER_POSITION": "기술이사"
}
```

**실행**:
```bash
python3 scripts/project.py package aig
```

**결과**:
```
✓ Certificate generated: AIG_license_certificate.html
  License Number: SK-AIG-202601-4131
  Period: 2026-01-15 ~ 2026-04-15

✓ PDF generated: AIG_license_certificate.pdf (178 KB)

✓ Package created: AIG_산출물_20260526.zip
  Files: 55
  PDFs: 12 (증서 포함)
```

---

## 커스터마이징

### 색상 변경

HTML 템플릿의 `<style>` 섹션에서 색상 코드 수정:

```css
.header {
    color: #003366;  /* 헤더 색상 (현재: 진한 파란색) */
}

.title {
    color: #003366;  /* 제목 색상 */
}

.info-table th {
    background-color: #f0f0f0;  /* 표 헤더 배경색 */
}
```

### 로고/회사 정보 변경

템플릿에서 다음 부분을 수정:

```html
<div class="logo">Seekurity</div>
<div class="subtitle">Security Information and Event Management</div>
```

```html
<div class="signature-title">발급사</div>
<div class="signature-name">Seekurity Inc.</div>
```

### 폰트 변경

CSS에서 폰트 패밀리 수정:

```css
font-family: 'Noto Sans KR', 'Arial', sans-serif;
```

---

## 패키징 결과 구조

최종 zip 파일에 포함되는 항목:

```
{CUSTOMER}_산출물_YYYYMMDD.zip
├── {CUSTOMER}_00-수행내용.pdf
├── {CUSTOMER}_01-요구사항정의서.pdf
├── {CUSTOMER}_02-아키텍처설계서.pdf
├── {CUSTOMER}_03-Log연동설계서.pdf
├── {CUSTOMER}_04-탐지시나리오정의서.pdf
├── {CUSTOMER}_05-기능확인서.pdf
├── {CUSTOMER}_06-운영자매뉴얼.pdf
├── {CUSTOMER}_07-완료보고서.pdf
├── {CUSTOMER}_license_certificate.html       ← 신규!
├── {CUSTOMER}_license_certificate.pdf        ← 신규!
├── workbooks/
│   ├── {CUSTOMER}_SOW.xlsx
│   ├── {CUSTOMER}_일정표.xlsx
│   ├── {CUSTOMER}_Log연동설계.xlsx
│   ├── {CUSTOMER}_방화벽정책.xlsx
│   └── ...
└── presentations/
    ├── {CUSTOMER}_착수발표.pptx
    ├── {CUSTOMER}_완료발표.pptx
    └── diagrams/
```

**제외 사항**:
- `*.md` 파일 (편집용, PDF만 포함)
- `README.md`, `CLAUDE.md` (내부 가이드)
- `license_certificate_config.json` (설정 파일)

---

## 문제 해결

### 1. PDF 변환 실패

**증상**: `⚠️ Could not convert to PDF`

**원인**: Chromium 또는 wkhtmltopdf 미설치

**해결책**:
```bash
# Chromium 설치 (권장)
snap install chromium

# 또는 wkhtmltopdf 설치
sudo apt-get install wkhtmltopdf
```

### 2. 한글 깨짐

**증상**: 증서의 한글이 깨져 보임

**원인**: 브라우저 인쇄 시 폰트 누락

**해결책**:
1. 브라우저에서 직접 인쇄 (Chromium/Chrome 권장)
2. 또는 wkhtmltopdf 사용

```bash
wkhtmltopdf \
  --page-size A4 \
  projects/kovan/KOVAN_license_certificate.html \
  projects/kovan/KOVAN_license_certificate.pdf
```

### 3. 라이선스 번호 형식 오류

**증상**: 라이선스 번호가 이상한 형식

**해결책**: JSON 설정 파일에 수동으로 지정

```json
{
  "LICENSE_NUMBER": "SK-CUSTOM-202609-9999"
}
```

### 4. 파일 인코딩 오류

**증상**: JSON 설정 파일을 읽을 수 없음

**해결책**: 파일을 UTF-8로 저장

```bash
# Linux/Mac
iconv -f EUC-KR -t UTF-8 config.json > config_utf8.json

# Python
python3 -c "
import json
with open('config.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
"
```

---

## FAQ

**Q: 증서 없이 프로젝트를 패키징할 수 있나요?**

A: 네. `license_certificate_config.json` 파일을 삭제하면 증서가 생성되지 않습니다.

**Q: 기존 증서를 다시 생성하려면?**

A: 다음 파일을 삭제 후 `package` 명령 재실행:
- `KOVAN_license_certificate.html`
- `KOVAN_license_certificate.pdf`

**Q: 여러 프로젝트를 한번에 패키징할 수 있나요?**

A: 각 프로젝트별로 개별 실행:
```bash
python3 scripts/project.py package kovan
python3 scripts/project.py package aig
python3 scripts/project.py package newclient
```

또는 쉘 스크립트로 자동화:
```bash
for customer in kovan aig newclient; do
  python3 scripts/project.py package $customer
done
```

**Q: PDF 대신 HTML만 포함하려면?**

A: `scripts/project.py`의 `generate_license_pdf()` 호출 부분을 주석 처리

**Q: 증서 설정을 프로그래매틱하게 생성할 수 있나요?**

A: 네. Python으로 JSON 파일 생성:

```python
import json
from pathlib import Path

config = {
    "CUSTOMER_NAME": "NEWCLIENT",
    "INDUSTRY": "금융",
    "START_DATE": "2026-06-01",
    "END_DATE": "2027-06-01",
    # ... 기타 필드
}

config_path = Path("projects/newclient/license_certificate_config.json")
with open(config_path, 'w') as f:
    json.dump(config, f, ensure_ascii=False, indent=2)

# 그 다음 패키징
import subprocess
subprocess.run(["python3", "scripts/project.py", "package", "newclient"])
```

---

## 다음 단계 (선택 사항)

### 1. 디지털 서명
증서에 전자 서명 추가하여 위변조 방지

### 2. 배포 자동화
고객에게 자동으로 이메일 발송

### 3. 추적 시스템
증서 번호별 발급/사용 현황 추적

### 4. 버전 관리
증서 업데이트 시 버전 관리 (v1.0, v1.1 등)

### 5. 다중 언어 지원
영문, 중문 등 다국어 버전 추가

---

## 기술 정보

### 의존성

- **Python**: 3.8 이상
- **라이브러리**: openpyxl, pandas, markdown-it-py
- **PDF 변환**: Chromium (권장) 또는 wkhtmltopdf

### 성능

- HTML 생성: ~100ms
- PDF 변환: ~2-3초 (Chromium)
- 전체 패키징: ~10-15초 (프로젝트 크기에 따라)

### 파일 크기

- HTML 증서: ~8-10KB
- PDF 증서: ~170-180KB
- 최종 패키지: 프로젝트별 상이

---

## 문의 및 지원

- **템플릿/스크립트 수정**: `siem-engineering/CLAUDE.md` 참조
- **설정 질문**: `docs/certificate-packaging-integration.md` 참조
- **버그 보고**: GitHub Issues
- **사용 예제**: `scripts/examples/` 참조

---

## 버전 정보

| 항목 | 내용 |
|------|------|
| 시스템 버전 | 1.0 |
| 마지막 업데이트 | 2026-05-26 |
| 테스트 프로젝트 | KOVAN, AIG |
| 상태 | 프로덕션 준비 완료 |

---

## 라이선스

이 시스템은 Seekurity SIEM 프로젝트의 일부입니다.

---

**문서 작성**: 2026-05-26  
**마지막 수정**: 2026-05-26  
**상태**: ✅ 완성 및 테스트 완료
