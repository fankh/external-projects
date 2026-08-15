# {CUSTOMER_NAME} Log 연동 설계서

| 항목 | 내용 |
|------|------|
| 고객사 | {CUSTOMER_NAME} |
| 작성일 | {YYYY-MM-DD} |
| 작성자 | - |
| 버전 | v1.0 |

---

## 1. 연동 개요

연동 대상 Log Source 및 Protocol별 수집 설계. 상세 목록은 `SeekuritySIEM_Logsources_{CUSTOMER_NAME}.xlsx` 참고.

### 1.1 연동 대상 요약

| System Type | 시스템 수 | 일일 로그량 (GB) | EPS |
|-------------|-----------|------------------|-----|
| Network Security | - | - | - |
| Endpoint Security | - | - | - |
| Data & Application | - | - | - |
| **합계** | - | - | - |

### 1.2 연동 우선순위

| Phase | 대상 | 일정 |
|-------|------|------|
| Phase 1 | Firewall, IDS/IPS | Week 1 |
| Phase 2 | VPN, DDoS, WAF | Week 2 |
| Phase 3 | EDR, DLP | Week 3 |
| Phase 4 | NAC, DB접근제어, 기타 | Week 4 |

---

## 2. Protocol별 연동 방식

### 2.1 Syslog (UDP 514 / TCP 6514)

| 항목 | 설정 |
|------|------|
| Facility | local0~7 |
| Severity | info / warning / error |
| Format | RFC3164 / RFC5424 / Custom |
| TLS | TCP 6514 (민감 로그) |

### 2.2 SNMP Trap

| 항목 | 설정 |
|------|------|
| Version | v2c / v3 |
| Community | - |
| OID 정의 | - |

### 2.3 Agent

| 항목 | 설정 |
|------|------|
| Agent 종류 | Seekurity Agent / Beats / Custom |
| 통신 방식 | TLS (TCP) |
| 설치 대상 | OS, EDR, DB |

### 2.4 API (REST)

| 항목 | 설정 |
|------|------|
| 인증 | OAuth / API Key |
| Format | JSON / XML |
| 폴링 주기 | - |

---

## 3. System Type별 연동 설계

### 3.1 Network Security

#### Firewall

| Log Source Name | IP | Protocol | Port | Parser | 담당자 |
|-----------------|-----|----------|------|--------|--------|
| Main_Internet_FW | - | Syslog | 514/UDP | - | - |
| (...) | | | | | |

#### VPN

| Log Source Name | IP | Protocol | Port | Parser | 담당자 |
|-----------------|-----|----------|------|--------|--------|
| - | - | Syslog | 514/UDP | - | - |

#### IDS/IPS

| Log Source Name | IP | Protocol | Port | Parser | 담당자 |
|-----------------|-----|----------|------|--------|--------|
| - | - | Syslog | 514/UDP | - | - |

### 3.2 Endpoint Security

#### EDR

| Log Source Name | IP | Protocol | Port | Parser | 담당자 |
|-----------------|-----|----------|------|--------|--------|
| - | - | Agent / API | - | - | - |

#### DLP

| Log Source Name | IP | Protocol | Port | Parser | 담당자 |
|-----------------|-----|----------|------|--------|--------|
| - | - | Syslog | 514/UDP | - | - |

### 3.3 Data & Application

| 시스템 | 연동 방식 | 비고 |
|--------|-----------|------|
| DB접근제어 | Syslog | |
| 망연계 | Syslog | |
| NAC | Syslog | |

---

## 4. Parser 설계

### 4.1 Parser 개발 원칙

- Vendor 단위 Parser 분리 (예: `Paloalto_NGFW_v10`)
- OCSF 기반 정규화 (`docs/event-normalization-strategy.md` 참조)
- 정규화 필드 우선순위: timestamp, src_ip, dst_ip, action, user, severity

### 4.2 신규 개발 Parser 목록

| Parser Name | 대상 시스템 | 상태 | 담당자 |
|-------------|-------------|------|--------|
| - | - | 개발/테스트/완료 | - |

### 4.3 정규화 매핑 (OCSF)

상세 매핑은 `docs/ocsf-detailed-mapping-tables.md` 참조.

| 원본 필드 | OCSF 필드 | 변환 |
|-----------|-----------|------|
| - | - | - |

---

## 5. 검증 절차

각 Log Source별 다음 항목 확인:

- [ ] Log 수신 확인 (Collector 도달)
- [ ] Parser 정상 적용 확인
- [ ] 정규화 필드 검증
- [ ] Dashboard 표시 확인
- [ ] Alert Rule 동작 테스트

---

## 6. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | {YYYY-MM-DD} | - | 최초 작성 |
