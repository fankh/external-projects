# AIG Seekurity SIEM 구축 프로젝트

| 항목 | 내용 |
|------|------|
| 고객사 | AIG |
| 사업명 | AIG SIEM 구축 |
| 수행사 | SeekersLab |
| SIEM 서버 | 10.1.30.4 (Rocky Linux 9.7) |

## 폴더 구조

단계별 산출물 폴더로 구성되어 있습니다. 번호 순서가 곧 수행 순서입니다.

```
aig/
├── 01.사업관리/          착수·일정·보고
│   ├── AIG_수행내용.md/.pdf
│   ├── AIG_SOW.xlsx
│   ├── AIG_일정표.xlsx
│   ├── AIG_착수발표.pptx / AIG_완료발표.pptx
│   └── 주간보고/
│       ├── AIG_주간보고_YYYYMMDD.xlsx      ← 보고용 산출물
│       └── 데이터/YYYY-Www.json            ← 생성 원본
├── 02.분석/              요구사항·현황
│   ├── AIG_요구사항정의서.md/.pdf
│   └── AIG_로그수집정보_20260806.xlsx      ← 고객 제공 수집 대상 목록
├── 03.설계/              아키텍처·연동·방화벽
│   ├── AIG_아키텍처설계서.md/.pdf
│   ├── AIG_Log연동설계서.md/.pdf
│   ├── AIG_Log연동설계.xlsx
│   └── AIG_방화벽정책.xlsx
├── 04.구축/              설치·연동·탐지룰
│   ├── AIG_Filebeat설치매뉴얼.md/.pdf
│   ├── AIG_탐지시나리오정의서.md/.pdf
│   └── 설치스크립트/                        ← 실행 스크립트 및 구축 기록
├── 05.시험/              AIG_기능확인서.md/.pdf
├── 06.이행/              운영 이관
│   ├── AIG_운영자매뉴얼.md/.pdf
│   ├── AIG_운영이슈대응보고서.md
│   └── AIG_완료보고서.md/.pdf
├── 99.참고/              라이선스 증서, 기존 산출물 zip, 발표자료 원본
├── README.md / CLAUDE.md
└── license_certificate_config.json          ← 스크립트가 루트에서 참조합니다
```

## 주간보고 작성

```bash
python scripts/weekly_report_manager.py init aig            # 이번 주 데이터 뼈대 생성
# 01.사업관리/주간보고/데이터/YYYY-Www.json 내용 작성
python scripts/weekly_report_manager.py generate aig        # Excel 생성
```

## 산출물 패키징

```bash
python scripts/project.py package aig
```

`.md` 는 편집용 원본이며 납품 zip 에는 PDF 와 Excel 만 포함됩니다.

## 구축 현황 (2026-08-23)

| 항목 | 상태 |
|------|------|
| SIEM 설치 | 완료 (2026-08-16 설치, 08-21 패치) |
| 수집 중인 Log Source | 2종 — AIG_SSLVPN_FW(10.1.1.1), SIEM 서버(10.1.30.4) |
| 등록 후 대기 중 | 5종 — WAS 2, WEB 2, Gateway (발신측 설정 필요) |
| 미등록 | 6종 — WAF, Fortigate 2, Piolink 2, HP L3 (관리 IP 미확보) |
| 탐지룰 | 정의 완료(12종), 콘솔 등록 예정 |

상세 내역은 `04.구축/설치스크립트/` 의 문서를 참고하시기 바랍니다.

## 참고

- 공통 가이드: `../../docs/`
- 자동화 스크립트: `../../scripts/`
- 설치 가이드: `../../INSTALLATION_GUIDE.md`
