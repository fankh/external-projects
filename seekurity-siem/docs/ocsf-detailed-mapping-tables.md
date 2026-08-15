# OCSF Detailed Mapping Tables (상세 매핑 테이블)

> **Version**: 1.0.0
> **OCSF Version**: 1.4.0
> **Last Updated**: 2026-01-31
> **Parent Document**: [Event Normalization Strategy](./event-normalization-strategy.md)

---

## Table of Contents

1. [Category 2: Findings (탐지 결과)](#1-category-2-findings-탐지-결과)
   - [2004: Detection Finding - IDS/IPS Alerts](#21-detection-finding-2004---idsips-alerts)
   - [2004: Detection Finding - Malware](#22-detection-finding-2004---malware)
   - [2004: Detection Finding - WAF](#23-detection-finding-2004---waf)
   - [2001: Security Finding - EDR](#24-security-finding-2001---edr)
   - [2002: Vulnerability Finding](#25-vulnerability-finding-2002)
   - [2006: Data Security Finding - DLP](#26-data-security-finding-2006---dlp)
2. [Category 3: IAM (인증/계정)](#2-category-3-iam-인증계정)
   - [3002: Authentication](#31-authentication-3002)
   - [3001: Account Change](#32-account-change-3001)
   - [3005: User Access Management](#33-user-access-management-3005)
3. [Category 4: Network Activity (네트워크)](#3-category-4-network-activity-네트워크)
   - [4001: Network Activity - Firewall](#41-network-activity-4001---firewall)
   - [4003: DNS Activity](#42-dns-activity-4003)
   - [4002: HTTP Activity](#43-http-activity-4002)
   - [4007: SSH Activity](#44-ssh-activity-4007)
   - [4014: Tunnel Activity - VPN](#45-tunnel-activity-4014---vpn)
4. [Category 1: System Activity (시스템)](#4-category-1-system-activity-시스템)
   - [1007: Process Activity](#51-process-activity-1007)
   - [1001: File System Activity](#52-file-system-activity-1001)
   - [1006: Scheduled Job Activity](#53-scheduled-job-activity-1006)
5. [Enumeration Reference (열거형 참조)](#5-enumeration-reference-열거형-참조)
6. [Internal Taxonomy Reference (내부 분류 체계)](#6-internal-taxonomy-reference-내부-분류-체계)

---

## 1. Category 2: Findings (탐지 결과)

### 2.1 Detection Finding (2004) - IDS/IPS Alerts

#### Palo Alto Networks NGFW - Threat Log

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **THREAT,vulnerability** | | | |
| class_uid | 2004 | category: `security_threat` | |
| type_uid | 200401 (Create) | subcategory: `exploit_attempt` | TA0001 |
| activity_id | 1 | priority: `high` | T1190 |
| severity_id | 4 (High) | compliance: `["ISMS-P", "전자금융감독규정"]` | |
| disposition_id | 2 (Blocked) / 15 (Detected) | | |

```yaml
# Palo Alto Threat - Vulnerability
- vendor: "Palo Alto"
  product: "NGFW"
  original_event_id: "THREAT,vulnerability"

  ocsf:
    class_uid: 2004
    class_name: "Detection Finding"
    category_uid: 2
    type_uid: 200401
    activity_id: 1
    activity_name: "Create"
    severity_id: 4
    severity: "High"
    disposition_id: 2  # or 15 based on action
    disposition: "Blocked"

  finding_info:
    uid: "${threat_id}"
    title: "${threat_name}"
    types: ["Exploit", "Vulnerability"]
    analytic:
      uid: "PA-THREAT-VULN"
      name: "Palo Alto Vulnerability Detection"
      type: "Signature"
      type_id: 2

  attacks:
    - tactic:
        uid: "TA0001"
        name: "Initial Access"
      technique:
        uid: "T1190"
        name: "Exploit Public-Facing Application"

  internal:
    category: "security_threat"
    subcategory: "exploit_attempt"
    priority: "high"
    compliance: ["ISMS-P", "전자금융감독규정"]
    asset_criticality: "high"
```

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **THREAT,spyware** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200401 | subcategory: `spyware` | TA0009 |
| activity_id | 1 | priority: `high` | T1005 |
| severity_id | 4 | | |
| disposition_id | 2/3 (Blocked/Quarantined) | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **THREAT,virus** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200401 | subcategory: `virus` | TA0002 |
| activity_id | 1 | priority: `critical` | T1204 |
| severity_id | 5 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **THREAT,wildfire** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200401 | subcategory: `zero_day` | TA0002 |
| activity_id | 1 | priority: `critical` | T1203 |
| severity_id | 5 | | |

#### Fortinet FortiGate - UTM Log

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **utm:ips** (action=dropped) | | | |
| class_uid | 2004 | category: `security_threat` | |
| type_uid | 200401 | subcategory: `ips_detection` | TA0001 |
| activity_id | 1 | priority: `high` | T1190/T1203 |
| severity_id | 3-5 (based on level) | | |
| disposition_id | 2 (Blocked) | | |

```yaml
# Fortinet IPS Detection
- vendor: "Fortinet"
  product: "FortiGate"
  original_event_id: "utm:ips"

  ocsf:
    class_uid: 2004
    type_uid: 200401
    activity_id: 1
    severity_id: "${map_severity(level)}"  # critical=5, high=4, medium=3, low=2
    disposition_id: "${map_action(action)}"  # dropped=2, detected=15, passthrough=1

  finding_info:
    uid: "${attackid}"
    title: "${attack}"
    types: ["Intrusion", "IPS"]

  attacks:
    - technique:
        uid: "${map_to_mitre(attackid)}"

  internal:
    category: "security_threat"
    subcategory: "ips_detection"
    priority: "${map_priority(level)}"
```

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **utm:virus** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200401 | subcategory: `antivirus` | TA0002 |
| severity_id | 4-5 | priority: `critical` | T1204 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **utm:webfilter** (action=blocked) | | | |
| class_uid | 2004 | category: `policy_violation` | |
| type_uid | 200401 | subcategory: `web_filtering` | TA0011 |
| severity_id | 2-3 | priority: `medium` | T1071.001 |

#### Snort/Suricata IDS

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **alert** (priority:1) | | | |
| class_uid | 2004 | category: `security_threat` | |
| type_uid | 200401 | subcategory: `ids_alert` | varies |
| severity_id | 5 (Critical) | priority: `critical` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **alert** (priority:2) | | | |
| class_uid | 2004 | category: `security_threat` | |
| severity_id | 4 (High) | priority: `high` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **alert** (priority:3) | | | |
| class_uid | 2004 | category: `security_threat` | |
| severity_id | 3 (Medium) | priority: `medium` | |

---

### 2.2 Detection Finding (2004) - Malware

#### AhnLab EPP/EDR

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **malware_detected** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200401 | subcategory: `malware_detected` | TA0002 |
| activity_id | 1 | priority: `critical` | T1204 |
| severity_id | 5 | compliance: `["ISMS-P", "개인정보보호법"]` | |
| disposition_id | 3 (Quarantined) | | |

```yaml
# AhnLab Malware Detection
- vendor: "AhnLab"
  product: "EPP"
  original_event_id: "malware_detected"

  ocsf:
    class_uid: 2004
    type_uid: 200401
    activity_id: 1
    severity_id: 5
    disposition_id: 3  # Quarantined

  finding_info:
    uid: "${detection_id}"
    title: "${malware_name}"
    types: ["Malware", "${malware_type}"]

  malware:
    - name: "${malware_name}"
      classification:
        ids: ["${malware_family}"]
      path: "${file_path}"
      hash:
        md5: "${md5}"
        sha256: "${sha256}"

  attacks:
    - tactic:
        uid: "TA0002"
        name: "Execution"
      technique:
        uid: "T1204"
        name: "User Execution"

  internal:
    category: "malware"
    subcategory: "malware_detected"
    priority: "critical"
    compliance: ["ISMS-P", "개인정보보호법"]
```

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **malware_cleaned** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200403 (Close) | subcategory: `malware_remediated` | |
| activity_id | 3 | priority: `medium` | |
| disposition_id | 5 (Deleted) / 9 (Restored) | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **ransomware_detected** | | | |
| class_uid | 2004 | category: `malware` | |
| type_uid | 200401 | subcategory: `ransomware` | TA0040 |
| severity_id | 5 (Critical) | priority: `critical` | T1486 |
| disposition_id | 2/3/4 | | |

#### CrowdStrike Falcon

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **DetectionSummaryEvent** | | | |
| class_uid | 2004 | category: `security_threat` | |
| type_uid | 200401 | subcategory: `edr_detection` | varies |
| severity_id | map(Severity) | priority: map(Severity) | from Tactic/Technique |

```yaml
# CrowdStrike Detection
- vendor: "CrowdStrike"
  product: "Falcon"
  original_event_id: "DetectionSummaryEvent"

  ocsf:
    class_uid: 2004
    type_uid: 200401
    activity_id: 1
    severity_id: "${map_cs_severity(Severity)}"
    # Critical=5, High=4, Medium=3, Low=2, Informational=1

  finding_info:
    uid: "${DetectId}"
    title: "${DetectDescription}"
    types: ["${Tactic}", "${Technique}"]

  attacks:
    - tactic:
        uid: "${Tactic}"
        name: "${TacticName}"
      technique:
        uid: "${Technique}"
        name: "${TechniqueName}"

  internal:
    category: "security_threat"
    subcategory: "edr_detection"
    priority: "${map_priority(Severity)}"
```

---

### 2.3 Detection Finding (2004) - WAF

#### Palo Alto / F5 / AWS WAF

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **SQL Injection** | | | |
| class_uid | 2004 | category: `web_attack` | |
| type_uid | 200401 | subcategory: `sql_injection` | TA0001 |
| severity_id | 4 | priority: `high` | T1190 |
| disposition_id | 2 | compliance: `["ISMS-P", "전자금융감독규정"]` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **XSS (Cross-Site Scripting)** | | | |
| class_uid | 2004 | category: `web_attack` | |
| type_uid | 200401 | subcategory: `xss` | TA0001 |
| severity_id | 3-4 | priority: `high` | T1189 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Command Injection** | | | |
| class_uid | 2004 | category: `web_attack` | |
| type_uid | 200401 | subcategory: `command_injection` | TA0002 |
| severity_id | 5 | priority: `critical` | T1059 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Path Traversal** | | | |
| class_uid | 2004 | category: `web_attack` | |
| type_uid | 200401 | subcategory: `path_traversal` | TA0009 |
| severity_id | 4 | priority: `high` | T1083 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Bot Detection** | | | |
| class_uid | 2004 | category: `web_attack` | |
| type_uid | 200401 | subcategory: `bot_activity` | TA0043 |
| severity_id | 2-3 | priority: `medium` | T1595 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Rate Limiting / DDoS** | | | |
| class_uid | 2004 | category: `availability_threat` | |
| type_uid | 200401 | subcategory: `ddos_attack` | TA0040 |
| severity_id | 4-5 | priority: `critical` | T1498/T1499 |

```yaml
# WAF Detection - SQL Injection
- vendor: "Generic WAF"
  product: "WAF"
  original_event_pattern: "sql.*injection|sqli"

  ocsf:
    class_uid: 2004
    type_uid: 200401
    activity_id: 1
    severity_id: 4
    disposition_id: 2

  finding_info:
    types: ["Web Attack", "SQL Injection"]

  attacks:
    - tactic:
        uid: "TA0001"
        name: "Initial Access"
      technique:
        uid: "T1190"
        name: "Exploit Public-Facing Application"

  vulnerabilities:
    - cwe:
        uid: "CWE-89"
        name: "SQL Injection"

  internal:
    category: "web_attack"
    subcategory: "sql_injection"
    priority: "high"
    compliance: ["ISMS-P", "전자금융감독규정", "OWASP-A03"]
```

---

### 2.4 Security Finding (2001) - EDR

> Note: class 2001 is deprecated. Use 2004 (Detection Finding) for new implementations.

#### Windows Defender ATP

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **AlertEvidence** | | | |
| class_uid | 2004 | category: `security_threat` | |
| type_uid | 200401 | subcategory: `edr_alert` | from alert |
| severity_id | map(Severity) | priority: map(Severity) | |

---

### 2.5 Vulnerability Finding (2002)

#### Tenable Nessus / Qualys / Rapid7

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Critical Vulnerability** | | | |
| class_uid | 2002 | category: `vulnerability` | |
| type_uid | 200201 | subcategory: `vuln_critical` | |
| activity_id | 1 | priority: `critical` | |
| severity_id | 5 | compliance: `["ISMS-P", "전자금융감독규정"]` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **High Vulnerability** | | | |
| class_uid | 2002 | category: `vulnerability` | |
| type_uid | 200201 | subcategory: `vuln_high` | |
| severity_id | 4 | priority: `high` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Medium Vulnerability** | | | |
| class_uid | 2002 | category: `vulnerability` | |
| type_uid | 200201 | subcategory: `vuln_medium` | |
| severity_id | 3 | priority: `medium` | |

```yaml
# Vulnerability Scan Result
- vendor: "Tenable"
  product: "Nessus"
  original_event_id: "vulnerability"

  ocsf:
    class_uid: 2002
    class_name: "Vulnerability Finding"
    type_uid: 200201
    activity_id: 1
    severity_id: "${map_cvss_to_severity(cvss_score)}"
    # CVSS 9.0-10.0=5, 7.0-8.9=4, 4.0-6.9=3, 0.1-3.9=2, 0=1

  finding_info:
    uid: "${plugin_id}"
    title: "${plugin_name}"
    desc: "${description}"
    types: ["Vulnerability"]

  vulnerabilities:
    - cve:
        uid: "${cve_id}"
      cvss:
        score: "${cvss_score}"
        version: "3.1"
        vector: "${cvss_vector}"
      kb_articles: ["${solution}"]

  internal:
    category: "vulnerability"
    subcategory: "vuln_${severity_level}"
    priority: "${priority}"
    compliance: ["ISMS-P", "전자금융감독규정"]
    remediation_sla: "${map_sla(severity)}"  # Critical=24h, High=7d, Medium=30d
```

---

### 2.6 Data Security Finding (2006) - DLP

#### Symantec DLP / Microsoft DLP / Forcepoint

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **PII Detected** | | | |
| class_uid | 2006 | category: `data_leak` | |
| type_uid | 200601 | subcategory: `pii_exposure` | TA0010 |
| activity_id | 1 | priority: `critical` | T1567 |
| severity_id | 5 | compliance: `["개인정보보호법", "ISMS-P"]` | |
| disposition_id | 2 (Blocked) | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Credit Card Number** | | | |
| class_uid | 2006 | category: `data_leak` | |
| type_uid | 200601 | subcategory: `financial_data` | TA0010 |
| severity_id | 5 | compliance: `["전자금융감독규정", "PCI-DSS"]` | T1041 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Sensitive File Upload** | | | |
| class_uid | 2006 | category: `data_leak` | |
| type_uid | 200601 | subcategory: `unauthorized_transfer` | TA0010 |
| severity_id | 4 | priority: `high` | T1048 |

```yaml
# DLP - PII Detection
- vendor: "Generic DLP"
  product: "DLP"
  original_event_id: "policy_violation"

  ocsf:
    class_uid: 2006
    class_name: "Data Security Finding"
    type_uid: 200601
    activity_id: 1
    severity_id: 5
    disposition_id: "${map_action(action)}"

  finding_info:
    uid: "${incident_id}"
    title: "${policy_name} Violation"
    types: ["Data Loss", "Policy Violation"]

  data_classification:
    category: "PII"
    category_id: 1
    confidentiality: "Restricted"
    confidentiality_id: 4

  internal:
    category: "data_leak"
    subcategory: "pii_exposure"
    priority: "critical"
    compliance: ["개인정보보호법", "ISMS-P"]
    data_types: ["주민등록번호", "여권번호", "운전면허번호"]
```

---

## 2. Category 3: IAM (인증/계정)

### 3.1 Authentication (3002)

#### Windows Security Event Log

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4624** (Logon Success) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `login_success` | |
| activity_id | 1 (Logon) | priority: `low` | |
| severity_id | 1 | compliance: `["ISMS-P"]` | |
| status_id | 1 (Success) | | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4625** (Logon Failure) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `login_failure` | TA0006 |
| activity_id | 1 (Logon) | priority: `medium` | T1110 |
| severity_id | 2-3 | compliance: `["ISMS-P", "개인정보보호법"]` | |
| status_id | 2 (Failure) | | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4634/4647** (Logoff) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300202 | subcategory: `logout` | |
| activity_id | 2 (Logoff) | priority: `low` | |
| severity_id | 1 | | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4648** (Explicit Credentials) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `runas` | TA0004 |
| activity_id | 1 | priority: `medium` | T1134 |
| severity_id | 2 | | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4768** (Kerberos TGT Request) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300203 | subcategory: `kerberos_tgt` | TA0006 |
| activity_id | 3 (Auth Ticket) | | T1558 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4769** (Kerberos Service Ticket) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300204 | subcategory: `kerberos_tgs` | TA0006 |
| activity_id | 4 (Service Ticket) | | T1558.003 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4771** (Kerberos Pre-Auth Failure) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300206 | subcategory: `kerberos_failure` | TA0006 |
| activity_id | 6 (Preauth) | priority: `high` | T1110.003 |
| status_id | 2 (Failure) | | |

```yaml
# Windows Authentication Events
- vendor: "Microsoft"
  product: "Windows"

  events:
    - original_event_id: "4624"
      ocsf:
        class_uid: 3002
        type_uid: 300201
        activity_id: 1
        activity_name: "Logon"
        severity_id: 1
        status_id: 1
      auth_protocol: "${map_logon_type(LogonType)}"
      # 2=Interactive, 3=Network, 4=Batch, 5=Service, 7=Unlock, 8=NetworkCleartext, 9=NewCredentials, 10=RemoteInteractive, 11=CachedInteractive
      internal:
        category: "authentication"
        subcategory: "login_success"
        logon_type: "${LogonType}"

    - original_event_id: "4625"
      ocsf:
        class_uid: 3002
        type_uid: 300201
        activity_id: 1
        severity_id: "${map_failure_severity(FailureReason)}"
        status_id: 2
        status_code: "${SubStatus}"
      attacks:
        - tactic:
            uid: "TA0006"
            name: "Credential Access"
          technique:
            uid: "T1110"
            name: "Brute Force"
      internal:
        category: "authentication"
        subcategory: "login_failure"
        failure_reason: "${map_substatus(SubStatus)}"
        compliance: ["ISMS-P", "개인정보보호법"]
```

#### Windows Logon Type Reference

| Logon Type | Name | OCSF auth_protocol | Risk Level |
|------------|------|-------------------|------------|
| 2 | Interactive | "Interactive" | Low |
| 3 | Network | "NTLM/Kerberos" | Low |
| 4 | Batch | "Batch" | Low |
| 5 | Service | "Service" | Low |
| 7 | Unlock | "Interactive" | Low |
| 8 | NetworkCleartext | "Cleartext" | High |
| 9 | NewCredentials | "NewCredentials" | Medium |
| 10 | RemoteInteractive | "RDP" | Medium |
| 11 | CachedInteractive | "Cached" | Low |

#### Linux Authentication (PAM/auditd)

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **USER_LOGIN** (success) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `login_success` | |
| activity_id | 1 | priority: `low` | |
| status_id | 1 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **USER_LOGIN** (failure) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `login_failure` | TA0006 |
| activity_id | 1 | priority: `medium` | T1110 |
| status_id | 2 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **USER_AUTH** (sudo) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `privilege_escalation` | TA0004 |
| activity_id | 1 | priority: `medium` | T1548.003 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **USER_ERR** (sudo failure) | | | |
| class_uid | 3002 | category: `authentication` | |
| type_uid | 300201 | subcategory: `sudo_failure` | TA0004 |
| activity_id | 1 | priority: `high` | T1548.003 |
| status_id | 2 | | |

---

### 3.2 Account Change (3001)

#### Windows Security Event Log

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4720** (User Created) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300101 | subcategory: `user_created` | TA0003 |
| activity_id | 1 (Create) | priority: `medium` | T1136.001 |
| severity_id | 2 | compliance: `["ISMS-P", "개인정보보호법"]` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4722** (User Enabled) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300103 | subcategory: `user_enabled` | |
| activity_id | 3 (Update) | priority: `low` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4723** (Password Change Attempt) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300103 | subcategory: `password_change` | |
| activity_id | 3 | priority: `low` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4724** (Password Reset) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300103 | subcategory: `password_reset` | TA0003 |
| activity_id | 3 | priority: `medium` | T1098 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4725** (User Disabled) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300103 | subcategory: `user_disabled` | |
| activity_id | 3 | priority: `medium` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4726** (User Deleted) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300104 | subcategory: `user_deleted` | TA0005 |
| activity_id | 4 (Delete) | priority: `medium` | T1531 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4728/4732/4756** (Added to Group) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300103 | subcategory: `group_membership_add` | TA0003 |
| activity_id | 3 | priority: `medium` | T1098 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **4729/4733/4757** (Removed from Group) | | | |
| class_uid | 3001 | category: `user_management` | |
| type_uid | 300103 | subcategory: `group_membership_remove` | |
| activity_id | 3 | priority: `low` | |

```yaml
# Windows Account Change Events
- vendor: "Microsoft"
  product: "Windows"

  events:
    - original_event_id: "4720"
      ocsf:
        class_uid: 3001
        class_name: "Account Change"
        type_uid: 300101
        activity_id: 1
        activity_name: "Create"
        severity_id: 2
      attacks:
        - tactic:
            uid: "TA0003"
            name: "Persistence"
          technique:
            uid: "T1136.001"
            name: "Create Account: Local Account"
      internal:
        category: "user_management"
        subcategory: "user_created"
        priority: "medium"
        compliance: ["ISMS-P", "개인정보보호법"]

    - original_event_id: "4728"
      ocsf:
        class_uid: 3001
        type_uid: 300103
        activity_id: 3
        severity_id: "${map_group_severity(TargetGroup)}"
        # Domain Admins/Enterprise Admins = 4, Local Admins = 3, Others = 2
      attacks:
        - tactic:
            uid: "TA0003"
            name: "Persistence"
          technique:
            uid: "T1098"
            name: "Account Manipulation"
      internal:
        category: "user_management"
        subcategory: "group_membership_add"
        target_group: "${TargetGroupName}"
        is_privileged_group: "${is_admin_group(TargetGroup)}"
```

---

### 3.3 User Access Management (3005)

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Permission Grant** | | | |
| class_uid | 3005 | category: `access_management` | |
| type_uid | 300501 | subcategory: `permission_granted` | TA0004 |
| activity_id | 1 (Create) | priority: `medium` | T1222 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Permission Revoke** | | | |
| class_uid | 3005 | category: `access_management` | |
| type_uid | 300504 | subcategory: `permission_revoked` | |
| activity_id | 4 (Delete) | priority: `low` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Role Assignment** | | | |
| class_uid | 3005 | category: `access_management` | |
| type_uid | 300501 | subcategory: `role_assigned` | TA0003 |
| activity_id | 1 | priority: `medium` | T1098 |

---

## 3. Category 4: Network Activity (네트워크)

### 4.1 Network Activity (4001) - Firewall

#### Palo Alto Networks NGFW - Traffic Log

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **TRAFFIC,allow** | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400105 | subcategory: `allowed` | |
| activity_id | 5 (Allow) | priority: `low` | |
| severity_id | 1 | | |
| disposition_id | 1 (Allowed) | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **TRAFFIC,deny** | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400106 | subcategory: `blocked` | |
| activity_id | 6 (Refuse) | priority: `medium` | |
| severity_id | 2 | compliance: `["ISMS-P"]` | |
| disposition_id | 2 (Blocked) | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **TRAFFIC,drop** | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400106 | subcategory: `dropped` | |
| activity_id | 6 | priority: `medium` | |
| disposition_id | 6 (Dropped) | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **TRAFFIC,reset-client** | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400103 | subcategory: `reset` | |
| activity_id | 3 (Reset) | priority: `low` | |
| disposition_id | 21 (Reset) | | |

```yaml
# Palo Alto Firewall Traffic Events
- vendor: "Palo Alto"
  product: "NGFW"

  events:
    - original_event_id: "TRAFFIC,allow"
      ocsf:
        class_uid: 4001
        class_name: "Network Activity"
        type_uid: 400105
        activity_id: 5
        activity_name: "Allow"
        severity_id: 1
        disposition_id: 1
        disposition: "Allowed"
      connection_info:
        direction_id: "${map_direction(direction)}"  # inbound=1, outbound=2
        protocol_name: "${proto}"
        protocol_num: "${map_proto_num(proto)}"
      traffic:
        bytes_in: "${bytes_received}"
        bytes_out: "${bytes_sent}"
        packets_in: "${pkts_received}"
        packets_out: "${pkts_sent}"
      internal:
        category: "network_traffic"
        subcategory: "allowed"
        priority: "low"
        zone_src: "${from_zone}"
        zone_dst: "${to_zone}"

    - original_event_id: "TRAFFIC,deny"
      ocsf:
        class_uid: 4001
        type_uid: 400106
        activity_id: 6
        activity_name: "Refuse"
        severity_id: 2
        disposition_id: 2
      internal:
        category: "network_traffic"
        subcategory: "blocked"
        priority: "medium"
        compliance: ["ISMS-P"]
```

#### Fortinet FortiGate - Traffic Log

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **traffic:forward** (action=accept) | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400105 | subcategory: `allowed` | |
| activity_id | 5 | | |
| disposition_id | 1 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **traffic:forward** (action=deny) | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400106 | subcategory: `blocked` | |
| activity_id | 6 | | |
| disposition_id | 2 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **traffic:local** | | | |
| class_uid | 4001 | category: `network_traffic` | |
| type_uid | 400101 | subcategory: `local_traffic` | |
| activity_id | 1 (Open) | | |

---

### 4.2 DNS Activity (4003)

#### DNS Server / Firewall DNS Log / DNS Proxy

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **DNS Query** | | | |
| class_uid | 4003 | category: `dns` | |
| type_uid | 400301 | subcategory: `query` | |
| activity_id | 1 (Query) | priority: `low` | |
| severity_id | 1 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **DNS Response (NOERROR)** | | | |
| class_uid | 4003 | category: `dns` | |
| type_uid | 400302 | subcategory: `response_success` | |
| activity_id | 2 (Response) | priority: `low` | |
| status_id | 1 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **DNS Response (NXDOMAIN)** | | | |
| class_uid | 4003 | category: `dns` | |
| type_uid | 400302 | subcategory: `nxdomain` | TA0011 |
| activity_id | 2 | priority: `low` | T1071.004 |
| status_id | 2 | | |
| status_code | "NXDOMAIN" | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **DNS Sinkhole** | | | |
| class_uid | 4003 | category: `dns` | |
| type_uid | 400302 | subcategory: `sinkholed` | TA0011 |
| activity_id | 2 | priority: `high` | T1071.004 |
| severity_id | 4 | | |
| disposition_id | 2 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **DNS Tunnel Detected** | | | |
| class_uid | 4003 | category: `dns` | |
| type_uid | 400301 | subcategory: `dns_tunnel` | TA0010 |
| activity_id | 1 | priority: `critical` | T1048 |
| severity_id | 5 | | |

```yaml
# DNS Activity Events
- vendor: "Generic DNS"
  product: "DNS Server"

  events:
    - original_event_pattern: "query"
      ocsf:
        class_uid: 4003
        class_name: "DNS Activity"
        type_uid: 400301
        activity_id: 1
        activity_name: "Query"
        severity_id: 1
      dns_query:
        hostname: "${qname}"
        type: "${qtype}"
        type_id: "${map_qtype(qtype)}"  # A=1, AAAA=28, CNAME=5, MX=15, TXT=16, etc.
      internal:
        category: "dns"
        subcategory: "query"

    - original_event_pattern: "sinkhole|blocked"
      ocsf:
        class_uid: 4003
        type_uid: 400302
        activity_id: 2
        severity_id: 4
        disposition_id: 2
      attacks:
        - tactic:
            uid: "TA0011"
            name: "Command and Control"
          technique:
            uid: "T1071.004"
            name: "Application Layer Protocol: DNS"
      internal:
        category: "dns"
        subcategory: "sinkholed"
        priority: "high"
        threat_type: "malicious_domain"
```

---

### 4.3 HTTP Activity (4002)

#### Web Proxy / WAF / Load Balancer

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **HTTP 200 OK** | | | |
| class_uid | 4002 | category: `web_traffic` | |
| type_uid | 400201 | subcategory: `success` | |
| activity_id | 1 | priority: `low` | |
| status_id | 1 | | |
| http_status | 200 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **HTTP 401/403** | | | |
| class_uid | 4002 | category: `web_traffic` | |
| type_uid | 400201 | subcategory: `access_denied` | |
| activity_id | 1 | priority: `medium` | |
| status_id | 2 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **HTTP 500** | | | |
| class_uid | 4002 | category: `web_traffic` | |
| type_uid | 400201 | subcategory: `server_error` | |
| activity_id | 1 | priority: `medium` | |
| severity_id | 3 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **Blocked by Category** | | | |
| class_uid | 4002 | category: `web_traffic` | |
| type_uid | 400206 | subcategory: `category_blocked` | |
| activity_id | 6 (Refuse) | priority: `low` | |
| disposition_id | 2 | | |

```yaml
# HTTP Activity Events
- vendor: "Generic Proxy"
  product: "Web Proxy"

  ocsf:
    class_uid: 4002
    class_name: "HTTP Activity"

  http_request:
    method: "${method}"
    url: "${url}"
    user_agent: "${user_agent}"
    referrer: "${referrer}"

  http_response:
    code: "${status_code}"
    content_type: "${content_type}"
    length: "${response_size}"
```

---

### 4.4 SSH Activity (4007)

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **SSH Login Success** | | | |
| class_uid | 4007 | category: `remote_access` | |
| type_uid | 400701 | subcategory: `ssh_login_success` | |
| activity_id | 1 (Open) | priority: `low` | |
| status_id | 1 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **SSH Login Failure** | | | |
| class_uid | 4007 | category: `remote_access` | |
| type_uid | 400704 | subcategory: `ssh_login_failure` | TA0006 |
| activity_id | 4 (Fail) | priority: `medium` | T1110 |
| status_id | 2 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **SSH Session Closed** | | | |
| class_uid | 4007 | category: `remote_access` | |
| type_uid | 400702 | subcategory: `ssh_session_closed` | |
| activity_id | 2 (Close) | priority: `low` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **SSH Port Forward** | | | |
| class_uid | 4007 | category: `remote_access` | |
| type_uid | 400701 | subcategory: `ssh_tunnel` | TA0011 |
| activity_id | 1 | priority: `high` | T1572 |

---

### 4.5 Tunnel Activity (4014) - VPN

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **VPN Connect Success** | | | |
| class_uid | 4014 | category: `vpn` | |
| type_uid | 401401 | subcategory: `vpn_connect` | |
| activity_id | 1 (Open) | priority: `low` | |
| status_id | 1 | compliance: `["ISMS-P"]` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **VPN Connect Failure** | | | |
| class_uid | 4014 | category: `vpn` | |
| type_uid | 401404 | subcategory: `vpn_connect_failure` | TA0001 |
| activity_id | 4 (Fail) | priority: `medium` | T1133 |
| status_id | 2 | | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **VPN Disconnect** | | | |
| class_uid | 4014 | category: `vpn` | |
| type_uid | 401402 | subcategory: `vpn_disconnect` | |
| activity_id | 2 (Close) | priority: `low` | |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **VPN Policy Violation** | | | |
| class_uid | 4014 | category: `vpn` | |
| type_uid | 401406 | subcategory: `vpn_policy_violation` | |
| activity_id | 6 (Refuse) | priority: `high` | |
| disposition_id | 2 | | |

```yaml
# VPN Events
- vendor: "Palo Alto"
  product: "GlobalProtect"

  events:
    - original_event_id: "globalprotect-auth-success"
      ocsf:
        class_uid: 4014
        class_name: "Tunnel Activity"
        type_uid: 401401
        activity_id: 1
        activity_name: "Open"
        severity_id: 1
        status_id: 1
      tunnel_type: "VPN"
      tunnel_type_id: 1
      internal:
        category: "vpn"
        subcategory: "vpn_connect"
        compliance: ["ISMS-P"]

    - original_event_id: "globalprotect-auth-fail"
      ocsf:
        class_uid: 4014
        type_uid: 401404
        activity_id: 4
        severity_id: 3
        status_id: 2
      attacks:
        - tactic:
            uid: "TA0001"
            name: "Initial Access"
          technique:
            uid: "T1133"
            name: "External Remote Services"
      internal:
        category: "vpn"
        subcategory: "vpn_connect_failure"
        priority: "medium"
```

---

## 4. Category 1: System Activity (시스템)

### 5.1 Process Activity (1007)

#### Windows Sysmon / EDR

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 1** (Process Create) | | | |
| class_uid | 1007 | category: `process_activity` | |
| type_uid | 100701 | subcategory: `process_start` | TA0002 |
| activity_id | 1 (Launch) | priority: `low` | T1059 |
| severity_id | 1 | | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 5** (Process Terminate) | | | |
| class_uid | 1007 | category: `process_activity` | |
| type_uid | 100702 | subcategory: `process_end` | |
| activity_id | 2 (Terminate) | priority: `low` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 8** (CreateRemoteThread) | | | |
| class_uid | 1007 | category: `process_activity` | |
| type_uid | 100704 | subcategory: `process_injection` | TA0005 |
| activity_id | 4 (Inject) | priority: `high` | T1055 |
| severity_id | 4 | | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 10** (ProcessAccess) | | | |
| class_uid | 1007 | category: `process_activity` | |
| type_uid | 100703 | subcategory: `process_access` | TA0006 |
| activity_id | 3 (Open) | priority: `medium` | T1003 |

```yaml
# Sysmon Process Events
- vendor: "Microsoft"
  product: "Sysmon"

  events:
    - original_event_id: "1"
      ocsf:
        class_uid: 1007
        class_name: "Process Activity"
        type_uid: 100701
        activity_id: 1
        activity_name: "Launch"
        severity_id: 1
      process:
        pid: "${ProcessId}"
        name: "${Image}"
        cmd_line: "${CommandLine}"
        created_time: "${UtcTime}"
        file:
          path: "${Image}"
          hash:
            md5: "${Hashes:MD5}"
            sha256: "${Hashes:SHA256}"
        user:
          name: "${User}"
        parent_process:
          pid: "${ParentProcessId}"
          name: "${ParentImage}"
          cmd_line: "${ParentCommandLine}"
      internal:
        category: "process_activity"
        subcategory: "process_start"

    - original_event_id: "8"
      ocsf:
        class_uid: 1007
        type_uid: 100704
        activity_id: 4
        activity_name: "Inject"
        severity_id: 4
      attacks:
        - tactic:
            uid: "TA0005"
            name: "Defense Evasion"
          technique:
            uid: "T1055"
            name: "Process Injection"
      internal:
        category: "process_activity"
        subcategory: "process_injection"
        priority: "high"
```

#### Linux auditd

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **EXECVE** | | | |
| class_uid | 1007 | category: `process_activity` | |
| type_uid | 100701 | subcategory: `process_start` | TA0002 |
| activity_id | 1 | | T1059.004 |

| Vendor Event | OCSF Mapping | Internal Taxonomy | MITRE |
|--------------|--------------|-------------------|-------|
| **SYSCALL** (ptrace) | | | |
| class_uid | 1007 | category: `process_activity` | |
| type_uid | 100704 | subcategory: `process_injection` | TA0005 |
| activity_id | 4 | priority: `high` | T1055.008 |

---

### 5.2 File System Activity (1001)

#### Windows Sysmon / EDR

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 11** (FileCreate) | | | |
| class_uid | 1001 | category: `file_activity` | |
| type_uid | 100101 | subcategory: `file_created` | |
| activity_id | 1 (Create) | priority: `low` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 23** (FileDelete) | | | |
| class_uid | 1001 | category: `file_activity` | |
| type_uid | 100104 | subcategory: `file_deleted` | TA0005 |
| activity_id | 4 (Delete) | priority: `low` | T1070.004 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Sysmon 15** (FileCreateStreamHash) | | | |
| class_uid | 1001 | category: `file_activity` | |
| type_uid | 100101 | subcategory: `ads_created` | TA0005 |
| activity_id | 1 | priority: `medium` | T1564.004 |

```yaml
# File System Events
- vendor: "Microsoft"
  product: "Sysmon"

  events:
    - original_event_id: "11"
      ocsf:
        class_uid: 1001
        class_name: "File System Activity"
        type_uid: 100101
        activity_id: 1
        activity_name: "Create"
        severity_id: 1
      file:
        name: "${TargetFilename}"
        path: "${TargetFilename}"
        created_time: "${UtcTime}"
      actor:
        process:
          pid: "${ProcessId}"
          name: "${Image}"
      internal:
        category: "file_activity"
        subcategory: "file_created"
```

---

### 5.3 Scheduled Job Activity (1006)

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Windows 4698** (Scheduled Task Created) | | | |
| class_uid | 1006 | category: `scheduled_task` | |
| type_uid | 100601 | subcategory: `task_created` | TA0003 |
| activity_id | 1 (Create) | priority: `medium` | T1053.005 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Windows 4699** (Scheduled Task Deleted) | | | |
| class_uid | 1006 | category: `scheduled_task` | |
| type_uid | 100604 | subcategory: `task_deleted` | TA0005 |
| activity_id | 4 (Delete) | priority: `low` | T1070 |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Windows 4700** (Scheduled Task Enabled) | | | |
| class_uid | 1006 | category: `scheduled_task` | |
| type_uid | 100603 | subcategory: `task_enabled` | |
| activity_id | 3 (Update) | priority: `low` | |

| Event ID | OCSF Mapping | Internal Taxonomy | MITRE |
|----------|--------------|-------------------|-------|
| **Linux cron** | | | |
| class_uid | 1006 | category: `scheduled_task` | |
| type_uid | 100601 | subcategory: `cron_job` | TA0003 |
| activity_id | 1 | | T1053.003 |

---

## 5. Enumeration Reference (열거형 참조)

### 5.1 severity_id Complete Reference

| severity_id | Name (EN) | Name (KO) | Color | Use Case |
|-------------|-----------|-----------|-------|----------|
| 0 | Unknown | 알 수 없음 | Gray | 심각도 정보 없음 |
| 1 | Informational | 정보성 | Blue | 정상 활동, 참고용 |
| 2 | Low | 낮음 | Green | 주의 필요, 즉시 대응 불필요 |
| 3 | Medium | 중간 | Yellow | 검토 필요, 잠재적 위협 |
| 4 | High | 높음 | Orange | 빠른 대응 필요, 실제 위협 |
| 5 | Critical | 치명적 | Red | 즉시 대응, 심각한 침해 |
| 6 | Fatal | 치명적(시스템) | Black | 시스템 장애 수준 |
| 99 | Other | 기타 | Gray | 분류 불가 |

### 5.2 disposition_id Complete Reference

| disposition_id | Name | Name (KO) | Description |
|----------------|------|-----------|-------------|
| 0 | Unknown | 알 수 없음 | 처분 정보 없음 |
| 1 | Allowed | 허용됨 | 정책에 의해 허용 |
| 2 | Blocked | 차단됨 | 정책에 의해 차단 |
| 3 | Quarantined | 격리됨 (파일) | 악성코드 격리 |
| 4 | Isolated | 격리됨 (네트워크) | 네트워크 격리 |
| 5 | Deleted | 삭제됨 | 파일/레코드 삭제 |
| 6 | Dropped | 드랍됨 | 패킷 드랍 |
| 7 | Custom Action | 사용자 정의 조치 | 커스텀 자동화 |
| 8 | Approved | 승인됨 | 관리자 승인 |
| 9 | Restored | 복구됨 | 격리에서 복구 |
| 10 | Exonerated | 무혐의 | 오탐 판정 |
| 11 | Corrected | 교정됨 | 취약점 패치 |
| 12 | Partially Corrected | 부분 교정 | 일부 패치 |
| 13 | Uncorrected | 미교정 | 패치 미적용 |
| 14 | Delayed | 지연됨 | 대응 보류 |
| 15 | Detected | 탐지됨 | 탐지만, 조치 없음 |
| 16 | No Action | 조치 없음 | 의도적 미조치 |
| 17 | Logged | 기록됨 | 로깅만 수행 |
| 18 | Tagged | 태깅됨 | 마킹/태깅 |
| 19 | Alert | 경고 발생 | 알림 생성 |
| 20 | Count | 카운트 | 카운터 증가만 |
| 21 | Reset | 리셋 | 연결 리셋 |
| 22 | Captcha | CAPTCHA | 챌린지 요구 |
| 23 | Challenge | 챌린지 | 추가 인증 요구 |
| 24 | Access Revoked | 접근 취소 | 권한 회수 |
| 25 | Session Terminated | 세션 종료 | 강제 로그아웃 |
| 99 | Other | 기타 | 분류 불가 |

### 5.3 status_id Complete Reference

| status_id | Name | Name (KO) | Use Case |
|-----------|------|-----------|----------|
| 0 | Unknown | 알 수 없음 | 상태 정보 없음 |
| 1 | Success | 성공 | 작업 완료, 인증 성공 |
| 2 | Failure | 실패 | 작업 실패, 인증 실패 |
| 99 | Other | 기타 | 부분 성공, 보류 등 |

### 5.4 activity_id by Class Reference

#### Common (All Classes)

| activity_id | Name | Description |
|-------------|------|-------------|
| 0 | Unknown | 알 수 없음 |
| 1 | Create | 생성 |
| 2 | Read | 읽기 |
| 3 | Update | 수정 |
| 4 | Delete | 삭제 |
| 5 | Allow | 허용 |
| 6 | Deny/Refuse | 거부 |
| 99 | Other | 기타 |

#### Authentication (3002)

| activity_id | Name | Description |
|-------------|------|-------------|
| 1 | Logon | 로그인 |
| 2 | Logoff | 로그아웃 |
| 3 | Authentication Ticket | 티켓 발급 |
| 4 | Service Ticket Request | 서비스 티켓 요청 |
| 5 | Service Ticket Renew | 서비스 티켓 갱신 |
| 6 | Preauth | 사전 인증 |

#### Network Activity (4001)

| activity_id | Name | Description |
|-------------|------|-------------|
| 1 | Open | 연결 열기 |
| 2 | Close | 연결 닫기 |
| 3 | Reset | 연결 리셋 |
| 4 | Fail | 연결 실패 |
| 5 | Allow | 트래픽 허용 |
| 6 | Refuse | 트래픽 거부 |
| 7 | Traffic | 일반 트래픽 |

#### DNS Activity (4003)

| activity_id | Name | Description |
|-------------|------|-------------|
| 1 | Query | DNS 쿼리 |
| 2 | Response | DNS 응답 |
| 3 | Update | DNS 레코드 업데이트 |
| 4 | Transfer | Zone 전송 |

#### Process Activity (1007)

| activity_id | Name | Description |
|-------------|------|-------------|
| 1 | Launch | 프로세스 시작 |
| 2 | Terminate | 프로세스 종료 |
| 3 | Open | 프로세스 열기 |
| 4 | Inject | 코드 인젝션 |
| 5 | Set User ID | UID 변경 |

#### File System Activity (1001)

| activity_id | Name | Description |
|-------------|------|-------------|
| 1 | Create | 파일 생성 |
| 2 | Read | 파일 읽기 |
| 3 | Update | 파일 수정 |
| 4 | Delete | 파일 삭제 |
| 5 | Rename | 파일 이름 변경 |
| 6 | Set Attributes | 속성 변경 |
| 7 | Set Security | 권한 변경 |
| 14 | Open | 파일 열기 |
| 15 | Close | 파일 닫기 |

---

## 6. Internal Taxonomy Reference (내부 분류 체계)

### 6.1 Category (대분류)

| Category | Description | Example Sources |
|----------|-------------|-----------------|
| `security_threat` | 보안 위협 | IDS/IPS, EDR, WAF |
| `malware` | 악성코드 | AV, EDR, Sandbox |
| `web_attack` | 웹 공격 | WAF, Web Proxy |
| `vulnerability` | 취약점 | Scanner, EDR |
| `data_leak` | 데이터 유출 | DLP, CASB |
| `authentication` | 인증 | Windows, Linux, VPN |
| `user_management` | 사용자 관리 | AD, IAM |
| `access_management` | 접근 관리 | IAM, PAM |
| `network_traffic` | 네트워크 트래픽 | Firewall, Router |
| `dns` | DNS 활동 | DNS Server, Proxy |
| `web_traffic` | 웹 트래픽 | Proxy, LB |
| `remote_access` | 원격 접근 | SSH, RDP, VPN |
| `vpn` | VPN | VPN Gateway |
| `process_activity` | 프로세스 활동 | Sysmon, EDR |
| `file_activity` | 파일 활동 | Sysmon, EDR |
| `scheduled_task` | 스케줄 작업 | Windows, Linux |
| `availability_threat` | 가용성 위협 | DDoS, LB |
| `policy_violation` | 정책 위반 | Any |

### 6.2 Subcategory (소분류)

#### security_threat

| Subcategory | Description | MITRE |
|-------------|-------------|-------|
| `exploit_attempt` | 취약점 공격 시도 | T1190 |
| `ips_detection` | IPS 탐지 | varies |
| `ids_alert` | IDS 경고 | varies |
| `edr_detection` | EDR 탐지 | varies |
| `edr_alert` | EDR 경고 | varies |

#### malware

| Subcategory | Description | MITRE |
|-------------|-------------|-------|
| `malware_detected` | 악성코드 탐지 | T1204 |
| `malware_remediated` | 악성코드 치료 | - |
| `virus` | 바이러스 | T1204 |
| `spyware` | 스파이웨어 | T1005 |
| `ransomware` | 랜섬웨어 | T1486 |
| `zero_day` | 제로데이 | T1203 |
| `antivirus` | 안티바이러스 탐지 | - |

#### web_attack

| Subcategory | Description | MITRE |
|-------------|-------------|-------|
| `sql_injection` | SQL 인젝션 | T1190 |
| `xss` | XSS 공격 | T1189 |
| `command_injection` | 명령 삽입 | T1059 |
| `path_traversal` | 경로 탐색 | T1083 |
| `bot_activity` | 봇 활동 | T1595 |
| `ddos_attack` | DDoS 공격 | T1498/T1499 |

#### authentication

| Subcategory | Description | MITRE |
|-------------|-------------|-------|
| `login_success` | 로그인 성공 | - |
| `login_failure` | 로그인 실패 | T1110 |
| `logout` | 로그아웃 | - |
| `runas` | 권한 변경 실행 | T1134 |
| `kerberos_tgt` | Kerberos TGT | T1558 |
| `kerberos_tgs` | Kerberos TGS | T1558.003 |
| `kerberos_failure` | Kerberos 실패 | T1110.003 |
| `privilege_escalation` | 권한 상승 | T1548 |
| `sudo_failure` | Sudo 실패 | T1548.003 |

#### user_management

| Subcategory | Description | MITRE |
|-------------|-------------|-------|
| `user_created` | 사용자 생성 | T1136 |
| `user_deleted` | 사용자 삭제 | T1531 |
| `user_enabled` | 사용자 활성화 | - |
| `user_disabled` | 사용자 비활성화 | - |
| `password_change` | 비밀번호 변경 | - |
| `password_reset` | 비밀번호 초기화 | T1098 |
| `group_membership_add` | 그룹 추가 | T1098 |
| `group_membership_remove` | 그룹 제거 | - |

#### network_traffic

| Subcategory | Description |
|-------------|-------------|
| `allowed` | 트래픽 허용 |
| `blocked` | 트래픽 차단 |
| `dropped` | 트래픽 드랍 |
| `reset` | 연결 리셋 |
| `local_traffic` | 로컬 트래픽 |
| `forwarded` | 포워드 트래픽 |

### 6.3 Compliance Mapping (규정 매핑)

| Compliance | Description | Related Categories |
|------------|-------------|-------------------|
| `ISMS-P` | 정보보호 및 개인정보보호 관리체계 | All |
| `개인정보보호법` | 개인정보보호법 | data_leak, authentication, user_management |
| `전자금융감독규정` | 전자금융감독규정 | security_threat, vulnerability, data_leak |
| `PCI-DSS` | Payment Card Industry Data Security Standard | data_leak (financial) |
| `OWASP-A01` | Broken Access Control | web_attack |
| `OWASP-A02` | Cryptographic Failures | data_leak |
| `OWASP-A03` | Injection | web_attack (sql_injection, xss) |

### 6.4 Priority Mapping (우선순위 매핑)

| Priority | Description | Response SLA | severity_id |
|----------|-------------|--------------|-------------|
| `critical` | 즉시 대응 필요 | 1시간 | 5 |
| `high` | 빠른 대응 필요 | 4시간 | 4 |
| `medium` | 검토 필요 | 24시간 | 3 |
| `low` | 참고 | 7일 | 2 |
| `info` | 정보성 | N/A | 1 |

---

## Appendix: MITRE ATT&CK Quick Reference

### Tactics (전술)

| Tactic ID | Name | Description |
|-----------|------|-------------|
| TA0001 | Initial Access | 초기 접근 |
| TA0002 | Execution | 실행 |
| TA0003 | Persistence | 지속성 |
| TA0004 | Privilege Escalation | 권한 상승 |
| TA0005 | Defense Evasion | 방어 회피 |
| TA0006 | Credential Access | 자격 증명 접근 |
| TA0007 | Discovery | 탐색 |
| TA0008 | Lateral Movement | 측면 이동 |
| TA0009 | Collection | 수집 |
| TA0010 | Exfiltration | 유출 |
| TA0011 | Command and Control | 명령 및 제어 |
| TA0040 | Impact | 영향 |
| TA0042 | Resource Development | 리소스 개발 |
| TA0043 | Reconnaissance | 정찰 |

### Common Techniques

| Technique | Name | Related Events |
|-----------|------|----------------|
| T1110 | Brute Force | Login Failure |
| T1133 | External Remote Services | VPN Failure |
| T1190 | Exploit Public-Facing App | IPS Alert, WAF Block |
| T1059 | Command and Scripting Interpreter | Process Start |
| T1055 | Process Injection | Sysmon 8 |
| T1003 | OS Credential Dumping | LSASS Access |
| T1136 | Create Account | User Created |
| T1098 | Account Manipulation | Group Membership |
| T1486 | Data Encrypted for Impact | Ransomware |
| T1048 | Exfiltration Over Alternative Protocol | DNS Tunnel, DLP |
| T1071 | Application Layer Protocol | C2 Traffic |

---

*End of Document*
