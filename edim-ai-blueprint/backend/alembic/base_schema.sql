-- ============================================================
-- EDIM Schema DDL — PostgreSQL 16
-- 원천: EDIM_DB_정의서.md v0.5 (54 테이블 — i18n 포함)
-- 검증: docs/ddl/verify_runtime.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------- 감사 컬럼 매크로 주석 ----------
-- [공통] = tenant_id BIGINT NOT NULL (sys_tenant 논리 FK)
--        + created_by/created_at/updated_by/updated_at
-- 자식 테이블(v0.4 정책)은 tenant_id 생략

-- ============================================================
-- 3. 시스템 공통 — sys_
-- ============================================================
CREATE TABLE sys_tenant (
  tenant_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_code  VARCHAR(30)  NOT NULL UNIQUE,
  tenant_name  VARCHAR(200) NOT NULL,
  plan         VARCHAR(20)  NOT NULL DEFAULT 'SAAS',
  status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  settings     JSONB,
  created_by   VARCHAR(50)  NOT NULL DEFAULT 'system',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by   VARCHAR(50),
  updated_at   TIMESTAMPTZ
);

CREATE TABLE sys_user (
  user_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT       NOT NULL,
  login_id      VARCHAR(50)  NOT NULL,
  user_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(200),
  password_hash VARCHAR(200) NOT NULL,
  department    VARCHAR(50),
  user_level    VARCHAR(20)  NOT NULL CHECK (user_level IN ('PLATFORM','ADMIN','SETUP','GENERAL')),
  status        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, login_id)                                    -- v0.3 F6
);

CREATE TABLE sys_role (
  role_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  role_name  VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, role_name)
);

CREATE TABLE sys_user_role (
  user_role_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES sys_user,
  role_id BIGINT NOT NULL REFERENCES sys_role,
  UNIQUE (user_id, role_id)
);

CREATE TABLE sys_role_permission (
  permission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role_id       BIGINT NOT NULL REFERENCES sys_role,
  resource_type VARCHAR(30) NOT NULL,
  resource_key  VARCHAR(200) NOT NULL,
  action        VARCHAR(20) NOT NULL
);

CREATE TABLE sys_hierarchy (
  hierarchy_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  parent_id    BIGINT REFERENCES sys_hierarchy,
  tree_type    VARCHAR(20) NOT NULL CHECK (tree_type IN ('PRODUCT','GENERAL_DB','CONFIG')),
  node_name    VARCHAR(100) NOT NULL,
  symbol       VARCHAR(50),
  address      VARCHAR(500) NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  remarks      VARCHAR(500),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, address),
  UNIQUE (parent_id, node_name)                                   -- v0.4 R7
);

CREATE TABLE sys_approval_request (
  approval_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  target_table VARCHAR(60) NOT NULL,
  target_id    BIGINT NOT NULL,
  request_type VARCHAR(20) NOT NULL,
  step         VARCHAR(20) NOT NULL DEFAULT 'WRITE',
  requester_id BIGINT NOT NULL REFERENCES sys_user,
  approver_id  BIGINT REFERENCES sys_user,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at   TIMESTAMPTZ,
  result       VARCHAR(20),
  comment      VARCHAR(1000),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);
CREATE INDEX ix_sys_approval_target   ON sys_approval_request (target_table, target_id);
CREATE INDEX ix_sys_approval_approver ON sys_approval_request (approver_id, result);
CREATE UNIQUE INDEX uq_approval_pending                            -- v0.4 R3
  ON sys_approval_request (tenant_id, target_table, target_id) WHERE result IS NULL;

CREATE TABLE sys_history (
  history_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  target_table VARCHAR(60) NOT NULL,
  target_id    BIGINT NOT NULL,
  action       VARCHAR(20) NOT NULL,
  actor_id     BIGINT NOT NULL REFERENCES sys_user,
  acted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  before_data  JSONB,
  after_data   JSONB
);
CREATE INDEX ix_sys_history_target ON sys_history (target_table, target_id, acted_at);  -- v0.4 R4

