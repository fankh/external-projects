# 파서 필드명 규약 (Seekurity SIEM)

파서를 만들 때 **필드명을 임의로 정하면 안 됩니다.** 콘솔 화면이 고정된 표준 이름을
직접 읽도록 만들어져 있어, 이름이 다르면 정규식이 정상 동작하고 값이 색인되어 있어도
화면에는 아무것도 표시되지 않습니다.

AIG 구축에서 실제로 이 문제가 발생했습니다. `srcIp` / `dstPort` 같은 이름을 쓴 결과
로그 목록과 상세 화면의 주요 항목이 전부 `-` 로 표시되었습니다.

## 표준 필드명

콘솔 번들에서 확인한 값입니다.

| 화면 라벨 | 필드명 | 비고 |
|---|---|---|
| Generated Time | `generatedTime` | 제품이 채움 |
| Device | `device` | 제품이 채움 (Log Source 이름) |
| Event Name | `eventName` | **파서가 채워야 함** |
| Source IP | `sourceIp` | 아래 주의사항 참조 |
| Source Port | `sourcePort` | **파서가 채워야 함** |
| Destination IP | `destinationIp` | **파서가 채워야 함** |
| Destination Port | `destinationPort` | **파서가 채워야 함** |
| Protocol | `protocol` | **파서가 채워야 함** |
| Username | `username` | **파서가 채워야 함** |
| Length | `length` | |

제품 기본 파서(SECUI MF2)도 같은 규약을 따릅니다.

```
generatedTime, eventName, startTime, machineName, fwRuleId, action,
packetsForward, bytesForward, packetsReverse, bytesReverse
```

## 이 이름들이 쓰이는 곳

로그 상세(Log Detail) 패널뿐 아니라 **로그 검색 목록의 컬럼 자체**가 이 필드를 읽습니다.

```
헤더 : Generated Time | Device | Event Name | Source IP | Destination IP | Source Port | Destination Port
현재 : 2026-08-24 ... | AIG_SSLVPN_FW |   -   |  10.1.30.4 |   -   |   -   |   -
```

즉 필드명이 어긋나면 **로그 검색 화면이 사실상 쓸 수 없는 상태**가 됩니다.
대시보드·리포트·탐지룰도 같은 이름을 전제하므로 함께 영향을 받습니다.

## 주의 — `sourceIp` 는 이미 채워져 있습니다

제품이 모든 문서에 `sourceIp` 를 넣는데, 그 값은 **송신 장비의 IP** 입니다.
방화벽 로그에서 위 목록의 Source IP 열에 `10.1.1.1`(방화벽 자신)이 보이는 이유입니다.

파서가 트래픽 출발지를 같은 이름으로 넣으면 이 값을 덮어씁니다.
방화벽·IPS 로그에서는 트래픽 출발지가 표시되는 편이 타당하지만,
장비 IP 를 전제하는 화면이 있는지 확인한 뒤 적용해야 합니다.

## 새 파서를 만들 때의 절차

1. 기존 시스템 파서의 규약을 먼저 확인합니다.

```sql
SELECT DISTINCT fields FROM log_device_type_parsers;
```

2. 위 표에 있는 항목은 반드시 표준 이름을 씁니다.
3. 표에 없는 벤더 고유 값(예: `policyId`, `sessionId`)은 자유롭게 명명하되,
   camelCase 로 통일합니다.
4. 등록 후 콘솔에서 로그 목록과 상세 화면에 값이 표시되는지 눈으로 확인합니다.
   색인이 되었다고 해서 화면에 나오는 것은 아닙니다.

## 현재 AIG 파서 적용 현황

| 파서 | 표준 필드 적용 | 비고 |
|---|---|---|
| FortiGate KV (traffic) | 예정 | FIX-004/005 로 조치 요청됨 |
| FortiGate KV (no-port) | 예정 | FIX-005 로 신설 예정 |
| FortiGate KV (generic) | 미적용 | fallback |
| Linux Syslog RFC3164 | **미적용** | `machineName`/`processName`/`message` 사용 중 |
| Syslog RFC3164 (wire) | **미적용** | 동일 |
| Syslog RFC5424 (wire) | **미적용** | 동일 |

Linux 계열은 네트워크 필드가 없어 영향이 작지만, `eventName` 과 `username` 은
채우는 편이 좋습니다. 특히 `sshd` 인증 로그의 계정명을 `username` 으로 뽑아 두면
계정 기반 탐지룰을 만들 수 있습니다. 후속 과제로 남깁니다.
