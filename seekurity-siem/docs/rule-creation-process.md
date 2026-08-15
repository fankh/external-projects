# Rule Creation Process (탐지 규칙 개발 프로세스)

## 개요

SIEM Rule은 보안 이벤트를 탐지하고 알림을 생성하는 핵심 로직이다. 효과적인 Rule 개발은 True Positive를 최대화하고 False Positive를 최소화하며, 운영 가능한 수준의 알림을 생성해야 한다.

---

## 1. Rule 유형 분류

### 1.1 탐지 방식별 분류

| 유형 | 설명 | 사용 시나리오 | 복잡도 |
|------|------|---------------|--------|
| **Single Event** | 단일 이벤트 조건 매칭 | 명확한 위협 시그니처 | 낮음 |
| **Threshold** | 임계치 기반 탐지 | 비정상 빈도, 볼륨 | 낮음 |
| **Correlation** | 다중 이벤트 상관관계 | 공격 체인, 복합 패턴 | 높음 |
| **Sequence** | 순차적 이벤트 패턴 | Kill Chain, 시간 순서 중요 | 높음 |
| **Aggregation** | 집계 기반 이상 탐지 | 통계적 이상, 트렌드 | 중간 |
| **Baseline** | 기준선 대비 편차 | 행위 기반 이상 탐지 | 높음 |

### 1.2 대응 수준별 분류

| 심각도 | 설명 | 대응 SLA | 예시 |
|--------|------|----------|------|
| **Critical** | 즉각 대응 필요 | 15분 이내 | 랜섬웨어 탐지, 권한 상승 |
| **High** | 신속 대응 필요 | 1시간 이내 | 외부 공격 탐지, 데이터 유출 시도 |
| **Medium** | 당일 확인 필요 | 8시간 이내 | 정책 위반, 비정상 접근 |
| **Low** | 모니터링 대상 | 24시간 이내 | 설정 변경, 정보성 이벤트 |
| **Informational** | 참고 정보 | 필요시 | 감사 로그, 트렌드 분석 |

---

## 2. Rule 개발 프로세스

### 2.1 전체 워크플로우

```
┌───────────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ 1. 요구사항    │───▶│ 2. 설계       │───▶│ 3. 개발       │───▶│ 4. 검증       │
│ Requirement   │    │ Design        │    │ Development   │    │ Validation    │
└───────────────┘    └───────────────┘    └───────────────┘    └───────────────┘
       │                    │                    │                    │
       ▼                    ▼                    ▼                    ▼
  • Use Case 정의      • 탐지 로직 설계     • Rule 작성         • 테스트 케이스
  • 위협 시나리오      • 필요 데이터 식별   • 튜닝 파라미터     • FP/FN 분석
  • 대응 요구사항      • 상관관계 설계      • 알림 템플릿       • 성능 테스트

                                                                      │
       ┌──────────────────────────────────────────────────────────────┘
       │
       ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ 5. 배포       │───▶│ 6. 모니터링   │───▶│ 7. 최적화     │
│ Deployment    │    │ Monitoring    │    │ Optimization  │
└───────────────┘    └───────────────┘    └───────────────┘
       │                    │                    │
       ▼                    ▼                    ▼
  • Staging 배포       • FP Rate 추적       • 임계치 조정
  • Production 배포    • Detection Rate     • 조건 개선
  • 문서화             • 성능 모니터링       • 버전 업데이트
```

### 2.2 Phase 1: 요구사항 정의

#### Use Case 정의서 Template

```yaml
use_case_id: "UC-NET-001"
name: "Brute Force Login Detection"
category: "Credential Access"
mitre_attack:
  tactic: "TA0006 - Credential Access"
  technique: "T1110 - Brute Force"
  sub_technique: "T1110.001 - Password Guessing"

description: |
  단일 소스 IP에서 동일 대상에 대해 짧은 시간 내 다수의
  로그인 실패가 발생하는 경우를 탐지한다.

threat_scenario:
  - 공격자가 자동화된 도구로 비밀번호 대입 공격 수행
  - 계정 잠금 정책 우회 시도
  - 유효 자격 증명 획득 시도

data_sources:
  - "Firewall Authentication Logs"
  - "VPN Login Logs"
  - "Active Directory Logs"

detection_requirements:
  - 5분 내 동일 src_ip에서 10회 이상 로그인 실패
  - 동일 대상 계정에 대한 반복 시도 탐지
  - 성공 후 실패 패턴 무시 (정상 오타)

response_requirements:
  severity: "High"
  notification: ["SOC Team", "Security Admin"]
  automated_action: "Optional IP Block"
  sla: "1시간 이내 확인"

false_positive_scenarios:
  - 사용자 비밀번호 분실로 인한 반복 시도
  - 자동화 시스템의 잘못된 자격 증명 설정
  - 비밀번호 정책 변경 후 미갱신
```

