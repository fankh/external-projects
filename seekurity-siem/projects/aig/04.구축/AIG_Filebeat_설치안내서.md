# AIG SIEM 로그 수집(Filebeat) 설치 안내서

| 항목 | 내용 |
|------|------|
| 문서 목적 | 서버 로그를 SIEM 으로 전송하기 위한 Filebeat 설치·설정 안내 |
| 대상 | WAS / WEB / Gateway 서버 담당자 |
| 작성일 | 2026-08-27 |
| SIEM 서버 | 10.1.30.4 |

---

## 1. 수집 구조

서버의 Filebeat 가 SIEM 서버의 Filebeat 로 로그를 보내고, SIEM 이 이를 받아
분석 엔진에 전달합니다. 서버에서 SIEM 으로 나가는 방향의 **TCP 5044** 한 포트만
사용합니다.

```
[서버] 로그 파일
   │
   │  Filebeat  ──  TCP 5044  ──▶  [SIEM 10.1.30.4]  ──▶  분석·저장
   │
   └─ /var/log/messages, secure, cron  (OS 로그)
      /logs/... 애플리케이션 로그
```

서버에서 SIEM 으로의 단방향 전송이며, SIEM 이 서버로 접속하지 않습니다.

---

## 2. 사전 확인 사항

설치 전에 아래 두 가지를 확인해 주십시오.

### 2.1 방화벽

서버 → `10.1.30.4:5044/TCP` 아웃바운드가 허용되어야 합니다.

```bash
# 서버에서 실행. "연결 가능" 이 나와야 합니다.
timeout 5 bash -c 'exec 3<>/dev/tcp/10.1.30.4/5044' && echo "연결 가능" || echo "연결 불가"
```

### 2.2 수집 대상 로그 경로

서버마다 애플리케이션 로그 위치가 다릅니다. 아래 명령으로 실제 경로를 확인해
주시고, 결과를 알려주시면 설정에 반영하겠습니다.

```bash
ls -d /logs/* 2>/dev/null
find /logs -type f \( -name '*.log' -o -name '*.out' \) -mtime -7 \
     -printf '%TY-%Tm-%Td %TH:%TM  %10s  %p\n' 2>/dev/null | sort -r | head -20
```

---

## 3. 서버별 정보

설정 파일의 `deviceIp` 값은 **서버마다 다릅니다.** 아래 표의 값을 정확히
넣어야 SIEM 이 로그를 올바른 자산으로 인식합니다.

| 서버 | IP (deviceIp) | 상태 |
|------|---------------|------|
| WAS01 | 10.1.30.2 | 설치 완료 |
| WAS02 | 10.1.30.3 | 설치 완료 |
| WEB01 | 211.47.20.228 | **설치 예정** |
| WEB02 | 211.47.20.229 | **설치 예정** |
| Gateway | 211.47.20.230 | **설치 예정** |

---

## 4. 설치

### 4.1 Filebeat 설치 여부 확인

이미 설치되어 있는 서버가 있습니다. 먼저 확인해 주십시오.

```bash
filebeat version
```

설치되어 있지 않다면 아래 중 한 가지 방법으로 설치합니다.

```bash
# (a) 인터넷 연결이 가능한 경우
sudo rpm --import https://artifacts.elastic.co/GPG-KEY-elasticsearch
sudo tee /etc/yum.repos.d/elastic-8.x.repo > /dev/null <<'REPO'
[elastic-8.x]
name=Elastic repository for 8.x packages
baseurl=https://artifacts.elastic.co/packages/8.x/yum
gpgcheck=1
gpgkey=https://artifacts.elastic.co/GPG-KEY-elasticsearch
enabled=1
type=rpm-md
REPO
sudo yum install -y filebeat

# (b) 폐쇄망인 경우 — RPM 파일을 전달받아 설치
sudo rpm -Uvh filebeat-8.14.3-x86_64.rpm
```

### 4.2 기존 설정 백업

```bash
sudo cp -a /etc/filebeat/filebeat.yml \
           /etc/filebeat/filebeat.yml.bak-$(date +%Y%m%d-%H%M%S)
```

---

## 5. 설정 파일

`/etc/filebeat/filebeat.yml` 을 아래 내용으로 교체합니다.

**반드시 두 곳을 확인하십시오.**

1. `__SERVER_IP__` → 3장 표의 해당 서버 IP 로 치환
2. `paths:` → 해당 서버에 실제로 존재하는 경로만 남기고 나머지 줄 삭제

