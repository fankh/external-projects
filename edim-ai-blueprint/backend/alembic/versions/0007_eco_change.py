# -*- coding: utf-8 -*-
"""설계 변경 관리 (D5) — eco_change. Rev-up 을 공식 절차로.

변경요청(ECR) → 영향 분석 자동 첨부(Where-Used) → 단계 승인(ECO, sys_approval_request 재사용)
→ 승인 시 Rev-up·변경 통지(ECN) 자동 연계.

Revision ID: 0007_eco_change
Revises: 0006_qc_inspection
"""
from alembic import op

revision = "0007_eco_change"
down_revision = "0006_qc_inspection"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS eco_change (
        eco_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id    BIGINT NOT NULL,
        eco_no       VARCHAR(30) NOT NULL,
        title        VARCHAR(200) NOT NULL,
        reason       VARCHAR(1000),
        target_type  VARCHAR(20) NOT NULL CHECK (target_type IN ('DRAWING','CODE')),
        target_no    VARCHAR(80) NOT NULL,
        impact_data  JSONB,
        status       VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED'
                     CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','APPLIED')),
        rev_from     VARCHAR(10),
        rev_to       VARCHAR(10),
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        applied_at   TIMESTAMPTZ,
        UNIQUE (tenant_id, eco_no))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_eco_status ON eco_change (tenant_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS eco_change")
