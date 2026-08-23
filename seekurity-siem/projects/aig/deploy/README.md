# AIG SIEM v3 설치·연동·검증 실행 키트

`../../../INSTALLATION_GUIDE.md` (v6.10, Rocky/RHEL 9.x) 를 AIG 프로젝트용으로 실행 가능하게 옮긴 것.
전부 **대상 서버에서** 실행한다.

## 실행 전 필요한 것 (현재 미확보)

| 항목 | 상태 | 비고 |
|------|------|------|
| 대상 서버 (Rocky/RHEL 9.x) | ❌ 미지정 | 접속 정보 필요 |
| 설치 패키지 (`install.sh`, `bootstrap-infra.sh`, `bin/*.jar` 7개, `console/`, `sql/`, `rpms/`) | ❌ 미확보 | 작업 PC 어디에도 없음 |
| `license.json` | ❌ 미확보 | 없으면 라이선스 INVALID 로 차단 |
| Log Source 실제 목록 | ❌ 미확정 | `logsources.csv` 가 아직 샘플(`x.x.x.x`) |

## 순서

```bash
export PKG_DIR=/root/siem-v3            # 설치 패키지 압축 해제 위치

./00-preflight.sh                        # 읽기 전용 점검. FAIL 이면 여기서 멈춘다
./10-install.sh                          # bootstrap-infra → install.sh → 데이터 경로 검증 → 기동
./20-configure-logsources.sh             # DRY-RUN: 전송할 payload 확인
./20-configure-logsources.sh --apply     # 실제 등록 + 방화벽 개방(443, 514/udp, 162/udp)
./30-verify-ingest.sh                    # 수신 검증
```

## 각 단계가 보는 것

- **00-preflight** — OS/자원, `/opt/seekurity-siem/data` 별도 볼륨 여부(MANDATORY), Java 8·net-snmp-utils·한글 폰트,
  비표준 포트(15432/12181/19092/19200/23001/23002/443) 선점 여부, 패키지 구성 완전성.
- **10-install** — 오프라인 부트스트랩 후 설치. 설치 직후 PostgreSQL `data_directory` 가 data 볼륨인지 확인한다
  (root 디스크에 남으면 `detection_history_logs` 증가로 디스크 가득 참 → 전체 중단).
  기동은 PostgreSQL → ZooKeeper → Kafka → OpenSearch → ss-api → ss-log-stream → ss-syslog-receiver → ss-console → nginx 순.
- **20-configure-logsources** — `logsources.csv` → v5 API `/log/source`. 기본 DRY-RUN.
  먼저 `GET /log/source` 응답을 출력하므로, 실제 필드명이 스크립트의 payload 와 다르면 그 출력에 맞춰 고칠 것.
  `loginId` 는 이메일이 아니라 로그인 ID(`admin`).
- **30-verify-ingest** — 세 층으로 나눠 판정한다.
  1. 서비스·포트 (udp/514 미개방이면 수집 자체가 불가)
  2. 합성 syslog 프로브: 고유 마커를 `logger` 로 던지고 `siem-logs-YYYY-MM-DD` 에 색인될 때까지 최대 60초 대기 →
     수신·파싱·색인 경로가 살아 있는지 확인
  3. 장비별 실측: CSV 의 각 IP 로 최근 15분(`WINDOW`) 이벤트 수를 세어 수신/무수신 판정

## 주의

- `logsources.csv` 의 IP 가 `x.x.x.x` 인 행은 등록·검증에서 건너뛴다(SKIP/△). 실제 값으로 채워야 검증이 의미를 가진다.
- 검증 쿼리는 필드명 의존을 피하려고 `query_string` 전문 검색으로 IP 를 찾는다. 파서 정규화 필드가 확정되면
  `src_ip`/`device_ip` 등 정확한 필드 매칭으로 좁히는 편이 오탐이 적다.
