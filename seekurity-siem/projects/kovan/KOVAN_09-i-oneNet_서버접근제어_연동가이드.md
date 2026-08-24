# KOVAN 연동 가이드 — i-oneNet(망연계) 및 서버 접근제어(Hiware)

- 대상: KOVAN SIEM
- 작성일: 2026-08-24
- 근거: 휴네시온(i-oneNet)·제이콥시스템(서버 접근제어) 연동 정보 회신 + i-oneNet 표준 syslog 정의서 + syslog_query(lastkey/contents.query)

---

## 1. 개요 — 두 개의 연동

| 연동 대상 | 제품/벤더 | 수집 방식 | 접속 정보 |
|-----------|-----------|-----------|-----------|
| **i-oneNet** | 망연계 (휴네시온) | **Syslog Push** (i-oneNet → SIEM UDP 514) | i-oneNet 서버가 능동 전송 |
| **서버 접근제어** | Hiware / SAM (제이콥시스템) | **DB 수집 (JDBC)** | MariaDB 10.1.1.111 : 3306 |

- i-oneNet: 벤더측 서버에서 Syslog 전송 설정이 사전 완료됨. SIEM은 **수신만** 하면 됨.
- 서버 접근제어: SIEM이 MariaDB의 제공 VIEW를 **폴링(SELECT)**하여 수집.

---

## 2. i-oneNet (망연계) — Syslog 수신 연동

### 2.1 벤더측 구성 (참고, 이미 완료됨)

- Syslog 전송 설정 경로: `/data/onenet/onenetbin/onenet_syslog`
- 설정 파일:
  - `lastkey.query` : 특정 테이블의 마지막 시퀀스(max idx) 추출
  - `contents.query` : 시퀀스 참조하여 이력 세부내용 추출 후 Syslog로 전송
- i-oneNet은 event_tab 등 자체 DB를 위 쿼리로 읽어 Syslog로 Push함. SIEM이 DB에 접속하지 않음.

### 2.2 Syslog 메시지 형식 (2종)

**(A) 시스템/엔진 이벤트** — 대괄호 형식
```
FTC[2016-05-19 17:24:41.795][5][01] TcpProxyListener(204) : LISTEN timeout For ACCEPT(Active, TCP:5, UDP:1, Total:6) session(3,3)
```
- 구조: `TAG[YYYY-MM-DD hh:mm:ss.ms][level][process_id] Module(line) : message`

**(B) 감사 이벤트** — 파이프 구분 형식 (contents.query 산출)
```
항목:{code_name}|등록시간:{regdt}|작업자:{contact}|접속IP:{connip}|내용:{contents}
```
- 추출 유용 필드: 작업자(username), 접속IP(sourceIp), 항목(eventName), 등록시간, 내용

### 2.3 SIEM 수신 검증 — tcpdump (필수, 로그 인입 확인)

로그 소스 등록 전, i-oneNet이 실제로 Syslog를 보내는지 먼저 확인한다.

```bash
# i-oneNet 서버에서 오는 UDP 514 syslog 실시간 확인 (I-ONENET_IP를 실제 IP로 교체)
sudo tcpdump -i any -n -A 'udp port 514 and host <I-ONENET_IP>'

# 특정 인터페이스만: -i ens160 등
# 패킷은 오지만 내용 확인이 필요하면 -A(ASCII) 유지, -X(hex+ascii)도 가능
sudo tcpdump -i any -n -X 'udp port 514 and host <I-ONENET_IP>' -c 20

# ss-syslog-receiver가 514를 점유 중인지 확인
ss -ulnp | grep ':514'
```

- 패킷이 보이면 → SIEM 수신 정상, 파서/로그소스 등록으로 진행.
- 패킷이 안 보이면 → 방화벽(UDP 514) 또는 i-oneNet 전송 대상 설정 확인. i-oneNet 측(휴네시온)에 전송 IP/포트 재확인 요청.

### 2.4 로그 소스 + 파서 등록

콘솔의 로그 소스 관리에서 i-oneNet 서버 IP로 syslog 로그 소스를 등록하고, 아래 파서를 추가한다.
(rawData 기준 정규식. generatedTime은 syslog 봉투/파서에서 처리.)

- 파서 1 (감사 이벤트, 파이프 형식):
  ```
  항목:([^|]*)\|등록시간:([^|]*)\|작업자:([^|]*)\|접속IP:([^|]*)\|내용:(.*)
  ```
  필드: `eventName,generatedTime,username,sourceIp,detail`

- 파서 2 (시스템 이벤트, 대괄호 형식):
  ```
  ^(\w+)\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+)\]\[(\d+)\]\[(\d+)\]\s*([\w]+)\((\d+)\)\s*:\s*(.*)
  ```
  필드: `tag,generatedTime,level,processId,module,line,detail`
  time_format: `yyyy-MM-dd HH:mm:ss.SSS`

