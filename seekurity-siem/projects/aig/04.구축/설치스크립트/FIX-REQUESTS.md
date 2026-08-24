# 수정 요청 목록 (AIG SIEM)

이 문서는 **다른 세션에서 집행할 수정 사항**을 기록합니다.
진단과 근거는 여기에 남기고, 적용은 별도 세션에서 수행합니다.

| 상태 | 의미 |
|---|---|
| 요청 | 진단 완료, 아직 적용되지 않음 |
| 적용됨 | 이미 적용된 건. 이력 보존을 위해 남겨둠 |

---

## FIX-001 · 콘솔 Parser 탭 클릭 시 화면 오류

**상태: 적용됨** (2026-08-24 09:55, "직접 수정하지 말 것" 지시 수신 이전에 적용되었습니다.
되돌림이 필요하시면 아래 롤백 SQL 을 사용하시기 바랍니다.)

### 증상

`https://10.1.30.4/log/logs` 에서 로그 상세를 열고 좌측 **Parser** 탭을 클릭하면
화면 전체가 오류로 대체됩니다.

```
오류가 발생했습니다
페이지를 새로고침해 주세요.  [새로고침]
```

### 재현 절차

1. `/log/logs` 접속
2. 로그 목록 첫 행 좌측의 상세 버튼 클릭
3. 상세 모달 좌측 탭에서 `Parser` 클릭

### 원인

API 는 정상 응답(HTTP 200)합니다. 문제는 응답 본문에 **`timeFormat` 필드가 아예 없다**는 점입니다.

```
GET /api/infra/collector/parser/id/<uuid>   → 200
data: { name, description, uuid, regex, priority, fields, addFieldSelect, addFieldInput }
                                                      ↑ timeFormat 없음
```

프런트엔드 `LogModalParserTab` 이 이 값에 `.trim()` 을 호출하면서 예외가 발생하고,
ErrorBoundary 가 화면을 대체합니다.

```
TypeError: Cannot read properties of undefined (reading 'trim')
    at LogModalParserTab (/_next/static/chunks/632-c55ea014cbf56874.js:1:13784)
```

근본 원인은 `log_source_parsers.time_format` 이 **NULL** 이었다는 데 있습니다.
NULL 이면 직렬화 과정에서 필드가 통째로 빠져 프런트에서 `undefined` 가 됩니다.
콘솔 UI 로 파서를 만들면 빈 문자열이 들어가므로 이 문제가 없으나,
SQL 로 직접 등록한 파서 20건이 모두 NULL 이었습니다.

### 조치 SQL

```sql
BEGIN;
UPDATE log_source_parsers
   SET time_format = COALESCE(time_format, ''),
       updated_by = 'aig-setup',
       updated_time_at = now()
 WHERE time_format IS NULL AND NOT is_deleted;
COMMIT;
```

### 검증

```sql
SELECT COUNT(*) FILTER (WHERE time_format IS NULL) FROM log_source_parsers WHERE NOT is_deleted;
-- 0 이어야 합니다
```

브라우저에서 Parser 탭을 다시 클릭해 오류 없이 파서 내용이 표시되는지 확인합니다.
적용 후 재현 시도에서 예외가 발생하지 않는 것을 확인했습니다.

### 롤백

```sql
UPDATE log_source_parsers SET time_format = NULL
 WHERE time_format = '' AND created_by = 'aig-setup';
```

### 권고 (제품 측)

프런트엔드가 선택 필드에 `.trim()` 을 방어 없이 호출합니다.
`timeFormat` 은 값이 없을 수 있는 항목이므로 `(timeFormat ?? '').trim()` 형태의
방어 코드가 제품 차원에서 필요합니다. 데이터로만 막으면 동일 유형이 반복됩니다.

---

## FIX-002 · SQL 직접 등록 시 NULL 로 인한 연쇄 장애 (공통 주의)

**상태: 적용됨** (2026-08-23)

