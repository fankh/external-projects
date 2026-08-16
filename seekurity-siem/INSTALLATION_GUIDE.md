# Seekurity SIEM v3 오프라인 설치 가이드

> **버전**: 6.10 | **작성일**: 2026-08-16 | **대상 OS**: Rocky Linux 9.x / RHEL 9.x

---

## 🔒 오프라인(Air-Gapped) 환경 설치 안내

### 설치 패키지 구성 (인터넷 불필요)

본 설치 패키지는 **완전한 오프라인 설치**를 지원합니다. 설치 스크립트(`install.sh`)는 인터넷에 접속하지 않습니다.

| 구성 요소 | 포함 여부 | 크기 | 비고 |
|-----------|----------|------|------|
| Node.js v20.14.0 | ✅ 포함 | 45 MB | `nodejs/nodejs.tar.gz` |
| 웹 콘솔 (ss-console) | ✅ 포함 | 170 MB | `console/ss-console-full.tar.gz` |
| - node_modules | ✅ 포함 | - | 사전 설치됨 (npm install 불필요) |
| - .next (빌드 결과물) | ✅ 포함 | - | 사전 빌드됨 (npm run build 불필요) |
| JAR 파일 (7개) | ✅ 포함 | 658 MB | `bin/*.jar` |
| SQL 스키마 | ✅ 포함 | - | `sql/init-schema.sql` |
| **Java 8** | ❌ 미포함 | - | 사전 설치 필요 |
| **PostgreSQL** | ❌ 미포함 | - | 사전 설치 필요 |
| **Nginx** | ❌ 미포함 | - | 사전 설치 필요 |
| **OpenSearch** | ❌ 미포함 | - | 사전 설치 필요 |
| **Kafka** | ❌ 미포함 | - | 사전 설치 필요 |

### 오프라인 환경 사전 준비

완전한 인터넷 단절 환경(Air-Gapped)에서 설치하려면 다음이 **사전에 준비**되어야 합니다:

#### 방법 0: 인프라 부트스트랩 스크립트 (권장, v6.10+)

PostgreSQL/Nginx/한글 폰트가 전혀 없는 신규 서버는 패키지에 포함된 `bootstrap-infra.sh`로 자동 구성합니다. 인터넷 없이 동작하며, Kafka/ZooKeeper/OpenSearch는 install.sh가 번들에서 자동 설치하므로 별도 준비가 필요 없습니다.

```bash
# [1] 인터넷 가능한 동일 OS(Rocky/RHEL 9.x) 머신에서 RPM 수집
mkdir rpms
dnf download --resolve --destdir=rpms \
    postgresql14-server postgresql14 nginx google-noto-sans-cjk-fonts
# PGDG 저장소 사용 시 pgdg-redhat-repo 활성 상태에서 실행

# [2] rpms/ 디렉터리를 설치 패키지 루트(install.sh 옆)에 복사 후 오프라인 서버로 전송

# [3] 오프라인 서버에서 부트스트랩 → 설치 순서로 실행
sudo ./bootstrap-infra.sh                              # 기본 PGDATA
sudo ./bootstrap-infra.sh --pgdata /data/pgsql/14/data # 데이터 볼륨 분리 시
sudo ./install.sh
```

부트스트랩이 수행하는 것: 로컬 RPM 설치(저장소 접근 없음) → PGDG `/usr/pgsql-NN/bin` 심링크 → PostgreSQL initdb(포트 15432, 로컬 전용, md5) → 커스텀 PGDATA systemd override → Nginx 활성화 → CJK 폰트 확인.

#### 방법 1: 오프라인 RPM 저장소 구성
```bash
# 인터넷이 되는 서버에서 RPM 패키지 다운로드
dnf download --resolve java-1.8.0-openjdk-devel postgresql-server nginx

# 다운로드한 RPM을 오프라인 서버로 전송 후 설치
sudo rpm -ivh *.rpm
```

#### 방법 2: Rocky Linux ISO에서 설치
```bash
# ISO 마운트
sudo mount -o loop Rocky-9.x-x86_64-dvd.iso /mnt/iso

# 로컬 저장소 설정 후 설치
sudo dnf --disablerepo=* --repofrompath=local,/mnt/iso install java-1.8.0-openjdk-devel postgresql-server nginx
```

#### 방법 3: 인터넷 연결 시점에 미리 설치
```bash
# 인터넷 연결 가능 시 미리 설치
sudo dnf install java-1.8.0-openjdk-devel postgresql-server nginx

# PostgreSQL 초기화
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

### OpenSearch/Kafka 오프라인 설치

OpenSearch와 Kafka는 별도의 오프라인 패키지가 필요합니다:

| 소프트웨어 | 다운로드 출처 | 설치 위치 |
|------------|--------------|-----------|
| OpenSearch 1.3.x | opensearch.org | `/opt/opensearch` |
| Kafka 2.8+ | kafka.apache.org | `/opt/kafka` |
| Zookeeper | Kafka에 포함 | `/opt/kafka` |

```bash
# 예시: 인터넷 환경에서 다운로드
wget https://artifacts.opensearch.org/releases/bundle/opensearch/1.3.14/opensearch-1.3.14-linux-x64.tar.gz
wget https://archive.apache.org/dist/kafka/2.8.0/kafka_2.13-2.8.0.tgz

# 오프라인 서버로 전송 후 설치
tar xzf opensearch-*.tar.gz -C /opt/
tar xzf kafka_*.tgz -C /opt/
```

### 한글 폰트 설치 (PDF 리포트 필수)

PDF 리포트에서 한글 탐지룰 이름, 로그 소스 이름 등이 올바르게 출력되려면 한글 폰트가 필요합니다.

```bash
# RHEL/Rocky Linux
sudo dnf install -y google-noto-sans-cjk-fonts

# Ubuntu/Debian
sudo apt-get install -y fonts-nanum

# 설치 확인
fc-list | grep -i "nanum\|noto.*cjk"
```

**지원 폰트 (우선순위)**:
1. `/usr/share/fonts/truetype/nanum/NanumGothic.ttf` (Ubuntu)
2. `/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc` (RHEL)

폰트가 없으면 PDF에서 한글이 `□□□` 로 표시됩니다.

### 설치 과정에서 네트워크 사용 여부

| 단계 | 네트워크 필요 | 설명 |
|------|--------------|------|
| 패키지 압축 해제 | ❌ 불필요 | 로컬 파일 작업 |
| Node.js 설치 | ❌ 불필요 | 번들된 tarball 사용 |
| 콘솔 배포 | ❌ 불필요 | node_modules 사전 포함 |
| JAR 배포 | ❌ 불필요 | 번들된 파일 복사 |
| DB 스키마 적용 | ❌ 불필요 | localhost PostgreSQL |
| OpenSearch 인덱스 | ❌ 불필요 | localhost OpenSearch |
| Kafka 토픽 생성 | ❌ 불필요 | localhost Kafka |

**결론: `install.sh` 실행 시 인터넷 연결이 전혀 필요하지 않습니다.**

---

## 🔐 폐쇄망(Private Network) 환경 설정

### 비표준 포트 사용 (권장)

폐쇄망 환경에서는 보안을 위해 비표준 포트를 사용합니다:

| 서비스 | 표준 포트 | 폐쇄망 포트 | 설정 파일 |
|--------|----------|------------|-----------|
| PostgreSQL | 5432 | **15432** | `/etc/postgresql/*/main/postgresql.conf` |
| Kafka | 9092 | **19092** | `/opt/kafka/config/server.properties` |
| ZooKeeper | 2181 | **12181** | `/opt/kafka/config/zookeeper.properties` |
| OpenSearch | 9200 | **19200** | `/opt/opensearch/config/opensearch.yml` |
| OpenSearch Transport | 9300 | **19300** | `/opt/opensearch/config/opensearch.yml` |

### 설정 파일 업데이트

#### PostgreSQL 포트 변경
```bash
# postgresql.conf 수정
sudo vi /etc/postgresql/*/main/postgresql.conf
# port = 15432