### 2.3 Phase 2: 설계

#### 탐지 로직 설계

```
┌─────────────────────────────────────────────────────────────┐
│                    Detection Logic Design                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Data Source Selection                                   │
│     └── firewall_auth, vpn_auth, ad_auth                    │
│                                                              │
│  2. Filter Conditions                                        │
│     └── event_type = "authentication"                       │
│     └── outcome = "failure"                                 │
│                                                              │
│  3. Aggregation                                             │
│     └── GROUP BY: src_ip, dst_ip, username                  │
│     └── TIME WINDOW: 5 minutes                              │
│     └── COUNT: failure_count                                │
│                                                              │
│  4. Threshold                                               │
│     └── failure_count >= 10                                 │
│                                                              │
│  5. Exclusions                                              │
│     └── src_ip NOT IN whitelist                            │
│     └── username NOT IN service_accounts                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Phase 3: 개발

#### Rule 정의 Template

```yaml
rule_id: "RULE-NET-001"
name: "Brute Force Login Detection"
version: "1.0.0"
enabled: true
severity: "high"

# 참조 정보
references:
  use_case: "UC-NET-001"
  mitre_attack: ["T1110.001"]
  cve: []
  external: ["https://attack.mitre.org/techniques/T1110/001/"]

# 데이터 소스
data_sources:
  - index: "firewall-*"
    event_type: "authentication"
  - index: "vpn-*"
    event_type: "login"

# 탐지 조건
detection:
  # 필터 조건
  filter:
    - field: "event.category"
      operator: "equals"
      value: "authentication"
    - field: "event.outcome"
      operator: "equals"
      value: "failure"

  # 집계 조건
  aggregation:
    group_by:
      - "source.ip"
      - "destination.ip"
      - "user.name"
    time_window: "5m"
    count_field: "event_count"

  # 임계치
  threshold:
    field: "event_count"
    operator: ">="
    value: 10

  # 예외 조건
  exceptions:
    - field: "source.ip"
      operator: "in_list"
      list: "whitelist_ips"
      negate: true
    - field: "user.name"
      operator: "in_list"
      list: "service_accounts"
      negate: true

# 상관관계 (선택)
correlation:
  - sequence:
      - event: "multiple_failures"
        count: ">= 10"
      - event: "login_success"
        within: "10m"
    alert_on: "sequence_complete"
    name: "Successful Brute Force"
    severity_override: "critical"

# 알림 설정
alert:
  title: "[${severity}] Brute Force Detected: ${source.ip} → ${destination.ip}"
  description: |
    **탐지 내용**: 단일 소스에서 다수의 로그인 실패 발생

    **소스 IP**: ${source.ip}
    **대상 IP**: ${destination.ip}
    **대상 계정**: ${user.name}
    **실패 횟수**: ${event_count}
    **탐지 시간**: ${@timestamp}

    **권장 조치**:
    1. 해당 IP의 정상 여부 확인
    2. 계정 잠금 상태 확인
    3. 필요시 IP 차단 조치

  fields:
    - name: "source_ip"
      value: "${source.ip}"
    - name: "target_user"
      value: "${user.name}"
    - name: "failure_count"
      value: "${event_count}"

  notification:
    channels: ["soc_slack", "email_security"]
    throttle: "15m"
    max_alerts_per_hour: 10

# 자동 대응 (선택)
response:
  - action: "add_to_watchlist"
    target: "${source.ip}"
    list: "suspicious_ips"
    ttl: "24h"

  - action: "enrich_ticket"
    fields:
      threat_intel: true
      asset_info: true
      user_history: true

