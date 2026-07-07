-- ============================================================
-- EDIM 런타임 검증 — 슬라이드 36 실데이터 기반
-- 1) BOM 재귀 전개 (Part List Running Test 재현)
-- 2) v0.3/v0.4 제약 동작 (위반 → 오류 발생 확인)
-- 3) row_key_num 범위 조회 (VARCHAR 결함 대비 증명)
-- ============================================================
\set ON_ERROR_STOP off

-- ---------- 기초 데이터 ----------
INSERT INTO sys_tenant (tenant_code, tenant_name) VALUES ('NOVA-DEMO', '데모 테넌트');
INSERT INTO sys_user (tenant_id, login_id, user_name, password_hash, user_level)
VALUES (1, 'admin', '관리자', 'x', 'ADMIN'), (1, 'setup1', '설정자', 'x', 'SETUP');

INSERT INTO code_group (tenant_id, group_code, group_name, group_type, hierarchy_address, approval_status)
VALUES (1, 'COP', 'Fan Centrifugal Casing', 'PRODUCT', '/CODE/PRODUCT/FAN/CENTRIFUGAL/CASING', 'APPROVED');

-- 슬라이드 36: Mother KDCR 3-13 + Child 5종
INSERT INTO product_code (tenant_id, main_code, group_id, code_name, hierarchy_address, approval_status) VALUES
 (1, 'KDCR 3-13', 1, 'Double Suction casing with reinforced frame', '/P/KDCR', 'APPROVED'),  -- id 1
 (1, 'KDP 1-21',  1, 'Fan bearing Frame R', '/P/KDP21', 'APPROVED'),                          -- id 2
 (1, 'KDP 1-22',  1, 'Fan bearing Frame L', '/P/KDP22', 'APPROVED'),                          -- id 3
 (1, 'KDC 1',     1, 'Casing', '/P/KDC1', 'APPROVED'),                                        -- id 4
 (1, 'KDC 20',    1, 'Inlet-Cone With FF', '/P/KDC20', 'APPROVED'),                           -- id 5
 (1, 'KDC 21',    1, 'Inlet-Cone W/O FF', '/P/KDC21', 'APPROVED'),                            -- id 6
 (1, 'KDP 9',     1, 'Casing Rib (손자)', '/P/KDP9', 'APPROVED');                             -- id 7

INSERT INTO code_relationship (tenant_id, mother_code_id, child_code_id, quantity, remarks, sort_order, approval_status) VALUES
 (1, 1, 2, 1, 'Reverse Bending R',  1, 'APPROVED'),   -- rel 1
 (1, 1, 3, 1, 'Reverse Bending L',  2, 'APPROVED'),   -- rel 2
 (1, 1, 4, 1, 'Pittsburgh seaming', 3, 'APPROVED'),   -- rel 3
 (1, 1, 5, 2, 'With FF',            4, 'APPROVED'),   -- rel 4
 (1, 1, 6, 2, 'W/O FF',             5, 'APPROVED'),   -- rel 5
 (1, 4, 7, 4, '손자 — 재귀 검증',    1, 'APPROVED');   -- rel 6 (KDC 1 → KDP 9)

-- Slot 매핑: Child는 Mother의 B(Size)·E(FF)를 상속, KDC 20은 E 고정
INSERT INTO code_relationship_slot_map (rel_id, child_slot, mother_slot, fixed_value) VALUES
 (1,'B','B',NULL),(1,'E','E',NULL),
 (2,'B','B',NULL),(2,'E','E',NULL),
 (3,'B','C',NULL),(3,'E','E',NULL),          -- Casing은 Mother C를 B로 상속
 (4,'B','B',NULL),(4,'E',NULL,'15'),         -- 고정값
 (5,'B','B',NULL),(5,'E','E',NULL),
 (6,'B','B',NULL);

\echo ''
\echo '===== [T1] BOM 재귀 전개 — Mother slots {B:13, C:32, E:15} ====='
WITH RECURSIVE expand AS (
  SELECT pc.product_code_id, pc.main_code, 0 AS lvl,
         '{"B":"13","C":"32","E":"15"}'::jsonb AS slots, 1::numeric AS qty,
         pc.main_code::text AS path
  FROM product_code pc WHERE pc.main_code = 'KDCR 3-13' AND pc.tenant_id = 1
  UNION ALL
  SELECT c.product_code_id, c.main_code, e.lvl + 1,
         COALESCE((SELECT jsonb_object_agg(sm.child_slot, COALESCE(sm.fixed_value, e.slots ->> sm.mother_slot))
                   FROM code_relationship_slot_map sm WHERE sm.rel_id = r.rel_id), '{}'::jsonb),
         e.qty * r.quantity,
         e.path || ' > ' || c.main_code
  FROM expand e
  JOIN code_relationship r ON r.mother_code_id = e.product_code_id AND r.approval_status = 'APPROVED'
  JOIN product_code c ON c.product_code_id = r.child_code_id
)
SELECT lvl, main_code,
       main_code || '-' || COALESCE(slots->>'B','') || '-' || COALESCE(slots->>'E','') AS resolved_code,
       qty, path
