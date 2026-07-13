# -*- coding: utf-8 -*-
"""재고 단가/평가 — inv_stock.unit_price (이동평균).

입고 시 단가 지정 또는 cst_price(STOCK) 자동 적재 → 재고 평가액(수량×단가) 산출.

Revision ID: 0022_stock_valuation
Revises: 0021_actual_project
"""
from alembic import op

revision = "0022_stock_valuation"
down_revision = "0021_actual_project"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inv_stock ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,2) NOT NULL DEFAULT 0")


def downgrade() -> None:
    op.execute("ALTER TABLE inv_stock DROP COLUMN IF EXISTS unit_price")
