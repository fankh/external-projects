# -*- coding: utf-8 -*-
"""ERP Domain/Process/Workflow DB 선반영 (요구 #50).

근거: EDIM_FULL_IMPLEMENTATION_SCOPE_ERP_DIGITAL_TWIN_2026_07_18.md
  §6.1 Workflow 기본 구조 · §6.2 Process 예 · §10.1 "업무 화면을 먼저 고정 개발하지 말고,
  Head / Template / Workflow / Permission 구조를 먼저 만든다".

화면은 점진적으로 열되 **구조는 지금 전부 자리를 만든다**. 회사마다 업무 순서와 승인
조건이 다르므로 ERP 를 고정 화면이 아니라 Workflow(Template→Node→Edge→Condition)로 둔다.

Instance/Task(§6.1 후반)는 Phase D 실행 영역이라 이번 범위에서 제외한다 — 이번 요구는
"구조 먼저"이고, 실행 데이터를 기준 데이터와 같은 시점에 섞지 않기 위해서다(§10.9).

Revision ID: 0049_erp_workflow
Revises: 0048_setup_lock
"""
from alembic import op

revision = "0049_erp_workflow"
down_revision = "0048_setup_lock"
branch_labels = None
depends_on = None

# §6.2 "위 약어는 확정 명칭이 아니라 초기 Process Code 후보이다."
# → 후보로 심되 tenant_override_allowed 로 회사별 대체를 허용한다.
DOMAINS = [
    ("PRODSEL", "제품선정", 10), ("SALES", "영업", 20), ("TECH", "기술", 30),
    ("MATERIAL", "자재", 40), ("PROD", "생산", 50), ("CS", "CS", 60),
    ("QC", "QC", 70), ("FIN", "재무", 80), ("MGMT", "경영", 90),
    ("HR", "인사", 100), ("COMM", "내부소통", 110), ("EXT", "외부연동", 120),
    ("SYS", "System 관리", 130), ("SUPPORT", "EDIM Support", 140),
]

