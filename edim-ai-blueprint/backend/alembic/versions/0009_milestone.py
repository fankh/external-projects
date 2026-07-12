# -*- coding: utf-8 -*-
"""프로젝트 일정·마일스톤 (D7) — prj_milestone.

단계별 납기 마일스톤(수주→설계→구매→제작→출하) 등록·진척 + 지연 임박/초과 계산.

Revision ID: 0009_milestone
Revises: 0008_cost_actual
"""
from alembic import op

revision = "0009_milestone"
down_revision = "0008_cost_actual"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS prj_milestone (
        milestone_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id    BIGINT NOT NULL,
        project_no   VARCHAR(30) NOT NULL,
        stage        VARCHAR(20) NOT NULL
                     CHECK (stage IN ('ORDER','DESIGN','PURCHASE','PRODUCTION','SHIPMENT')),
        planned_date DATE NOT NULL,
        actual_date  DATE,
        status       VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','DONE')),
        note         VARCHAR(300),
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, project_no, stage))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_milestone_prj ON prj_milestone (tenant_id, project_no)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS prj_milestone")
