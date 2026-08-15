# 라이선스 증서 자동 생성 및 패키징

## 개요

`project.py package` 명령 실행 시 다음이 자동으로 수행됩니다:

1. **라이선스 증서 HTML 생성** — `license_certificate_config.json`에서 데이터 로드
2. **PDF 변환** — Chromium 또는 wkhtmltopdf 사용
3. **패키지에 포함** — 최종 zip 파일에 HTML + PDF 모두 포함

## 워크플로

### 1단계: 새 프로젝트 생성

```bash
python3 scripts/project.py init {customer}
```

자동으로 생성되는 파일:
- `projects/{customer}/license_certificate_config.json` — 템플릿 설정 파일

### 2단계: 라이선스 정보 입력

`projects/{customer}/license_certificate_config.json` 편집:

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

### 3단계: 패키지 생성

```bash
python3 scripts/project.py package kovan
```

자동으로 생성되는 파일:
- `projects/kovan/KOVAN_license_certificate.html` — 증서 원본
- `projects/kovan/KOVAN_license_certificate.pdf` — 증서 PDF
- `projects/kovan/KOVAN_산출물_YYYYMMDD.zip` — 최종 배포 패키지

## 필드 설명

### 필수 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `CUSTOMER_NAME` | 고객사명 | KOVAN |
| `START_DATE` | 라이선스 시작 | 2025-09-01 |
| `END_DATE` | 라이선스 종료 | 2026-09-01 |

### 선택 필드 (기본값 있음)

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

다음 필드는 자동으로 생성되므로 생략 가능합니다:

- `LICENSE_NUMBER` — 형식: `SK-{CODE}-{YYYYMM}-{RANDOM}`
- `ISSUE_DATE` — 현재 날짜 (패키징 시점)

## 패키징 결과

```
KOVAN_산출물_20260526.zip
├── KOVAN_00-수행내용.pdf
├── KOVAN_01-요구사항정의서.pdf
├── KOVAN_02-아키텍처설계서.pdf
├── KOVAN_03-Log연동설계서.pdf
├── KOVAN_04-탐지시나리오정의서.pdf
├── KOVAN_05-기능확인서.pdf
├── KOVAN_06-운영자매뉴얼.pdf
├── KOVAN_07-완료보고서.pdf
├── KOVAN_license_certificate.html    ← 신규!
├── KOVAN_license_certificate.pdf     ← 신규!
├── workbooks/
│   ├── KOVAN_SOW.xlsx
│   ├── KOVAN_일정표.xlsx
│   ├── KOVAN_Log연동설계.xlsx
│   ├── KOVAN_방화벽정책.xlsx
│   └── ...
└── presentations/
    ├── KOVAN_착수발표.pptx
    └── KOVAN_완료발표.pptx
```

## 자동 제외 사항

패킹 zip에는 다음이 **제외**됩니다:

- `*.md` — 편집용 마크다운 소스 (PDF만 포함)
- `README.md`, `CLAUDE.md` — 내부 가이드 문서
- `license_certificate_config.json` — 설정 파일

## 문제 해결

### 1. PDF 변환 실패

**증상**: `⚠️ Could not convert to PDF`

**해결책**:
```bash
# Chromium 설치 (권장)
snap install chromium

# 또는 wkhtmltopdf 설치
sudo apt-get install wkhtmltopdf
```

### 2. 라이선스 번호 형식 오류

라이선스 번호를 수동으로 지정하려면:

```json
{
  "LICENSE_NUMBER": "SK-CUSTOM-202609-9999"
}
```

### 3. 한글 깨짐

증서 HTML에 다음 문자 인코딩이 포함되어 있는지 확인:

```html
<meta charset="UTF-8">
```

## 커스터마이징

### 템플릿 수정

기본 증서 템플릿: `projects/_template/assets/CUSTOMER_NAME_license_certificate.html`

색상, 로고, 서명란 등을 수정하면 모든 새 프로젝트에 적용됩니다.

### 개별 프로젝트 커스터마이징

특정 프로젝트만 다른 템플릿을 원하면:

1. 템플릿 복사: `projects/{customer}/CUSTOMER_NAME_license_certificate.html`
2. 템플릿 수정
3. `package` 명령 실행 시 자동으로 해당 템플릿 사용

## 예제

### KOVAN 프로젝트 (완료된 구축)

```bash
# 초기화
python3 scripts/project.py init kovan

# 라이선스 정보 입력 (license_certificate_config.json 편집)
# ...

# 패키징
python3 scripts/project.py package kovan
```

결과:
- 라이선스 번호: `SK-KOV-202509-XXXX`
- PDF 크기: ~178KB
- 증서 기간: 2025-09-01 ~ 2026-09-01

### AIG 프로젝트 (평가판)

```bash
# 초기화
python3 scripts/project.py init aig

# 라이선스 정보 입력
# - LICENSE_TYPE: "평가판"
# - 기간: 3개월 (2026-01-15 ~ 2026-04-15)

# 패키징
python3 scripts/project.py package aig
```

## 통합 처리 (Python API)

프로그래매틱 방식으로 증서 생성:

```python
from scripts.project import generate_license_certificate_html, generate_license_pdf

# HTML 생성
html_file = generate_license_certificate_html("KOVAN", Path("projects/kovan"))

# PDF 변환
pdf_file = generate_license_pdf(html_file)
```

## FAQ

**Q: 증서 없이 패키징할 수 있나요?**

A: 네. `license_certificate_config.json` 파일을 삭제하면 증서가 생성되지 않습니다.

**Q: 기존 증서를 덮어쓰려면?**

A: `KOVAN_license_certificate.html` 또는 `license_certificate_config.json` 삭제 후 다시 `package` 명령 실행.

**Q: PDF 대신 HTML만 포함하려면?**

A: `package()` 함수에서 `generate_license_pdf()` 호출 제거.

**Q: 라이선스 번호는 어떻게 생성되나요?**

A: 형식: `SK-{첫3글자}-{YYYYMM}-{난수}`
- SK-KOV-202509-0287 (KOVAN, 2025년 9월)
- SK-AIG-202601-6173 (AIG, 2026년 1월)

---

**최종 수정일**: 2026-05-26
