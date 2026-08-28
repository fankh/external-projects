# WAS 애플리케이션 로그 파서

## 배경

WAS 서버의 Filebeat 를 구성하면서 OS 로그 외에 애플리케이션 로그도 수집되기
시작했습니다. OS 로그는 기존 `Linux Syslog RFC3164` 파서가 처리하지만 애플리케이션
로그는 대응 파서가 없어 `eventType` 이 비어 있었습니다. 원문(`rawData`)은 남지만
탐지룰이나 대시보드에서 필드로 활용할 수 없는 상태였습니다.

## 등록한 파서

대상 Log Source 는 `AIG_WAS01_Linux`(10.1.30.2), `AIG_WAS02_Linux`(10.1.30.3)
두 곳입니다. 동일한 애플리케이션 스택이므로 같은 파서를 적용했습니다.

| 우선순위 | 이름 | event_type | 대상 |
|---|---|---|---|
| 0 | Linux Syslog RFC3164 | `linux_syslog` | 기존. `/var/log/*` |
| 1 | Syslog RFC3164 (wire, PRI) | `syslog_rfc3164` | 기존 |
| 2 | Syslog RFC5424 (wire, PRI) | `syslog_rfc5424` | 기존 |
| 11 | Spring Boot Application | `was_spring_boot` | `aig-was.log`, `aig-was.ERROR.log` |
| 12 | Tomcat Catalina | `was_tomcat` | `catalina.out` 의 Tomcat 자체 로그 |
| 13 | Tomcat Access Log | `was_access` | `localhost_access_log.*.txt` |
| 14 | Transkey Keypad | `was_transkey` | `catalina.out` 의 `[transkey]` 라인 |
| 19 | WAS Generic | `was_generic` | 위 어디에도 걸리지 않는 줄 |

숫자가 작을수록 먼저 시도합니다. 기존 syslog 계열이 0~2 를 쓰고 있어 **동순위 충돌을
피하려고 11 부터** 시작했습니다. 처음에 1~4 로 넣었더니 `Syslog RFC3164 (wire, PRI)`
와 순위가 겹쳐서 조정했습니다.

## 필드 매핑

제품 표준 필드명만 사용했고 새 필드명을 만들지 않았습니다.

**Spring Boot** — `logTime, severity, processId, processName, eventName, message`

```
2026-08-25 08:49:58.577 ERROR 533491 --- aig-dcc-api[main] o.s.boot.SpringApplication : Application run failed
└─ logTime            └ severity └ processId  └ processName  └ eventName      └ message
```

`eventName` 에 Logger 클래스를 넣었습니다. 스레드명(`[main]`)은 비캡처 그룹으로
건너뜁니다. `message` 는 `[\s\S]*` 라서 여러 줄 스택트레이스를 통째로 담습니다.

**Tomcat Catalina** — `logTime, severity, eventName, message`

**Tomcat Access Log** — `sourceIp, username, logTime, action, eventName, message`

```
127.0.0.1 - - [27/Aug/2026:15:48:31 +0900] "GET /aig-siem-parser-test HTTP/1.1" 404 772
└ sourceIp   └ username └ logTime                └ action └ eventName          └ message
```

`action` 은 HTTP Method, `eventName` 은 요청 URL, `message` 는 응답코드와 크기입니다.
**응답코드 전용 표준 필드가 확인되지 않아** `message` 에 함께 넣었습니다. 벤더가
HTTP status 용 필드명을 제공하면 그쪽으로 옮기는 것이 맞습니다.

**Transkey Keypad** — `processName, message`

**WAS Generic** — `message` (원문 전체)

## 검증

정규식은 실제 로그에서 뽑은 샘플로 먼저 검증했습니다. OS syslog 줄이 앱 파서에
가로채이지 않는지도 함께 확인했습니다(우선순위 0 의 syslog 파서가 그대로 처리).

실환경 검증은 Tomcat 에 실제 HTTP 요청을 보내 발생시킨 로그로 했습니다.

| 파서 | 상태 |
|---|---|
| `was_access` | **실환경 검증 완료** — 4건 색인, 전 필드 정상 |
| `was_transkey` | **실환경 검증 완료** — 4건 색인 |
| `was_spring_boot` | 샘플 검증만 완료. 앱이 기동 시에만 로깅해 신규 이벤트 미발생 |
| `was_tomcat` | 샘플 검증만 완료. 동일 |

`was_access` 색인 결과입니다.

```json
{ "eventType": "was_access", "sourceIp": "127.0.0.1", "username": "-",
  "logTime": "27/Aug/2026:15:48:31 +0900", "action": "GET",
  "eventName": "/aig-siem-parser-test", "message": "404 772" }
```

## 기존 미파싱 로그 복구 — 불가 (제품 결함)

파서 등록 **이전에** 색인된 9,155건은 `eventType` 이 비어 있습니다. 제품에 재파싱
기능(`POST /api/infra/collector/reparse`)이 있어 이를 쓰려 했으나 **500 으로
실패합니다.**

```
ERROR o.h.e.j.s.SqlExceptionHelper - ERROR: column reparsejob0_.log_source_id does not exist
  at com.seekers.siem.api.service.infra.ReparseServiceImpl.startReparseJob(ReparseServiceImpl.java:76)
  at com.seekers.siem.api.controller.infra.InfraCollectorController.startReparseJob(...:240)
```

`ReparseJob` 엔티티는 `log_source_id` 컬럼을 매핑하는데, 마이그레이션
`V10__create_reparse_jobs_table.sql` 이 만든 실제 테이블에는 `collector_id` 로 되어
있습니다. **엔티티와 스키마가 어긋나 재파싱 기능 전체가 사용 불가**입니다.

미리보기(`/reparse/preview`)는 OpenSearch 만 조회하므로 정상 동작하며, 대상 건수를
9,155건으로 정확히 보고합니다. 실행 단계에서만 실패합니다.

이는 소스·마이그레이션 수정이 필요한 사안이라 현장에서 컬럼명을 바꾸지 않았습니다.
다음 배포에서 어긋남을 해소해야 합니다.

부수적으로, `endDate` 에 `2026-08-28T00:00:00` 을 주면
`WARN ReparseServiceImpl - 날짜 파싱 실패` 가 남습니다. 허용 포맷이 문서화되어 있지
않습니다.

## 남은 사항

- 기존 미파싱 9,155건은 재파싱 기능이 고쳐진 뒤에 복구해야 합니다.
- `was_spring_boot` / `was_tomcat` 은 애플리케이션이 재기동되거나 오류를 낼 때
  자연스럽게 검증됩니다. 검증 목적으로 고객 서비스를 재기동하지 않았습니다.
- WAS01(10.1.30.2)은 파서만 미리 등록해 둔 상태입니다. Filebeat 를 구성하면 바로
  적용됩니다.

## 파일

`was-app-parsers.sql` — 등록 SQL. 재실행 가능하며 `aig_parser_backup_20260827` 에
기존 상태를 보존합니다.
