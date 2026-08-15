<!--
  운영 이슈 대응 보고서 템플릿 (내부용 작성 지침 — 납품 시 이 주석 블록은 자동/수동 제거)
  - 신규 이슈: 1항 목록에 행 추가 후, 2항 양식을 복사하여 이슈 번호 순으로 작성
  - 작성 규칙: docs/document-style-guide.md 준수 (개조식 문어체, 이모지/화살표/원문자 금지,
    내부 이슈번호/저장소/서버IP/실계정 기재 금지)
  - 플레이스홀더: AIG, {START}, {END} 등은 scripts/project.py init 시 치환됨
-->

# AIG 운영 이슈 대응 보고서

| 항목 | 내용 |
|------|------|
| 고객사 | AIG |
| 문서 구분 | 운영 및 유지보수 이슈 대응 보고서 |
| 유지보수 기간 | {START} ~ {END} (계약 확정 후 기재) |
| 수행사 | SeekersLab |
| 보안등급 | 대외비 |
| 최종 갱신일 | 2026. 08. 15. |

## 1. 이슈 목록

| 이슈 번호 | 접수일 | 제목 | 심각도 | 처리 상태 |
|-----------|--------|------|--------|-----------|
| - | - | 접수된 이슈 없음 (2026. 08. 15. 기준) | - | - |

## 2. 권고 사항

현재까지 접수된 운영 이슈는 없음. 다만 정기 개선 사항으로 아래 적용을 권고함.

| 구분 | 내용 |
|------|------|
| 패치 적용 | v3.4.4 이상 적용 권고. 데이터베이스 수집기 관리 기능 개선(관리 콘솔 활성화 토글, 신규 등록 시 기본 활성화, 수집 모듈 안정화) 포함 |
| 운영 점검 | 데이터베이스 수집기 등록 시 활성화 상태 및 수집 로그 유입 여부 확인 절차를 정기 점검 항목에 반영 |
| 다운로드 | https://siem.seekerslab.com/downloads/ (접속 계정은 별도 전달) |

이슈 접수 시 본 문서 1항 목록에 행을 추가하고 이슈별 상세 절을 작성함.

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
- is_disabled 값이 참인 경우: 비활성 상태. 관리 콘솔에서 활성화 (v3.4.4 미만 버전은 UPDATE 문으로 활성화)

### A.2 설치 파일 무결성 확인

```bash
md5sum /opt/seekurity-siem/bin/ss-database-checker.jar
```

- 릴리스 노트에 기재된 값과 대조하여 불일치 시 패치 재적용

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
  - 인증 실패: 접속 계정 및 권한 확인
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
