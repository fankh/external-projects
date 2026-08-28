# Filebeat 설정 파일 배포 안내

서버별로 파일이 다릅니다. **해당 서버의 파일을 사용해 주십시오.**

| 서버 | IP | 파일 |
|------|-----|------|
| WAS01 | 10.1.30.2 | `filebeat-WAS01-10.1.30.2.yml` |
| WAS02 | 10.1.30.3 | `filebeat-WAS02-10.1.30.3.yml` |
| WEB01 | 211.47.20.228 | `filebeat-WEB01-211.47.20.228.yml` |
| WEB02 | 211.47.20.229 | `filebeat-WEB02-211.47.20.229.yml` |
| Gateway | 211.47.20.230 | `filebeat-Gateway-211.47.20.230.yml` |

파일 안의 `deviceIp` 값이 서버마다 다릅니다. 다른 서버의 파일을 사용하면
로그가 엉뚱한 자산으로 분류되므로 반드시 확인해 주십시오.

WAS01 · WAS02 는 **이미 적용되어 정상 수집 중**입니다. 참고용으로만 첨부합니다.

---

## 적용 절차

### 1. 사전 확인

```bash
# 수집 서버 연결 — "OK" 가 나와야 합니다
timeout 5 bash -c 'exec 3<>/dev/tcp/10.1.30.4/5044' && echo OK || echo FAIL

# Filebeat 설치 여부
filebeat version
```

미설치라면 담당자에게 알려 주십시오. 설치 파일을 전달드리겠습니다.

### 2. 수집 대상 경로 확인

설정 파일의 `paths:` 에 적힌 경로가 실제로 존재하는지 확인해 주십시오.

```bash
ls -la /var/log/audit/audit.log
ls -la /var/log/aide/
ls -d /logs/*
```

**존재하지 않는 경로가 있으면 해당 줄을 지우거나, 실제 경로를 알려 주시면
반영해 드리겠습니다.** 경로가 틀리면 그 로그만 수집되지 않습니다.

WEB · Gateway 는 실제 로그 파일명을 확인하지 못해 일반적인 이름으로 작성했습니다.
아래 명령 결과를 보내 주시면 정확히 맞춰 드리겠습니다.

```bash
find /logs -type f \( -name '*.log' -o -name '*.out' -o -name '*.txt' \) \
     -mtime -7 -printf '%TY-%Tm-%Td %TH:%TM %10s %p\n' 2>/dev/null | sort -r | head -30
```

### 3. 적용

```bash
sudo cp -a /etc/filebeat/filebeat.yml \
           /etc/filebeat/filebeat.yml.bak-$(date +%Y%m%d-%H%M%S)

sudo cp filebeat-<서버>-<IP>.yml /etc/filebeat/filebeat.yml
sudo chown root:root /etc/filebeat/filebeat.yml
sudo chmod 600 /etc/filebeat/filebeat.yml
sudo mkdir -p /var/lib/filebeat/diskqueue /var/log/filebeat

sudo filebeat test config     # Config OK
sudo filebeat test output     # talk to server... OK

sudo systemctl enable --now filebeat
sudo systemctl status filebeat
```

### 4. 확인

```bash
# 오류가 없어야 합니다
sudo grep '"log.level":"error"' /var/log/filebeat/filebeat*.ndjson | tail -5

# 테스트 로그 발생
logger -p user.notice -t aig-siem-check "SIEM TEST $(date +%H%M%S)"
```

테스트 로그 발생 후 담당자에게 알려 주시면 도달 여부를 확인해 드립니다.
정상이라면 10초 이내에 확인됩니다.

---

## 수집 대상

고객사 표준 목록에 따라 아래를 수집합니다.

| 구분 | 경로 | 비고 |
|------|------|------|
| OS | `/var/log/messages`, `secure`, `cron` | 공통 |
| 감사 | `/var/log/audit/audit.log` | auditd |
| 무결성 | `/var/log/aide/*.log` | AIDE |
| WAS | `/logs/dars`, `/logs/tomcat`, `/logs/keypad` | WAS 전용 |
| WEB | `/logs/nginx` | WEB 전용 |
| Gateway | `/logs/gateway`, `/logs/gateway/YYYY-MM`, `/logs/tomcat` | Gateway 전용 |

회전된 과거 로그가 한꺼번에 올라오지 않도록, 일자·월별로 나뉘는 파일은
**최근 48시간 내 갱신분만** 수집하도록 설정했습니다.

---

## 주의사항

`generated_time_no_millis` 로 표시된 블록은 **수정하지 마십시오.**
시각 형식이 달라지면 로그가 저장되지 않습니다.

`deviceIp` 값도 임의로 바꾸지 마십시오. 서버를 식별하는 값입니다.

---

## 확인 요청 사항

아래 세 가지는 회신을 부탁드립니다.

1. **AIDE 실행 주기** — WAS01 은 8월 12일 이후, WAS02 는 로그가 없습니다.
   정기 점검이 설정되어 있는지 확인이 필요합니다.
2. **OS 버전** — 목록에는 `Rocky 8.*` 로 되어 있으나 실제 WAS 2대는
   `Rocky Linux 9.8` 입니다.
3. **WEB · Gateway 접속 계정** — 담당자 측에서 직접 적용하실지, 저희가 접속해
   적용할지 알려 주십시오.

---

## 문의

문제가 있으면 아래 정보와 함께 알려 주십시오.

- 서버 IP
- `sudo filebeat test output` 결과
- `sudo tail -20 /var/log/filebeat/filebeat*.ndjson` 결과
