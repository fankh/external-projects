# Log Parsing Process (로그 파싱 프로세스)

## 개요

Log Parsing은 다양한 형식의 원시 로그 데이터를 SIEM이 이해할 수 있는 구조화된 형태로 변환하는 과정이다. 효과적인 파싱은 정확한 탐지, 빠른 검색, 의미 있는 분석의 기반이 된다.

---

## 1. Log Parsing 파이프라인

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Raw Log    │───▶│  Collector  │───▶│   Parser    │───▶│ Normalizer  │───▶│   Index     │
│  (Source)   │    │  (수집)      │    │  (파싱)      │    │  (정규화)    │    │  (저장)      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │                  │                  │
                          ▼                  ▼                  ▼
                   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
                   │ Source      │    │ Field       │    │ Taxonomy    │
                   │ Identification│   │ Extraction  │    │ Mapping     │
                   └─────────────┘    └─────────────┘    └─────────────┘
```

---

## 2. Parsing 단계별 상세

### 2.1 Stage 1: Log Source Identification (로그 소스 식별)

수신된 로그의 출처를 식별하여 적절한 Parser를 선택한다.

| 식별 방법 | 설명 | 예시 |
|-----------|------|------|
| **IP Address** | 송신 IP 기반 매핑 | `192.168.1.1` → Palo Alto Firewall |
| **Port** | 수신 Port 기반 분류 | Port 5514 → Cisco ASA |
| **Syslog Header** | Facility/Severity 조합 | `local4.info` → VPN Logs |
| **Message Pattern** | 로그 내용 패턴 매칭 | `CEF:0\|` → CEF Format Device |
| **Tag/Label** | 전송 시 Tag 사용 | `@source:firewall` |

**Best Practice:**
```yaml
# Source Identification 우선순위
1. Explicit Tag (명시적 태그)
2. IP + Port 조합
3. Syslog Header 분석
4. Message Pattern 자동 탐지 (fallback)
```

### 2.2 Stage 2: Format Detection (포맷 감지)

로그 형식을 자동/수동으로 감지한다.

| Format | 특징 | 탐지 패턴 |
|--------|------|-----------|
| **Syslog RFC3164** | BSD 스타일, 타임스탬프 + 호스트 + 메시지 | `<PRI>Mmm dd HH:MM:SS hostname` |
| **Syslog RFC5424** | 구조화된 데이터 지원 | `<PRI>VERSION TIMESTAMP HOSTNAME` |
| **CEF** | ArcSight 표준, key=value | `CEF:0\|Vendor\|Product\|Version\|` |
| **LEEF** | QRadar 표준, tab 구분 | `LEEF:1.0\|Vendor\|Product\|` |
| **JSON** | 구조화된 로그 | `{...}` |
| **CSV** | 쉼표 구분 | 필드 수 일정, 구분자 일관 |
| **Key-Value** | 다양한 구분자 | `key1=value1 key2=value2` |
| **Custom** | 벤더별 고유 형식 | 정규식 기반 파싱 필요 |

### 2.3 Stage 3: Field Extraction (필드 추출)

로그에서 의미 있는 필드를 추출한다.

#### 추출 방법

**1. Regular Expression (정규식)**
```regex
# Firewall Deny Log 예시
^(?<timestamp>\w{3}\s+\d+\s+\d+:\d+:\d+)\s+
(?<hostname>\S+)\s+
(?<action>DENY|ALLOW)\s+
(?<protocol>\w+)\s+
src=(?<src_ip>\d+\.\d+\.\d+\.\d+):(?<src_port>\d+)\s+
dst=(?<dst_ip>\d+\.\d+\.\d+\.\d+):(?<dst_port>\d+)
```

**2. Grok Pattern (사전 정의 패턴)**
```grok
# 사전 정의 패턴 활용
%{SYSLOGTIMESTAMP:timestamp} %{HOSTNAME:hostname} %{WORD:action} %{WORD:protocol} src=%{IP:src_ip}:%{INT:src_port} dst=%{IP:dst_ip}:%{INT:dst_port}
```

**3. JSON Path (JSON 로그)**
```jsonpath
$.timestamp           → event_time
$.source.ip          → src_ip
$.destination.ip     → dst_ip
$.event.action       → action
```

**4. Delimiter-based (구분자 기반)**
```
# CSV 예시
Position 0 → timestamp
Position 3 → src_ip
Position 4 → dst_ip
Position 7 → action
```

### 2.4 Stage 4: Data Type Conversion (데이터 타입 변환)

추출된 필드를 적절한 데이터 타입으로 변환한다.

| 필드 유형 | 원시 형태 | 변환 결과 | 변환 로직 |
|-----------|-----------|-----------|-----------|
| **Timestamp** | `Jan 29 10:30:45` | `2026-01-29T10:30:45Z` | 날짜 파싱 + UTC 변환 |
| **IP Address** | `192.168.1.1` | IPv4/IPv6 객체 | IP 검증 + GeoIP 보강 |
| **Port** | `"443"` | `443` (integer) | 문자열 → 정수 |
| **Bytes** | `"1.5MB"` | `1572864` | 단위 변환 |
| **Duration** | `"5m30s"` | `330` (seconds) | 시간 단위 통일 |
| **Boolean** | `"true"`, `"1"`, `"yes"` | `true` | 불리언 정규화 |

### 2.5 Stage 5: Enrichment (데이터 보강)

외부 데이터를 활용하여 로그를 보강한다.

| 보강 유형 | 소스 | 추가 필드 |
|-----------|------|-----------|
| **GeoIP** | MaxMind DB | `src_country`, `src_city`, `src_asn` |
| **DNS Reverse** | DNS 조회 | `src_hostname`, `dst_hostname` |
| **Asset DB** | 자산 관리 DB | `asset_name`, `asset_owner`, `asset_criticality` |
| **Threat Intel** | TI Feed | `threat_score`, `threat_category`, `ioc_match` |
| **User Directory** | LDAP/AD | `user_name`, `user_department`, `user_title` |

---

## 3. Parser 개발 프로세스

### 3.1 Parser 개발 워크플로우

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. 샘플 수집  │───▶│  2. 분석     │───▶│  3. 개발     │───▶│  4. 테스트   │
│  Sample      │    │  Analysis    │    │  Development │    │  Testing     │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  • 다양한 이벤트     • 필드 식별         • Regex 작성        • 정상 케이스
  • Edge 케이스      • 패턴 분석         • Normalization    • Edge 케이스
  • 최소 100개       • 필드 매핑 정의     • Enrichment       • 성능 테스트

       │                                                         │
       └────────────────────────────────────────────────────────┘
                              5. 배포 & 모니터링
```

