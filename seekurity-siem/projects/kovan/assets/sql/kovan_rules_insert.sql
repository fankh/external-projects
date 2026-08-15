-- =====================================================================
-- KOVAN 고객용 SIEM 탐지 규칙 (자동 생성)
-- 총 105개 규칙
-- 생성일: 2026-04-03
-- =====================================================================

\set ON_ERROR_STOP on

-- [1] 방화벽 차단 이벤트 폭주 (단일 출발지)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('f3bca119-d147-490e-9592-324bb705c924', '방화벽 차단 이벤트 폭주 (단일 출발지)', '단일 출발지 IP에서 10분 내 20회 이상 차단 이벤트 발생', 'Scanning', 'HIGH', '1', 'security', true, 'sourceIp', 20, 'minute', 10, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0809abb0-e6f9-4896-b33f-84246505fa50', 'f3bca119-d147-490e-9592-324bb705c924', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [2] 방화벽 Drop 이벤트 폭주 (단일 출발지)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('f29d3d18-3b94-4821-a246-3b566c7c5605', '방화벽 Drop 이벤트 폭주 (단일 출발지)', '단일 출발지 IP에서 10분 내 30회 이상 Drop 발생', 'Scanning', 'HIGH', '1', 'security', true, 'sourceIp', 30, 'minute', 10, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('f42f6dad-6598-4a4f-9691-6bea445d6807', 'f29d3d18-3b94-4821-a246-3b566c7c5605', 'deviceAction', 'drop', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [3] 포트 스캔 탐지 (다수 목적지 포트)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('8646fc32-13ff-4fd4-b93b-4e5e7e516947', '포트 스캔 탐지 (다수 목적지 포트)', '동일 출발지에서 5분 내 15개 이상 서로 다른 목적지 포트 접근 시도', 'Port Scan', 'CRITICAL', '1', 'security', true, 'sourceIp', 15, 'minute', 5, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ba92596d-4d35-4621-a602-b241e6f2a133', '8646fc32-13ff-4fd4-b93b-4e5e7e516947', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [4] SMB 포트 (445) 차단 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('7415931c-85fd-46aa-93b0-0c805bcf392d', 'SMB 포트 (445) 차단 탐지', '외부에서 SMB 포트 445로의 접근 시도 차단', 'Exploitation', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c5318348-e9ff-4ec7-b5cc-4a0470f30b48', '7415931c-85fd-46aa-93b0-0c805bcf392d', 'destinationPort', '445', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d097cee2-5567-4f0b-b75d-cfb6493d1f4d', '7415931c-85fd-46aa-93b0-0c805bcf392d', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [5] RDP 포트 (3389) 차단 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a45a31fe-9a49-4e07-82ce-e053ed431b67', 'RDP 포트 (3389) 차단 탐지', '외부에서 RDP 포트 3389로의 접근 시도 차단', 'Exploitation', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('32ac7bff-f5ee-44eb-bab4-1752cd9d819c', 'a45a31fe-9a49-4e07-82ce-e053ed431b67', 'destinationPort', '3389', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c896f937-f90a-4262-a0ae-f06d10363519', 'a45a31fe-9a49-4e07-82ce-e053ed431b67', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [6] SSH 포트 (22) 반복 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('71196fdd-9d23-496a-8da7-c9b311ca1935', 'SSH 포트 (22) 반복 차단', '동일 출발지에서 SSH 포트 22로 5분 내 10회 이상 차단', 'Brute Force', 'HIGH', '2', 'security', true, 'sourceIp', 10, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('626ada4b-ae3b-427c-a014-df907ae691d8', '71196fdd-9d23-496a-8da7-c9b311ca1935', 'destinationPort', '22', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4e2a11cf-1917-4ab5-ac86-8a0415b44814', '71196fdd-9d23-496a-8da7-c9b311ca1935', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [7] Telnet 포트 (23) 접근 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('63548dbc-f179-472a-9f83-b6a36b4c2f9e', 'Telnet 포트 (23) 접근 시도', 'Telnet 포트 23으로의 접근 시도 탐지', 'Exploitation', 'MEDIUM', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('33d61639-caca-4609-be3e-b3ce8e795042', '63548dbc-f179-472a-9f83-b6a36b4c2f9e', 'destinationPort', '23', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('94395cc4-3c1d-4fd4-aff7-6f18f7b7c5cd', '63548dbc-f179-472a-9f83-b6a36b4c2f9e', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [8] MySQL 포트 (3306) 외부 접근 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('8285bd1a-beb0-47ee-98fc-e39233058f1d', 'MySQL 포트 (3306) 외부 접근 차단', '외부에서 MySQL 포트 3306으로 접근 시도 차단', 'Exploitation', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('59091927-3b0d-4ebe-acef-1b54d99f7bc4', '8285bd1a-beb0-47ee-98fc-e39233058f1d', 'destinationPort', '3306', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('987d0f48-b4a5-4b09-a8c1-63c84ba8db12', '8285bd1a-beb0-47ee-98fc-e39233058f1d', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [9] PostgreSQL 포트 (5432) 외부 접근 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a1854936-b7e3-4013-8042-9f65bd7161e2', 'PostgreSQL 포트 (5432) 외부 접근 차단', '외부에서 PostgreSQL 포트 5432로 접근 시도 차단', 'Exploitation', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ab6c665d-ddd0-4dbc-891a-72f26282820b', 'a1854936-b7e3-4013-8042-9f65bd7161e2', 'destinationPort', '5432', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('aa179b38-89f6-467c-8d31-13903e8a2251', 'a1854936-b7e3-4013-8042-9f65bd7161e2', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [10] MSSQL 포트 (1433) 외부 접근 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('00a61e61-b7e4-4fee-ac44-e67aa1102be8', 'MSSQL 포트 (1433) 외부 접근 차단', '외부에서 MSSQL 포트 1433으로 접근 시도 차단', 'Exploitation', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0c77a6d0-9ad0-4fde-ad2b-6a0477aff536', '00a61e61-b7e4-4fee-ac44-e67aa1102be8', 'destinationPort', '1433', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7a681461-3ebb-4fe3-9410-06526612d156', '00a61e61-b7e4-4fee-ac44-e67aa1102be8', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [11] DNS 비정상 트래픽 탐지 (TCP/53)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('d8c37e9b-d163-40cd-b6e2-5eb0df257a19', 'DNS 비정상 트래픽 탐지 (TCP/53)', 'TCP 프로토콜 DNS 트래픽 (DNS 터널링 의심)', 'Data Exfiltration', 'MEDIUM', '4', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('2cf652ae-9fa2-46a2-aabb-67d15ef87464', 'd8c37e9b-d163-40cd-b6e2-5eb0df257a19', 'destinationPort', '53', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7b44d1d3-c082-4d28-8a2c-10b73cc768d0', 'd8c37e9b-d163-40cd-b6e2-5eb0df257a19', 'protocol', 'TCP', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [12] 방화벽 허용 후 대량 트래픽 (단일 세션)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('0b6c0772-aa85-4c77-a27e-1d70a5c9eb87', '방화벽 허용 후 대량 트래픽 (단일 세션)', '허용된 단일 출발지에서 5분 내 50회 이상 연결', 'Anomaly', 'MEDIUM', '3', 'security', true, 'sourceIp', 50, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4b9f3ba7-3f5a-48b9-882e-6066078ac34e', '0b6c0772-aa85-4c77-a27e-1d70a5c9eb87', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [13] 방화벽 Reject 이벤트 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('e9dba5f0-dbea-457b-9d74-4e46fab74e23', '방화벽 Reject 이벤트 탐지', '방화벽에서 Reject 응답 발생', 'Network Attack', 'MEDIUM', '1', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('f8383115-2953-4139-a93d-0bb6af039080', 'e9dba5f0-dbea-457b-9d74-4e46fab74e23', 'deviceAction', 'reject', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [14] FTP 포트 (21) 외부 접근 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('c994fe54-8f3a-41d2-9649-ef58caf52ab8', 'FTP 포트 (21) 외부 접근 시도', '외부에서 FTP 포트 21로의 접근 시도', 'Exploitation', 'MEDIUM', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('36b2426d-c437-44a2-9f80-b341353c1c5e', 'c994fe54-8f3a-41d2-9649-ef58caf52ab8', 'destinationPort', '21', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('86d2a86e-0284-4588-9ecf-e17eb08cfe09', 'c994fe54-8f3a-41d2-9649-ef58caf52ab8', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [15] SNMP 포트 (161) 접근 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('16937da3-308f-485d-9c94-fd25ac91d71f', 'SNMP 포트 (161) 접근 시도', 'SNMP 포트 161로의 비인가 접근 시도', 'Reconnaissance', 'LOW', '1', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('094f6c10-b3bc-43bd-ad4f-d6e90c95c691', '16937da3-308f-485d-9c94-fd25ac91d71f', 'destinationPort', '161', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('295debac-cb5f-4bc7-b1aa-50ee93588811', '16937da3-308f-485d-9c94-fd25ac91d71f', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [16] LDAP 포트 (389) 외부 접근 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('3ac5bc77-b506-4a35-a572-6e523ffbd718', 'LDAP 포트 (389) 외부 접근 차단', '외부에서 LDAP 포트 389로의 접근 시도', 'Exploitation', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d4def596-4b8d-465d-8bbd-7ca8a93ab883', '3ac5bc77-b506-4a35-a572-6e523ffbd718', 'destinationPort', '389', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('38cf30fb-ce63-4846-ba6f-4808d089d3c0', '3ac5bc77-b506-4a35-a572-6e523ffbd718', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [17] 방화벽 정책 변경 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('2cdb3fd3-84f3-4d0a-9776-c58894bfe92e', '방화벽 정책 변경 탐지', '방화벽 설정 또는 정책 변경 이벤트', 'Configuration Change', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('07db3b97-4533-487c-aafd-2e0ec779f945', '2cdb3fd3-84f3-4d0a-9776-c58894bfe92e', 'eventName', 'policy', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [18] 방화벽 관리자 로그인 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a36e68c1-9494-47c5-be1c-794f30dec5ae', '방화벽 관리자 로그인 탐지', '방화벽 관리 인터페이스 로그인 이벤트', 'Authentication', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('64489620-bfe8-497a-8892-faf11f8092b1', 'a36e68c1-9494-47c5-be1c-794f30dec5ae', 'eventName', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('13aea1d8-9861-4b7b-99e4-218c8f09378e', 'a36e68c1-9494-47c5-be1c-794f30dec5ae', 'deviceAction', 'accept', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [19] 방화벽 관리자 로그인 실패
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a0e41516-6d46-46f3-ad64-3ba97b81cc2c', '방화벽 관리자 로그인 실패', '방화벽 관리 인터페이스 로그인 실패', 'Brute Force', 'HIGH', '2', 'security', true, 'sourceIp', 5, 'minute', 10, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3ea83be7-e657-4b0e-a142-0405443635d4', 'a0e41516-6d46-46f3-ad64-3ba97b81cc2c', 'eventName', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c20a09ea-e382-4650-af16-51c55d44352b', 'a0e41516-6d46-46f3-ad64-3ba97b81cc2c', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [20] ICMP Flood 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('29062d34-adac-4a29-85d0-520cc1bc3a10', 'ICMP Flood 탐지', '동일 출발지에서 5분 내 100회 이상 ICMP 트래픽', 'DoS', 'HIGH', '1', 'security', true, 'sourceIp', 100, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d514ed73-d5ee-4086-b59b-ab3b8e8e9bb2', '29062d34-adac-4a29-85d0-520cc1bc3a10', 'protocol', 'ICMP', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [21] 비표준 포트 아웃바운드 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('dd20a473-dd8f-44c5-b33a-175d130f2e17', '비표준 포트 아웃바운드 트래픽', '비표준 고포트(8080~9999)로의 아웃바운드 허용 트래픽', 'C2 Communication', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('e3a07ca1-ae85-47e1-89d7-021597995f6b', 'dd20a473-dd8f-44c5-b33a-175d130f2e17', 'destinationPort', '8080', 'GTE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('65be8abd-7cd5-404d-a332-a58250432119', 'dd20a473-dd8f-44c5-b33a-175d130f2e17', 'destinationPort', '9999', 'LTE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('8485b0fb-3a33-4531-8b3d-16bb2a276eab', 'dd20a473-dd8f-44c5-b33a-175d130f2e17', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [22] 내부 → 내부 차단 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('b9ae1329-b7b4-4549-ac9f-6b484b6eb15e', '내부 → 내부 차단 트래픽', '내부 네트워크 간 차단된 트래픽 (횡이동 시도 의심)', 'Lateral Movement', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('bdcfb743-8bce-4119-b86f-7671f85d9e8a', 'b9ae1329-b7b4-4549-ac9f-6b484b6eb15e', 'sourceIp', '10.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b17c8edb-ec4a-4816-837a-d234058fd739', 'b9ae1329-b7b4-4549-ac9f-6b484b6eb15e', 'destinationIp', '10.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('081846e0-e1b8-4bdd-acf1-c9aebbc9477e', 'b9ae1329-b7b4-4549-ac9f-6b484b6eb15e', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [23] 야간 시간대 방화벽 허용 트래픽 (22시~06시)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('9ce0a3c7-584c-4cb3-b02d-98063002be8f', '야간 시간대 방화벽 허용 트래픽 (22시~06시)', '심야 시간대 비정상 허용 트래픽 탐지', 'Anomaly', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b4bbe02e-0a4f-4b97-b88f-a1ecb8386bc7', '9ce0a3c7-584c-4cb3-b02d-98063002be8f', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [24] 단일 목적지 대량 연결 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('e8087a87-eff7-419d-835b-927f57d9821f', '단일 목적지 대량 연결 시도', '동일 목적지 IP로 5분 내 30회 이상 연결 시도', 'DoS', 'HIGH', '1', 'security', true, 'destinationIp', 30, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('32410b3f-be88-4962-ade6-59bc29da7ae4', 'e8087a87-eff7-419d-835b-927f57d9821f', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [25] 방화벽 로그 수집 중단 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('67f51564-00b9-41fc-b0b0-9b6b29a00a9a', '방화벽 로그 수집 중단 탐지', '방화벽 장비에서 로그 수집이 중단된 경우 (하트비트 누락)', 'System', 'CRITICAL', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4076d8fe-c68a-4ba3-94cb-8e81a637a65e', '67f51564-00b9-41fc-b0b0-9b6b29a00a9a', 'eventName', 'heartbeat', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d18957be-8d87-4d31-b6a3-d626e5fa712e', '67f51564-00b9-41fc-b0b0-9b6b29a00a9a', 'deviceAction', 'timeout', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [26] VPN 로그인 실패 반복 (Brute Force)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('c97f4ef5-dbe8-4417-b25b-68277b8b2775', 'VPN 로그인 실패 반복 (Brute Force)', '동일 계정으로 5분 내 5회 이상 VPN 로그인 실패', 'Brute Force', 'CRITICAL', '2', 'security', true, 'account', 5, 'minute', 5, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('9caab08c-2eb8-4030-a6de-585b13fd937d', 'c97f4ef5-dbe8-4417-b25b-68277b8b2775', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('5b735530-a90e-4530-b444-64f32ef208a5', 'c97f4ef5-dbe8-4417-b25b-68277b8b2775', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [27] VPN 로그인 성공 후 즉시 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('2266a859-7fee-471d-88b2-66174e951aef', 'VPN 로그인 성공 후 즉시 차단', 'VPN 로그인 성공 직후 방화벽 차단 이벤트', 'Suspicious Activity', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ca706df0-af6b-4b5b-88c8-198766ba7d32', '2266a859-7fee-471d-88b2-66174e951aef', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('9b76918c-20d5-48b1-bd9c-79565cd3a7e2', '2266a859-7fee-471d-88b2-66174e951aef', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [28] VPN 비정상 로그아웃
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a47e04d7-1a10-4ea5-a9c7-ecdcb8bb2506', 'VPN 비정상 로그아웃', 'VPN 세션 비정상 종료 이벤트', 'Anomaly', 'LOW', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c751912e-2e19-428e-81a5-28194b46eb7a', 'a47e04d7-1a10-4ea5-a9c7-ecdcb8bb2506', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('905f3675-1f75-423a-a5a3-37e919267aed', 'a47e04d7-1a10-4ea5-a9c7-ecdcb8bb2506', 'deviceAction', 'disconnect', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [29] VPN 동시 다중 세션 (동일 계정)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('5b47f8ef-9a63-4681-9857-21628f4a4eb6', 'VPN 동시 다중 세션 (동일 계정)', '동일 계정으로 10분 내 3회 이상 VPN 접속', 'Account Compromise', 'HIGH', '3', 'security', true, 'account', 3, 'minute', 10, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('809059ab-4447-4d77-83a7-5309205fc27a', '5b47f8ef-9a63-4681-9857-21628f4a4eb6', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0f00b9b7-fe71-4754-875b-c89fda9833be', '5b47f8ef-9a63-4681-9857-21628f4a4eb6', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [30] VPN 비인가 IP 접속 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('ee201016-f55c-4156-9127-82ed7ca008ea', 'VPN 비인가 IP 접속 시도', '허용되지 않은 IP에서 VPN 접속 시도', 'Unauthorized Access', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('69bc73ea-7d53-4c33-95ee-17feb407ece3', 'ee201016-f55c-4156-9127-82ed7ca008ea', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b1cf6e99-0ae8-4309-b040-408a9fcc141f', 'ee201016-f55c-4156-9127-82ed7ca008ea', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [31] VPN 계정 잠금 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('cdd561f9-43b7-4333-9117-a5040339ae03', 'VPN 계정 잠금 이벤트', 'VPN 계정 잠금 발생', 'Brute Force', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('93d0c819-280b-438b-84b6-6e1aeaf8773a', 'cdd561f9-43b7-4333-9117-a5040339ae03', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3fd89a4a-ab2d-46bf-b5de-d93dd8e37390', 'cdd561f9-43b7-4333-9117-a5040339ae03', 'deviceAction', 'lock', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [32] VPN 터널 설정 실패
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('ad7d31b4-59b4-41b6-ad24-aaef5e620d60', 'VPN 터널 설정 실패', 'VPN 터널 설정 실패 이벤트', 'System', 'MEDIUM', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0d535c89-2606-482f-b20f-eae81db80b7b', 'ad7d31b4-59b4-41b6-ad24-aaef5e620d60', 'eventName', 'tunnel', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b3ae3534-333d-4cf2-9917-9d4c70366a5b', 'ad7d31b4-59b4-41b6-ad24-aaef5e620d60', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [33] VPN 세션 장시간 유지 (이상)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('9efdcc62-08fa-458b-bbe0-3083ba02267a', 'VPN 세션 장시간 유지 (이상)', 'VPN 세션이 비정상적으로 장시간 유지', 'Anomaly', 'LOW', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c6579397-56c1-4333-b6ef-f5348d42a648', '9efdcc62-08fa-458b-bbe0-3083ba02267a', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6ce04115-be16-462d-a9d4-e0cfa0aeb0c7', '9efdcc62-08fa-458b-bbe0-3083ba02267a', 'eventName', 'session', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [34] 카드사 VPN 비정상 접속 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('da3c5bb1-a3de-4a8a-888a-652425f81a57', '카드사 VPN 비정상 접속 시도', '카드사 VPN 연결에서 비정상 접속 시도 탐지', 'Unauthorized Access', 'CRITICAL', '2', 'security', true, 'sourceIp', 3, 'minute', 5, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('90a3725e-a60c-41c8-9ed3-8a49d414f21e', 'da3c5bb1-a3de-4a8a-888a-652425f81a57', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('091de6ce-7802-49eb-97f5-c640465044e3', 'da3c5bb1-a3de-4a8a-888a-652425f81a57', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [35] VPN 인증서 오류
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('114ad5fe-df1c-4d25-b32a-8186238afb33', 'VPN 인증서 오류', 'VPN 인증서 관련 오류 이벤트', 'Authentication', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('9834ddb2-9782-4192-89ac-68015109d953', '114ad5fe-df1c-4d25-b32a-8186238afb33', 'eventName', 'certificate', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('619e950b-cccf-42c9-aa21-4319e402a81c', '114ad5fe-df1c-4d25-b32a-8186238afb33', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [36] VPN 대역폭 초과 경고
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('7b8c0989-beb3-44e1-ab18-eb8c554a469f', 'VPN 대역폭 초과 경고', 'VPN 트래픽 대역폭 초과 이벤트', 'Anomaly', 'MEDIUM', '4', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('8206e26e-b3b8-4553-a2fc-69553a15c246', '7b8c0989-beb3-44e1-ab18-eb8c554a469f', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7975068d-3505-4088-84c2-9b076137c9a1', '7b8c0989-beb3-44e1-ab18-eb8c554a469f', 'eventName', 'bandwidth', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [37] VPN 다중 IP 로그인 (동일 계정)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('d0f069dc-234d-491b-86d8-975e607976e3', 'VPN 다중 IP 로그인 (동일 계정)', '동일 VPN 계정이 30분 내 서로 다른 IP에서 접속', 'Account Compromise', 'CRITICAL', '3', 'security', true, 'account', 2, 'minute', 30, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('90b1fe8d-fc9a-4586-b44c-3e2a6dcff338', 'd0f069dc-234d-491b-86d8-975e607976e3', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7c8bc6c4-c58e-4850-9fa9-9b0add73b31d', 'd0f069dc-234d-491b-86d8-975e607976e3', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [38] 전용선 VPN 연결 실패
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('4fd295b6-623e-4ef3-b48f-69343ee36ecd', '전용선 VPN 연결 실패', '전용선 VPN 연결 장애 발생', 'System', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('f6a11464-e423-4dcc-bcca-d3fbe6bffba5', '4fd295b6-623e-4ef3-b48f-69343ee36ecd', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('903a245d-f8ab-4878-b523-9cc60e4df0b2', '4fd295b6-623e-4ef3-b48f-69343ee36ecd', 'device', 'leased', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('33888292-305f-425b-a066-c731de37a227', '4fd295b6-623e-4ef3-b48f-69343ee36ecd', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [39] VPN 정책 위반 접속
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a363c2c1-688f-4bbe-9116-cc2e37312c1a', 'VPN 정책 위반 접속', 'VPN 보안 정책 위반 접속 시도', 'Policy Violation', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('a63d5677-3ca3-44a9-a15a-cf6bb9df0ee6', 'a363c2c1-688f-4bbe-9116-cc2e37312c1a', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('564b314a-83e4-4dfc-bdc2-5c5be9dbafbe', 'a363c2c1-688f-4bbe-9116-cc2e37312c1a', 'eventName', 'policy', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('f1e0b9f8-a953-4e5d-93df-45d04fa634c8', 'a363c2c1-688f-4bbe-9116-cc2e37312c1a', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [40] VPN 비업무 시간 접속 (주말/야간)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('099f2e43-ace0-42ef-be1f-3ad91749a266', 'VPN 비업무 시간 접속 (주말/야간)', '비업무 시간대 VPN 접속 이벤트', 'Anomaly', 'LOW', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7b71cbe1-7099-4441-a554-9cfbba34d860', '099f2e43-ace0-42ef-be1f-3ad91749a266', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3618f683-6edd-4d50-9131-b9ad0fa409ab', '099f2e43-ace0-42ef-be1f-3ad91749a266', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [41] VPN IKE 협상 실패
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('717fc62d-403f-4a88-8a32-1c41920efe81', 'VPN IKE 협상 실패', 'VPN IKE Phase 1/2 협상 실패', 'System', 'MEDIUM', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('627bd175-e5d7-4a0a-96f0-d4daa63bc40f', '717fc62d-403f-4a88-8a32-1c41920efe81', 'eventName', 'ike', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6e20f7f4-60df-4bf8-867b-b7e88e607523', '717fc62d-403f-4a88-8a32-1c41920efe81', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [42] BHN VPN 비정상 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('c318e264-cc84-41ca-b536-d6ecce3ef2a4', 'BHN VPN 비정상 트래픽', 'BHN VPN 구간에서 비정상 트래픽 패턴', 'Anomaly', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4179ce2c-ccb2-4703-bb38-eec275ac810b', 'c318e264-cc84-41ca-b536-d6ecce3ef2a4', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('1525a8dc-350c-4bd3-afd4-1518ac91e10e', 'c318e264-cc84-41ca-b536-d6ecce3ef2a4', 'device', 'BHN', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [43] VPN 로그인 성공 알림
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('2ac5d5c5-9089-4b46-934d-a71beaeddf65', 'VPN 로그인 성공 알림', 'VPN 로그인 성공 이벤트 모니터링 (감사 목적)', 'Monitoring', 'INFO', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('851f407a-e57e-4a51-99e6-97bc7ae4c83b', '2ac5d5c5-9089-4b46-934d-a71beaeddf65', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('aca051bb-0a79-4b47-bae6-3282fddfdbf2', '2ac5d5c5-9089-4b46-934d-a71beaeddf65', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6622ac51-c4bf-41e8-bcde-8b2e79e8a1bb', '2ac5d5c5-9089-4b46-934d-a71beaeddf65', 'deviceAction', 'success', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [44] VPN 대량 데이터 전송
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('b31831f5-1a5d-426c-a6e5-43410852f4c8', 'VPN 대량 데이터 전송', 'VPN 세션에서 대량 데이터 전송 탐지', 'Data Exfiltration', 'HIGH', '4', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('8f3717ce-0cb2-4a00-a0cb-0a7b26721f9f', 'b31831f5-1a5d-426c-a6e5-43410852f4c8', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4a1b6346-8e0b-433e-b6d2-fa7ccc85f778', 'b31831f5-1a5d-426c-a6e5-43410852f4c8', 'eventName', 'transfer', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [45] VPN 연결 상태 모니터링
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('f229a7e4-726b-4f15-b069-e317f9570c01', 'VPN 연결 상태 모니터링', 'VPN 장비 연결 상태 체크 이벤트', 'Monitoring', 'INFO', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('bee99fa3-9800-4d32-b987-008455392c57', 'f229a7e4-726b-4f15-b069-e317f9570c01', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('05056eed-2f0a-415a-9a3e-594f7f23e298', 'f229a7e4-726b-4f15-b069-e317f9570c01', 'eventName', 'status', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [46] TI 블랙리스트 IP 출발지 매칭
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('be8aa842-edf8-42ac-a36a-6762d7cece5d', 'TI 블랙리스트 IP 출발지 매칭', '위협 인텔리전스 블랙리스트에 등록된 IP에서 트래픽 유입', 'Threat Intelligence', 'CRITICAL', '1', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('2ac14306-5387-4e51-b96c-b3e90c6ac897', 'be8aa842-edf8-42ac-a36a-6762d7cece5d', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [47] TI 블랙리스트 IP 목적지 매칭
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a64754b6-524a-4fb2-841c-e2f1ab54d8fe', 'TI 블랙리스트 IP 목적지 매칭', '위협 인텔리전스 블랙리스트 IP로 트래픽 발송', 'Threat Intelligence', 'CRITICAL', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0ba65fe7-31da-41f1-a56b-d6f2d800221a', 'a64754b6-524a-4fb2-841c-e2f1ab54d8fe', 'destinationIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [48] TI 블랙리스트 IP 출발지 + 허용 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('35a87de6-93c8-41cf-836c-14d5f37f7388', 'TI 블랙리스트 IP 출발지 + 허용 트래픽', 'TI 등록 IP에서 방화벽 허용된 트래픽 (위험)', 'Threat Intelligence', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('18038498-9ac4-40c6-958d-e50820690937', '35a87de6-93c8-41cf-836c-14d5f37f7388', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('081f58b4-4d9e-41af-b3f8-42e61fa00a49', '35a87de6-93c8-41cf-836c-14d5f37f7388', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [49] TI 블랙리스트 IP 목적지 + 허용 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('5ed2ff18-f1bc-4a70-b2b9-ffeddf4cdc37', 'TI 블랙리스트 IP 목적지 + 허용 트래픽', 'TI 등록 IP로 방화벽 허용된 아웃바운드 트래픽', 'Threat Intelligence', 'CRITICAL', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('9cc4d2ff-5bd3-44c5-ac46-f8bbb3791068', '5ed2ff18-f1bc-4a70-b2b9-ffeddf4cdc37', 'destinationIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6ff200be-5a03-4353-a4a1-1c0ae9f23cd8', '5ed2ff18-f1bc-4a70-b2b9-ffeddf4cdc37', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [50] TI 블랙리스트 출발지 반복 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('f512b744-0ff7-4b49-85de-81af23687ac4', 'TI 블랙리스트 출발지 반복 접근', 'TI 등록 IP에서 5분 내 5회 이상 접근 시도', 'Threat Intelligence', 'CRITICAL', '1', 'security', true, 'sourceIp', 5, 'minute', 5, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d717c01c-98d6-4809-a827-a343869e9e13', 'f512b744-0ff7-4b49-85de-81af23687ac4', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [51] TI 악성 도메인 접근 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('9a8b3c29-5a6f-40da-bda4-7529ebdcd5f3', 'TI 악성 도메인 접근 탐지', '위협 인텔리전스 등록 악성 도메인 접근 시도', 'Threat Intelligence', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('f79e30c3-02be-49ea-b82b-bc9f4b4f06d5', '9a8b3c29-5a6f-40da-bda4-7529ebdcd5f3', 'destinationIp', '', 'IN_TI', 'DOMAIN', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [52] TI 악성 URL 접근 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('1aca1adc-0f0b-414e-98e1-a9a6668f277d', 'TI 악성 URL 접근 탐지', '위협 인텔리전스 등록 악성 URL 접근 시도', 'Threat Intelligence', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d65ef752-c64a-4919-9997-d7ccd027b3c4', '1aca1adc-0f0b-414e-98e1-a9a6668f277d', 'message', '', 'IN_TI', 'URL', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [53] TI 매칭 + 내부 서버 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('64854fab-7ffc-4e01-9d27-62fbb70cb3f0', 'TI 매칭 + 내부 서버 접근', 'TI 등록 IP에서 내부 서버 대역으로 접근', 'Threat Intelligence', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('39c3aec0-bd77-44f3-84fb-8d58e67260d8', '64854fab-7ffc-4e01-9d27-62fbb70cb3f0', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('23a1c7eb-d21f-40d4-acf8-f8b9fa1454cd', '64854fab-7ffc-4e01-9d27-62fbb70cb3f0', 'destinationIp', '10.231.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [54] TI 매칭 + DB 포트 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('88f56303-7921-4268-88ee-8df2490d382e', 'TI 매칭 + DB 포트 접근', 'TI 등록 IP에서 DB 포트 접근 시도', 'Threat Intelligence', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('501d4ed6-084f-488a-8545-1f22c9aa3ccf', '88f56303-7921-4268-88ee-8df2490d382e', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('adb3972b-8e33-4f64-b5f3-321a55fbdc58', '88f56303-7921-4268-88ee-8df2490d382e', 'destinationPort', '5432', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [55] TI 매칭 + RDP 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('6cbad2f4-f637-423c-af48-367d5ac5d7c9', 'TI 매칭 + RDP 접근', 'TI 등록 IP에서 RDP 접근 시도', 'Threat Intelligence', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3e30f277-04a8-4cc3-aa52-27263d7c72ca', '6cbad2f4-f637-423c-af48-367d5ac5d7c9', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('16117bda-5805-4339-82e4-d1bc7a254874', '6cbad2f4-f637-423c-af48-367d5ac5d7c9', 'destinationPort', '3389', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [56] TI 매칭 + SSH 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('3479c61a-a24c-4d04-bc6e-0c24b2c6bf5c', 'TI 매칭 + SSH 접근', 'TI 등록 IP에서 SSH 접근 시도', 'Threat Intelligence', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('705d024d-b098-4879-9449-2fe36221b984', '3479c61a-a24c-4d04-bc6e-0c24b2c6bf5c', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6d3175e7-8c08-4dec-8811-e69474e44e98', '3479c61a-a24c-4d04-bc6e-0c24b2c6bf5c', 'destinationPort', '22', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [57] TI 매칭 + VPN 접속 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('6f549e29-3bca-460d-a671-7903773ecf0b', 'TI 매칭 + VPN 접속 시도', 'TI 등록 IP에서 VPN 접속 시도', 'Threat Intelligence', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0eb7382f-5724-48c1-a964-550b102916b1', '6f549e29-3bca-460d-a671-7903773ecf0b', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('770098f3-c563-46c9-b0f9-81e4784c0992', '6f549e29-3bca-460d-a671-7903773ecf0b', 'eventName', 'vpn', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [58] TI 매칭 + 웹 서버 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('4791d974-15f0-4bf4-a24f-4222473c4e8e', 'TI 매칭 + 웹 서버 접근', 'TI 등록 IP에서 웹 서버 포트 접근', 'Threat Intelligence', 'HIGH', '2', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('552e0dad-5e42-4ea6-811a-7e2725a071b5', '4791d974-15f0-4bf4-a24f-4222473c4e8e', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ca092ad4-0bee-465c-9517-5db34cb09b18', '4791d974-15f0-4bf4-a24f-4222473c4e8e', 'destinationPort', '443', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [59] TI 매칭 출발지 차단 확인
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('23c12b3b-1c66-49be-8121-4270009c5291', 'TI 매칭 출발지 차단 확인', 'TI 등록 IP 차단 이벤트 (방화벽 정상 동작 확인)', 'Monitoring', 'LOW', '1', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('cfbbd920-a9be-48a6-9164-035911221ed8', '23c12b3b-1c66-49be-8121-4270009c5291', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('10c5f7dc-ff44-4786-bfb9-cade58c0343c', '23c12b3b-1c66-49be-8121-4270009c5291', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [60] TI 매칭 + 결제 시스템 접근 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('14a0f294-5d56-488b-8729-b4acccefa7a3', 'TI 매칭 + 결제 시스템 접근 시도', 'TI 등록 IP에서 결제 시스템 대역 접근 시도', 'Threat Intelligence', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('67c8bb48-95cb-405a-af7e-6f8387fd5614', '14a0f294-5d56-488b-8729-b4acccefa7a3', 'sourceIp', '', 'IN_TI', 'IP', false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('790948d4-10da-4ac2-ab05-8cabd4cfc3ff', '14a0f294-5d56-488b-8729-b4acccefa7a3', 'destinationIp', '10.1.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [61] 로그인 실패 반복 (Brute Force)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('450f4f12-6e43-4b73-807d-98b7e3427f0d', '로그인 실패 반복 (Brute Force)', '동일 계정 5분 내 10회 이상 로그인 실패', 'Brute Force', 'CRITICAL', '2', 'security', true, 'account', 10, 'minute', 5, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('56d9954b-2e51-4b59-ba77-52cf0f7c94dd', '450f4f12-6e43-4b73-807d-98b7e3427f0d', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('e1f04b1d-bbe4-4116-9670-909b086a663f', '450f4f12-6e43-4b73-807d-98b7e3427f0d', 'eventName', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [62] 계정 잠금 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('28350918-6a5a-42c8-b95c-62af5bce9533', '계정 잠금 이벤트', '계정 잠금 발생 (다수 로그인 실패 후)', 'Brute Force', 'CRITICAL', '2', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('e22325e7-91b3-4340-9e40-c39f2abf4d7a', '28350918-6a5a-42c8-b95c-62af5bce9533', 'deviceAction', 'lock', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [63] 관리자 계정 로그인 성공
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('8dca7c8b-a3e5-401d-ad69-6fcab943eb4e', '관리자 계정 로그인 성공', '관리자(admin/root) 계정 로그인 성공 모니터링', 'Privileged Access', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('8fc72e08-0e95-489d-9cd2-5fe17a1436f5', '8dca7c8b-a3e5-401d-ad69-6fcab943eb4e', 'account', 'admin', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b019c6a5-ecdb-45c4-b2c6-4cba7e6c2916', '8dca7c8b-a3e5-401d-ad69-6fcab943eb4e', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [64] root 계정 원격 로그인
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('ab6bc20b-7192-4d8a-9730-8a01b1587177', 'root 계정 원격 로그인', 'root 계정으로 원격 로그인 시도', 'Privileged Access', 'CRITICAL', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('e2a6f1ac-0c49-4459-bd6a-bfe747a00cb1', 'ab6bc20b-7192-4d8a-9730-8a01b1587177', 'account', 'root', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('5fb1d1ea-d5e2-431b-8839-6a9f436a0a7f', 'ab6bc20b-7192-4d8a-9730-8a01b1587177', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [65] 비밀번호 변경 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('4b78c7e5-0090-408a-93fb-f58836db2c0c', '비밀번호 변경 이벤트', '계정 비밀번호 변경 이벤트 감사', 'Account Management', 'LOW', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ff84e384-dbe0-4557-a3da-8621ae1c0b13', '4b78c7e5-0090-408a-93fb-f58836db2c0c', 'eventName', 'password', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d3c776ef-5ddc-4197-b9bd-4c8d4e3ae08c', '4b78c7e5-0090-408a-93fb-f58836db2c0c', 'eventName', 'change', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [66] 계정 생성 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('fa02850b-96cd-4756-bcd8-6471d31e2213', '계정 생성 이벤트', '신규 계정 생성 이벤트', 'Account Management', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0a00520c-3e78-439b-9372-31967b972996', 'fa02850b-96cd-4756-bcd8-6471d31e2213', 'eventName', 'account', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('07cf90a5-f46a-42fd-9139-f191009ebb87', 'fa02850b-96cd-4756-bcd8-6471d31e2213', 'eventName', 'create', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [67] 계정 삭제 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('46966e11-b7a5-4b4a-a64e-0c66ceef2d74', '계정 삭제 이벤트', '계정 삭제 이벤트', 'Account Management', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('bea2bc6c-6013-4aea-99af-8c3939bdb692', '46966e11-b7a5-4b4a-a64e-0c66ceef2d74', 'eventName', 'account', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7b744256-7ed7-4036-9c8a-1f5f49fe7ce2', '46966e11-b7a5-4b4a-a64e-0c66ceef2d74', 'eventName', 'delete', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [68] 권한 상승 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('f6c7eb5d-7f22-498e-aaff-311c45e730a4', '권한 상승 이벤트', '사용자 권한 상승 시도 또는 성공', 'Privilege Escalation', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('14d0ebb9-1bda-47a8-bf63-a03993ea7d6d', 'f6c7eb5d-7f22-498e-aaff-311c45e730a4', 'eventName', 'privilege', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [69] OTP 인증 실패 반복
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('d181c0c1-bfcc-485e-92e9-69c27c141407', 'OTP 인증 실패 반복', 'OTP 인증 실패 5분 내 5회 이상', 'Brute Force', 'HIGH', '2', 'security', true, 'account', 5, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6a939989-aa04-47c2-ba29-60f9f3465b25', 'd181c0c1-bfcc-485e-92e9-69c27c141407', 'eventName', 'otp', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('52ec9477-1a7a-4b24-b370-a583e69f533a', 'd181c0c1-bfcc-485e-92e9-69c27c141407', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [70] OTP 인증 성공 모니터링
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('44815b97-331b-4100-917f-84817dbfa8e4', 'OTP 인증 성공 모니터링', 'OTP 인증 성공 이벤트 기록', 'Monitoring', 'INFO', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('09126d76-ad97-4cca-8a01-0edd00628d0d', '44815b97-331b-4100-917f-84817dbfa8e4', 'eventName', 'otp', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3e801d3c-150e-4984-95da-8cf4b962b025', '44815b97-331b-4100-917f-84817dbfa8e4', 'deviceAction', 'success', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [71] 다수 계정 로그인 시도 (단일 IP)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('334e80b1-4f11-40de-a27b-82f11a316d4e', '다수 계정 로그인 시도 (단일 IP)', '단일 IP에서 10분 내 5개 이상 서로 다른 계정 로그인 시도', 'Credential Stuffing', 'CRITICAL', '2', 'security', true, 'sourceIp', 5, 'minute', 10, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('d5268f04-bb7b-4b60-943d-7a327e8dcbab', '334e80b1-4f11-40de-a27b-82f11a316d4e', 'deviceAction', 'failed', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('667d3998-57e0-4150-b7e3-1e5bcead3bbb', '334e80b1-4f11-40de-a27b-82f11a316d4e', 'eventName', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [72] 비업무 시간 로그인 성공
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('9542d29b-c3ca-41bb-9898-a8a0ad4f1518', '비업무 시간 로그인 성공', '야간/주말 시간대 로그인 성공 이벤트', 'Anomaly', 'LOW', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('a80b89cb-41d4-48c0-80a2-7959b6423296', '9542d29b-c3ca-41bb-9898-a8a0ad4f1518', 'deviceAction', 'login', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c399d869-0c9c-4ae9-80d6-5092ef378c85', '9542d29b-c3ca-41bb-9898-a8a0ad4f1518', 'deviceAction', 'success', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [73] AD 그룹 정책 변경
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('b32079ee-2a1d-46ee-a892-f586f56889f6', 'AD 그룹 정책 변경', 'Active Directory 그룹 정책 변경 이벤트', 'Configuration Change', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('00fbc278-608d-4d4d-bf3c-b7ff009246b3', 'b32079ee-2a1d-46ee-a892-f586f56889f6', 'eventName', 'group', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('84d1547d-d723-4a4f-a4ae-74529f71775d', 'b32079ee-2a1d-46ee-a892-f586f56889f6', 'eventName', 'policy', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [74] DHCP 주소 충돌
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('3313b4a8-b1a3-4671-8770-b01b14238a5f', 'DHCP 주소 충돌', 'DHCP IP 주소 충돌 이벤트', 'System', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('23ec6743-0fb7-40fe-b18b-9c9dcef3da2a', '3313b4a8-b1a3-4671-8770-b01b14238a5f', 'eventName', 'dhcp', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('19a85b7f-9e2b-4de8-8fb0-5b8ea826d20f', '3313b4a8-b1a3-4671-8770-b01b14238a5f', 'eventName', 'conflict', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [75] AD 계정 비활성화
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('2adc1cb7-dc7f-4727-bde0-30279767c45e', 'AD 계정 비활성화', 'Active Directory 계정 비활성화 이벤트', 'Account Management', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('2a3c952b-eaea-4b75-838c-82d67bf25061', '2adc1cb7-dc7f-4727-bde0-30279767c45e', 'eventName', 'account', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4deafa87-e143-45f8-9395-db641e54a2a8', '2adc1cb7-dc7f-4727-bde0-30279767c45e', 'eventName', 'disable', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [76] DB 암호화 정책 위반
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('7fa61658-d96c-4717-8f7f-5818c4a03d08', 'DB 암호화 정책 위반', 'DB 암호화 정책 위반 이벤트 탐지', 'Policy Violation', 'CRITICAL', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('63392e94-1048-4758-b7bf-813255df7ef9', '7fa61658-d96c-4717-8f7f-5818c4a03d08', 'eventName', 'encryption', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6858329b-a80a-489b-91c0-d33b724b9607', '7fa61658-d96c-4717-8f7f-5818c4a03d08', 'deviceAction', 'violation', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [77] DB 접근제어 차단 이벤트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('7a9e1bc1-bff8-4369-91c1-4baa02e3f30b', 'DB 접근제어 차단 이벤트', 'DB 접근제어 솔루션에서 비인가 접근 차단', 'Unauthorized Access', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('aebf1ecd-0432-4e2a-883a-280609393be4', '7a9e1bc1-bff8-4369-91c1-4baa02e3f30b', 'eventName', 'dbaccess', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7bbb30ea-2bc7-4e12-acae-1cc607ddc201', '7a9e1bc1-bff8-4369-91c1-4baa02e3f30b', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [78] DB 접근제어 비인가 쿼리 실행
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('f9852111-8e45-4e7c-98bf-4211d0c7c364', 'DB 접근제어 비인가 쿼리 실행', 'DB 접근제어에서 비인가 쿼리 실행 탐지', 'Data Theft', 'CRITICAL', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('35654b80-25cd-4055-a83a-48dcfbcd36e4', 'f9852111-8e45-4e7c-98bf-4211d0c7c364', 'eventName', 'query', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('a8c376cc-5d6e-4ebc-ae7d-21800e5fbe19', 'f9852111-8e45-4e7c-98bf-4211d0c7c364', 'deviceAction', 'block', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [79] 문서보안 DRM 정책 위반
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('8f685865-e654-4812-83cb-a7b5d6fe87ef', '문서보안 DRM 정책 위반', 'DRM 문서 보안 정책 위반 이벤트', 'Data Leak', 'HIGH', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6b673feb-f044-4ff9-a309-b07cf516f37a', '8f685865-e654-4812-83cb-a7b5d6fe87ef', 'eventName', 'drm', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3d5b5dd0-0ea9-49d2-a3c9-2fd2b35aee68', '8f685865-e654-4812-83cb-a7b5d6fe87ef', 'deviceAction', 'violation', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [80] 문서보안 DRM 해제 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('16a3f897-3c44-46b8-8e36-ea8d679639e0', '문서보안 DRM 해제 시도', 'DRM 보안 해제 시도 탐지', 'Data Leak', 'CRITICAL', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('47fa1301-55c4-4327-ae40-4736c67faf37', '16a3f897-3c44-46b8-8e36-ea8d679639e0', 'eventName', 'drm', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c648367f-b8cf-4418-9781-7054eee2775c', '16a3f897-3c44-46b8-8e36-ea8d679639e0', 'eventName', 'decrypt', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [81] USB 매체 접근 차단
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('709ddbde-5332-4c95-a7c3-3086c8f97a66', 'USB 매체 접근 차단', 'USB 보안 매체제어 차단 이벤트', 'Data Leak', 'HIGH', '4', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7715bc4d-a19c-4335-a57e-573349c1ce71', '709ddbde-5332-4c95-a7c3-3086c8f97a66', 'eventName', 'usb', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('14aee738-dd3b-4dd5-9210-976d9747af63', '709ddbde-5332-4c95-a7c3-3086c8f97a66', 'deviceAction', 'block', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [82] USB 비인가 장치 연결
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('c13cf888-f776-4227-a48f-ac98832afea2', 'USB 비인가 장치 연결', '비인가 USB 장치 연결 시도', 'Policy Violation', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('87a05d77-7f6b-4141-aaf8-bd1790be740f', 'c13cf888-f776-4227-a48f-ac98832afea2', 'eventName', 'usb', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('9b91d294-8973-4e45-ab38-9908a4fe4350', 'c13cf888-f776-4227-a48f-ac98832afea2', 'eventName', 'unauthorized', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [83] 서버접근제어 비인가 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('97341b29-ae32-41cd-90e3-c640183c309b', '서버접근제어 비인가 접근', '서버접근제어 비인가 접근 시도 차단', 'Unauthorized Access', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7f47cb79-edff-4b8c-b650-d9e3558b06e7', '97341b29-ae32-41cd-90e3-c640183c309b', 'eventName', 'serveraccess', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0b16b88f-f632-4087-9156-21be2aeb7e98', '97341b29-ae32-41cd-90e3-c640183c309b', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [84] 서버접근제어 접근 성공 감사
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('ce4ea48b-310e-44fb-bff4-92fa929a1d41', '서버접근제어 접근 성공 감사', '서버접근제어 허용 접근 기록', 'Monitoring', 'INFO', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('96ea17c4-b8b7-4588-899f-43ecb186f988', 'ce4ea48b-310e-44fb-bff4-92fa929a1d41', 'eventName', 'serveraccess', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b086b373-aee2-41d9-8bdd-3e0f33249a21', 'ce4ea48b-310e-44fb-bff4-92fa929a1d41', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [85] 스팸메일 대량 유입
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('471f7cf2-7f13-47cf-9f23-9f7bfa7a1cf2', '스팸메일 대량 유입', '스팸메일 차단 10분 내 50건 이상', 'Spam', 'MEDIUM', '1', 'security', true, 'destinationIp', 50, 'minute', 10, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0046305c-914c-4e2b-a008-1406c1d02007', '471f7cf2-7f13-47cf-9f23-9f7bfa7a1cf2', 'eventName', 'spam', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ac74f88a-0c32-4bf5-855d-7d74f529744c', '471f7cf2-7f13-47cf-9f23-9f7bfa7a1cf2', 'deviceAction', 'block', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [86] 오피스키퍼 정보유출 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('2670b4d2-5028-4212-85d1-69ce81db9ba6', '오피스키퍼 정보유출 탐지', '오피스키퍼 정보유출 방지 이벤트', 'Data Leak', 'HIGH', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('a10023ac-008b-4442-b4d2-671e68162d59', '2670b4d2-5028-4212-85d1-69ce81db9ba6', 'eventName', 'officekeeper', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('7b2d277e-4359-43a4-abcd-72110853a1b5', '2670b4d2-5028-4212-85d1-69ce81db9ba6', 'deviceAction', 'block', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [87] 오피스키퍼 파일 반출 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('07dbccd0-a033-47a5-9abe-50778e25d3cc', '오피스키퍼 파일 반출 시도', '오피스키퍼 파일 외부 반출 시도 탐지', 'Data Leak', 'CRITICAL', '4', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('cfbe77df-734d-4195-84de-e2e008a6829f', '07dbccd0-a033-47a5-9abe-50778e25d3cc', 'eventName', 'officekeeper', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('791a407d-8921-40ff-af88-880662742f6c', '07dbccd0-a033-47a5-9abe-50778e25d3cc', 'eventName', 'export', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [88] 전자결재 비정상 접근
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('23be709b-1afb-4c50-9944-0462c3b19259', '전자결재 비정상 접근', '전자결재 시스템 비정상 접근 시도', 'Unauthorized Access', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('eb9e23a2-80ee-4ab2-b201-2417bab5ba3e', '23be709b-1afb-4c50-9944-0462c3b19259', 'eventName', 'approval', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4c3c4e5f-7ccc-414e-ab2e-f79616b73368', '23be709b-1afb-4c50-9944-0462c3b19259', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [89] 스팸메일 피싱 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('b454ab26-ddbe-4448-bbff-18075450e85b', '스팸메일 피싱 탐지', '피싱 키워드 포함 메일 차단', 'Phishing', 'HIGH', '1', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('e4e57ed4-67a0-48f7-b8b6-8e66fc75dcb0', 'b454ab26-ddbe-4448-bbff-18075450e85b', 'eventName', 'spam', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('2c2c9b8f-34d4-4ad5-8074-0e1a60bc3713', 'b454ab26-ddbe-4448-bbff-18075450e85b', 'message', 'phishing', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [90] 다산 스위치 설정 변경
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('fb322d75-9175-4b64-a8a1-fe96ee65258d', '다산 스위치 설정 변경', '네트워크 스위치 설정 변경 이벤트', 'Configuration Change', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('1ed62ac8-d849-491d-b2d7-b2277f3cbd52', 'fb322d75-9175-4b64-a8a1-fe96ee65258d', 'device', 'switch', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('6439d5a0-46ca-4027-88f6-16c9bc6e4c51', 'fb322d75-9175-4b64-a8a1-fe96ee65258d', 'eventName', 'config', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [91] DNS 터널링 의심 (대량 DNS 쿼리)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('d12a432b-586b-4ccc-88e8-2effab774359', 'DNS 터널링 의심 (대량 DNS 쿼리)', '동일 출발지에서 5분 내 100회 이상 DNS 쿼리', 'Data Exfiltration', 'HIGH', '4', 'security', true, 'sourceIp', 100, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('91f328ee-7a2d-48f9-a9d3-1588ce2f7fb6', 'd12a432b-586b-4ccc-88e8-2effab774359', 'destinationPort', '53', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [92] 외부 대량 데이터 전송
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('0abdc61e-e7d5-43d7-a994-e1e8926a84d3', '외부 대량 데이터 전송', '내부에서 외부로 대량 데이터 전송 의심', 'Data Exfiltration', 'HIGH', '4', 'security', true, 'sourceIp', 100, 'minute', 10, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('4bbcff93-ba66-46cf-92f5-f368abc03a09', '0abdc61e-e7d5-43d7-a994-e1e8926a84d3', 'sourceIp', '10.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('9046bf4d-027e-480a-b4e6-0ee1f309de95', '0abdc61e-e7d5-43d7-a994-e1e8926a84d3', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [93] 비정상 프로토콜 사용 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('2e76acc5-6a39-4c11-86fd-9f648ab3d1bf', '비정상 프로토콜 사용 탐지', 'UDP 고포트에서 비정상 프로토콜 사용', 'C2 Communication', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('320d7338-f1ca-407b-a6db-6307f24d136e', '2e76acc5-6a39-4c11-86fd-9f648ab3d1bf', 'protocol', 'UDP', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('5083b663-e7b2-471e-b3ae-c1c714c3c41e', '2e76acc5-6a39-4c11-86fd-9f648ab3d1bf', 'destinationPort', '10000', 'GTE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [94] 수평 스캔 탐지 (동일 포트, 다수 목적지)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('e3b1e454-3c56-432e-b37c-8bf9959e6a2b', '수평 스캔 탐지 (동일 포트, 다수 목적지)', '동일 출발지에서 동일 포트로 5분 내 20개 이상 목적지 접근', 'Scanning', 'HIGH', '1', 'security', true, 'sourceIp', 20, 'minute', 5, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('088457ba-35de-4e51-90d1-27484f23594e', 'e3b1e454-3c56-432e-b37c-8bf9959e6a2b', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [95] 횡이동 탐지 (내부 → 내부 다수 접근)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('ab39efa4-4ce3-4083-a342-8bcf12dac253', '횡이동 탐지 (내부 → 내부 다수 접근)', '내부 IP에서 5분 내 10개 이상 내부 목적지 접근', 'Lateral Movement', 'CRITICAL', '3', 'security', true, 'sourceIp', 10, 'minute', 5, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('3bd52db7-8339-4d9b-9dac-091bedec6bf8', 'ab39efa4-4ce3-4083-a342-8bcf12dac253', 'sourceIp', '10.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('daeffe52-cbf5-4aad-82f6-6f734705b8b9', 'ab39efa4-4ce3-4083-a342-8bcf12dac253', 'destinationIp', '10.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [96] C2 비콘 통신 의심 (주기적 접속)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('00215bbc-4f5a-4ace-b17b-47ac106c3141', 'C2 비콘 통신 의심 (주기적 접속)', '동일 목적지로 30분 내 10회 이상 주기적 접속', 'C2 Communication', 'HIGH', '3', 'security', true, 'destinationIp', 10, 'minute', 30, true, 'HIGH', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('8608d24c-6d33-416d-9f16-366447338e77', '00215bbc-4f5a-4ace-b17b-47ac106c3141', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [97] Tor 출구 노드 접속 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('a0cca65b-6097-4cc2-aba7-fe5632c2ed61', 'Tor 출구 노드 접속 탐지', 'Tor 네트워크 관련 접속 시도', 'Anonymization', 'HIGH', '4', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('00a5c469-2a8e-403c-be42-db7b9cbf3964', 'a0cca65b-6097-4cc2-aba7-fe5632c2ed61', 'destinationPort', '9001', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [98] 외부 프록시 접속 탐지 (8080)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('6c3e5d4d-fc67-4495-bd7f-7db229cde6ba', '외부 프록시 접속 탐지 (8080)', '외부 프록시 포트 8080으로의 아웃바운드 트래픽', 'Evasion', 'MEDIUM', '4', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('db129a3a-037a-42d1-afb5-f564d4ea793b', '6c3e5d4d-fc67-4495-bd7f-7db229cde6ba', 'destinationPort', '8080', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('0072d242-015b-45c5-82d9-90a949b6ccfb', '6c3e5d4d-fc67-4495-bd7f-7db229cde6ba', 'deviceAction', 'permit', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [99] IRC 포트 접속 탐지 (6667)
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('9fc5b0d7-821d-4053-9b2f-5b85892bbea4', 'IRC 포트 접속 탐지 (6667)', 'IRC 포트 6667 접속 (봇넷 C2 의심)', 'C2 Communication', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('27419534-89cb-4a63-aba1-eec1e2ded22a', '9fc5b0d7-821d-4053-9b2f-5b85892bbea4', 'destinationPort', '6667', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [100] 결제 네트워크 비정상 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('278a2dbc-6bfa-46f7-a623-6e21762945b1', '결제 네트워크 비정상 트래픽', '결제 시스템 네트워크 대역에서 비정상 트래픽 패턴', 'Anomaly', 'CRITICAL', '3', 'security', true, 'sourceIp', 10, 'minute', 5, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('56ba4c5f-30f3-4851-835a-fee5de349f7d', '278a2dbc-6bfa-46f7-a623-6e21762945b1', 'destinationIp', '10.231.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('db41fe74-6266-4f3b-b383-0c5c34e9dc51', '278a2dbc-6bfa-46f7-a623-6e21762945b1', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [101] SIEM 서버 비인가 접근 시도
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('21bcac26-0beb-453a-96e8-bc2a2c1bf1d2', 'SIEM 서버 비인가 접근 시도', 'SIEM 서버로의 비인가 접근 시도 탐지', 'Unauthorized Access', 'CRITICAL', '3', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('f85348dd-7479-41a4-abbb-fb25b19c560f', '21bcac26-0beb-453a-96e8-bc2a2c1bf1d2', 'eventName', 'siem', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('65cffcfc-7acf-4a96-b2cc-ff3b270915de', '21bcac26-0beb-453a-96e8-bc2a2c1bf1d2', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [102] 내부 IP 스푸핑 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('c2f546c7-cb6e-4450-b3b4-c771b1ffdb1a', '내부 IP 스푸핑 탐지', '외부에서 내부 IP 대역을 출발지로 사용한 트래픽', 'Spoofing', 'CRITICAL', '1', 'security', true, NULL, NULL, NULL, NULL, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('b70fd0cc-4a77-437c-bccd-5d799d2e62ad', 'c2f546c7-cb6e-4450-b3b4-c771b1ffdb1a', 'sourceIp', '10.', 'WILDCARD', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('babfe5be-155c-4052-9261-33304142f9c6', 'c2f546c7-cb6e-4450-b3b4-c771b1ffdb1a', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [103] 대량 ICMP 리다이렉트
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('bbcc8970-8738-42bd-9517-a4b742bd2586', '대량 ICMP 리다이렉트', 'ICMP 리다이렉트 메시지 대량 발생 (MITM 의심)', 'Man-in-the-Middle', 'HIGH', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('22488d3c-84ad-4fde-9440-a954df3905e0', 'bbcc8970-8738-42bd-9517-a4b742bd2586', 'protocol', 'ICMP', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('ffa31dca-6463-4c06-bda4-1c047157479e', 'bbcc8970-8738-42bd-9517-a4b742bd2586', 'eventName', 'redirect', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [104] 비정상 GRE 터널 트래픽
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('b5d1a82e-c33c-479e-9a77-7c7900df6df4', '비정상 GRE 터널 트래픽', 'GRE 프로토콜 터널 트래픽 탐지', 'Evasion', 'MEDIUM', '3', 'security', true, NULL, NULL, NULL, NULL, false, 'MEDIUM', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('84acd78c-3108-49b6-ac73-a2b0d756a8f0', 'b5d1a82e-c33c-479e-9a77-7c7900df6df4', 'protocol', 'GRE', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- [105] SYN Flood 탐지
INSERT INTO rules (uuid, name, description, attack_type, severity, phase, log_type, is_detection_active, standard_field, standard_field_count, interval_unit, interval_value, auto_create_ticket, ticket_priority, created_by, created_time_at, updated_time_at)
VALUES ('485fab43-64b8-4be2-a8ef-e8bd3ea7ec52', 'SYN Flood 탐지', '동일 출발지에서 1분 내 200회 이상 SYN 패킷', 'DoS', 'CRITICAL', '1', 'security', true, 'sourceIp', 200, 'minute', 1, true, 'CRITICAL', 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('452876a2-2bcd-4d34-8f37-feb4873f69a9', '485fab43-64b8-4be2-a8ef-e8bd3ea7ec52', 'protocol', 'TCP', 'EQUAL', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO rule_conditions (uuid, rule_id, key, value, method, ti_type, is_exclude, created_by, created_time_at, updated_time_at)
VALUES ('c173afdf-88e2-42d0-90a4-7f82b51664ed', '485fab43-64b8-4be2-a8ef-e8bd3ea7ec52', 'deviceAction', 'deny', 'INCLUDE', NULL, false, 'KOVAN_IMPORT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 총 105개 규칙 생성 완료