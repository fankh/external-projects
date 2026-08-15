# KOVAN 운영 이슈 대응 보고서

| 항목 | 내용 |
|------|------|
| 고객사 | KOVAN |
| 문서 구분 | 운영 및 유지보수 이슈 대응 보고서 |
| 유지보수 기간 | 2026. 06. 01. ~ 2027. 05. 31. |
| 수행사 | SeekersLab |
| 보안등급 | 대외비 |
| 최종 갱신일 | 2026. 08. 15. |

## 1. 이슈 목록

| 이슈 번호 | 접수일 | 제목 | 심각도 | 처리 상태 |
|-----------|--------|------|--------|-----------|
| ISSUE-2026-001 | 2026. 07. 19. | DLP 데이터베이스(MySQL) 로그 수집 미동작 | 높음 | 조치 완료 (v3.4.4 반영) |

## 2. ISSUE-2026-001. DLP 데이터베이스(MySQL) 로그 수집 미동작

### 2.1 증상

- DLP 솔루션 데이터베이스(MySQL) 연동 설정 이후 수집 데이터가 유입되지 않음
- 네트워크 통신 및 수집 서비스(ss-database-checker) 기동 상태는 정상
- 수집 서비스 로그에 JDBC 관련 기록이 출력되지 않음

### 2.2 처리 경과

| 일자 | 내용 |
|------|------|
| 2026. 07. 19. | 이슈 접수, 패치 패키지 무결성 검증 및 원인 분석 완료, 현장 점검 절차 전달 |
| 2026. 07. 28. | 수정 사항 개발 및 검증 완료 |
| 2026. 08. 02. | v3.4.4 패치 릴리스 및 배포 서버 등록 |

### 2.3 원인 분석

1. 신규 로그 소스가 비활성 상태로 등록되며, 관리 콘솔에 활성화 기능이 제공되지 않아 등록 이후 수집이 개시되지 않음
2. 수집 모듈은 활성 상태의 데이터베이스 수집기가 없는 경우 별도 기록 없이 대기하므로, 서비스 상태만으로는 원인 확인이 어려움
3. 점검 과정에서 수집 처리 중 예외 발생 시 수집 기능 전체가 중단될 수 있는 개선 사항을 추가로 식별함

### 2.4 임시 조치 (v3.4.4 적용 이전)

SIEM 서버에서 데이터베이스에 접속하여 수집기를 수동으로 활성화함. 서비스 재시작은 불필요하며 10초 주기로 자동 반영됨.

```bash
sudo -u postgres psql -p 15432 -d siem
```

```sql
UPDATE log_sources SET is_disabled = false
WHERE log_type = 'db' AND name = '(DLP 수집기 이름)';
```

활성화 이후 수집 로그 확인:

```bash
grep 'LogSource수집' /opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log | tail
```

- "수집 완료" 기록 확인 시 정상 동작
- "수집 실패" 기록 확인 시 접속 계정, 권한, 방화벽 설정 점검 필요

### 2.5 근본 조치 (v3.4.4 반영 내역)

| 구분 | 조치 내용 |
|------|-----------|
| 관리 콘솔 | 로그 소스 화면에 수집 활성화 및 비활성화 기능 추가, 목록에 활성화 상태 표시 |
| 수집 관리 | 신규 로그 소스 등록 시 기본 활성 상태로 변경 |
| 수집 모듈 | 활성 수집기가 없는 경우 주기적 안내 로그 출력 기능 추가 |
| 수집 모듈 | 수집 처리 예외 발생 시 자동 복구 및 수집기 단위 오류 격리, 데이터베이스 접속 제한 시간(10초) 적용 |

### 2.6 패치 적용 안내

| 항목 | 내용 |
|------|------|
| 패치 파일 | seekurity-siem-patch-v3.4.4-20260802.tar.gz (약 821MB) |
| 패치 파일 MD5 | 947aec57462e1a3c189b06f2159f493d |
| 다운로드 | https://siem.seekerslab.com/downloads/ (접속 계정은 별도 전달) |
| 유의 사항 | 기존 데이터 및 설정은 유지됨. 기존에 등록된 비활성 수집기는 자동으로 활성화되지 않으므로, 적용 후 관리 콘솔 또는 2.4항의 절차에 따라 활성화 필요 |

적용 절차:

