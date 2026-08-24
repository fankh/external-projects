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