# 튜닝 가이드
tuning:
  parameters:
    - name: "time_window"
      default: "5m"
      range: ["1m", "30m"]
      description: "탐지 시간 윈도우"

    - name: "threshold"
      default: 10
      range: [5, 50]
      description: "실패 횟수 임계치"

  fp_reduction:
    - "서비스 계정 예외 목록 추가"
    - "VPN 서버 IP 예외 처리"
    - "시간대별 임계치 차등 적용"

# 테스트 케이스
test_cases:
  - name: "정상 탐지"
    input:
      events: 15
      src_ip: "192.168.1.100"
      dst_ip: "10.0.0.50"
      outcome: "failure"
      time_span: "3m"
    expected: "alert"

  - name: "임계치 미달"
    input:
      events: 5
      src_ip: "192.168.1.100"
      time_span: "5m"
    expected: "no_alert"

  - name: "화이트리스트 예외"
    input:
      events: 20
      src_ip: "10.0.0.1"  # whitelist
      time_span: "5m"
    expected: "no_alert"
```

### 2.5 Phase 4: 검증

#### 테스트 매트릭스

| 테스트 유형 | 목적 | 방법 |
|-------------|------|------|
| **Unit Test** | 개별 조건 검증 | 샘플 이벤트로 각 조건 테스트 |
| **Integration Test** | 전체 로직 검증 | 시나리오 기반 End-to-End |
| **FP Test** | False Positive 검증 | 정상 트래픽으로 오탐 확인 |
| **FN Test** | False Negative 검증 | 실제 공격 시뮬레이션 |
| **Performance Test** | 성능 검증 | 대용량 데이터 처리 테스트 |
| **Regression Test** | 회귀 검증 | 기존 탐지 유지 확인 |

#### 검증 체크리스트

```markdown
## Pre-Deployment Checklist

### 기능 검증
- [ ] 모든 필수 필드가 매핑되어 있는가?
- [ ] 임계치 조건이 올바르게 동작하는가?
- [ ] 시간 윈도우가 정확한가?
- [ ] 예외 조건이 정상 동작하는가?
- [ ] 알림이 올바르게 생성되는가?

### 품질 검증
- [ ] 테스트 데이터로 탐지 성공률 95% 이상인가?
- [ ] False Positive Rate가 허용 범위 내인가?
- [ ] False Negative가 없는가?
- [ ] 중복 알림이 발생하지 않는가?

### 운영 검증
- [ ] 알림 내용이 충분한 컨텍스트를 제공하는가?
- [ ] Throttling이 적절히 설정되었는가?
- [ ] 에스컬레이션 경로가 정의되었는가?
- [ ] 문서화가 완료되었는가?