```bash
md5sum seekurity-siem-patch-v3.4.4-20260802.tar.gz     # 위 MD5 값과 일치 확인
tar xzf seekurity-siem-patch-v3.4.4-20260802.tar.gz
cd seekurity-siem-patch
sudo ./patch.sh
```

적용 확인:

```bash
md5sum /opt/seekurity-siem/bin/ss-database-checker.jar
# 정상 값: 33d92b4475cfbe8cbb36bbdd6d14f797 (v3.4.4)
```

### 2.7 재발 방지 대책

- 데이터베이스 수집기 등록 시 활성화 상태 및 수집 로그 유입 여부를 함께 확인하는 절차를 운영 점검 항목에 반영
- 동일 증상 발생 시 부록 A의 표준 점검 절차에 따라 진단 수행

## 부록 A. 데이터베이스 수집 연동 점검 체크리스트

수집 서비스는 정상이나 데이터베이스 수집 로그가 확인되지 않는 경우의 표준 점검 절차.

### A.1 수집기 등록 및 활성 상태 확인

```bash
sudo -u postgres psql -p 15432 -d siem
```

```sql
SELECT name, log_type, ip_address, port, database, database_name,
       is_deleted, is_disabled,
       (query IS NOT NULL AND query <> '') AS has_query,
       collect_interval_seconds, last_collected_at
FROM log_sources WHERE log_type = 'db';
```

- 조회 결과가 없는 경우: 수집기 미등록. 관리 콘솔의 인프라 관리에서 데이터베이스 유형으로 등록
- is_disabled 값이 t인 경우: 비활성 상태. 관리 콘솔에서 활성화 (v3.4.4 미만 버전은 2.4항의 UPDATE 문으로 활성화)

### A.2 설치 파일 무결성 확인

```bash
md5sum /opt/seekurity-siem/bin/ss-database-checker.jar
```

- 2.6항의 정상 값과 대조하여 불일치 시 패치 재적용

### A.3 수집 서비스 로그 확인

```bash
systemctl status ss-database-checker --no-pager
grep 'LogSource수집' /opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log | tail -10
```

- 활성 수집기가 존재하면 수집 주기마다 로그가 기록됨
- 로그가 전혀 없는 경우: 활성 수집기 부재 또는 수집 기능 중단 상태이므로 서비스 재시작 후 재확인

### A.4 활성화 이후 동작 관찰

- "수집 완료" 기록: 정상 동작
- "수집 실패" 기록: 오류 내용에 따라 구분하여 조치
  - 인증 실패(Access denied): 접속 계정 및 권한 확인
  - 통신 오류(Communications link failure): 방화벽 및 포트 확인
  - 데이터베이스 없음(Unknown database): 데이터베이스 이름 확인

### A.5 저장 단계 도달 확인

```bash
curl -s 'http://localhost:19200/siem-logs-*/_count?q=protocol:db'
```

- 수집은 정상이나 건수가 0인 경우: 파서 설정 점검

### A.6 진단 정보 일괄 수집

원격 분석 의뢰 시 아래 절차로 진단 자료를 수집하여 전달.

```bash
D=/tmp/siem-diag-$(date +%Y%m%d); mkdir -p $D
md5sum /opt/seekurity-siem/bin/*.jar > $D/jar-md5.txt
systemctl list-units 'ss-*' --no-pager > $D/services.txt
tail -500 /opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log > $D/dbchecker.log
sudo -u postgres psql -p 15432 -d siem -c "SELECT name,log_type,is_deleted,is_disabled,collect_interval_seconds,last_collected_at FROM log_sources WHERE log_type='db';" > $D/db-sources.txt
tar czf $D.tar.gz -C /tmp $(basename $D)
```

## 부록 B. 표준 서비스 포트

제품은 관리 및 데이터 서비스에 표준(well-known) 포트를 사용하지 않음.
모든 접속 명령은 아래 포트를 명시하여 수행함.

| 서비스 | 포트 | 비고 |
|--------|------|------|
| Nginx (HTTPS) | 443 | 외부 접속 표준 포트 |
| SS-Syslog-Receiver | 514/UDP | 장비 연동 표준 포트 |
| SS-API | 23001 | |
| SS-Console | 23002 | |
| OpenSearch API | 19200 | |
| OpenSearch Transport | 19300 | |
| PostgreSQL | 15432 | psql 사용 시 -p 15432 필수 |
| Kafka | 19092 | |
| Zookeeper | 12181 | |
