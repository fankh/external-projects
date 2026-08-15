# KOVAN SIEM 아키텍처 설계서

| 항목 | 내용 |
|------|------|
| 고객사 | KOVAN |
| 작성일 | 2025.10 |
| 작성자 | SeekersLab |
| 버전 | v1.0 |

---

## 1. 아키텍처 개요

### 1.1 시스템 구성

상세 구성도: `deliverables/siem-architecture.svg`

```
[Log Sources]                  [Collector Tier]            [Manager / Storage Tier]
                                                          ┌──────────────────────┐
방화벽 30   ─────┐                                       │   Seekurity Manager  │
VPN 37     ─────┤              ┌──────────────┐         │   - Web UI           │
IDS/IPS 3  ─────┼──Syslog─────►│  Collector   │ ─TLS───►│   - Detection Engine │
DDoS 3     ─────┤              │  - Parser    │         │   - Correlation      │
EDR        ─────┤              │  - Norm.     │         └──────────┬───────────┘
DLP        ─────┤              └──────────────┘                    │
NAC        ─────┤                                                  ▼
DB접근제어 ─────┘                                       ┌──────────────────────┐
                                                       │  OpenSearch Storage  │
                                                       │  + PostgreSQL + Kafka│
                                                       └──────────────────────┘
```

### 1.2 컴포넌트 구성

| 컴포넌트 | 역할 |
|----------|------|
| Manager | 통합 관제 UI, 탐지/상관분석, 룰 관리, 사용자 권한 |
| Collector | Syslog/Agent 로그 수신, 벤더별 Parser (22개), 정규화 |
| OpenSearch | 로그 인덱스 저장 및 검색 |
| PostgreSQL | 메타데이터, 룰 설정, 사용자 정보 |
| Kafka / Zookeeper | 메시지 브로커 (Collector ↔ Manager 비동기) |

---

## 2. 용량 산정

### 2.1 Log Source 수집량

| 구분 | 수량 | 비고 |
|------|------|------|
| 방화벽 | 30대 | Syslog UDP/514 |
| VPN | 37대 | Syslog UDP/514 |
| IDS/IPS | 3대 | Syslog |
| DDoS | 3대 | SNMP + Syslog |
| EDR (AhnLab) | 1식 | Agent / API |
| DLP | 1식 | Syslog |
| NAC | 2식 | Syslog |
| DB접근제어 | 1식 | Syslog |
| **합계** | **67+ 시스템** | — |

### 2.2 보존 정책

- Hot (실시간 검색): 최근 N개월 (PCI-DSS 요건에 따름)
- Warm (정기 검색): N개월
- Cold (장기 보관): 컴플라이언스 요건 기준 (1년 이상)

---

## 3. 네트워크 설계

### 3.1 표준 포트

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

### 3.2 방화벽 정책

상세 정책: `workbooks/KOVAN_방화벽정책.xlsx` (18개 표준 정책)

---

## 4. 로그 수집 경로 설계

| Protocol | 대상 | 구간 |
|----------|------|------|
| Syslog (UDP/514) | 방화벽, VPN, IDS/IPS, DDoS, DLP, NAC | Log Source → Collector |
| Agent | EDR (AhnLab EPP/EDR) | Endpoint → Manager |
| API | 일부 SaaS / 호스트 모니터링 | API → Collector |
| SNMP Trap | DDoS 상태 | Device → Collector |

---

## 5. 보안 설계

- 통신 암호화: TLS 1.2+ (Collector ↔ Manager)
- 인증: 자체 계정 + RBAC
- 로그 무결성: Hash 검증
- 백업/복구: 설정 일일 백업, 인덱스 주간 스냅샷

---

## 6. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | 2025.10 | SeekersLab | 최초 작성 |