# pg_hba.conf - 로컬 네트워크 허용
sudo vi /etc/postgresql/*/main/pg_hba.conf
# host all all 0.0.0.0/0 md5

# 재시작
sudo systemctl restart postgresql
```

#### Kafka 포트 변경
```bash
# server.properties 수정
vi /opt/kafka/config/server.properties
# listeners=PLAINTEXT://:19092

# zookeeper.properties 수정
vi /opt/kafka/config/zookeeper.properties
# clientPort=12181

# 재시작
systemctl restart zookeeper kafka
```

#### OpenSearch 포트 변경
```bash
# opensearch.yml 수정
vi /opt/opensearch/config/opensearch.yml
# http.port: 19200
# transport.port: 19300

# 재시작
systemctl restart opensearch
```

## 💾 데이터 디렉토리 구성 (MANDATORY)

### 디스크 레이아웃

어플라이언스는 OS용 root 디스크와 데이터용 대용량 볼륨을 분리해야 합니다:

| 볼륨 | 용량 | 마운트 | 용도 |
|------|------|--------|------|
| root (`/`) | 100GB+ | `/` | OS, 서비스 바이너리, 로그 |
| data | 1TB+ | `/opt/seekurity-siem/data` | 모든 데이터 저장소 |

```bash
# LVM 데이터 볼륨 예시
sudo lvcreate -l 100%FREE -n lv_data vg_siem_data
sudo mkfs.xfs /dev/vg_siem_data/lv_data
sudo mkdir -p /opt/seekurity-siem/data
echo '/dev/mapper/vg_siem_data-lv_data /opt/seekurity-siem/data xfs defaults 0 2' | sudo tee -a /etc/fstab
sudo mount -a
```

### 데이터 저장 위치 (모두 data 볼륨)

**CRITICAL: 모든 데이터 저장소는 반드시 data 볼륨 아래에 위치해야 합니다. root 디스크에 두면 디스크 가득 참 → 서비스 전체 중단이 발생합니다.**

| 컴포넌트 | 데이터 위치 | 설정 파일 |
|----------|------------|-----------|
| OpenSearch | `/opt/seekurity-siem/data/opensearch` | `opensearch.yml` → `path.data` |
| Kafka | `/opt/seekurity-siem/data/kafka` | `server.properties` → `log.dirs` |
| ZooKeeper | `/opt/seekurity-siem/data/zookeeper` | `zookeeper.properties` → `dataDir` |
| **PostgreSQL** | `/opt/seekurity-siem/data/postgresql/12/main` | `postgresql.conf` → `data_directory` |
| 백업 | `/opt/seekurity-siem/data/backups` | `ss-api.yml` → `backup.directory` |

### PostgreSQL 데이터 디렉토리 이전

PostgreSQL 기본 설치는 `/var/lib/postgresql`(root 디스크)에 데이터를 저장합니다.
**설치 직후 반드시 data 볼륨으로 이전하세요** (detection_history_logs 등이 수십 GB로 증가함):

```bash
# 1. 의존 서비스 + PostgreSQL 중지
sudo systemctl stop ss-api ss-database-checker
sudo systemctl stop postgresql@12-main

# 2. 데이터 복사 (권한 유지)
sudo mkdir -p /opt/seekurity-siem/data/postgresql
sudo rsync -a /var/lib/postgresql/ /opt/seekurity-siem/data/postgresql/
sudo chown -R postgres:postgres /opt/seekurity-siem/data/postgresql

# 3. data_directory 변경
sudo vi /etc/postgresql/12/main/postgresql.conf
# data_directory = '/opt/seekurity-siem/data/postgresql/12/main'

# 4. PostgreSQL 시작 및 검증
sudo systemctl start postgresql@12-main
sudo -u postgres psql -p 15432 -c 'SHOW data_directory;'
# → /opt/seekurity-siem/data/postgresql/12/main 확인

# 5. 서비스 재시작 및 데이터 확인
sudo systemctl start ss-api ss-database-checker
sudo -u postgres psql -p 15432 -d siem -c 'SELECT COUNT(*) FROM log_sources;'

# 6. 검증 완료 후 기존 데이터 삭제
sudo rm -rf /var/lib/postgresql/12
```

### 디스크 모니터링

OpenSearch는 디스크 사용률이 watermark를 초과하면 쓰기를 차단합니다:

| Watermark | 기본값 | 동작 |
|-----------|--------|------|
| low | 85% | 새 shard 할당 중단 |
| high | 90% | shard 이동 시작 |
| flood_stage | 95% | **인덱스 read-only 전환 (쓰기 차단)** |

디스크 정리 cron (`/etc/cron.d/siem-disk-cleanup`)이 매일 root 디스크를 정리하지만,
data 볼륨의 오래된 인덱스는 로그 보관 정책(retention_days)에 따라 자동 삭제됩니다.

### SIEM 설정 파일 포트 반영

#### log-stream.yml
```yaml
spring:
  kafka:
    bootstrap-servers: localhost:19092
  datasource:
    url: jdbc:postgresql://localhost:15432/siem
    username: seekers
    password: <DB_PASSWORD>

elasticsearch:
  host: localhost
  port: 19200
```

#### ss-api.yml
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:15432/siem
```

### 서비스 의존성 및 시작 순서

폐쇄망 환경에서는 서비스 시작 순서가 중요합니다:

```
1. PostgreSQL (15432) - 데이터베이스
     ↓
2. ZooKeeper (12181) - 코디네이션 서비스
     ↓
3. Kafka (19092) - 메시지 브로커
     ↓
4. OpenSearch (19200) - 검색 엔진
     ↓
5. ss-api (23001) - SIEM API
     ↓
6. ss-log-stream - 로그 파싱/인덱싱
7. ss-syslog-receiver (UDP 514) - Syslog 수집
     ↓
8. ss-console (23002) - 웹 콘솔
9. Nginx (443) - HTTPS 프록시
```

**의존성 문제 발생 시:**
```bash
# 순서대로 시작
sudo systemctl start postgresql
sudo systemctl start zookeeper
sudo systemctl start kafka
sudo systemctl start opensearch
sudo systemctl start ss-api
sudo systemctl start ss-log-stream
sudo systemctl start ss-syslog-receiver
sudo systemctl start ss-console
sudo systemctl start nginx
```

### 폐쇄망 서비스 상태 확인

```bash
echo "=== 폐쇄망 서비스 상태 확인 ==="

# PostgreSQL (15432)
echo -n "PostgreSQL: "
ss -tlnp | grep -q ':15432' && echo "✓ 15432 listening" || echo "✗ NOT listening"

# ZooKeeper (12181)
echo -n "ZooKeeper: "
ss -tlnp | grep -q ':12181' && echo "✓ 12181 listening" || echo "✗ NOT listening"

# Kafka (19092)
echo -n "Kafka: "
ss -tlnp | grep -q ':19092' && echo "✓ 19092 listening" || echo "✗ NOT listening"

# OpenSearch (19200)
echo -n "OpenSearch: "
ss -tlnp | grep -q ':19200' && echo "✓ 19200 listening" || echo "✗ NOT listening"

# SIEM Services
echo -n "ss-api: "
ss -tlnp | grep -q ':23001' && echo "✓ 23001 listening" || echo "✗ NOT listening"
echo -n "ss-console: "
ss -tlnp | grep -q ':23002' && echo "✓ 23002 listening" || echo "✗ NOT listening"
```

### 폐쇄망 환경 트러블슈팅

#### 모든 SIEM 설정 파일 비밀번호 동기화 (중요!)

폐쇄망 환경에서 가장 흔한 문제는 **설정 파일 간 비밀번호 불일치**입니다.

**모든 설정 파일의 DB 비밀번호가 동일해야 합니다:**

| 설정 파일 | 비밀번호 필드 | 확인 명령 |
|-----------|--------------|-----------|
| `/opt/seekurity-siem/conf/ss-api.yml` | `spring.datasource.password` | `grep password ss-api.yml` |
| `/opt/seekurity-siem/conf/log-stream.yml` | `spring.datasource.password` | `grep password log-stream.yml` |
| `/opt/seekurity-siem/conf/database-checker.yml` | `spring.datasource.password` | `grep password database-checker.yml` |
| `/opt/seekurity-siem/conf/snmp-collector.yml` | `spring.datasource.password` | `grep password snmp-collector.yml` |

**비밀번호 동기화 확인:**
```bash
# 모든 설정 파일의 비밀번호 확인
grep -h "password:" /opt/seekurity-siem/conf/*.yml | grep -v "#" | sort | uniq
# 결과가 1줄이어야 함 (모두 동일한 비밀번호)

# DB 연결 테스트
PGPASSWORD='설정파일비밀번호' psql -h localhost -p 15432 -U seekers -d siem -c 'SELECT 1'
```

**비밀번호 불일치 해결:**
```bash
# 방법 1: 모든 설정 파일을 DB 비밀번호로 통일
NEW_PASSWORD="<DB_PASSWORD>"  # 실제 DB 비밀번호

for f in /opt/seekurity-siem/conf/*.yml; do
    sudo sed -i "s/password:.*/password: ${NEW_PASSWORD}/" "$f"
done

# 모든 서비스 재시작
sudo systemctl restart ss-api ss-log-stream ss-database-checker ss-snmp-collector

# 방법 2: DB 비밀번호를 설정 파일 값으로 변경
sudo -u postgres psql -p 15432 -c "ALTER USER seekers WITH PASSWORD '설정파일비밀번호';"
```

#### ZooKeeper 트랜잭션 로그 손상

ZooKeeper가 비정상 종료 시 트랜잭션 로그가 손상될 수 있습니다.

**증상:**
```
ERROR Last transaction was partial.
ERROR Unexpected exception, exiting abnormally
java.io.EOFException
```

**해결:**
```bash
# 1. 서비스 중지
sudo systemctl stop kafka zookeeper

# 2. 손상된 로그 파일 확인 (0 bytes 파일)
ls -la /opt/seekurity-siem/data/zookeeper/version-2/
# log.xxx 파일 중 0 bytes인 파일 삭제

# 3. 손상된 로그 삭제 (최신 로그만)
sudo rm -f /opt/seekurity-siem/data/zookeeper/version-2/log.xxx

# 4. 서비스 재시작
sudo systemctl start zookeeper
sleep 5
sudo systemctl start kafka
```

#### Kafka 연결 실패

Log-stream이 Kafka에 연결하지 못하는 경우:

**증상:**
```
WARN Bootstrap broker localhost:19092 disconnected
Connection to node -1 could not be established. Broker may not be available.
```

**확인:**
```bash
# 1. Kafka 프로세스 확인
ps aux | grep kafka

# 2. 포트 리스닝 확인
ss -tlnp | grep 19092

# 3. ZooKeeper 연결 확인 (Kafka 로그)
tail -50 /opt/seekurity-siem/logs/kafka/server.log | grep -E "ZooKeeper|error"
```

**해결:**
```bash
# ZooKeeper 먼저 시작, 그다음 Kafka
sudo systemctl restart zookeeper
sleep 10
sudo systemctl restart kafka
```

#### 데이터베이스 비밀번호 불일치

Log-stream이 PostgreSQL에 연결하지 못하는 경우:

**증상:**
```
FATAL: password authentication failed for user "seekers"
```

**원인:** Jasypt 암호화된 비밀번호와 실제 DB 비밀번호 불일치

**확인:**
```bash
# 1. 설정 파일의 비밀번호 확인
cat /opt/seekurity-siem/conf/log-stream.yml | grep password

# 2. 해당 비밀번호로 직접 연결 테스트
PGPASSWORD='비밀번호' psql -h localhost -p 15432 -U seekers -d siem -c 'SELECT 1'
```

**해결:**
```bash
# 방법 1: DB 비밀번호를 설정 파일 값으로 변경
sudo -u postgres psql -p 15432 -c "ALTER USER seekers WITH PASSWORD '설정파일의비밀번호';"