PROCESSES = [
    ("CPO", "제품 선정", "PRODSEL", 10), ("CC", "원가 산출", "PRODSEL", 20),
    ("PCR", "견적 룰", "FIN", 30), ("QCR", "견적", "SALES", 40),
    ("OR", "주문", "SALES", 50), ("AP", "승인 도서", "SALES", 60),
    ("APP", "고객 승인", "SALES", 70), ("MR", "제작 의뢰", "SALES", 80),
    ("MRR", "제작 검토", "TECH", 90), ("PL", "Part List", "TECH", 100),
    ("BOM", "BOM", "TECH", 110), ("PR", "자재발주요청", "MATERIAL", 120),
    ("PO", "발주", "MATERIAL", 130), ("MI", "자재 입고", "MATERIAL", 140),
    ("MO", "자재 출고", "MATERIAL", 150), ("MP", "생산 계획", "PROD", 160),
    ("SPP", "Stock 생산", "PROD", 170), ("WR", "작업 지시", "PROD", 180),
    ("RM", "자재 수정 / 재작업", "PROD", 190), ("FF", "반제품 생산 완료", "PROD", 200),
    ("EF", "반제품 검사", "QC", 210), ("IO", "제품 검사 요청", "QC", 220),
    ("PI", "제품 입금 / 출하 전 처리", "FIN", 230), ("PE", "Project 평가", "MGMT", 240),
    ("CO", "원가 정산", "FIN", 250), ("RA", "정산 요청", "FIN", 260),
    ("RAR", "정산 승인", "FIN", 270), ("RR", "정산", "FIN", 280),
    ("AR", "선수금", "FIN", 290), ("CR", "인증서 발급", "QC", 300),
]


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_domain_catalog (
          domain_id   BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT,
          domain_code VARCHAR(20) NOT NULL,
          domain_name VARCHAR(80) NOT NULL,
          sort_order  INT NOT NULL DEFAULT 0,
          is_standard BOOLEAN NOT NULL DEFAULT TRUE,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
    # 표준(tenant_id IS NULL)은 전역 1건, 테넌트 확장은 테넌트별 1건
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_erp_domain_std
                  ON erp_domain_catalog (domain_code) WHERE tenant_id IS NULL""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_erp_domain_tenant
                  ON erp_domain_catalog (tenant_id, domain_code) WHERE tenant_id IS NOT NULL""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_process_catalog (
          process_id   BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT,
          process_code VARCHAR(20) NOT NULL,
          process_name VARCHAR(100) NOT NULL,
          domain_code  VARCHAR(20) NOT NULL,
          sort_order   INT NOT NULL DEFAULT 0,
          tenant_override_allowed BOOLEAN NOT NULL DEFAULT TRUE,
          is_standard  BOOLEAN NOT NULL DEFAULT TRUE,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_erp_proc_std
                  ON erp_process_catalog (process_code) WHERE tenant_id IS NULL""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_erp_proc_tenant
                  ON erp_process_catalog (tenant_id, process_code) WHERE tenant_id IS NOT NULL""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_workflow_template (
          template_id   BIGSERIAL PRIMARY KEY,
          tenant_id     BIGINT NOT NULL,
          template_code VARCHAR(40) NOT NULL,
          template_name VARCHAR(120) NOT NULL,
          process_code  VARCHAR(20) NOT NULL,
          version_no    INT NOT NULL DEFAULT 1,
          status        VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          checksum      VARCHAR(64),
          note          VARCHAR(300),
          created_by    VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          published_at  TIMESTAMPTZ,
          CONSTRAINT ck_wft_status CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
          UNIQUE (tenant_id, template_code, version_no)
        )""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_workflow_node (
          node_id     BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          template_id BIGINT NOT NULL REFERENCES erp_workflow_template ON DELETE CASCADE,
          node_code   VARCHAR(40) NOT NULL,
          node_name   VARCHAR(120) NOT NULL,
          node_type   VARCHAR(12) NOT NULL DEFAULT 'TASK',
          actor_level VARCHAR(12),
          screen_key  VARCHAR(80),
          sort_order  INT NOT NULL DEFAULT 0,
          CONSTRAINT ck_wfn_type CHECK (node_type IN ('START','TASK','APPROVAL','END')),
          UNIQUE (template_id, node_code)
        )""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_workflow_edge (
          edge_id     BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          template_id BIGINT NOT NULL REFERENCES erp_workflow_template ON DELETE CASCADE,
          from_node   VARCHAR(40) NOT NULL,
          to_node     VARCHAR(40) NOT NULL,
          edge_label  VARCHAR(60),
          sort_order  INT NOT NULL DEFAULT 0,
          UNIQUE (template_id, from_node, to_node)
        )""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_workflow_condition (
          condition_id BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          template_id  BIGINT NOT NULL REFERENCES erp_workflow_template ON DELETE CASCADE,
          edge_id      BIGINT REFERENCES erp_workflow_edge ON DELETE CASCADE,
          expr         VARCHAR(300) NOT NULL,
          note         VARCHAR(200)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wfe_template ON erp_workflow_edge (template_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wfn_template ON erp_workflow_node (template_id)")

    # ── 표준 카탈로그 시드 (tenant_id IS NULL = 전 테넌트 공통) ──
    for code, name, order in DOMAINS:
        op.execute("INSERT INTO erp_domain_catalog (tenant_id, domain_code, domain_name, sort_order) "
                   f"VALUES (NULL,'{code}','{name}',{order}) ON CONFLICT DO NOTHING")
    for code, name, dom, order in PROCESSES:
        op.execute("INSERT INTO erp_process_catalog (tenant_id, process_code, process_name, "
                   f"domain_code, sort_order) VALUES (NULL,'{code}','{name}','{dom}',{order}) "
                   "ON CONFLICT DO NOTHING")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS erp_workflow_condition")
    op.execute("DROP TABLE IF EXISTS erp_workflow_edge")
    op.execute("DROP TABLE IF EXISTS erp_workflow_node")
    op.execute("DROP TABLE IF EXISTS erp_workflow_template")
    op.execute("DROP TABLE IF EXISTS erp_process_catalog")
    op.execute("DROP TABLE IF EXISTS erp_domain_catalog")