FROM expand ORDER BY lvl, main_code;

\echo ''
\echo '===== [T2] row_key_num 범위 조회 — Macro Table12(10:25) ====='
INSERT INTO tbl_data_table (tenant_id, table_name, table_type, hierarchy_address, column_def, approval_status)
VALUES (1, 'Table12', 'VARIANT', '/T/12', '{"cols":["E"]}', 'APPROVED');
INSERT INTO tbl_data_row (table_id, row_key, row_key_num, row_values) VALUES
 (1,'5',5,'{"E":50}'), (1,'10',10,'{"E":100}'), (1,'17',17,'{"E":170}'),
 (1,'25',25,'{"E":250}'), (1,'560',560,'{"E":5600}'), (1,'1000',1000,'{"E":10000}');

\echo '--- (결함 재현) VARCHAR 사전순 BETWEEN — 1000이 잘못 포함됨:'
SELECT row_key FROM tbl_data_row WHERE table_id=1 AND row_key BETWEEN '10' AND '25' ORDER BY row_key;
\echo '--- (v0.3 수정) row_key_num BETWEEN 10 AND 25 — 정확히 10·17·25:'
SELECT row_key, (row_values->>'E')::int AS e FROM tbl_data_row
WHERE table_id=1 AND row_key_num BETWEEN 10 AND 25 ORDER BY row_key_num;

\echo ''
\echo '===== [T3] 제약 동작 검증 (위반 → 오류가 나야 정상) ====='
\echo '--- T3a 중복 PENDING 승인 (uq_approval_pending):'
INSERT INTO sys_approval_request (tenant_id, target_table, target_id, request_type, requester_id)
VALUES (1, 'product_code', 1, 'UPDATE', 2);
INSERT INTO sys_approval_request (tenant_id, target_table, target_id, request_type, requester_id)
VALUES (1, 'product_code', 1, 'UPDATE', 2);  -- 기대: unique violation

\echo '--- T3b 단가 적용기간 중복 (ex_price_overlap):'
INSERT INTO cst_price (tenant_id, product_code_id, price_source, supplier_id, price, valid_from, valid_to)
VALUES (1, 2, 'QUOTE', NULL, 450000, '2026-06-01', NULL);
INSERT INTO cst_price (tenant_id, product_code_id, price_source, supplier_id, price, valid_from, valid_to)
VALUES (1, 2, 'QUOTE', NULL, 460000, '2026-07-01', NULL);  -- 기대: exclusion violation

\echo '--- T3c 치수 바인딩 XOR (ck_dim_binding) — 둘 다 NULL:'
INSERT INTO dwg_drawing (tenant_id, drawing_no, drawing_name, drawing_type)
VALUES (1, 'KDCR 3-13', 'Casing DWG', 'ASSEMBLY');
INSERT INTO dwg_dimension (tenant_id, drawing_id, dim_label) VALUES (1, 1, 'A');  -- 기대: check violation

\echo '--- T3d Slot 매핑 XOR (ck_slot_source) — 둘 다 지정:'
INSERT INTO code_relationship_slot_map (rel_id, child_slot, mother_slot, fixed_value)
VALUES (1, 'Z', 'B', '99');  -- 기대: check violation

\echo '--- T3e 대체 자기참조 (dwg_supersedure CHECK):'
INSERT INTO dwg_supersedure (tenant_id, old_drawing_id, new_drawing_id, superseded_date)
VALUES (1, 1, 1, CURRENT_DATE);  -- 기대: check violation

\echo '--- T3f doc_control 버전 이력 — 같은 doc_no 두 버전 (성공해야 정상):'
INSERT INTO doc_control (tenant_id, doc_no, title, doc_type, version, person) VALUES
 (1, 'DF 342-234 E', 'Density 계산서', 'TECH_REPORT', 'KD-0.1', 'Kim'),
 (1, 'DF 342-234 E', 'Density 계산서', 'TECH_REPORT', 'KD-0.2', 'Kim');
SELECT doc_no, version, released_status FROM doc_control ORDER BY version;

\echo ''
\echo '===== [T4] Project Folder 조회 경로 (v0.4 dwg_file) ====='
INSERT INTO com_company (tenant_id, company_type, company_name) VALUES (1,'CUSTOMER','Micron');
INSERT INTO prj_project (tenant_id, project_no, project_name, customer_id) VALUES (1,'PS-61313-5','Micron #7',1);
INSERT INTO dwg_file (tenant_id, project_id, folder, file_name, file_type, file_path) VALUES
 (1, 1, 'BOM',   'bom.xlsx',       'XLSX', '/edim/PS-61313-5/BOM/bom.xlsx'),
 (1, 1, 'DWG',   'approval.pdf',   'PDF',  '/edim/PS-61313-5/DWG/approval.pdf'),
 (1, 1, 'PRICE', 'quotation.pdf',  'PDF',  '/edim/PS-61313-5/PRICE/quotation.pdf');
SELECT folder, file_name FROM dwg_file WHERE project_id = 1 AND folder = 'DWG';

\echo ''
\echo '===== 검증 종료 ====='