# 방법 2: 설정 파일을 DB 비밀번호로 변경
sudo vi /opt/seekurity-siem/conf/log-stream.yml
# password: <실제DB비밀번호>

# 서비스 재시작
sudo systemctl restart ss-log-stream
```

#### spring.config.location vs spring.config.additional-location

| 옵션 | 동작 | 사용 시점 |
|------|------|----------|
| `additional-location` | 내장 설정에 **추가** | Jasypt 암호화 사용 시 |
| `location` | 내장 설정 **대체** | 외부 설정 파일만 사용 시 |

**Jasypt 암호화 비밀번호 우선순위 문제:**
- `additional-location` 사용 시 JAR 내장 bootstrap.yml의 암호화된 비밀번호가 우선
- 외부 설정의 평문 비밀번호를 사용하려면 `location` 사용

```bash
# ss-log-stream.service 수정
ExecStart=... -Dspring.config.location=/opt/seekurity-siem/conf/log-stream.yml ...
# (additional-location → location으로 변경)
```

#### 로그인 실패 (API 404 또는 400 오류)

로그인 시 404 또는 400 오류가 발생하는 경우:

**증상 1: API 404 오류**
```
{"status":404,"error":"Not Found","path":"/api/auth/login"}
```

**원인**: API가 실행 중이지만 DB 연결 실패로 컨트롤러 등록 안됨

**확인 및 해결:**
```bash
# 1. API 로그에서 DB 연결 오류 확인
tail -100 /opt/seekurity-siem/logs/ss-api/ss-api.log | grep -i "password authentication failed"

# 2. DB 비밀번호 확인 및 수정
cat /opt/seekurity-siem/conf/ss-api.yml | grep password

# 3. DB 연결 테스트
PGPASSWORD='설정파일비밀번호' psql -h localhost -p 15432 -U seekers -d siem -c 'SELECT 1'

# 4. 비밀번호 불일치 시 설정 파일 수정 후 재시작
sudo systemctl restart ss-api
```

**증상 2: API 400 Bad Request**
```
{"status":400,"error":"Bad Request","path":"/auth/login"}
```

**원인**: 요청 형식 오류 또는 셸 특수문자 이스케이프 문제

**올바른 로그인 요청:**
```bash
# SSS-88: loginId 필드 사용 (이메일 아님)
curl -X POST http://localhost:23001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"loginId":"admin","password":"<ADMIN_PASSWORD>"}'

# 특수문자(!@)가 포함된 비밀번호는 파일로 전달
cat << 'EOF' > /tmp/login.json
{"loginId":"admin","password":"<ADMIN_PASSWORD>"}
EOF
curl -X POST http://localhost:23001/auth/login \
  -H "Content-Type: application/json" \
  -d @/tmp/login.json
rm /tmp/login.json
```

**로그인 필드 참고 (SSS-88):**

| 필드 | 설명 | 예시 |
|------|------|------|
| `loginId` | 로그인 ID (필수) | `admin` |
| `password` | 비밀번호 (필수) | `<ADMIN_PASSWORD>` |
| `ipAddress` | 클라이언트 IP (선택) | `127.0.0.1` |

> **주의**: `loginId`는 이메일(`admin@seekerslab.com`)이 아닌 별도 로그인 ID입니다.

#### OpenSearch 인덱스 생성 안됨

**확인:**
```bash
# 인덱스 목록 확인
curl -s http://localhost:19200/_cat/indices?v

# 오늘 날짜 인덱스 확인
curl -s http://localhost:19200/siem-logs-$(date +%Y-%m-%d)/_count
```

**수동 인덱스 생성:**
```bash
TODAY=$(date +%Y-%m-%d)
curl -X PUT "http://localhost:19200/siem-logs-${TODAY}"
```

### 폐쇄망 설치 완료 검증

설치 완료 후 전체 시스템이 정상 동작하는지 확인합니다.

```bash
#!/bin/bash
echo "=== 폐쇄망 SIEM 설치 검증 ==="

# 1. 서비스 상태 확인
echo -e "\n[1/5] 서비스 상태"
for svc in ss-api ss-console ss-log-stream ss-syslog-receiver nginx; do
    status=$(systemctl is-active $svc 2>/dev/null)
    if [ "$status" = "active" ]; then
        echo "  ✓ $svc: $status"
    else
        echo "  ✗ $svc: $status"
    fi
done

# 2. 포트 확인
echo -e "\n[2/5] 포트 리스닝"
for port in 15432 19092 19200 23001 23002 443; do
    if ss -tlnp | grep -q ":$port "; then
        echo "  ✓ $port: listening"
    else
        echo "  ✗ $port: NOT listening"
    fi
done

# 3. API 응답 확인
echo -e "\n[3/5] API 응답"
api_code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:23001/ 2>/dev/null)
if [ "$api_code" = "200" ]; then
    echo "  ✓ API root: HTTP $api_code"
else
    echo "  ✗ API root: HTTP $api_code (expected 200)"
fi

# 4. 로그인 테스트
echo -e "\n[4/5] 로그인 테스트"
cat << 'EOF' > /tmp/login_test.json
{"loginId":"admin","password":"<ADMIN_PASSWORD>"}
EOF
login_result=$(curl -s http://localhost:23001/auth/login -X POST \
    -H "Content-Type: application/json" -d @/tmp/login_test.json)
rm -f /tmp/login_test.json

if echo "$login_result" | grep -q '"code":200'; then
    echo "  ✓ 로그인 성공"
elif echo "$login_result" | grep -q '"code":607'; then
    echo "  △ 비밀번호 오류 (API 동작 정상, 비밀번호 확인 필요)"
else
    echo "  ✗ 로그인 실패: $login_result"
fi

# 5. OpenSearch 인덱스 확인
echo -e "\n[5/5] OpenSearch 인덱스"
index_count=$(curl -s "http://localhost:19200/_cat/indices/siem-*?h=index" 2>/dev/null | wc -l)
if [ "$index_count" -gt 0 ]; then
    echo "  ✓ SIEM 인덱스: $index_count개"
else
    echo "  △ SIEM 인덱스 없음 (로그 수신 후 자동 생성)"
fi

echo -e "\n=== 검증 완료 ==="
```

**검증 결과 해석:**

| 결과 | 의미 | 조치 |
|------|------|------|
| 모두 ✓ | 설치 성공 | 웹 브라우저로 접속 가능 |
| 서비스 ✗ | 서비스 시작 실패 | 로그 확인: `journalctl -u 서비스명` |
| API ✗ | DB 연결 실패 | 비밀번호 동기화 확인 |
| 로그인 △ | API 동작, 비밀번호 다름 | 관리자 비밀번호 재설정 |

### 폐쇄망 방화벽 설정

```bash
# 내부 통신용 포트 (localhost만 허용)
# PostgreSQL, Kafka, ZooKeeper, OpenSearch는 외부 접근 차단

# 외부 접근 허용 포트
sudo firewall-cmd --permanent --add-service=https     # 443
sudo firewall-cmd --permanent --add-port=514/udp      # Syslog
sudo firewall-cmd --permanent --add-port=162/udp      # SNMP Trap

sudo firewall-cmd --reload
```

---

## ⚠️ 중요: 설치 범위

**본 패키지는 SIEM 애플리케이션 전용 설치 패키지입니다.**

다음 인프라가 **사전에 설치 및 구성**되어 있어야 합니다:
- Java, PostgreSQL, Nginx, Kafka, OpenSearch

인프라 설치는 별도의 인프라 구축 가이드를 참조하거나, 시스템 관리자에게 문의하세요.

---

## 1. 사전 요구사항

### 1.1 하드웨어

| 항목 | 최소 | 권장 |
|------|------|------|
| CPU | 4 cores | 8+ cores |
| RAM | 8 GB | 16+ GB |
| Disk | 100 GB | 500+ GB |

### 1.2 필수 인프라 (사전 설치 필요)

> ⚠️ **아래 소프트웨어는 본 패키지에 포함되지 않습니다. 설치 전 반드시 확인하세요.**

| 소프트웨어 | 버전 | 포트 | 확인 명령 | 필수 |
|------------|------|------|-----------|------|
| Java | OpenJDK 8 | - | `java -version` | ✅ |
| PostgreSQL | 14+ | 15432 | `psql --version` | ✅ |
| Nginx | 1.x | 443 | `nginx -v` | ✅ |
| Kafka | 3.x | 19092 | `systemctl status kafka` | ✅ |
| OpenSearch | 1.3.x | 19200 | `systemctl status opensearch` | ✅ |
| Korean Fonts | - | - | `fc-list \| grep -i nanum` | ✅ (PDF 리포트용) |

### 1.3 사전 설치 검증 스크립트

설치 전 아래 명령으로 모든 요구사항을 확인하세요:

```bash
echo "=== 사전 요구사항 확인 ==="
echo -n "Java 8: "; java -version 2>&1 | head -1 || echo "NOT INSTALLED"
echo -n "PostgreSQL: "; psql --version 2>&1 || echo "NOT INSTALLED"
echo -n "Nginx: "; nginx -v 2>&1 || echo "NOT INSTALLED"
echo -n "Kafka: "; systemctl is-active kafka 2>/dev/null || echo "NOT RUNNING"
echo -n "OpenSearch: "; systemctl is-active opensearch 2>/dev/null || echo "NOT RUNNING"
echo -n "Korean Fonts: "; fc-list 2>/dev/null | grep -qi "nanum\|noto.*cjk" && echo "INSTALLED" || echo "NOT INSTALLED (PDF 한글 출력 불가)"
echo ""
echo "=== 포트 확인 ==="
ss -tlnp | grep -E '15432|19092|19200' || echo "Required ports not listening"
```

**모든 항목이 정상이어야 설치를 진행할 수 있습니다.**

---

## 2. 설치 패키지 구조

```
seekurity-siem-full-install-YYYYMMDD.tar.gz (약 812 MB)
├── bin/                    # JAR 파일 (7개)
│   ├── ss-api.jar          # 메인 API (133 MB)
│   ├── ss-log-stream.jar   # 로그 파서 (144 MB)
│   ├── ss-database-checker.jar
│   ├── ss-syslog-receiver.jar
│   ├── ss-snmp-collector.jar
│   ├── ss-packet-receiver.jar
│   └── ss-playbook-stream.jar
├── console/                # 웹 콘솔 (169 MB, node_modules 포함)
├── nodejs/                 # Node.js v20 (45 MB)
├── sql/init-schema.sql     # DB 스키마
└── install.sh              # 설치 스크립트
```

---

## 3. 설치 절차

### 3.1 패키지 업로드 및 압축 해제

```bash
# 서버로 업로드
scp seekurity-siem-full-install-YYYYMMDD.tar.gz user@<server-ip>:~/

