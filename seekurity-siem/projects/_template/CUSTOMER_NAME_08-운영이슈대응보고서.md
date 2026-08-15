<!--
  운영 이슈 대응 보고서 템플릿 (내부용 작성 지침 — 납품 시 이 주석 블록은 자동/수동 제거)
  - 신규 이슈: 1항 목록에 행 추가 후, 2항 양식을 복사하여 이슈 번호 순으로 작성
  - 작성 규칙: docs/document-style-guide.md 준수 (개조식 문어체, 이모지/화살표/원문자 금지,
    내부 이슈번호/저장소/서버IP/실계정 기재 금지)
  - 플레이스홀더: {CUSTOMER_NAME}, {START}, {END} 등은 scripts/project.py init 시 치환됨
-->

# {CUSTOMER_NAME} 운영 이슈 대응 보고서

| 항목 | 내용 |
|------|------|
| 고객사 | {CUSTOMER_NAME} |
| 문서 구분 | 운영 및 유지보수 이슈 대응 보고서 |
| 유지보수 기간 | {START} ~ {END} |
| 수행사 | SeekersLab |
| 보안등급 | 대외비 |
| 최종 갱신일 | {YYYY. MM. DD.} |

## 1. 이슈 목록

| 이슈 번호 | 접수일 | 제목 | 심각도 | 처리 상태 |
|-----------|--------|------|--------|-----------|
| ISSUE-{YYYY}-001 | {YYYY. MM. DD.} | {이슈 제목} | {높음/보통/낮음} | {조치 완료/조치 중/보류} |

## 2. ISSUE-{YYYY}-NNN. {이슈 제목}

### 2.1 증상

- {고객이 보고한 증상을 사실 그대로 기재. 재현 조건과 로그 출력 여부 포함}

### 2.2 처리 경과

| 일자 | 내용 |
|------|------|
| {일자} | 이슈 접수 |
| {일자} | 원인 분석 완료, 현장 점검 절차 전달 |
| {일자} | 조치 완료 |

### 2.3 원인 분석

1. {근본 원인. 제품 개선 사항, 설정, 환경 요인 여부를 구분하여 기재}
2. {부차 원인 또는 점검 과정에서 식별된 개선 사항}

### 2.4 임시 조치

<!-- 즉시 적용 가능한 절차를 기재. 실계정과 비밀번호는 기재하지 않음 -->

```
{조치 명령 또는 절차}
```

### 2.5 근본 조치

| 구분 | 조치 내용 |
|------|-----------|
| {구성 요소} | {조치 내용 및 반영 버전} |

### 2.6 패치 적용 안내

| 항목 | 내용 |
|------|------|
| 패치 파일 | seekurity-siem-patch-v{X.Y.Z}-{YYYYMMDD}.tar.gz |
| 다운로드 | https://siem.seekerslab.com/downloads/ (접속 계정은 별도 전달) |
| 적용 방법 | 압축 해제 후 sudo ./patch.sh 실행 |

### 2.7 재발 방지 대책

- {운영 절차 및 점검 항목에 반영할 내용}

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
