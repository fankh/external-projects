-- FIX-004 + FIX-005 : FortiGate 파서 필드명 표준화 및 추출 범위 확대
--
-- 대상 : 10.1.30.4 (AIG SIEM), DB siem, port 15432
-- 실행 : sudo -u postgres psql -P pager=off -p 15432 -d siem -f fix-004-005-parser.sql
-- 이후 : sudo systemctl restart ss-log-stream
--
-- 배경
--   FIX-004  파서가 srcIp/dstIp/srcPort/dstPort 로 넣는데 콘솔은
--            sourceIp/destinationIp/sourcePort/destinationPort 를 읽어 화면이 '-' 로 표시됨
--   FIX-005  ICMP 로그는 srcport 가 없어(identifier=) traffic 정규식에 매칭되지 않아
--            출발지·목적지가 통째로 누락됨 (08-24 기준 529건)
--            proto= 는 42,366건에 있으나 한 번도 추출하지 않음
--
-- 설계 판단
--   정규식에서 포트를 선택 그룹 (?:...)? 으로 만드는 대신 파서를 두 개로 나눴다.
--   빈 캡처 그룹을 이 제품이 어떻게 처리하는지 확인되지 않았고,
--   우선순위로 분기하면 동작이 명확하기 때문이다.
--     priority 0 : 포트가 있는 TCP/UDP 트래픽
--     priority 1 : 포트가 없는 ICMP 등
--     priority 5 : 기존 generic fallback (그대로 둠)

BEGIN;

-- 되돌릴 수 있도록 변경 전 상태를 보존한다
CREATE TABLE IF NOT EXISTS aig_parser_backup AS
  SELECT *, now() AS backed_up_at FROM log_source_parsers WHERE false;
INSERT INTO aig_parser_backup
  SELECT *, now() FROM log_source_parsers
   WHERE name IN ('FortiGate KV (traffic)', 'FortiGate KV (generic)') AND NOT is_deleted;

-- 1) TCP/UDP 트래픽 : 필드명 표준화 + protocol 추가
UPDATE log_source_parsers
   SET regex = '^<(\d{1,3})>date=(\S+)\s+time=(\S+)\s+devname="([^"]*)"\s+devid="([^"]*)".*?\btype="([^"]*)".*?\blevel="([^"]*)".*?\bsrcip=(\S+)\s+srcport=(\d+).*?\bdstip=(\S+)\s+dstport=(\d+).*?\bproto=(\d+).*?\baction="([^"]*)".*$',
       fields = 'priority,logDate,logTime,deviceName,deviceId,eventName,severity,sourceIp,sourcePort,destinationIp,destinationPort,protocol,action',
       priority = 0,
       updated_by = 'aig-fix-004-005',
       updated_time_at = now()
 WHERE name = 'FortiGate KV (traffic)' AND NOT is_deleted;

-- 2) 포트가 없는 트래픽(ICMP 등) : 신규 파서
INSERT INTO log_source_parsers
  (uuid, log_source_id, name, description, event_type, regex, fields, time_format,
   priority, is_disabled, is_deleted, created_by, created_time_at, updated_time_at)
SELECT gen_random_uuid()::text, s.uuid,
       'FortiGate KV (no-port)',
       'ICMP 등 포트가 없는 트래픽 로그 (srcport 대신 identifier)',
       'fortigate_traffic',
       '^<(\d{1,3})>date=(\S+)\s+time=(\S+)\s+devname="([^"]*)"\s+devid="([^"]*)".*?\btype="([^"]*)".*?\blevel="([^"]*)".*?\bsrcip=(\S+)\s+.*?\bdstip=(\S+)\s+.*?\bproto=(\d+).*?\baction="([^"]*)".*$',
       'priority,logDate,logTime,deviceName,deviceId,eventName,severity,sourceIp,destinationIp,protocol,action',
       '',
       1, false, false, 'aig-fix-004-005', now(), now()
  FROM log_sources s
 WHERE s.ip_address = '10.1.1.1' AND NOT s.is_deleted
   AND NOT EXISTS (SELECT 1 FROM log_source_parsers p
                    WHERE p.log_source_id = s.uuid
                      AND p.name = 'FortiGate KV (no-port)' AND NOT p.is_deleted);

-- 3) generic fallback 은 우선순위만 뒤로 밀어 확실히 마지막에 걸리게 한다
UPDATE log_source_parsers
   SET priority = 5, updated_by = 'aig-fix-004-005', updated_time_at = now()
 WHERE name = 'FortiGate KV (generic)' AND NOT is_deleted;

COMMIT;

-- 확인
SELECT name, priority, left(fields, 70) AS fields
  FROM log_source_parsers
 WHERE name LIKE 'FortiGate%' AND NOT is_deleted
 ORDER BY priority;

-- ----------------------------------------------------------------------------
-- 적용 후 검증 (재기동 뒤 2~3분 경과 후)
--
--   systemctl restart ss-log-stream
--
--   IDX=siem-logs-$(date +%Y-%m-%d)
--   # 표준 필드가 채워지는지
--   curl -s "http://localhost:19200/$IDX/_count" -H 'Content-Type: application/json' \
--     -d '{"query":{"exists":{"field":"destinationPort"}}}'
--   curl -s "http://localhost:19200/$IDX/_count" -H 'Content-Type: application/json' \
--     -d '{"query":{"exists":{"field":"protocol"}}}'
--   # ICMP 누락이 줄었는지 (기존 529건)
--   curl -s "http://localhost:19200/$IDX/_count" -H 'Content-Type: application/json' \
--     -d '{"query":{"bool":{"must":[{"wildcard":{"rawData":"*srcip=*"}}],
--                          "must_not":[{"exists":{"field":"sourceIp"}}]}}}'
--   # 색인 실패가 없는지
--   tail -200 /opt/seekurity-siem/logs/ss-log-stream/ss-log-stream.log | grep -c BulkProcessor
--
-- 콘솔에서 로그 상세를 열어 Source Port / Destination Port / Protocol 이 값으로 뜨는지 확인한다.
--
-- ----------------------------------------------------------------------------
-- 주의
--   1) sourceIp 는 제품이 이미 '송신 장비 IP' 로 채우고 있다. 이 변경으로
--      트래픽 출발지가 덮어써진다. 방화벽 로그에서는 후자가 타당하나,
--      장비 IP 를 전제하는 화면이 있는지 적용 후 확인이 필요하다.
--   2) 기존 색인 문서의 필드명은 바뀌지 않는다. 변경 시점 전후로 이름이 갈리므로
--      과거 데이터를 함께 조회할 때는 srcIp/sourceIp 를 모두 질의해야 한다.
--   3) service= 와 user= (각 42,367건 / 7,019건) 는 이번 범위에 넣지 않았다.
--      service 는 action 뒤, user 는 로그 종류에 따라 위치가 달라 별도 검증이 필요하다.
--      user= 는 계정 기반 탐지에 필요하므로 후속으로 반영할 것을 권고한다.
--
-- 롤백
--   DELETE FROM log_source_parsers WHERE created_by = 'aig-fix-004-005';
--   UPDATE log_source_parsers p SET regex = b.regex, fields = b.fields, priority = b.priority
--     FROM aig_parser_backup b WHERE p.uuid = b.uuid;
