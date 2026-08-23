# 원격 유입 검증 (tcpdump, 2026-08-23)

## 먼저 정정 — 이전 "패킷 캡처 결과 없음" 은 근거가 없었다

앞선 검증에서 `tcpdump ... 2>/dev/null` 로 udp/514 를 관찰해 "원격 발신 트래픽 없음" 이라고 했으나,
**이 서버에는 tcpdump 가 설치되어 있지 않았다.** stderr 를 버려서 `command not found` 가 보이지 않았고,
빈 출력을 "트래픽 없음" 으로 오독한 것이다. 당시 결론(10.1.30.4 만 수집됨) 자체는 OpenSearch 집계라는
독립적인 근거로 맞았지만, 캡처 근거는 무효였다.

`dnf install -y tcpdump` 로 설치(4.99.0) 후 다시 검증했다.

## 검증 1 — 작업 PC(10.212.134.110) → SIEM

UDP/514 5건 전송 + TCP/514, TCP/5044 연결 시도 + TCP/443(대조군) 을 동시에 실행하고
서버에서 `tcpdump -nn -i any "host 10.212.134.110 and not port 9348"` 로 40초 캡처.

| 보낸 것 | 서버 도착 |
|---|---|
| UDP/514 x5 | **0건** |
| TCP/514 | **도착 없음** (TimeoutError) |
| TCP/5044 | **도착 없음** (TimeoutError) |
| TCP/443 (대조군) | 도착, 연결 성공 |

캡처된 37 패킷은 **전부 443**. 서버 firewalld 는 514/udp 가 열려 있고(zone=public, eno16795)
경로도 `10.1.30.254` 게이트웨이로 잡히므로, **중간 네트워크 구간에서 514 가 차단**된다.
작업 PC 대역(10.212.134.0/24)에서는 SIEM 으로 9348/443 만 통한다.

## 검증 2 — 실제 장비 유입 발견

`tcpdump -nn -i any "(port 514 or port 162) and not host 127.0.0.1"` 로 60초 관찰:

**60초간 312 패킷 수신 — 전부 `10.1.1.1` 에서.** `SYSLOG local7.notice`, 길이 600~800 bytes.

페이로드를 열어보니 FortiGate key=value 로그였다:

```
<189>date=2026-08-23 time=14:32:38 devname="AIG_SSLVPN_FW" devid="FGT81FTK22009400"
type="traffic" subtype="local" level="notice" srcip=... dstip=... action="deny" ...
```

문서(`AIG_로그수집정보_20260806.xlsx`)의 **AIG_SSLVPN (Fortigate)** 이며, 비어 있던 관리 IP 가 `10.1.1.1` 로 확인됐다.
실제 모델은 FortiGate **81F**(devid FGT81FTK22009400)로 시드에 없어 장비 유형을 새로 만들었다.

> 이 장비는 계속 로그를 쏘고 있었지만 firewalld 에 514 가 없어 커널 단에서 버려지고 있었다.
> 포트를 연 뒤에야 도달하기 시작했고, 그때도 Log Source 미등록이라 파싱 단계에서 다시 버려졌다.

### 등록 후 결과

| 항목 | 값 |
|---|---|
| Log Source | `AIG_SSLVPN_FW` / 10.1.1.1 / FortiGate 81F |
| 파서 | KV(traffic) + KV(generic fallback) 2종 |
| 색인 | **226건** (재기동 직후 기준), 색인 실패 0 |
| 추출 필드 | deviceName, deviceId, eventCategory, level, srcIp, srcPort, dstIp, dstPort, action |
| action 분포 | close 82 / deny 82 / accept 78 / server-rst 13 |

`srcIp`/`dstIp` 는 인덱스 dynamic template(`*Ip` → type ip)에 걸려 IP 타입으로 매핑된다.

## 남은 장비의 도달성 전망

| 대상 | 대역 | 전망 |
|---|---|---|
| WAS 10.1.30.2 / .3 | SIEM 과 동일 대역(10.1.30.0/24) | 라우팅 불필요, 도달 가능성 높음 |
| WEB/GW 211.47.20.228~230 | 외부/DMZ | 중간 방화벽 정책 확인 필요 |
| WAF·Piolink·HP·나머지 Fortigate | 미확인 | 관리 IP 확보 후 등록 |

작업 PC 대역에서 514 가 막힌 것으로 보아, **각 대역에서 SIEM 514/udp 로의 허용 정책이 개별로 필요**하다.
`AIG_방화벽정책.xlsx` 에 반영할 항목이다.
