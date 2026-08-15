# {CUSTOMER_NAME} 운영 이슈 대응 보고서

| 항목 | 내용 |
|------|------|
| 고객사 | {CUSTOMER_NAME} |
| 문서 구분 | 운영/유지보수 이슈 로그 (유지보수 기간: {START} – {END}) |
| 수행사 | SeekersLab |
| 보안등급 | 대외비 |
| 최종 갱신 | {YYYY-MM-DD} |

> 운영 단계에서 접수된 이슈를 시간순으로 축적하는 문서입니다.
> 신규 이슈는 목록에 행을 추가하고, 아래 이슈 양식 섹션을 복사해 작성합니다.

## 이슈 목록

| ID | 접수일 | 제목 | 심각도 | 상태 |
|----|--------|------|--------|------|
| ISSUE-{YYYY}-001 | {YYYY-MM-DD} | {이슈 제목} | {CRITICAL/HIGH/MEDIUM/LOW} | {진행중/해결/보류} |

---

## ISSUE-{YYYY}-NNN: {이슈 제목}   ← 이슈별로 이 섹션 복사

### 증상

- {고객이 보고한 증상을 그대로 기록 — 재현 조건, 관찰된 로그 유무 포함}

### 타임라인

| 일자 | 내용 |
|------|------|
| {일자} | 이슈 접수 |
| {일자} | 원인 분석 / 현장 점검 가이드 전달 |
| {일자} | 조치 완료 (내부 이슈 번호: {SSS-NNN}) |

### 원인 분석

1. {근본 원인 — 제품 결함/설정/환경 구분 명시}
2. {부차 원인 또는 검증 중 발견된 잠재 결함}

### 현장 임시 조치

```
{즉시 적용 가능한 SQL/명령 — 실비밀번호는 절대 기재하지 않음}
```

### 근본 조치

| 항목 | 내용 |
|------|------|
| {컴포넌트} | {수정 내용, 반영 버전} |

### 패치 적용 안내

- 패치 파일: `seekurity-siem-patch-v{X.Y.Z}-{YYYYMMDD}.tar.gz`
- 다운로드: `https://siem.seekerslab.com/downloads/` (계정은 별도 전달)
- 적용: 압축 해제 후 `sudo ./patch.sh`

### 재발 방지 / 교훈

- {운영 절차·점검 항목에 반영할 내용}

---

## 부록 A. DB 수집 연동 점검 체크리스트 (표준 진단 시퀀스)

> "서비스는 정상인데 DB 수집 로그가 없다"는 증상의 표준 점검 순서.
> KOVAN ISSUE-2026-001에서 도출된 재사용 패턴.

**① 수집기 등록/활성 상태 확인** (가장 흔한 원인)

```sql
SELECT name, log_type, ip_address, port, database, database_name,
       is_deleted, is_disabled,
       (query IS NOT NULL AND query <> '') AS has_query,
       collect_interval_seconds, last_collected_at
FROM log_sources WHERE log_type = 'db';
```

- 0건 → 수집기 미등록 (콘솔 > 인프라 > 수집기, 유형 Database로 등록)
- `is_disabled = t` → 비활성 (v3.4.4+: 콘솔 토글 / 이전 버전: UPDATE로 활성화)

**② 설치 jar 버전 확인**

```bash
md5sum /opt/seekurity-siem/bin/ss-database-checker.jar
# 릴리스 노트의 MD5와 대조 — 다르면 패치 재적용
```

**③ 수집 서비스 로그 확인** (활성 수집기가 1건이라도 있으면 주기마다 반드시 로그가 남음)

```bash
systemctl status ss-database-checker --no-pager
grep 'LogSource수집' /opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log | tail -10
# 로그가 전혀 없으면: 활성 수집기 0건 또는 수집 루프 중단(서비스 재시작 후 재확인)
```

**④ 활성화 후 관찰** (10초 주기)

- `수집 완료 N건` → 정상
- `수집 실패 + JDBC URL + 에러` → 에러 메시지로 분기: 인증 실패(계정/권한), Communications link failure(방화벽/포트), Unknown database(DB명)

**⑤ 파이프라인 도달 확인** (수집 성공 시)

```bash
curl -s 'http://localhost:19200/siem-logs-*/_count?q=protocol:db'
# count 0이면 수집은 되나 파싱 단계 문제 → 파서 설정 확인
```

**⑥ 진단 정보 일괄 수집** (원격 분석 의뢰 시)

```bash
D=/tmp/siem-diag-$(date +%Y%m%d); mkdir -p $D
md5sum /opt/seekurity-siem/bin/*.jar > $D/jar-md5.txt
systemctl list-units 'ss-*' --no-pager > $D/services.txt
tail -500 /opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log > $D/dbchecker.log
sudo -u postgres psql -d siem -c "SELECT name,log_type,is_deleted,is_disabled,collect_interval_seconds,last_collected_at FROM log_sources WHERE log_type='db';" > $D/db-sources.txt
tar czf $D.tar.gz -C /tmp $(basename $D) && echo "수집 완료: $D.tar.gz"
```
