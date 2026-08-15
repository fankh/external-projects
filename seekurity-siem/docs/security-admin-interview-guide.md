# Security Admin Interview Guide for SIEM Rule Development

> **Purpose**: Structured interview process to collect requirements from security administrators for detection rule and ruleset creation.

---

## Table of Contents

1. [Interview Process Overview](#1-interview-process-overview)
2. [Pre-Interview Preparation](#2-pre-interview-preparation)
3. [Phase 1: Environment Assessment](#3-phase-1-environment-assessment)
4. [Phase 2: Threat Landscape Discovery](#4-phase-2-threat-landscape-discovery)
5. [Phase 3: Data Source Inventory](#5-phase-3-data-source-inventory)
6. [Phase 4: Detection Requirements](#6-phase-4-detection-requirements)
7. [Phase 5: Response & Operations](#7-phase-5-response--operations)
8. [Phase 6: Success Criteria](#8-phase-6-success-criteria)
9. [Interview Templates](#9-interview-templates)
10. [Post-Interview Actions](#10-post-interview-actions)

---

## 1. Interview Process Overview

### 1.1 Interview Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SIEM Rule Interview Process                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐ │
│  │   Pre-   │───▶│ Phase 1  │───▶│ Phase 2  │───▶│ Phase 3  │───▶│Phase 4│ │
│  │Interview │    │Environment│    │  Threat  │    │  Data    │    │Detect │ │
│  │  Prep    │    │Assessment │    │Landscape │    │ Sources  │    │ Reqs  │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └───┬───┘ │
│                                                                       │     │
│                    ┌──────────┐    ┌──────────┐    ┌──────────┐      │     │
│                    │  Post-   │◀───│ Phase 6  │◀───│ Phase 5  │◀─────┘     │
│                    │Interview │    │ Success  │    │ Response │            │
│                    │ Actions  │    │ Criteria │    │   Ops    │            │
│                    └──────────┘    └──────────┘    └──────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Stakeholder Roles

| Role | Interview Focus | Typical Duration |
|------|-----------------|------------------|
| SOC Manager | Strategy, priorities, SLA requirements | 60 min |
| SOC Analyst (L1/L2) | Day-to-day operations, alert fatigue, tools | 45 min |
| Threat Intel Analyst | Threat landscape, adversary behavior | 45 min |
| IT/Infrastructure Admin | Log sources, network topology | 30 min |
| Application Owner | Business-critical apps, expected behaviors | 30 min |
| Compliance Officer | Regulatory requirements, audit needs | 30 min |

### 1.3 Interview Principles

1. **Listen More Than Talk**: 70/30 rule - let them explain their reality
2. **Ask "Why" 5 Times**: Drill down to root causes
3. **Capture Pain Points**: Current frustrations = improvement opportunities
4. **Validate Assumptions**: Don't assume - confirm with examples
5. **Document Everything**: Record audio (with permission) + notes

---

## 2. Pre-Interview Preparation

### 2.1 Information to Gather Before Interview

```
┌─────────────────────────────────────────────────────────────────┐
│                Pre-Interview Checklist                          │
├─────────────────────────────────────────────────────────────────┤
│ □ Organization chart (security team structure)                  │
│ □ Current SIEM platform and version                            │
│ □ Existing rule count and categories                           │
│ □ Recent security incidents (last 12 months)                   │
│ □ Compliance requirements (PCI-DSS, HIPAA, etc.)               │
│ □ Network topology diagram                                      │
│ □ Critical asset inventory                                      │
│ □ Previous audit findings                                       │
│ □ Current alert volume metrics                                  │
│ □ SOC shift schedule and staffing                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Send Pre-Interview Questionnaire

**Email Template:**

```
Subject: SIEM Rule Development - Pre-Interview Questionnaire

Dear [Name],

To make our upcoming interview productive, please complete the attached
questionnaire and gather the following:

1. Top 5 threats you want to detect (prioritized)
2. List of security tools currently deployed
3. Sample alert that represents a typical day
4. One "missed detection" example (if available)
5. Current SLA/KPI targets for the SOC

Please send responses at least 2 business days before our meeting.

Best regards,
[Your Name]
```

### 2.3 Pre-Interview Questionnaire Form

```yaml
# Pre-Interview Questionnaire
# Complete before the interview session

organization_info:
  company_name: ________________
  industry: ________________
  employee_count: ________________
  security_team_size: ________________
  soc_operating_hours: [ ] 8x5  [ ] 12x5  [ ] 24x7

current_siem:
  platform: ________________
  version: ________________
  deployment_date: ________________
  events_per_second: ________________
  current_rule_count: ________________

top_concerns:
  threat_1: ________________
  threat_2: ________________
  threat_3: ________________
  threat_4: ________________
  threat_5: ________________

regulatory_requirements:
  - [ ] PCI-DSS
  - [ ] HIPAA
  - [ ] SOX
  - [ ] GDPR
  - [ ] FISMA
  - [ ] ISO 27001
  - [ ] Other: ________________

pain_points:
  biggest_challenge: ________________
  alert_fatigue_level: [ ] Low  [ ] Medium  [ ] High  [ ] Critical
  missed_detections_known: [ ] Yes  [ ] No
```

---

## 3. Phase 1: Environment Assessment

### 3.1 Interview Questions - Environment

| # | Question | Notes |
|---|----------|-------|
| 1.1 | Describe your organization's core business and what needs protection. | |
| 1.2 | What is your network architecture? (On-prem, cloud, hybrid) | |
| 1.3 | How many locations/data centers do you have? | |
| 1.4 | What are your crown jewels? (Most critical assets) | |
| 1.5 | What security tools are currently deployed? | |
| 1.6 | How is your SOC structured? (In-house, MSSP, hybrid) | |
| 1.7 | What are your current security monitoring gaps? | |

### 3.2 Asset Classification Matrix

Collect this information during the interview:

| Asset Category | Examples | Criticality (1-5) | Current Monitoring | Gap |
|----------------|----------|-------------------|-------------------|-----|
| Identity Systems | AD, Okta, Azure AD | | [ ] Yes [ ] No | |
| Financial Systems | SAP, Oracle ERP | | [ ] Yes [ ] No | |
| Customer Data | CRM, Databases | | [ ] Yes [ ] No | |
| Development | GitLab, Jenkins | | [ ] Yes [ ] No | |
| Network Infrastructure | Firewalls, Routers | | [ ] Yes [ ] No | |
| Endpoints | Workstations, Servers | | [ ] Yes [ ] No | |
| Cloud Resources | AWS, Azure, GCP | | [ ] Yes [ ] No | |
| Email/Collaboration | Exchange, Teams | | [ ] Yes [ ] No | |

### 3.3 Technology Stack Inventory

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Security Technology Stack                            │
├──────────────────────────────────────────────────────────────────────────┤
│ Category              │ Product           │ Version │ Log Forward? │     │
├───────────────────────┼───────────────────┼─────────┼──────────────┤     │
│ Firewall              │                   │         │ [ ] Y [ ] N  │     │
│ IDS/IPS               │                   │         │ [ ] Y [ ] N  │     │
│ Endpoint (EDR/AV)     │                   │         │ [ ] Y [ ] N  │     │
│ Email Security        │                   │         │ [ ] Y [ ] N  │     │
│ Web Proxy             │                   │         │ [ ] Y [ ] N  │     │
│ VPN                   │                   │         │ [ ] Y [ ] N  │     │
│ WAF                   │                   │         │ [ ] Y [ ] N  │     │
│ DLP                   │                   │         │ [ ] Y [ ] N  │     │
│ CASB                  │                   │         │ [ ] Y [ ] N  │     │
│ Identity Provider     │                   │         │ [ ] Y [ ] N  │     │
│ PAM                   │                   │         │ [ ] Y [ ] N  │     │
│ Vulnerability Scanner │                   │         │ [ ] Y [ ] N  │     │
│ Cloud Security        │                   │         │ [ ] Y [ ] N  │     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Phase 2: Threat Landscape Discovery

### 4.1 Interview Questions - Threats

| # | Question | Notes |
|---|----------|-------|
| 2.1 | What keeps you up at night? (Top 3 threat scenarios) | |
| 2.2 | Have you experienced any security incidents in the past year? | |
| 2.3 | What industry-specific threats are you most concerned about? | |
| 2.4 | Are there known threat actors targeting your industry? | |
| 2.5 | What attack vectors worry you most? (email, web, insider, etc.) | |
| 2.6 | Do you have threat intelligence feeds? Which ones? | |
| 2.7 | What MITRE ATT&CK techniques are priorities for detection? | |

### 4.2 Threat Scenario Mapping

For each identified threat, complete this template:

```yaml
threat_scenario:
  id: TS-001
  name: "Ransomware Attack via Phishing"
  description: |
    Attacker sends phishing email with malicious attachment.
    User opens attachment, malware executes, lateral movement begins.
    Ransomware deployed across network.

  attack_stages:
    initial_access:
      technique: T1566.001 (Spearphishing Attachment)
      data_source: Email Gateway Logs
      current_visibility: [ ] None [ ] Partial [ ] Full

    execution:
      technique: T1204.002 (User Execution)
      data_source: Endpoint Logs
      current_visibility: [ ] None [ ] Partial [ ] Full

    persistence:
      technique: T1547.001 (Registry Run Keys)
      data_source: Endpoint Logs
      current_visibility: [ ] None [ ] Partial [ ] Full

    lateral_movement:
      technique: T1021.001 (Remote Desktop)
      data_source: Windows Security Logs
      current_visibility: [ ] None [ ] Partial [ ] Full

    impact:
      technique: T1486 (Data Encrypted for Impact)
      data_source: File Integrity Monitoring
      current_visibility: [ ] None [ ] Partial [ ] Full

  priority: [ ] Critical [ ] High [ ] Medium [ ] Low
  business_impact: ________________
```

### 4.3 MITRE ATT&CK Coverage Assessment

Ask which tactics they want prioritized:

| Tactic | Priority (1-5) | Current Coverage | Desired Coverage |
|--------|----------------|------------------|------------------|
| Initial Access | | __% | __% |
| Execution | | __% | __% |
| Persistence | | __% | __% |
| Privilege Escalation | | __% | __% |
| Defense Evasion | | __% | __% |
| Credential Access | | __% | __% |
| Discovery | | __% | __% |
| Lateral Movement | | __% | __% |
| Collection | | __% | __% |
| Command & Control | | __% | __% |
| Exfiltration | | __% | __% |
| Impact | | __% | __% |

---

## 5. Phase 3: Data Source Inventory

### 5.1 Interview Questions - Data Sources

| # | Question | Notes |
|---|----------|-------|
| 3.1 | What log sources are currently feeding into the SIEM? | |
| 3.2 | What is the current EPS (events per second)? | |
| 3.3 | Are there log sources you want but don't have? | |
| 3.4 | What is your log retention policy? | |
| 3.5 | Do you have issues with log parsing or normalization? | |
| 3.6 | Are there any gaps in log coverage? | |
| 3.7 | What is your storage capacity and current utilization? | |

### 5.2 Log Source Collection Form

For each log source, collect:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Log Source Detail Form                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Log Source ID: LS-___                                                       │
│                                                                             │
│ Source Information:                                                         │
│   Name: ________________________________                                    │
│   Vendor: ________________________________                                  │
│   Product: ________________________________                                 │
│   Version: ________________________________                                 │
│                                                                             │
│ Collection Details:                                                         │
│   Protocol: [ ] Syslog [ ] API [ ] Agent [ ] File [ ] Other: ___           │
│   Format: [ ] JSON [ ] CEF [ ] LEEF [ ] CSV [ ] Key-Value [ ] Custom       │
│   Encryption: [ ] TLS [ ] None                                              │
│   Authentication: [ ] Certificate [ ] API Key [ ] None                      │
│                                                                             │
│ Volume & Performance:                                                       │
│   Average EPS: ________________                                             │
│   Peak EPS: ________________                                                │
│   Daily Volume (GB): ________________                                       │
│                                                                             │
│ Parsing Status:                                                             │
│   Parser Available: [ ] Yes, built-in [ ] Yes, custom [ ] No               │
│   Fields Extracted: [ ] All [ ] Partial [ ] None                           │
│   Normalization: [ ] Complete [ ] Partial [ ] None                         │
│                                                                             │
│ Event Types Available:                                                      │
│   □ Authentication (login/logout)                                           │
│   □ Authorization (access granted/denied)                                   │
│   □ Configuration Changes                                                   │
│   □ Network Traffic                                                         │
│   □ File Activity                                                           │
│   □ Process Activity                                                        │
│   □ Alert/Detection                                                         │
│   □ Other: ________________                                                 │
│                                                                             │
│ Quality Assessment:                                                         │
│   Timestamp Accuracy: [ ] Excellent [ ] Good [ ] Poor                      │
│   Field Completeness: [ ] All fields [ ] Most fields [ ] Missing fields    │
│   Known Issues: ________________                                            │
│                                                                             │
│ Priority for Rules: [ ] Critical [ ] High [ ] Medium [ ] Low               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Log Source Coverage Matrix

| Category | Source | Collected | Parsed | Normalized | Rules |
|----------|--------|-----------|--------|------------|-------|
| **Identity** |||||
| | Active Directory | [ ] | [ ] | [ ] | __ |
| | Azure AD | [ ] | [ ] | [ ] | __ |
| | Okta | [ ] | [ ] | [ ] | __ |
| | LDAP | [ ] | [ ] | [ ] | __ |
| **Network** |||||
| | Palo Alto FW | [ ] | [ ] | [ ] | __ |
| | Fortinet FW | [ ] | [ ] | [ ] | __ |
| | Cisco ASA | [ ] | [ ] | [ ] | __ |
| | Netflow | [ ] | [ ] | [ ] | __ |
| | DNS Logs | [ ] | [ ] | [ ] | __ |
| | Web Proxy | [ ] | [ ] | [ ] | __ |
| **Endpoint** |||||
| | Windows Events | [ ] | [ ] | [ ] | __ |
| | Linux Audit | [ ] | [ ] | [ ] | __ |
| | CrowdStrike | [ ] | [ ] | [ ] | __ |
| | Carbon Black | [ ] | [ ] | [ ] | __ |
| | Sysmon | [ ] | [ ] | [ ] | __ |
| **Application** |||||
| | Web Servers | [ ] | [ ] | [ ] | __ |
| | Databases | [ ] | [ ] | [ ] | __ |
| | Custom Apps | [ ] | [ ] | [ ] | __ |
| **Cloud** |||||
| | AWS CloudTrail | [ ] | [ ] | [ ] | __ |
| | Azure Activity | [ ] | [ ] | [ ] | __ |
| | GCP Audit | [ ] | [ ] | [ ] | __ |
| | O365/M365 | [ ] | [ ] | [ ] | __ |
| **Security Tools** |||||
| | EDR Alerts | [ ] | [ ] | [ ] | __ |
| | IDS/IPS | [ ] | [ ] | [ ] | __ |
| | DLP | [ ] | [ ] | [ ] | __ |
| | Email Security | [ ] | [ ] | [ ] | __ |

### 5.4 Gap Analysis Questions

| # | Question | Answer |
|---|----------|--------|
| 3.8 | Which log sources are not currently collected but needed? | |
| 3.9 | What prevents you from collecting them? (Cost, technical, political) | |
| 3.10 | Are there log sources with poor quality or missing fields? | |
| 3.11 | Do you have correlation issues between different log sources? | |
| 3.12 | How do you handle log source outages? | |

---

## 6. Phase 4: Detection Requirements

### 6.1 Interview Questions - Detection

| # | Question | Notes |
|---|----------|-------|
| 4.1 | What are your top 10 use cases for detection? | |
| 4.2 | What detections are currently working well? | |
| 4.3 | What detections are currently failing or noisy? | |
| 4.4 | What is your current false positive rate? Acceptable rate? | |
| 4.5 | Do you need compliance-specific detections? | |
| 4.6 | What is the expected response time for different alert severities? | |
| 4.7 | Do you want behavioral/anomaly detection or signature-based? | |

### 6.2 Use Case Prioritization Matrix

Have the security admin rank and prioritize:

| Use Case | Business Impact (1-5) | Likelihood (1-5) | Data Readiness (1-5) | Priority Score |
|----------|----------------------|------------------|---------------------|----------------|
| Brute Force Detection | | | | |
| Impossible Travel | | | | |
| Privilege Escalation | | | | |
| Data Exfiltration | | | | |
| Malware Execution | | | | |
| Lateral Movement | | | | |
| Account Compromise | | | | |
| Insider Threat | | | | |
| Configuration Change | | | | |
| Service Abuse | | | | |

**Scoring: Priority = Impact × Likelihood × Data Readiness**

### 6.3 Detection Requirement Form

For each high-priority use case:

```yaml
detection_requirement:
  id: DR-001
  name: "Failed Login Brute Force"
  category: [ ] Authentication [ ] Authorization [ ] Malware [ ] Exfiltration
            [ ] Insider [ ] Compliance [ ] Other

  description: |
    Detect multiple failed login attempts from same source IP
    targeting single or multiple user accounts.

  detection_logic:
    type: [ ] Single Event [ ] Threshold [ ] Correlation [ ] Sequence [ ] Anomaly
    threshold: "5 failed logins in 5 minutes"
    grouping: "By source IP"
    correlation_fields: [ source_ip, username, timestamp ]

  data_sources_required:
    primary: "Windows Security Event Log (4625)"
    secondary: "VPN Authentication Logs"
    enrichment: "User Directory (AD)"

  tuning_expectations:
    expected_daily_alerts: ________________
    acceptable_fp_rate: __%
    exclusions_needed: "Service accounts, known scanners"

  response_requirements:
    severity: [ ] Critical [ ] High [ ] Medium [ ] Low
    sla_response: ___ minutes
    auto_response: [ ] None [ ] Ticket [ ] Block [ ] Escalate
    runbook_exists: [ ] Yes [ ] No

  compliance_mapping:
    - PCI-DSS: 10.2.4
    - NIST: AC-7

  mitre_mapping:
    tactic: Credential Access
    technique: T1110 (Brute Force)
    sub_technique: T1110.001 (Password Guessing)

  priority: [ ] P1 [ ] P2 [ ] P3 [ ] P4
  target_go_live: ________________
```

### 6.4 Alert Fatigue Assessment

| Question | Response |
|----------|----------|
| Current daily alert volume | ___ alerts/day |
| Alerts actually investigated | ___ alerts/day |
| Time spent on false positives | ___ hours/day |
| Top 3 noisiest rules | 1. ___ 2. ___ 3. ___ |
| Rules that never fire (but should) | |
| Rules disabled due to noise | |
| Desired alert volume | ___ alerts/day |

---

## 7. Phase 5: Response & Operations

### 7.1 Interview Questions - Operations

| # | Question | Notes |
|---|----------|-------|
| 5.1 | Describe your current alert triage workflow. | |
| 5.2 | What ticketing system do you use? | |
| 5.3 | What are your SLAs for alert response? | |
| 5.4 | Do you have runbooks for common alert types? | |
| 5.5 | What SOAR capabilities do you have? | |
| 5.6 | How do escalations work? | |
| 5.7 | What reporting do stakeholders expect? | |

### 7.2 Alert Routing Requirements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Alert Routing Matrix                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Severity │ Response Time │ Notify         │ Ticket      │ Auto-Action     │
│  ─────────┼───────────────┼────────────────┼─────────────┼─────────────────│
│  Critical │ ___ minutes   │ □ Email        │ □ Auto      │ □ Block IP      │
│           │               │ □ SMS          │ □ Manual    │ □ Disable User  │
│           │               │ □ Phone        │             │ □ Isolate Host  │
│           │               │ □ Slack        │             │                 │
│  ─────────┼───────────────┼────────────────┼─────────────┼─────────────────│
│  High     │ ___ minutes   │ □ Email        │ □ Auto      │ □ Block IP      │
│           │               │ □ SMS          │ □ Manual    │ □ Disable User  │
│           │               │ □ Slack        │             │                 │
│  ─────────┼───────────────┼────────────────┼─────────────┼─────────────────│
│  Medium   │ ___ hours     │ □ Email        │ □ Auto      │ □ None          │
│           │               │ □ Slack        │ □ Manual    │                 │
│  ─────────┼───────────────┼────────────────┼─────────────┼─────────────────│
│  Low      │ ___ hours     │ □ Dashboard    │ □ Auto      │ □ None          │
│           │               │ □ Email        │ □ Manual    │                 │
│           │               │               │ □ None      │                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Integration Requirements

| Integration Type | System | Status | Priority |
|-----------------|--------|--------|----------|
| Ticketing | ServiceNow / Jira / Other: ___ | [ ] Exists [ ] Needed | |
| Email Notification | ___ | [ ] Exists [ ] Needed | |
| Chat (Slack/Teams) | ___ | [ ] Exists [ ] Needed | |
| SOAR | ___ | [ ] Exists [ ] Needed | |
| Threat Intel Platform | ___ | [ ] Exists [ ] Needed | |
| Asset Management | ___ | [ ] Exists [ ] Needed | |
| Vulnerability Scanner | ___ | [ ] Exists [ ] Needed | |

### 7.4 Reporting Requirements

| Report | Audience | Frequency | Content Needs |
|--------|----------|-----------|---------------|
| Executive Dashboard | CISO, Board | | |
| Operational Metrics | SOC Manager | | |
| Compliance Report | Auditors | | |
| Incident Summary | Security Team | | |
| Threat Landscape | Leadership | | |

---

## 8. Phase 6: Success Criteria

### 8.1 Interview Questions - Success

| # | Question | Notes |
|---|----------|-------|
| 6.1 | How will you measure success of new detection rules? | |
| 6.2 | What KPIs does leadership care about? | |
| 6.3 | What does "good" look like 6 months from now? | |
| 6.4 | What would failure look like? | |
| 6.5 | How often should rules be reviewed and tuned? | |
| 6.6 | Who will own rule maintenance going forward? | |

### 8.2 Success Metrics Definition

| Metric | Current Baseline | Target | Measurement Method |
|--------|------------------|--------|-------------------|
| Mean Time to Detect (MTTD) | ___ hrs | ___ hrs | |
| Mean Time to Respond (MTTR) | ___ hrs | ___ hrs | |
| False Positive Rate | ___% | ___% | |
| Alert-to-Investigation Ratio | ___% | ___% | |
| MITRE ATT&CK Coverage | ___% | ___% | |
| Detection Accuracy | ___% | ___% | |
| Analyst Time on False Positives | ___ hrs/day | ___ hrs/day | |

### 8.3 Project Timeline Expectations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Implementation Timeline                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase           │ Target Date │ Dependencies        │ Owner               │
│  ────────────────┼─────────────┼─────────────────────┼─────────────────────│
│  Requirements    │             │                     │                     │
│  Complete        │             │                     │                     │
│  ────────────────┼─────────────┼─────────────────────┼─────────────────────│
│  Log Source      │             │ Requirements        │                     │
│  Onboarding      │             │                     │                     │
│  ────────────────┼─────────────┼─────────────────────┼─────────────────────│
│  Rule Development│             │ Log Sources         │                     │
│  ────────────────┼─────────────┼─────────────────────┼─────────────────────│
│  Testing/Tuning  │             │ Rules               │                     │
│  ────────────────┼─────────────┼─────────────────────┼─────────────────────│
│  Production      │             │ Testing             │                     │
│  Deployment      │             │                     │                     │
│  ────────────────┼─────────────┼─────────────────────┼─────────────────────│
│  Handover &      │             │ Deployment          │                     │
│  Training        │             │                     │                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Interview Templates

### 9.1 SOC Manager Interview Template (60 min)

```
Time: 60 minutes
Attendees: SOC Manager, Rule Developer

AGENDA:
─────────────────────────────────────────────────────────────────

00:00 - 05:00  Introduction and goals

05:00 - 15:00  Current state assessment
               - Team structure and capabilities
               - Current SIEM effectiveness
               - Pain points and challenges

15:00 - 30:00  Threat priorities
               - Top threats and scenarios
               - Recent incidents
               - MITRE ATT&CK priorities

30:00 - 45:00  Detection requirements
               - Use case prioritization
               - SLA requirements
               - Integration needs

45:00 - 55:00  Success criteria
               - KPIs and metrics
               - Timeline expectations
               - Ownership model

55:00 - 60:00  Next steps and follow-up items

NOTES:
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
```

### 9.2 SOC Analyst Interview Template (45 min)

```
Time: 45 minutes
Attendees: SOC Analyst (L1 or L2), Rule Developer

AGENDA:
─────────────────────────────────────────────────────────────────

00:00 - 05:00  Introduction

05:00 - 15:00  Day-to-day operations
               - Walk through a typical alert triage
               - Show me your workflow
               - What tools do you use?

15:00 - 25:00  Alert pain points
               - Noisiest rules
               - Most useful rules
               - What's missing?

25:00 - 35:00  Data quality issues
               - Log sources with problems
               - Fields that are missing
               - Correlation challenges

35:00 - 45:00  Wishlist
               - "If you could detect anything..."
               - Automation desires
               - Training needs

NOTES:
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
```

### 9.3 IT Admin Interview Template (30 min)

```
Time: 30 minutes
Attendees: IT/Infrastructure Admin, Rule Developer

AGENDA:
─────────────────────────────────────────────────────────────────

00:00 - 05:00  Introduction

05:00 - 15:00  Infrastructure overview
               - Network topology
               - Log forwarding setup
               - Authentication systems

15:00 - 25:00  Log source details
               - Current log sources
               - Collection methods
               - Known issues

25:00 - 30:00  Gaps and roadmap
               - Missing log sources
               - Planned changes
               - Contact for technical issues

NOTES:
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
```

### 9.4 Compliance Interview Template (30 min)

```
Time: 30 minutes
Attendees: Compliance Officer, Rule Developer

AGENDA:
─────────────────────────────────────────────────────────────────

00:00 - 05:00  Introduction

05:00 - 15:00  Regulatory requirements
               - Applicable regulations
               - Specific logging requirements
               - Audit findings

15:00 - 25:00  Detection requirements
               - Compliance-specific detections
               - Reporting needs
               - Evidence retention

25:00 - 30:00  Next steps
               - Documentation needs
               - Audit timeline
               - Follow-up items

NOTES:
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________
```

---

## 10. Post-Interview Actions

### 10.1 Post-Interview Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Post-Interview Actions                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Within 24 hours:                                                           │
│  □ Send thank-you email with summary of key points                         │
│  □ Share meeting notes for validation                                       │
│  □ Log any action items with owners                                        │
│  □ Update project tracking system                                          │
│                                                                             │
│  Within 1 week:                                                             │
│  □ Complete all interview forms and documentation                          │
│  □ Consolidate findings from all interviews                                │
│  □ Create prioritized use case list                                        │
│  □ Draft initial detection requirements document                           │
│  □ Identify gaps requiring follow-up                                       │
│  □ Schedule follow-up meetings if needed                                   │
│                                                                             │
│  Within 2 weeks:                                                            │
│  □ Present consolidated findings to stakeholders                           │
│  □ Get sign-off on prioritized rule list                                   │
│  □ Finalize detection requirements document                                │
│  □ Create project plan with timeline                                       │
│  □ Begin rule development                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Requirements Document Template

After completing all interviews, produce this deliverable:

```markdown
# SIEM Detection Requirements Document

## Document Control
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | YYYY-MM-DD | | Initial draft |

## 1. Executive Summary
Brief overview of findings and recommendations.

## 2. Environment Summary
- Organization profile
- Technology stack
- Team structure

## 3. Threat Landscape
- Priority threats (ranked)
- MITRE ATT&CK focus areas
- Industry-specific concerns

## 4. Data Source Inventory
- Current log sources (table)
- Gaps identified
- Onboarding recommendations

## 5. Detection Requirements
### 5.1 Priority 1 (Critical)
[Use Case details]

### 5.2 Priority 2 (High)
[Use Case details]

### 5.3 Priority 3 (Medium)
[Use Case details]

## 6. Integration Requirements
- Ticketing
- Notification
- SOAR

## 7. Success Metrics
- KPIs
- Targets
- Measurement approach

## 8. Project Plan
- Timeline
- Milestones
- Ownership

## Appendix A: Interview Notes
## Appendix B: Log Source Details
## Appendix C: Use Case Templates
```

### 10.3 Prioritization Framework

Use this framework to prioritize detection rules:

```
Priority Score = (Business Impact × 0.4) + (Threat Likelihood × 0.3) +
                 (Data Readiness × 0.2) + (Compliance Requirement × 0.1)

Where each factor is scored 1-5:

Business Impact:
  5 = Direct financial loss or regulatory penalty
  4 = Major operational disruption
  3 = Significant security risk
  2 = Moderate security concern
  1 = Low impact

Threat Likelihood:
  5 = Active targeting observed
  4 = Industry-wide attacks occurring
  3 = Techniques commonly used
  2 = Possible but rare
  1 = Unlikely

Data Readiness:
  5 = All data available and parsed
  4 = Most data available
  3 = Partial data, some gaps
  2 = Major data gaps
  1 = No data available

Compliance Requirement:
  5 = Mandatory for audit
  4 = Strongly recommended
  3 = Good practice
  2 = Nice to have
  1 = Not required
```

---

## Quick Reference Card

### Interview Flow Summary

| Phase | Focus | Key Deliverable |
|-------|-------|-----------------|
| Pre-Interview | Gather existing docs | Questionnaire responses |
| Phase 1 | Environment | Asset inventory |
| Phase 2 | Threats | Threat scenario map |
| Phase 3 | Data Sources | Log source matrix |
| Phase 4 | Detection | Prioritized use cases |
| Phase 5 | Operations | Alert routing matrix |
| Phase 6 | Success | KPI targets |
| Post-Interview | Consolidate | Requirements doc |

### Essential Questions (Top 10)

1. What are your crown jewels?
2. What keeps you up at night? (Top 3 threats)
3. What log sources feed the SIEM today?
4. What detections work well? What's noisy?
5. What's your current false positive rate?
6. What are your SLAs for alert response?
7. Do you have runbooks for common alerts?
8. How will you measure success?
9. What compliance requirements apply?
10. Who will own rule maintenance?

---

*Document Version: 1.0*
*Last Updated: 2026-01-29*