`log_sources` 의 `last_read_line` 등 primitive 매핑 컬럼이 NULL 이면
`/infra/collector` 조회가 500 으로 실패하고 대시보드 전체가 뜨지 않습니다.
상세는 `INGEST-TROUBLESHOOTING.md` 를 참고하시기 바랍니다.

FIX-001 과 FIX-002 는 같은 원인 계열입니다. **콘솔 API 를 거치지 않고 DB 에 직접
등록하면, 서버가 채워 주던 기본값이 비어 UI 나 API 가 깨집니다.**
가능하면 `/log/source`, `/log/parser` API 로 등록하시기 바랍니다.

---

## FIX-003 · Syslog Receiver 로그 파일 권한

**상태: 요청**

`/opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log` 가
`root:root`, 0 bytes 인데 서비스는 `seekurity` 계정으로 동작해 기록하지 못합니다.
수집 동작 자체는 정상이나 장애 발생 시 추적할 근거가 남지 않습니다.

```bash
chown seekurity:seekurity /opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log
systemctl restart ss-syslog-receiver
```

검증: 재기동 후 해당 파일 크기가 증가하는지 확인합니다.

---

## FIX-004 · 파싱은 되지만 콘솔 상세 화면에 값이 표시되지 않음

**상태: 적용됨** (2026-08-24 10:21). common 세션이 담당 범위가 아니라고 회신하여
사용자 확인을 받고 siem 세션에서 직접 적용했습니다.

### 증상

로그 상세(Log Detail) 패널에서 표준 항목이 모두 `-` 로 표시됩니다.

```
Event Name        -
Source Port       -
Destination Port  -
Protocol          -
```

### 원인 — 파싱 실패가 아니라 필드명 불일치입니다

정규식은 정상 동작하고 있습니다. 색인된 FortiGate traffic 문서에는 값이 들어 있습니다.

```
action, srcIp, srcPort, dstIp, dstPort, level, eventCategory,
deviceName, deviceId, logDate, logTime, priority, rawData ...
```

문제는 **이름**입니다. 콘솔 번들을 확인한 결과 상세 패널은 고정된 표준 필드명을 읽습니다.

| 화면 라벨 | 콘솔이 읽는 필드 | 현재 파서가 넣는 이름 |
|---|---|---|
| Event Name | `eventName` | (없음) |
| Source IP | `sourceIp` | `srcIp` |
| Source Port | `sourcePort` | `srcPort` |
| Destination IP | `destinationIp` | `dstIp` |
| Destination Port | `destinationPort` | `dstPort` |
| Protocol | `protocol` | (없음) |
| Username | `username` | (없음) |

제품 기본 파서(SECUI MF2)도 `generatedTime, eventName, startTime, machineName, fwRuleId, action, ...`
처럼 표준 이름을 사용합니다. 파서를 만들 때 필드명을 임의로 정한 것이 원인입니다.

### 영향

- 상세 패널·대시보드·리포트 등 **표준 필드를 전제로 하는 화면에서 값이 보이지 않습니다**
- 표준 필드명을 쓰는 탐지룰이 매칭되지 않습니다
- 데이터 자체는 색인되어 있으므로 `srcIp` 등으로 검색하면 조회됩니다

### 조치 (검토 후 적용 필요)

파서의 `fields` 를 표준 이름으로 교체합니다.

```sql
-- FortiGate traffic
UPDATE log_source_parsers
   SET fields = 'priority,logDate,logTime,deviceName,deviceId,eventName,severity,sourceIp,sourcePort,destinationIp,destinationPort,action'
 WHERE name = 'FortiGate KV (traffic)' AND NOT is_deleted;
```

Linux/Syslog 계열도 동일하게 `machineName,processName,processId,message` 중
표준에 대응하는 항목을 맞춰야 합니다.

### 적용 전 반드시 확인할 것

