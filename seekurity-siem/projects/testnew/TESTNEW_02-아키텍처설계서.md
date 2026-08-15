# TESTNEW SIEM 아키텍처 설계서

| 항목 | 내용 |
|------|------|
| 고객사 | TESTNEW |
| 작성일 | {YYYY-MM-DD} |
| 작성자 | - |
| 버전 | v1.0 |

---

## 1. 아키텍처 개요

### 1.1 시스템 구성도

```
[Log Sources]                  [Collector Tier]            [Manager / Storage Tier]
                                                          ┌──────────────────────┐
Firewall  ────────┐                                      │   Seekurity Manager  │
VPN       ────────┤            ┌──────────────┐         │   - Web UI           │
IDS/IPS   ────────┼─Syslog───►│  Collector   │ ──TLS──►│   - Detection Engine │
EDR       ────────┤            │  - Parser    │         │   - Correlation      │
DLP       ────────┤            │  - Norm.     │         └──────────┬───────────┘
NAC       ────────┤            └──────────────┘                    │
DB접근제어─────────┘                                                ▼
                                                         ┌──────────────────────┐
                                                         │  OpenSearch Storage  │
                                                         │  Hot / Warm / Cold   │
                                                         └──────────────────────┘
```

### 1.2 컴포넌트별 역할

| 컴포넌트 | 역할 | 비고 |
|----------|------|------|
| Manager | 전체 SIEM 관리, Web UI 제공, 탐지/상관분석 | |
| Collector | 로그 수신, Parser/정규화, 전송 | |
| Storage (OpenSearch) | 로그 저장, 검색 인덱스 | |
| PostgreSQL | 메타데이터, 룰/사용자/설정 저장 | |
| Kafka | 메시지 브로커 | |
| Zookeeper | Kafka 클러스터 조정 | |

---

## 2. 용량 산정

### 2.1 로그 수집량 예측

| Log Source | EPS (평균) | EPS (피크) | GB/일 |
|------------|------------|------------|-------|
| Firewall | - | - | - |
| VPN | - | - | - |
| IDS/IPS | - | - | - |
| EDR | - | - | - |
| **합계** | - | - | - |

### 2.2 HW 스펙 산정

| 컴포넌트 | CPU | Memory | Storage | 네트워크 |
|----------|-----|--------|---------|----------|
| Manager | - | - | - | - |
| Collector | - | - | - | - |
| Storage Node | - | - | - | - |

### 2.3 보존 정책

| 데이터 구분 | 기간 | 저장소 |
|-------------|------|--------|
| Hot (실시간 검색) | {N개월} | SSD / Hot Index |
| Warm (정기 검색) | {N개월} | HDD / Warm Index |
| Cold (장기 보관) | {N년} | 외부 백업 / Snapshot |

---

## 3. 네트워크 설계

### 3.1 네트워크 구간

| 구간 | 용도 | 대역폭 |
|------|------|--------|
| Log Source ↔ Collector | 로그 수집 | - |
| Collector ↔ Manager | 정규화 데이터 전송 | - |
| Manager ↔ Storage | 인덱스 저장 | - |
| 운영자 ↔ Manager (Web) | 콘솔 접근 | - |

### 3.2 표준 포트

| Service | Port | Protocol | Direction |
|---------|------|----------|-----------|
| Nginx (HTTPS) | 443 | TCP | Inbound |
| SS-Syslog-Receiver | 514 | UDP | Inbound |
| SS-API | 23001 | TCP | Inbound |
| SS-Console | 23002 | TCP | Inbound |
| OpenSearch API | 19200 | TCP | Bidirectional |
| OpenSearch Transport | 19300 | TCP | Bidirectional |
| PostgreSQL | 15432 | TCP | Bidirectional |
| Kafka | 19092 | TCP | Bidirectional |
| Zookeeper | 12181 | TCP | Bidirectional |

---

## 4. HA / DR 설계 (필요 시)

### 4.1 고가용성 구성

- Manager 이중화: -
- Collector 이중화: -
- Storage Replica: -

### 4.2 재해복구 (DR)

- DR 사이트:
- RTO / RPO:
- 동기화 방식:

---

## 5. 로그 수집 경로 설계

| Protocol | 대상 | 비고 |
|----------|------|------|
| Syslog (UDP/514) | Firewall, VPN, IDS/IPS | |
| Syslog (TCP/6514, TLS) | 민감 로그 | |
| SNMP | 장비 상태 | |
| Agent | EDR, OS, DB | |
| API | SaaS, Cloud | |

---

## 6. 보안 설계

- 통신 암호화: TLS 1.2+
- 인증: LDAP / SSO / 자체 계정
- 권한 관리: RBAC
- 로그 무결성: -
- 백업/복구: -

---

## 7. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | {YYYY-MM-DD} | - | 최초 작성 |
