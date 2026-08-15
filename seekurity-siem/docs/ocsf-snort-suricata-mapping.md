# Snort/Suricata Classtype to OCSF Mapping (IDS/IPS 분류 매핑)

> **Version**: 1.0.0
> **OCSF Version**: 1.4.0
> **Snort Version**: 2.x / 3.x
> **Suricata Version**: 6.x / 7.x
> **Last Updated**: 2026-01-31
> **Parent Document**: [OCSF Detailed Mapping Tables](./ocsf-detailed-mapping-tables.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Complete Classtype to OCSF Mapping](#2-complete-classtype-to-ocsf-mapping)
3. [Priority to Severity Mapping](#3-priority-to-severity-mapping)
4. [Detailed Mapping by Category](#4-detailed-mapping-by-category)
5. [YAML Configuration](#5-yaml-configuration)
6. [Example Normalized Events](#6-example-normalized-events)

---

## 1. Overview

### 1.1 Snort/Suricata Alert Structure

```
alert tcp $EXTERNAL_NET any -> $HOME_NET 445 (
    msg:"ET EXPLOIT MS17-010 EternalBlue Attempt";
    classtype:attempted-admin;
    sid:2024217;
    rev:3;
    metadata:attack_target Server, created_at 2017_04_15, deployment Datacenter;
    reference:cve,2017-0144;
)
```

**Key Fields for OCSF Mapping:**
- `classtype` → OCSF class_uid, severity_id, internal.category
- `msg` → finding_info.title
- `sid` → finding_info.uid
- `priority` → severity_id
- `reference:cve` → vulnerabilities[].cve.uid
- `metadata:attack_target` → device.type

### 1.2 Mapping Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Snort/Suricata → OCSF Mapping Flow                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Snort Alert                                                                    │
│  ───────────                                                                    │
│  classtype: attempted-admin                                                     │
│  priority: 1                                                                    │
│  msg: "ET EXPLOIT MS17-010..."                                                  │
│  sid: 2024217                                                                   │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ OCSF Detection Finding (2004)                                           │   │
│  │ ─────────────────────────────                                           │   │
│  │ class_uid: 2004                                                         │   │
│  │ type_uid: 200401                                                        │   │
│  │ severity_id: 5 (Critical) ← priority 1                                  │   │
│  │ finding_info:                                                           │   │
│  │   uid: "snort:2024217"                                                  │   │
│  │   title: "ET EXPLOIT MS17-010..."                                       │   │
│  │   types: ["Exploit", "Privilege Escalation"]                            │   │
│  │ attacks:                                                                │   │
│  │   tactic: TA0004 (Privilege Escalation)                                 │   │
│  │   technique: T1068 (Exploitation for Privilege Escalation)              │   │
│  │ internal:                                                               │   │
│  │   category: "exploit"                                                   │   │
│  │   subcategory: "admin_privilege_attempt"                                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Classtype to OCSF Mapping

### 2.1 Master Mapping Table

| classtype | Description (EN) | Description (KO) | Snort Priority | OCSF class_uid | OCSF severity_id | Internal Category | Internal Subcategory | MITRE Tactic | MITRE Technique |
|-----------|------------------|------------------|----------------|----------------|------------------|-------------------|---------------------|--------------|-----------------|
| **attempted-admin** | Attempted Admin Privilege Gain | 관리자 권한 획득 시도 | 1 | 2004 | 5 | exploit | admin_privilege_attempt | TA0004 | T1068 |
| **successful-admin** | Successful Admin Privilege Gain | 관리자 권한 획득 성공 | 1 | 2004 | 5 | exploit | admin_privilege_success | TA0004 | T1068 |
| **attempted-user** | Attempted User Privilege Gain | 사용자 권한 획득 시도 | 1 | 2004 | 4 | exploit | user_privilege_attempt | TA0004 | T1068 |
| **successful-user** | Successful User Privilege Gain | 사용자 권한 획득 성공 | 1 | 2004 | 4 | exploit | user_privilege_success | TA0004 | T1068 |
| **unsuccessful-user** | Unsuccessful User Privilege Gain | 사용자 권한 획득 실패 | 1 | 2004 | 3 | exploit | user_privilege_failure | TA0004 | T1068 |
| **shellcode-detect** | Executable Code was Detected | 실행 코드 탐지 | 1 | 2004 | 5 | exploit | shellcode | TA0002 | T1059 |
| **trojan-activity** | A Network Trojan was Detected | 트로이목마 탐지 | 1 | 2004 | 5 | malware | trojan | TA0011 | T1071 |
| **malware-cnc** | Known Malware C&C Traffic | 악성코드 C&C 트래픽 | 1 | 2004 | 5 | malware | command_and_control | TA0011 | T1071 |
| **client-side-exploit** | Known Client Side Exploit | 클라이언트 측 익스플로잇 | 1 | 2004 | 5 | exploit | client_side | TA0002 | T1203 |
| **file-format** | Malicious File or File-Based Exploit | 악성 파일/파일 기반 익스플로잇 | 1 | 2004 | 5 | malware | malicious_file | TA0002 | T1204.002 |
| **web-application-attack** | Web Application Attack | 웹 애플리케이션 공격 | 1 | 2004 | 4 | web_attack | web_app_attack | TA0001 | T1190 |
| **inappropriate-content** | Inappropriate Content | 부적절한 콘텐츠 | 1 | 2004 | 3 | policy_violation | inappropriate_content | - | - |
| **policy-violation** | Potential Corporate Policy Violation | 정책 위반 | 1 | 2004 | 3 | policy_violation | corporate_policy | - | - |
| **attempted-dos** | Attempted Denial of Service | DoS 공격 시도 | 2 | 2004 | 4 | availability_threat | dos_attempt | TA0040 | T1498 |
| **successful-dos** | Denial of Service | DoS 공격 성공 | 2 | 2004 | 5 | availability_threat | dos_success | TA0040 | T1498 |
| **attempted-recon** | Attempted Information Leak | 정보 유출 시도 | 2 | 2004 | 3 | reconnaissance | recon_attempt | TA0043 | T1595 |
| **successful-recon-limited** | Information Leak | 정보 유출 (제한적) | 2 | 2004 | 3 | reconnaissance | recon_limited | TA0043 | T1595 |
| **successful-recon-largescale** | Large Scale Information Leak | 대규모 정보 유출 | 2 | 2004 | 4 | reconnaissance | recon_largescale | TA0043 | T1595 |
| **bad-unknown** | Potentially Bad Traffic | 잠재적 악성 트래픽 | 2 | 2004 | 3 | suspicious | bad_unknown | - | - |
| **suspicious-login** | Attempted Login Using Suspicious Username | 의심스러운 로그인 시도 | 2 | 2004 | 3 | authentication | suspicious_login | TA0006 | T1110 |
| **suspicious-filename-detect** | A Suspicious Filename was Detected | 의심스러운 파일명 탐지 | 2 | 2004 | 3 | suspicious | suspicious_filename | TA0005 | T1036 |
| **default-login-attempt** | Default Username/Password Attempt | 기본 계정 로그인 시도 | 2 | 2004 | 3 | authentication | default_credentials | TA0006 | T1078.001 |
| **system-call-detect** | A System Call was Detected | 시스템 콜 탐지 | 2 | 2004 | 2 | system_activity | system_call | TA0002 | T1106 |
| **unusual-client-port-connection** | Client Using Unusual Port | 비정상 포트 사용 | 2 | 2004 | 2 | network_anomaly | unusual_port | TA0011 | T1571 |
| **non-standard-protocol** | Non-Standard Protocol Detection | 비표준 프로토콜 | 2 | 2004 | 2 | network_anomaly | non_standard_protocol | TA0011 | T1095 |
| **rpc-portmap-decode** | Decode of an RPC Query | RPC 쿼리 디코드 | 2 | 2004 | 2 | network_activity | rpc_decode | - | - |
| **web-application-activity** | Access to Vulnerable Web App | 취약 웹앱 접근 | 2 | 2004 | 2 | web_activity | vulnerable_app_access | TA0043 | T1595.002 |
| **misc-attack** | Misc Attack | 기타 공격 | 2 | 2004 | 3 | misc | misc_attack | - | - |
| **sdf** | Sensitive Data Network Transmission | 민감 데이터 전송 | 2 | 2006 | 4 | data_leak | sensitive_data | TA0010 | T1041 |
| **denial-of-service** | Detection of DoS Attack | DoS 공격 탐지 | 2 | 2004 | 4 | availability_threat | dos_detected | TA0040 | T1498 |
| **network-scan** | Detection of a Network Scan | 네트워크 스캔 탐지 | 3 | 2004 | 2 | reconnaissance | network_scan | TA0043 | T1046 |
| **string-detect** | A Suspicious String was Detected | 의심스러운 문자열 탐지 | 3 | 2004 | 2 | suspicious | suspicious_string | - | - |
| **protocol-command-decode** | Generic Protocol Command Decode | 프로토콜 명령 디코드 | 3 | 2004 | 1 | network_activity | protocol_decode | - | - |
| **misc-activity** | Misc Activity | 기타 활동 | 3 | 2004 | 1 | misc | misc_activity | - | - |
| **icmp-event** | Generic ICMP Event | ICMP 이벤트 | 3 | 2004 | 1 | network_activity | icmp | - | - |
| **not-suspicious** | Not Suspicious Traffic | 정상 트래픽 | 3 | 2004 | 1 | normal | not_suspicious | - | - |
| **unknown** | Unknown Traffic | 알 수 없는 트래픽 | 3 | 2004 | 1 | unknown | unknown | - | - |
| **tcp-connection** | A TCP Connection was Detected | TCP 연결 탐지 | 4 | 4001 | 1 | network_traffic | tcp_connection | - | - |

### 2.2 Extended Classtypes (Emerging Threats / Suricata)

| classtype | Description | Snort Priority | OCSF class_uid | OCSF severity_id | Internal Category | MITRE |
|-----------|-------------|----------------|----------------|------------------|-------------------|-------|
| **exploit-kit** | Exploit Kit Activity Detected | 1 | 2004 | 5 | exploit | TA0001/T1189 |
| **domain-c2** | Domain Observed Used for C2 | 1 | 2004 | 5 | malware | TA0011/T1071.001 |
| **credential-theft** | Credential Theft Detected | 1 | 2004 | 5 | credential_access | TA0006/T1003 |
| **command-and-control** | Command and Control Activity | 1 | 2004 | 5 | malware | TA0011/T1071 |
| **targeted-activity** | Targeted Malicious Activity | 1 | 2004 | 5 | apt | TA0001/T1566 |
| **pup-activity** | Potentially Unwanted Program | 2 | 2004 | 2 | pup | - |
| **social-engineering** | Social Engineering Attempt | 2 | 2004 | 3 | social_engineering | TA0001/T1566 |
| **external-ip-check** | External IP Lookup Detected | 2 | 2004 | 2 | reconnaissance | TA0043/T1590 |
| **coin-mining** | Crypto Mining Activity | 2 | 2004 | 3 | cryptomining | TA0040/T1496 |
| **phishing** | Phishing Attempt Detected | 1 | 2004 | 4 | phishing | TA0001/T1566 |

---

## 3. Priority to Severity Mapping

### 3.1 Snort Priority → OCSF Severity

| Snort Priority | Description | OCSF severity_id | OCSF Severity Name | Response SLA |
|----------------|-------------|------------------|--------------------|--------------|
| **1** | High (Severe) | 5 (Critical) or 4 (High) | Critical/High | 1h / 4h |
| **2** | Medium | 3 (Medium) or 4 (High) | Medium/High | 4h / 24h |
| **3** | Low | 2 (Low) or 1 (Info) | Low/Informational | 24h / 7d |
| **4** | Very Low | 1 (Informational) | Informational | N/A |

### 3.2 Severity Adjustment Rules

```yaml
# Severity can be elevated based on context
severity_adjustments:
  # Elevated if targeting critical assets
  - condition: "dst_ip IN critical_servers"
    adjustment: "+1"
    max: 5

  # Elevated if from known threat actor
  - condition: "src_ip IN threat_intel_iocs"
    adjustment: "+1"
    max: 5

  # Elevated if repeated attempts
  - condition: "count > 10 within 5 minutes"
    adjustment: "+1"
    max: 5

  # Lowered if internal scanner
  - condition: "src_ip IN vuln_scanners"
    adjustment: "-2"
    min: 1
```

---

## 4. Detailed Mapping by Category

### 4.1 Exploit / Privilege Escalation

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **attempted-admin** | | | |
| class_uid | 2004 | category: `exploit` | TA0004 |
| type_uid | 200401 | subcategory: `admin_privilege_attempt` | T1068 |
| severity_id | 5 | priority: `critical` | |
| disposition_id | 15 (Detected) | compliance: `["ISMS-P", "전자금융감독규정"]` | |

```yaml
# attempted-admin mapping
- classtype: "attempted-admin"
  ocsf:
    class_uid: 2004
    class_name: "Detection Finding"
    type_uid: 200401
    activity_id: 1
    severity_id: 5
    disposition_id: 15
  finding_info:
    types: ["Exploit", "Privilege Escalation", "Admin"]
  attacks:
    - tactic:
        uid: "TA0004"
        name: "Privilege Escalation"
      technique:
        uid: "T1068"
        name: "Exploitation for Privilege Escalation"
  internal:
    category: "exploit"
    subcategory: "admin_privilege_attempt"
    priority: "critical"
    compliance: ["ISMS-P", "전자금융감독규정"]
```

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **successful-admin** | | | |
| class_uid | 2004 | category: `exploit` | TA0004 |
| type_uid | 200401 | subcategory: `admin_privilege_success` | T1068 |
| severity_id | 5 | priority: `critical` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **shellcode-detect** | | | |
| class_uid | 2004 | category: `exploit` | TA0002 |
| type_uid | 200401 | subcategory: `shellcode` | T1059 |
| severity_id | 5 | priority: `critical` | |

```yaml
# shellcode-detect mapping
- classtype: "shellcode-detect"
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 5
  finding_info:
    types: ["Exploit", "Shellcode", "Code Execution"]
  attacks:
    - tactic:
        uid: "TA0002"
        name: "Execution"
      technique:
        uid: "T1059"
        name: "Command and Scripting Interpreter"
  internal:
    category: "exploit"
    subcategory: "shellcode"
    priority: "critical"
```

### 4.2 Malware / C&C

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **trojan-activity** | | | |
| class_uid | 2004 | category: `malware` | TA0011 |
| type_uid | 200401 | subcategory: `trojan` | T1071 |
| severity_id | 5 | priority: `critical` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **malware-cnc** | | | |
| class_uid | 2004 | category: `malware` | TA0011 |
| type_uid | 200401 | subcategory: `command_and_control` | T1071 |
| severity_id | 5 | priority: `critical` | |

```yaml
# malware-cnc mapping
- classtype: "malware-cnc"
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 5
  finding_info:
    types: ["Malware", "C&C", "Command and Control"]
  attacks:
    - tactic:
        uid: "TA0011"
        name: "Command and Control"
      technique:
        uid: "T1071"
        name: "Application Layer Protocol"
  internal:
    category: "malware"
    subcategory: "command_and_control"
    priority: "critical"
    compliance: ["ISMS-P"]
```

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **file-format** | | | |
| class_uid | 2004 | category: `malware` | TA0002 |
| type_uid | 200401 | subcategory: `malicious_file` | T1204.002 |
| severity_id | 5 | priority: `critical` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **client-side-exploit** | | | |
| class_uid | 2004 | category: `exploit` | TA0002 |
| type_uid | 200401 | subcategory: `client_side` | T1203 |
| severity_id | 5 | priority: `critical` | |

### 4.3 Web Attacks

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **web-application-attack** | | | |
| class_uid | 2004 | category: `web_attack` | TA0001 |
| type_uid | 200401 | subcategory: `web_app_attack` | T1190 |
| severity_id | 4 | priority: `high` | |

```yaml
# web-application-attack mapping
- classtype: "web-application-attack"
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 4
  finding_info:
    types: ["Web Attack", "Application Attack"]
  attacks:
    - tactic:
        uid: "TA0001"
        name: "Initial Access"
      technique:
        uid: "T1190"
        name: "Exploit Public-Facing Application"
  internal:
    category: "web_attack"
    subcategory: "web_app_attack"
    priority: "high"
    compliance: ["ISMS-P", "전자금융감독규정"]
```

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **web-application-activity** | | | |
| class_uid | 2004 | category: `web_activity` | TA0043 |
| type_uid | 200401 | subcategory: `vulnerable_app_access` | T1595.002 |
| severity_id | 2 | priority: `medium` | |

### 4.4 Reconnaissance / Scanning

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **attempted-recon** | | | |
| class_uid | 2004 | category: `reconnaissance` | TA0043 |
| type_uid | 200401 | subcategory: `recon_attempt` | T1595 |
| severity_id | 3 | priority: `medium` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **successful-recon-largescale** | | | |
| class_uid | 2004 | category: `reconnaissance` | TA0043 |
| type_uid | 200401 | subcategory: `recon_largescale` | T1595 |
| severity_id | 4 | priority: `high` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **network-scan** | | | |
| class_uid | 2004 | category: `reconnaissance` | TA0043 |
| type_uid | 200401 | subcategory: `network_scan` | T1046 |
| severity_id | 2 | priority: `low` | |

```yaml
# network-scan mapping
- classtype: "network-scan"
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 2
  finding_info:
    types: ["Reconnaissance", "Network Scan"]
  attacks:
    - tactic:
        uid: "TA0043"
        name: "Reconnaissance"
      technique:
        uid: "T1046"
        name: "Network Service Discovery"
  internal:
    category: "reconnaissance"
    subcategory: "network_scan"
    priority: "low"
```

### 4.5 DoS / Availability

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **attempted-dos** | | | |
| class_uid | 2004 | category: `availability_threat` | TA0040 |
| type_uid | 200401 | subcategory: `dos_attempt` | T1498 |
| severity_id | 4 | priority: `high` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **successful-dos** | | | |
| class_uid | 2004 | category: `availability_threat` | TA0040 |
| type_uid | 200401 | subcategory: `dos_success` | T1498 |
| severity_id | 5 | priority: `critical` | |

```yaml
# successful-dos mapping
- classtype: "successful-dos"
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 5
  finding_info:
    types: ["DoS", "Denial of Service", "Availability"]
  attacks:
    - tactic:
        uid: "TA0040"
        name: "Impact"
      technique:
        uid: "T1498"
        name: "Network Denial of Service"
  internal:
    category: "availability_threat"
    subcategory: "dos_success"
    priority: "critical"
```

### 4.6 Authentication / Credential

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **suspicious-login** | | | |
| class_uid | 2004 | category: `authentication` | TA0006 |
| type_uid | 200401 | subcategory: `suspicious_login` | T1110 |
| severity_id | 3 | priority: `medium` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **default-login-attempt** | | | |
| class_uid | 2004 | category: `authentication` | TA0006 |
| type_uid | 200401 | subcategory: `default_credentials` | T1078.001 |
| severity_id | 3 | priority: `medium` | |

```yaml
# default-login-attempt mapping
- classtype: "default-login-attempt"
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 3
  finding_info:
    types: ["Authentication", "Default Credentials"]
  attacks:
    - tactic:
        uid: "TA0006"
        name: "Credential Access"
      technique:
        uid: "T1078.001"
        name: "Valid Accounts: Default Accounts"
  internal:
    category: "authentication"
    subcategory: "default_credentials"
    priority: "medium"
    compliance: ["ISMS-P"]
```

### 4.7 Data Loss / Sensitive Data

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **sdf** (Sensitive Data) | | | |
| class_uid | 2006 | category: `data_leak` | TA0010 |
| type_uid | 200601 | subcategory: `sensitive_data` | T1041 |
| severity_id | 4 | priority: `high` | |

```yaml
# sdf (sensitive data) mapping
- classtype: "sdf"
  ocsf:
    class_uid: 2006  # Data Security Finding
    class_name: "Data Security Finding"
    type_uid: 200601
    severity_id: 4
  finding_info:
    types: ["Data Loss", "Sensitive Data", "DLP"]
  attacks:
    - tactic:
        uid: "TA0010"
        name: "Exfiltration"
      technique:
        uid: "T1041"
        name: "Exfiltration Over C2 Channel"
  internal:
    category: "data_leak"
    subcategory: "sensitive_data"
    priority: "high"
    compliance: ["개인정보보호법", "ISMS-P"]
```

### 4.8 Policy Violation

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **policy-violation** | | | |
| class_uid | 2004 | category: `policy_violation` | - |
| type_uid | 200401 | subcategory: `corporate_policy` | - |
| severity_id | 3 | priority: `medium` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **inappropriate-content** | | | |
| class_uid | 2004 | category: `policy_violation` | - |
| type_uid | 200401 | subcategory: `inappropriate_content` | - |
| severity_id | 3 | priority: `medium` | |

### 4.9 Network Activity (Low Severity)

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **tcp-connection** | | | |
| class_uid | 4001 | category: `network_traffic` | - |
| type_uid | 400101 | subcategory: `tcp_connection` | - |
| severity_id | 1 | priority: `info` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **icmp-event** | | | |
| class_uid | 4001 | category: `network_activity` | - |
| type_uid | 400107 | subcategory: `icmp` | - |
| severity_id | 1 | priority: `info` | |

| classtype | OCSF Mapping | Internal | MITRE |
|-----------|--------------|----------|-------|
| **misc-activity** | | | |
| class_uid | 2004 | category: `misc` | - |
| type_uid | 200401 | subcategory: `misc_activity` | - |
| severity_id | 1 | priority: `info` | |

---

## 5. YAML Configuration

### 5.1 Complete Snort Classtype Mapping Configuration

```yaml
# snort_classtype_mapping.yaml
# Version: 1.0.0
# OCSF Version: 1.4.0

vendor: "Snort/Suricata"
product: "IDS/IPS"

# Priority to Severity mapping
priority_mapping:
  1: 5  # Critical (may adjust to 4 based on classtype)
  2: 3  # Medium (may adjust to 4 based on classtype)
  3: 2  # Low (may adjust to 1 based on classtype)
  4: 1  # Informational

# Classtype mappings
classtypes:
  # ============================================
  # Priority 1 - Critical/High Severity
  # ============================================

  attempted-admin:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      activity_id: 1
      severity_id: 5
      disposition_id: 15
    finding_info:
      types: ["Exploit", "Privilege Escalation", "Admin"]
    attacks:
      tactic: "TA0004"
      tactic_name: "Privilege Escalation"
      technique: "T1068"
      technique_name: "Exploitation for Privilege Escalation"
    internal:
      category: "exploit"
      subcategory: "admin_privilege_attempt"
      priority: "critical"
      compliance: ["ISMS-P", "전자금융감독규정"]

  successful-admin:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Exploit", "Privilege Escalation", "Admin", "Success"]
    attacks:
      tactic: "TA0004"
      technique: "T1068"
    internal:
      category: "exploit"
      subcategory: "admin_privilege_success"
      priority: "critical"

  attempted-user:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["Exploit", "Privilege Escalation", "User"]
    attacks:
      tactic: "TA0004"
      technique: "T1068"
    internal:
      category: "exploit"
      subcategory: "user_privilege_attempt"
      priority: "high"

  successful-user:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["Exploit", "Privilege Escalation", "User", "Success"]
    attacks:
      tactic: "TA0004"
      technique: "T1068"
    internal:
      category: "exploit"
      subcategory: "user_privilege_success"
      priority: "high"

  unsuccessful-user:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Exploit", "Privilege Escalation", "User", "Failure"]
    attacks:
      tactic: "TA0004"
      technique: "T1068"
    internal:
      category: "exploit"
      subcategory: "user_privilege_failure"
      priority: "medium"

  shellcode-detect:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Exploit", "Shellcode", "Code Execution"]
    attacks:
      tactic: "TA0002"
      tactic_name: "Execution"
      technique: "T1059"
      technique_name: "Command and Scripting Interpreter"
    internal:
      category: "exploit"
      subcategory: "shellcode"
      priority: "critical"

  trojan-activity:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Malware", "Trojan"]
    attacks:
      tactic: "TA0011"
      tactic_name: "Command and Control"
      technique: "T1071"
      technique_name: "Application Layer Protocol"
    internal:
      category: "malware"
      subcategory: "trojan"
      priority: "critical"

  malware-cnc:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Malware", "C&C", "Command and Control"]
    attacks:
      tactic: "TA0011"
      technique: "T1071"
    internal:
      category: "malware"
      subcategory: "command_and_control"
      priority: "critical"

  client-side-exploit:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Exploit", "Client-Side"]
    attacks:
      tactic: "TA0002"
      technique: "T1203"
      technique_name: "Exploitation for Client Execution"
    internal:
      category: "exploit"
      subcategory: "client_side"
      priority: "critical"

  file-format:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Malware", "Malicious File", "File-Based Exploit"]
    attacks:
      tactic: "TA0002"
      technique: "T1204.002"
      technique_name: "User Execution: Malicious File"
    internal:
      category: "malware"
      subcategory: "malicious_file"
      priority: "critical"

  web-application-attack:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["Web Attack", "Application Attack"]
    attacks:
      tactic: "TA0001"
      tactic_name: "Initial Access"
      technique: "T1190"
      technique_name: "Exploit Public-Facing Application"
    internal:
      category: "web_attack"
      subcategory: "web_app_attack"
      priority: "high"

  inappropriate-content:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Policy Violation", "Inappropriate Content"]
    internal:
      category: "policy_violation"
      subcategory: "inappropriate_content"
      priority: "medium"

  policy-violation:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Policy Violation", "Corporate Policy"]
    internal:
      category: "policy_violation"
      subcategory: "corporate_policy"
      priority: "medium"

  # ============================================
  # Priority 2 - Medium Severity
  # ============================================

  attempted-dos:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["DoS", "Denial of Service", "Attempt"]
    attacks:
      tactic: "TA0040"
      tactic_name: "Impact"
      technique: "T1498"
      technique_name: "Network Denial of Service"
    internal:
      category: "availability_threat"
      subcategory: "dos_attempt"
      priority: "high"

  successful-dos:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["DoS", "Denial of Service", "Success"]
    attacks:
      tactic: "TA0040"
      technique: "T1498"
    internal:
      category: "availability_threat"
      subcategory: "dos_success"
      priority: "critical"

  denial-of-service:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["DoS", "Denial of Service"]
    attacks:
      tactic: "TA0040"
      technique: "T1498"
    internal:
      category: "availability_threat"
      subcategory: "dos_detected"
      priority: "high"

  attempted-recon:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Reconnaissance", "Information Leak"]
    attacks:
      tactic: "TA0043"
      tactic_name: "Reconnaissance"
      technique: "T1595"
      technique_name: "Active Scanning"
    internal:
      category: "reconnaissance"
      subcategory: "recon_attempt"
      priority: "medium"

  successful-recon-limited:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Reconnaissance", "Information Leak", "Limited"]
    attacks:
      tactic: "TA0043"
      technique: "T1595"
    internal:
      category: "reconnaissance"
      subcategory: "recon_limited"
      priority: "medium"

  successful-recon-largescale:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["Reconnaissance", "Information Leak", "Large Scale"]
    attacks:
      tactic: "TA0043"
      technique: "T1595"
    internal:
      category: "reconnaissance"
      subcategory: "recon_largescale"
      priority: "high"

  bad-unknown:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Suspicious", "Unknown Traffic"]
    internal:
      category: "suspicious"
      subcategory: "bad_unknown"
      priority: "medium"

  suspicious-login:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Authentication", "Suspicious Login"]
    attacks:
      tactic: "TA0006"
      tactic_name: "Credential Access"
      technique: "T1110"
      technique_name: "Brute Force"
    internal:
      category: "authentication"
      subcategory: "suspicious_login"
      priority: "medium"

  suspicious-filename-detect:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Suspicious", "Filename"]
    attacks:
      tactic: "TA0005"
      technique: "T1036"
      technique_name: "Masquerading"
    internal:
      category: "suspicious"
      subcategory: "suspicious_filename"
      priority: "medium"

  default-login-attempt:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Authentication", "Default Credentials"]
    attacks:
      tactic: "TA0006"
      technique: "T1078.001"
      technique_name: "Valid Accounts: Default Accounts"
    internal:
      category: "authentication"
      subcategory: "default_credentials"
      priority: "medium"

  system-call-detect:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["System Activity", "System Call"]
    attacks:
      tactic: "TA0002"
      technique: "T1106"
      technique_name: "Native API"
    internal:
      category: "system_activity"
      subcategory: "system_call"
      priority: "low"

  unusual-client-port-connection:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Network Anomaly", "Unusual Port"]
    attacks:
      tactic: "TA0011"
      technique: "T1571"
      technique_name: "Non-Standard Port"
    internal:
      category: "network_anomaly"
      subcategory: "unusual_port"
      priority: "low"

  non-standard-protocol:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Network Anomaly", "Non-Standard Protocol"]
    attacks:
      tactic: "TA0011"
      technique: "T1095"
      technique_name: "Non-Application Layer Protocol"
    internal:
      category: "network_anomaly"
      subcategory: "non_standard_protocol"
      priority: "low"

  rpc-portmap-decode:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Network Activity", "RPC"]
    internal:
      category: "network_activity"
      subcategory: "rpc_decode"
      priority: "low"

  web-application-activity:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Web Activity", "Vulnerable Application"]
    attacks:
      tactic: "TA0043"
      technique: "T1595.002"
      technique_name: "Active Scanning: Vulnerability Scanning"
    internal:
      category: "web_activity"
      subcategory: "vulnerable_app_access"
      priority: "low"

  misc-attack:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Misc", "Attack"]
    internal:
      category: "misc"
      subcategory: "misc_attack"
      priority: "medium"

  sdf:
    ocsf:
      class_uid: 2006  # Data Security Finding
      type_uid: 200601
      severity_id: 4
    finding_info:
      types: ["Data Loss", "Sensitive Data", "DLP"]
    attacks:
      tactic: "TA0010"
      tactic_name: "Exfiltration"
      technique: "T1041"
      technique_name: "Exfiltration Over C2 Channel"
    internal:
      category: "data_leak"
      subcategory: "sensitive_data"
      priority: "high"
      compliance: ["개인정보보호법", "ISMS-P"]

  # ============================================
  # Priority 3 - Low Severity
  # ============================================

  network-scan:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Reconnaissance", "Network Scan"]
    attacks:
      tactic: "TA0043"
      technique: "T1046"
      technique_name: "Network Service Discovery"
    internal:
      category: "reconnaissance"
      subcategory: "network_scan"
      priority: "low"

  string-detect:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Suspicious", "String Detection"]
    internal:
      category: "suspicious"
      subcategory: "suspicious_string"
      priority: "low"

  protocol-command-decode:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 1
    finding_info:
      types: ["Network Activity", "Protocol Decode"]
    internal:
      category: "network_activity"
      subcategory: "protocol_decode"
      priority: "info"

  misc-activity:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 1
    finding_info:
      types: ["Misc", "Activity"]
    internal:
      category: "misc"
      subcategory: "misc_activity"
      priority: "info"

  icmp-event:
    ocsf:
      class_uid: 4001  # Network Activity
      type_uid: 400107
      severity_id: 1
    finding_info:
      types: ["Network Activity", "ICMP"]
    internal:
      category: "network_activity"
      subcategory: "icmp"
      priority: "info"

  not-suspicious:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 1
    finding_info:
      types: ["Normal", "Not Suspicious"]
    internal:
      category: "normal"
      subcategory: "not_suspicious"
      priority: "info"

  unknown:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 1
    finding_info:
      types: ["Unknown"]
    internal:
      category: "unknown"
      subcategory: "unknown"
      priority: "info"

  # ============================================
  # Priority 4 - Informational
  # ============================================

  tcp-connection:
    ocsf:
      class_uid: 4001  # Network Activity
      type_uid: 400101
      activity_id: 1
      severity_id: 1
    internal:
      category: "network_traffic"
      subcategory: "tcp_connection"
      priority: "info"

  # ============================================
  # Extended Classtypes (Emerging Threats)
  # ============================================

  exploit-kit:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Exploit", "Exploit Kit"]
    attacks:
      tactic: "TA0001"
      technique: "T1189"
      technique_name: "Drive-by Compromise"
    internal:
      category: "exploit"
      subcategory: "exploit_kit"
      priority: "critical"

  domain-c2:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Malware", "C&C", "Domain"]
    attacks:
      tactic: "TA0011"
      technique: "T1071.001"
      technique_name: "Application Layer Protocol: Web Protocols"
    internal:
      category: "malware"
      subcategory: "domain_c2"
      priority: "critical"

  credential-theft:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Credential Access", "Theft"]
    attacks:
      tactic: "TA0006"
      technique: "T1003"
      technique_name: "OS Credential Dumping"
    internal:
      category: "credential_access"
      subcategory: "credential_theft"
      priority: "critical"

  command-and-control:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["Malware", "C&C"]
    attacks:
      tactic: "TA0011"
      technique: "T1071"
    internal:
      category: "malware"
      subcategory: "command_and_control"
      priority: "critical"

  targeted-activity:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 5
    finding_info:
      types: ["APT", "Targeted Attack"]
    attacks:
      tactic: "TA0001"
      technique: "T1566"
      technique_name: "Phishing"
    internal:
      category: "apt"
      subcategory: "targeted_activity"
      priority: "critical"

  pup-activity:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["PUP", "Potentially Unwanted Program"]
    internal:
      category: "pup"
      subcategory: "pup_activity"
      priority: "low"

  social-engineering:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Social Engineering"]
    attacks:
      tactic: "TA0001"
      technique: "T1566"
    internal:
      category: "social_engineering"
      subcategory: "social_engineering"
      priority: "medium"

  external-ip-check:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 2
    finding_info:
      types: ["Reconnaissance", "External IP Check"]
    attacks:
      tactic: "TA0043"
      technique: "T1590"
      technique_name: "Gather Victim Network Information"
    internal:
      category: "reconnaissance"
      subcategory: "external_ip_check"
      priority: "low"

  coin-mining:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 3
    finding_info:
      types: ["Cryptomining", "Resource Hijacking"]
    attacks:
      tactic: "TA0040"
      technique: "T1496"
      technique_name: "Resource Hijacking"
    internal:
      category: "cryptomining"
      subcategory: "coin_mining"
      priority: "medium"

  phishing:
    ocsf:
      class_uid: 2004
      type_uid: 200401
      severity_id: 4
    finding_info:
      types: ["Phishing", "Social Engineering"]
    attacks:
      tactic: "TA0001"
      technique: "T1566"
    internal:
      category: "phishing"
      subcategory: "phishing"
      priority: "high"

# Fallback for unknown classtypes
fallback:
  ocsf:
    class_uid: 2004
    type_uid: 200401
    severity_id: 2
  finding_info:
    types: ["Unknown"]
  internal:
    category: "unknown"
    subcategory: "unknown_classtype"
    priority: "low"
```

---

## 6. Example Normalized Events

### 6.1 EternalBlue Exploit Attempt

**Snort Alert:**
```
[**] [1:2024217:3] ET EXPLOIT MS17-010 EternalBlue Attempt [**]
[Classification: Attempted Administrator Privilege Gain] [Priority: 1]
01/31-10:30:45.123456 192.168.1.100:45678 -> 10.0.0.50:445
TCP TTL:64 TOS:0x0 ID:12345 IpLen:20 DgmLen:1500
***AP*** Seq: 0x12345678  Ack: 0x87654321  Win: 0x1000  TcpLen: 32
[Xref => http://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2017-0144]
```

**OCSF Normalized Event:**
```json
{
  "class_uid": 2004,
  "class_name": "Detection Finding",
  "category_uid": 2,
  "category_name": "Findings",
  "type_uid": 200401,
  "type_name": "Detection Finding: Create",
  "activity_id": 1,
  "activity_name": "Create",
  "severity_id": 5,
  "severity": "Critical",
  "status_id": 1,
  "disposition_id": 15,
  "disposition": "Detected",
  "time": 1738319445123,

  "finding_info": {
    "uid": "snort:2024217:3",
    "title": "ET EXPLOIT MS17-010 EternalBlue Attempt",
    "types": ["Exploit", "Privilege Escalation", "Admin"],
    "analytic": {
      "uid": "2024217",
      "name": "ET EXPLOIT MS17-010 EternalBlue",
      "type": "Signature",
      "type_id": 2,
      "version": "3"
    }
  },

  "attacks": [
    {
      "tactic": {
        "uid": "TA0004",
        "name": "Privilege Escalation"
      },
      "technique": {
        "uid": "T1068",
        "name": "Exploitation for Privilege Escalation"
      },
      "version": "14.1"
    }
  ],

  "vulnerabilities": [
    {
      "cve": {
        "uid": "CVE-2017-0144"
      }
    }
  ],

  "src_endpoint": {
    "ip": "192.168.1.100",
    "port": 45678
  },
  "dst_endpoint": {
    "ip": "10.0.0.50",
    "port": 445
  },

  "connection_info": {
    "protocol_name": "TCP",
    "protocol_num": 6
  },

  "metadata": {
    "version": "1.4.0",
    "product": {
      "vendor_name": "Snort",
      "name": "Snort IDS",
      "version": "3.x"
    },
    "original_time": "2026-01-31T10:30:45.123456Z"
  },

  "vendor": {
    "name": "Snort",
    "product": "IDS",
    "original_classtype": "attempted-admin"
  },

  "internal": {
    "category": "exploit",
    "subcategory": "admin_privilege_attempt",
    "priority": "critical",
    "compliance": ["ISMS-P", "전자금융감독규정"]
  },

  "raw_message": "[**] [1:2024217:3] ET EXPLOIT MS17-010..."
}
```

### 6.2 Trojan C&C Communication

**Suricata Alert:**
```
01/31/2026-11:45:30.654321  [**] [1:2030001:1] ET MALWARE Win32/Emotet CnC Checkin [**]
[Classification: A Network Trojan was detected] [Priority: 1]
{TCP} 10.0.0.100:54321 -> 185.234.xxx.xxx:443
```

**OCSF Normalized Event:**
```json
{
  "class_uid": 2004,
  "class_name": "Detection Finding",
  "type_uid": 200401,
  "severity_id": 5,
  "severity": "Critical",

  "finding_info": {
    "uid": "suricata:2030001:1",
    "title": "ET MALWARE Win32/Emotet CnC Checkin",
    "types": ["Malware", "Trojan", "C&C"]
  },

  "attacks": [
    {
      "tactic": {
        "uid": "TA0011",
        "name": "Command and Control"
      },
      "technique": {
        "uid": "T1071",
        "name": "Application Layer Protocol"
      }
    }
  ],

  "malware": [
    {
      "name": "Emotet",
      "classification": {
        "ids": ["Win32/Emotet"]
      }
    }
  ],

  "src_endpoint": {
    "ip": "10.0.0.100",
    "port": 54321
  },
  "dst_endpoint": {
    "ip": "185.234.xxx.xxx",
    "port": 443
  },

  "vendor": {
    "name": "Suricata",
    "original_classtype": "trojan-activity"
  },

  "internal": {
    "category": "malware",
    "subcategory": "trojan",
    "priority": "critical"
  }
}
```

### 6.3 Network Scan Detection

**Snort Alert:**
```
[**] [1:469:4] ICMP PING NMAP [**]
[Classification: Detection of a Network Scan] [Priority: 3]
01/31-12:00:00.000000 192.168.1.50 -> 10.0.0.0/24
ICMP TTL:64 TOS:0x0 ID:0 IpLen:20 DgmLen:84
Type:8  Code:0  ID:12345  Seq:1  ECHO
```

**OCSF Normalized Event:**
```json
{
  "class_uid": 2004,
  "class_name": "Detection Finding",
  "type_uid": 200401,
  "severity_id": 2,
  "severity": "Low",

  "finding_info": {
    "uid": "snort:469:4",
    "title": "ICMP PING NMAP",
    "types": ["Reconnaissance", "Network Scan"]
  },

  "attacks": [
    {
      "tactic": {
        "uid": "TA0043",
        "name": "Reconnaissance"
      },
      "technique": {
        "uid": "T1046",
        "name": "Network Service Discovery"
      }
    }
  ],

  "src_endpoint": {
    "ip": "192.168.1.50"
  },

  "connection_info": {
    "protocol_name": "ICMP",
    "protocol_num": 1
  },

  "vendor": {
    "name": "Snort",
    "original_classtype": "network-scan"
  },

  "internal": {
    "category": "reconnaissance",
    "subcategory": "network_scan",
    "priority": "low"
  }
}
```

---

## References

- [Snort Classification.config (GitHub)](https://github.com/threatstream/snort/blob/master/etc/classification.config)
- [Suricata Classification.config (GitHub)](https://github.com/OISF/suricata/blob/main/etc/classification.config)
- [OCSF Schema Browser](https://schema.ocsf.io/)
- [MITRE ATT&CK Framework](https://attack.mitre.org/)
- [Snort 3 Rule Writing Guide](https://docs.snort.org/rules/options/general/classtype)

---

*End of Document*