```yaml
filebeat.inputs:
  # ── OS 로그 ────────────────────────────────────────────────
  - type: filestream
    id: aig-os-syslog
    enabled: true
    paths:
      - /var/log/messages
      - /var/log/secure
      - /var/log/cron
    fields_under_root: true
    fields:
      logKind: os

  # ── 애플리케이션 로그 ──────────────────────────────────────
  # 타임스탬프로 시작하지 않는 줄은 스택트레이스로 보고 앞 이벤트에 이어 붙입니다.
  - type: filestream
    id: aig-app-log
    enabled: true
    paths:
      - /logs/dars/aig-was.log
      - /logs/dars/aig-was.ERROR.log
    fields_under_root: true
    fields:
      logKind: app
    parsers:
      - multiline:
          type: pattern
          pattern: '^\d{4}-\d{2}-\d{2}'
          negate: true
          match: after
          max_lines: 300
          timeout: 5s

  # ── 웹 서버 로그 (WEB 서버만 해당) ─────────────────────────
  - type: filestream
    id: aig-web-log
    enabled: true
    paths:
      - /logs/nginx/access.log
      - /logs/nginx/error.log
    ignore_older: 48h
    fields_under_root: true
    fields:
      logKind: access

processors:
  # SIEM 이 이 값으로 자산을 식별합니다. 서버 IP 와 정확히 일치해야 합니다.
  - add_fields:
      target: ""
      fields:
        deviceIp: "__SERVER_IP__"
        protocol: "syslog"

  - copy_fields:
      fields:
        - from: "message"
          to: "rawData"
      fail_on_error: false
      ignore_missing: true

  # 발생 시각은 반드시 초 단위 UTC 여야 합니다.
  # 밀리초가 포함되면 SIEM 이 로그를 저장하지 못합니다. 이 블록은 수정하지 마십시오.
  - script:
      lang: javascript
      id: generated_time_no_millis
      source: >
        function process(event) {
            var iso = norm(event.Get("@timestamp"));
            if (iso) { event.Put("generatedTime", iso); }
        }
        function norm(d) {
            if (!d) { return null; }
            if (typeof d.toISOString === "function") {
                return d.toISOString().replace(/\.\d+Z$/, "Z");
            }
            var s = String(d);
            var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*([+-])(\d{2}):?(\d{2})/);
            if (m) {
                var base = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
                var sign = (m[7] === "-") ? 1 : -1;
                var off = (+m[8]) * 3600000 + (+m[9]) * 60000;
                return new Date(base + sign * off).toISOString().replace(/\.\d+Z$/, "Z");
            }
            var z = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?Z/);
            return z ? (z[1] + "T" + z[2] + "Z") : null;
        }

  - drop_fields:
      fields: ["agent", "ecs", "host", "input", "log"]
      ignore_missing: true

# SIEM 수신 주소입니다. 항목 이름은 logstash 이지만 Logstash 를 쓰지 않습니다.
output.logstash:
  hosts: ["10.1.30.4:5044"]
  loadbalance: false
  worker: 1
  backoff.init: 1s
  backoff.max: 60s

# SIEM 점검 등으로 일시적으로 전송이 끊겨도 로그를 보관했다가 재전송합니다.
queue.disk:
  max_size: 1GB
  path: /var/lib/filebeat/diskqueue

logging.level: info
logging.to_files: true
logging.files:
  path: /var/log/filebeat
  name: filebeat
  keepfiles: 7
```

---

## 6. 적용 및 기동

```bash
sudo mkdir -p /var/lib/filebeat/diskqueue /var/log/filebeat
sudo chmod 600 /etc/filebeat/filebeat.yml

# 문법 검사
sudo filebeat test config

# SIEM 연결 검사 — "talk to server... OK" 가 나와야 합니다
sudo filebeat test output

# 기동
sudo systemctl enable --now filebeat
sudo systemctl status filebeat
```

---

## 7. 정상 동작 확인

### 7.1 서버 측

```bash
# 오류가 없어야 합니다
sudo grep '"log.level":"error"' /var/log/filebeat/filebeat*.ndjson | tail -5

# 다음 두 줄이 보이면 연결 성공입니다
sudo grep -o '"message":"[^"]*"' /var/log/filebeat/filebeat*.ndjson \
     | grep -i 'connection to' | tail -2
```

### 7.2 도달 확인 (테스트 로그 발생)

```bash
logger -p user.notice -t aig-siem-check "SIEM TEST $(date +%H%M%S)"
```

위 명령 실행 후 SIEM 담당자에게 알려주시면 도달 여부를 확인해 드립니다.
정상이라면 **10초 이내**에 SIEM 에 표시됩니다.

---

## 8. 자주 발생하는 문제

| 증상 | 원인 | 조치 |
|------|------|------|
| `filebeat test output` 실패 | 5044 방화벽 미허용 | 2.1 의 연결 확인 후 방화벽 정책 요청 |
| 기동은 되나 SIEM 에 안 보임 | `deviceIp` 오기입 | 3장 표의 IP 와 정확히 일치하는지 확인 |
| 특정 로그만 안 들어옴 | `paths` 경로 불일치 | `ls -la <경로>` 로 파일 존재 확인 |
| 로그가 뒤늦게 몰려서 들어옴 | 전송 중단 후 재개 | 정상 동작입니다. 디스크 큐에 보관했다가 재전송합니다 |

`filebeat test config` 는 문법만 검사하고 설정 내용의 오류까지는 잡지 못합니다.
반드시 **7장의 도달 확인**까지 진행해 주십시오.

---

## 9. 보안 관련 협의 사항

WEB01 · WEB02 · Gateway 는 공인 IP 대역(211.47.20.x)에 있어, 현재 방식으로는
로그가 **암호화되지 않은 상태**로 전송됩니다. 아래 두 가지를 함께 적용할 것을
권고드리며, 적용 여부를 회신해 주시면 설정에 반영하겠습니다.

1. **전송 구간 TLS 적용** — 인증서를 발급해 서버·SIEM 양쪽에 배포
2. **SIEM 5044 접근 제한** — 아래 5개 서버에서만 접속 가능하도록 제한

```
10.1.30.2, 10.1.30.3, 211.47.20.228, 211.47.20.229, 211.47.20.230
```

---

## 10. 문의

설치 중 문제가 있거나 로그 경로 확인이 필요하시면 SIEM 구축 담당자에게
아래 정보와 함께 문의해 주십시오.

- 서버 IP
- `sudo filebeat test output` 실행 결과
- `sudo tail -20 /var/log/filebeat/filebeat*.ndjson` 결과
