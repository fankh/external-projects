# CLAUDE.md - Seekurity SIEM 구축 프로젝트

## 프로젝트 개요

**프로젝트명**: KOVAN Seekurity SIEM 구축  
**목적**: KOVAN 사 보안 인프라에 Seekurity SIEM을 구축하여 통합 로그 관리 및 보안 모니터링 체계 수립  
**대상 시스템**: Network Security, Endpoint Security, Data & Application 전 영역

---

## 문서 작성 규칙

### 언어 규칙

| 항목 | 규칙 | 예시 |
|------|------|------|
| 기본 언어 | 한국어 | 모든 설명, 지침, 절차 |
| 기술 용어 | 영어 유지 | IP Address, Syslog, Protocol, Log Source |
| 시스템명 | 원본 유지 | Firewall, VPN, IDS/IPS, EDR, DLP |
| 벤더명/제품명 | 원본 유지 | Seekurity SIEM, AhnLab EPP/EDR |

### 영어 유지 용어 목록

**Network 관련**
- IP Address, Port, Protocol, TCP/UDP
- Syslog, SNMP, NetFlow, Packet
- Firewall, VPN, IDS/IPS, DDoS
- WAF (Web Application Firewall)
- SWG (Secure Web Gateway)

**Security 관련**
- Log Source, Event, Alert, Incident
- EDR (Endpoint Detection and Response)
- DLP (Data Loss Prevention)
- NAC (Network Access Control)
- SSL/TLS, Certificate

**시스템 관련**
- Server, Client, Agent, Collector
- Database, Schema, Table
- API, REST, Webhook
- Parser, Normalizer, Correlator

**SIEM 관련**
- Use Case, Rule, Correlation
- Dashboard, Report, Query
- Retention, Archive, Backup
- MITRE ATT&CK, Kill Chain

---

## Log Source 분류 체계

### System Type 정의

| System Type | 설명 | 주요 시스템 |
|-------------|------|-------------|
| **Network Security** | 네트워크 보안 장비 | Firewall, VPN, IDS/IPS, WAF, DDoS |
| **Endpoint Security** | 엔드포인트 보안 솔루션 | EDR, DLP, Anti-Virus, Host Firewall |
| **Data & Application** | 데이터 및 애플리케이션 | DB Server, Web/App Server, NAC |

### Protocol 지원

| Protocol | 용도 | 비고 |
|----------|------|------|
| **Syslog** | 주요 Log 전송 방식 | UDP/TCP 514, TLS 6514 |
| **SNMP** | 장비 상태 모니터링 | Trap 수신 |
| **Agent** | 호스트 기반 수집 | Seekurity Agent 설치 필요 |
| **API** | REST API 연동 | JSON/XML Format |

---

## 현재 연동 대상 시스템

### Network Security (네트워크 보안)

#### Firewall (방화벽)
- 한국 타이밴 방화벽 (2대)
- 메인 인터넷 방화벽 (2대)
- 웹 인터넷 방화벽 (2대)
- 시네마 방화벽 (2대)
- 사용자 방화벽 (2대)
- HSM 방화벽 (2대)
- DS 방화벽 (2대)
- 전용선 방화벽 (2대)
- DB 방화벽 (2대)
- 관제망 방화벽 (2대)
- 망분리 인터넷 방화벽
- 사용자 DLP 방화벽
- VOICE 방화벽
- 그룹웨어 방화벽
- PG/선불 내부 방화벽 (2대)
- Test 방화벽

#### VPN
- 한국 타이밴 VPN
- BHN VPN (2대)
- 유니클로 VPN (2대)
- UVAN 운영 VPN (2대)
- UVAN 개발 VPN
- DS 농협카드 VPN (2대)
- 신한카드 VPN (2대)
- 제로페이
- 현대푸본생명 VPN / DR VPN
- 국민은행 직불/카드 DESC VPN
- Internet BLUEMAX VPN
- DS 현대카드 VPN (A/B)
- 현대카드 VPN (A/B)
- 패스고 VPN
- 우리카드 매입 전용 VPN (A/B)
- BC카드 승인 VPN (A/B/C/D)
- DS BC카드 승인 VPN (A/B)
- 농협카드 승인/매입 VPN (A/B)
- DS 국민카드 VPN (A/B)
- DS 신한카드 VPN (A/B)
- SSL VPN

#### IDS/IPS
- 한국 타이밴 IPS
- 메인 인터넷 IPS
- 웹 인터넷 IPS

#### DDoS
- 한국 타이밴 DDoS
- 메인 인터넷 DDoS
- 웹 인터넷 DDoS

### Endpoint Security (엔드포인트 보안)

| 시스템 | 용도 |
|--------|------|
| DLP 외부유출방지 (신규) | 정보 유출 방지 |
| 안랩 EPP/EDR | 엔드포인트 탐지 및 대응 |

### Data & Application (데이터 및 애플리케이션)

| 시스템 | 용도 |
|--------|------|
| HSM #1, #2 | Hardware Security Module |
| 스팸스나이퍼 | 스팸 메일 차단 |
| 업무망 NAC (센서/서버) | 네트워크 접근 제어 |
| 인터넷 NAC (센서/서버) | 네트워크 접근 제어 |
| 망연계 #1, #2 | 망분리 환경 연계 |
| NEW 샤크라 (DB접근제어) | Database 접근 제어 |
| 오픈매니저 (SMS) | 서버 모니터링 |

