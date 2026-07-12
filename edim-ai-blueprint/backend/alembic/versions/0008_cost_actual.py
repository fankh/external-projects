# -*- coding: utf-8 -*-
"""원가 실적 (D6) — cst_actual. 추정이 실적으로 검증되는 고리.

PO 확정 단가 → 실적 원가(cst_actual, 추정 cst_calc 과 분리 기록).
견적(추정) vs 실적 차이 분석 · 차이율 임계 초과 경보.

Revision ID: 0008_cost_actual
Revises: 0007_eco_change
"""
from alembic import op

revision = "0008_cost_actual"
down_revision = "0007_eco_change"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS cst_actual (
        actual_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id    BIGINT NOT NULL,
        category     VARCHAR(20) NOT NULL
                     CHECK (category IN ('MATERIAL','MANUFACTURING','DIRECT')),
        item_code    VARCHAR(50),
        item_name    VARCHAR(200),
        po_no        VARCHAR(50),
        qty          NUMERIC(16,3) NOT NULL DEFAULT 1,
        unit_price   NUMERIC(16,2) NOT NULL DEFAULT 0,
        amount       NUMERIC(18,2) NOT NULL DEFAULT 0,
        recorded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system')""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cst_actual_cat ON cst_actual (tenant_id, category)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cst_actual")
