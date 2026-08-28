# 원격 로그 수집 현황 (2026-08-23)

기준 문서: `workbooks/AIG_로그수집정보_20260806.xlsx`

## 결론부터

**원격 호스트에서 들어오는 로그는 아직 한 건도 없다.** 색인된 로그의 송신 장비를 집계하면
`10.1.30.4` 단 하나이며, udp/514 를 15초간 패킷 캡처해도 원격 발신 트래픽이 잡히지 않는다.
그런데 문서상 `10.1.30.4`(SIEM 자신)는 **대상아님**이다 — 즉 지금 수집되는 유일한 장비가
수집 대상이 아닌 장비다.

## 이번에 푼 것 — 수신측 방화벽

firewalld 에 syslog 포트가 아예 열려 있지 않았다. 장비를 아무리 설정해도 로그가 도달할 수 없는 상태였다.

```
변경 전: 5044/tcp 9348/tcp
변경 후: 514/tcp 5044/tcp 9348/tcp 162/udp 514/udp  (+ https 서비스)
```

## SIEM 측 등록 상태

`Found 6 collectors` / `Parser configs loaded - syslog: 6` 으로 반영 완료.

| Log Source | IP | 상태 |
|---|---|---|
| AIG_WAS01_Linux | 10.1.30.2 | 등록됨, 수신 0건 |
| AIG_WAS02_Linux | 10.1.30.3 | 등록됨, 수신 0건 |
| AIG_WEB01_Nginx | 211.47.20.228 | 등록됨, 수신 0건 |
| AIG_WEB02_Nginx | 211.47.20.229 | 등록됨, 수신 0건 |
| AIG_GW01_Linux | 211.47.20.230 | 등록됨, 수신 0건 |
| AIG_SIEM_Host_Linux | 10.1.30.4 | 수신 중(문서상 대상아님 — 유지 여부 확인 필요) |

## 수신 경로 검증 완료 — ss-syslog-receiver 는 정상이다

Agent 없이도 장비가 `10.1.30.4:514` 로 쏘면 수집된다. 두 형식 모두 실제로 색인되는 것을 확인했다.

| 보낸 형식 | rawData | 결과 |
|---|---|---|
| RFC3164 (wire) | `<13>Aug 23 14:04:08 localhost aig-w2: ...` | `eventType=syslog_rfc3164`, priority/machineName/processName/message 추출 |
| RFC5424 (wire) | `<13>1 2026-08-23T14:03:08...+09:00 localhost ...` | `eventType=syslog_rfc5424`, appName 까지 추출 |

### 여기서 걸렸던 것 — `<PRI>` 접두

ss-syslog-receiver 가 넣는 `rawData` 에는 `<13>` 같은 priority 접두가 붙는다.
반면 Filebeat 는 파일에서 읽은 줄을 그대로 넣어 접두가 없다. **같은 syslog 라도 rawData 모양이 다르다.**
처음에 Filebeat 기준 파서 하나만 두었더니 장비가 보낸 syslog 는 Kafka 까지 도달하고도 전부 파싱 실패로 버려졌다.

그래서 소스마다 파서를 3개씩 둔다.

| 파서 | 대상 경로 | priority |
|---|---|---|
| Linux Syslog RFC3164 | Filebeat (접두 없음) | 0 |
| Syslog RFC3164 (wire, PRI) | ss-syslog-receiver | 1 |
| Syslog RFC5424 (wire, PRI) | ss-syslog-receiver | 2 |

세 정규식은 서로 배타적이라(`^<` 유무) 순서에 관계없이 오매칭하지 않는다.

> `Parser configs loaded - syslog: 6` 의 6은 파서 총수(18)가 아니라 **소스 수**다. 파서가 안 붙은 걸로 오해하지 말 것.

## 남은 작업 — 전부 발신측(호스트/장비)에 있다

### 서버 5대

SIEM → 대상 서버는 ping 이 되고 **SSH 는 9348 포트가 열려 있다**(22 는 닫힘).
각 서버에서 다음 중 하나가 필요하다.

- rsyslog 포워딩: `*.* @10.1.30.4:514` 추가 후 rsyslog 재시작, 또는
- Filebeat 설치: 10.1.30.4 에 적용한 설정을 그대로 쓰되 `deviceIp` 를 해당 서버 IP 로 바꿀 것.
  **`generatedTime` 은 반드시 초 단위**여야 한다(`INGEST-TROUBLESHOOTING.md` 참조).

