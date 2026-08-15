# AIG Seekurity SIEM 구축 프로젝트

| 항목 | 내용 |
|------|------|
| 고객사 | AIG |
| 사업명 | AIG SIEM 구축 |
| 수행 기간 | {START_DATE} ~ {END_DATE} |
| 수행사 | SeekersLab |

## 폴더 구조

```
aig/
├── AIG_00-수행내용.md/.pdf
├── AIG_01-요구사항정의서.md/.pdf
├── AIG_02-아키텍처설계서.md/.pdf
├── AIG_03-Log연동설계서.md/.pdf
├── AIG_04-탐지시나리오정의서.md/.pdf
├── AIG_05-기능확인서.md/.pdf
├── AIG_06-운영자매뉴얼.md/.pdf
├── AIG_07-완료보고서.md/.pdf
├── README.md, CLAUDE.md
├── workbooks/
│   ├── AIG_SOW.xlsx
│   ├── AIG_일정표.xlsx
│   ├── AIG_Log연동설계.xlsx
│   └── AIG_방화벽정책.xlsx
└── presentations/
    ├── AIG_착수발표.pptx
    └── AIG_완료발표.pptx
```

## 단계별 작성 순서

1. **착수 (Week 1)**: README, CLAUDE, 00-수행내용, AIG_SOW, 01-요구사항정의서, 착수발표
2. **설계 (Week 2)**: 02-아키텍처설계서, 03-Log연동설계서, AIG_Log연동설계, AIG_방화벽정책
3. **구축 (Week 3-4)**: AIG_일정표, Parser 개발
4. **탐지 룰 (Week 4-5)**: 04-탐지시나리오정의서
5. **테스트 (Week 5-6)**: 05-기능확인서
6. **운영 이관 (Week 6)**: 06-운영자매뉴얼, 07-완료보고서, 완료발표

## 산출물 zip 생성

```bash
python scripts/project.py package aig
# → projects/aig/aig_산출물_{YYYYMMDD}.zip
```

## 참고

- 공통 가이드: `../../docs/`
- 자동화 스크립트: `../../scripts/`
- 참조 사례: `../kovan/`