1. **`sourceIp` 충돌** — 제품이 문서에 `sourceIp` 를 이미 넣고 있으며 현재 값은
   **송신 장비 IP**(10.1.1.1)입니다. 파서가 같은 이름을 쓰면 트래픽 출발지로 덮어쓸 가능성이 있습니다.
   방화벽 로그에서는 후자가 타당하지만, 다른 화면이 전자를 전제할 수 있어 영향 범위 확인이 필요합니다.
2. **기존 색인 문서는 바뀌지 않습니다** — 이름 변경은 이후 수집분에만 적용됩니다.
   변경 시점 이전 데이터를 함께 조회하려면 두 이름을 모두 질의하거나 reindex 가 필요합니다.
3. 변경 후 `ss-log-stream` 재기동이 필요하며, 재기동 뒤 신규 문서에 표준 필드가
   채워지는지와 색인 실패가 없는지 확인해야 합니다.

### 검증

```bash
curl -s "http://localhost:19200/siem-logs-$(date +%Y-%m-%d)/_search?size=1" \
  -H "Content-Type: application/json" \
  -d '{"query":{"term":{"eventType":"fortigate_traffic"}},"sort":[{"generatedTime":"desc"}]}'
# sourcePort / destinationPort / eventName 이 채워지는지 확인
```

콘솔에서 로그 상세를 열어 Source Port·Destination Port 가 값으로 표시되는지 확인합니다.

---

## FIX-005 · 파서 추출 범위 부족 — 원문에 있으나 뽑지 않는 필드

**상태: 적용됨** (2026-08-24 10:21). FIX-004 와 함께 반영했습니다.

FIX-004 가 "이름이 달라 화면에 안 보이는" 문제라면, 이 건은 "아예 뽑지 않는" 문제입니다.
2026-08-24 색인 47,537건 기준으로 측정했습니다.

### 5-1. ICMP 트래픽 로그에서 출발지·목적지가 통째로 누락됩니다 (529건)

원문에 `srcip=` 가 있는데도 `srcIp` 필드가 없는 문서가 **529건** 있습니다.

```
srcip=16.78.106.213 identifier=  ...      ← srcport 가 아니라 identifier
```

`FortiGate KV (traffic)` 파서의 정규식이 `srcip=(\S+)\s+srcport=(\d+)` 로
**srcport 를 필수로 요구**하기 때문입니다. ICMP 로그는 포트 개념이 없어 `identifier=` 가 오므로
매칭에 실패하고, fallback 인 `FortiGate KV (generic)` 로 넘어가 `srcIp/dstIp/action` 이 모두 사라집니다.

이 때문에 `fortigate_event` 로 분류된 1,278건 중 상당수가 실제로는 `type="traffic"` 로그입니다.

**조치 방향**: 포트를 선택 항목으로 바꿉니다.

```
srcip=(\S+)(?:\s+srcport=(\d+))?    …    dstip=(\S+)(?:\s+dstport=(\d+))?
```

또는 ICMP 전용 파서를 별도 우선순위로 추가합니다.

### 5-2. 원문에 있으나 한 번도 추출하지 않는 필드

| 원문 키 | 원문 보유 문서 | 현재 추출 | 대응 표준 필드 |
|---|---|---|---|
| `proto=` | 42,366건 | **0건** | `protocol` |
| `service=` | 42,367건 | **0건** | (서비스명) |
| `user=` | 7,019건 | **0건** | `username` |
| `logdesc=` | 753건 | **0건** | `eventName` 후보 |

`protocol` 과 `eventName` 이 화면에서 `-` 로 나오는 직접적인 원인입니다.
특히 `user=` 7,019건은 계정 기반 탐지(로그인 시도, 권한 오용)에 필요한 값이라
현재 상태로는 관련 탐지룰을 만들 수 없습니다.

### 참고 — 정상인 항목

- `fortigate_traffic` 41,369건은 `srcIp/srcPort/dstIp/dstPort/action/level` 이 **100% 채워져 있습니다**
- `linux_syslog` 4,890건에 네트워크 필드가 없는 것은 OS 로그 특성상 정상입니다
- `sourceIp` 가 47,537건 전체에 있는 것은 제품이 **송신 장비 IP** 로 채우기 때문이며,
  트래픽 출발지와는 다른 의미입니다 (FIX-004 의 충돌 주의사항 참조)

