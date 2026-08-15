# KOVAN 탐지 시나리오 정의서

| 항목 | 내용 |
|------|------|
| 고객사 | KOVAN |
| 작성일 | 2025.12 |
| 작성자 | SeekersLab |
| 버전 | v1.0 |

> **상세 룰 목록**: `workbooks/KOVAN_탐지룰목록.xlsx` (56개 룰)
> **운영 룰 목록**: `workbooks/KOVAN_보안관제운영룰목록.xlsx`
> **위협 인텔리전스**: `workbooks/KOVAN_위협인텔리전스목록.xlsx`, `assets/threat-intel-export.json`

---

## 1. 개요

MITRE ATT&CK 14 tactics 기반 탐지 룰 56개 설계 및 구현 완료. 룰 작성 가이드: `../../docs/rule-creation-process.md`.

### 1.1 심각도 분포

| 심각도 | 룰 수 | 대응 SLA |
|--------|-------|----------|
| **CRITICAL** | 14 | 15분 (즉시 침해 의심) |
| **HIGH** | 24 | 1시간 (심각한 위협) |
| **MEDIUM** | 15 | 4시간 (모니터링) |
| **LOW** | 3 | 익영업일 (참고) |
| **합계** | **56** | — |

---

## 2. 카테고리별 룰 현황 (10개 카테고리)

| 카테고리 | 룰 수 | CRITICAL | HIGH | MEDIUM | LOW | 주요 탐지 항목 |
|----------|:-----:|:--------:|:----:|:------:|:---:|--------------|
| 방화벽 | 9 | 5 | 3 | 1 | - | 차단 반복, 정책 변경, DDoS, HA 장애 |
| VPN | 6 | 1 | 3 | 2 | - | 로그인 실패, 동시 세션, 해외 IP 접속 |
| 웹 공격 | 8 | 2 | 4 | 2 | - | SQLi, XSS, 커맨드 인젝션, 스캐너 |
| 인증/계정 | 4 | 1 | 2 | - | 1 | 계정 잠금, 권한 상승, 크리덴셜 스터핑 |
| 악성코드/C2 | 3 | 1 | 2 | - | - | C2 통신, DNS 터널링, 악성 파일 |
| 네트워크 | 6 | 1 | 2 | 3 | - | 포트 스캔, ARP 스푸핑, SYN Flood |
| 서버/시스템 | 4 | 1 | 1 | 2 | - | 서비스 중지, 비인가 프로세스 |
| 데이터 유출 | 2 | - | 1 | 1 | - | 대용량 다운로드, USB 탐지 |
| 내부자 위협 | 6 | 1 | 4 | 1 | - | 대량 파일 접근, 퇴직자, DB 덤프 |
| 컴플라이언스 | 8 | 1 | 2 | 3 | 2 | 로그 삭제, SSH 키 변경, 크론잡 |
| **합계** | **56** | **14** | **24** | **15** | **3** | — |

---

## 3. MITRE ATT&CK 매핑

14 tactics 전체 커버:

| Tactic ID | Tactic | 매핑 룰 |
|-----------|--------|---------|
| TA0001 | Initial Access | VPN/Firewall 비인가 접근 룰 |
| TA0002 | Execution | 비인가 프로세스 실행 |
| TA0003 | Persistence | 권한 상승, 계정 조작 |
| TA0004 | Privilege Escalation | 권한 변경 이벤트 |
| TA0005 | Defense Evasion | 로그 삭제, 정책 변경 |
| TA0006 | Credential Access | 크리덴셜 스터핑, 브루트포스 |
| TA0007 | Discovery | 포트 스캔, 네트워크 탐색 |
| TA0008 | Lateral Movement | 내부 이동 탐지 |
| TA0009 | Collection | 대량 파일 접근 |
| TA0010 | Exfiltration | 대용량 다운로드, DB 덤프 |
| TA0011 | Command and Control | C2 통신, DNS 터널링 |
| TA0040 | Impact | DDoS, 서비스 중지 |
| TA0042 | Resource Development | TI 매칭 |
| TA0043 | Reconnaissance | 스캐너, 정찰 활동 |

---

## 4. 위협 인텔리전스 (TI) 연동

| 항목 | 수치 |
|------|------|
| 총 IOC | **615건** |
| IPv4 | 322 |
| URL | 277 |
| Domain | 13 |
| Email | 3 |
| CRITICAL | 127 |
| HIGH | 458 |
| MEDIUM | 30 |

**TI 피드 17개** 연동: OpenPhish, KYRA Engine, Spamhaus, IPsum 외 13개

---

## 5. 알람 채널

| 심각도 | 채널 | 대응 |
|--------|------|------|
| CRITICAL | Email + SMS + 즉시 통보 | 15분 내 1차 대응 |
| HIGH | Email + Slack | 1시간 내 분석 |
| MEDIUM | Slack | 4시간 내 확인 |
| LOW | 대시보드 | 익영업일 검토 |

---

## 6. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | 2025.12 | SeekersLab | 최초 작성 (56개 룰 + 615 IOC) |