# 압축 해제
cd ~
tar xzf seekurity-siem-full-install-YYYYMMDD.tar.gz
cd seekurity-siem-installer

# 줄바꿈 변환 (Windows에서 생성된 경우)
sed -i 's/\r$//' install.sh
chmod +x install.sh
```

### 3.2 설치 실행

```bash
sudo ./install.sh
```

### 3.3 설치 단계 (자동)

| 단계 | 설명 |
|------|------|
| Phase 1-2 | 사전 검사 (root, OS, Java, PostgreSQL, Nginx) |
| Phase 3 | 시스템 설정 (seekurity 사용자, 디렉토리 생성) |
| Phase 4 | Node.js 설치 (/opt/nodejs) |
| Phase 5 | SIEM 컴포넌트 배포 (JAR, 콘솔) |
| Phase 6 | 데이터베이스 설정 (스키마 로드) |
| Phase 7 | 서비스 설정 파일 생성 |
| Phase 8 | Nginx 설정 (SSL, 리버스 프록시) |
| Phase 9 | systemd 서비스 등록 |
| Phase 10 | 서비스 시작, Kafka 토픽, OpenSearch 인덱스 생성 |
| Phase 11 | 검증 |

### 3.4 라이선스 설치 (MANDATORY)

> ⚠️ **라이선스 파일이 없거나 유효하지 않으면 웹 콘솔 로그인이 차단됩니다** (`LICENSE_EXPIRED` 응답).
> install.sh 실행 후 반드시 고객사별 라이선스 파일을 설치해야 합니다.

라이선스 파일(`license.json`)은 Seekerslab이 고객사별로 발급하는 RSA SHA256 서명 파일입니다. 임의 수정 시 서명 검증에 실패하여 무효 처리됩니다.

```bash
# 1. 고객사 라이선스 파일을 서버로 전송 (예: <고객사>_license.json)
scp <고객사>_license.json engineer@<server-ip>:~/

# 2. 표준 경로에 배치 (경로/파일명 고정)
sudo cp ~/<고객사>_license.json /opt/seekurity-siem/conf/license.json
sudo chown seekurity:seekurity /opt/seekurity-siem/conf/license.json
sudo chmod 640 /opt/seekurity-siem/conf/license.json

# 3. 라이선스 재로드 (ss-api 재시작 불필요)
curl -s -X POST http://localhost:23001/license/reload
# 응답 data가 "VALID"이면 정상

# 4. 상태 확인 (인증 불필요)
curl -s http://localhost:23001/license/status
# "status":"VALID", 고객사명/만료일/최대 로그 소스 확인
```

| 라이선스 상태 | 의미 | 로그인 |
|---------------|------|--------|
| `VALID` | 유효 | ✅ 가능 |
| `GRACE` | 만료 후 유예 기간 (30일) | ✅ 가능 (콘솔에 경고 표시) |
| `EXPIRED` | 유예 기간 경과 | ❌ 차단 |
| `INVALID` | 파일 없음 / 서명 검증 실패(변조) | ❌ 차단 |

**운영 중 라이선스 갱신**: 웹 콘솔의 라이선스 관리 화면에서 새 파일 업로드(`POST /license/upload`, 업로드 이력이 `license_histories`에 기록됨) 또는 위 파일 교체 + reload 절차 사용.

---

## 4. 설치 후 디렉토리 구조

```
/opt/seekurity-siem/
├── bin/                    # JAR 파일
│   ├── ss-api.jar
│   ├── ss-log-stream.jar
│   ├── ss-database-checker.jar
│   ├── ss-syslog-receiver.jar
│   ├── ss-snmp-collector.jar
│   ├── ss-packet-receiver.jar
│   ├── ss-playbook-stream.jar
│   └── get-secret          # 비밀번호 관리 바이너리 (선택)
├── console/                # 웹 콘솔 (Next.js)
│   ├── .next/              # 빌드 결과물
│   ├── node_modules/       # NPM 패키지
│   ├── package.json
│   └── .env.production
├── conf/                   # 설정 파일
│   ├── ss-api.yml
│   ├── log-stream.yml
│   ├── database-checker.yml
│   └── license.json        # 라이선스 파일 (고객사별 발급, 3.4절 참조)
├── data/                   # 데이터 저장소
│   └── reports/            # 생성된 리포트 파일
│       ├── weekly/         # 주간 리포트 (PDF, XLSX)
│       ├── monthly/        # 월간 리포트
│       ├── yearly/         # 연간 리포트
│       └── custom/         # 사용자 정의 리포트
└── logs/                   # 로그 (ss-api/, ss-console/, ss-log-stream/, ...)
```

---

## 5. 서비스 구성

### 5.1 서비스 목록

| 서비스 | 포트 | 자동시작 | 설명 |
|--------|------|----------|------|
| ss-api | 23001 | ✅ | 메인 API |
| ss-console | 23002 | ✅ | 웹 콘솔 |
| nginx | 443 | ✅ | HTTPS 프록시 |
| ss-syslog-receiver | UDP 514 | ✅ | Syslog 수집 |
| ss-log-stream | - | ✅ | 로그 파싱/인덱싱 |
| ss-database-checker | - | ✅ | DB 모니터링 |
| ss-snmp-collector | UDP 162 | ✅ | SNMP Trap 수신 |
| ss-snmp-trap | - (송신 전용) | ✅ | SNMP Trap 송신 (시스템 알림, Rust) |
| ss-packet-receiver | - | ❌ | 패킷 캡처 (선택) |
| ss-playbook-stream | - | ❌ | 플레이북 자동화 (선택) |

### 5.2 선택적 서비스 활성화

```bash
# 패킷 캡처, 플레이북 (필요시)
sudo systemctl enable --now ss-packet-receiver ss-playbook-stream
```

### 5.3 자격 증명

| 항목 | 값 |
|------|-----|
| DB 비밀번호 | `<DB_PASSWORD>` |
| JWT Secret | `JwT3cr3tSk72026PrvK3y8M` |
| Jasypt Password | `JasyPtMast3r2026EncK7` |
| **관리자 계정 (웹)** | **로그인 ID**: `admin` / **비밀번호**: `<ADMIN_PASSWORD>` |
| **엔지니어 계정 (SSH)** | engineer / Eng1n33r@S33kur1ty2026 |

> **SSS-88 변경사항**: 로그인 시 이메일(`admin@seekerslab.com`) 대신 **로그인 ID**(`admin`)를 사용합니다.

### 5.4 시스템 계정

| 계정 | 용도 | Shell | sudo |
|------|------|-------|------|
| `engineer` | 시스템 관리 (SSH 접속) | `/bin/bash` | ✅ 가능 |
| `seekurity` | SIEM 서비스 실행 | `/usr/sbin/nologin` | ❌ 불가 |
| `postgres` | PostgreSQL 서비스 | `/usr/sbin/nologin` | ❌ 불가 |

> ⚠️ **중요**: 설치 후 engineer 계정의 비밀번호를 반드시 변경하세요!
> ```bash
> ssh engineer@<server-ip>
> passwd  # 비밀번호 변경
> ```

---

## 6. 설치 확인

### 6.1 서비스 상태

```bash
systemctl is-active ss-api ss-console ss-log-stream ss-database-checker ss-syslog-receiver ss-snmp-collector ss-snmp-trap nginx
# 출력: active active active active active active active active
```

### 6.2 포트 확인

```bash
ss -tlnp | grep -E '23001|23002|443'
```

### 6.3 웹 접속

```bash
curl -k https://localhost/auth/login | grep -c Seekurity
# 브라우저: https://<server-ip>/
```

### 6.4 라이선스 상태

```bash
curl -s http://localhost:23001/license/status
# "status":"VALID" 확인 — INVALID면 3.4절 라이선스 설치 수행
```

> 라이선스가 `INVALID`/`EXPIRED`이면 웹 로그인이 차단되므로, 로그인 테스트 전에 반드시 확인합니다.

---

## 7. 방화벽 설정

```bash
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=514/udp
sudo firewall-cmd --permanent --add-port=162/udp
sudo firewall-cmd --reload
```

---

## 8. 수동 설치 (install.sh 실패 시)

install.sh가 실패하거나 특정 단계만 수동으로 진행해야 하는 경우 아래 절차를 따르세요.

### 8.1 시스템 사용자 생성

```bash
# 서비스 계정 (프로세스 실행용 - 로그인 불가)
sudo useradd --system --no-create-home --shell /usr/sbin/nologin seekurity

# 엔지니어 계정 (시스템 관리용 - sudo 권한)
sudo useradd --create-home --shell /bin/bash engineer
echo "engineer:Eng1n33r@S33kur1ty2026" | sudo chpasswd
sudo usermod -aG wheel engineer  # RHEL/Rocky
# 또는: sudo usermod -aG sudo engineer  # Debian/Ubuntu
```

### 8.2 디렉토리 구조 생성

```bash
sudo mkdir -p /opt/seekurity-siem/{bin,conf,data,logs}
sudo mkdir -p /opt/seekurity-siem/logs/{ss-api,ss-console,ss-log-stream,ss-syslog-receiver,ss-snmp-collector,ss-packet-receiver,ss-playbook-stream,ss-database-checker}
```

### 8.3 Node.js 설치

```bash
cd ~/seekurity-siem-installer
sudo tar xzf nodejs/nodejs.tar.gz -C /opt/
sudo ln -sfn /opt/node-v* /opt/nodejs