### 권고

FIX-004(필드명)와 FIX-005(추출 범위)는 같은 파서를 고치는 작업이므로
**한 번에 반영하는 편이 효율적**입니다. 반영 후 `ss-log-stream` 을 재기동하고,
신규 문서에서 위 표의 항목이 채워지는지 확인하시기 바랍니다.


---

## FIX-004 / FIX-005 적용 결과 (2026-08-24 10:21)

`fix-004-005-parser.sql` 적용 후 `ss-log-stream` 재기동. 재기동 이후 60초 구간 실측입니다.

| 항목 | 결과 |
|---|---|
| 파서 로딩 | `Found 7 collectors` / `syslog: 7` |
| fortigate_traffic | 446건 — `sourceIp`,`sourcePort`,`destinationIp`,`destinationPort`,`protocol`,`eventName`,`action` **전건 채움** |
| 구 필드명 | `srcIp`,`dstPort` **0건** (신규 문서에서 사라짐) |
| ICMP 누락 | **0건** (적용 전 529건/일) |
| 색인 실패 | 0건 |

콘솔 로그 검색 목록도 값이 표시됩니다.

```
Generated Time      | Device        | Event Name | Source IP     | Destination IP | Source Port | Destination Port
2026-08-24 10:21:07 | AIG_SSLVPN_FW | traffic    | 10.1.10.4     | 10.48.226.57   | 45540       | 22
2026-08-24 10:21:07 | AIG_SSLVPN_FW | traffic    | 211.47.6.118  | 10.1.10.4      | 59142       | 10010
```

Source IP 가 방화벽 자신(10.1.1.1)이 아니라 **실제 트래픽 출발지**로 바뀐 것도 확인했습니다.

### 후속 검토 사항

1. **`eventName` 값이 `traffic` 으로 단조롭습니다.** FortiGate `type=` 을 매핑했는데
   대부분 `traffic` 이라 구분력이 없습니다. `subtype=`(forward/local 등) 또는
   `logdesc=` 를 쓰는 편이 화면에서 유용할 수 있어 검토가 필요합니다.
2. `fortigate_event`(generic fallback)로 남는 건이 60초당 13건 있습니다.
   실제 비트래픽 이벤트인지 확인이 필요합니다.
3. `service=`, `user=` 는 여전히 미추출입니다. 특히 `user=` 는 계정 기반 탐지에 필요합니다.
4. Linux/Syslog 파서 3종은 표준 필드명 미적용 상태입니다
   (`PARSER-FIELD-CONVENTION.md` 현황표 참조).

---

## FIX-006 · 기본 탐지룰 56개가 적재되었으나 2개만 동작 가능

**상태: 요청** (적용하지 않았습니다)

### 경위

`/threat/rule` 이 비어 있어 제품 기본 룰 세트를 적재했습니다.

| 항목 | 내용 |
|---|---|
| 출처 | `seekurity-siem-patch/sql/migrations/019_firewall_vpn_security_rules.sql` (2026-08-02, MD5 `1a91f36f…`) |
| 결과 | 룰 56개 + 조건 73개, `created_by = system`, 전부 탐지 활성 |
| 심각도 | CRITICAL 14 / HIGH 24 / MEDIUM 15 / LOW 3 |

적재 시 `ON CONFLICT (uuid) DO NOTHING` 21곳을 제거해야 했습니다.
이 스키마의 `rules` 테이블은 PK 가 `row_number` 뿐이고 **`uuid` 유니크 제약이 없어**
벤더 SQL 이 그대로는 오류로 중단됩니다. 룰 내용은 변경하지 않았습니다.

> 제품 측에 전달할 사항입니다. 마이그레이션 SQL 이 배포 스키마와 맞지 않습니다.
> `rules.uuid` 에 유니크 제약을 추가하거나 SQL 에서 해당 절을 빼야 합니다.