CREATE TABLE sys_notification (
  notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  user_id     BIGINT NOT NULL REFERENCES sys_user,
  notify_type VARCHAR(30) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  link_url    VARCHAR(500),
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 9(선행). 마스터 — com_ / prj_ / mat_
-- ============================================================
CREATE TABLE com_company (
  company_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  company_type VARCHAR(20) NOT NULL CHECK (company_type IN ('CUSTOMER','SUPPLIER','PARTNER','BANK')),
  company_name VARCHAR(200) NOT NULL,
  nation       VARCHAR(50),
  biz_reg_no   VARCHAR(30),
  contacts     JSONB,
  evaluation_grade VARCHAR(10),
  payment_terms VARCHAR(200),
  remarks      VARCHAR(500),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE prj_project (
  project_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  project_no   VARCHAR(30) NOT NULL,
  project_name VARCHAR(200) NOT NULL,
  customer_id  BIGINT REFERENCES com_company,
  project_type VARCHAR(50),
  sales_stage  VARCHAR(30) NOT NULL DEFAULT 'TECH_PROPOSAL'
    CHECK (sales_stage IN ('TECH_PROPOSAL','QUOTE','NEGOTIATION','CONTRACT','CONTRACT_CHANGE','CLOSED')),
  start_date DATE, due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  manager_id BIGINT REFERENCES sys_user,
  client_contact VARCHAR(200),
  pain_point TEXT,
  note VARCHAR(1000),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, project_no)
);

CREATE TABLE mat_material (
  material_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  material_code VARCHAR(30) NOT NULL,
  material_name VARCHAR(100) NOT NULL,
  material_type VARCHAR(20) NOT NULL,
  density       NUMERIC(10,3),
  standard      VARCHAR(30),
  hazard_class  VARCHAR(30),                                       -- v0.2
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, material_code)
);

-- ============================================================
-- 6(선행). Table / Toolbox — tbl_ / tbx_
-- ============================================================
CREATE TABLE tbl_data_table (
  table_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  table_type VARCHAR(20) NOT NULL CHECK (table_type IN ('VARIANT','TECH','MATERIAL','STD','GENERATED')),
  department VARCHAR(50),
  hierarchy_address VARCHAR(500) NOT NULL,
  column_def JSONB NOT NULL,
  description VARCHAR(500),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, table_name)
);

CREATE TABLE tbl_data_row (                                        -- 자식: tenant 생략
  row_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_id    BIGINT NOT NULL REFERENCES tbl_data_table,
  row_key     VARCHAR(50) NOT NULL,
  row_key_num NUMERIC(18,4),                                       -- v0.3 F2
  row_values  JSONB NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE (table_id, row_key)
);
CREATE INDEX ix_tbl_row_table ON tbl_data_row (table_id);
CREATE INDEX ix_tbl_row_num   ON tbl_data_row (table_id, row_key_num);   -- v0.3 F2
CREATE INDEX ix_tbl_row_gin   ON tbl_data_row USING gin (row_values);

CREATE TABLE tbx_macro (
  macro_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  macro_name VARCHAR(100) NOT NULL,
  version    INT NOT NULL DEFAULT 1,
  prompt_text TEXT, macro_expr TEXT, flowchart_def JSONB, description_text TEXT, code_text TEXT,
  apply_type VARCHAR(10) NOT NULL DEFAULT 'MACRO' CHECK (apply_type IN ('MACRO','CODING')),
  test_input JSONB, test_result JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','TESTED','PENDING','APPROVED')),
  hierarchy_address VARCHAR(500),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, macro_name, version)
);

CREATE TABLE tbx_macro_ref (                                       -- 자식
  ref_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  macro_id      BIGINT NOT NULL REFERENCES tbx_macro,
  ref_type      VARCHAR(20) NOT NULL,
  ref_target_id BIGINT NOT NULL
);