# PATH 설정
echo 'export PATH=/opt/nodejs/bin:$PATH' | sudo tee /etc/profile.d/nodejs.sh
source /etc/profile.d/nodejs.sh

# 확인
node --version   # v20.14.0
npm --version    # 10.7.0
```

### 8.4 JAR 파일 배포

```bash
sudo cp ~/seekurity-siem-installer/bin/*.jar /opt/seekurity-siem/bin/
```

### 8.5 웹 콘솔 배포

```bash
# 콘솔 디렉토리 생성
sudo mkdir -p /opt/seekurity-siem/console

# 콘솔 압축 해제 (ss-console 디렉토리가 tarball에 포함됨)
sudo tar xzf ~/seekurity-siem-installer/console/ss-console-full.tar.gz -C /opt/seekurity-siem/console/

# ss-console/ 하위 디렉토리에서 내용 이동
sudo mv /opt/seekurity-siem/console/ss-console/* /opt/seekurity-siem/console/ 2>/dev/null || true
sudo mv /opt/seekurity-siem/console/ss-console/.[!.]* /opt/seekurity-siem/console/ 2>/dev/null || true
sudo rmdir /opt/seekurity-siem/console/ss-console 2>/dev/null || true

# 환경 변수 설정
sudo tee /opt/seekurity-siem/console/.env.production << 'EOF'
NODE_ENV=production
API_HOST=http://localhost:23001
PORT=23002
NEXT_TELEMETRY_DISABLED=1
EOF

sudo cp /opt/seekurity-siem/console/.env.production /opt/seekurity-siem/console/.env
```

### 8.6 데이터베이스 설정

```bash
# 사용자 및 DB 생성 (PostgreSQL이 15432 포트에서 실행 중인 경우)
sudo -u postgres psql -p 15432 << 'EOF'
CREATE USER seekers WITH PASSWORD '<DB_PASSWORD>';
CREATE DATABASE siem OWNER seekers;
GRANT ALL PRIVILEGES ON DATABASE siem TO seekers;
EOF

# 스키마 로드
sudo -u postgres psql -p 15432 -d siem -f ~/seekurity-siem-installer/sql/init-schema.sql

# 관리자 계정 생성
sudo -u postgres psql -p 15432 -d siem << 'EOF'
INSERT INTO users (uuid, user_email, user_password, user_name, role_uuid, is_deleted, created_time_at)
VALUES (
    gen_random_uuid()::text,
    'admin@seekerslab.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqKqzKzKqzKqzKqzKqzKqzKqzKqzK',
    'Administrator',
    (SELECT uuid FROM roles WHERE name = 'admin' LIMIT 1),
    false,
    NOW()
);
EOF
```

### 8.7 설정 파일 생성

#### ss-api.yml
```bash
sudo tee /opt/seekurity-siem/conf/ss-api.yml << 'EOF'
spring:
  cloud:
    config:
      enabled: false
  datasource:
    url: jdbc:postgresql://localhost:15432/siem
    username: seekers
    password: <DB_PASSWORD>
    driver-class-name: org.postgresql.Driver
  jpa:
    hibernate:
      ddl-auto: none
  messages:
    encoding: UTF-8

jwt:
  secret: JwT3cr3tSk72026PrvK3y8M
  expiration: 86400000

server:
  port: 23001

jasypt:
  encryptor:
    password: JasyPtMast3r2026EncK7
EOF
```

#### log-stream.yml
```bash
sudo tee /opt/seekurity-siem/conf/log-stream.yml << 'EOF'
spring:
  cloud:
    config:
      enabled: false
  datasource:
    url: jdbc:postgresql://localhost:15432/siem
    username: seekers
    password: <DB_PASSWORD>
    driver-class-name: org.postgresql.Driver
  kafka:
    bootstrap-servers: localhost:19092

jasypt:
  encryptor:
    password: JasyPtMast3r2026EncK7

opensearch:
  host: localhost
  port: 19200
EOF
```

#### syslog-receiver.yml
```bash
sudo tee /opt/seekurity-siem/conf/syslog-receiver.yml << 'EOF'
spring:
  cloud:
    config:
      enabled: false
  kafka:
    bootstrap-servers: localhost:19092

syslog:
  port: 514

user:
  timezone: Asia/Seoul
EOF
```

#### snmp-collector.yml
```bash
sudo tee /opt/seekurity-siem/conf/snmp-collector.yml << 'EOF'
spring:
  cloud:
    config:
      enabled: false
  datasource:
    url: jdbc:postgresql://localhost:15432/siem
    username: seekers
    password: <DB_PASSWORD>
    driver-class-name: org.postgresql.Driver
  messages:
    encoding: UTF-8
EOF
```

#### database-checker.yml
```bash
sudo tee /opt/seekurity-siem/conf/database-checker.yml << 'EOF'
spring:
  cloud:
    config:
      enabled: false
  datasource:
    url: jdbc:postgresql://localhost:15432/siem
    username: seekers
    password: <DB_PASSWORD>
    driver-class-name: org.postgresql.Driver
  messages:
    encoding: UTF-8
  encryption:
    secret: JasyPtMast3r2026EncK7
EOF
```

### 8.8 systemd 서비스 파일 생성

#### ss-api.service
```bash
sudo tee /etc/systemd/system/ss-api.service << 'EOF'
[Unit]
Description=Seekurity SIEM API
After=network.target postgresql.service

[Service]
User=seekurity
Group=seekurity
Type=simple
WorkingDirectory=/opt/seekurity-siem
ExecStart=/usr/bin/java -Xms512m -Xmx2048m -Duser.timezone=UTC -jar /opt/seekurity-siem/bin/ss-api.jar --spring.profiles.active=appliance --spring.config.additional-location=file:/opt/seekurity-siem/conf/ss-api.yml
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-api/ss-api.log
StandardError=append:/opt/seekurity-siem/logs/ss-api/ss-api.log

[Install]
WantedBy=multi-user.target
EOF
```

#### ss-console.service
```bash
sudo tee /etc/systemd/system/ss-console.service << 'EOF'
[Unit]
Description=Seekurity SIEM Web Console
After=network.target ss-api.service

[Service]
User=seekurity
Group=seekurity
Type=simple
WorkingDirectory=/opt/seekurity-siem/console
Environment="PATH=/opt/nodejs/bin:/usr/bin:/bin"
Environment=NODE_ENV=production
Environment=PORT=23002
Environment=API_HOST=http://localhost:23001
ExecStart=/opt/nodejs/bin/npm start
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-console/ss-console.log
StandardError=append:/opt/seekurity-siem/logs/ss-console/ss-console.log

[Install]
WantedBy=multi-user.target
EOF
```

#### ss-log-stream.service
```bash
sudo tee /etc/systemd/system/ss-log-stream.service << 'EOF'
[Unit]
Description=Seekurity SIEM Log Stream
After=network.target kafka.service opensearch.service

[Service]
User=seekurity
Group=seekurity
Type=simple
WorkingDirectory=/opt/seekurity-siem
ExecStart=/usr/bin/java -Xms256m -Xmx1024m -Duser.timezone=UTC -Djasypt.encryptor.password=JasyPtMast3r2026EncK7 -jar /opt/seekurity-siem/bin/ss-log-stream.jar --spring.profiles.active=appliance --spring.config.additional-location=file:/opt/seekurity-siem/conf/log-stream.yml
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-log-stream/ss-log-stream.log
StandardError=append:/opt/seekurity-siem/logs/ss-log-stream/ss-log-stream.log

[Install]
WantedBy=multi-user.target
EOF
```

#### ss-syslog-receiver.service
```bash
sudo tee /etc/systemd/system/ss-syslog-receiver.service << 'EOF'
[Unit]
Description=Seekurity SIEM Syslog Receiver
After=network.target

[Service]
User=root
Type=simple
WorkingDirectory=/opt/seekurity-siem
ExecStart=/usr/bin/java -Xms128m -Xmx512m -Duser.timezone=UTC -Dspring.kafka.bootstrap-servers=localhost:19092 -jar /opt/seekurity-siem/bin/ss-syslog-receiver.jar --spring.profiles.active=appliance --spring.config.additional-location=file:/opt/seekurity-siem/conf/syslog-receiver.yml
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log
StandardError=append:/opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log

[Install]
WantedBy=multi-user.target
EOF
```

#### ss-snmp-collector.service
```bash
sudo tee /etc/systemd/system/ss-snmp-collector.service << 'EOF'
[Unit]
Description=Seekurity SIEM SNMP Collector
After=network.target

[Service]
User=root
Type=simple
WorkingDirectory=/opt/seekurity-siem
ExecStart=/usr/bin/java -Xms128m -Xmx512m -Duser.timezone=UTC -jar /opt/seekurity-siem/bin/ss-snmp-collector.jar --spring.profiles.active=appliance --spring.config.additional-location=file:/opt/seekurity-siem/conf/snmp-collector.yml
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-snmp-collector/ss-snmp-collector.log
StandardError=append:/opt/seekurity-siem/logs/ss-snmp-collector/ss-snmp-collector.log

[Install]
WantedBy=multi-user.target
EOF
```

#### ss-database-checker.service
```bash
sudo tee /etc/systemd/system/ss-database-checker.service << 'EOF'
[Unit]
Description=Seekurity SIEM Database Checker
After=network.target postgresql.service

[Service]
User=seekurity
Group=seekurity
Type=simple
WorkingDirectory=/opt/seekurity-siem
ExecStart=/usr/bin/java -Xms128m -Xmx256m -Duser.timezone=UTC -jar /opt/seekurity-siem/bin/ss-database-checker.jar --spring.profiles.active=appliance --spring.config.additional-location=file:/opt/seekurity-siem/conf/database-checker.yml
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log
StandardError=append:/opt/seekurity-siem/logs/ss-database-checker/ss-database-checker.log

[Install]
WantedBy=multi-user.target
EOF
```

### 8.9 Nginx 설정

```bash
# SSL 인증서 생성 (없는 경우) - SSS-98: 10년 유효기간
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/nginx.key \
    -out /etc/nginx/ssl/nginx.crt \
    -subj "/CN=seekurity-siem"

# Nginx 설정
sudo tee /etc/nginx/conf.d/seekurity-siem.conf << 'EOF'
server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /etc/nginx/ssl/nginx.crt;
    ssl_certificate_key /etc/nginx/ssl/nginx.key;

    location / {
        proxy_pass http://127.0.0.1:23002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:23001/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
EOF

# 설정 테스트
sudo nginx -t
```

### 8.10 소유권 설정 및 서비스 시작

```bash
# 소유권 설정
sudo chown -R seekurity:seekurity /opt/seekurity-siem

# 로그 파일 생성
sudo touch /opt/seekurity-siem/logs/{ss-api/ss-api,ss-console/ss-console,ss-log-stream/ss-log-stream,ss-syslog-receiver/ss-syslog-receiver,ss-snmp-collector/ss-snmp-collector,ss-database-checker/ss-database-checker}.log
sudo chown seekurity:seekurity /opt/seekurity-siem/logs/*/*.log

