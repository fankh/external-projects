# Filebeat → Filebeat 중계 수집 구성

## 배경

원격 서버 5대의 OS·애플리케이션 로그를 Filebeat 로 수집하되, **Kafka(19092)는
외부에 열지 않는다**는 것이 결정된 방침입니다. Kafka 는 SIEM 서버의 루프백
(`listeners=PLAINTEXT://127.0.0.1:19092`)에 묶인 채로 둡니다.

따라서 원격 Filebeat 는 Kafka 로 직접 보내지 않고, SIEM 서버의 Filebeat 로 보냅니다.
SIEM Filebeat 가 이를 받아 로컬 Kafka 로 넘기면 `ss-log-stream` 이 파싱합니다.

```
원격 서버 Filebeat  ──lumberjack/TCP 5044──▶  SIEM Filebeat  ──▶ Kafka(localhost:19092)
                                                                      │
                                                              ss-log-stream
                                                                      │
                                                          OpenSearch siem-logs-YYYY-MM-DD
```

Logstash 는 설치하지 않습니다.

## Filebeat 가 Filebeat 를 수신하는 방법

Filebeat 8.14.3 에는 `beats` 입력이 **없습니다**. 서버에서 직접 확인한 결과입니다.

```
type: beats       → Exiting: No such input type exist: 'beats'
type: lumberjack  → Starting input (정상 기동)
```

대신 **`lumberjack` 입력**이 있고, 이것이 `output.logstash` 가 쓰는 프로토콜
(lumberjack v2)과 동일합니다. 즉 원격에서 `output.logstash` 로 보내면 Logstash 없이
SIEM 의 Filebeat 가 그대로 받습니다. 이름만 logstash 일 뿐 Logstash 는 관여하지 않습니다.

`lumberjack` 입력은 8.14 기준 **beta** 로 표기됩니다.

### 설정상의 함정 두 가지

**포트 지정** — `host:` 나 `listen_port:` 는 동작하지 않습니다. `host` 는 조용히
무시되어 기본 5044 로 뜨고, `listen_port` 를 쓰면
`listen tcp: address 127.0.0.1: missing port in address` 로 기동에 실패합니다.
`listen_address` 하나에 `호스트:포트` 를 모두 적어야 합니다.

```yaml
listen_address: "0.0.0.0:5044"      # 올바름
```

또한 `filebeat test config` 는 **입력 타입의 존재 여부를 검사하지 않습니다.**
없는 타입(`bogus_nonexistent`)을 써도 `Config OK` 가 나오므로, 실제 기동 로그로
확인해야 합니다.

**필드 중첩** — 수신한 이벤트의 필드는 루트가 아니라 `lumberjack.*` 아래로 들어갑니다.
`target: ""` 를 줘도 평탄화되지 않습니다. 따라서 SIEM 쪽에서 `copy_fields` 로
`deviceIp` 등을 루트로 끌어올린 뒤 `lumberjack` 을 제거해야 합니다.

## SIEM 측 설정에서 주의할 점

기존 `/etc/filebeat/filebeat.yml` 은 `processors:` 를 **전역**에 두고 있었습니다.
전역 processors 는 모든 입력에 적용되므로, lumberjack 입력을 추가하면 중계된
이벤트의 `deviceIp` 까지 SIEM 자신의 IP(10.1.30.4)로 덮어쓰고 `generatedTime` 도
원격 발생시각이 아닌 SIEM 수신시각으로 바뀝니다.

이를 막기 위해 processors 를 **입력별로 분리**했습니다.

- `filestream` 입력 — SIEM 자신의 OS 로그. `deviceIp: 10.1.30.4` 부여
- `lumberjack` 입력 — 중계 수신. `lumberjack.*` 를 루트로 승격, 원격이 보낸
  `deviceIp` / `generatedTime` 을 그대로 보존

`generatedTime` 은 원격 값이 없으면 `lumberjack.@timestamp`, 그것도 없으면 SIEM
수신시각 순으로 보정하며, 어느 경우든 **밀리초를 잘라냅니다**. 인덱스 매핑이
`strict_date_time_no_millis` 라 밀리초가 붙으면 색인이 전건 거부됩니다.

## 검증 결과 (2026-08-25)

SIEM 서버에서 원격 시나리오를 그대로 재현했습니다. `deviceIp: 10.1.30.2` 로 표시한
sshd 로그 한 줄을 `output.logstash → 10.1.30.4:5044` 로 보냈습니다.

색인된 문서는 다음과 같습니다.

| 필드 | 값 |
|------|-----|
| deviceIp | 10.1.30.2 |
| device | AIG_WAS01_Linux |
| vendor / deviceModel | Linux / Syslog |
| eventType | linux_syslog |
| machineName | was01 |
| processName / processId | sshd / 9911 |
| message | Accepted password for … |
| sourceIp | 10.1.30.2 |
| generatedTime | 2026-08-25T04:23:06Z (초 단위) |

