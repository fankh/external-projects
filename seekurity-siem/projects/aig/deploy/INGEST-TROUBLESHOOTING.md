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