> 실제 전송 샘플을 tcpdump로 확보한 뒤 정규식을 최종 검증할 것. 형식이 다르면 샘플에 맞춰 조정.

---

## 3. 서버 접근제어 (Hiware / SAM) — DB(JDBC) 수집 연동

### 3.1 접속 정보

| 항목 | 값 |
|------|-----|
| DBMS | MariaDB |
| Host / Port | 10.1.1.111 / TCP 3306 |
| 스키마 | VIEWDB (제공 VIEW 대상) |
| 조회 | `SELECT * FROM VIEWDB.[VIEW명]` |
| 계정 | 별도 전달 (읽기 전용 권장) |

### 3.2 수집 대상 VIEW (8종)

| VIEW | 설명 |
|------|------|
| VW_KOVAN_USER_LIST | 사용자 목록 |
| VW_KOVAN_USER_LOGIN_HIST | 사용자 접속 이력 |
| VW_KOVAN_SESS_INTGT_HIST_SUCES | 세션 통합이력(성공) |
| VW_KOVAN_SESS_INTGT_HIST_FAIL | 세션 통합이력(실패) |
| VW_KOVAN_SAM_CMD_USE_HIST | 명령어별 접근 이력 |
| VW_KOVAN_SAM_SESS_SHUT_HIST | 정책 위반 차단 이력 |
| VW_KOVAN_SAM_PERIOD_ACCESS_HIST | 기간별 접근이력 |
| VW_KOVAN_SAM_EQMT_CONN_ILLEGAL_HIST | 불법 접속 시도 이력 |

### 3.3 연결 검증 (수집 전 사전 점검)

DB 수집은 SIEM→MariaDB 아웃바운드이므로 tcpdump는 인입이 아닌 연결 확인 용도로 사용한다.

```bash
# 포트 도달성
nc -vz 10.1.1.111 3306

# MariaDB 클라이언트로 VIEW 조회 확인 (계정 수령 후)
mysql -h 10.1.1.111 -P 3306 -u <USER> -p -e "SELECT * FROM VIEWDB.VW_KOVAN_USER_LOGIN_HIST LIMIT 5;"

# SIEM→MariaDB 세션 확인(연결 트래픽)
sudo tcpdump -i any -n 'tcp port 3306 and host 10.1.1.111' -c 20
```

### 3.4 SIEM DB 로그 소스 등록

콘솔의 로그 소스 관리에서 DB(JDBC) 유형으로 VIEW별(또는 대표 VIEW) 로그 소스를 등록한다.

- 드라이버: MariaDB/MySQL (`org.mariadb.jdbc.Driver`)
- JDBC URL: `jdbc:mariadb://10.1.1.111:3306/VIEWDB`
- 수집 쿼리: `SELECT * FROM VIEWDB.VW_KOVAN_USER_LOGIN_HIST WHERE <추적컬럼> > ?`
- 증분 수집: 각 VIEW의 시퀀스/일시 컬럼을 tracking_column으로 지정(중복 수집 방지). 컬럼명은 VIEW 정의 확인 후 지정.
- 수집 주기(collect_interval_seconds): 60~300초 권장.

> VIEW의 컬럼 구조(특히 증분 추적용 PK/일시 컬럼)를 제이콥시스템에 확인해 tracking_column을 지정할 것. 없으면 전량 조회로 중복 발생.

---

## 4. 수집 후 검증 (공통)

```bash
# 인입 후 인덱싱 확인 (몇 분 후)
curl -s 'http://localhost:19200/siem-logs-*/_count' | python3 -m json.tool

# i-oneNet 소스 확인 (deviceIp = i-oneNet IP)
curl -s 'http://localhost:19200/siem-logs-*/_search?size=3&q=deviceIp:<I-ONENET_IP>' | python3 -m json.tool

# 파싱 결과(작업자/접속IP 추출) 확인 후 필요 시 파서 정규식 조정
```

- log-stream 파서 캐시는 10분 자동 리로드. 즉시 반영은 `sudo systemctl restart ss-log-stream`.

---

## 부록 A. 확인 필요 사항 (현장)

1. i-oneNet 서버 IP (Syslog 출발지) — tcpdump 필터 및 로그소스 IP에 필요.
2. i-oneNet 실제 전송 샘플 몇 줄 — 파서 정규식 최종 검증용.
3. 서버 접근제어 MariaDB 읽기 계정/비밀번호 — 별도 전달.
4. 각 VIEW의 증분 추적 컬럼(PK/일시) — 중복 수집 방지용 tracking_column 지정.
