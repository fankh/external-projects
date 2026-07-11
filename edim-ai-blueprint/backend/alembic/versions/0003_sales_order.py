# -*- coding: utf-8 -*-
"""수주 관리 (D1) — cst_quotation 에 계약금액·수주일·예상납기 컬럼 추가.

견적(DRAFT→SENT)이 수주(ORDERED)로 전환될 때 계약 조건을 담는다.
C6 증분 마이그레이션 경로 실증 — 라이브(0002 stamp)에서 startup upgrade 로 자동 적용.

Revision ID: 0003_sales_order
Revises: 0002_dev_tables
"""
from alembic import op

revision = "0003_sales_order"
down_revision = "0002_dev_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cst_quotation ADD COLUMN IF NOT EXISTS contract_amount NUMERIC(18,2)")
    op.execute("ALTER TABLE cst_quotation ADD COLUMN IF NOT EXISTS order_date DATE")
    op.execute("ALTER TABLE cst_quotation ADD COLUMN IF NOT EXISTS expected_delivery DATE")


def downgrade() -> None:
    op.execute("ALTER TABLE cst_quotation DROP COLUMN IF EXISTS expected_delivery")
    op.execute("ALTER TABLE cst_quotation DROP COLUMN IF EXISTS order_date")
    op.execute("ALTER TABLE cst_quotation DROP COLUMN IF EXISTS contract_amount")
