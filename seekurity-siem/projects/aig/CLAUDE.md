# CLAUDE.md - AIG SIEM 구축 프로젝트

## 프로젝트 개요

- **고객사**: AIG
- **프로젝트명**: AIG Seekurity SIEM 구축
- **기간**: {START_DATE} ~ {END_DATE}
- **PM**: {PM_NAME}

## 문서 작성 규칙

### 언어 규칙

| 항목 | 규칙 |
|------|------|
| 기본 언어 | 한국어 |
| 기술 용어 | 영어 유지 (IP Address, Syslog, Protocol, Log Source 등) |
| 시스템명 | 원본 유지 (Firewall, VPN, IDS/IPS, EDR, DLP) |
| 벤더/제품명 | 원본 유지 |

### Naming Convention

| 대상 | 규칙 | 예시 |
|------|------|------|
| Log Source Name | [위치]_[시스템종류]_[용도] | Main_Internet_FW |
| Parser Name | [벤더]_[제품]_[버전] | Paloalto_NGFW_v10 |
| Dashboard Name | [영역]_[목적] | Network_Security_Overview |
| Alert Rule | [심각도]_[탐지대상]_[행위] | HIGH_Firewall_Deny_Surge |

## 보안 고려사항

1. IP, 네트워크 정보는 운영 환경 배포 전까지 마스킹
2. 인증 정보는 별도 보안 저장소에서 관리
3. VPN/전용선 정보 외부 유출 금지

## 작업 시 유의사항

- 모든 설정값은 예시와 함께 제공
- 스크린샷은 민감 정보 마스킹 후 첨부
- 변경 이력은 Git commit으로 관리
- 산출물은 phase별로 단계 완료 시 commit

## 연락처

| 역할 | 담당 | 연락처 |
|------|------|--------|
| PM | {PM_NAME} | {PM_CONTACT} |
| SIEM Engineer | - | - |
| 고객 보안 담당 | - | - |
| 고객 네트워크 담당 | - | - |

## 참고

- 공통 가이드: `../../docs/siem-service-scope.md`
- Parser 가이드: `../../docs/log-parsing-process.md`
- 룰 가이드: `../../docs/rule-creation-process.md`
- 정규화: `../../docs/event-normalization-strategy.md`
