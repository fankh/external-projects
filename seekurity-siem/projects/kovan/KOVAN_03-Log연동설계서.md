# KOVAN Log 연동 설계서

| 항목 | 내용 |
|------|------|
| 고객사 | KOVAN |
| 작성일 | 2025.11 |
| 작성자 | SeekersLab |
| 버전 | v1.0 |

> **상세 Log Source 목록**: `workbooks/KOVAN_Log연동설계.xlsx`
> **최종 인벤토리**: `workbooks/KOVAN_로그소스목록.xlsx`

---

## 1. 연동 개요

### 1.1 대상 요약

| System Type | 시스템 수 | Protocol |
|-------------|-----------|----------|
| Network Security — 방화벽 | 30대 | Syslog |
| Network Security — VPN | 37대 | Syslog |
| Network Security — IDS/IPS | 3대 | Syslog |
| Network Security — DDoS | 3대 | Syslog + SNMP |
| Endpoint Security — EDR (AhnLab) | 1식 | Agent / API |
| Endpoint Security — DLP | 1식 | Syslog |
| Data & Application — HSM | 2식 | Syslog |
| Data & Application — NAC | 2식 | Syslog |
| Data & Application — DB접근제어 | 1식 | Syslog |
| Data & Application — 망연계 | 2식 | Syslog |
| **합계** | **67+ 시스템** | — |

### 1.2 주요 벤더 (22개)

Juniper, Fortinet, SECUI, Genians, WINS, Penta, AhnLab, Lenovo 등 총 22개 벤더 — 8개 검증 완료(verified), 14개 사후 검증(pending).

---

## 2. 방화벽 연동 (30대 — 발췌)

| 장비명 | IP 마스킹 | 비고 |
|--------|-----------|------|
| 한국 타이밴 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 메인 인터넷 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 웹 인터넷 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 시네마 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 사용자 방화벽 | 10.1.xxx.xxx (2대) | HA |
| HSM 방화벽 | 10.231.xxx.xxx (2대) | HA |
| DS 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 전용선 방화벽 | 10.231.xxx.xxx (2대) | HA |
| DB 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 관제망 방화벽 | 10.231.xxx.xxx (2대) | HA |
| PG/선불 내부 방화벽 | 10.231.xxx.xxx (2대) | HA |
| 그룹웨어 방화벽 | 220.117.xxx.xxx | 단독 |
| Test 방화벽 | 10.231.xxx.xxx | 검증용 |

전체 30대 상세 목록은 Excel 참조.

---

## 3. VPN 연동 (37대 — 발췌)

| 그룹 | 장비 | 비고 |
|------|------|------|
| 일반 | 한국 타이밴 VPN, BHN VPN, 유니클로 VPN, UVAN 운영/개발 | — |
| 카드사 | BC카드 승인 (A/B/C/D), DS BC카드, 농협카드(승인/매입), DS국민카드, DS신한카드, 우리카드 매입전용 | A/B 이중화 일부 |
| 금융 | 현대카드 (A/B), DS 현대카드 (A/B), 신한카드, 현대푸본생명, 국민은행 직불/카드, 제로페이 | — |
| 기타 | Internet BLUEMAX VPN, 패스고, SSL VPN | — |

전체 37대 상세 목록은 Excel 참조.

---

## 4. Endpoint / Data Application 연동

| 시스템 | 연동 방식 | 특이사항 |
|--------|-----------|----------|
| AhnLab EPP/EDR | Agent | 엔드포인트 탐지 및 대응 |
| DLP 외부유출방지 | Syslog | 정보 유출 방지 |
| HSM #1, #2 | Syslog | Hardware Security Module |
| 스팸스나이퍼 | Syslog | 스팸 메일 차단 |
| 업무망 NAC | Syslog | 네트워크 접근 제어 |
| 인터넷 NAC | Syslog | 네트워크 접근 제어 |
| 망연계 #1, #2 | Syslog | 망분리 환경 연계 |
| NEW 샤크라 (DB) | Syslog | Database 접근 제어 |
| 오픈매니저 (SMS) | Syslog | 서버 모니터링 |

---

## 5. Parser 설계

### 5.1 Parser 개발 현황

- 총 22개 벤더 Parser 개발 (8 verified + 14 pending)
- 정규화 표준: OCSF 기반 (`../../docs/event-normalization-strategy.md`)
- Parser 소스 코드: `parsers/KOVAN_Log_Parsers.py` (1159 lines)
- 단위 테스트: `parsers/test_parsers.py`
- 샘플 로그: `parsers/sample_logs.txt`

### 5.2 정규화 핵심 필드

timestamp, src_ip, dst_ip, src_port, dst_port, action, user, severity, event_type, log_source, vendor

---

## 6. 검증 결과

각 Log Source별 다음 항목 검증 완료:

- ✅ Log 수신 확인 (Collector 도달)
- ✅ Parser 적용 확인
- ✅ 정규화 필드 검증
- ✅ Dashboard 표시 확인
- ✅ Alert Rule 동작 테스트

상세 결과: `workbooks/KOVAN_기능확인서_상세.xlsx`

---

## 7. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | 2025.11 | SeekersLab | 최초 작성 |
