# Seekurity SIEM 구축 프로젝트 템플릿

SIEM(Security Information and Event Management) 솔루션 구축을 위한 표준 프로젝트 워크플로 및 산출물 템플릿.

신규 고객사 프로젝트는 `_template/` 을 복사하여 시작하고, 작성 완료 후 PDF + Excel 만 포함된 zip 으로 납품합니다.

---

## 폴더 구조

```
siem-engineering/
├── README.md                      # 본 문서
├── CLAUDE.md                      # AI Assistant 가이드
│
├── docs/                          # 공통 레퍼런스 (모든 프로젝트 공유)
│   ├── siem-service-scope.md           # 서비스 범위 (수행 내용 1.1~1.7 + 유지보수)
│   ├── log-parsing-process.md          # 로그 파싱 파이프라인
│   ├── rule-creation-process.md        # 탐지 룰 작성 가이드 (6 룰 유형)
│   ├── event-normalization-strategy.md # OCSF 정규화 전략
│   ├── ocsf-detailed-mapping-tables.md # OCSF 벤더 매핑
│   ├── ocsf-snort-suricata-mapping.md  # Snort/Suricata 매핑
│   ├── security-admin-interview-guide.md # 고객 인터뷰 가이드
│   ├── marp-build-notes.md             # Marp 슬라이드 빌드 가이드
│   └── presentations/                  # 발표자료 레퍼런스 (kickoff/completion)
│
├── scripts/                       # 자동화 스크립트
│   ├── project.py                      # 표준 워크플로 (init / package)
│   ├── md_to_pdf.py                    # MD → PDF 변환기 (chromium 헤드리스)
│   ├── sow_manager.py                  # SOW xlsx 생성기
│   ├── deployment_schedule_manager.py  # 구축 일정 xlsx 생성기
│   ├── firewall_policy_manager.py      # 방화벽 정책 xlsx 생성기
│   ├── logsource_manager.py            # Log Source xlsx 관리
│   ├── inspection_report_manager.py    # 정기점검보고서 docx 생성기 (유지보수)
│   └── ...                             # (보조 스크립트)
│
└── projects/                      # 고객사별 프로젝트
    ├── _template/                      # 표준 템플릿 (init 의 원본)
    └── {customer}/                     # 신규 프로젝트 (예: kovan, aig)
```

### 프로젝트 폴더 표준 구조 (`projects/{customer}/`)

모든 산출물 파일에는 `{COMPANY}_` 대문자 접두어가 붙습니다 (예: KOVAN, AIG). 폴더명은 소문자 유지.

```
{customer}/                          # 폴더명 소문자 (예: kovan, aig)
├── README.md, CLAUDE.md             # 프로젝트 인덱스 + AI 가이드
├── {COMPANY}_00-수행내용.md/.pdf      # 전체 (1.1~1.7)
├── {COMPANY}_01-요구사항정의서.md/.pdf # 1.1 사전 분석
├── {COMPANY}_02-아키텍처설계서.md/.pdf # 1.2 설계
├── {COMPANY}_03-Log연동설계서.md/.pdf  # 1.3 구축
├── {COMPANY}_04-탐지시나리오정의서.md/.pdf # 1.4 탐지 룰
├── {COMPANY}_05-기능확인서.md/.pdf    # 1.5 테스트
├── {COMPANY}_06-운영자매뉴얼.md/.pdf  # 1.6 운영 이관
├── {COMPANY}_07-완료보고서.md/.pdf    # 1.7 완료 보고
│
├── workbooks/                       # 모든 Excel 산출물
│   ├── {COMPANY}_SOW.xlsx
│   ├── {COMPANY}_일정표.xlsx
│   ├── {COMPANY}_Log연동설계.xlsx
│   ├── {COMPANY}_방화벽정책.xlsx
│   ├── {COMPANY}_기능확인서_상세.xlsx
│   ├── {COMPANY}_기능확인서_요약.xlsx
│   └── (운영 산출물: {COMPANY}_탐지룰목록, _위협인텔리전스목록, _보안관제운영룰목록,
│        _로그소스목록, _R&R_연락처, _PCI-DSS_요구사항개발 등)
│
├── presentations/                   # 발표자료
│   ├── {COMPANY}_착수발표.pptx
│   ├── {COMPANY}_완료발표.pptx
│   ├── 01-Project-Kickoff.md
│   ├── 02-Project-Completion.md
│   └── diagrams/                    # SVG 다이어그램
│
├── parsers/                         # Log Parser Python 코드 (프로젝트별)
├── reports/                         # 유지보수 정기점검보고서 (.docx)
└── assets/                          # 기타 자산
    ├── screenshots/                      # UI 캡처
    ├── architecture.svg
    ├── threat-intel-export.json
    ├── sql/                              # DB 스크립트
    └── source-pdfs/                      # 원본 참조 자료
```