# systemd 리로드
sudo systemctl daemon-reload

# 서비스 활성화 및 시작
sudo systemctl enable --now ss-api ss-console ss-log-stream ss-syslog-receiver ss-snmp-collector ss-database-checker nginx
```

### 8.11 Kafka 토픽 생성

```bash
# Kafka 토픽 생성 (Kafka가 /opt/kafka에 설치된 경우)
/opt/kafka/bin/kafka-topics.sh --create --bootstrap-server localhost:19092 --topic siem-logs --partitions 3 --replication-factor 1 --if-not-exists
/opt/kafka/bin/kafka-topics.sh --create --bootstrap-server localhost:19092 --topic syslog_udp --partitions 3 --replication-factor 1 --if-not-exists
```

### 8.12 OpenSearch 인덱스 생성

```bash
# 인덱스 템플릿 생성
curl -X PUT "http://localhost:19200/_index_template/siem-logs-template" -H "Content-Type: application/json" -d '{"index_patterns":["siem-logs-*"],"template":{"settings":{"number_of_shards":1,"number_of_replicas":0}}}'

curl -X PUT "http://localhost:19200/_index_template/siem-flows-template" -H "Content-Type: application/json" -d '{"index_patterns":["siem-flows-*"],"template":{"settings":{"number_of_shards":1,"number_of_replicas":0}}}'

# 오늘 날짜 인덱스 생성
TODAY=$(date +%Y-%m-%d)
curl -X PUT "http://localhost:19200/siem-logs-${TODAY}"
curl -X PUT "http://localhost:19200/siem-flows-${TODAY}"
```

### 8.13 설치 확인

```bash
# 서비스 상태 확인
systemctl is-active ss-api ss-console ss-log-stream ss-syslog-receiver ss-snmp-collector ss-database-checker nginx

# 포트 확인
ss -tlnp | grep -E '23001|23002|443'

# 웹 접속 테스트
curl -k https://localhost/auth/login | grep -c Seekurity
```

---

## 9. 데이터베이스 스키마

### 9.1 스키마 버전

현재 스키마 버전: **v5.0** (2026-02-10)

### 9.2 주요 테이블 구조 (v5.0)

v5.0에서 **템플릿/사용자 데이터 분리** 구조로 변경되었습니다.

#### 로그 관리 테이블

| 테이블 | 유형 | 설명 |
|--------|------|------|
| `log_vendor_templates` | 템플릿 (읽기 전용) | 시스템 제공 벤더 카탈로그 (Cisco, Palo Alto 등) |
| `log_device_type_templates` | 템플릿 (읽기 전용) | 시스템 제공 장비 유형 (ASA, PAN-OS 등) |
| `log_parser_templates` | 템플릿 (읽기 전용) | 시스템 제공 파서 (정규식 패턴) |
| `log_vendors` | 사용자 정의 | 사용자가 생성한 벤더 |
| `log_device_types` | 사용자 정의 | 사용자가 생성한 장비 유형 |
| `log_sources` | 사용자 정의 | 로그 수집기 (구 `infra_collectors`) |
| `log_parsers` | 사용자 정의 | 수집기별 파서 (구 `infra_collector_regexes`) |

#### 테이블 관계

```
log_vendor_templates (시스템 벤더)
    └── log_device_type_templates (시스템 장비)
            └── log_parser_templates (시스템 파서)

log_vendors (사용자 벤더)
    └── log_device_types (사용자 장비)

log_sources (수집기)
    ├── device_type_id + device_type_source → log_device_type_templates 또는 log_device_types
    └── log_parsers (수집기별 파서)
```

#### device_type_source 필드

`log_sources` 테이블의 `device_type_source` 필드로 참조 테이블 결정:
- `'template'`: `log_device_type_templates` 참조 (시스템 제공 장비)
- `'user'`: `log_device_types` 참조 (사용자 정의 장비)

### 9.3 v5.0 마이그레이션 (기존 설치 업그레이드)

기존 v4.x 설치를 v5.0으로 업그레이드하는 경우:

```bash
# 마이그레이션 스크립트 실행
sudo -u postgres psql -p 15432 -d siem -f /path/to/007_template_user_separation.sql
```

**주요 변경사항**:
- `infra_collectors` → `log_sources` (테이블 이름 변경)
- `infra_collector_regexes` → `log_parsers` (테이블 이름 변경)
- `log_vendors` → `log_vendor_templates` (기존 데이터는 템플릿으로 이동)
- `log_device_types` → `log_device_type_templates` (기존 데이터는 템플릿으로 이동)
- `log_device_type_parsers` → `log_parser_templates` (기존 데이터는 템플릿으로 이동)

### 9.4 API 엔드포인트 변경 (v5.0)

| 기존 API | 신규 API | 설명 |
|----------|----------|------|
| `/infra/collector` | `/log/source` | 로그 수집기 CRUD |
| `/infra/collector/parser` | `/log/parser` | 사용자 파서 CRUD |
| - | `/log/vendor-template` | 벤더 템플릿 조회 (읽기 전용) |
| - | `/log/device-type-template` | 장비 유형 템플릿 조회 (읽기 전용) |
| - | `/log/parser-template` | 파서 템플릿 조회 (읽기 전용) |
| - | `/log/vendor-all` | 통합 벤더 조회 (드롭다운용) |
| - | `/log/device-type-all` | 통합 장비 유형 조회 (드롭다운용) |

---

## 10. 문제 해결

| 문제 | 확인 명령 |
|------|-----------|
| 서비스 시작 실패 | `journalctl -u ss-api -n 50` |
| DB 연결 실패 | `sudo -u postgres psql -p 15432 -d siem -c "SELECT 1;"` |
| 웹 접속 불가 | `nginx -t && systemctl status nginx` |
| 로그인 후 이동 안됨 | HTTPS 접속 확인, 쿠키 허용 확인 |
| 서비스 activating 상태 | 로그 확인: `tail -100 /opt/seekurity-siem/logs/ss-*/ss-*.log` |

### SELinux 관련 (Rocky/RHEL Enforcing 환경)

v6.10부터 install.sh가 자동 처리하지만, 수동 설치 또는 기존 설치본에서 아래 증상이 나오면 확인:

| 증상 | 원인 | 해결 |
|------|------|------|
| 웹 접속 502 (nginx error.log에 `Permission denied`) | `httpd_can_network_connect` off — nginx가 23001/23002로 연결 불가 | `sudo setsebool -P httpd_can_network_connect on` |
| ss-console 무한 재시작 (`status=209/STDOUT`) | systemd `StandardOutput=append:`가 /opt(usr_t) 파일에 쓰기 불가 | 유닛의 StandardOutput/StandardError를 `journal`로 변경 후 `daemon-reload` |

### 시드 데이터 검증 실패 (roles=0 / users=0)

v6.10부터 install.sh가 Phase 6에서 검증 후 실패 시 즉시 중단합니다. 발생 시:

```bash
# 1. 설치 로그에서 psql ERROR 확인
grep -i 'ERROR' /tmp/seekurity-siem-install-*.log | head -20

# 2. 수동 재적재 (v6.10+ 패키지의 시드는 멱등 — 중복 키 안전)
sudo -u postgres psql -p 15432 -d siem -f seekurity-siem-installer/sql/init-database.sql

# 3. 확인
sudo -u postgres psql -p 15432 -d siem -tAc "SELECT COUNT(*) FROM roles"
```

admin 로그인은 설치 시 기본값(`admin` / `<ADMIN_PASSWORD>`)으로 강제 설정됨 — **운영 전 반드시 변경**.
| 디스크 100% 가득 | `df -h` 로그 파일 확인 |

### 10.1 로그 로테이션 및 디스크 관리 (중요!)

SIEM 서비스는 로그를 지속적으로 생성하므로 적절한 로그 로테이션 설정이 필수입니다.

#### 문제: ss-syslog-receiver 로그 무한 증가

**증상**: 디스크가 100% 가득 차면서 서비스 중단
```bash
df -h
# /dev/vda1   97G   97G     0 100% /
```

**원인**: systemd의 `StandardOutput=append:` 옵션이 logback의 롤링 정책을 우회

```ini
# 잘못된 설정 (문제 발생)
[Service]
StandardOutput=append:/opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log
```

**해결**: logback이 로그 롤링을 처리하도록 systemd 출력을 `null`로 설정

```ini
# 올바른 설정
[Service]
StandardOutput=null
StandardError=null
```

#### ss-syslog-receiver.service 수정

```bash
# 서비스 중지
sudo systemctl stop ss-syslog-receiver