Log Source 매칭, 파서 적용, 표준 필드 산출까지 정상입니다. 검증에 쓴 테스트 문서는
삭제했습니다(`_delete_by_query`, deleted=1).

`rawData` 는 `keyword` 매핑이라 `match_phrase` 로 부분 문자열을 찾을 수 없습니다.
수집 확인은 `term` 질의(`deviceIp`)나 집계로 하십시오.

## 적용 상태

| 대상 | 상태 |
|------|------|
| SIEM 10.1.30.4 Filebeat | **적용 완료** — lumberjack 5044 수신, 백업 `filebeat.yml.bak-relay-20260825-132227` |
| 방화벽 5044/tcp | 이미 개방되어 있음 |
| Kafka 19092 | 변경 없음. 루프백 유지 |
| WAS02 10.1.30.3 | **적용 완료** (2026-08-27) — 아래 절 참조 |
| 원격 나머지 4대 | **미적용** — 서버 접근 권한 확보 후 `40-install-filebeat-server.sh` 실행 필요 |

## WAS02 (10.1.30.3) 적용 결과 — 2026-08-27

Filebeat 는 이미 설치되어 있었고(**9.5.0**, SIEM 은 8.14.3), `enabled` 이지만
`inactive` 상태였습니다. `output.logstash` 도 `10.1.30.4:5044` 로 미리 지정돼
있었으나 입력이 `enabled: false` 라 아무것도 보내지 않고 있었습니다.

버전이 서로 달라도(9.5.0 → 8.14.3) lumberjack v2 로 정상 통신함을 실측으로
확인했습니다.

### 수집 대상 선정

| 대상 | 경로 | 비고 |
|------|------|------|
| OS | `/var/log/messages`, `secure`, `cron` | `linux_syslog` 파서로 정상 파싱됨 |
| 애플리케이션 | `/logs/dars/aig-was.log`, `aig-was.ERROR.log` | Spring Boot. 스택트레이스 multiline 처리 |
| Tomcat | `/logs/tomcat/catalina.out` | 타임스탬프가 없어 공백 시작 줄만 연속 처리 |
| Access | `/logs/tomcat/localhost_access_log.*.txt` | `ignore_older: 48h` |

제외한 것이 둘 있습니다. `/logs/dars/app.log` 는 `aig-was.log` 와 내용이 동일해
중복이므로 뺐습니다. `aig-was.YYYYMMDD.ERROR.log` 는 `aig-was.ERROR.log` 의 일자별
회전본이라, 함께 수집하면 같은 이벤트가 두 번 들어갑니다.

`/logs/keypad` 는 파일이 0 byte 이고 7월 이후 갱신이 없어 대상에서 제외했습니다.

### 검증 결과

세 갈래 모두 SIEM 에 도달했습니다.

| 유형 | 건수 | eventType |
|------|------|-----------|
| OS syslog | 4,167 | `linux_syslog` (정상 파싱) |
| Spring Boot | 180 | **없음** (파서 미등록) |
| catalina.out | 1,591 | **없음** (파서 미등록) |

OS 로그는 `machineName` / `processName` / `processId` / `message` / `sourceIp` 까지
표준 필드가 산출됩니다. 애플리케이션 로그는 `rawData` 는 보존되지만 파서가 없어
`eventType` 이 비어 있습니다. **애플리케이션 로그용 파서 등록이 후속 과제입니다.**

백업은 `/etc/filebeat/filebeat.yml.bak-aig-20260827-*` 입니다.

### 참고 — 이 호스트의 sudo 동작

WAS02 는 `operuser` 가 NOPASSWD 가 아니고 TTY 를 요구합니다. 기존 `siemssh.py` 의
sudo 경로로는 출력이 유실되어, pty 로 비밀번호를 넣고 종료 표식까지 읽는
`rsh.py` 헬퍼를 따로 썼습니다.

## 남은 보안 조치 (권고)

1. **5044 출발지 제한** — 현재 5044/tcp 가 전 대역에 열려 있습니다. 5대로 한정하는
   rich-rule 적용을 권고합니다.

   ```bash
   firewall-cmd --permanent --remove-port=5044/tcp
   for ip in 10.1.30.2 10.1.30.3 211.47.20.228 211.47.20.229 211.47.20.230; do
     firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=${ip} port port=5044 protocol=tcp accept"
   done
   firewall-cmd --reload
   ```

2. **TLS 적용** — WEB 2대와 Gateway 는 공인 대역(211.47.20.x)이라 로그가 평문으로
   흐릅니다. lumberjack 입력과 `output.logstash` 양쪽에 `ssl` 설정을 넣는 것을
   권고합니다. 템플릿에 주석으로 자리를 잡아 두었습니다.

## 파일

| 파일 | 용도 |
|------|------|
| `filebeat-siem-10.1.30.4.yml` | SIEM 서버 설정 (적용본과 동일) |
| `filebeat-server-template.yml` | 원격 5대용 템플릿. `__SERVER_IP__` 치환 필요 |
| `40-install-filebeat-server.sh` | 원격 서버 설치·구성 자동화 |