### 성능 검증
- [ ] 쿼리 실행 시간이 허용 범위 내인가?
- [ ] 리소스 사용량이 적절한가?
- [ ] 대용량 처리 시 성능 저하가 없는가?
```

---

## 3. Rule 카테고리별 가이드

### 3.1 Network Security Rules

| Rule 유형 | 탐지 대상 | 주요 데이터 소스 |
|-----------|-----------|-----------------|
| **Firewall Deny Spike** | 비정상적인 차단 증가 | Firewall Logs |
| **Port Scan Detection** | 포트 스캔 활동 | Firewall, IDS |
| **Outbound C2 Traffic** | C2 통신 시도 | Firewall, Proxy |
| **DNS Tunneling** | DNS 채널 악용 | DNS Logs |
| **Lateral Movement** | 내부 횡적 이동 | Firewall, EDR |

### 3.2 Authentication Rules

| Rule 유형 | 탐지 대상 | 주요 데이터 소스 |
|-----------|-----------|-----------------|
| **Brute Force** | 무차별 대입 공격 | Auth Logs |
| **Credential Stuffing** | 자격 증명 스터핑 | Auth Logs |
| **Impossible Travel** | 불가능한 지리적 이동 | Auth Logs + GeoIP |
| **Off-hours Login** | 비업무 시간 접근 | Auth Logs |
| **Privilege Escalation** | 권한 상승 | AD Logs, Sudo Logs |

### 3.3 Endpoint Security Rules

| Rule 유형 | 탐지 대상 | 주요 데이터 소스 |
|-----------|-----------|-----------------|
| **Malware Execution** | 악성코드 실행 | EDR, AV |
| **Suspicious Process** | 의심 프로세스 | EDR |
| **PowerShell Abuse** | PowerShell 악용 | EDR, Windows Event |
| **Credential Dumping** | 자격 증명 덤프 | EDR |
| **Data Exfiltration** | 데이터 유출 | DLP, EDR |

---

## 4. Correlation Rule 설계

### 4.1 Correlation 유형

```
┌─────────────────────────────────────────────────────────────┐
│                   Correlation Types                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Same Source Correlation                                 │
│     └── 동일 소스에서 다양한 이벤트 발생                      │
│     └── 예: 같은 IP에서 포트스캔 후 Exploit 시도             │
│                                                              │
│  2. Same Target Correlation                                 │
│     └── 동일 대상에 대한 다양한 공격                          │
│     └── 예: 서버에 대한 다중 공격 벡터                        │
│                                                              │
│  3. Time-based Correlation                                  │
│     └── 특정 시간 내 연관 이벤트 발생                         │
│     └── 예: 로그인 실패 후 성공                              │
│                                                              │
│  4. Kill Chain Correlation                                  │
│     └── 공격 단계별 이벤트 연결                               │
│     └── 예: 정찰 → 침투 → 확산 → 유출                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Kill Chain 기반 Correlation 예시

```yaml
correlation_rule:
  name: "Advanced Persistent Threat Detection"
  description: "Kill Chain 기반 APT 탐지"

  stages:
    - stage: "reconnaissance"
      events:
        - rule: "Port Scan Detected"
        - rule: "DNS Enumeration"
      weight: 1

    - stage: "initial_access"
      events:
        - rule: "Exploit Attempt"
        - rule: "Phishing Click"
      weight: 2
      requires: ["reconnaissance"]
      within: "24h"

    - stage: "execution"
      events:
        - rule: "Suspicious Process Start"
        - rule: "PowerShell Encoded Command"
      weight: 3
      requires: ["initial_access"]
      within: "4h"

    - stage: "persistence"
      events:
        - rule: "Scheduled Task Created"
        - rule: "Registry Run Key Added"
      weight: 2
      requires: ["execution"]
      within: "1h"

    - stage: "lateral_movement"
      events:
        - rule: "Internal RDP Connection"
        - rule: "SMB Lateral Movement"
      weight: 3
      requires: ["execution"]
      within: "8h"

    - stage: "exfiltration"
      events:
        - rule: "Large Outbound Transfer"
        - rule: "Cloud Upload Detected"
      weight: 4
      requires: ["lateral_movement"]
      within: "24h"

  scoring:
    method: "weighted_sum"
    thresholds:
      - score: 5
        severity: "medium"
      - score: 8
        severity: "high"
      - score: 12
        severity: "critical"

  alert:
    title: "APT Kill Chain Detected"
    include_timeline: true
    include_all_events: true
```

---

## 5. Rule 최적화

### 5.1 False Positive 감소 전략

| 전략 | 설명 | 예시 |
|------|------|------|
| **화이트리스트** | 알려진 정상 소스 제외 | 스캐너 IP, 모니터링 시스템 |
| **시간대 필터** | 업무 시간/비업무 시간 구분 | 업무 시간 내 Admin 접근 허용 |
| **빈도 기반 예외** | 정상적인 높은 빈도 제외 | 배치 작업, 자동화 시스템 |
| **자산 기반 필터** | 자산 유형별 차등 적용 | 개발 서버 vs 운영 서버 |
| **사용자 기반 예외** | 특정 역할/그룹 제외 | 보안팀, 시스템 관리자 |

### 5.2 탐지율 향상 전략

| 전략 | 설명 | 적용 |
|------|------|------|
| **다중 데이터 소스** | 여러 소스 조합 탐지 | Firewall + EDR + Auth |
| **시퀀스 탐지** | 이벤트 순서 고려 | 실패 → 성공 패턴 |
| **앙상블 규칙** | 여러 Rule 조합 | OR 조건 활용 |
| **동적 임계치** | 기준선 대비 편차 탐지 | 평균 대비 3σ 초과 |
| **TI 연동** | Threat Intelligence 활용 | IOC 매칭 |