CREATE TABLE tbx_ui_form (
  form_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  form_name  VARCHAR(100) NOT NULL,
  form_type  VARCHAR(30) NOT NULL,
  version    INT NOT NULL DEFAULT 1,
  layout_def JSONB NOT NULL,
  hierarchy_address VARCHAR(500),
  head_key   VARCHAR(50),                                          -- v0.2
  is_system  BOOLEAN NOT NULL DEFAULT false,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE tbx_templet (
  templet_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  templet_name VARCHAR(100) NOT NULL,
  templet_type VARCHAR(30) NOT NULL,
  definition   JSONB NOT NULL,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

-- ============================================================
-- 5(선행). 도면 헤더 — dwg_drawing (product_code가 참조)
-- ============================================================
CREATE TABLE dwg_drawing (
  drawing_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  project_id  BIGINT REFERENCES prj_project,
  drawing_no  VARCHAR(50) NOT NULL,
  drawing_name VARCHAR(200) NOT NULL,
  drawing_type VARCHAR(20) NOT NULL CHECK (drawing_type IN ('ASSEMBLY','PART','LAYOUT')),
  dwg_kind    VARCHAR(20) NOT NULL DEFAULT 'STANDARD' CHECK (dwg_kind IN ('APPROVAL','MANUFACTURING','STANDARD')),
  scale VARCHAR(10), size VARCHAR(5),
  current_rev VARCHAR(5) NOT NULL DEFAULT 'A',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','APPROVED','RELEASED')),
  source VARCHAR(20) NOT NULL DEFAULT 'EDIM',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, drawing_no)
);
CREATE INDEX ix_dwg_drawing_project ON dwg_drawing (project_id);
CREATE INDEX ix_dwg_drawing_status  ON dwg_drawing (status);

-- ============================================================
-- 4. RCCS 코드 — code_
-- ============================================================
CREATE TABLE code_group (
  group_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  BIGINT NOT NULL,
  group_code VARCHAR(20) NOT NULL,
  group_name VARCHAR(100) NOT NULL,
  group_type VARCHAR(20) NOT NULL CHECK (group_type IN ('SPECIFICATION','RAW_MATERIAL','GPI','PRODUCT')),
  hierarchy_address VARCHAR(500) NOT NULL,
  description VARCHAR(500),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, group_code)
);

CREATE TABLE code_item (
  item_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  group_id  BIGINT NOT NULL REFERENCES code_group,
  item_slot VARCHAR(5) NOT NULL,
  item_name VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  sort_order INT NOT NULL DEFAULT 0,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (group_id, item_slot)
);

CREATE TABLE code_item_value (
  value_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  item_id   BIGINT NOT NULL REFERENCES code_item,
  value_code VARCHAR(30) NOT NULL,
  value_name VARCHAR(100),
  ref_table_id BIGINT REFERENCES tbl_data_table,
  description VARCHAR(500),
  sort_order INT NOT NULL DEFAULT 0,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (item_id, value_code)
);

CREATE TABLE product_code (
  product_code_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  main_code VARCHAR(50) NOT NULL,
  group_id  BIGINT NOT NULL REFERENCES code_group,
  code_name VARCHAR(200) NOT NULL,
  hierarchy_address VARCHAR(500) NOT NULL,
  base_drawing_id BIGINT REFERENCES dwg_drawing,
  description VARCHAR(500),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, main_code)
);

CREATE TABLE product_code_item (                                   -- 자식
  pc_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_code_id BIGINT NOT NULL REFERENCES product_code,
  item_slot VARCHAR(5) NOT NULL,
  source_item_id BIGINT NOT NULL REFERENCES code_item,
  is_required BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (product_code_id, item_slot)
);

CREATE TABLE code_relationship (
  rel_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  mother_code_id BIGINT NOT NULL REFERENCES product_code,
  child_code_id  BIGINT NOT NULL REFERENCES product_code,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  remarks VARCHAR(300),
  sort_order INT NOT NULL DEFAULT 0,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);
