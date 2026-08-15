# Seekurity SIEM 라이선스 증서 시스템 - 완료 보고

## 구현 내용

### 1. HTML 증서 템플릿 ✅
**파일**: `projects/_template/assets/CUSTOMER_NAME_license_certificate.html`

- 전문적인 한국식 증서 디자인
- 인쇄/PDF 저장 기능 내장
- 모든 필드를 쉽게 커스터마이징 가능
- 브라우저 인쇄로 A4 PDF 생성

### 2. 증서 생성 스크립트 ✅
**파일**: `scripts/license_certificate_generator.py`

**기능**:
```bash
# JSON 설정으로 생성
python3 license_certificate_generator.py --config config.json

# 명령행으로 생성
python3 license_certificate_generator.py \
  --customer "KOVAN" \
  --start-date "2025-09-01" \
  --end-date "2026-09-01" \
  --log-sources 67
```

**자동 처리**:
- 라이선스 번호 자동 생성 (SK-XXX-YYYYMM-XXXX)
- 발급일 자동 설정
- 선택 필드 기본값 제공

### 3. 패키징 통합 ✅
**파일**: `scripts/project.py` (updated)

**자동 처리 순서**:
1. `license_certificate_config.json` 읽기
2. HTML 증서 생성
3. Chromium/wkhtmltopdf로 PDF 변환
4. 최종 zip에 포함 (HTML + PDF)

**사용법**:
```bash
# 한 줄 명령으로 전체 처리
python3 scripts/project.py package kovan
```

### 4. 문서 ✅

- `docs/license-certificate-guide.md` — 스크립트 사용 가이드
- `docs/certificate-packaging-integration.md` — 패키징 통합 가이드
- `docs/CERTIFICATE-SETUP-SUMMARY.md` — 본 문서

## 파일 구조

```
siem-engineering/
├── scripts/
│   ├── project.py (updated)              # 패키징 통합
│   ├── license_certificate_generator.py  # 증서 생성 스크립트
│   └── examples/
│       ├── kovan_license_config.json
│       └── aig_license_config.json
│
├── projects/
│   ├── _template/
│   │   ├── assets/
│   │   │   └── CUSTOMER_NAME_license_certificate.html
│   │   └── license_certificate_config.json (template)
│   │
│   ├── kovan/
│   │   ├── license_certificate_config.json
│   │   ├── KOVAN_license_certificate.html (자동 생성)
│   │   ├── KOVAN_license_certificate.pdf (자동 생성)
│   │   └── KOVAN_산출물_20260526.zip
│   │
│   └── aig/
│       ├── license_certificate_config.json
│       ├── AIG_license_certificate.html (자동 생성)
│       ├── AIG_license_certificate.pdf (자동 생성)
│       └── AIG_산출물_20260526.zip
│
└── docs/
    ├── license-certificate-guide.md
    ├── certificate-packaging-integration.md
    └── CERTIFICATE-SETUP-SUMMARY.md (본 문서)
```

## 테스트 결과

### KOVAN 프로젝트
```
✓ Certificate generated: KOVAN_license_certificate.html
  License Number: SK-KOV-202509-0860
  Period: 2025-09-01 ~ 2026-09-01

✓ PDF generated: KOVAN_license_certificate.pdf (178 KB)

✓ Package created: KOVAN_산출물_20260526.zip
  Files: 116
  Size: 56,373 KB
  PDFs: 9 (증서 포함)
```

### AIG 프로젝트
```
✓ Certificate generated: AIG_license_certificate.html
  License Number: SK-AIG-202601-4131
  Period: 2026-01-15 ~ 2026-04-15

✓ PDF generated: AIG_license_certificate.pdf (178 KB)

✓ Package created: AIG_산출물_20260526.zip
  Files: 55
  Size: 2,166 KB
  PDFs: 12 (증서 포함)
```

## 사용 방법

### 신규 프로젝트 생성

```bash
# 1. 프로젝트 생성 (자동으로 config 템플릿 복사)
python3 scripts/project.py init {customer}

# 2. 라이선스 정보 입력
vi projects/{customer}/license_certificate_config.json

# 3. 패키징 (증서 자동 생성)
python3 scripts/project.py package {customer}
```

### 기존 프로젝트에 추가

기존 프로젝트가 `license_certificate_config.json`을 아직 가지고 있지 않다면:

```bash
# 설정 파일 추가
cp scripts/examples/TEMPLATE_license_config.json \
   projects/{customer}/license_certificate_config.json

# 파일 편집 후 패키징
python3 scripts/project.py package {customer}
```

## 주요 특징

### 자동화
- ✅ 라이선스 번호 자동 생성
- ✅ 발급일 자동 설정 (현재 날짜)
- ✅ HTML → PDF 자동 변환
- ✅ 최종 패키지 자동 포함

### 커스터마이징
- ✅ JSON으로 쉬운 설정
- ✅ HTML 템플릿 수정 가능
- ✅ 색상, 로고, 서명란 커스터마이징 가능

### 품질
- ✅ 한글 완전 지원
- ✅ A4 인쇄 최적화
- ✅ 전문적인 디자인
- ✅ PDF 178KB (적절한 크기)

## 필요 환경

### 필수
- Python 3.8+
- openpyxl, pandas, markdown-it-py

### PDF 변환 (둘 중 하나)
- Chromium (권장): `snap install chromium`
- wkhtmltopdf: `apt-get install wkhtmltopdf`

## 다음 단계 (선택 사항)

1. **디지털 서명** — 증서에 전자 서명 추가
2. **배포 자동화** — 고객에게 자동 이메일 발송
3. **추적 시스템** — 증서 등록번호별 추적
4. **버전 관리** — 증서 버전 히스토리 유지

## 문제 해결

| 문제 | 해결 방법 |
|------|---------|
| PDF 변환 실패 | Chromium 또는 wkhtmltopdf 설치 |
| 한글 깨짐 | 브라우저에서 인쇄 (간단함) |
| 라이선스 번호 오류 | config.json에 수동으로 설정 |

## 문의

- 템플릿 수정: `CLAUDE.md` 참조
- 스크립트 버그: GitHub 이슈 또는 커밋 메시지
- 설정 질문: `docs/certificate-packaging-integration.md` 참조

---

**구현 완료일**: 2026-05-26  
**상태**: ✅ 모든 기능 완성 및 테스트 완료

