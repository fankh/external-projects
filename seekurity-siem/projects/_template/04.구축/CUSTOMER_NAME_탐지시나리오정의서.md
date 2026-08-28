# {CUSTOMER_NAME} 탐지 시나리오 정의서

| 항목 | 내용 |
|------|------|
| 고객사 | {CUSTOMER_NAME} |
| 작성일 | {YYYY-MM-DD} |
| 작성자 | - |
| 버전 | v1.0 |

---

## 1. 개요

MITRE ATT&CK 기반 탐지 시나리오. 룰 작성 가이드는 `docs/rule-creation-process.md` 참조.

### 1.1 탐지 룰 분류

| 룰 유형 | 설명 | 예시 |
|---------|------|------|
| Single Event | 단일 이벤트 매칭 | EDR Malware Detected |
| Threshold | 임계치 초과 | 5분 내 로그인 실패 10회 |
| Correlation | 다중 이벤트 상관 | VPN 접속 후 내부 이상 행위 |
| Sequence | 순차 발생 | Recon → Exploit → C2 |
| Aggregation | 집계 기반 | 시간당 평균 트래픽 N배 초과 |
| Baseline | 기준선 이탈 | 사용자 평균 행위 대비 이상 |

### 1.2 심각도 정의

| 심각도 | 의미 | 대응 SLA |
|--------|------|----------|
| Critical | 즉시 침해 의심 | 15분 |
| High | 심각한 위협 | 1시간 |
| Medium | 모니터링 필요 | 4시간 |
| Low | 참고 수준 | 익영업일 |

---

## 2. 탐지 시나리오 목록

상세 목록은 별도 Excel(`탐지룰목록.xlsx`)로 관리. 본 문서는 카테고리별 핵심 시나리오를 정리.

### 2.1 Initial Access (TA0001)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1078 (Valid Accounts) |
| - | - | - | - | T1190 (Exploit Public-Facing App) |

### 2.2 Execution (TA0002)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1059 (Command Line Interface) |

### 2.3 Persistence (TA0003)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1098 (Account Manipulation) |

### 2.4 Privilege Escalation (TA0004)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1068 (Privilege Escalation) |

### 2.5 Defense Evasion (TA0005)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1070 (Indicator Removal) |

### 2.6 Credential Access (TA0006)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1110 (Brute Force) |

### 2.7 Discovery (TA0007)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1046 (Network Service Scanning) |

### 2.8 Lateral Movement (TA0008)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1021 (Remote Services) |

### 2.9 Collection / Exfiltration (TA0009 / TA0010)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1041 (Exfiltration over C2) |

### 2.10 Command and Control (TA0011)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1071 (Application Layer Protocol) |

### 2.11 Impact (TA0040)

| Rule ID | Rule Name | 심각도 | Log Source | MITRE Technique |
|---------|-----------|--------|------------|------------------|
| - | - | - | - | T1486 (Data Encrypted for Impact) |

---

## 3. 룰 상세 명세 Template

각 룰별 다음 정보 작성:

```
- Rule ID:
- Rule Name:
- 카테고리: MITRE Tactic / Technique
- 심각도:
- 대상 Log Source:
- 탐지 조건 (Pseudo Code):
- True Positive 예시:
- False Positive 가능성 / 예외 처리:
- 대응 가이드:
- 참고 자료:
```

---

## 4. 알람 채널

| 심각도 | 채널 | 수신자 |
|--------|------|--------|
| Critical | Email + SMS + Slack | 보안팀 전원 |
| High | Email + Slack | 보안 운영자 |
| Medium | Slack | 모니터링 담당 |
| Low | 대시보드만 | - |

---

## 5. 변경 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | {YYYY-MM-DD} | - | 최초 작성 |
