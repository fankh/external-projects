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

### 네트워크 장비 7종

WAF(모니터랩), Fortigate 3대(AIG_SSLVPN / AIG_IPS_VPN / FW), Piolink L4 2대, HP L3 Switch.
**문서에 관리 IP 가 없어 등록하지 못했다.** IP 를 받으면 등록 후 각 장비에서
syslog 서버를 `10.1.30.4:514` 로 지정하면 된다.

장비 유형은 이미 시드되어 있다(Fortinet FortiGate 60F/100F/200F). 모델이 확정되면 매칭할 것.
모니터랩·Piolink·HP 는 시드에 없어 `기타 장비` 로 잡거나 사용자 정의 장비 유형을 만들어야 한다.
