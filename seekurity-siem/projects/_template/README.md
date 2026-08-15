# {CUSTOMER_NAME} Seekurity SIEM 구축 프로젝트

신규 SIEM 구축 프로젝트 표준 템플릿. 이 폴더를 복사하여 신규 고객사 프로젝트를 시작합니다.

## 사용 방법

```bash
# 신규 고객사 프로젝트 생성 (복사 + 파일명/내용 placeholder 치환 일괄 자동화)
python scripts/project.py init {고객사명}

# 산출물 완성 후 납품용 zip 생성
python scripts/project.py package {고객사명}
# → projects/{고객사명}/{고객사명}_산출물_{YYYYMMDD}.zip
```

## 표준 산출물 구성

| # | 파일 | 단계 |
|---|------|------|
| - | README.md / CLAUDE.md | (내부 가이드) |
| 00 | 00-수행내용.md | 전체 (1.1~1.7) |
| 01 | 01-요구사항정의서.md | 1.1 사전 분석 |
| 02 | 02-아키텍처설계서.md | 1.2 설계 |
| 03 | 03-Log연동설계서.md | 1.3 구축 |
| 04 | 04-탐지시나리오정의서.md | 1.4 탐지 룰 |
| 05 | 05-기능확인서.md | 1.5 테스트 |
| 06 | 06-운영자매뉴얼.md | 1.6 교육 |
| 07 | 07-완료보고서.md | 1.7 완료 |
| - | `workbooks/{CUSTOMER_NAME}_SOW.xlsx` | 착수 |
| - | `workbooks/{CUSTOMER_NAME}_일정표.xlsx` | 구축 |
| - | `workbooks/{CUSTOMER_NAME}_Log연동설계.xlsx` | 설계 |
| - | `workbooks/{CUSTOMER_NAME}_방화벽정책.xlsx` | 설계 |
| - | `presentations/{CUSTOMER_NAME}_착수발표.pptx`, `Completion.pptx` | 착수/완료 |

## 단계별 산출물 작성 순서

1. **착수 (Week 1)**: README, CLAUDE, 수행내용, SOW, 01-요구사항정의서, 발표(kickoff)
2. **설계 (Week 2)**: 02-아키텍처설계서, 03-Log연동설계서, Logsources, Firewall_Policy
3. **구축 (Week 3-4)**: Deployment_Schedule, Parser 개발
4. **탐지 룰 (Week 4-5)**: 04-탐지시나리오정의서
5. **테스트 (Week 5-6)**: 05-기능확인서
6. **운영 이관 (Week 6)**: 06-운영자매뉴얼, 07-완료보고서, 발표(completion)

## 참고

- 공통 가이드: `siem-engineering/docs/`
- 자동화 스크립트: `siem-engineering/scripts/`
- 참조 사례: `siem-engineering/projects/kovan/`
