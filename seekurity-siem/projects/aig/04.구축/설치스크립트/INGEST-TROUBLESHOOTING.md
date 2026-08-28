# 로그 유입 0건 — 원인과 조치 (2026-08-23, 10.1.30.4)

## 증상

설치(2026-08-16)와 패치(2026-08-21) 이후 서비스 12종이 모두 `active` 이고 포트도 전부 정상인데,
`siem-logs-*` 인덱스가 **7일간 전부 0건**이었다. 인덱스는 날짜별로 자동 생성되고 있었다.

## 원인은 두 단계였다

### 1단계 — Log Source 미등록 (수집 대상 없음)

`log_sources` 0행, `log_source_parsers` 0행. `ss-log-stream` 은 30초마다 동기화하며 로그에
`Found 0 collectors` / `Parser configs loaded - syslog: 0` 을 남기고 있었다.

Kafka 는 정상이었다. Filebeat 가 `siem-logs` 토픽으로 계속 produce 중이었고(6일간 가동),
컨슈머 그룹 lag 은 10~15건에 불과했다 — 즉 **읽어서 전부 버리고 있었다**. 수집기가 없으니
어느 로그 소스에도 귀속되지 않아 색인 대상이 되지 못한 것이다.

조치: 로그 소스 1건(`AIG_SIEM_Host_Linux`, 10.1.30.4, syslog, device type `기타 장비`)과
RFC3164 파서 1건을 등록했다. `ss-log-stream` 재시작 후 `Found 1 collectors`,
`Parser configs loaded - syslog: 1` 로 바뀌었다.

> 동기화는 30초 주기지만 실제로는 10분 가까이 건너뛰기도 한다. 등록 직후 반영을 확인하려면
> `systemctl restart ss-log-stream` 이 확실하다.

### 2단계 — generatedTime 밀리초로 전건 색인 거부

수집기를 등록하자 문서가 OpenSearch 로 나가기 시작했으나 전건이 거부됐다:

```
ERROR ElasticsearchUtil - [BulkProcessor] 11건 중 일부 실패
  mapper_parsing_exception: failed to parse field [generatedTime] of type [date]
  Preview of field's value: '2026-08-23T04:28:30.731Z'
```

인덱스 매핑상 `generatedTime` 의 허용 포맷은 다음 셋뿐이다:

```
strict_date_time_no_millis || yyyy-MM-dd'T'HH:mm:ss || epoch_millis
```

**셋 다 밀리초를 받지 않는다.** 제품 자체 수집기(`ss-syslog-receiver`)는 `2026-08-16T07:59:35Z` 처럼
초 단위로 넣기 때문에 문제가 없었고, 문제는 Filebeat 설정 쪽이었다:

```yaml
- copy_fields:
    fields:
      - from: "@timestamp"      # 2026-08-23T04:28:30.731Z — 밀리초 포함
        to: "generatedTime"
```

조치: 해당 `copy_fields` 를 초 단위로 자르는 `script` processor 로 교체했다.
기존 설정은 `/etc/filebeat/filebeat.yml.bak-aig-20260823-133853` 로 백업.

## 함정 — 타임존

`event.Get("@timestamp")` 가 JS `Date` 로 오지 않는 경우가 있다. 이때 `String(d)` 는 Go 의
`2026-08-23 13:39:56.137 +0900 KST` 형식이라, 날짜·시각만 잘라 `Z` 를 붙이면 **KST 를 UTC 로
잘못 표기해 9시간 밀린다**. 실제로 첫 시도에서 이 오류가 났고, 스큐된 196건은
`_delete_by_query` 로 제거했다. 최종 스크립트는 `Date` 인 경우와 오프셋 문자열인 경우를
모두 처리해 UTC 로 환산한다.

서비스 로그 시각도 UTC 다(`-Duser.timezone=UTC`). 서버 자체는 KST 이므로 로그를 볼 때 9시간 차를 감안할 것.

## 확인된 결과

| 항목 | 결과 |
|------|------|
| `log_sources` / 파서 | 1건 / 1건 |
| 색인 유입 | 30초에 39건 증가 (0건 → 지속 유입) |
| 파싱 필드 | `device`, `machineName`, `processName`, `processId`, `message`, `logTime` 정상 추출 |
| 색인 실패 | Filebeat 수정 시각 이후 0건 |

## 남은 일

실제 AIG 장비(Firewall/IPS/VPN 등)는 아직 IP 미확정이라 등록되지 않았다.
`logsources.csv` 를 실제 값으로 채운 뒤 `20-configure-logsources.sh --apply` → `30-verify-ingest.sh` 순으로 진행하면 된다.
장비별 파서는 `log_device_types` 에 이미 55종(Palo Alto, FortiGate, Cisco ASA, SECUI MF2 등)이 시드되어 있다.

---

# DB 직접 등록 시 주의 — primitive 컬럼에 NULL 을 남기지 말 것

로그 소스를 SQL 로 직접 넣은 뒤 웹 콘솔 대시보드가 **500 Internal Server Error** 로 떴다.
로그인 자체는 정상이고 URL 은 `/dashboard/dashboard` 로 넘어가는데 화면만 500 이다.

ss-api 스택트레이스:

```
JpaSystemException: Null value was assigned to a property
  [com.seekers.siem.api.model.infra.InfraCollector.lastReadLine] of primitive type setter
java.lang.IllegalArgumentException: Can not set int field ...InfraCollector.lastReadLine to null value
```