### 3.2 샘플 로그 수집 기준

| 항목 | 최소 기준 | 권장 기준 |
|------|-----------|-----------|
| 샘플 수량 | 50개 | 500+ 개 |
| 이벤트 유형 커버리지 | 주요 5개 | 전체 이벤트 |
| 시간 범위 | 1일 | 7일 이상 |
| Edge 케이스 | 3개 이상 | 10개 이상 |

### 3.3 Parser 정의서 Template

```yaml
# Parser Definition
parser_id: "PALOALTO_NGFW_V10"
vendor: "Palo Alto Networks"
product: "PA-Series Firewall"
version: "10.x"
format: "syslog-rfc5424"

# Source Matching
source_match:
  ip_ranges: ["10.0.1.0/24"]
  ports: [514]
  patterns: ["TRAFFIC,"]

# Field Extraction
fields:
  - name: "timestamp"
    type: "datetime"
    extraction: "regex"
    pattern: '(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})'
    format: "YYYY/MM/DD HH:mm:ss"

  - name: "src_ip"
    type: "ip"
    extraction: "kv"
    key: "src"

  - name: "dst_ip"
    type: "ip"
    extraction: "kv"
    key: "dst"

  - name: "action"
    type: "string"
    extraction: "kv"
    key: "action"
    normalize:
      mapping:
        "allow": "ALLOW"
        "deny": "DENY"
        "drop": "DROP"

# Normalization Mapping
normalization:
  event_category: "network"
  event_type: "firewall"
  event_name_field: "subtype"
  event_name_mapping:
    "start": "SESSION_START"
    "end": "SESSION_END"
    "deny": "SESSION_DENY"
    "drop": "SESSION_DROP"

# Enrichment
enrichment:
  - type: "geoip"
    fields: ["src_ip", "dst_ip"]
  - type: "asset_lookup"
    key_field: "src_ip"

# Validation
validation:
  required_fields: ["timestamp", "src_ip", "dst_ip", "action"]
  test_samples: "tests/paloalto_samples.json"
```

