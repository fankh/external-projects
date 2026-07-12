# -*- coding: utf-8 -*-
"""검사·품질 기록 (D4) — qc_inspection. 규칙이 판정이 되는 고리.

수입(INCOMING)·공정(PROCESS)·출하(OUTGOING) 검사 결과(합/부/조건부, 측정값).
불합격·조건부 시 품질 관리자(ADMIN/PLATFORM) 알림 연동.

Revision ID: 0006_qc_inspection
Revises: 0005_work_order
"""
from alembic import op

revision = "0006_qc_inspection"
down_revision = "0005_work_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS qc_inspection (
        inspection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id     BIGINT NOT NULL,
        insp_no       VARCHAR(30) NOT NULL,
        insp_type     VARCHAR(20) NOT NULL
                      CHECK (insp_type IN ('INCOMING','PROCESS','OUTGOING')),
        ref_no        VARCHAR(50),
        item_code     VARCHAR(50),
        item_name     VARCHAR(200),
        result        VARCHAR(20) NOT NULL
                      CHECK (result IN ('PASS','FAIL','CONDITIONAL')),
        measured      VARCHAR(500),
        inspector     VARCHAR(50),
        inspected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by    VARCHAR(50) NOT NULL DEFAULT 'system',
        UNIQUE (tenant_id, insp_no))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_qc_result ON qc_inspection (tenant_id, result)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS qc_inspection")