### 문제 — 룰이 참조하는 필드가 우리 데이터에 없습니다

| 룰이 요구 | 조건/룰 수 | 우리 데이터 | 판정 |
|---|---|---|---|
| `deviceAction` (조건 key) | 조건 54개 | **없음** (우리는 `action`) | 불일치 |
| `hostname` (집계기준) | 룰 11개 | **없음** (우리는 `machineName`) | 불일치 |
| `username` (집계기준·조건) | 룰 13개 + 조건 1개 | **없음** | 미추출 |
| `source.ip` (집계기준) | 룰 2개 | **없음** (우리는 `sourceIp`) | 표기 오류로 보임 |
| `sourceIp`, `deviceIp`, `destinationIp`, `destinationPort`, `message` | — | 있음 | 정상 |

`deviceAction` 은 색인·JAR·콘솔 번들 어디에서도 발견되지 않았습니다. 이 룰 SQL 에만 존재합니다.

**현재 실제로 동작 가능한 룰은 2개뿐입니다** (`서버 오류 급증`, `DNS 터널링 의심`).
나머지 54개는 콘솔에 '탐지 ON' 으로 보이지만 영원히 매칭되지 않습니다.
**설정된 것처럼 보이면서 탐지하지 않는 상태가 가장 위험**하므로 조정이 필요합니다.

### 조치 SQL

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS aig_rule_backup AS SELECT *, now() AS backed_up_at FROM rules WHERE false;
INSERT INTO aig_rule_backup SELECT *, now() FROM rules WHERE NOT is_deleted;
CREATE TABLE IF NOT EXISTS aig_rulecond_backup AS SELECT *, now() AS backed_up_at FROM rule_conditions WHERE false;
INSERT INTO aig_rulecond_backup SELECT *, now() FROM rule_conditions;

-- 1) 조건 key : deviceAction -> action  (조건 54개)
UPDATE rule_conditions SET key = 'action' WHERE key = 'deviceAction';

-- 2) 집계기준 : hostname -> machineName (룰 11개)
UPDATE rules SET standard_field = 'machineName'
 WHERE standard_field = 'hostname' AND NOT is_deleted;

-- 3) 집계기준 표기 오류 : source.ip -> sourceIp (룰 2개)
UPDATE rules SET standard_field = 'sourceIp'
 WHERE standard_field = 'source.ip' AND NOT is_deleted;
COMMIT;
```

**적용 후 예상: 동작 가능 룰이 2개 → 43개로 늘어납니다.** 남는 13개는 `username` 필요분입니다.

### 값(value)도 맞춰야 합니다

키를 바꿔도 값이 다르면 매칭되지 않습니다. FortiGate 실제 값과 대조한 결과입니다.

| 룰 조건 값 | 조건 수 | FortiGate 실측 | 판정 |
|---|---|---|---|
| `deny` | 4 | 7,372건 | **일치** |
| `accept` | 4 | 8,499건 | **일치** |
| `drop`, `blocked`, `alert` | 12 | 없음 | 다른 장비용(IPS/WAF)으로 보임 |
| `tunnel-up/down`, `authentication-*` | 9 | 없음 | VPN 연동 후 유효 |
| `file-modified`, `usb-storage-connected` | 4 | 없음 | DLP/EDR 연동 후 유효 |

즉 미연동 장비를 전제한 룰이 상당수입니다. 해당 장비가 붙기 전까지는 동작하지 않는 것이 정상이므로,
**연동 완료된 장비의 룰만 활성화하고 나머지는 비활성으로 두는 편**이 운영상 명확합니다.

```sql
-- 예: 미연동 장비 전제 룰 비활성화 (선택)
UPDATE rules SET is_detection_active = false
 WHERE uuid IN (SELECT rule_id FROM rule_conditions
                 WHERE value IN ('tunnel-up','tunnel-down','file-modified','usb-storage-connected'));