---

## 4. Parser 품질 관리

### 4.1 품질 메트릭

| 메트릭 | 설명 | 목표 |
|--------|------|------|
| **Parse Rate** | 성공적으로 파싱된 로그 비율 | ≥ 99.5% |
| **Field Coverage** | 필수 필드 추출 성공률 | 100% |
| **Normalization Rate** | 정규화 매핑 성공률 | ≥ 95% |
| **Processing Latency** | 파싱 처리 시간 | < 1ms/event |
| **Error Rate** | 파싱 실패율 | < 0.5% |

### 4.2 파싱 실패 처리

```
┌─────────────────────────────────────────────────────────────┐
│                    Parsing Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Raw Log ──▶ Parser ──┬──▶ Success ──▶ Normalized Index    │
│                        │                                     │
│                        └──▶ Failure ──┬──▶ Fallback Parser  │
│                                       │                      │
│                                       └──▶ Raw Index        │
│                                            (unparsed)        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**실패 처리 전략:**

| 레벨 | 조치 | 설명 |
|------|------|------|
| **Level 1** | Fallback Parser | 기본 필드만 추출 (timestamp, raw_message) |
| **Level 2** | Raw Storage | 원본 그대로 저장, 파싱 실패 태그 추가 |
| **Level 3** | Alert | 실패율 임계치 초과 시 알림 |
| **Level 4** | Auto-Disable | 지속적 실패 시 Parser 비활성화 |

### 4.3 Parser 버전 관리

```
parser/
├── paloalto_ngfw/
│   ├── v1.0.0/
│   │   ├── parser.yaml
│   │   ├── tests/
│   │   └── CHANGELOG.md
│   ├── v1.1.0/
│   │   ├── parser.yaml
│   │   ├── tests/
│   │   └── CHANGELOG.md
│   └── latest -> v1.1.0
```

---

## 5. 주요 벤더별 Parser 가이드

### 5.1 Palo Alto Firewall

```
# 샘플 로그
Jan 29 10:30:45 pa-fw-01 1,2026/01/29 10:30:45,001234567890,TRAFFIC,end,2305,2026/01/29 10:30:45,192.168.1.100,10.0.0.50,0.0.0.0,0.0.0.0,Allow-All,user1,,web-browsing,vsys1,Trust,Untrust,ethernet1/1,ethernet1/2,Log-Forward,2026/01/29 10:30:45,12345,1,54321,443,0,0,0x400000,tcp,allow,1234,567,890,10,2026/01/29 10:30:30,15,any,0,1234567890,0x0,192.168.0.0-192.168.255.255,10.0.0.0-10.255.255.255,0,8,2,aged-out,0,0,0,0,,pa-fw-01,from-policy,,,0,,0,,N/A,0,0,0,0,