CREATE INDEX ix_code_rel_mother ON code_relationship (mother_code_id);
CREATE INDEX ix_code_rel_child  ON code_relationship (child_code_id);

CREATE TABLE code_relationship_slot_map (                          -- v0.3 F5, 자식
  slot_map_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rel_id      BIGINT NOT NULL REFERENCES code_relationship,
  child_slot  VARCHAR(5) NOT NULL,
  mother_slot VARCHAR(5),
  fixed_value VARCHAR(30),
  UNIQUE (rel_id, child_slot),
  CONSTRAINT ck_slot_source CHECK ((mother_slot IS NULL) <> (fixed_value IS NULL))
);

CREATE TABLE arrangement_code (
  arrangement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  arrangement_code VARCHAR(50) NOT NULL,
  arrangement_name VARCHAR(200) NOT NULL,
  product_family VARCHAR(50) NOT NULL,
  direction_option VARCHAR(200),
  install_option VARCHAR(200),
  base_drawing_id BIGINT REFERENCES dwg_drawing,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, arrangement_code)
);

CREATE TABLE arrangement_component (                               -- 자식
  component_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  arrangement_id BIGINT NOT NULL REFERENCES arrangement_code,
  product_code_id BIGINT NOT NULL REFERENCES product_code,
  position_key VARCHAR(30),
  join_macro_id BIGINT REFERENCES tbx_macro,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0
);

-- ============================================================
-- 5. 도면/PLM 나머지 — dwg_ / prt_
-- ============================================================
CREATE TABLE dwg_revision (                                        -- 자식
  revision_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  drawing_id  BIGINT NOT NULL REFERENCES dwg_drawing,
  rev_no      VARCHAR(5) NOT NULL,
  rev_date    DATE NOT NULL,
  rev_reason  VARCHAR(500),
  rev_content TEXT,
  revised_by  VARCHAR(50) NOT NULL,
  UNIQUE (drawing_id, rev_no)
);

CREATE TABLE dwg_document (
  document_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  drawing_id  BIGINT NOT NULL REFERENCES dwg_drawing,
  revision_id BIGINT REFERENCES dwg_revision,
  block_name  VARCHAR(100),
  content     JSONB NOT NULL,
  origin_x NUMERIC(14,4), origin_y NUMERIC(14,4),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE prt_part (
  part_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  part_no VARCHAR(50) NOT NULL,
  part_name VARCHAR(200) NOT NULL,
  specification VARCHAR(300),
  material_id BIGINT REFERENCES mat_material,
  product_code_id BIGINT REFERENCES product_code,
  unit VARCHAR(10) NOT NULL DEFAULT 'EA',
  weight NUMERIC(12,3),
  supplier_id BIGINT REFERENCES com_company,
  is_standard BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, part_no)
);

CREATE TABLE dwg_bom (                                             -- 자식
  bom_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  drawing_id BIGINT NOT NULL REFERENCES dwg_drawing,
  part_id    BIGINT NOT NULL REFERENCES prt_part,
  item_no    INT NOT NULL,
  quantity   NUMERIC(12,3) NOT NULL DEFAULT 1,
  assembly_seq INT,
  assembly_note VARCHAR(500),
  note VARCHAR(300),
  UNIQUE (drawing_id, item_no)
);

CREATE TABLE dwg_approval (                                        -- 자식
  approval_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  drawing_id  BIGINT NOT NULL REFERENCES dwg_drawing,
  revision_id BIGINT REFERENCES dwg_revision,
  step VARCHAR(20) NOT NULL CHECK (step IN ('WRITE','REVIEW','APPROVE')),
  approver_id BIGINT NOT NULL REFERENCES sys_user,
  approval_date DATE,
  result VARCHAR(20),
  comment VARCHAR(1000)
);