대시보드는 구 엔드포인트 `/infra/collector` 를 호출하고, 그 엔티티 `InfraCollector` 는
`lastReadLine` 등을 **primitive int/boolean** 으로 매핑한다. 컬럼이 NULL 이면 Hibernate 가
매핑 단계에서 터지므로, 한 행만 NULL 이어도 목록 조회 전체가 500 이 된다.

INSERT 시 다음 컬럼을 반드시 채울 것(기본값이 있는 것도 있으나 전부 확인 권장):

```sql
last_read_line=0, alive_check_time=0, regex_count=0,
timezone_hour=0, timezone_minute=0, timezone_is_add=true,
batch_size, collect_interval_seconds, retention_days,
is_deleted=false, is_disabled=false, is_running=false
```

기존 행 일괄 보정:

```sql
UPDATE log_sources SET
  last_read_line   = COALESCE(last_read_line, 0),
  alive_check_time = COALESCE(alive_check_time, 0),
  regex_count      = COALESCE(regex_count, 0),
  timezone_hour    = COALESCE(timezone_hour, 0),
  timezone_minute  = COALESCE(timezone_minute, 0),
  timezone_is_add  = COALESCE(timezone_is_add, true)
WHERE NOT is_deleted;
```

> 웹 콘솔(`/log/source` API)로 등록하면 서버가 기본값을 채우므로 이 문제가 없다.
> DB 직접 등록은 admin 비밀번호를 모를 때의 우회책이며, 가능하면 API 경로를 쓸 것.

---

# rsyslog 타임존 캐시로 OS 로그 시각이 13시간 어긋나던 문제 (2026-08-24)

## 증상

Filebeat 수집분을 검증하던 중, 색인된 문서의 `logTime` 과 `generatedTime` 이 어긋나는 것을 발견했습니다.

```
logTime        Aug 23 20:30:14          ← syslog 원문에 적힌 시각
generatedTime  2026-08-24T00:30:16Z     ← 실제 수집 시각 (= 09:30 KST)
message        [2026-08-24T09:30:14,955][INFO ][o.o.j.s.JobSweeper] ...
```

메시지 본문에는 `09:30:14` 로 찍혀 있는데 syslog 행 머리의 시각은 `Aug 23 20:30:14` 였습니다.
**13시간 차이**이며 날짜까지 하루 밀려 있었습니다.

## 원인

시스템은 정상이었습니다.

| 확인 | 결과 |
|---|---|
| `timedatectl` | Asia/Seoul (KST, +0900), 시각 동기화됨 |
| journald 출력 | `2026-08-24T09:31:24+0900` — 정상 |
| `/var/log/messages` | `Aug 23 20:31:02` — 13시간 느림 |

원인은 **rsyslogd 가 기동 시점의 타임존을 캐시**하고 있었다는 데 있습니다.

- `/etc/localtime` 이 Asia/Seoul 로 바뀐 시점: **2026-08-12 15:17**
- `rsyslogd` 프로세스 기동 시점: **2026-07-16 01:20**

즉 타임존 변경보다 **27일 먼저 떠 있던 프로세스**가 옛 타임존(UTC-4)으로 계속 기록하고 있었습니다.
glibc 는 프로세스 시작 시 타임존을 캐시하므로, `/etc/localtime` 을 바꿔도 이미 떠 있는 데몬에는 반영되지 않습니다.
프로세스 환경변수에 `TZ` 는 설정되어 있지 않았습니다.

## 조치

```bash
systemctl restart rsyslog
```

재기동 즉시 정상화되었습니다.

```
재기동 전  Aug 23 20:31:54 localhost ss-snmp-trap[232125]: trap sent.
재기동 후  Aug 24 09:32:00 localhost ss-snmp-trap[232125]: trap sent.   (시스템 시각 09:32:02 KST)
```

색인 결과도 정합해졌습니다.

```
logTime=Aug 24 09:32:56   generatedTime=2026-08-24T00:32:57Z
```

KST 09:32:56 과 UTC 00:32:57 은 같은 시각이며, 1초 차이는 수집 지연입니다.

## 영향 범위

**검색·정렬·탐지룰에는 영향이 없었습니다.** 이들은 `generatedTime` 을 사용하는데,
이 값은 Filebeat 의 `@timestamp` 에서 오므로 처음부터 정확했습니다.

**영향을 받는 것은 `logTime` 과 `rawData` 입니다.** 분석가가 원문 시각을 그대로 읽으면
13시간 이전 사건으로 오인할 수 있습니다. **2026-08-24 09:32 KST 이전에 수집된
10.1.30.4 의 Linux 로그**가 이에 해당하며, 해당 구간은 `generatedTime` 을 기준으로 판단해야 합니다.

## 재발 방지

타임존을 변경한 뒤에는 시각을 기록하는 데몬을 함께 재기동해야 합니다.

```bash
timedatectl set-timezone Asia/Seoul
systemctl restart rsyslog filebeat        # 시각을 찍는 데몬 재기동
```

향후 수집 대상 서버(WAS/WEB/GW)를 연동할 때도 동일하게 확인이 필요합니다.
장비 시각이 맞더라도 로그에 찍히는 시각이 다를 수 있으므로, 연동 직후
`logTime` 과 `generatedTime` 을 대조하는 절차를 검증 항목에 포함하시기 바랍니다.