---

## 새 프로젝트 시작하기

```bash
# 1. 신규 고객사 프로젝트 생성 (_template 복사 + placeholder 자동 치환)
python scripts/project.py init {고객사명}

# 2. projects/{고객사명}/ 하위 산출물 작성
#    - 00~07 마크다운, workbooks/ Excel, presentations/ PPTX 등

# 3. 최종 납품용 zip 생성 (MD 자동 PDF 변환 + .md 제외 + Excel/PDF/PPTX 포함)
python scripts/project.py package {고객사명}
# → projects/{고객사명}/{COMPANY}_산출물_{YYYYMMDD}.zip   (zip 파일명은 대문자)
```

### `project.py` 동작

| 명령 | 동작 |
|------|------|
| `init {customer}` | `projects/_template/` 을 `projects/{customer}/` 로 복사 + 내부 `{CUSTOMER_NAME}` placeholder 치환 |
| `package {customer}` | 모든 `.md` → `.pdf` 자동 변환, **PDF + Excel + PPTX 만** zip 에 포함. `README.md`/`CLAUDE.md` 는 내부 가이드라서 zip 제외 |

### MD → PDF 동작

- 기존 PDF 가 1MB 이상이면 자체 빌드된 풍부한 PDF(Marp+스크린샷 등) 로 간주하여 덮어쓰지 않음 (예: KOVAN 완료보고서 20MB PDF 보존)
- 그 외에는 markdown-it-py + 헤드리스 Chromium 으로 A4 PDF 자동 생성 (한글 폰트, 표, 코드블록 스타일 포함)

---

## 표준 산출물 (수행 내용 1.1 ~ 1.7)

파일명에 `{COMPANY}_` 접두어가 붙으며, 표준 경로는 다음과 같습니다.

| 단계 | 산출물 | 형식 | 위치 (예: KOVAN) |
|------|--------|------|------|
| 착수 | 프로젝트 수행 계획서 | PPTX | `presentations/KOVAN_착수발표.pptx` |
| 착수 | SOW (작업명세서) | XLSX | `workbooks/KOVAN_SOW.xlsx` |
| 1.1 사전 분석 | 요구사항 정의서 | PDF | `KOVAN_01-요구사항정의서.pdf` |
| 1.2 설계 | 아키텍처 설계서 | PDF | `KOVAN_02-아키텍처설계서.pdf` |
| 1.2 설계 | 구축 일정표 | XLSX | `workbooks/KOVAN_일정표.xlsx` |
| 1.3 구축 | Log 연동 설계서 | PDF + XLSX | `KOVAN_03-Log연동설계서.pdf` + `workbooks/KOVAN_Log연동설계.xlsx` |
| 1.3 구축 | 방화벽 정책 요청서 | XLSX | `workbooks/KOVAN_방화벽정책.xlsx` |
| 1.4 탐지 룰 | 탐지 시나리오 정의서 | PDF + XLSX | `KOVAN_04-탐지시나리오정의서.pdf` + `workbooks/KOVAN_탐지룰목록.xlsx` |
| 1.5 테스트 | 기능 확인서 | PDF + XLSX | `KOVAN_05-기능확인서.pdf` + `workbooks/KOVAN_기능확인서_상세.xlsx`, `_요약.xlsx` |
| 1.6 교육 | 운영자 매뉴얼 | PDF | `KOVAN_06-운영자매뉴얼.pdf` |
| 1.7 완료 | 완료 보고서 | PDF | `KOVAN_07-완료보고서.pdf` |

상세 서비스 범위 및 유지보수 내용: `docs/siem-service-scope.md`

---

## 유지보수 산출물 (정기점검)

구축 완료 후 무상 유지보수 기간에는 월 1회 정기점검을 수행하고 점검 결과 보고서를 제공합니다 (서비스 범위 `docs/siem-service-scope.md` §2.3).

| 산출물 | 형식 | 생성 스크립트 | 위치 |
|--------|------|--------------|------|
| 정기점검보고서 | DOCX | `scripts/inspection_report_manager.py` | `projects/{customer}/reports/정기점검보고서_{COMPANY}_{YYYYMMDD}.docx` |