# 서비스 파일 수정
sudo vi /etc/systemd/system/ss-syslog-receiver.service
```

```ini
[Unit]
Description=Seekurity SIEM Syslog Receiver Service
After=network.target kafka.service
Wants=kafka.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/seekurity-siem
ExecStart=/usr/bin/java -jar -Dspring.kafka.bootstrap-servers=localhost:19092 -Xms256m -Xmx256m -Duser.timezone=Asia/Seoul /opt/seekurity-siem/bin/ss-syslog-receiver.jar
Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5

# logback이 로그 롤링 처리하므로 systemd는 null로 설정
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
```

```bash
# 적용
sudo systemctl daemon-reload
sudo systemctl start ss-syslog-receiver
```

#### Logback 로테이션 설정 (참고)

ss-syslog-receiver JAR에 내장된 logback-spring.xml:

| 설정 | 값 | 설명 |
|------|-----|------|
| `maxFileSize` | 100MB | 단일 로그 파일 최대 크기 |
| `maxHistory` | 7 | 보관 일수 |
| `totalSizeCap` | 1GB | 전체 로그 용량 제한 |

```xml
<rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
    <fileNamePattern>${LOG_PATH}/ss-syslog-receiver/ss-syslog-receiver.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
    <maxFileSize>100MB</maxFileSize>
    <maxHistory>7</maxHistory>
    <totalSizeCap>1GB</totalSizeCap>