CREATE TABLE dwg_file (
  file_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  project_id BIGINT REFERENCES prj_project,                        -- v0.4 R1
  folder VARCHAR(20) CHECK (folder IN ('DWG','PRICE','DATA','BOM','RECEIVED')),  -- v0.4 R1
  drawing_id BIGINT REFERENCES dwg_drawing,
  revision_id BIGINT REFERENCES dwg_revision,
  file_name VARCHAR(300) NOT NULL,
  file_type VARCHAR(10) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  uploaded_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);
CREATE INDEX ix_dwg_file_project ON dwg_file (project_id, folder); -- v0.4 R1

CREATE TABLE dwg_dimension (
  dimension_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  drawing_id BIGINT NOT NULL REFERENCES dwg_drawing,
  product_code_id BIGINT REFERENCES product_code,
  dim_label VARCHAR(10) NOT NULL,
  dim_type VARCHAR(20) NOT NULL DEFAULT 'DETAIL' CHECK (dim_type IN ('KEY','DETAIL')),
  macro_id BIGINT REFERENCES tbx_macro,
  variant_value NUMERIC(14,4),
  design_priority INT, data_priority INT,
  base_point VARCHAR(100),
  remarks VARCHAR(300),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (drawing_id, dim_label),
  CONSTRAINT ck_dim_binding CHECK ((macro_id IS NULL) <> (variant_value IS NULL))  -- v0.3
);

