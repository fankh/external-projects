# KOVAN 요구사항 정의서

| 항목 | 내용 |
|------|------|
| 고객사 | KOVAN |
| 작성일 | 2025.09 |
| 작성자 | SeekersLab |
| 버전 | v1.0 |

---

## 1. 프로젝트 개요

### 1.1 배경 및 목적

- **추진 배경**: 기존 분산된 보안 장비 로그 통합 부재, 위협 탐지 및 대응의 가시성 부족
- **도입 목적**: 통합 보안관제 체계 구축을 통한 보안 위협 실시간 탐지 및 대응 역량 확보
- **기대 효과**:
  - 22개 벤더 50+ 장비의 통합 로그 관리
  - MITRE ATT&CK 기반 탐지 및 위협 가시화
  - PCI-DSS 컴플라이언스 대응

### 1.2 추진 범위

- 대상 시스템: 방화벽, VPN, NAC, IPS/IDS, WAF, DDoS, 서버, DLP, EDR
- 주요 벤더: Juniper, Fortinet, SECUI, Genians, WINS, Penta, AhnLab, Lenovo 외 14개
- 구축 범위: 로그 수집/파싱, 탐지 룰 56개, MITRE ATT&CK 매핑, 대시보드, 보고서

---

## 2. 현황 분석

### 2.1 보안 인프라 현황

| 구분 | 시스템 | 수량 |
|------|--------|------|
| Network Security | Firewall | 30대 |
| Network Security | VPN | 37대 |
| Network Security | IDS/IPS | 3대 (한국타이밴, 메인인터넷, 웹인터넷) |
| Network Security | DDoS | 3대 |
| Endpoint Security | EDR (AhnLab EPP/EDR) | 1식 |
| Endpoint Security | DLP (외부유출방지) | 1식 |
| Data & Application | HSM | 2식 |
| Data & Application | NAC (업무망/인터넷) | 2식 |
| Data & Application | DB접근제어 (NEW 샤크라) | 1식 |
| Data & Application | 망연계 | 2식 |

### 2.2 기존 로그 관리 한계

- 장비별 분산 로그 → 통합 검색/상관분석 어려움
- 위협 인지 시점 지연 → MITRE ATT&CK 기반 자동 탐지 부재
- 컴플라이언스 보고 자동화 부재

---

## 3. 요구사항

### 3.1 기능 요구사항

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| FR-01 | 67개 Log Source 통합 수집 (방화벽 30, VPN 37) | High |
| FR-02 | 22개 벤더별 Parser 개발 및 정규화 | High |
| FR-03 | MITRE ATT&CK 14 tactics 매핑 탐지 룰 56개 | High |
| FR-04 | 위협 인텔리전스 (TI) 615건 IOC 연동 | High |
| FR-05 | 통합 보안 대시보드 (Network/Endpoint/Threat) | High |
| FR-06 | 일간/주간/월간 자동 리포트 | Medium |
| FR-07 | Email / Slack 알람 발송 | Medium |
| FR-08 | PCI-DSS 요구사항 매핑 및 증적 관리 | High |

### 3.2 비기능 요구사항

| ID | 요구사항 | 목표 |
|----|----------|------|
| NFR-01 | 시스템 가용성 | 99.5% |
| NFR-02 | 장애 복구 시간 | 24시간 이내 |
| NFR-03 | 로그 보존 기간 | 컴플라이언스 요건 기준 |
| NFR-04 | 검색 응답 시간 | 1시간 범위 기준치 충족 |

### 3.3 운영 요구사항

- 운영 시간대: 24/7 모니터링
- 보고 체계: 월 1회 정기 보고
- 장애 대응 SLA: 48시간 핫라인, 접수 후 24시간 내 원격 대응

---

## 4. 컴플라이언스 요구사항

| 규정 | 적용 범위 | 비고 |
|------|-----------|------|
| PCI-DSS | 카드 결제 관련 시스템 (BC카드, 신한카드, 농협카드, 국민카드, 현대카드 VPN 등) | `workbooks/KOVAN_PCI-DSS_요구사항개발.xlsx` 참조 |

---

## 5. 가정 및 제약사항

- 가정사항: 고객사 네트워크 및 보안 장비 접근 권한 제공
- 제약사항: IP 정보 마스킹 (`10.231.xxx.xxx`), 운영 환경 직접 접근은 협의 후 진행
- 위험요소: 22개 벤더 중 14개는 Parser 사후 검증 단계 (Pending)

---

## 6. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | 2025.09 | SeekersLab | 최초 작성 |