---

## 문서 구조

```
siem-engineering/
├── CLAUDE.md                           # 프로젝트 가이드 (현재 문서)
├── SeekuritySIEM_Logsources_KOVAN.xlsx # Log Source 목록 원본
│
├── 01-프로젝트-개요/
│   ├── 01-프로젝트-범위.md              # Project Scope
│   ├── 02-시스템-구성도.md              # System Architecture
│   └── 03-일정-및-마일스톤.md           # Schedule & Milestones
│
├── 02-설계/
│   ├── 01-SIEM-아키텍처.md              # SIEM Architecture Design
│   ├── 02-Log-수집-설계.md              # Log Collection Design
│   ├── 03-Parser-설계.md                # Parser Design
│   ├── 04-Use-Case-설계.md              # Use Case & Correlation Rules
│   └── 05-Dashboard-설계.md             # Dashboard Design
│
├── 03-구축-가이드/
│   ├── 01-Seekurity-SIEM-설치.md        # SIEM Installation Guide
│   ├── 02-Collector-구성.md             # Collector Configuration
│   ├── 03-Log-Source-연동/              # Log Source Integration
│   │   ├── Network-Security/
│   │   │   ├── Firewall-연동.md
│   │   │   ├── VPN-연동.md
│   │   │   ├── IDS-IPS-연동.md
│   │   │   └── DDoS-연동.md
│   │   ├── Endpoint-Security/
│   │   │   ├── EDR-연동.md
│   │   │   └── DLP-연동.md
│   │   └── Data-Application/
│   │       ├── NAC-연동.md
│   │       ├── DB접근제어-연동.md
│   │       └── 망연계-연동.md
│   └── 04-검증-절차.md                  # Validation Procedures
│
├── 04-운영-가이드/
│   ├── 01-일일-점검.md                  # Daily Operations
│   ├── 02-장애-대응.md                  # Incident Response
│   ├── 03-백업-복구.md                  # Backup & Recovery
│   └── 04-성능-튜닝.md                  # Performance Tuning
│
└── 05-부록/
    ├── A-용어집.md                       # Glossary
    ├── B-Syslog-Format-가이드.md        # Syslog Format Reference
    └── C-체크리스트.md                   # Implementation Checklist
```

---

## Log Source 연동 체크리스트 Template

각 Log Source 연동 시 다음 항목을 문서화할 것:

```markdown
## [Log Source Name] 연동

### 기본 정보
| 항목 | 값 |
|------|-----|
| System Type | [Network Security / Endpoint Security / Data & Application] |
| System Name | [예: Firewall, VPN, IDS/IPS] |
| Log Source Name | [예: 메인 인터넷 방화벽] |
| IP Address | [xxx.xxx.xxx.xxx] |
| Protocol | [Syslog / SNMP / Agent / API] |
| Port | [514 / 6514 / Custom] |
| Manager | [담당자명] |

### Syslog 설정
- Facility: [local0-7]
- Severity: [info / warning / error]
- Format: [RFC3164 / RFC5424 / Custom]

### Parser 정보
- Parser Name: [Parser ID]
- Normalization: [적용 여부]
- Custom Fields: [추가 필드 목록]

### 검증 결과
- [ ] Log 수신 확인
- [ ] Parser 적용 확인
- [ ] Dashboard 표시 확인
- [ ] Alert Rule 테스트

### 비고
[특이사항 기록]
```

---

## 작업 시 유의사항

### 보안 고려사항
1. IP Address, 네트워크 정보는 실제 운영 환경 배포 전까지 마스킹 처리
2. 인증 정보(Credential)는 별도 보안 저장소에서 관리
3. VPN, 전용선 관련 정보는 외부 유출 금지

### 문서 작성 규칙
1. 모든 설정값은 예시와 함께 제공
2. 스크린샷은 민감 정보 마스킹 후 첨부
3. 변경 이력은 Git commit으로 관리

### Naming Convention

| 대상 | 규칙 | 예시 |
|------|------|------|
| Log Source Name | [위치]_[시스템종류]_[용도] | Main_Internet_FW |
| Parser Name | [벤더]_[제품]_[버전] | Paloalto_NGFW_v10 |
| Dashboard Name | [영역]_[목적] | Network_Security_Overview |
| Alert Rule | [심각도]_[탐지대상]_[행위] | HIGH_Firewall_Deny_Surge |

---

## 참고 자료

### Seekurity SIEM 공식 문서
- 설치 가이드
- Parser 개발 가이드  
- API Reference
- Use Case Library

### 외부 참고
- MITRE ATT&CK Framework
- NIST Cybersecurity Framework
- 금융보안원 보안 가이드라인

---

## 연락처

| 역할 | 담당 | 비고 |
|------|------|------|
| PM | - | 프로젝트 총괄 |
| SIEM Engineer | - | Seekurity SIEM 구축 |
| 보안 담당자 | - | KOVAN 측 보안 담당 |
| 네트워크 담당자 | - | 방화벽/VPN 설정 지원 |

---

*최종 수정일: 2026-01-13*