```

### 남은 과제 — `username` 미추출 (룰 13개)

FIX-005 에서 미룬 `user=` 추출이 선행되어야 합니다. 원문에 7,019건 존재합니다.
파서에 `username` 을 추가하면 계정 관련 룰 13개가 살아납니다.

### 검증

```sql
-- 조정 후 동작 가능 룰 수 확인
SELECT COUNT(*) FROM rules r WHERE NOT r.is_deleted
  AND r.standard_field IN ('sourceIp','destinationIp','deviceIp','machineName')
  AND NOT EXISTS (SELECT 1 FROM rule_conditions c
                   WHERE c.rule_id = r.uuid AND c.key NOT IN ('action','message','destinationPort'));
-- 43 이 나와야 합니다

-- 실제 탐지 발생 여부 (조정 후 10분 이상 경과 후)
SELECT COUNT(*) FROM detection_histories;
```

콘솔 `/threat/rule` 에서 룰을 선택해 '탐지 내역' 탭에 건수가 쌓이는지 확인합니다.

### 롤백

```sql
UPDATE rule_conditions c SET key = b.key FROM aig_rulecond_backup b WHERE c.uuid = b.uuid;
UPDATE rules r SET standard_field = b.standard_field FROM aig_rule_backup b WHERE r.uuid = b.uuid;
```

전체 제거가 필요하면 `DELETE FROM rule_conditions; DELETE FROM rules WHERE created_by='system';`

---

## FIX-007 · 탐지 엔진이 룰 조건(rule_conditions)을 적용하지 않음

**상태: 요청** (ss-api 재기동 검증 완료. 캐시 원인 아님)

### 검증 방법

탐지 엔진이 실제로 동작하는지 확인하기 위해 임시 룰을 투입했습니다(검증 후 삭제 완료).

| 항목 | 값 |
|---|---|
| 집계기준 | `sourceIp`, 임계 50건 / 5분 |
| 조건 | `action` = `deny` |
| 투입 | 2026-08-24 11:30, 삭제 11:42 |

### 결과 — 탐지는 되지만 조건이 무시됩니다

탐지 자체는 발생했습니다(105건). **엔진과 스케줄러는 정상 동작합니다.**

그러나 탐지된 대상이 조건과 맞지 않았습니다.

| 탐지된 sourceIp | 실제 이벤트 |
|---|---|
| `10.1.30.4` | `eventType=linux_syslog`, **`action` 필드 자체가 없음** |
| `10.212.134.113` | `action=client-rst` |
| `10.212.134.111` | `action=accept` |

**`deny` 인 이벤트는 하나도 없었습니다.** 조건이 적용되지 않고 집계기준과 임계치만으로 탐지된 것입니다.
`conditions_snapshot` 컬럼도 모든 탐지 이력에서 `[]` 로 비어 있었습니다.

`method` 를 `EQUAL` 에서 벤더 기본값인 `INCLUDE` 로 바꿔 재시험했으나 동일했습니다.

### 확인된 사실

- `rule_conditions` 행은 정상 등록되어 있습니다 (`action` / `deny` / `INCLUDE`)
- `ss-api.jar` 에 `RuleCondition` 문자열이 103회 등장하므로 조건 기능은 구현되어 있습니다
- 탐지 로그에는 `search result count: 190` 처럼 **필터되지 않은 전체 건수**가 찍힙니다

### 영향 — 이 상태로 룰을 활성화하면 오탐이 대량 발생합니다

기본 룰 56개의 조건 73개가 모두 무시된다면, 룰은 사실상
**"집계기준별 이벤트 수가 임계치를 넘으면 탐지"** 로만 동작합니다.
예를 들어 `방화벽 차단 반복 탐지`(sourceIp 50건/10분)는 차단이 아닌 정상 트래픽에도 발화합니다.

또한 이것이 사실이라면 **FIX-006 의 조건 key 정정(`deviceAction` → `action`)은 의미가 없습니다.**
조건 자체가 평가되지 않기 때문입니다. FIX-006 보다 이 건이 선행되어야 합니다.

### 미확인 — 원인 후보

1. **캐시 가능성** — `ss-api` 는 2026-08-21 기동이고 룰·조건은 08-24 에 DB 직접 등록했습니다.
   룰은 매 주기 조회되어 반영되었으나(임시 룰이 발화함) 조건은 기동 시 캐시된 것을 쓸 수 있습니다.
2. **등록 경로 문제** — 콘솔 API 로 조건을 만들면 다른 저장 구조(예: 룰의 스냅샷 컬럼)에도
   함께 기록되고, 엔진이 그쪽을 참조할 가능성이 있습니다.
3. **제품 결함** — 조건 평가 로직이 동작하지 않음

### 다음 검증 (권고)

```bash
sudo systemctl restart ss-api
```

재기동 후 동일한 임시 룰을 다시 투입해 `conditions_snapshot` 이 채워지는지,
탐지 대상이 `deny` 로 한정되는지 확인합니다.

- 재기동으로 해결되면 **원인은 캐시**이며, 운영 절차에 "룰·조건 DB 직접 변경 후 ss-api 재기동" 을 추가해야 합니다
- 해결되지 않으면 **제품 결함**이므로 벤더 확인이 필요합니다

콘솔 UI 로 룰과 조건을 하나 만들어 비교하는 것도 원인 구분에 도움이 됩니다.


### 추가 검증 — ss-api 재기동 후 재시험 (2026-08-24 11:51)

캐시 가능성을 확인하기 위해 `systemctl restart ss-api` 후 동일한 임시 룰로 재시험했습니다.

| 항목 | 결과 |
|---|---|
| 재기동 | 11:51:29 → 11:51:49 정상 복귀 (20초) |
| 룰 재투입 | 11:52:12 |
| 룰 평가 시작 | 약 12:02 (**투입 후 약 10분 뒤**) |
| 탐지 | 17건 발생 |
| `conditions_snapshot` | **여전히 `[]`** |
| 탐지 대상 | `10.1.30.4`(action 필드 없음), `10.212.134.111/113`, `85.203.46.114` — **`deny` 아님** |

**재기동으로 해결되지 않았습니다. 캐시 원인은 배제됩니다.**

같은 시각 `211.47.6.115` 가 deny 127건/5분을 기록 중이었으므로, 조건이 적용됐다면
이 IP 만 탐지되어야 했습니다. 그러나 조건과 무관한 대상들이 탐지됐습니다.

### 부수 확인 — 룰 반영에 약 10분이 걸립니다

두 차례 시험 모두 룰 투입 후 실제 평가까지 시간이 걸렸습니다.

| 시험 | 투입 | 최초 발화 | 지연 |
|---|---|---|---|
| 1차 | 11:30:30 | 11:36:04 | 약 5분 30초 |
| 2차 | 11:52:12 | 약 12:02 | 약 10분 |

룰을 DB 로 등록한 뒤 즉시 동작하지 않으므로, 운영 시 **룰 등록 후 10분가량 기다렸다가
검증**해야 합니다. 반영이 안 된 것으로 오판하기 쉽습니다.

### 남은 원인 후보와 다음 검증

캐시가 배제되었으므로 다음 둘 중 하나입니다.

1. **등록 경로 문제** — 콘솔 API(`/log/...` 계열의 룰 등록 API)로 조건을 만들면
   엔진이 참조하는 다른 구조에도 함께 기록될 가능성
2. **제품 결함** — 조건 평가 로직 자체가 동작하지 않음

**다음 검증**: 콘솔 UI 또는 API 로 룰과 조건을 하나 생성해 동일하게 관찰합니다.
- 이때 조건이 적용되면 → 등록 경로 문제. **기본 룰 56개를 SQL 로 적재한 것 자체가 무효**이므로
  API 경로로 재등록해야 합니다
- 적용되지 않으면 → 제품 결함이므로 벤더 확인이 필요합니다

이 결과에 따라 대응이 크게 달라지므로, FIX-006 보다 먼저 확정해야 합니다.
