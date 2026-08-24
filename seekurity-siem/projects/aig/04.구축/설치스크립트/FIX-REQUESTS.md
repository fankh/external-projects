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

**상태: 요청** (적용하지 않았습니다)

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
