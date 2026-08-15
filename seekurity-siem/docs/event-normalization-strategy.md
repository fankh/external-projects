# Event Name Normalization Strategy (이벤트 정규화 전략)

## 개요

Event Normalization은 다양한 벤더/제품에서 발생하는 이벤트를 일관된 분류 체계로 통합하는 과정이다. 올바른 전략 선택은 탐지 규칙 작성, 대시보드 구성, 상관 분석의 효율성에 직접적인 영향을 미친다.

> **핵심 인사이트**: "SIEM event normalization is utopia. SIEM alert normalization is a must."
> — Alex Teixeira, [Get over SIEM event normalization](https://ateixei.medium.com/get-over-siem-event-normalization-595fc36559b4)

---

## 1. 업계 주요 표준 및 접근 방식

### 1.1 표준/플랫폼별 비교표

| 표준/플랫폼 | 개발사 | 특징 | 채택 현황 |
|-------------|--------|------|-----------|
| **OCSF** | AWS, Splunk, IBM 등 18개사 | 오픈 표준, Linux Foundation 프로젝트 | 2023 BlackHat 1.0 릴리스, 급속 확산 |
| **ECS** | Elastic | 오픈 스키마, Elasticsearch 최적화 | Elastic Stack 생태계 표준 |
| **CIM** | Splunk | Data Model 기반, 검색 시간 스키마 | Splunk 생태계 표준 |
| **ASIM** | Microsoft | Query-time 파싱, OSSEM 정렬 | Microsoft Sentinel 표준 |
| **UDM** | Google | 60+ 이벤트 타입, Entity Graph 연동 | Google Chronicle 표준 |
| **QID** | IBM | 숫자 기반 고유 ID, DSM 매핑 | QRadar 전용 |
| **CEF** | Micro Focus | Key-Value 형식, 업계 표준 | 다수 벤더 지원 |
| **LEEF** | IBM | Tab 구분 형식 | QRadar 최적화 |

### 1.2 아키텍처 비교

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Normalization Architecture Comparison                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐              │
│  │  Ingest-Time     │  │  Query-Time      │  │  Hybrid          │              │
│  │  (수집 시 정규화) │  │  (쿼리 시 정규화) │  │  (혼합 방식)      │              │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘              │
│           │                     │                     │                         │
│           ▼                     ▼                     ▼                         │
│  • QRadar QID           • MS Sentinel ASIM    • Google Chronicle              │
│  • Splunk (Index-time)  • Elastic (Runtime)   • Sumo Logic                    │
│  • 저장 전 변환          • KQL 함수 활용       • Ingest + Query 조합            │
│  • 원본 손실 가능        • 원본 보존          • 성능 최적화                      │
│  • 빠른 검색            • 유연한 변경         • 복잡도 높음                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. OCSF (Open Cybersecurity Schema Framework) 상세

> 참조: [OCSF Schema Browser](https://schema.ocsf.io/) | [OCSF GitHub](https://github.com/ocsf)

### 2.1 OCSF 개요

OCSF는 AWS, Splunk, IBM, CrowdStrike, Palo Alto Networks 등 18개 이상의 기업이 공동 개발한 오픈 표준이다. 2023년 BlackHat에서 1.0이 릴리스되었으며, 2024년 11월 Linux Foundation 프로젝트로 승격되었다.

**핵심 구성요소:**
- **Categories**: 이벤트의 대분류 (8개)
- **Event Classes**: 카테고리 내 세부 클래스 (60+개)
- **Profiles**: 특수 속성 세트를 추가하는 믹스인 메커니즘
- **Objects**: 재사용 가능한 데이터 구조
- **Attributes**: 필드 정의 및 데이터 타입

### 2.2 OCSF Category 체계 (v1.4.0)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              OCSF Categories                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Category 1: System Activity (시스템 활동)                                      │
│  ─────────────────────────────────────────                                      │
│  • 1001: File System Activity      파일 생성/수정/삭제                          │
│  • 1002: Kernel Extension Activity 커널 확장 로드/언로드                         │
│  • 1003: Kernel Activity           커널 이벤트                                  │
│  • 1004: Memory Activity           메모리 할당/해제                             │
│  • 1005: Module Activity           모듈 로드/언로드                             │
│  • 1006: Scheduled Job Activity    스케줄 작업                                  │
│  • 1007: Process Activity          프로세스 시작/종료                           │
│  • 1008: Event Log Activity        이벤트 로그                                  │
│  • 1009: Script Activity           스크립트 실행                                │
│                                                                                  │
│  Category 2: Findings (탐지 결과)                                               │
│  ────────────────────────────────                                               │
│  • 2001: Security Finding          보안 탐지                                    │
│  • 2002: Vulnerability Finding     취약점 발견                                  │
│  • 2003: Compliance Finding        컴플라이언스 결과                            │
│  • 2004: Detection Finding         탐지 결과                                    │
│  • 2005: Incident Finding          인시던트                                     │
│  • 2006: Data Security Finding     데이터 보안                                  │
│                                                                                  │
│  Category 3: Identity & Access Management (IAM)                                 │
│  ─────────────────────────────────────────────                                  │
│  • 3001: Account Change            계정 변경                                    │
│  • 3002: Authentication            인증                                         │
│  • 3003: Authorize Session         세션 인가                                    │
│  • 3004: Entity Management         엔티티 관리                                  │
│  • 3005: User Access Management    사용자 접근 관리                             │
│  • 3006: Group Management          그룹 관리                                    │
│                                                                                  │
│  Category 4: Network Activity (네트워크 활동)                                   │
│  ───────────────────────────────────────────                                    │
│  • 4001: Network Activity          일반 네트워크 활동                           │
│  • 4002: HTTP Activity             HTTP 트래픽                                  │
│  • 4003: DNS Activity              DNS 쿼리/응답                                │
│  • 4004: DHCP Activity             DHCP                                         │
│  • 4005: RDP Activity              원격 데스크톱                                │
│  • 4006: SMB Activity              파일 공유                                    │
│  • 4007: SSH Activity              SSH 연결                                     │
│  • 4008: FTP Activity              파일 전송                                    │
│  • 4009: Email Activity            이메일                                       │
│  • 4010: Network File Activity     네트워크 파일                                │
│  • 4011: Email File Activity       이메일 첨부                                  │
│  • 4012: Email URL Activity        이메일 URL                                   │
│  • 4013: NTP Activity              시간 동기화                                  │
│  • 4014: Tunnel Activity           터널링                                       │
│                                                                                  │
│  Category 5: Discovery (탐색/인벤토리)                                          │
│  ──────────────────────────────────────                                         │
│  • 5001-5023: 다양한 인벤토리 클래스 (Device, OS, App, Cloud Resources 등)      │
│                                                                                  │
│  Category 6: Application Activity (애플리케이션 활동)                           │
│  ─────────────────────────────────────────────────                              │
│  • 6001: Web Resources Activity    웹 리소스                                    │
│  • 6002: Application Lifecycle     앱 라이프사이클                              │
│  • 6003: API Activity              API 호출                                     │
│  • 6004: Web Resource Access       웹 접근                                      │
│  • 6005: Datastore Activity        데이터스토어                                 │
│  • 6006: File Hosting Activity     파일 호스팅                                  │
│  • 6007: Scan Activity             스캔                                         │
│  • 6008: Application Error         앱 오류                                      │
│                                                                                  │
│  Category 7: Remediation (대응/조치)                                            │
│  ────────────────────────────────────                                           │
│  • 7001: Remediation Activity      일반 대응                                    │
│  • 7002: File Remediation          파일 대응                                    │
│  • 7003: Process Remediation       프로세스 대응                                │
│  • 7004: Network Remediation       네트워크 대응                                │
│                                                                                  │
│  Category 8: Unmanned Systems (무인 시스템) - v1.4 신규                         │
│  ─────────────────────────────────────────────────────                          │
│  • 8001: Drone Flights Activity    드론 비행                                    │
│  • 8002: Airborne Broadcast        항공 브로드캐스트                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 OCSF 이벤트 구조

```json
{
  "class_uid": 4001,
  "class_name": "Network Activity",
  "category_uid": 4,
  "category_name": "Network Activity",
  "type_uid": 400106,
  "type_name": "Traffic",
  "activity_id": 6,
  "activity_name": "Refuse",
  "severity_id": 3,
  "severity": "Medium",
  "status_id": 1,
  "status": "Success",
  "time": 1706522400000,
  "metadata": {
    "version": "1.4.0",
    "product": {
      "vendor_name": "Palo Alto Networks",
      "name": "NGFW",
      "version": "10.2"
    },
    "original_time": "2026-01-29T10:30:00.000Z"
  },
  "src_endpoint": {
    "ip": "192.168.1.100",
    "port": 54321,
    "hostname": "workstation-01"
  },
  "dst_endpoint": {
    "ip": "10.0.0.50",
    "port": 443,
    "hostname": "webserver-01"
  },
  "connection_info": {
    "protocol_name": "TCP",
    "direction": "Outbound"
  },
  "disposition_id": 2,
  "disposition": "Blocked",
  "unmapped": {
    "original_event_id": "TRAFFIC,deny",
    "policy_name": "Block-Malicious"
  }
}
```

### 2.4 OCSF 활용 사례: AWS Security Lake

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        AWS Security Lake + OCSF Architecture                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Data Sources                          Security Lake                            │
│  ────────────────                      ─────────────                            │
│  CloudTrail      ─┐                                                             │
│  VPC Flow Logs   ─┼─▶  OCSF Transform  ─▶  S3 (Parquet)  ─▶  Athena/QuickSight │
│  Route 53        ─┤                                                             │
│  GuardDuty       ─┤         │                                                   │
│  Security Hub    ─┘         │                                                   │
│                             ▼                                                   │
│  3rd Party       ─▶  Custom OCSF      ─▶  S3 (Parquet)                         │
│  (Palo Alto,         Transformer                                                │
│   CrowdStrike)                                                                  │
│                                                                                  │
│  Benefits:                                                                       │
│  • 단일 스키마로 모든 소스 통합                                                  │
│  • 벤더 독립적 쿼리                                                             │
│  • Parquet 형식으로 비용 효율적 저장                                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. ECS (Elastic Common Schema) 상세

> 참조: [ECS Documentation](https://www.elastic.co/guide/en/ecs/current/) | [ECS GitHub](https://github.com/elastic/ecs)

### 3.1 ECS 카테고리화 필드 체계

ECS는 4개의 카테고리화 필드를 계층적으로 사용한다:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ECS Categorization Hierarchy                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  event.kind (1단계)                                                             │
│  ─────────────────                                                              │
│  • alert        보안 경고, 탐지된 위협                                          │
│  • enrichment   컨텍스트 보강 데이터                                            │
│  • event        일반 이벤트 (기본값)                                            │
│  • metric       메트릭/통계 데이터                                              │
│  • state        상태 스냅샷                                                     │
│  • pipeline_error 파이프라인 처리 오류                                          │
│  • signal       탐지 신호                                                       │
│                                                                                  │
│  event.category (2단계) - 배열, 다중 값 허용                                    │
│  ───────────────────────────────────────────                                    │
│  • authentication   인증 관련                                                   │
│  • configuration    설정 변경                                                   │
│  • database         데이터베이스 활동                                           │
│  • driver           드라이버/커널 모듈                                          │
│  • email            이메일                                                      │
│  • file             파일 시스템                                                 │
│  • host             호스트 관련                                                 │
│  • iam              ID/접근 관리                                                │
│  • intrusion_detection  침입 탐지                                               │
│  • malware          악성코드                                                    │
│  • network          네트워크                                                    │
│  • package          패키지/소프트웨어                                           │
│  • process          프로세스                                                    │
│  • registry         레지스트리 (Windows)                                        │
│  • session          세션                                                        │
│  • threat           위협 인텔리전스                                             │
│  • vulnerability    취약점                                                      │
│  • web              웹 활동                                                     │
│                                                                                  │
│  event.type (3단계) - 배열, 다중 값 허용                                        │
│  ─────────────────────────────────────────                                      │
│  • access           접근                                                        │
│  • admin            관리자 작업                                                 │
│  • allowed          허용됨                                                      │
│  • change           변경                                                        │
│  • connection       연결                                                        │
│  • creation         생성                                                        │
│  • deletion         삭제                                                        │
│  • denied           거부됨                                                      │
│  • end              종료                                                        │
│  • error            오류                                                        │
│  • group            그룹 작업                                                   │
│  • indicator        인디케이터                                                  │
│  • info             정보                                                        │
│  • installation     설치                                                        │
│  • protocol         프로토콜                                                    │
│  • start            시작                                                        │
│  • user             사용자 작업                                                 │
│                                                                                  │
│  event.outcome (4단계)                                                          │
│  ─────────────────────                                                          │
│  • success          성공                                                        │
│  • failure          실패                                                        │
│  • unknown          알 수 없음                                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 ECS 필드 그룹

| 필드 그룹 | 설명 | 주요 필드 |
|-----------|------|-----------|
| **@timestamp** | 이벤트 발생 시간 | ISO 8601 형식 |
| **event.*** | 이벤트 메타데이터 | kind, category, type, action, outcome |
| **source.*** | 소스 정보 | ip, port, mac, domain, user.name |
| **destination.*** | 목적지 정보 | ip, port, mac, domain |
| **network.*** | 네트워크 | transport, protocol, direction, bytes |
| **process.*** | 프로세스 | pid, name, executable, args, parent.* |
| **file.*** | 파일 | path, name, extension, hash.*, size |
| **user.*** | 사용자 | name, id, domain, email, roles |
| **host.*** | 호스트 | hostname, ip, os.*, architecture |
| **agent.*** | 에이전트 | name, type, version |
| **rule.*** | 규칙 | id, name, category, description |
| **threat.*** | 위협 | framework, tactic.*, technique.* |

### 3.3 ECS 매핑 예시

```yaml
# Firewall Deny → ECS
input:
  vendor: "Palo Alto"
  event_id: "TRAFFIC,deny"
  src: "192.168.1.100"
  dst: "10.0.0.50"
  action: "deny"

output:
  "@timestamp": "2026-01-29T10:30:00.000Z"
  event:
    kind: "event"
    category: ["network"]
    type: ["connection", "denied"]
    action: "firewall_deny"
    outcome: "success"
  source:
    ip: "192.168.1.100"
  destination:
    ip: "10.0.0.50"
  network:
    direction: "outbound"
  observer:
    vendor: "Palo Alto Networks"
    product: "NGFW"
    type: "firewall"
```

---

## 4. 벤더별 플랫폼 상세

### 4.1 QRadar QID System

> 참조: [IBM QRadar Event Mapping](https://www.ibm.com/docs/SS42VS_7.4/com.ibm.qradar.doc/c_qradar_adm_dsm_ed_eventmapping.html)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              QRadar QID Architecture                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  QID 구조                                                                        │
│  ──────────                                                                      │
│  • QID = QRadar Identifier                                                      │
│  • 숫자 기반 고유 ID (32-bit integer)                                           │
│  • Event Name, High-Level Category, Low-Level Category 결정                     │
│                                                                                  │
│  QID 범위                                                                        │
│  ──────────                                                                      │
│  1 - 1,000,000           IBM 사전 정의 QID                                      │
│  1,000,001 - 2,000,000   고객 커스텀 QID                                        │
│  68,750,000+             DSM별 자동 생성 QID                                    │
│                                                                                  │
│  DSM Editor 워크플로우                                                           │
│  ─────────────────────                                                          │
│  1. Raw Event 수신                                                              │
│  2. Log Source Type 식별                                                        │
│  3. DSM (Device Support Module) 선택                                            │
│  4. Event ID 추출 (Regex)                                                       │
│  5. QID 매핑 테이블 조회                                                         │
│  6. 매핑 없으면 Unknown Event (QID 자동 생성)                                   │
│  7. 매핑 있으면 해당 QID 적용                                                    │
│                                                                                  │
│  Category 체계                                                                   │
│  ─────────────                                                                   │
│  High-Level Categories (약 20개):                                               │
│  • Authentication                                                               │
│  • Access                                                                       │
│  • Firewall                                                                     │
│  • Network                                                                      │
│  • System                                                                       │
│  • Malware                                                                      │
│  • Exploit                                                                      │
│  • ...                                                                          │
│                                                                                  │
│  Low-Level Categories (수백 개):                                                │
│  • Authentication - Login Succeeded                                             │
│  • Authentication - Login Failed                                                │
│  • Firewall - Session Opened                                                    │
│  • Firewall - Session Denied                                                    │
│  • ...                                                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**QID 매핑 CLI 명령어:**
```bash
# 커스텀 QID 생성
/opt/QRadar/bin/qidmap_cli.sh -c \
  --qname "Custom Login Failure" \
  --qdescription "Custom authentication failure event" \
  --severity 5 \
  --lowlevelcategoryid 1001

# CSV 일괄 임포트
/opt/QRadar/bin/qidmap_cli.sh -i -f /tmp/qid_mapping.csv
```

### 4.2 Splunk CIM (Common Information Model)

> 참조: [Splunk CIM Documentation](https://help.splunk.com/en/data-management/common-information-model/)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Splunk CIM Data Models                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  주요 Data Models                                                               │
│  ─────────────────                                                              │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Authentication  │  │ Network Traffic │  │ Intrusion       │                 │
│  │                 │  │                 │  │ Detection       │                 │
│  │ • action        │  │ • action        │  │ • action        │                 │
│  │ • app           │  │ • bytes_in      │  │ • category      │                 │
│  │ • user          │  │ • bytes_out     │  │ • dest          │                 │
│  │ • src           │  │ • dest          │  │ • dvc           │                 │
│  │ • dest          │  │ • dest_port     │  │ • ids_type      │                 │
│  │ • signature     │  │ • src           │  │ • severity      │                 │
│  │                 │  │ • src_port      │  │ • signature     │                 │
│  │                 │  │ • transport     │  │ • src           │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│  │ Malware         │  │ Web             │  │ Change          │                 │
│  │                 │  │                 │  │                 │                 │
│  │ • action        │  │ • action        │  │ • action        │                 │
│  │ • dest          │  │ • bytes         │  │ • change_type   │                 │
│  │ • file_name     │  │ • dest          │  │ • command       │                 │
│  │ • file_path     │  │ • http_method   │  │ • dvc           │                 │
│  │ • signature     │  │ • site          │  │ • object        │                 │
│  │ • user          │  │ • status        │  │ • object_path   │                 │
│  │                 │  │ • url           │  │ • result        │                 │
│  │                 │  │ • user          │  │ • user          │                 │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
│                                                                                  │
│  CIM 활용 (tstats 명령어)                                                        │
│  ────────────────────────                                                       │
│  | tstats count from datamodel=Authentication                                   │
│    where Authentication.action=failure                                          │
│    by Authentication.user, Authentication.src                                   │
│  → Data Model 가속화로 일반 stats 대비 10-100배 빠른 검색                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Microsoft Sentinel ASIM

> 참조: [Microsoft ASIM Documentation](https://learn.microsoft.com/en-us/azure/sentinel/normalization)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Microsoft Sentinel ASIM                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ASIM 특징                                                                       │
│  ──────────                                                                      │
│  • Query-Time 정규화 (KQL 함수 기반)                                            │
│  • 원본 데이터 보존                                                             │
│  • OSSEM (Open Source Security Events Metadata) 정렬                            │
│  • 런타임 파싱으로 유연한 변경 가능                                              │
│                                                                                  │
│  Parser 구조                                                                     │
│  ────────────                                                                    │
│  Unifying Parser: _Im_<schema>         (예: _Im_NetworkSession)                 │
│       └── Source-specific Parser: _Im_<schema>_<source>                         │
│           (예: _Im_NetworkSession_PaloAltoNGFW)                                 │
│                                                                                  │
│  주요 스키마                                                                     │
│  ────────────                                                                    │
│  • NetworkSession    네트워크 세션                                              │
│  • WebSession        웹 세션                                                    │
│  • Dns               DNS 활동                                                   │
│  • Authentication    인증                                                       │
│  • ProcessEvent      프로세스 이벤트                                            │
│  • FileEvent         파일 이벤트                                                │
│  • RegistryEvent     레지스트리 이벤트                                          │
│  • AuditEvent        감사 이벤트                                                │
│                                                                                  │
│  사용 예시 (KQL)                                                                 │
│  ──────────────                                                                  │
│  // 모든 네트워크 세션 (정규화된 뷰)                                             │
│  _Im_NetworkSession                                                             │
│  | where DstPortNumber == 22                                                    │
│  | where SrcIpAddr !has "10."                                                   │
│  | summarize count() by SrcIpAddr, DstIpAddr                                    │
│                                                                                  │
│  장점:                                                                           │
│  • 원본 손실 없음                                                               │
│  • Parser 수정 시 기존 데이터에도 즉시 적용                                      │
│  • 테스트 용이                                                                  │
│                                                                                  │
│  단점:                                                                           │
│  • 대용량 데이터셋에서 성능 영향                                                 │
│  • 복잡한 Parser는 쿼리 시간 증가                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Google Chronicle UDM

> 참조: [Chronicle UDM Overview](https://cloud.google.com/chronicle/docs/event-processing/udm-overview)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Google Chronicle UDM                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  UDM 특징                                                                        │
│  ──────────                                                                      │
│  • 60+ 이벤트 타입 사전 정의                                                    │
│  • Entity Graph 연동 (자동 보강)                                                │
│  • YARA-L 규칙 언어 지원                                                        │
│  • Google Threat Intelligence 통합                                              │
│                                                                                  │
│  주요 Event Types                                                               │
│  ─────────────────                                                              │
│  • USER_LOGIN              사용자 로그인                                        │
│  • USER_LOGOUT             사용자 로그아웃                                      │
│  • USER_CREATION           사용자 생성                                          │
│  • NETWORK_CONNECTION      네트워크 연결                                        │
│  • NETWORK_DNS             DNS 쿼리                                             │
│  • FILE_CREATION           파일 생성                                            │
│  • FILE_MODIFICATION       파일 수정                                            │
│  • PROCESS_LAUNCH          프로세스 실행                                        │
│  • SMTP_PROXY              이메일 프록시                                        │
│  • REGISTRY_MODIFICATION   레지스트리 변경                                      │
│  • SCAN_VULN_HOST          취약점 스캔                                          │
│  • GENERIC_EVENT           일반 이벤트                                          │
│                                                                                  │
│  UDM 이벤트 구조                                                                 │
│  ────────────────                                                               │
│  metadata:          메타데이터 (timestamp, event_type, product_name)            │
│  principal:         주체 (작업 수행자)                                          │
│  target:            대상 (작업 대상)                                            │
│  src:               소스 (네트워크 소스)                                        │
│  observer:          관찰자 (로그 생성 장비)                                     │
│  intermediary:      중개자 (프록시 등)                                          │
│  network:           네트워크 정보                                               │
│  security_result:   보안 결과 (action, severity, threat_name)                   │
│                                                                                  │
│  검색 예시 (벤더 독립)                                                           │
│  ─────────────────────                                                          │
│  metadata.event_type = "USER_LOGIN"                                             │
│  AND security_result.action = "ALLOW"                                           │
│  → 모든 소스의 성공한 로그인 검색                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Sumo Logic Normalized Classification

> 참조: [Sumo Logic Normalized Classification](https://help.sumologic.com/docs/cse/schema/cse-normalized-classification/)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Sumo Logic Cloud SIEM Classification                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Normalized Fields                                                              │
│  ─────────────────                                                              │
│  metadata_vendor          벤더명                                                │
│  metadata_product         제품명                                                │
│  metadata_deviceEventId   원본 이벤트 ID                                        │
│  threat_ruleType          정규화된 위협 유형                                    │
│                                                                                  │
│  threat_ruleType 값                                                             │
│  ───────────────────                                                            │
│  • intrusion              침입 탐지                                             │
│  • malware                악성코드                                              │
│  • direct                 직접 위협                                             │
│  • audit                  감사                                                  │
│  • ocsf                   OCSF 표준                                             │
│                                                                                  │
│  일반 규칙 vs 정규화 규칙                                                        │
│  ─────────────────────────                                                      │
│  일반 규칙:                                                                      │
│  metadata_vendor = 'Palo Alto' and metadata_product = 'NGFW'                    │
│  and metadata_deviceEventId = 'THREAT,vulnerability'                            │
│                                                                                  │
│  정규화 규칙:                                                                    │
│  threat_ruleType = 'intrusion'                                                  │
│  → 모든 벤더의 침입 탐지 이벤트 매칭                                            │
│                                                                                  │
│  장점:                                                                           │
│  • 단일 규칙으로 다중 벤더 커버                                                  │
│  • 규칙 유지보수 간소화                                                         │
│  • 새 벤더 추가 시 규칙 수정 불필요                                              │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 실무적 도전과제

> 참조: [Cybersecurity Event Data Normalization Challenges](https://www.query.ai/resources/blogs/cybersecurity-event-data-normalization-standards/)

### 5.1 현실적 한계

| 도전과제 | 설명 | 영향 |
|----------|------|------|
| **완벽한 정규화는 불가능** | 데이터 소스의 다양성과 지속적 변화로 100% 정규화는 현실적으로 불가능 | 기대치 조정 필요 |
| **벤더별 고유 필드** | 표준에 매핑되지 않는 벤더 고유 필드 존재 | unmapped 필드로 보존 |
| **로그 포맷 버전 변경** | 제품 업데이트 시 로그 포맷 변경 | Parser 지속 업데이트 필요 |
| **커스텀 애플리케이션** | 자체 개발 앱은 표준 포맷 없음 | 별도 Parser 개발 필요 |
| **성능 vs 완전성 트레이드오프** | 정교한 정규화는 처리 시간 증가 | 적정 수준 타협 |
| **스킬 요구사항** | 정규화 작업에 전문 지식 필요 | 인력 확보/교육 필요 |

### 5.2 실패 패턴과 교훈

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Common Normalization Anti-Patterns                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ❌ Anti-Pattern 1: 원본 데이터 폐기                                            │
│  ────────────────────────────────────                                           │
│  • 정규화 후 원본 삭제                                                          │
│  • 포렌식 불가, 벤더 지원 요청 시 정보 부족                                      │
│  → ✅ 원본은 항상 보존 (raw_message, unmapped 필드)                             │
│                                                                                  │
│  ❌ Anti-Pattern 2: 과도한 세분화                                               │
│  ────────────────────────────────                                               │
│  • 수천 개의 세부 카테고리 정의                                                  │
│  • 유지보수 불가능, 일관성 저하                                                  │
│  → ✅ 20-50개 수준의 실용적 카테고리                                            │
│                                                                                  │
│  ❌ Anti-Pattern 3: 단일 표준 강제                                              │
│  ─────────────────────────────────                                              │
│  • 모든 데이터를 하나의 표준으로 강제 매핑                                       │
│  • 맞지 않는 데이터의 의미 손실                                                  │
│  → ✅ 계층적 접근 (표준 + 원본 + 커스텀)                                        │
│                                                                                  │
│  ❌ Anti-Pattern 4: 정규화 완료 후 방치                                         │
│  ─────────────────────────────────────                                          │
│  • 초기 구축 후 업데이트 없음                                                    │
│  • 새 벤더/버전에 대응 불가                                                      │
│  → ✅ 지속적 모니터링 및 업데이트 프로세스                                       │
│                                                                                  │
│  ❌ Anti-Pattern 5: 성능 고려 없는 Query-Time 정규화                            │
│  ─────────────────────────────────────────────────────                          │
│  • 대용량 데이터에서 실시간 정규화                                               │
│  • 쿼리 타임아웃, 시스템 부하                                                    │
│  → ✅ Hybrid 접근 (Ingest-time 기본 + Query-time 보완)                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. 권장 전략: OCSF-First (ECS 제외)

### 6.1 ECS vs OCSF: 왜 OCSF를 선택해야 하는가?

#### ECS의 한계 (Vendor Lock-in 문제)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ECS Vendor Lock-in Problem                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ECS 문제점:                                                                     │
│  ───────────                                                                    │
│  ✗ Elastic 단일 기업 소유 (오픈소스이지만 통제권은 Elastic에)                   │
│  ✗ Elasticsearch/OpenSearch 전용 설계                                          │
│  ✗ 다른 SIEM 플랫폼에서 인정받지 못함                                           │
│  ✗ 라이선스 변경 전력 있음 (2021년 Elastic License 2.0)                         │
│                                                                                  │
│  플랫폼 변경 시 문제:                                                            │
│  ────────────────────                                                           │
│  • Splunk 전환 → CIM으로 재매핑 필요                                            │
│  • QRadar 전환 → QID로 재매핑 필요                                              │
│  • Chronicle 전환 → UDM으로 재매핑 필요                                         │
│  • AWS Security Lake → OCSF로 재매핑 필요                                       │
│                                                                                  │
│  = 마이그레이션 악몽, 고객 데이터 이식성 제로                                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### OCSF 선택 이유

| 비교 항목 | ECS | OCSF |
|-----------|-----|------|
| **거버넌스** | Elastic 단독 | Linux Foundation (18개+ 벤더) |
| **이식성** | Elasticsearch/OpenSearch 전용 | 모든 플랫폼 |
| **업계 채택** | Elastic 생태계만 | AWS, Splunk, IBM, CrowdStrike, Palo Alto... |
| **미래 보장** | 벤더 의존적 | 오픈 표준 |
| **데이터 교환** | 어려움 | 교환 목적 설계 |

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Why OCSF for Seekurity SIEM                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. 벤더 독립성                                                                  │
│  ───────────────                                                                │
│  • Linux Foundation 프로젝트 (중립적 거버넌스)                                   │
│  • 18개+ 창립 멤버 (AWS, Splunk, IBM, CrowdStrike...)                           │
│  • 단일 기업이 스키마를 통제하지 않음                                            │
│                                                                                  │
│  2. 업계 모멘텀                                                                  │
│  ──────────────                                                                 │
│  • AWS Security Lake = OCSF 네이티브                                            │
│  • Splunk OCSF 채택 (2024+)                                                     │
│  • CrowdStrike OCSF 출력 지원                                                   │
│  • Palo Alto OCSF 내보내기 지원                                                 │
│  • IBM QRadar OCSF 연동 (2024)                                                  │
│                                                                                  │
│  3. 데이터 이식성                                                                │
│  ────────────────                                                               │
│  • 고객이 OCSF 형식으로 데이터 내보내기 가능                                     │
│  • 모든 OCSF 호환 SIEM으로 가져오기 가능                                         │
│  • 벤더 종속 없음 = 경쟁 우위                                                    │
│                                                                                  │
│  4. Seekurity SIEM 차별화                                                        │
│  ────────────────────────                                                       │
│  • "OCSF 네이티브 SIEM" = 마케팅 우위                                           │
│  • "벤더 종속 없음" = 고객 신뢰                                                  │
│  • "AWS Security Lake 호환" = 엔터프라이즈 어필                                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 OCSF-First 계층적 정규화 모델

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    OCSF-First Normalization Model (권장)                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Layer 1: 원본 보존 (Vendor Preservation) - 필수                                │
│  ───────────────────────────────────────────────                                │
│  Fields:                                                                         │
│    vendor.name              "Palo Alto"                                         │
│    vendor.product           "NGFW"                                              │
│    vendor.version           "10.2"                                              │
│    original.event_id        "THREAT,vulnerability"                              │
│    original.event_name      "Vulnerability Attack Detected"                     │
│    original.severity        "high"                                              │
│    raw_message              "<전체 원본 로그>"                                   │
│                                                                                  │
│  Purpose: 포렌식, 벤더 지원, 상세 분석                                          │
│                                                                                  │
│  Layer 2: OCSF (Primary Standard) ← 핵심 표준                                   │
│  ────────────────────────────────────────────                                   │
│  Fields:                                                                         │
│    class_uid                2001                                                │
│    class_name               "Security Finding"                                  │
│    category_uid             2                                                   │
│    category_name            "Findings"                                          │
│    type_uid                 200101                                              │
│    activity_id              1                                                   │
│    activity_name            "Create"                                            │
│    severity_id              3                                                   │
│    status_id                1                                                   │
│    src_endpoint.*           소스 엔드포인트                                      │
│    dst_endpoint.*           목적지 엔드포인트                                    │
│    actor.*                  행위자 정보                                          │
│    device.*                 장비 정보                                           │
│    metadata.*               메타데이터                                          │
│                                                                                  │
│  Purpose: 표준화된 쿼리, 플랫폼 간 호환, 데이터 이식성                           │
│                                                                                  │
│  Layer 3: Flattened Search Fields (OpenSearch 최적화)                           │
│  ────────────────────────────────────────────────────                           │
│  Fields (OCSF에서 파생):                                                         │
│    src_ip                   ← src_endpoint.ip                                   │
│    dst_ip                   ← dst_endpoint.ip                                   │
│    src_port                 ← src_endpoint.port                                 │
│    dst_port                 ← dst_endpoint.port                                 │
│    user_name                ← actor.user.name                                   │
│    host_name                ← device.hostname                                   │
│                                                                                  │
│  Purpose: OpenSearch 쿼리 성능 최적화 (별도 스키마 아님, 복사본)                 │
│                                                                                  │
│  Layer 4: 내부 분류 (Custom Taxonomy) - 한국 특화                               │
│  ────────────────────────────────────────────────                               │
│  Fields:                                                                         │
│    internal.category        "security_threat"                                   │
│    internal.subcategory     "exploit_attempt"                                   │
│    internal.priority        "high"                                              │
│    internal.compliance      ["ISMS-P", "개인정보보호법", "전자금융감독규정"]     │
│    internal.asset_group     "critical_servers"                                  │
│    internal.business_unit   "finance"                                           │
│                                                                                  │
│  Purpose: 조직 특화 분류, 한국 규정 대응, 비즈니스 컨텍스트                      │
│                                                                                  │
│  Layer 5: 위협 인텔리전스 (Threat Context)                                      │
│  ────────────────────────────────────────                                       │
│  Fields:                                                                         │
│    threat.mitre.tactic      ["TA0001"]                                          │
│    threat.mitre.technique   ["T1190"]                                           │
│    threat.kill_chain        "exploitation"                                      │
│    threat.confidence        0.85                                                │
│    threat.ioc_match         true                                                │
│    threat.campaign          "APT29"                                             │
│                                                                                  │
│  Purpose: 위협 헌팅, 커버리지 분석, TI 연동                                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 OCSF OpenSearch Index Mapping

```json
{
  "mappings": {
    "properties": {
      // OCSF Core Fields (Primary)
      "class_uid": { "type": "integer" },
      "class_name": { "type": "keyword" },
      "category_uid": { "type": "integer" },
      "category_name": { "type": "keyword" },
      "type_uid": { "type": "long" },
      "type_name": { "type": "keyword" },
      "activity_id": { "type": "integer" },
      "activity_name": { "type": "keyword" },
      "severity_id": { "type": "integer" },
      "status_id": { "type": "integer" },
      "time": { "type": "date" },

      // OCSF Objects
      "src_endpoint": {
        "properties": {
          "ip": { "type": "ip" },
          "port": { "type": "integer" },
          "hostname": { "type": "keyword" },
          "mac": { "type": "keyword" }
        }
      },
      "dst_endpoint": {
        "properties": {
          "ip": { "type": "ip" },
          "port": { "type": "integer" },
          "hostname": { "type": "keyword" }
        }
      },
      "actor": {
        "properties": {
          "user": {
            "properties": {
              "name": { "type": "keyword" },
              "uid": { "type": "keyword" },
              "domain": { "type": "keyword" }
            }
          },
          "process": {
            "properties": {
              "name": { "type": "keyword" },
              "pid": { "type": "integer" }
            }
          }
        }
      },
      "device": {
        "properties": {
          "hostname": { "type": "keyword" },
          "ip": { "type": "ip" },
          "os": {
            "properties": {
              "name": { "type": "keyword" },
              "type": { "type": "keyword" }
            }
          }
        }
      },

      // Flattened for fast search (derived from OCSF)
      "src_ip": { "type": "ip" },
      "dst_ip": { "type": "ip" },
      "src_port": { "type": "integer" },
      "dst_port": { "type": "integer" },
      "user_name": { "type": "keyword" },
      "host_name": { "type": "keyword" },

      // Original preservation
      "vendor": {
        "properties": {
          "name": { "type": "keyword" },
          "product": { "type": "keyword" },
          "version": { "type": "keyword" }
        }
      },
      "original": {
        "properties": {
          "event_id": { "type": "keyword" },
          "event_name": { "type": "keyword" }
        }
      },
      "unmapped": { "type": "object", "enabled": false },
      "raw_message": { "type": "text", "index": false },

      // Internal taxonomy
      "internal": {
        "properties": {
          "category": { "type": "keyword" },
          "subcategory": { "type": "keyword" },
          "priority": { "type": "keyword" },
          "compliance": { "type": "keyword" }
        }
      },

      // Threat context
      "threat": {
        "properties": {
          "mitre": {
            "properties": {
              "tactic": { "type": "keyword" },
              "technique": { "type": "keyword" }
            }
          }
        }
      }
    }
  }
}
```

### 6.4 OCSF Class Quick Reference

| Class UID | Class Name | 용도 | 예시 |
|-----------|------------|------|------|
| **1001** | File System Activity | 파일 활동 | 파일 생성/수정/삭제 |
| **1007** | Process Activity | 프로세스 | 프로세스 시작/종료 |
| **2001** | Security Finding | 보안 탐지 | IDS 경고, 악성코드 탐지 |
| **2002** | Vulnerability Finding | 취약점 | 취약점 스캔 결과 |
| **3001** | Account Change | 계정 변경 | 사용자 생성/수정/삭제 |
| **3002** | Authentication | 인증 | 로그인/로그아웃 |
| **3005** | User Access Management | 접근 관리 | 권한 변경 |
| **4001** | Network Activity | 네트워크 | 방화벽 Allow/Deny |
| **4002** | HTTP Activity | HTTP | 웹 트래픽 |
| **4003** | DNS Activity | DNS | DNS 쿼리/응답 |
| **6003** | API Activity | API | API 호출 |

### 6.5 OCSF Activity ID Reference

| Activity ID | Name | 설명 |
|-------------|------|------|
| 0 | Unknown | 알 수 없음 |
| 1 | Create | 생성 |
| 2 | Read | 읽기 |
| 3 | Update | 수정 |
| 4 | Delete | 삭제 |
| 5 | Allow | 허용 |
| 6 | Deny / Refuse | 거부 |
| 99 | Other | 기타 |

### 6.6 OCSF 매핑 테이블 구조 (ECS 제외)

```yaml
# ocsf_normalization_mapping.yaml
# ECS 제거 - OCSF만 사용

mappings:
  # Palo Alto NGFW
  - vendor: "Palo Alto"
    product: "NGFW"
    version_pattern: "10.*"

    events:
      - original_id: "THREAT,vulnerability"
        ocsf:
          class_uid: 2001
          class_name: "Security Finding"
          category_uid: 2
          category_name: "Findings"
          type_uid: 200101
          type_name: "Create"
          activity_id: 1
          activity_name: "Create"
          severity_id: 3
        internal:
          category: "security_threat"
          subcategory: "exploit_attempt"
          priority: "high"
          compliance: ["ISMS-P", "전자금융감독규정"]
        mitre:
          tactic: ["TA0001"]
          technique: ["T1190"]

      - original_id: "TRAFFIC,deny"
        ocsf:
          class_uid: 4001
          class_name: "Network Activity"
          category_uid: 4
          category_name: "Network Activity"
          type_uid: 400106
          type_name: "Refuse"
          activity_id: 6
          activity_name: "Refuse"
          severity_id: 2
        internal:
          category: "network_traffic"
          subcategory: "blocked"
          compliance: ["ISMS-P"]

      - original_id: "TRAFFIC,allow"
        ocsf:
          class_uid: 4001
          type_uid: 400105
          activity_id: 5
          activity_name: "Allow"
          severity_id: 1
        internal:
          category: "network_traffic"
          subcategory: "allowed"

  # Fortinet FortiGate
  - vendor: "Fortinet"
    product: "FortiGate"
    events:
      - original_id: "utm:ips"
        ocsf:
          class_uid: 2001
          category_uid: 2
          type_uid: 200101
          activity_id: 1
          severity_id: 3
        internal:
          category: "security_threat"
          subcategory: "ips_detection"
          priority: "high"
        mitre:
          technique: ["T1190", "T1203"]

      - original_id: "traffic:forward"
        ocsf:
          class_uid: 4001
          type_uid: 400101
          activity_id: 1
        internal:
          category: "network_traffic"
          subcategory: "forwarded"

  # Windows Security Event Log
  - vendor: "Microsoft"
    product: "Windows"
    events:
      - original_id: "4625"
        ocsf:
          class_uid: 3002
          class_name: "Authentication"
          category_uid: 3
          category_name: "Identity & Access Management"
          type_uid: 300202
          activity_id: 2
          activity_name: "Logon Failed"
          severity_id: 2
        internal:
          category: "authentication"
          subcategory: "login_failure"
          compliance: ["ISMS-P", "개인정보보호법"]
        mitre:
          tactic: ["TA0006"]
          technique: ["T1110"]

      - original_id: "4624"
        ocsf:
          class_uid: 3002
          type_uid: 300201
          activity_id: 1
          activity_name: "Logon"
          severity_id: 1
        internal:
          category: "authentication"
          subcategory: "login_success"
          compliance: ["ISMS-P"]

      - original_id: "4720"
        ocsf:
          class_uid: 3001
          class_name: "Account Change"
          type_uid: 300101
          activity_id: 1
          activity_name: "Create"
          severity_id: 2
        internal:
          category: "user_management"
          subcategory: "user_created"
          compliance: ["ISMS-P", "개인정보보호법"]

  # Linux Audit
  - vendor: "Linux"
    product: "auditd"
    events:
      - original_id: "USER_LOGIN"
        ocsf:
          class_uid: 3002
          type_uid: 300201
          activity_id: 1
          severity_id: 1
        internal:
          category: "authentication"
          subcategory: "login_success"

      - original_id: "EXECVE"
        ocsf:
          class_uid: 1007
          class_name: "Process Activity"
          type_uid: 100701
          activity_id: 1
          activity_name: "Launch"
          severity_id: 1
        internal:
          category: "process_activity"
          subcategory: "process_start"

# Fallback mappings (원본 ID 매핑 없을 때)
fallback:
  - pattern: "deny|block|drop|reject"
    ocsf:
      class_uid: 4001
      activity_id: 6
    internal:
      category: "network_traffic"
      subcategory: "blocked"

  - pattern: "allow|accept|permit|pass"
    ocsf:
      class_uid: 4001
      activity_id: 5
    internal:
      category: "network_traffic"
      subcategory: "allowed"

  - pattern: "login|auth|logon|signin"
    ocsf:
      class_uid: 3002
      activity_id: 1
    internal:
      category: "authentication"

  - pattern: "logout|logoff|signout"
    ocsf:
      class_uid: 3002
      activity_id: 3
    internal:
      category: "authentication"
      subcategory: "logout"

  - pattern: "malware|virus|trojan|ransomware"
    ocsf:
      class_uid: 2001
      category_uid: 2
      severity_id: 4
    internal:
      category: "malware"
      priority: "critical"
```

### 6.7 OCSF 정규화 파이프라인 구현

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    OCSF-First Normalization Pipeline                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Stage 1: Ingest (수집)                                                         │
│  ──────────────────────                                                         │
│  ┌──────────┐                                                                   │
│  │ Raw Log  │──▶ Source ID ──▶ Parse ──▶ Extract Fields                        │
│  └──────────┘                                                                   │
│       │                                                                         │
│       ▼                                                                         │
│  Output: vendor.*, original.*, raw_message, base fields                         │
│                                                                                  │
│  Stage 2: OCSF Normalize (정규화)                                               │
│  ────────────────────────────────                                               │
│  ┌──────────────┐                                                               │
│  │ Parsed Event │──▶ Lookup Mapping ──▶ Apply OCSF ──▶ Internal Taxonomy       │
│  └──────────────┘                                                               │
│       │                    │                                                    │
│       │                    ▼                                                    │
│       │          No Match? ──▶ Fallback Mapping ──▶ "unknown" category         │
│       │                                                                         │
│       ▼                                                                         │
│  Output: class_uid, category_uid, type_uid, activity_id, internal.*             │
│                                                                                  │
│  Stage 3: Flatten for Search (검색 최적화)                                      │
│  ─────────────────────────────────────────                                      │
│  ┌──────────────────┐                                                           │
│  │ OCSF Event      │──▶ Copy src_endpoint.ip → src_ip                          │
│  │                  │──▶ Copy dst_endpoint.ip → dst_ip                          │
│  │                  │──▶ Copy actor.user.name → user_name                       │
│  └──────────────────┘                                                           │
│       │                                                                         │
│       ▼                                                                         │
│  Output: src_ip, dst_ip, src_port, dst_port, user_name (flattened)              │
│                                                                                  │
│  Stage 4: Enrich (보강)                                                         │
│  ──────────────────────                                                         │
│  ┌──────────────────┐                                                           │
│  │ Normalized Event │──▶ GeoIP ──▶ Asset DB ──▶ TI Lookup ──▶ MITRE Mapping    │
│  └──────────────────┘                                                           │
│       │                                                                         │
│       ▼                                                                         │
│  Output: threat.*, geo.*, asset.*, enriched = true                              │
│                                                                                  │
│  Stage 5: Index (저장)                                                          │
│  ─────────────────────                                                          │
│  ┌──────────────┐                                                               │
│  │ Final Event  │──▶ Validation ──▶ Index Router ──▶ Storage                   │
│  └──────────────┘                                                               │
│       │                                │                                        │
│       │                                ▼                                        │
│       │                    Hot (7일) / Warm (30일) / Cold (1년)                 │
│       │                                                                         │
│       ▼                                                                         │
│  Metrics: parse_success_rate, normalize_rate, enrich_rate                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. OCSF 쿼리 패턴

### 7.1 시나리오: "모든 소스에서 Brute Force 탐지"

```sql
-- OCSF OpenSearch Query (권장)
GET security-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "class_uid": 3002 } },
        { "term": { "activity_id": 2 } }
      ],
      "filter": {
        "range": { "time": { "gte": "now-1h" } }
      }
    }
  },
  "aggs": {
    "by_user_src": {
      "composite": {
        "sources": [
          { "user": { "terms": { "field": "user_name" } } },
          { "src": { "terms": { "field": "src_ip" } } }
        ]
      }
    }
  }
}

-- OCSF SQL (OpenSearch SQL Plugin)
SELECT
  user_name,
  src_ip,
  COUNT(*) as failure_count
FROM security-*
WHERE class_uid = 3002          -- Authentication
  AND activity_id = 2           -- Logon Failed
  AND time >= NOW() - INTERVAL 1 HOUR
GROUP BY user_name, src_ip
HAVING COUNT(*) > 5
ORDER BY failure_count DESC

-- 비교: 다른 플랫폼
-- QRadar: WHERE qid IN (3000001, 3000002, 3000003)  ← 숫자 QID 암기 필요
-- Splunk: | tstats from datamodel=Authentication    ← CIM 전용
-- ECS:    event.category: "authentication"          ← Elastic 전용
-- OCSF:   class_uid = 3002                          ← 표준, 모든 플랫폼
```

### 7.2 시나리오: "네트워크 차단 이벤트"

```json
// OCSF OpenSearch Query
GET firewall-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "class_uid": 4001 } },
        { "term": { "activity_id": 6 } }
      ]
    }
  },
  "aggs": {
    "top_blocked_src": {
      "terms": { "field": "src_ip", "size": 20 }
    },
    "top_blocked_dst_port": {
      "terms": { "field": "dst_port", "size": 10 }
    }
  }
}
```

### 7.3 시나리오: "특정 MITRE 기법 탐지 현황"

```sql
-- OCSF + MITRE 연계 (권장)
SELECT
  vendor.name AS vendor,
  original.event_id AS original_event,
  class_name AS ocsf_class,
  internal.category AS category,
  threat.mitre.technique AS techniques,
  COUNT(*) AS event_count
FROM events
WHERE 'T1190' = ANY(threat.mitre.technique)  -- Server-Side Exploitation
  AND time > NOW() - INTERVAL '24 hours'
GROUP BY vendor.name, original.event_id, class_name, internal.category, threat.mitre.technique
ORDER BY event_count DESC
```

### 7.4 시나리오: "보안 탐지 이벤트 (Findings)"

```json
// OCSF category_uid = 2 (모든 Finding 클래스)
GET security-*/_search
{
  "query": {
    "bool": {
      "must": [
        { "term": { "category_uid": 2 } },
        { "range": { "severity_id": { "gte": 3 } } }
      ]
    }
  },
  "aggs": {
    "by_class": {
      "terms": { "field": "class_name" }
    },
    "by_vendor": {
      "terms": { "field": "vendor.name" }
    }
  }
}
```

### 7.5 OCSF 쿼리 치트시트

| 시나리오 | OCSF Query |
|----------|------------|
| 로그인 실패 | `class_uid: 3002 AND activity_id: 2` |
| 로그인 성공 | `class_uid: 3002 AND activity_id: 1` |
| 네트워크 차단 | `class_uid: 4001 AND activity_id: 6` |
| 네트워크 허용 | `class_uid: 4001 AND activity_id: 5` |
| 모든 보안 탐지 | `category_uid: 2` |
| 악성코드 탐지 | `class_uid: 2001 AND severity_id >= 4` |
| 프로세스 실행 | `class_uid: 1007 AND activity_id: 1` |
| 파일 생성 | `class_uid: 1001 AND activity_id: 1` |
| 사용자 생성 | `class_uid: 3001 AND activity_id: 1` |
| 권한 변경 | `class_uid: 3005` |

---

## 8. 도입 로드맵

### 8.1 Phase별 구현 계획

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Implementation Roadmap                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Phase 1: Foundation (1-2개월)                                                  │
│  ─────────────────────────────                                                  │
│  □ 원본 보존 정책 수립 및 구현                                                   │
│  □ 기본 Internal Taxonomy 정의 (15-20개 카테고리)                               │
│  □ 상위 5개 Log Source Parser 개발                                              │
│  □ 기본 매핑 테이블 구축                                                         │
│  □ 정규화 파이프라인 프로토타입                                                  │
│                                                                                  │
│  Phase 2: Standardization (2-3개월)                                             │
│  ──────────────────────────────────                                             │
│  □ OCSF 스키마 적용 (Category 2, 3, 4 우선)                                     │
│  □ ECS 보조 필드 추가                                                           │
│  □ 상위 80% 이벤트 매핑 완료                                                     │
│  □ 탐지 규칙 표준 필드 전환 (신규 규칙)                                          │
│  □ 대시보드 표준 필드 전환                                                       │
│                                                                                  │
│  Phase 3: Intelligence (3-4개월)                                                │
│  ─────────────────────────────────                                              │
│  □ MITRE ATT&CK 전체 매핑                                                        │
│  □ Threat Intelligence 연동                                                     │
│  □ 자동 매핑 도구 개발 (ML 기반 제안)                                           │
│  □ 커버리지 분석 대시보드                                                        │
│  □ 기존 규칙 마이그레이션                                                        │
│                                                                                  │
│  Phase 4: Optimization (지속)                                                   │
│  ────────────────────────────                                                   │
│  □ 매핑 품질 모니터링 (unmapped rate < 5%)                                      │
│  □ 신규 Log Source 자동 온보딩 프로세스                                          │
│  □ 매핑 테이블 버전 관리                                                         │
│  □ 성능 최적화                                                                  │
│  □ 정기 검토 및 업데이트                                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 성공 지표

| 지표 | 목표 | 측정 방법 |
|------|------|-----------|
| **Mapped Event Rate** | ≥ 95% | 정규화된 이벤트 / 전체 이벤트 |
| **Unknown Category Rate** | < 5% | internal.category = 'unknown' 비율 |
| **Parser Coverage** | ≥ 90% | 파싱 성공 이벤트 / 전체 이벤트 |
| **MITRE Coverage** | ≥ 70% | 매핑된 Technique / 관련 전체 Technique |
| **Rule Migration** | 100% | 표준 필드 사용 규칙 / 전체 규칙 |
| **Query Performance** | < 5초 | 표준 필드 쿼리 평균 응답 시간 |

---

## 9. 참고 자료

### 9.1 표준 문서
- [OCSF Schema Browser](https://schema.ocsf.io/)
- [OCSF GitHub](https://github.com/ocsf)
- [Elastic Common Schema](https://www.elastic.co/guide/en/ecs/current/)
- [ECS event.category](https://www.elastic.co/guide/en/ecs/current/ecs-allowed-values-event-category.html)
- [ECS event.type](https://www.elastic.co/guide/en/ecs/current/ecs-allowed-values-event-type.html)
- [Splunk CIM](https://help.splunk.com/en/data-management/common-information-model/)
- [Microsoft ASIM](https://learn.microsoft.com/en-us/azure/sentinel/normalization)
- [Google Chronicle UDM](https://cloud.google.com/chronicle/docs/event-processing/udm-overview)

### 9.2 벤더 문서
- [IBM QRadar Event Mapping](https://www.ibm.com/docs/SS42VS_7.4/com.ibm.qradar.doc/c_qradar_adm_dsm_ed_eventmapping.html)
- [Sumo Logic Normalized Classification](https://help.sumologic.com/docs/cse/schema/cse-normalized-classification/)
- [AWS Security Lake OCSF](https://docs.aws.amazon.com/security-lake/latest/userguide/open-cybersecurity-schema-framework.html)

### 9.3 분석 자료
- [Get over SIEM event normalization](https://ateixei.medium.com/get-over-siem-event-normalization-595fc36559b4)
- [Cybersecurity Event Data Normalization Standards](https://www.query.ai/resources/blogs/cybersecurity-event-data-normalization-standards/)
- [SIEM Data Normalization](https://searchinform.com/articles/cybersecurity/measures/siem/analytics/siem-data-normalization/)

---

## 10. 결론: OCSF-First 전략 요약

### 10.1 핵심 원칙

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Seekurity SIEM: OCSF-First Principles                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ✅ DO (해야 할 것):                                                            │
│  ──────────────────                                                             │
│  • OCSF를 Primary Standard로 사용                                               │
│  • 항상 raw_message 보존                                                        │
│  • 한국 규정 대응을 위한 Internal Taxonomy 구축                                  │
│  • 위협 헌팅을 위한 MITRE ATT&CK 매핑                                           │
│  • 15-20개의 실용적 카테고리 유지                                               │
│  • OpenSearch 성능을 위한 Flattened 필드 사용                                    │
│                                                                                  │
│  ❌ DON'T (하지 말아야 할 것):                                                  │
│  ───────────────────────────                                                    │
│  • ECS를 핵심 스키마로 사용 (Elastic 벤더 종속)                                  │
│  • QRadar 스타일 숫자 QID (유지보수 어려움)                                      │
│  • 원본 데이터 폐기                                                             │
│  • 100개 이상의 과도한 카테고리                                                  │
│  • 100% 정규화 목표 (불가능, 95%가 현실적)                                       │
│                                                                                  │
│  📊 목표 지표:                                                                   │
│  ─────────────                                                                  │
│  • Mapped Event Rate: ≥ 95%                                                     │
│  • Unknown Category: < 5%                                                       │
│  • MITRE Coverage: ≥ 70%                                                        │
│  • Query Performance: < 5초 (24시간 쿼리)                                       │
│                                                                                  │
│  🎯 마케팅 포지셔닝:                                                            │
│  ───────────────────                                                            │
│  "Seekurity SIEM - 한국 최초 OCSF 네이티브 SIEM"                                │
│  "벤더 종속 없음, AWS Security Lake 호환"                                       │
│  "데이터 이식성 보장, 오픈 표준 기반"                                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 ECS vs OCSF 최종 비교

| 비교 항목 | ECS | OCSF | 선택 |
|-----------|-----|------|------|
| 거버넌스 | Elastic 단독 | Linux Foundation | **OCSF** |
| 이식성 | Elasticsearch 전용 | 모든 플랫폼 | **OCSF** |
| 업계 채택 | Elastic 생태계 | AWS, Splunk, IBM... | **OCSF** |
| OpenSearch 성능 | 네이티브 | Flattened 필드 필요 | ECS (보완 가능) |
| 성숙도 | 8년 | 2년 | ECS (시간이 해결) |
| 미래 보장 | 벤더 의존 | 오픈 표준 | **OCSF** |

**결론**: OCSF를 Primary로, OpenSearch 성능은 Flattened 필드로 보완

---

## Appendix A: OCSF Complete Reference (v1.4.0)

> 공식 참조: [OCSF Schema Browser](https://schema.ocsf.io/) | [OCSF GitHub](https://github.com/ocsf/ocsf-schema)

### A.1 Categories (category_uid) 전체 목록

| category_uid | Category Name | 설명 | 주요 용도 |
|--------------|---------------|------|-----------|
| **1** | System Activity | 시스템 활동 | 파일, 프로세스, 메모리, 커널 활동 |
| **2** | Findings | 탐지 결과 | 보안 탐지, 취약점, 컴플라이언스 |
| **3** | Identity & Access Management | IAM | 인증, 계정, 권한 관리 |
| **4** | Network Activity | 네트워크 활동 | 방화벽, DNS, HTTP, 이메일 |
| **5** | Discovery | 탐색/인벤토리 | 자산, OS, 애플리케이션 인벤토리 |
| **6** | Application Activity | 애플리케이션 활동 | API, 웹, 데이터스토어 |
| **7** | Remediation | 대응/조치 | 격리, 삭제, 복구 |
| **8** | Unmanned Systems | 무인 시스템 | 드론, 로봇 (v1.4 신규) |

---

### A.2 Event Classes (class_uid) 전체 목록

#### Category 1: System Activity (시스템 활동)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **1001** | File System Activity | 파일 시스템 활동 | 파일 생성, 수정, 삭제, 이름 변경 |
| **1002** | Kernel Extension Activity | 커널 확장 | 드라이버/커널 모듈 로드/언로드 |
| **1003** | Kernel Activity | 커널 활동 | 시스템 콜, 커널 이벤트 |
| **1004** | Memory Activity | 메모리 활동 | 메모리 할당, 매핑, 보호 변경 |
| **1005** | Module Activity | 모듈 활동 | DLL/SO 로드, 언로드 |
| **1006** | Scheduled Job Activity | 스케줄 작업 | cron, Task Scheduler |
| **1007** | Process Activity | 프로세스 활동 | 프로세스 시작, 종료, 인젝션 |
| **1008** | Event Log Activity | 이벤트 로그 | 로그 클리어, 수정 |
| **1009** | Script Activity | 스크립트 실행 | PowerShell, Python, Bash 실행 |
| **1010** | Registry Key Activity | 레지스트리 키 | 키 생성, 삭제, 이름 변경 |
| **1011** | Registry Value Activity | 레지스트리 값 | 값 설정, 삭제 |

#### Category 2: Findings (탐지 결과)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **2001** | Security Finding | 보안 탐지 | IDS 경고, 악성코드 탐지, WAF 블록 |
| **2002** | Vulnerability Finding | 취약점 발견 | CVE 탐지, 취약점 스캔 결과 |
| **2003** | Compliance Finding | 컴플라이언스 | 규정 위반, 정책 불일치 |
| **2004** | Detection Finding | 탐지 결과 | SIEM 상관 규칙 탐지 |
| **2005** | Incident Finding | 인시던트 | 보안 사고, 침해 탐지 |
| **2006** | Data Security Finding | 데이터 보안 | DLP 탐지, 민감정보 노출 |

#### Category 3: Identity & Access Management (IAM)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **3001** | Account Change | 계정 변경 | 사용자 생성, 수정, 삭제, 잠금 |
| **3002** | Authentication | 인증 | 로그인, 로그아웃, MFA |
| **3003** | Authorize Session | 세션 인가 | 세션 생성, 토큰 발급 |
| **3004** | Entity Management | 엔티티 관리 | 서비스 계정, 머신 ID 관리 |
| **3005** | User Access Management | 접근 관리 | 권한 부여, 역할 변경 |
| **3006** | Group Management | 그룹 관리 | 그룹 생성, 멤버십 변경 |

#### Category 4: Network Activity (네트워크 활동)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **4001** | Network Activity | 일반 네트워크 | 방화벽 허용/거부, 세션 |
| **4002** | HTTP Activity | HTTP 트래픽 | 웹 요청/응답, WAF |
| **4003** | DNS Activity | DNS | DNS 쿼리, 응답, 캐시 |
| **4004** | DHCP Activity | DHCP | IP 할당, 임대, 해제 |
| **4005** | RDP Activity | 원격 데스크톱 | RDP 연결, 세션 |
| **4006** | SMB Activity | 파일 공유 | SMB 연결, 파일 접근 |
| **4007** | SSH Activity | SSH | SSH 연결, 명령 실행 |
| **4008** | FTP Activity | 파일 전송 | FTP 업로드, 다운로드 |
| **4009** | Email Activity | 이메일 | 메일 송수신, 스팸 필터 |
| **4010** | Network File Activity | 네트워크 파일 | NFS, CIFS 파일 접근 |
| **4011** | Email File Activity | 이메일 첨부 | 첨부파일 송수신 |
| **4012** | Email URL Activity | 이메일 URL | 이메일 내 URL 클릭 |
| **4013** | NTP Activity | 시간 동기화 | NTP 쿼리, 시간 변경 |
| **4014** | Tunnel Activity | 터널링 | VPN, SSH 터널, SOCKS |

#### Category 5: Discovery (탐색/인벤토리)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **5001** | Device Inventory Info | 장치 인벤토리 | 하드웨어 정보, 시리얼 |
| **5002** | OS Inventory Info | OS 인벤토리 | OS 버전, 패치 레벨 |
| **5003** | Application Inventory Info | 앱 인벤토리 | 설치된 소프트웨어 |
| **5004** | User Inventory Info | 사용자 인벤토리 | 사용자 계정 목록 |
| **5005** | Cloud Resource Inventory | 클라우드 리소스 | EC2, S3, VPC 정보 |
| **5006** | Network Interface Inventory | 네트워크 인터페이스 | NIC, IP, MAC 정보 |
| **5007** | Service Inventory Info | 서비스 인벤토리 | 실행 중인 서비스 |
| **5008** | Process Inventory Info | 프로세스 인벤토리 | 실행 중인 프로세스 |
| **5009** | Port Inventory Info | 포트 인벤토리 | 리스닝 포트 |
| **5010** | Container Inventory Info | 컨테이너 인벤토리 | Docker, Kubernetes |
| **5019** | Device Config State | 장치 설정 상태 | 설정 변경 탐지 |
| **5020** | Device Config Change | 장치 설정 변경 | 설정 수정 이력 |

#### Category 6: Application Activity (애플리케이션 활동)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **6001** | Web Resources Activity | 웹 리소스 | 웹 페이지 접근 |
| **6002** | Application Lifecycle | 앱 라이프사이클 | 앱 시작, 종료, 업데이트 |
| **6003** | API Activity | API 호출 | REST/GraphQL API 요청 |
| **6004** | Web Resource Access Activity | 웹 접근 | URL 접근, 다운로드 |
| **6005** | Datastore Activity | 데이터스토어 | DB 쿼리, 트랜잭션 |
| **6006** | File Hosting Activity | 파일 호스팅 | 클라우드 스토리지 접근 |
| **6007** | Scan Activity | 스캔 | 취약점 스캔, 자산 스캔 |
| **6008** | Application Error | 앱 오류 | 예외, 크래시, 오류 로그 |

#### Category 7: Remediation (대응/조치)

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **7001** | Remediation Activity | 일반 대응 | 자동화된 대응 조치 |
| **7002** | File Remediation Activity | 파일 대응 | 파일 격리, 삭제, 복구 |
| **7003** | Process Remediation Activity | 프로세스 대응 | 프로세스 종료, 차단 |
| **7004** | Network Remediation Activity | 네트워크 대응 | IP 차단, 연결 종료 |

#### Category 8: Unmanned Systems (무인 시스템) - v1.4 신규

| class_uid | Class Name | 설명 | 예시 이벤트 |
|-----------|------------|------|-------------|
| **8001** | Drone Flights Activity | 드론 비행 | 비행 경로, 제어 이벤트 |
| **8002** | Airborne Broadcast | 항공 브로드캐스트 | ADS-B 신호 |

---

### A.3 Activity ID (activity_id) 전체 목록

#### 공통 Activity ID (모든 클래스)

| activity_id | Activity Name | 설명 | 사용 예시 |
|-------------|---------------|------|-----------|
| **0** | Unknown | 알 수 없음 | 매핑 불가 이벤트 |
| **1** | Create | 생성 | 파일/계정/프로세스 생성 |
| **2** | Read | 읽기 | 파일 읽기, 데이터 조회 |
| **3** | Update | 수정 | 파일/계정/설정 수정 |
| **4** | Delete | 삭제 | 파일/계정/레코드 삭제 |
| **5** | Allow | 허용 | 방화벽 허용, 접근 승인 |
| **6** | Deny / Refuse | 거부 | 방화벽 차단, 접근 거부 |
| **99** | Other | 기타 | 분류 불가 활동 |

#### Authentication (class_uid: 3002) 전용 Activity

| activity_id | Activity Name | 설명 |
|-------------|---------------|------|
| **1** | Logon | 로그인 성공 |
| **2** | Logoff | 로그아웃 |
| **3** | Authentication Ticket | 티켓 발급 (Kerberos) |
| **4** | Service Ticket Request | 서비스 티켓 요청 |
| **5** | Service Ticket Renew | 서비스 티켓 갱신 |
| **6** | Preauth | 사전 인증 |

#### File System Activity (class_uid: 1001) 전용 Activity

| activity_id | Activity Name | 설명 |
|-------------|---------------|------|
| **1** | Create | 파일 생성 |
| **2** | Read | 파일 읽기 |
| **3** | Update | 파일 수정 |
| **4** | Delete | 파일 삭제 |
| **5** | Rename | 파일 이름 변경 |
| **6** | Set Attributes | 속성 변경 |
| **7** | Set Security | 권한 변경 |
| **8** | Get Attributes | 속성 조회 |
| **9** | Get Security | 권한 조회 |
| **10** | Encrypt | 암호화 |
| **11** | Decrypt | 복호화 |
| **12** | Mount | 마운트 |
| **13** | Unmount | 언마운트 |
| **14** | Open | 파일 열기 |
| **15** | Close | 파일 닫기 |

#### Process Activity (class_uid: 1007) 전용 Activity

| activity_id | Activity Name | 설명 |
|-------------|---------------|------|
| **1** | Launch | 프로세스 시작 |
| **2** | Terminate | 프로세스 종료 |
| **3** | Open | 프로세스 열기 (핸들) |
| **4** | Inject | 코드 인젝션 |
| **5** | Set User ID | UID 변경 |

#### Network Activity (class_uid: 4001) 전용 Activity

| activity_id | Activity Name | 설명 |
|-------------|---------------|------|
| **1** | Open | 연결 열기 |
| **2** | Close | 연결 닫기 |
| **3** | Reset | 연결 리셋 |
| **4** | Fail | 연결 실패 |
| **5** | Allow | 트래픽 허용 |
| **6** | Refuse | 트래픽 거부 |
| **7** | Traffic | 일반 트래픽 |

#### DNS Activity (class_uid: 4003) 전용 Activity

| activity_id | Activity Name | 설명 |
|-------------|---------------|------|
| **1** | Query | DNS 쿼리 |
| **2** | Response | DNS 응답 |
| **3** | Update | DNS 레코드 업데이트 |
| **4** | Transfer | Zone 전송 |

---

### A.4 Severity ID (severity_id) 전체 목록

| severity_id | Severity | 설명 | 사용 기준 |
|-------------|----------|------|-----------|
| **0** | Unknown | 알 수 없음 | 심각도 정보 없음 |
| **1** | Informational | 정보성 | 정상 활동, 참고용 |
| **2** | Low | 낮음 | 주의 필요, 즉시 대응 불필요 |
| **3** | Medium | 중간 | 검토 필요, 잠재적 위협 |
| **4** | High | 높음 | 빠른 대응 필요, 실제 위협 |
| **5** | Critical | 치명적 | 즉시 대응, 심각한 침해 |
| **6** | Fatal | 치명적(시스템) | 시스템 장애 수준 |

#### Severity 매핑 가이드

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Severity Mapping Guide                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  벤더별 Severity → OCSF severity_id 변환:                                        │
│                                                                                  │
│  Palo Alto:                                                                      │
│    informational → 1    low → 2    medium → 3    high → 4    critical → 5       │
│                                                                                  │
│  FortiGate:                                                                      │
│    notice → 1    warning → 2    error → 3    critical → 4    emergency → 5      │
│                                                                                  │
│  Windows Event:                                                                  │
│    Information → 1    Warning → 2    Error → 3    Critical → 5                  │
│                                                                                  │
│  Syslog Priority:                                                                │
│    debug/info → 1    notice → 2    warning → 3    error → 4                     │
│    critical/alert → 5    emergency → 6                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

### A.5 Status ID (status_id) 전체 목록

| status_id | Status | 설명 | 사용 예시 |
|-----------|--------|------|-----------|
| **0** | Unknown | 알 수 없음 | 상태 정보 없음 |
| **1** | Success | 성공 | 작업 완료, 인증 성공 |
| **2** | Failure | 실패 | 작업 실패, 인증 실패 |
| **99** | Other | 기타 | 부분 성공, 보류 등 |

#### 세부 Status Code

| status_code | 의미 | 적용 클래스 |
|-------------|------|-------------|
| `NOERROR` | DNS 성공 | DNS Activity |
| `NXDOMAIN` | 도메인 없음 | DNS Activity |
| `SERVFAIL` | 서버 오류 | DNS Activity |
| `REFUSED` | 쿼리 거부 | DNS Activity |
| `200-299` | HTTP 성공 | HTTP Activity |
| `400-499` | 클라이언트 오류 | HTTP Activity |
| `500-599` | 서버 오류 | HTTP Activity |
| `0x0` | 성공 | Windows Event |
| `0xC000006D` | 로그인 실패 | Windows Event |

---

### A.6 Disposition ID (disposition_id) 전체 목록

| disposition_id | Disposition | 설명 | 사용 예시 |
|----------------|-------------|------|-----------|
| **0** | Unknown | 알 수 없음 | 처분 정보 없음 |
| **1** | Allowed | 허용됨 | 정책에 의해 허용 |
| **2** | Blocked | 차단됨 | 정책에 의해 차단 |
| **3** | Quarantined | 격리됨 | 악성코드 격리 |
| **4** | Isolated | 격리됨 (네트워크) | 네트워크 격리 |
| **5** | Deleted | 삭제됨 | 파일/레코드 삭제 |
| **6** | Dropped | 드랍됨 | 패킷 드랍 |
| **7** | Custom Action | 사용자 정의 조치 | 커스텀 자동화 |
| **8** | Approved | 승인됨 | 관리자 승인 |
| **9** | Restored | 복구됨 | 격리에서 복구 |
| **10** | Exonerated | 무혐의 | 오탐 판정 |
| **11** | Corrected | 교정됨 | 취약점 패치 |
| **12** | Partially Corrected | 부분 교정 | 일부 패치 |
| **13** | Uncorrected | 미교정 | 패치 미적용 |
| **14** | Delayed | 지연됨 | 대응 보류 |
| **15** | Detected | 탐지됨 | 탐지만, 조치 없음 |
| **16** | No Action | 조치 없음 | 의도적 미조치 |
| **17** | Logged | 기록됨 | 로깅만 수행 |
| **18** | Tagged | 태깅됨 | 마킹/태깅 |
| **19** | Alert | 경고 발생 | 알림 생성 |
| **20** | Count | 카운트 | 카운터 증가만 |
| **21** | Reset | 리셋 | 연결 리셋 |
| **22** | Captcha | CAPTCHA | 챌린지 요구 |
| **23** | Challenge | 챌린지 | 추가 인증 요구 |
| **24** | Access Revoked | 접근 취소 | 권한 회수 |
| **25** | Session Terminated | 세션 종료 | 강제 로그아웃 |
| **99** | Other | 기타 | 분류 불가 |

---

### A.7 Type UID (type_uid) 구조

Type UID는 Class UID와 Activity ID의 조합으로 계산됩니다:

```
type_uid = (class_uid × 100) + activity_id

예시:
- Network Activity (4001) + Deny (6) = 400106
- Authentication (3002) + Logon (1) = 300201
- File System Activity (1001) + Create (1) = 100101
- Security Finding (2001) + Create (1) = 200101
```

#### 주요 Type UID 참조표

| type_uid | Class | Activity | 의미 |
|----------|-------|----------|------|
| **100101** | File System Activity | Create | 파일 생성 |
| **100102** | File System Activity | Read | 파일 읽기 |
| **100103** | File System Activity | Update | 파일 수정 |
| **100104** | File System Activity | Delete | 파일 삭제 |
| **100105** | File System Activity | Rename | 파일 이름 변경 |
| **100701** | Process Activity | Launch | 프로세스 시작 |
| **100702** | Process Activity | Terminate | 프로세스 종료 |
| **100704** | Process Activity | Inject | 코드 인젝션 |
| **200101** | Security Finding | Create | 보안 탐지 생성 |
| **200201** | Vulnerability Finding | Create | 취약점 발견 |
| **300101** | Account Change | Create | 계정 생성 |
| **300103** | Account Change | Update | 계정 수정 |
| **300104** | Account Change | Delete | 계정 삭제 |
| **300201** | Authentication | Logon | 로그인 |
| **300202** | Authentication | Logoff | 로그아웃 |
| **300501** | User Access | Create | 권한 부여 |
| **300504** | User Access | Delete | 권한 제거 |
| **400101** | Network Activity | Open | 연결 열기 |
| **400102** | Network Activity | Close | 연결 닫기 |
| **400105** | Network Activity | Allow | 트래픽 허용 |
| **400106** | Network Activity | Refuse | 트래픽 거부 |
| **400301** | DNS Activity | Query | DNS 쿼리 |
| **400302** | DNS Activity | Response | DNS 응답 |
| **600301** | API Activity | Create | API 호출 (생성) |
| **600302** | API Activity | Read | API 호출 (조회) |

---

### A.8 OCSF Objects (공통 객체) 참조

#### A.8.1 Endpoint Object

```json
{
  "endpoint": {
    "uid": "string",              // 고유 ID
    "name": "string",             // 호스트명
    "hostname": "string",         // FQDN
    "ip": "ip_address",           // IP 주소
    "port": "integer",            // 포트 번호
    "mac": "string",              // MAC 주소
    "domain": "string",           // 도메인
    "type": "string",             // 장치 유형
    "type_id": "integer",         // 장치 유형 ID
    "os": {                       // OS 정보
      "name": "string",
      "type": "string",
      "type_id": "integer",
      "version": "string",
      "build": "string"
    },
    "location": {                 // 위치 정보
      "city": "string",
      "country": "string",
      "lat": "float",
      "long": "float"
    }
  }
}
```

#### A.8.2 User Object

```json
{
  "user": {
    "uid": "string",              // 사용자 UID
    "uuid": "string",             // 고유 UUID
    "name": "string",             // 사용자명
    "type": "string",             // 사용자 유형
    "type_id": "integer",         // 0=Unknown, 1=User, 2=Admin, 3=System, 4=Service
    "account": {
      "uid": "string",
      "name": "string",
      "type": "string",
      "type_id": "integer"
    },
    "credential_uid": "string",   // 인증정보 ID
    "domain": "string",           // 도메인
    "email_addr": "string",       // 이메일
    "full_name": "string",        // 전체 이름
    "groups": [                   // 그룹 목록
      {
        "uid": "string",
        "name": "string",
        "type": "string"
      }
    ],
    "org": {                      // 조직 정보
      "uid": "string",
      "name": "string"
    }
  }
}
```

#### A.8.3 Process Object

```json
{
  "process": {
    "uid": "string",              // 프로세스 고유 ID
    "pid": "integer",             // 프로세스 ID
    "name": "string",             // 프로세스 이름
    "cmd_line": "string",         // 명령줄
    "created_time": "timestamp",  // 생성 시간
    "file": {                     // 실행 파일
      "name": "string",
      "path": "string",
      "hashes": [
        {
          "algorithm": "MD5|SHA1|SHA256",
          "value": "string"
        }
      ]
    },
    "user": { },                  // 실행 사용자
    "parent_process": {           // 부모 프로세스
      "pid": "integer",
      "name": "string",
      "cmd_line": "string"
    },
    "integrity": "string",        // 무결성 레벨
    "integrity_id": "integer",    // 0-6
    "lineage": ["string"],        // 프로세스 체인
    "session": {                  // 세션 정보
      "uid": "string",
      "is_remote": "boolean"
    },
    "container": {                // 컨테이너 정보
      "uid": "string",
      "name": "string",
      "image": {
        "name": "string",
        "uid": "string"
      }
    }
  }
}
```

#### A.8.4 File Object

```json
{
  "file": {
    "uid": "string",              // 파일 고유 ID
    "name": "string",             // 파일명
    "path": "string",             // 전체 경로
    "type": "string",             // 파일 유형
    "type_id": "integer",         // 0=Unknown, 1=Regular, 2=Folder, 3=Symlink...
    "size": "long",               // 파일 크기 (bytes)
    "created_time": "timestamp",  // 생성 시간
    "modified_time": "timestamp", // 수정 시간
    "accessed_time": "timestamp", // 접근 시간
    "hashes": [                   // 해시값
      {
        "algorithm": "MD5",
        "algorithm_id": 1,
        "value": "string"
      },
      {
        "algorithm": "SHA-1",
        "algorithm_id": 2,
        "value": "string"
      },
      {
        "algorithm": "SHA-256",
        "algorithm_id": 3,
        "value": "string"
      }
    ],
    "owner": {                    // 소유자
      "uid": "string",
      "name": "string"
    },
    "product": {                  // 제품 정보 (실행파일)
      "name": "string",
      "vendor_name": "string",
      "version": "string"
    },
    "signature": {                // 서명 정보
      "algorithm": "string",
      "certificate": {
        "issuer": "string",
        "subject": "string",
        "serial_number": "string"
      }
    },
    "mime_type": "string",        // MIME 타입
    "is_system": "boolean",       // 시스템 파일 여부
    "confidentiality": "string",  // 기밀성 레벨
    "confidentiality_id": "integer"
  }
}
```

#### A.8.5 Network Connection Object

```json
{
  "connection_info": {
    "uid": "string",              // 연결 ID
    "direction": "string",        // Inbound, Outbound, Lateral
    "direction_id": "integer",    // 0=Unknown, 1=Inbound, 2=Outbound, 3=Lateral
    "protocol_name": "string",    // TCP, UDP, ICMP
    "protocol_num": "integer",    // 6=TCP, 17=UDP, 1=ICMP
    "protocol_ver": "string",     // IPv4, IPv6
    "protocol_ver_id": "integer", // 4=IPv4, 6=IPv6
    "tcp_flags": "integer",       // TCP 플래그
    "boundary": "string",         // Internal, External, Unknown
    "boundary_id": "integer"      // 0=Unknown, 1=Internal, 2=External
  },
  "traffic": {
    "bytes": "long",              // 전체 바이트
    "bytes_in": "long",           // 수신 바이트
    "bytes_out": "long",          // 송신 바이트
    "packets": "long",            // 전체 패킷
    "packets_in": "long",         // 수신 패킷
    "packets_out": "long"         // 송신 패킷
  }
}
```

#### A.8.6 Metadata Object

```json
{
  "metadata": {
    "version": "1.4.0",           // OCSF 버전
    "product": {                  // 제품 정보
      "uid": "string",
      "name": "string",
      "vendor_name": "string",
      "version": "string",
      "feature": {
        "name": "string",
        "uid": "string"
      }
    },
    "profiles": ["string"],       // 적용된 프로파일
    "log_name": "string",         // 로그 이름
    "log_provider": "string",     // 로그 제공자
    "log_version": "string",      // 로그 버전
    "logged_time": "timestamp",   // 로깅 시간
    "modified_time": "timestamp", // 수정 시간
    "processed_time": "timestamp",// 처리 시간
    "sequence": "integer",        // 시퀀스 번호
    "original_time": "string",    // 원본 시간 (문자열)
    "labels": ["string"],         // 레이블
    "uid": "string",              // 고유 ID
    "correlation_uid": "string",  // 상관관계 ID
    "tenant_uid": "string"        // 테넌트 ID
  }
}
```

#### A.8.7 Observables Object

```json
{
  "observables": [
    {
      "name": "string",           // 이름 (예: "source_ip")
      "type": "string",           // IP Address, Domain, Hash...
      "type_id": "integer",       // 0-99
      "value": "string",          // 실제 값
      "reputation": {             // 평판 정보
        "score": "float",
        "score_id": "integer",    // 0=Unknown, 1=Very Safe, 10=Very Malicious
        "provider": "string"
      }
    }
  ]
}

// Observable Type ID
// 1: IP Address
// 2: MAC Address
// 3: Hostname
// 4: Domain
// 5: URL
// 6: File Name
// 7: File Hash
// 8: Process Name
// 9: User Name
// 10: Email Address
// 20: Resource UID
// 21: Endpoint
// 22: User
// 23: Device
// 99: Other
```

---

### A.9 OCSF Profiles (프로파일)

프로파일은 특정 도메인에 필요한 추가 속성을 정의합니다.

| Profile | 설명 | 추가되는 필드 |
|---------|------|---------------|
| **cloud** | 클라우드 환경 | cloud.provider, cloud.region, cloud.account |
| **container** | 컨테이너 환경 | container.uid, container.name, container.image |
| **datetime** | 시간 상세 | timezone, day_of_week |
| **host** | 호스트 상세 | host.*, device.* |
| **linux** | Linux 특화 | linux.* (SELinux, capabilities) |
| **network_proxy** | 프록시 환경 | proxy.ip, proxy.port |
| **security_control** | 보안 제어 | security_controls.*, attack.* |
| **windows** | Windows 특화 | win.* (SID, logon_type) |
| **malware** | 악성코드 | malware.name, malware.path, malware.hash |

#### Cloud Profile 상세

```json
{
  "cloud": {
    "provider": "string",         // AWS, Azure, GCP
    "account": {
      "uid": "string",            // 계정 ID
      "name": "string",
      "type": "string",
      "type_id": "integer"
    },
    "region": "string",           // 리전
    "zone": "string",             // 가용 영역
    "org": {
      "uid": "string",
      "name": "string"
    },
    "project_uid": "string"       // 프로젝트 ID
  }
}
```

---

### A.10 MITRE ATT&CK 매핑

OCSF는 MITRE ATT&CK 프레임워크와 통합됩니다.

```json
{
  "attack": {
    "tactic": {
      "uid": "TA0001",
      "name": "Initial Access"
    },
    "technique": {
      "uid": "T1190",
      "name": "Exploit Public-Facing Application"
    },
    "version": "14.0"
  }
}
```

#### 주요 Tactic → OCSF Class 매핑

| MITRE Tactic | Tactic ID | 관련 OCSF Class |
|--------------|-----------|-----------------|
| Initial Access | TA0001 | 4001, 4002, 4007, 3002 |
| Execution | TA0002 | 1007, 1009 |
| Persistence | TA0003 | 1001, 1010, 1006 |
| Privilege Escalation | TA0004 | 3001, 3005, 1007 |
| Defense Evasion | TA0005 | 1001, 1007, 1008 |
| Credential Access | TA0006 | 3002, 1001 |
| Discovery | TA0007 | 5001-5010, 4003 |
| Lateral Movement | TA0008 | 4005, 4006, 4007, 3002 |
| Collection | TA0009 | 1001, 4009, 4010 |
| Command and Control | TA0011 | 4001, 4003, 4014 |
| Exfiltration | TA0010 | 4001, 6006 |
| Impact | TA0040 | 1001, 2001 |

---

### A.11 OCSF 쿼리 패턴 Quick Reference

#### 카테고리별 기본 쿼리

```sql
-- Category 1: 시스템 활동 전체
SELECT * FROM events WHERE category_uid = 1

-- Category 2: 모든 보안 탐지
SELECT * FROM events WHERE category_uid = 2

-- Category 3: IAM 이벤트 전체
SELECT * FROM events WHERE category_uid = 3

-- Category 4: 네트워크 활동 전체
SELECT * FROM events WHERE category_uid = 4
```

#### 클래스별 상세 쿼리

```sql
-- 로그인 실패 (class_uid=3002, activity_id=2에서 status_id=2)
SELECT * FROM events
WHERE class_uid = 3002 AND status_id = 2

-- 방화벽 차단 (class_uid=4001, activity_id=6)
SELECT * FROM events
WHERE class_uid = 4001 AND activity_id = 6

-- 프로세스 시작 (class_uid=1007, activity_id=1)
SELECT * FROM events
WHERE class_uid = 1007 AND activity_id = 1

-- 파일 생성 (class_uid=1001, activity_id=1)
SELECT * FROM events
WHERE class_uid = 1001 AND activity_id = 1

-- 높은 심각도 보안 탐지 (severity_id >= 4)
SELECT * FROM events
WHERE category_uid = 2 AND severity_id >= 4
```

#### 복합 쿼리 예시

```sql
-- Brute Force 탐지 (1시간 내 동일 IP에서 5회 이상 로그인 실패)
SELECT src_ip, COUNT(*) as failures
FROM events
WHERE class_uid = 3002
  AND status_id = 2
  AND time >= NOW() - INTERVAL '1 hour'
GROUP BY src_ip
HAVING COUNT(*) >= 5

-- Lateral Movement 의심 (내부 → 내부 RDP/SSH)
SELECT src_ip, dst_ip, class_uid, COUNT(*) as connections
FROM events
WHERE class_uid IN (4005, 4007)
  AND connection_info.boundary_id = 1  -- Internal
  AND time >= NOW() - INTERVAL '24 hours'
GROUP BY src_ip, dst_ip, class_uid

-- 파일리스 공격 의심 (PowerShell/WScript 프로세스)
SELECT *
FROM events
WHERE class_uid = 1007
  AND activity_id = 1
  AND (
    process.name ILIKE '%powershell%'
    OR process.name ILIKE '%wscript%'
    OR process.name ILIKE '%cscript%'
  )
  AND time >= NOW() - INTERVAL '24 hours'
```

---

*최종 수정일: 2026-01-31*
*버전: 2.1 (OCSF Complete Reference 추가)*