문서상 수집 경로는 OS 로그(`/var/log/messages`, `secure`, `cron`, `audit`)에 더해
WAS 는 `/logs/dars`·`/logs/tomcat`·`/logs/keypad`, WEB 은 `/logs/nginx`,
Gateway 는 `/logs/gateway` 까지 포함한다. 파일 경로 수집은 Agent 방식이라야 한다.

> 서버 5대는 rsyslog 포워딩만 걸어도 OS 로그가 즉시 들어온다(위 wire 파서가 이미 붙어 있음).
> `/logs/dars`·`/logs/nginx` 같은 애플리케이션 **파일** 로그는 rsyslog 로는 안 되고 Filebeat 가 필요하다.

### 네트워크 장비 7종

WAF(모니터랩), Fortigate 3대(AIG_SSLVPN / AIG_IPS_VPN / FW), Piolink L4 2대, HP L3 Switch.
**문서에 관리 IP 가 없어 등록하지 못했다.** IP 를 받으면 등록 후 각 장비에서
syslog 서버를 `10.1.30.4:514` 로 지정하면 된다.

장비 유형은 이미 시드되어 있다(Fortinet FortiGate 60F/100F/200F). 모델이 확정되면 매칭할 것.
모니터랩·Piolink·HP 는 시드에 없어 `기타 장비` 로 잡거나 사용자 정의 장비 유형을 만들어야 한다.


## 부수 발견 — 수신기 로그가 기록되지 않는다

`/opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log` 가 **0 bytes, root:root** 인데
서비스는 `seekurity` 로 돌아 파일에 쓰지 못한다. journalctl 에도 기동 메시지 한 줄뿐이라
수신기 쪽은 사실상 로그가 없는 상태다. 수집 동작 자체는 정상이지만, 장애 시 추적이 어렵다.
소유권을 `seekurity:seekurity` 로 바꾸는 것을 권한다(이번 작업 범위 밖이라 손대지 않았다).

---

## 서버 5대가 왜 0건인가 (2026-08-23 확인)

"장비가 죽었나 / 네트워크가 막혔나" 가 아니다. **아예 보내지 않고 있다.**

| 확인 | 결과 |
|---|---|
| SIEM 에서 ping | 5대 모두 응답 O |
| FortiGate 로그상 활동 | 10.1.30.2 271건, 10.1.30.3 270건, 211.47.20.228 271건, 211.47.20.229 270건, 211.47.20.230 1건 |
| 그중 SIEM(10.1.30.4) 向 | **전부 0건** |
| 통신 중인 목적지 포트 | 18080(539), 443(539), 123(5) — syslog 없음 |
| SIEM 에서 60초 패킷 캡처(포트 무관) | **0 패킷** |
| 대조군 10.1.1.1 | 같은 시간 15초에 36 패킷 |

즉 5대는 살아 있고 방화벽도 통과하며 정상 통신 중인데, **SIEM 으로는 단 한 패킷도 보내지 않는다.**

### 왜 그런가

SIEM 에 Log Source 를 등록하는 것은 "이 IP 에서 로그가 오면 이렇게 파싱하라" 는 **수신측 준비**일 뿐이다.
장비가 로그를 보내게 만드는 것은 **발신측 설정**이며, 이 5대에는 rsyslog 포워딩도 Filebeat 도 설정된 적이 없다.

FortiGate(10.1.1.1)가 방화벽만 열자마자 바로 들어온 것은, 그 장비에는 이미 누군가
syslog 서버를 10.1.30.4 로 지정해 두었기 때문이다. 5대는 그 설정이 없다.

### 세 가지 상태를 구분할 것

| 상태 | 해당 | 필요한 조치 |
|---|---|---|
| 보내는데 방화벽이 막음 | 211.47.6.115 | FortiGate policy 35 에 허용 추가 |
| 보내려면 설정이 필요 | WAS/WEB/GW 5대 | 각 서버에 rsyslog/Filebeat 설정 |
| 보내고 있고 수집됨 | 10.1.1.1, 10.1.30.4 | 없음 |