### 5.3 튜닝 사이클

```
     ┌─────────────────────────────────────────────┐
     │                                             │
     ▼                                             │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌────┴────┐
│ Deploy  │───▶│ Monitor │───▶│ Analyze │───▶│  Tune   │
│ (배포)   │    │ (모니터링)│    │ (분석)   │    │ (튜닝)   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                    │              │
                    ▼              ▼
              ┌──────────┐  ┌──────────┐
              │ FP Rate  │  │ FN Check │
              │ Tracking │  │ (탐지누락)│
              └──────────┘  └──────────┘

튜닝 주기:
- 신규 Rule: 배포 후 1주일간 집중 모니터링
- 운영 Rule: 월 1회 정기 검토
- 이슈 발생 시: 즉시 검토
```

---

## 6. Rule 관리

### 6.1 Rule Lifecycle

| 상태 | 설명 | 조건 |
|------|------|------|
| **Draft** | 개발 중 | 초안 작성 |
| **Testing** | 테스트 중 | 검증 진행 |
| **Staging** | 스테이징 배포 | Production 전 검증 |
| **Active** | 운영 중 | Production 활성화 |
| **Tuning** | 튜닝 중 | FP/FN 조정 필요 |
| **Deprecated** | 비활성 예정 | 대체 Rule 존재 |
| **Archived** | 보관 | 더 이상 사용 안 함 |

### 6.2 버전 관리

```
rules/
├── network/
│   ├── brute-force/
│   │   ├── v1.0.0/
│   │   │   ├── rule.yaml
│   │   │   ├── tests/
│   │   │   └── CHANGELOG.md
│   │   ├── v1.1.0/
│   │   └── latest -> v1.1.0
│   └── port-scan/
├── endpoint/
└── application/
```

### 6.3 Rule 메타데이터 관리

```yaml
metadata:
  rule_id: "RULE-NET-001"
  version: "1.1.0"
  created_at: "2026-01-15"
  updated_at: "2026-01-29"
  author: "Security Team"
  reviewer: "SOC Lead"
  status: "active"

  # 품질 지표
  metrics:
    total_alerts: 1250
    true_positive: 1180
    false_positive: 70
    precision: 0.944
    last_triggered: "2026-01-29T10:30:00Z"

  # 의존성
  dependencies:
    data_sources: ["firewall-*", "vpn-*"]
    parsers: ["paloalto_v10", "fortinet_v7"]
    lists: ["whitelist_ips", "service_accounts"]

  # 태그
  tags:
    - "credential-access"
    - "brute-force"
    - "mitre-t1110"
    - "priority-high"
```

---

## 7. MITRE ATT&CK 매핑

### 7.1 Tactic별 Rule 커버리지

| Tactic | 설명 | Rule 수 | 커버리지 |
|--------|------|---------|----------|
| TA0001 | Initial Access | 15 | 75% |
| TA0002 | Execution | 20 | 80% |
| TA0003 | Persistence | 12 | 60% |
| TA0004 | Privilege Escalation | 10 | 50% |
| TA0005 | Defense Evasion | 8 | 40% |
| TA0006 | Credential Access | 18 | 90% |
| TA0007 | Discovery | 6 | 30% |
| TA0008 | Lateral Movement | 14 | 70% |
| TA0009 | Collection | 5 | 25% |
| TA0010 | Exfiltration | 10 | 50% |
| TA0011 | Command and Control | 12 | 60% |

### 7.2 Technique 매핑 예시

```yaml
mitre_mapping:
  - technique_id: "T1110"
    technique_name: "Brute Force"
    rules:
      - "RULE-NET-001: Brute Force Login Detection"
      - "RULE-NET-002: Password Spray Detection"
      - "RULE-NET-003: Credential Stuffing Detection"
    coverage: "high"
    data_sources:
      - "Authentication logs"
      - "VPN logs"
      - "AD event logs"
```

---

*최종 수정일: 2026-01-29*
