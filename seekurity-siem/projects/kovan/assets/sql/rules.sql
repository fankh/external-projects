-- 019_firewall_vpn_security_rules.sql
-- 방화벽/VPN/보안 탐지 룰 50개 + 조건 삽입
-- 고객사 SIEM 서버용 초기 룰 세트

\set ON_ERROR_STOP on

-- ============================================================
-- 방화벽 룰 (9개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-fw-block-repeat', '방화벽 차단 반복 탐지', '동일 출발지 IP에서 단시간 내 다수의 방화벽 차단 이벤트 발생. 포트 스캔 또는 무차별 대입 공격 시도 가능성.', '무차별 대입 공격', 'HIGH', '1', 'security', true, 'sourceIp', 50, 'minute', 10, false, false, 'system'),
('rule-fw-policy-change', '방화벽 정책 변경 탐지', '방화벽 정책이 추가, 수정 또는 삭제된 이벤트 탐지. 비인가 정책 변경 여부 확인 필요.', '정책 변경', 'CRITICAL', '2', 'security', true, 'deviceIp', 1, 'minute', 1, false, false, 'system'),
('rule-fw-allow-unusual-port', '방화벽 허용 이상 포트 접근', '방화벽에서 허용된 트래픽 중 비표준 고위험 포트(4444, 5555 등)로의 접근 탐지.', '비인가 접근', 'MEDIUM', '3', 'security', true, 'sourceIp', 5, 'minute', 10, false, false, 'system'),
('rule-fw-ext-ssh', '외부 SSH 접근 시도', '외부 IP에서 내부 서버로의 SSH(22번 포트) 접근 차단 탐지. 비인가 원격 접속 시도 가능성.', '비인가 접근', 'HIGH', '1', 'security', true, 'sourceIp', 10, 'minute', 5, false, false, 'system'),
('rule-fw-admin-login-fail', '방화벽 관리자 로그인 실패', '방화벽 관리 콘솔에 대한 로그인 실패가 반복 발생. 관리자 계정 탈취 시도 가능성.', '계정 탈취', 'CRITICAL', '2', 'security', true, 'sourceIp', 5, 'minute', 10, false, false, 'system'),
('rule-fw-data-exfil', '대량 아웃바운드 트래픽 탐지', '내부에서 외부로 대량의 트래픽이 방화벽을 통과. 데이터 유출 또는 C2 통신 가능성.', '데이터 유출', 'HIGH', '5', 'security', true, 'sourceIp', 100, 'minute', 10, false, false, 'system'),
('rule-fw-ha-failover', '방화벽 HA 장애 탐지', '방화벽 고가용성(HA) 페일오버 이벤트 탐지. 장비 장애 또는 네트워크 불안정 가능성.', '시스템 장애', 'CRITICAL', '5', 'security', true, 'deviceIp', 1, 'minute', 1, false, false, 'system'),
('rule-fw-interface-down', '방화벽 인터페이스 다운', '방화벽 네트워크 인터페이스 다운 이벤트 탐지. 물리적 장애 또는 케이블 문제 확인 필요.', '시스템 장애', 'CRITICAL', '5', 'security', true, 'deviceIp', 1, 'minute', 1, false, false, 'system'),
('rule-fw-ddos-detect', '방화벽 DDoS 탐지', '방화벽에서 DDoS 또는 대량 세션 생성 이벤트 탐지. 서비스 거부 공격 대응 필요.', 'DDoS 공격', 'CRITICAL', '1', 'security', true, 'sourceIp', 200, 'minute', 5, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 방화벽 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-fw-block-repeat-1', 'rule-fw-block-repeat', 'deviceAction', 'deny', 'INCLUDE', false, false, false, 'system'),
('rc-fw-policy-change-1', 'rule-fw-policy-change', 'message', 'policy changed', 'INCLUDE', false, false, false, 'system'),
('rc-fw-allow-unusual-1', 'rule-fw-allow-unusual-port', 'deviceAction', 'allow', 'INCLUDE', false, false, false, 'system'),
('rc-fw-allow-unusual-2', 'rule-fw-allow-unusual-port', 'destinationPort', '4444', 'EQUAL', false, false, false, 'system'),
('rc-fw-ext-ssh-1', 'rule-fw-ext-ssh', 'destinationPort', '22', 'EQUAL', false, false, false, 'system'),
('rc-fw-ext-ssh-2', 'rule-fw-ext-ssh', 'deviceAction', 'deny', 'INCLUDE', false, false, false, 'system'),
('rc-fw-admin-login-1', 'rule-fw-admin-login-fail', 'message', 'login failed', 'INCLUDE', false, false, false, 'system'),
('rc-fw-admin-login-2', 'rule-fw-admin-login-fail', 'deviceAction', 'login', 'INCLUDE', false, false, false, 'system'),
('rc-fw-data-exfil-1', 'rule-fw-data-exfil', 'deviceAction', 'allow', 'INCLUDE', false, false, false, 'system'),
('rc-fw-ha-failover-1', 'rule-fw-ha-failover', 'message', 'failover', 'INCLUDE', false, false, false, 'system'),
('rc-fw-interface-down-1', 'rule-fw-interface-down', 'message', 'interface down', 'INCLUDE', false, false, false, 'system'),
('rc-fw-ddos-detect-1', 'rule-fw-ddos-detect', 'deviceAction', 'deny', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- VPN 룰 (6개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-vpn-login-fail', 'VPN 로그인 실패 반복', '동일 계정 또는 IP에서 VPN 로그인 실패가 반복 발생. 계정 탈취 또는 무차별 대입 공격 시도.', '계정 탈취', 'HIGH', '1', 'security', true, 'sourceIp', 10, 'minute', 10, false, false, 'system'),
('rule-vpn-offhour-login', '비업무 시간 VPN 접속', '심야 시간대(22:00~06:00) 또는 주말에 VPN 접속 성공 탐지. 비인가 접속 또는 내부자 위협 가능성.', '비인가 접근', 'MEDIUM', '2', 'security', true, 'username', 1, 'minute', 1, false, false, 'system'),
('rule-vpn-multi-session', 'VPN 동시 다중 세션', '동일 사용자 계정으로 서로 다른 IP에서 동시에 VPN 세션이 연결됨. 계정 공유 또는 자격증명 유출 의심.', '계정 탈취', 'CRITICAL', '2', 'security', true, 'username', 3, 'minute', 5, false, false, 'system'),
('rule-vpn-tunnel-down', 'VPN 터널 비정상 종료 반복', 'VPN 터널이 짧은 시간 내 반복적으로 종료됨. 네트워크 불안정 또는 공격에 의한 터널 방해 가능성.', '서비스 장애', 'MEDIUM', '5', 'security', true, 'deviceIp', 5, 'minute', 10, false, false, 'system'),
('rule-vpn-internal-scan', 'VPN 접속 후 내부 스캐닝', 'VPN으로 접속한 IP에서 내부 네트워크 다수 호스트에 접근 시도. 내부 정찰 또는 측면 이동 가능성.', '내부 정찰', 'HIGH', '3', 'security', true, 'sourceIp', 30, 'minute', 5, false, false, 'system'),
('rule-vpn-foreign-ip', '해외 IP VPN 접속', '해외 IP 대역에서 VPN 접속 성공 탐지. 자격증명 유출에 의한 비인가 접속 가능성 점검 필요.', '비인가 접근', 'HIGH', '1', 'security', true, 'sourceIp', 1, 'minute', 1, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- VPN 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-vpn-login-fail-1', 'rule-vpn-login-fail', 'message', 'vpn login failed', 'INCLUDE', false, false, false, 'system'),
('rc-vpn-offhour-1', 'rule-vpn-offhour-login', 'message', 'vpn connected', 'INCLUDE', false, false, false, 'system'),
('rc-vpn-multi-session-1', 'rule-vpn-multi-session', 'message', 'vpn connected', 'INCLUDE', false, false, false, 'system'),
('rc-vpn-tunnel-down-1', 'rule-vpn-tunnel-down', 'message', 'tunnel down', 'INCLUDE', false, false, false, 'system'),
('rc-vpn-internal-scan-1', 'rule-vpn-internal-scan', 'deviceAction', 'deny', 'INCLUDE', false, false, false, 'system'),
('rc-vpn-foreign-ip-1', 'rule-vpn-foreign-ip', 'message', 'vpn connected', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 웹 공격 탐지 룰 (8개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-ids-sql-inject', 'SQL 인젝션 탐지', 'SQL 인젝션 공격 패턴이 포함된 요청 탐지. 웹 애플리케이션 취약점 악용 시도.', 'SQL 인젝션', 'CRITICAL', '1', 'security', true, 'sourceIp', 5, 'minute', 10, false, false, 'system'),
('rule-ids-xss-detect', 'XSS 공격 탐지', '크로스 사이트 스크립팅(XSS) 공격 패턴 탐지. 웹 애플리케이션 취약점 악용 시도.', 'XSS 공격', 'HIGH', '1', 'security', true, 'sourceIp', 3, 'minute', 10, false, false, 'system'),
('rule-ids-cmd-inject', '커맨드 인젝션 탐지', 'OS 명령어 인젝션 패턴 탐지. 원격 코드 실행 시도 가능성.', '커맨드 인젝션', 'CRITICAL', '1', 'security', true, 'sourceIp', 3, 'minute', 10, false, false, 'system'),
('rule-ids-dir-traversal', '디렉토리 트래버설 탐지', '경로 탐색 공격(../) 패턴 탐지. 비인가 파일 접근 시도.', '디렉토리 트래버설', 'HIGH', '3', 'security', true, 'sourceIp', 5, 'minute', 10, false, false, 'system'),
('rule-web-bruteforce', '웹 로그인 무차별 대입', '웹 서비스 로그인 페이지에 대한 반복 인증 실패 탐지.', '무차별 대입 공격', 'HIGH', '1', 'security', true, 'sourceIp', 20, 'minute', 5, false, false, 'system'),
('rule-web-scanner', '웹 스캐너 탐지', '자동화 웹 취약점 스캐너(Nikto, SQLMap 등) 사용 흔적 탐지.', '취약점 스캐닝', 'MEDIUM', '3', 'security', true, 'sourceIp', 50, 'minute', 5, false, false, 'system'),
('rule-web-403-flood', '403 응답 폭주', '동일 IP에서 단시간 내 다수의 403 Forbidden 응답 발생. 비인가 접근 시도.', '비인가 접근', 'MEDIUM', '3', 'security', true, 'sourceIp', 30, 'minute', 5, false, false, 'system'),
('rule-web-500-spike', '서버 오류 급증', '웹 서버 500 오류가 급증. 공격으로 인한 서비스 장애 또는 애플리케이션 결함.', '서비스 장애', 'HIGH', '5', 'security', true, 'deviceIp', 20, 'minute', 5, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 웹 공격 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-ids-sql-inject-1', 'rule-ids-sql-inject', 'message', 'select', 'INCLUDE', false, false, false, 'system'),
('rc-ids-sql-inject-2', 'rule-ids-sql-inject', 'message', 'union', 'INCLUDE', false, false, false, 'system'),
('rc-ids-xss-detect-1', 'rule-ids-xss-detect', 'message', 'script', 'INCLUDE', false, false, false, 'system'),
('rc-ids-cmd-inject-1', 'rule-ids-cmd-inject', 'message', 'cmd', 'INCLUDE', false, false, false, 'system'),
('rc-ids-dir-traversal-1', 'rule-ids-dir-traversal', 'message', '../', 'INCLUDE', false, false, false, 'system'),
('rc-web-bruteforce-1', 'rule-web-bruteforce', 'message', 'login failed', 'INCLUDE', false, false, false, 'system'),
('rc-web-bruteforce-2', 'rule-web-bruteforce', 'destinationPort', '443', 'EQUAL', false, false, false, 'system'),
('rc-web-scanner-1', 'rule-web-scanner', 'message', 'scanner', 'INCLUDE', false, false, false, 'system'),
('rc-web-403-flood-1', 'rule-web-403-flood', 'message', '403', 'INCLUDE', false, false, false, 'system'),
('rc-web-500-spike-1', 'rule-web-500-spike', 'message', '500', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 인증/계정 보안 룰 (4개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-auth-account-lockout', '계정 잠금 탐지', '계정 잠금 이벤트 탐지. 무차별 대입 공격 또는 계정 탈취 시도로 인한 잠금.', '계정 탈취', 'HIGH', '2', 'security', true, 'username', 3, 'minute', 10, false, false, 'system'),
('rule-auth-priv-escalation', '권한 상승 탐지', '일반 사용자가 관리자 권한을 획득하는 이벤트 탐지. 권한 상승 공격 가능성.', '권한 상승', 'CRITICAL', '2', 'security', true, 'username', 1, 'minute', 1, false, false, 'system'),
('rule-auth-multi-fail-user', '다수 계정 로그인 실패', '동일 IP에서 서로 다른 계정에 대한 로그인 실패. 크리덴셜 스터핑 공격 의심.', '크리덴셜 스터핑', 'HIGH', '1', 'security', true, 'username', 10, 'minute', 10, false, false, 'system'),
('rule-auth-admin-login', '관리자 계정 로그인', '관리자(root, admin) 계정으로 로그인 성공 탐지. 정상 접근인지 확인 필요.', '계정 모니터링', 'LOW', '2', 'security', true, 'username', 1, 'minute', 1, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 인증/계정 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-auth-lockout-1', 'rule-auth-account-lockout', 'message', 'account locked', 'INCLUDE', false, false, false, 'system'),
('rc-auth-priv-esc-1', 'rule-auth-priv-escalation', 'message', 'privilege', 'INCLUDE', false, false, false, 'system'),
('rc-auth-multi-fail-1', 'rule-auth-multi-fail-user', 'message', 'login failed', 'INCLUDE', false, false, false, 'system'),
('rc-auth-admin-login-1', 'rule-auth-admin-login', 'message', 'login success', 'INCLUDE', false, false, false, 'system'),
('rc-auth-admin-login-2', 'rule-auth-admin-login', 'username', 'admin', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 악성코드/C2 통신 룰 (3개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-malware-c2-comm', 'C2 통신 의심', '알려진 C2 서버 IP 또는 도메인과의 통신 탐지. 악성코드 감염 가능성.', 'C2 통신', 'CRITICAL', '4', 'security', true, 'destinationIp', 3, 'minute', 10, false, false, 'system'),
('rule-malware-dns-tunnel', 'DNS 터널링 의심', '비정상적으로 긴 DNS 쿼리 또는 다수의 DNS 요청 탐지. DNS 기반 데이터 유출 의심.', 'DNS 터널링', 'HIGH', '5', 'security', true, 'sourceIp', 100, 'minute', 5, false, false, 'system'),
('rule-malware-download', '악성 파일 다운로드 의심', '실행 파일 또는 스크립트 파일 다운로드 탐지. 악성코드 유포 가능성.', '악성코드 유포', 'HIGH', '4', 'security', true, 'sourceIp', 3, 'minute', 10, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 악성코드 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-malware-c2-1', 'rule-malware-c2-comm', 'message', 'callback', 'INCLUDE', false, false, false, 'system'),
('rc-malware-dns-1', 'rule-malware-dns-tunnel', 'destinationPort', '53', 'EQUAL', false, false, false, 'system'),
('rc-malware-download-1', 'rule-malware-download', 'message', 'download', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 네트워크 공격 탐지 룰 (6개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-net-port-scan', '포트 스캔 탐지', '동일 출발지에서 다수의 포트로 접속 시도 탐지. 네트워크 정찰 활동.', '포트 스캔', 'MEDIUM', '3', 'security', true, 'sourceIp', 50, 'minute', 5, false, false, 'system'),
('rule-net-arp-spoof', 'ARP 스푸핑 탐지', 'ARP 스푸핑 또는 ARP 캐시 포이즈닝 이벤트 탐지. 중간자 공격 가능성.', 'ARP 스푸핑', 'CRITICAL', '4', 'security', true, 'sourceIp', 5, 'minute', 5, false, false, 'system'),
('rule-net-icmp-flood', 'ICMP Flood 탐지', '대량의 ICMP 패킷 탐지. DDoS 또는 네트워크 장애 유발 시도.', 'ICMP Flood', 'MEDIUM', '1', 'security', true, 'sourceIp', 100, 'minute', 5, false, false, 'system'),
('rule-net-syn-flood', 'SYN Flood 탐지', '대량의 SYN 패킷 탐지. TCP SYN Flood 공격으로 서비스 거부 시도.', 'SYN Flood', 'HIGH', '1', 'security', true, 'sourceIp', 200, 'minute', 5, false, false, 'system'),
('rule-net-traffic-anomaly', '네트워크 트래픽 이상', '평소 대비 비정상적으로 높은 네트워크 트래픽 발생. DDoS 또는 데이터 유출 의심.', '트래픽 이상', 'HIGH', '5', 'network', true, 'source.ip', 500, 'minute', 10, false, false, 'system'),
('rule-net-flow-scan', '네트워크 플로우 스캔', '단일 출발지에서 다수의 목적지 IP로 트래픽 발생. 네트워크 정찰 활동.', '네트워크 스캔', 'MEDIUM', '3', 'network', true, 'source.ip', 50, 'minute', 5, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 네트워크 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-net-port-scan-1', 'rule-net-port-scan', 'deviceAction', 'deny', 'INCLUDE', false, false, false, 'system'),
('rc-net-arp-spoof-1', 'rule-net-arp-spoof', 'message', 'arp', 'INCLUDE', false, false, false, 'system'),
('rc-net-icmp-flood-1', 'rule-net-icmp-flood', 'message', 'icmp', 'INCLUDE', false, false, false, 'system'),
('rc-net-syn-flood-1', 'rule-net-syn-flood', 'message', 'syn flood', 'INCLUDE', false, false, false, 'system'),
('rc-net-traffic-anomaly-1', 'rule-net-traffic-anomaly', 'deviceAction', 'allow', 'INCLUDE', false, false, false, 'system'),
('rc-net-flow-scan-1', 'rule-net-flow-scan', 'deviceAction', 'allow', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 서버/시스템 모니터링 룰 (4개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-srv-service-stop', '주요 서비스 중지 탐지', '핵심 서비스(DB, 웹서버 등)의 비정상 중지 탐지. 공격 또는 장애 확인 필요.', '서비스 장애', 'CRITICAL', '5', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-srv-disk-full', '디스크 용량 부족 경고', '서버 디스크 사용률이 임계치 초과. 로그 폭주 또는 공격에 의한 용량 소진.', '시스템 장애', 'MEDIUM', '5', 'security', true, 'hostname', 3, 'hour', 1, false, false, 'system'),
('rule-srv-new-process', '비인가 프로세스 실행', '허용 목록에 없는 새로운 프로세스 실행 탐지. 악성코드 또는 백도어 가능성.', '악성 프로세스', 'HIGH', '4', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-srv-config-change', '시스템 설정 변경', '주요 시스템 설정 파일 변경 탐지. 비인가 변경 여부 확인 필요.', '설정 변경', 'MEDIUM', '4', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 서버/시스템 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-srv-service-stop-1', 'rule-srv-service-stop', 'message', 'service stopped', 'INCLUDE', false, false, false, 'system'),
('rc-srv-disk-full-1', 'rule-srv-disk-full', 'message', 'disk full', 'INCLUDE', false, false, false, 'system'),
('rc-srv-new-process-1', 'rule-srv-new-process', 'message', 'new process', 'INCLUDE', false, false, false, 'system'),
('rc-srv-config-change-1', 'rule-srv-config-change', 'message', 'config changed', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 데이터 유출 방지 룰 (2개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-data-large-download', '대용량 파일 다운로드', '내부 서버에서 비정상적으로 큰 파일 다운로드 탐지. 데이터 유출 가능성.', '데이터 유출', 'HIGH', '5', 'security', true, 'sourceIp', 5, 'minute', 10, false, false, 'system'),
('rule-data-usb-detect', 'USB 장치 연결 탐지', 'USB 저장장치 연결 이벤트 탐지. 비인가 매체를 통한 데이터 유출 가능성.', '매체 제어', 'MEDIUM', '5', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 데이터 유출 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-data-large-dl-1', 'rule-data-large-download', 'message', 'download', 'INCLUDE', false, false, false, 'system'),
('rc-data-usb-detect-1', 'rule-data-usb-detect', 'message', 'usb', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 내부자 위협 탐지 룰 (6개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-insider-mass-access', '대량 파일 접근', '단일 사용자가 단시간 내 다수의 파일 또는 디렉토리에 접근. 정보 수집 또는 데이터 유출 시도 의심.', '내부자 위협', 'HIGH', '5', 'security', true, 'username', 50, 'minute', 10, false, false, 'system'),
('rule-insider-after-resign', '퇴직 예정자 이상 활동', '퇴직 예정자 또는 비활성 계정에서 비정상적인 시스템 접근 탐지.', '내부자 위협', 'CRITICAL', '5', 'security', true, 'username', 5, 'hour', 1, false, false, 'system'),
('rule-insider-priv-abuse', '권한 남용 의심', '관리자 권한을 가진 사용자가 업무 외 시간에 비정상적인 관리 작업 수행.', '권한 남용', 'HIGH', '4', 'security', true, 'username', 10, 'hour', 1, false, false, 'system'),
('rule-insider-multi-login', '다중 위치 동시 로그인', '동일 계정이 서로 다른 IP에서 단시간 내 로그인 성공. 자격증명 공유 또는 탈취 의심.', '계정 탈취', 'HIGH', '2', 'security', true, 'username', 3, 'minute', 5, false, false, 'system'),
('rule-insider-db-dump', '대량 DB 조회 탐지', '단일 사용자가 데이터베이스에서 대량의 레코드를 조회. 데이터 유출 시도 가능성.', '데이터 유출', 'HIGH', '5', 'security', true, 'username', 20, 'minute', 10, false, false, 'system'),
('rule-insider-email-bulk', '대량 이메일 발송', '단일 사용자가 단시간 내 대량의 이메일 발송. 스팸 발송 또는 정보 유출 시도 의심.', '데이터 유출', 'MEDIUM', '5', 'security', true, 'username', 30, 'minute', 10, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 내부자 위협 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-insider-mass-access-1', 'rule-insider-mass-access', 'message', 'file access', 'INCLUDE', false, false, false, 'system'),
('rc-insider-after-resign-1', 'rule-insider-after-resign', 'message', 'login success', 'INCLUDE', false, false, false, 'system'),
('rc-insider-priv-abuse-1', 'rule-insider-priv-abuse', 'message', 'admin', 'INCLUDE', false, false, false, 'system'),
('rc-insider-multi-login-1', 'rule-insider-multi-login', 'message', 'login success', 'INCLUDE', false, false, false, 'system'),
('rc-insider-db-dump-1', 'rule-insider-db-dump', 'message', 'query', 'INCLUDE', false, false, false, 'system'),
('rc-insider-email-bulk-1', 'rule-insider-email-bulk', 'message', 'mail sent', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- ============================================================
-- 컴플라이언스/감사 룰 (8개)
-- ============================================================

INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, is_deleted, is_disabled, created_by) VALUES
('rule-audit-log-clear', '감사 로그 삭제 탐지', '시스템 감사 로그 또는 이벤트 로그가 삭제됨. 공격 흔적 은폐 시도 가능성.', '로그 변조', 'CRITICAL', '5', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-audit-user-create', '신규 사용자 계정 생성', '새로운 사용자 계정이 생성됨. 비인가 계정 생성 여부 확인 필요.', '계정 관리', 'LOW', '2', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-audit-user-delete', '사용자 계정 삭제', '사용자 계정이 삭제됨. 비인가 계정 삭제 여부 확인 필요.', '계정 관리', 'MEDIUM', '2', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-audit-sudo-use', 'sudo 명령 실행 탐지', 'sudo를 사용한 관리자 권한 명령 실행 탐지. 권한 남용 여부 점검.', '권한 상승', 'LOW', '2', 'security', true, 'username', 1, 'minute', 1, false, false, 'system'),
('rule-audit-ssh-key-change', 'SSH 키 변경 탐지', 'SSH 인증 키 파일이 변경됨. 비인가 원격 접속 백도어 설치 가능성.', '백도어 설치', 'HIGH', '4', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-audit-cron-change', '크론잡 변경 탐지', '예약 작업(cron) 설정이 변경됨. 지속성 확보를 위한 악성 스케줄 등록 가능성.', '지속성 확보', 'MEDIUM', '4', 'security', true, 'hostname', 1, 'minute', 1, false, false, 'system'),
('rule-audit-fw-rule-add', '방화벽 예외 규칙 추가', '방화벽에 새로운 허용 규칙이 추가됨. 비인가 통신 경로 개방 여부 확인 필요.', '정책 변경', 'HIGH', '4', 'security', true, 'deviceIp', 1, 'minute', 1, false, false, 'system'),
('rule-audit-backup-fail', '백업 실패 탐지', '시스템 백업 작업이 실패함. 데이터 보호 체계 점검 필요.', '시스템 장애', 'MEDIUM', '5', 'security', true, 'hostname', 3, 'day', 1, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;

-- 컴플라이언스/감사 룰 조건
INSERT INTO rule_conditions (uuid, rule_id, key, value, method, is_exclude, is_deleted, is_disabled, created_by) VALUES
('rc-audit-log-clear-1', 'rule-audit-log-clear', 'message', 'log cleared', 'INCLUDE', false, false, false, 'system'),
('rc-audit-user-create-1', 'rule-audit-user-create', 'message', 'user created', 'INCLUDE', false, false, false, 'system'),
('rc-audit-user-delete-1', 'rule-audit-user-delete', 'message', 'user deleted', 'INCLUDE', false, false, false, 'system'),
('rc-audit-sudo-use-1', 'rule-audit-sudo-use', 'message', 'sudo', 'INCLUDE', false, false, false, 'system'),
('rc-audit-ssh-key-1', 'rule-audit-ssh-key-change', 'message', 'authorized_keys', 'INCLUDE', false, false, false, 'system'),
('rc-audit-cron-change-1', 'rule-audit-cron-change', 'message', 'crontab', 'INCLUDE', false, false, false, 'system'),
('rc-audit-fw-rule-add-1', 'rule-audit-fw-rule-add', 'message', 'rule added', 'INCLUDE', false, false, false, 'system'),
('rc-audit-backup-fail-1', 'rule-audit-backup-fail', 'message', 'backup failed', 'INCLUDE', false, false, false, 'system')
ON CONFLICT (uuid) DO NOTHING;
