# KOVAN Seekurity SIEM 구축 프로젝트

| 항목 | 내용 |
|------|------|
| 고객사 | KOVAN |
| 사업명 | KOVAN SIEM 통합 보안관제 구축 |
| 수행 기간 | 2025.09 – 2026.03 (7개월) |
| 무상 유지보수 | 2026.06.01 – 2027.05.31 (12개월) |
| 수행사 | SeekersLab |
| 보안등급 | 대외비 |

## 폴더 구조

```
kovan/
├── KOVAN_00-수행내용.md/.pdf              # 전체 (1.1~1.7)
├── KOVAN_01-요구사항정의서.md/.pdf        # 1.1 사전 분석
├── KOVAN_02-아키텍처설계서.md/.pdf        # 1.2 설계
├── KOVAN_03-Log연동설계서.md/.pdf         # 1.3 구축
├── KOVAN_04-탐지시나리오정의서.md/.pdf    # 1.4 탐지 룰
├── KOVAN_05-기능확인서.md/.pdf            # 1.5 테스트
├── KOVAN_06-운영자매뉴얼.md/.pdf          # 1.6 운영 이관
├── KOVAN_07-완료보고서.md/.pdf            # 1.7 완료 보고
├── KOVAN_08-운영이슈대응.md               # 운영/유지보수 이슈 로그
├── README.md, CLAUDE.md             # 내부 가이드
├── workbooks/                       # 모든 Excel 산출물
├── assets/                          # 스크린샷, SQL, JSON, SVG, 소스 PDF
├── parsers/                         # Log Parser Python 코드
└── presentations/                   # PPTX, 다이어그램
```

## Excel 산출물 (`workbooks/`)

| 단계 | 파일 |
|------|------|
| 착수 | `KOVAN_SOW.xlsx` |
| 구축 | `KOVAN_일정표.xlsx` |
| 설계 | `KOVAN_Log연동설계.xlsx`, `KOVAN_방화벽정책.xlsx` |
| 테스트 | `KOVAN_기능확인서_상세.xlsx`, `KOVAN_기능확인서_요약.xlsx` |
| 완료 (운영) | `KOVAN_탐지룰목록.xlsx`, `KOVAN_위협인텔리전스목록.xlsx`, `KOVAN_보안관제운영룰목록.xlsx`, `KOVAN_로그소스목록.xlsx`, `KOVAN_R&R_연락처.xlsx`, `KOVAN_PCI-DSS_요구사항개발.xlsx` |

## 핵심 지표

- 로그 소스 연동: **67대** (방화벽 30 + VPN 37) — 달성률 100%
- 탐지 룰: **56개** (10개 카테고리, CRITICAL 14 / HIGH 24 / MEDIUM 15 / LOW 3)
- 벤더 파서: **22개**
- MITRE ATT&CK 매핑: **14 tactics**
- 위협 인텔리전스: **615건 IOC**, 17개 피드 연동

## 산출물 zip 생성

```bash
python scripts/project.py package kovan
# → projects/kovan/kovan_산출물_{YYYYMMDD}.zip (PDF + Excel만 포함)
```