</rollingPolicy>
```

#### 디스크 가득 찬 경우 긴급 복구

```bash
# 1. 대용량 로그 파일 확인
sudo du -sh /opt/seekurity-siem/logs/*/*.log | sort -hr | head -10

# 2. 문제 로그 파일 비우기 (서비스 중지 없이)
sudo truncate -s 0 /opt/seekurity-siem/logs/ss-syslog-receiver/ss-syslog-receiver.log

# 3. 디스크 여유 공간 확인
df -h /

# 4. 서비스 재시작 (필요 시)
sudo systemctl restart ss-api
```

#### 디스크 모니터링 권장

```bash
# crontab에 추가 (매일 체크)
0 9 * * * [ $(df / --output=pcent | tail -1 | tr -dc '0-9') -gt 80 ] && echo "DISK WARNING: $(df -h / | tail -1)" | mail -s "SIEM Disk Alert" admin@example.com
```

### 10.2 서비스 "activating" 상태 문제

서비스가 `activating (auto-restart)` 상태인 경우, Java 앱이 시작 후 크래시되어 재시작 루프에 빠진 것입니다.

**주요 원인**:
1. Spring Cloud Config 서버 연결 실패 (`localhost:8888` 접속 불가)
2. 설정 파일 누락 또는 플레이스홀더 미해결

**해결 방법**: 설정 파일에 다음 항목 확인:
```yaml
spring:
  cloud:
    config:
      enabled: false  # Config 서버 비활성화 필수
```

---

## 11. 보안 강화: Get-Secret 바이너리 (SSS-96)

> **Jira**: [SSS-96](http://jira.seekers.co/browse/SSS-96) - DB 접속 패스워드 평문 보관 개선
>
> **권장**: 고보안 환경에서 Jasypt 마스터 비밀번호를 안전하게 관리하기 위한 Rust 바이너리

### 11.1 개요

기존 방식은 Jasypt 비밀번호를 서비스 파일에 평문으로 저장합니다. `get-secret` 바이너리를 사용하면 비밀번호가 암호화된 상태로 바이너리에 내장되어 더 안전합니다.

| 구분 | 기존 방식 (취약) | get-secret 방식 (권장) |
|------|-----------------|----------------------|
| **저장 위치** | 서비스 파일에 `Environment="JASYPT_PASSWORD=..."` | 바이너리 내장 (AES-256 암호화) |
| **보안** | `cat ss-api.service`로 비밀번호 노출 | XOR 난독화 + AES-256-GCM |
| **키 노출** | 서비스 파일 읽기 시 평문 노출 | `strings` 명령어로도 키 보이지 않음 |
| **런타임** | 서비스 파일에 영구 저장 | 프로세스 메모리에만 존재 |

### 11.2 키 보호 방법 (4가지)

| 방법 | 보안 수준 | 설명 |
|------|-----------|------|
| **1. XOR 난독화** | ★★★☆☆ | 키가 `strings` 명령어로 보이지 않음 (기본값) |
| **2. 키 분산** | ★★☆☆☆ | 키를 여러 조각으로 분리 |
| **3. 빌드 시 주입** | ★★★★☆ | 소스코드에 키 없음 - 가장 안전 |
| **4. 머신 바인딩** | ★★★★★ | 다른 머신에서 복호화 불가능 |

### 11.3 Rust 설치

```bash
# 온라인 환경
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 설치 확인
rustc --version
cargo --version
```

**오프라인 환경**: Rust 스탠드얼론 설치 파일 다운로드 후 설치
```bash
wget https://static.rust-lang.org/dist/rust-1.75.0-x86_64-unknown-linux-gnu.tar.gz
tar xzf rust-1.75.0-x86_64-unknown-linux-gnu.tar.gz
cd rust-1.75.0-x86_64-unknown-linux-gnu
sudo ./install.sh
```

### 11.4 소스코드 다운로드 및 빌드

```bash
# GitLab에서 클론
cd /tmp
git clone http://gitlab.seekers.co/dev_admin/int-seekurity_siem-workspace.git
cd int-seekurity_siem-workspace/tools/get-secret

# Release 빌드
cargo build --release
```

### 11.5 키 설정 (XOR 난독화 방법)

```bash
# 1. XOR 난독화 키 생성 (32바이트 필수)
./target/release/get-secret --generate-xor-key "YourSecretKey32BytesHere!!"
```

출력된 `OBFUSCATED_KEY`를 `src/main.rs`에 복사:
```rust
const OBFUSCATED_KEY: [u8; 32] = [
    0x09, 0x5E, 0xEF, 0x78, ...
];
```

```bash
# 2. 재빌드
cargo build --release

# 3. 시크릿 암호화
./target/release/get-secret --encrypt "JasyPtMast3r2026EncK7"
```

출력된 암호화 값을 `src/main.rs`의 `ENCRYPTED_SECRET`에 복사 후 재빌드.

### 11.6 배포

```bash
# 디렉토리 생성
sudo mkdir -p /opt/seekurity-siem/bin

# 바이너리 복사
sudo cp target/release/get-secret /opt/seekurity-siem/bin/

# 권한 설정 (root만 실행 가능)
sudo chmod 700 /opt/seekurity-siem/bin/get-secret
sudo chown root:root /opt/seekurity-siem/bin/get-secret
```

### 11.7 Systemd 서비스 수정

기존 서비스 파일을 수정하여 `get-secret` 바이너리를 사용합니다.

> **중요**: `EnvironmentFile`은 `ExecStartPre` 보다 먼저 로드되므로, **래퍼 스크립트 방식**을 사용해야 합니다.

#### ss-api.service 수정
```bash
sudo tee /etc/systemd/system/ss-api.service << 'EOF'
[Unit]
Description=Seekurity SIEM API
After=network.target postgresql.service kafka.service opensearch.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/seekurity-siem

# SSS-96: get-secret 바이너리로 시크릿 복호화 후 환경변수로 전달
# 래퍼 스크립트를 통해 환경변수 설정 및 Java 실행
ExecStart=/bin/bash -c '\
  export $(/opt/seekurity-siem/bin/get-secret) && \
  exec /usr/bin/java -Xms512m -Xmx2048m -Duser.timezone=UTC \
    -Djasypt.encryptor.password="$JASYPT_PASSWORD" \
    -jar /opt/seekurity-siem/bin/ss-api.jar \
    --spring.profiles.active=appliance \
    --spring.config.additional-location=file:/opt/seekurity-siem/conf/ss-api.yml'

Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-api/ss-api.log
StandardError=append:/opt/seekurity-siem/logs/ss-api/ss-api.log

[Install]
WantedBy=multi-user.target
EOF
```

#### ss-log-stream.service 수정
```bash
sudo tee /etc/systemd/system/ss-log-stream.service << 'EOF'
[Unit]
Description=Seekurity SIEM Log Stream
After=network.target kafka.service ss-api.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=/opt/seekurity-siem

# SSS-96: get-secret 바이너리로 시크릿 복호화 후 환경변수로 전달
# CRITICAL: 반드시 UTC 타임존으로 실행 (Asia/Seoul 사용 금지)
ExecStart=/bin/bash -c '\
  export $(/opt/seekurity-siem/bin/get-secret) && \
  exec /usr/bin/java -Xms256m -Xmx1024m \
    -Djasypt.encryptor.password="$JASYPT_PASSWORD" \
    -Dspring.profiles.active=appliance \
    -Dspring.config.additional-location=file:/opt/seekurity-siem/conf/log-stream.yml \
    -Duser.timezone=UTC \
    -jar /opt/seekurity-siem/bin/ss-log-stream.jar'

Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/seekurity-siem/logs/ss-log-stream/ss-log-stream.log
StandardError=append:/opt/seekurity-siem/logs/ss-log-stream/ss-log-stream.log

[Install]
WantedBy=multi-user.target
EOF
```

#### 래퍼 스크립트 방식 설명

```
1. /bin/bash -c '...' 로 래퍼 셸 실행
2. export $(/opt/.../get-secret) 로 환경변수 설정 (JASYPT_PASSWORD=xxx)
3. exec java ... 로 Java 프로세스로 대체 (bash 프로세스 종료)
4. 비밀번호는 프로세스 메모리에만 존재, 파일로 저장되지 않음
```

### 11.8 서비스 재시작

```bash
# systemd 리로드
sudo systemctl daemon-reload

# 서비스 재시작
sudo systemctl restart ss-api ss-log-stream

# 상태 확인
sudo systemctl status ss-api ss-log-stream
```

### 11.9 검증

```bash
# 1. 바이너리 테스트
sudo bash /opt/seekurity-siem/bin/get-secret
# 예상 출력: JASYPT_PASSWORD=<암호화된_비밀번호>

# 2. 키 노출 여부 확인 - 결과 없어야 함 (Rust 바이너리 사용 시)
strings /opt/seekurity-siem/bin/get-secret | grep -i "master\|jasypt\|password"
# 결과: (없음)

# 3. 서비스 파일에 평문 비밀번호 없음 확인
grep -c 'SeekuritySIEM-Master' /etc/systemd/system/ss-api.service
# 결과: 0 (평문 없음)

# 4. 서비스 상태 확인
systemctl is-active ss-api ss-log-stream
# 결과: active active

# 5. API 응답 확인
curl -s -o /dev/null -w '%{http_code}' http://localhost:23001/
# 결과: 200
```

### 11.10 빌드 시 환경변수 주입 (가장 안전)

소스코드에 키가 전혀 없는 가장 안전한 방법:

```bash
# 1. main.rs에서 get_key_buildtime_method() 활성화
vi src/main.rs
```

```rust
fn get_decryption_key() -> [u8; 32] {
    // get_key_xor_method()        // 주석 처리
    get_key_buildtime_method()     // 활성화
}
```

```bash
# 2. 환경변수로 키 전달하며 빌드
SIEM_BUILD_KEY="YourSecretKey32BytesHere!!" cargo build --release

# 3. 이후 동일하게 배포
sudo cp target/release/get-secret /opt/seekurity-siem/bin/
```

### 11.11 보안 체크리스트

| 항목 | 확인 명령 | 예상 결과 |
|------|-----------|-----------|
| 바이너리 권한 | `ls -la /opt/seekurity-siem/bin/get-secret` | `-rwx------` (700) |
| 바이너리 소유자 | `stat /opt/seekurity-siem/bin/get-secret` | `root:root` |
| strings로 키 안 보임 | `strings get-secret \| grep -i password` | (없음) - Rust 바이너리 사용 시 |
| 서비스 파일 평문 없음 | `grep -c 'SeekuritySIEM-Master' /etc/systemd/system/ss-api.service` | `0` |
| 서비스 동작 확인 | `systemctl is-active ss-api ss-log-stream` | `active active` |
| API 응답 확인 | `curl -s -o /dev/null -w '%{http_code}' http://localhost:23001/` | `200` |

### 11.12 상세 문서

전체 가이드: [GET_SECRET_INSTALLATION.md](GET_SECRET_INSTALLATION.md)

### 11.13 Linux 계정 보안 강화 (SSS-97)

> **Jira**: [SSS-97](http://jira.seekers.co/browse/SSS-97) - seekurity, postgres 계정 패스워드 개선

#### 시스템 계정 구조

| 계정 | 용도 | Shell | sudo | 설명 |
|------|------|-------|------|------|
| `engineer` | 시스템 관리 | `/bin/bash` | ✅ | SSH 접속 및 관리 작업용 |
| `seekurity` | SIEM 서비스 | `/usr/sbin/nologin` | ❌ | 프로세스 실행 전용 |
| `postgres` | PostgreSQL | `/usr/sbin/nologin` | ❌ | DB 서비스 전용 |

#### 서비스 계정 nologin 설정

PostgreSQL 및 SIEM 서비스 계정의 직접 로그인을 차단하여 보안을 강화합니다.

#### nologin 설정 방법

```bash
# postgres 계정 nologin 설정
sudo usermod -s /usr/sbin/nologin postgres

# 확인
grep postgres /etc/passwd
# 결과: postgres:x:...:...::/var/lib/postgresql:/usr/sbin/nologin
```

#### nologin 설정 후에도 동작하는 기능

| 기능 | 동작 여부 | 설명 |
|------|----------|------|
| PostgreSQL 서비스 시작/종료 | ✅ 정상 | `systemctl start/stop postgresql` |
| `sudo -u postgres psql` | ✅ 정상 | 관리 명령 실행 가능 |
| Peer 인증 로컬 접속 | ✅ 정상 | 로컬 소켓 연결 |
| 애플리케이션 DB 접속 | ✅ 정상 | TCP/IP 연결 (md5 인증) |
| SSH 직접 로그인 | ❌ 차단 | **보안 강화** |
| `su - postgres` 셸 | ❌ 차단 | **보안 강화** |

#### install.sh 자동 설정

`install.sh` Phase 6.5에서 자동으로 postgres 계정을 nologin으로 설정합니다:

```bash
# Phase 6.5에서 자동 실행
if id postgres &>/dev/null; then
    usermod -s /usr/sbin/nologin postgres
fi
```

#### DB 비밀번호 변경 절차 (정기 변경용)

```bash
# 1. PostgreSQL 비밀번호 변경 (DB 레벨)
sudo -u postgres psql -p 15432 -c "ALTER USER seekers WITH PASSWORD 'NewPassword123!';"
sudo -u postgres psql -p 15432 -c "ALTER USER postgres WITH PASSWORD 'NewAdminPass456!';"

# 2. 설정 파일 업데이트
sudo vi /opt/seekurity-siem/conf/ss-api.yml
sudo vi /opt/seekurity-siem/conf/log-stream.yml
# password: NewPassword123! 로 변경

# 3. 서비스 재시작
sudo systemctl restart ss-api ss-log-stream ss-database-checker
```

#### 비밀번호 정책 (SSS-97)

| 항목 | 요구사항 |
|------|---------|
| 최소 길이 | 20자 이상 |
| 조합 | 3가지 이상 (대문자, 소문자, 숫자, 특수문자) |
| 변경 주기 | 90일 권장 |

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 6.10 | 2026-08-16 | 신규 서버 설치 이슈 반영: bootstrap-infra.sh 신설(오프라인 인프라 자동 구성), Node 번들 스테이징/검증(오패키징 방지), 시드 멱등화(--on-conflict-do-nothing)+적재 검증+admin 기본 비밀번호 보장, SELinux 자동 대응(httpd_can_network_connect, ss-console journal), PGDG psql 심링크, pg_hba를 SHOW hba_file로 탐지, error-pages 패키징/배포, ss-snmp-trap 유닛 설치/기동 추가(송신 전용 — 162 미점유) |
| 6.9 | 2026-08-16 | 라이선스 설치 절차 추가 (3.4절): license.json 배치/재로드/상태 확인, 라이선스 상태별 로그인 동작, 설치 확인에 라이선스 점검(6.4절) 추가 |
| 6.8 | 2026-02-21 | 콘솔 경로 수정: `/opt/seekurity-siem/bin/ss-console` → `/opt/seekurity-siem/console`, DB 스키마 로딩 오류 처리 개선 (ON_ERROR_STOP=0), 재설치 시 기존 객체 스킵 |
| 6.7 | 2026-02-19 | 로그 로테이션 및 디스크 관리 섹션 추가: ss-syslog-receiver 로그 무한 증가 문제 해결, systemd StandardOutput=null 설정, logback 롤링 설정 설명, 디스크 긴급 복구 절차 |
| 6.6 | 2026-02-18 | 폐쇄망 트러블슈팅 보강: 모든 SIEM 설정 파일 비밀번호 동기화, 로그인 실패(404/400) 해결, SSS-88 loginId 필드 설명 |
| 6.5 | 2026-02-18 | 폐쇄망(Private Network) 환경 설정 섹션 추가: 비표준 포트 설정, 서비스 의존성/시작 순서, ZooKeeper/Kafka/DB 연결 트러블슈팅, spring.config.location vs additional-location 설명 |
| 6.4 | 2026-02-17 | PDF 리포트 한글 폰트 요구사항 추가 (fonts-nanum, noto-cjk), 리포트 디렉토리 구조 문서화 |
| 6.3 | 2026-02-12 | SSS-97: engineer 계정 추가 (sudo 권한), seekurity/postgres nologin 설정, 시스템 계정 문서화 |
| 6.2 | 2026-02-12 | SSS-97: Linux 계정 보안 강화 (postgres nologin 설정), install.sh 자동화, 비밀번호 변경 절차 추가 |
| 6.1 | 2026-02-12 | SSS-96: get-secret 래퍼 스크립트 방식으로 변경 (EnvironmentFile 타이밍 이슈 해결), 보안 체크리스트 업데이트 |
| 6.0 | 2026-02-10 | 데이터베이스 스키마 v5.0 문서화 (템플릿/사용자 데이터 분리), API 엔드포인트 변경 반영 |
| 5.8 | 2026-02-09 | get-secret 바이너리 설치 가이드 추가 (보안 강화 섹션 11) |
| 5.7 | 2026-02-08 | 수동 설치 섹션 추가 (install.sh 실패 시 전체 수동 설치 절차) |
| 5.6 | 2026-02-08 | 오프라인(Air-Gapped) 환경 설치 안내 섹션 추가, 패키지 구성 상세 문서화 |
| 5.5 | 2026-02-08 | Spring Cloud Config 비활성화 설정 추가, 문제 해결 섹션 보강 |
| 5.4 | 2026-02-08 | Spring 프로파일 및 설정 파일 추가 (appliance 프로파일, 수집기 설정) |
| 5.3 | 2026-02-08 | ss-snmp-collector 자동시작으로 변경 |
| 5.2 | 2026-02-08 | ss-log-stream, ss-database-checker, ss-syslog-receiver 자동시작으로 변경 |
| 5.1 | 2026-02-08 | 설치 범위 명확화 (애플리케이션 전용), 사전 요구사항 검증 스크립트 추가 |
| 5.0 | 2026-02-08 | 오프라인 설치 가이드 전면 개정, 단일 파일로 간소화 |
| 4.0 | 2026-02-07 | 자격 증명 영숫자 전용으로 변경 |
| 3.x | 2026-02-05 | 스키마 및 설정 수정 |
