# Linux 서버 로그 연동 가이드 (설치 공통 컨텍스트)

Seekurity SIEM v3에 Linux 서버 로그를 연동하는 표준 방법을 정의한다.
설치 담당자가 고객사 구분 없이 참조할 수 있는 공통 문서이다.

## 1. 결론 (수집 경로 선택)

| 경로 | 구성 | 권장도 | 비고 |
|------|------|--------|------|
| A. rsyslog → 514 | rsyslog → UDP 514 → ss-syslog-receiver | 주 경로 (권장) | 어플라이언스 기본 구성에서 즉시 동작. 외부 수집 표준 포트 |
| B. Filebeat → Kafka | Filebeat → Kafka 19092 (siem-logs) → ss-log-stream | 조건부 (특정 고객 전용) | Kafka는 내부 브로커이므로 원격 접속하려면 재구성 필요. 아래 4항 참조 |

기본적으로 **경로 A(rsyslog → 514)를 사용한다.** Filebeat는 특정 고객사(예: AIG)가 3rd-party 에이전트 사용을 요구하는 경우에 한해 검토하며, 이때는 4항의 제약을 반드시 확인한다.

### 1.1 포트가 비표준인 이유와 접근 구분

제품은 관리·데이터 서비스에 well-known 포트를 사용하지 않는다. 외부에서 로그를 보내는 포트와 내부 전용 포트가 구분되므로 혼동하지 않는다.

| 서비스 | 포트 | 접근 | 외부 로그 수집 용도 |
|--------|------|------|---------------------|
| ss-syslog-receiver | 514/UDP | 외부 | Syslog 수신 (로그 유입 포트) |
| Kafka | 19092/TCP | 내부 | 컴포넌트 간 메시지 브로커 (기본은 원격 미허용) |
| OpenSearch | 19200/TCP | 내부 | 검색 엔진 |
| PostgreSQL | 15432/TCP | 내부 | 설정 DB |

## 2. 경로 A. rsyslog → 514 (권장)

### 2.1 구성

```
Linux 서버 (rsyslog) --UDP 514--> ss-syslog-receiver --> Kafka(localhost) --> ss-log-stream --> OpenSearch
```

ss-syslog-receiver가 수신 패킷의 발신 IP를 기준으로 SIEM 내부 형식을 자동 구성하므로, Linux 서버 측은 rsyslog 포워딩 설정만 하면 된다.

### 2.2 사전 확인

```bash
# SIEM 방향 UDP 514 도달 확인 (SIEM_IP 는 수집 서버 주소)
nc -zvu {SIEM_IP} 514
```

방화벽 정책: Linux 서버 → {SIEM_IP} UDP 514 오픈 필요.

### 2.3 rsyslog 포워딩 설정

```bash
# /etc/rsyslog.d/60-seekurity-siem.conf 생성
sudo tee /etc/rsyslog.d/60-seekurity-siem.conf > /dev/null << 'CONF'
# Seekurity SIEM 로그 전송 (@ = UDP, @@ = TCP)
*.info;mail.none;authpriv.none;cron.none  @{SIEM_IP}:514
authpriv.*                                @{SIEM_IP}:514
CONF

# 문법 검증 후 재시작
sudo rsyslogd -N1
sudo systemctl restart rsyslog
```

auditd 감사 로그(`/var/log/audit/audit.log`)를 함께 보내려면 audisp-syslog(또는 audisp-remote)를 활성화하거나 rsyslog imfile 모듈로 해당 파일을 읽어 전송하도록 별도 구성한다.

### 2.4 SIEM 등록

관리 콘솔에서 아래를 등록한다.

1. 인프라 관리 > 수집기: Syslog 유형으로 등록, IP 주소 = Linux 서버 발신 IP
2. 해당 수집기에 파서(정규식) 등록. 등록 전까지는 수집·저장되나 미파싱 상태로 인덱싱된다.

### 2.5 검증

```bash
# 서버에서 테스트 이벤트 발생
logger -p authpriv.info "SIEM syslog integration test"
```

관리 콘솔 검색에서 위 메시지가 조회되면 연동 완료.

## 3. rsyslog 사용 시 유의

- UDP(@)는 유실 가능성이 있으므로, 신뢰성이 필요하면 TCP(@@)를 사용한다. 단 ss-syslog-receiver 수신 방식(UDP/TCP)과 일치해야 한다.
- 시간대는 UTC 기준으로 저장되며, 장비 시간대 오프셋은 수집기 설정으로 보정한다.

## 4. 경로 B. Filebeat → Kafka (조건부, 3rd-party)

Filebeat는 제품 표준 구성요소가 아니며, 특정 고객사가 3rd-party 에이전트 사용을 요구하는 경우에 한해 사용한다.

### 4.1 선행 제약 (중요)

Kafka(19092)는 어플라이언스 내부 브로커로, 모든 내부 컴포넌트가 `localhost:19092`로 접속한다. 즉 Kafka의 `advertised.listeners`가 localhost로 설정되어 있어, **원격 서버의 Filebeat는 기본 구성에서 접속할 수 없다.** 사용하려면 다음이 선행되어야 한다.

1. Kafka `advertised.listeners`를 SIEM 서버의 외부 접근 주소로 재구성 (내부 컴포넌트 접속에 영향이 없도록 다중 listener 구성 검토)
2. 방화벽에서 TCP 19092 외부 개방
3. 위 재구성은 어플라이언스 표준 설정 변경에 해당하므로 SIEM Engineer 검토 후 진행

### 4.2 수신 형식

ss-log-stream은 siem-logs 토픽 메시지를 `protocol`(="file"), `device`(=등록한 Log Source 이름), `rawData`, `generatedTime` 필드를 가진 JSON으로 기대한다. Filebeat 기본 출력은 이 형식이 아니므로, Filebeat processors로 성형해야 한다. 상세 절차는 고객사 전용 매뉴얼(예: `projects/aig/AIG_08-Filebeat설치매뉴얼.md`)을 참조한다.

## 5. 요약

- 표준/권장: rsyslog → 514 (즉시 동작, 별도 재구성 불필요)
- Filebeat → Kafka: Kafka 재구성이 선행되어야 하는 조건부 경로이며, 고객 요구 시에만 사용
- Beats 입력(TCP 5044): Seekurity SIEM v3는 수신하지 않음. 해당 없음
