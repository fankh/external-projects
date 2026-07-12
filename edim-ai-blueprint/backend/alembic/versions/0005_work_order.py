# -*- coding: utf-8 -*-
"""작업지시 (D3) — erp_work_order. 설계(도면·BOM·공정)가 제작으로 넘어가는 고리.

발행(ISSUED)→착수(STARTED)→완료(DONE). 완료 시 부서 후속(알림) 연동.

Revision ID: 0005_work_order
Revises: 0004_inventory
"""
from alembic import op

revision = "0005_work_order"
down_revision = "0004_inventory"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS erp_work_order (
        wo_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id    BIGINT NOT NULL,
        wo_no        VARCHAR(30) NOT NULL,
        drawing_no   VARCHAR(50),
        project_no   VARCHAR(30),
        title        VARCHAR(200) NOT NULL,
        status       VARCHAR(20) NOT NULL DEFAULT 'ISSUED'
                     CHECK (status IN ('ISSUED','STARTED','DONE')),
        assembly_note VARCHAR(500),
        assignee     VARCHAR(50),
        issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at   TIMESTAMPTZ,
        done_at      TIMESTAMPTZ,
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
        UNIQUE (tenant_id, wo_no))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_erp_wo_status ON erp_work_order (tenant_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS erp_work_order")
