# CLAUDE.md - KOVAN SIEM 구축 프로젝트

## 프로젝트 개요

- **고객사**: KOVAN
- **사업명**: KOVAN SIEM 통합 보안관제 구축
- **수행 기간**: 2025.09 – 2026.03
- **무상 유지보수**: 2026.06.01 – 2027.05.31

## 핵심 컨텍스트

- 대상 시스템: 방화벽, VPN, NAC, IPS/IDS, WAF, DDoS, 서버, DLP, EDR 등
- 주요 벤더: Juniper, Fortinet, SECUI, Genians, WINS, Penta, AhnLab, Lenovo 외 14개
- 연동 로그 소스: 67대 (방화벽 30 + VPN 37)
- 탐지 룰: 56개 (MITRE ATT&CK 14 tactics 매핑)
- 컴플라이언스: PCI-DSS

## 문서 작성 규칙

- 기본 언어: 한국어
- 기술 용어/시스템명/벤더명: 영어 유지 (Firewall, VPN, IDS/IPS, EDR, DLP 등)
- IP 주소는 마스킹 처리 (`10.231.xxx.xxx` 형식)
- 인증 정보/Credential: 별도 보안 저장소
- VPN/전용선 정보: 외부 유출 금지

## Naming Convention

| 대상 | 규칙 | 예시 |
|------|------|------|
| Log Source Name | [위치]_[시스템종류]_[용도] | Main_Internet_FW |
| Parser Name | [벤더]_[제품]_[버전] | Paloalto_NGFW_v10 |
| Dashboard Name | [영역]_[목적] | Network_Security_Overview |
| Alert Rule | [심각도]_[탐지대상]_[행위] | HIGH_Firewall_Deny_Surge |

## 참고

- 공통 가이드: `../../docs/siem-service-scope.md`
- 완료 보고서 (전체 내역): `KOVAN_07-완료보고서.md`
- 파서 소스: `parsers/`
- DB 스크립트: `source/`