CREATE TABLE dwg_part_relation (
  relation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  drawing_id BIGINT NOT NULL REFERENCES dwg_drawing,
  block_a VARCHAR(100) NOT NULL,
  block_b VARCHAR(100) NOT NULL,
  condition_align VARCHAR(30),
  condition_contact VARCHAR(50),
  value_macro_id BIGINT REFERENCES tbx_macro,
  priority INT NOT NULL DEFAULT 0,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE dwg_verification (
  verification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  drawing_id BIGINT NOT NULL REFERENCES dwg_drawing,
  rule_name VARCHAR(100) NOT NULL,
  macro_id BIGINT NOT NULL REFERENCES tbx_macro,
  warning_message VARCHAR(500) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE dwg_supersedure (                                     -- v0.2
  supersedure_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  old_drawing_id BIGINT NOT NULL REFERENCES dwg_drawing UNIQUE,
  new_drawing_id BIGINT NOT NULL REFERENCES dwg_drawing,
  reason VARCHAR(500),
  superseded_date DATE NOT NULL,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  CHECK (old_drawing_id <> new_drawing_id)                         -- v0.4 R5
);

CREATE TABLE doc_control (                                         -- v0.2
  doc_control_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  doc_no VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  doc_type VARCHAR(30) NOT NULL,
  ref_type VARCHAR(30), ref_id BIGINT,
  released_status VARCHAR(20) NOT NULL DEFAULT 'SET_UP'
    CHECK (released_status IN ('SET_UP','CHECK','APPROVE','ACCEPTED')),
  version VARCHAR(20) NOT NULL,
  person VARCHAR(50) NOT NULL,
  approver_id BIGINT REFERENCES sys_user,
  approval_date DATE,
  management_grade VARCHAR(10) NOT NULL DEFAULT 'S-3',
  remarks VARCHAR(500),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, doc_no, version)                              -- v0.4 R2
);
CREATE INDEX ix_doc_control_status ON doc_control (tenant_id, released_status);
CREATE INDEX ix_doc_control_grade  ON doc_control (management_grade);

-- ============================================================
-- 7. CPQ — cpq_
-- ============================================================
CREATE TABLE cpq_selection (
  selection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL REFERENCES prj_project,
  arrangement_id BIGINT REFERENCES arrangement_code,
  finished_goods_code VARCHAR(100) NOT NULL,
  product_code_id BIGINT NOT NULL REFERENCES product_code,
  slot_values JSONB NOT NULL,
  spec_input JSONB,
  is_standard BOOLEAN NOT NULL DEFAULT true,
  x_code_status VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);
CREATE INDEX ix_cpq_sel_project ON cpq_selection (project_id, status);  -- v0.4 R8

CREATE TABLE cpq_selection_item (                                  -- 자식
  sel_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  selection_id BIGINT NOT NULL REFERENCES cpq_selection,
  resolved_code VARCHAR(100) NOT NULL,
  resolved_slots JSONB,                                            -- v0.4 R8
  child_code_id BIGINT REFERENCES product_code,
  item_name VARCHAR(200) NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  bom_level INT NOT NULL DEFAULT 1,
  parent_item_id BIGINT REFERENCES cpq_selection_item,
  remarks VARCHAR(300)
);
CREATE INDEX ix_sel_item_selection ON cpq_selection_item (selection_id, bom_level);  -- v0.4 R8

CREATE TABLE cpq_run (
  run_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  selection_id BIGINT NOT NULL REFERENCES cpq_selection,
  run_type VARCHAR(20) NOT NULL CHECK (run_type IN ('BOM','DWG','PRICING','TECH','ALL')),
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  dimension_values JSONB,
  error_detail JSONB,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE cpq_output (                                          -- 자식
  output_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES cpq_run,
  output_type VARCHAR(30) NOT NULL,
  file_id BIGINT REFERENCES dwg_file,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8. 원가/견적 — cst_
-- ============================================================
CREATE TABLE cst_price (
  price_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  product_code_id BIGINT REFERENCES product_code,
  part_id BIGINT REFERENCES prt_part,
  price_source VARCHAR(20) NOT NULL CHECK (price_source IN ('QUOTE','PURCHASE','STOCK','APPLIED')),
  supplier_id BIGINT REFERENCES com_company,
  price NUMERIC(18,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  CONSTRAINT ck_price_target CHECK ((product_code_id IS NULL) <> (part_id IS NULL)),   -- v0.3
  CONSTRAINT ex_price_overlap EXCLUDE USING gist (                                     -- v0.3
    tenant_id WITH =,
    COALESCE(product_code_id, 0) WITH =,
    COALESCE(part_id, 0) WITH =,
    price_source WITH =,
    COALESCE(supplier_id, 0) WITH =,
    daterange(valid_from, COALESCE(valid_to, DATE '9999-12-31'), '[]') WITH &&
  )
);
CREATE INDEX ix_cst_price_code ON cst_price (product_code_id, price_source, valid_from);

CREATE TABLE cst_calc (
  calc_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  run_id BIGINT NOT NULL REFERENCES cpq_run,
  calc_type VARCHAR(20) NOT NULL CHECK (calc_type IN ('MATERIAL','MANUFACTURING','DIRECT')),
  detail JSONB NOT NULL,
  total_amount NUMERIC(18,2) NOT NULL,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE cst_pcr (
  pcr_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  selection_id BIGINT NOT NULL REFERENCES cpq_selection,
  business_type VARCHAR(30) NOT NULL,
  sections JSONB NOT NULL,
  direct_cost_total NUMERIC(18,2) NOT NULL,
  contribution_margin NUMERIC(18,2),
  ebit NUMERIC(18,2),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (selection_id, business_type)                             -- v0.4 R6
);

CREATE TABLE cst_quotation (
  quotation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  quotation_no VARCHAR(30) NOT NULL,
  pcr_id BIGINT NOT NULL REFERENCES cst_pcr,
  project_id BIGINT NOT NULL REFERENCES prj_project,
  customer_id BIGINT NOT NULL REFERENCES com_company,
  total_amount NUMERIC(18,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
  vat_mode VARCHAR(10),
  validity_period VARCHAR(50),
  delivery_terms VARCHAR(200),
  payment_terms VARCHAR(200),
  line_items JSONB NOT NULL,
  doc_file_id BIGINT REFERENCES dwg_file,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, quotation_no)
);

-- ============================================================
-- 9. ERP — erp_ / prt_supplier_code_map / erp_warehouse
-- ============================================================
CREATE TABLE erp_process_def (
  proc_def_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,     -- v0.3 F1
  tenant_id BIGINT NOT NULL,
  proc_code VARCHAR(10) NOT NULL,
  proc_name VARCHAR(100) NOT NULL,
  department VARCHAR(50) NOT NULL,
  form_id BIGINT REFERENCES tbx_ui_form,
  is_auto BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, proc_code)
);

CREATE TABLE erp_process_edge (                                    -- v0.3 F1
  edge_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  from_def_id BIGINT NOT NULL REFERENCES erp_process_def,
  to_def_id   BIGINT NOT NULL REFERENCES erp_process_def,
  transition_condition VARCHAR(200),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (from_def_id, to_def_id)
);

CREATE TABLE erp_process_event (
  event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  proc_def_id BIGINT NOT NULL REFERENCES erp_process_def,          -- v0.3 F1
  project_id BIGINT NOT NULL REFERENCES prj_project,
  ref_type VARCHAR(30), ref_id BIGINT,
  status VARCHAR(20) NOT NULL DEFAULT 'TODO',
  assignee_id BIGINT REFERENCES sys_user,
  due_date DATE,
  done_at TIMESTAMPTZ,
  data JSONB,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);
CREATE INDEX ix_erp_event_project  ON erp_process_event (project_id, proc_def_id);
CREATE INDEX ix_erp_event_assignee ON erp_process_event (assignee_id, status);

CREATE TABLE erp_work_process (
  wp_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  product_code_id BIGINT NOT NULL REFERENCES product_code,
  process_type VARCHAR(20) NOT NULL,
  seq_no INT NOT NULL DEFAULT 0,
  workshop VARCHAR(50),
  warehouse VARCHAR(50),
  min_stock NUMERIC(12,3),
  person_count INT,
  skill_grade VARCHAR(20),
  work_time NUMERIC(10,3),
  make_or_buy VARCHAR(10) CHECK (make_or_buy IN ('MAKE','BUY')),
  supplier_id BIGINT REFERENCES com_company,
  remarks VARCHAR(300),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ
);

CREATE TABLE prt_supplier_code_map (                               -- v0.2
  map_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  part_id BIGINT REFERENCES prt_part,
  product_code_id BIGINT REFERENCES product_code,
  supplier_id BIGINT NOT NULL REFERENCES com_company,
  supplier_code VARCHAR(50) NOT NULL,
  supplier_name VARCHAR(200),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (supplier_id, supplier_code),
  CONSTRAINT ck_map_target CHECK ((part_id IS NULL) <> (product_code_id IS NULL))     -- v0.3
);

CREATE TABLE erp_warehouse (                                       -- v0.2
  warehouse_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  parent_id BIGINT REFERENCES erp_warehouse,
  location_type VARCHAR(20) NOT NULL CHECK (location_type IN ('REGION','PLANT','WAREHOUSE','STORAGE','SECTOR')),
  location_code VARCHAR(30) NOT NULL,
  location_name VARCHAR(100) NOT NULL,
  hazard_allowed VARCHAR(100),
  inspection_cycle VARCHAR(30),
  remarks VARCHAR(300),
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, location_code)
);

-- v0.5: i18n — 데이터 라벨 번역 (KO 원문 + en/ja/zh)
CREATE TABLE sys_translation (
  translation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  locale      VARCHAR(5)  NOT NULL CHECK (locale IN ('en','ja','zh')),
  entity_type VARCHAR(40) NOT NULL,
  entity_id   BIGINT      NOT NULL,
  field       VARCHAR(40) NOT NULL,
  text        VARCHAR(1000) NOT NULL,
  created_by VARCHAR(50) NOT NULL DEFAULT 'system', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by VARCHAR(50), updated_at TIMESTAMPTZ,
  UNIQUE (tenant_id, locale, entity_type, entity_id, field)
);
