-- AIG SIEM — WAS 애플리케이션 로그 파서 등록
--
-- 대상 Log Source : AIG_WAS01_Linux(10.1.30.2), AIG_WAS02_Linux(10.1.30.3)
-- 두 서버는 동일한 애플리케이션 스택이라 같은 파서를 씁니다.
--
-- 우선순위: 숫자가 작을수록 먼저 시도합니다.
--   0  Linux Syslog RFC3164        (기존, OS 로그)
--   1  Syslog RFC3164 (wire, PRI)  (기존)
--   2  Syslog RFC5424 (wire, PRI)  (기존)
--  11  Spring Boot            aig-was.log / aig-was.ERROR.log
--  12  Tomcat Catalina        catalina.out 의 Tomcat 자체 로그
--  13  Tomcat Access Log      localhost_access_log.*.txt
--  14  Transkey Keypad        catalina.out 의 [transkey] 라인
--  19  WAS Generic            위 어느 것에도 걸리지 않는 줄 (fallback)
--
-- 기존 syslog 계열 파서가 0~2 를 쓰고 있어, 동순위 충돌을 피하려고 11 부터 시작합니다.
--
-- time_format 은 반드시 빈 문자열로 둡니다. NULL 이면 API 응답에서 timeFormat 이
-- 누락되어 콘솔 파서 탭이 undefined.trim() 으로 죽습니다.

BEGIN;

-- 되돌릴 수 있도록 현재 상태를 보존합니다.
CREATE TABLE IF NOT EXISTS aig_parser_backup_20260827 AS
  SELECT *, now() AS backed_up_at FROM log_source_parsers WHERE false;
INSERT INTO aig_parser_backup_20260827
  SELECT p.*, now() FROM log_source_parsers p
  JOIN log_sources s ON s.uuid = p.log_source_id
  WHERE s.ip_address IN ('10.1.30.2', '10.1.30.3');

-- 재실행해도 중복되지 않도록 같은 event_type 의 기존 행을 먼저 지웁니다.
DELETE FROM log_source_parsers
 WHERE event_type IN ('was_spring_boot','was_tomcat','was_access','was_transkey','was_generic')
   AND log_source_id IN (SELECT uuid FROM log_sources WHERE ip_address IN ('10.1.30.2','10.1.30.3'));

INSERT INTO log_source_parsers
  (uuid, log_source_id, name, event_type, priority, regex, fields, time_format,
   description, is_deleted, is_disabled, created_by, created_time_at, updated_by, updated_time_at)
SELECT gen_random_uuid()::varchar, s.uuid, d.name, d.event_type, d.priority, d.regex, d.fields, '',
       d.description, false, false, 'aig-setup', now(), 'aig-setup', now()
FROM log_sources s
CROSS JOIN (VALUES
  ('Spring Boot Application',
   'was_spring_boot', 11,
   $rx$^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\w+)\s+(\d+)\s+---\s+(\S+?)\[(?:[^\]]*)\]\s+(\S+)\s+:\s*([\s\S]*)$$rx$,
   'logTime,severity,processId,processName,eventName,message',
   'Spring Boot 로그. eventName 은 Logger 클래스, message 는 스택트레이스를 포함합니다.'),

  ('Tomcat Catalina',
   'was_tomcat', 12,
   $rx$^(\d{1,2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\w+)\s+\[(?:[^\]]*)\]\s+(\S+)\s+([\s\S]*)$$rx$,
   'logTime,severity,eventName,message',
   'Tomcat 자체 로그(catalina.out). eventName 은 Logger 클래스입니다.'),

  ('Tomcat Access Log',
   'was_access', 13,
   $rx$^(\S+)\s+\S+\s+(\S+)\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)[^"]*"\s+([\s\S]*)$$rx$,
   'sourceIp,username,logTime,action,eventName,message',
   'Tomcat access log. action 은 HTTP Method, eventName 은 요청 URL, message 는 응답코드와 크기입니다.'),

  ('Transkey Keypad',
   'was_transkey', 14,
   $rx$^\[(transkey)\]\s+log\s*:\s*([\s\S]*)$$rx$,
   'processName,message',
   'Raon Transkey 보안키패드 로그(catalina.out 내 [transkey] 라인).'),

  ('WAS Generic',
   'was_generic', 19,
   $rx$^([\s\S]*)$$rx$,
   'message',
   '위 파서에 걸리지 않는 줄의 fallback. 원문을 message 로 보존합니다.')
) AS d(name, event_type, priority, regex, fields, description)
WHERE s.ip_address IN ('10.1.30.2', '10.1.30.3')
  AND NOT s.is_deleted;

COMMIT;

-- 결과 확인
SELECT s.ip_address, s.name AS log_source, p.priority, p.name, p.event_type
  FROM log_source_parsers p
  JOIN log_sources s ON s.uuid = p.log_source_id
 WHERE s.ip_address IN ('10.1.30.2','10.1.30.3') AND NOT p.is_deleted
 ORDER BY s.ip_address, p.priority;
