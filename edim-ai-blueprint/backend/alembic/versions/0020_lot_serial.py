# -*- coding: utf-8 -*-
"""Lot/Serial 추적 차원 — inv_movement.lot_no·serial_no.

규제·직번 부품 추적성(genealogy): 입출고 이력에 로트/시리얼 차원 추가.
재고 원장(inv_stock)은 품목×위치 집계 유지, 로트 잔량은 이력에서 산출.

Revision ID: 0020_lot_serial
Revises: 0019_company_active
"""
from alembic import op

revision = "0020_lot_serial"
down_revision = "0019_company_active"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inv_movement ADD COLUMN IF NOT EXISTS lot_no VARCHAR(50)")
    op.execute("ALTER TABLE inv_movement ADD COLUMN IF NOT EXISTS serial_no VARCHAR(80)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_inv_movement_lot ON inv_movement (item_code, lot_no)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_inv_movement_serial ON inv_movement (serial_no)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_inv_movement_serial")
    op.execute("DROP INDEX IF EXISTS ix_inv_movement_lot")
    op.execute("ALTER TABLE inv_movement DROP COLUMN IF EXISTS serial_no")
    op.execute("ALTER TABLE inv_movement DROP COLUMN IF EXISTS lot_no")