```bash
# JSON config 기반 생성 (권장) — 표 데이터까지 고객사 실측값으로 작성
python scripts/inspection_report_manager.py --config scripts/examples/kovan_inspection_config.json

# CLI 인자 기반 생성 (기본 샘플 데이터 + 메타만 지정)
python scripts/inspection_report_manager.py --company KOVAN --date 2026-06-22 --period 2026-06 \
    --inspector "이준호" --contact "보안운영팀"
```

- 출력 경로: `projects/{customer}/` 가 있으면 그 하위 `reports/`, 없으면 `output/`.
- 보고서 구성: 점검 개요·요약 / **하드웨어 점검**(서버·리소스·HW 상태) / **SIEM 소프트웨어 점검**(서비스·로그수집·인덱스·탐지룰·버전) / 탐지 통계 / 백업 / 발견사항·조치 / 개선 권고 / 점검 확인.
- `--config` JSON 의 `servers`, `resources`, `siem_services`, `log_collection`, `findings`, `recommendations` 등 리스트 키로 표 데이터를 덮어쓸 수 있으며, `SECURITY_GRADE`("대외비" 등) 지정 시 표지·footer 에 보안등급이 표기됩니다. 예시: `scripts/examples/{demo,kovan}_inspection_config.json`.
- 필요 의존성: `python-docx` (`pip install python-docx`).

---

## SIEM 구축 단계

```
1. 준비 단계 (1주)
   ├── 킥오프 미팅
   ├── 현황 분석
   └── Log Source 목록 확정

2. 설계 단계 (1주)
   ├── 아키텍처 설계
   ├── 로그 연동 설계
   └── 방화벽 정책 요청

3. 구축 단계 (2주)
   ├── SIEM 설치
   ├── Log Source 연동
   ├── Parser 개발
   └── 탐지 룰 설정

4. 테스트 단계 (3일)
   ├── 연동 검증 (FVT)
   ├── 탐지 테스트
   └── 사용자 교육

5. 안정화 단계 (1주)
   ├── 운영 모니터링
   ├── 튜닝
   └── 문서 이관
```

---

## 표준 포트 (Seekurity SIEM)

| Service | Port | Protocol | Direction |
|---------|------|----------|-----------|
| Nginx (HTTPS) | 443 | TCP | Inbound |
| Nginx (HTTP) | 80 | TCP | Inbound |
| SS-Syslog-Receiver | 514 | UDP | Inbound |
| SS-API | 23001 | TCP | Inbound |
| SS-Console | 23002 | TCP | Inbound |
| OpenSearch API | 19200 | TCP | Bidirectional |
| OpenSearch Transport | 19300 | TCP | Bidirectional |
| PostgreSQL | 15432 | TCP | Bidirectional |
| Kafka | 19092 | TCP | Bidirectional |
| Zookeeper | 12181 | TCP | Bidirectional |

---

## Log Source 분류

| System Type | 예시 | 색상 |
|-------------|------|------|
| **Network Security** | Firewall, VPN, IDS/IPS, DDoS, WAF | Light Green |
| **Endpoint Security** | EDR, DLP, Anti-Virus | Light Orange |
| **Data & Application** | DB Server, Web Server, NAC | Light Blue |

---

## 요구 사항

### Python 환경

```bash
pip install openpyxl pandas markdown-it-py python-docx
```

Python 3.8 이상 권장. PDF 변환은 시스템 Chromium 또는 snap chromium 사용.

---

## 기존 프로젝트

| 프로젝트 | 경로 | 상태 | 비고 |
|----------|------|------|------|
| KOVAN | `projects/kovan/` | 유지보수 중 (2026.06 – 2027.05) | 구축 완료 2025.09 – 2026.03; 67 Log Source, 56 룰, 22 벤더, 615 IOC, 20MB 완료보고서 PDF; 월간 정기점검보고서 → `reports/` |
| AIG | `projects/aig/` | 신규 | 신규 시작 (템플릿 인스턴스) |

---

## 참고 자료

- [Seekurity SIEM Documentation](https://docs.seekurity.com/)
- [OpenSearch Documentation](https://opensearch.org/docs/)
- [MITRE ATT&CK](https://attack.mitre.org/)
- [Sigma Rules](https://github.com/SigmaHQ/sigma)

---

*최종 수정일: 2026-05-13*