# 주요 필드 위치 (CSV)
Position 1:  receive_time
Position 3:  serial
Position 4:  type (TRAFFIC, THREAT, SYSTEM, etc.)
Position 5:  subtype
Position 7:  src_ip
Position 8:  dst_ip
Position 29: action
```

### 5.2 Fortinet FortiGate

```
# 샘플 로그
date=2026-01-29 time=10:30:45 devname="FG-01" devid="FGT60F1234567890" logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=192.168.1.100 srcport=54321 srcintf="port1" dstip=10.0.0.50 dstport=443 dstintf="port2" poluuid="12345678-1234-1234-1234-123456789012" sessionid=123456 proto=6 action="accept" policyid=1 service="HTTPS" trandisp="noop" duration=30 sentbyte=1234 rcvdbyte=5678 sentpkt=10 rcvdpkt=15 appcat="unscanned"

# Key-Value 형식
extraction: "kv"
separator: " "
kv_separator: "="
```

### 5.3 Cisco ASA

```
# 샘플 로그
Jan 29 2026 10:30:45 asa-fw-01 : %ASA-6-302014: Teardown TCP connection 12345 for outside:192.168.1.100/54321 to inside:10.0.0.50/443 duration 0:00:30 bytes 6912 TCP FINs

# 정규식 패턴
pattern: '%ASA-(?<severity>\d)-(?<msg_id>\d+):\s+(?<message>.*)'

# Message ID 기반 이벤트 분류
msg_id_mapping:
  "302013": "CONNECTION_BUILD"
  "302014": "CONNECTION_TEARDOWN"
  "106023": "DENY_BY_ACL"
  "710003": "TCP_ACCESS_DENIED"
```

---

## 6. 성능 최적화

### 6.1 Parser 성능 튜닝

| 기법 | 설명 | 효과 |
|------|------|------|
| **Regex 최적화** | Non-greedy 매칭, Atomic 그룹 사용 | 30-50% 속도 향상 |
| **Pre-filtering** | 불필요한 로그 조기 필터링 | 처리량 감소 |
| **Field Caching** | 반복 추출 필드 캐싱 | 메모리 vs 속도 트레이드오프 |
| **Batch Processing** | 배치 단위 처리 | 처리량 증가 |
| **Parallel Parsing** | 멀티 스레드 파싱 | CPU 활용 극대화 |

### 6.2 Regex 최적화 예시

```regex
# Before (느림)
.*src=(\d+\.\d+\.\d+\.\d+).*dst=(\d+\.\d+\.\d+\.\d+).*

# After (빠름)
src=(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+.*?dst=(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})

# 최적화 포인트
1. .* 대신 .*? (non-greedy)
2. \d+ 대신 \d{1,3} (범위 제한)
3. 앵커 사용 (^, $)
4. 캡처 그룹 최소화 (?: 사용)
```

---

## 7. 트러블슈팅

### 7.1 일반적인 파싱 문제

| 문제 | 원인 | 해결 방법 |
|------|------|-----------|
| 타임스탬프 파싱 실패 | 타임존 불일치, 포맷 변경 | 다중 포맷 지원, 타임존 명시 |
| 필드 누락 | 로그 포맷 변경, 선택적 필드 | Optional 필드 처리, 버전별 Parser |
| 인코딩 문제 | UTF-8 외 인코딩 | 인코딩 자동 감지, 변환 |
| 멀티라인 로그 | 스택트레이스, 긴 메시지 | 멀티라인 패턴 설정 |
| 성능 저하 | 복잡한 Regex, 대용량 로그 | Regex 최적화, 샘플링 |

### 7.2 디버깅 체크리스트

```markdown
- [ ] 원본 로그가 정상적으로 수신되는가?
- [ ] Log Source가 올바르게 식별되는가?
- [ ] 올바른 Parser가 선택되는가?
- [ ] 정규식이 샘플 로그와 매칭되는가?
- [ ] 필드 타입 변환이 정상인가?
- [ ] 정규화 매핑이 올바른가?
- [ ] Enrichment 소스가 가용한가?
- [ ] 인덱스에 정상적으로 저장되는가?
```

---

*최종 수정일: 2026-01-29*
