# AIG 탐지 시나리오 정의서

| 항목 | 내용 |
|------|------|
| 고객사 | AIG |
| 작성일 | 2026-08-23 |
| 버전 | v1.1 |
| 근거 | 실제 수집 데이터(2026-08-23) 기준. 수집되지 않는 필드로는 룰을 만들지 않았다. |

---

## 1. 전제 — 현재 수집되는 것만으로 쓴다

룰은 실제로 들어오는 필드에만 걸 수 있다. 2026-08-23 기준 수집 상태는 다음과 같다.

| Log Source | IP | 장비 | eventType | 수집 |
|---|---|---|---|---|
| AIG_SSLVPN_FW | 10.1.1.1 | FortiGate 81F | `fortigate_traffic`, `fortigate_event` | 약 260건/분 |
| AIG_SIEM_Host_Linux | 10.1.30.4 | Rocky 9 (Filebeat) | `linux_syslog`, `syslog_rfc3164`, `syslog_rfc5424` | 약 60건/분 |

사용 가능한 정규화 필드:

- FortiGate — `srcIp`, `srcPort`, `dstIp`, `dstPort`, `action`, `level`, `eventCategory`, `deviceName`, `deviceId`
- Linux — `machineName`, `processName`, `processId`, `message`, `priority`

> WAS/WEB/Gateway 5대는 등록만 되어 있고 수신이 없어, 이들을 전제로 한 룰(§3)은 **수집 개시 후 활성화**한다.

---

## 2. 지금 바로 적용 가능한 룰

### 2.1 HIGH_Syslog_Collection_Blocked — 수집 경로 차단 탐지

| 항목 | 내용 |
|---|---|
| 심각도 | High |
| Log Source | AIG_SSLVPN_FW |
| 유형 | Threshold |
| 조건 | `action="deny" AND dstIp=10.1.30.4 AND dstPort=514` 가 5분 내 10건 이상 |
| MITRE | T1562.006 (Impair Defenses: Indicator Blocking) |

**근거**: 실제로 `211.47.6.115` → `10.1.30.4:514` 가 policy 35 로 deny 되어 329건 기록됐다.
로그를 보내려는 장비가 방화벽에 막히면 SIEM 은 조용히 눈이 먼다. **이 룰이 그 상태를 알려준다.**

**대응**: 출발지 IP 를 확인해 정상 수집 대상이면 방화벽 정책에 허용을 추가하고, 아니면 발신 장비를 조사한다.

### 2.2 HIGH_Firewall_Deny_Surge — 차단 급증

| 항목 | 내용 |
|---|---|
| 심각도 | High |
| 유형 | Aggregation |
| 조건 | 동일 `srcIp` 의 `action="deny"` 가 5분 내 50건 이상 |
| MITRE | T1595 (Active Scanning) |

**근거**: 현재 deny 상위 출발지는 211.47.6.115(305), 165.140.216.140(48), 50.2.184.242(14).
정상 기준선이 srcIp 당 5분에 수 건 수준이므로 50건은 스캔·오설정 양쪽을 잡는다.

### 2.3 CRITICAL_Telnet_Inbound — 외부 Telnet 접근 시도

| 항목 | 내용 |
|---|---|
| 심각도 | Critical |
| 유형 | Single Event |
| 조건 | `dstPort=23 AND action="deny" AND srcIp NOT IN (내부 대역)` |
| MITRE | T1190 (Exploit Public-Facing Application) |

**근거**: dstPort 23 deny 96건. 원문상 `app="Console Management(Telnet)"`, 출발지는 미국·인도 등
해외 IP. 차단되고 있으나 장비 관리 포트를 노린 시도이므로 가시화가 필요하다.

### 2.4 MEDIUM_Port_Scan_Horizontal — 포트 스캔

| 항목 | 내용 |
|---|---|
| 심각도 | Medium |
| 유형 | Aggregation |
| 조건 | 동일 `srcIp` 가 10분 내 서로 다른 `dstPort` 15개 이상에 deny |
| MITRE | T1046 (Network Service Scanning) |

**근거**: deny 목적지 포트가 514, 23, 22, 8080, 1938, 3306, 1701, 6666 등으로 흩어져 있다.

### 2.5 HIGH_SSH_BruteForce — SSH 인증 실패 반복

| 항목 | 내용 |
|---|---|
| 심각도 | High |
| Log Source | AIG_SIEM_Host_Linux |
| 유형 | Threshold |
| 조건 | `processName="sshd" AND message` 에 `Failed password` 포함이 5분 내 5건 이상 (동일 출발지) |
| MITRE | T1110 (Brute Force) |

**근거**: sshd 이벤트 146건 중 `Failed password` 는 현재 1건. 기준선이 낮아 5건 임계치로 충분하다.

### 2.6 MEDIUM_Privilege_Escalation_Sudo — sudo 사용 감시

| 항목 | 내용 |
|---|---|
| 심각도 | Medium |
| 유형 | Single Event |
| 조건 | `processName="sudo" AND message` 에 `COMMAND=` 포함 |
| MITRE | T1548.003 (Sudo and Sudo Caching) |

**근거**: sudo 이벤트 220건 수집 중. 운영 계정의 권한 상승 이력을 남기는 용도.

---

## 3. 수집 개시 후 활성화할 룰

WAS/WEB/Gateway 로그가 들어오기 시작하면 적용한다.

| Rule ID | 대상 | 조건 | MITRE |
|---|---|---|---|
| HIGH_Web_SQLi_Attempt | WEB01/02 (nginx) | access 로그 URI 에 SQLi 패턴 | T1190 |
| HIGH_Web_5xx_Surge | WEB01/02 | 5분 내 5xx 50건 이상 | T1499 |
| MEDIUM_WAS_Error_Surge | WAS01/02 | `/logs/dars` ERROR 급증 | - |
| HIGH_File_Integrity_Change | 전 서버 (AIDE) | AIDE 무결성 변경 이벤트 | T1565 |
| CRITICAL_Account_Created | 전 서버 | `useradd`/`groupadd` 발생 | T1136 |

---

## 4. 운영 룰

### 4.1 INFO_Log_Source_Silent — 수집 중단 감지

| 항목 | 내용 |
|---|---|
| 심각도 | High |
| 유형 | Baseline |
| 조건 | 등록된 Log Source 가 30분 이상 무수신 |

이번 구축에서 **7일간 전 소스 0건이었는데도 아무도 몰랐던 상태**가 실제로 있었다.
수집 자체의 정지를 탐지하는 룰이 없으면 SIEM 은 조용히 무용지물이 된다. 우선순위를 높게 둔다.

---

## 5. 심각도 정의

| 심각도 | 의미 | 대응 SLA |
|--------|------|----------|
| Critical | 즉시 침해 의심 | 15분 |
| High | 심각한 위협 | 1시간 |
| Medium | 모니터링 필요 | 4시간 |
| Low | 참고 수준 | 익영업일 |

---

## 6. 변경 이력

| 버전 | 일자 | 변경 내용 |
|------|------|-----------|
| v1.0 | - | 최초 작성 (템플릿) |
| v1.1 | 2026-08-23 | 실제 수집 데이터 기준으로 룰 구체화. 수집 중인 2개 소스로 즉시 적용 가능한 6종 + 수집 개시 후 5종 + 운영 1종 |
