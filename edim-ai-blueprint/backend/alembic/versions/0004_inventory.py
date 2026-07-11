# -*- coding: utf-8 -*-
"""입고·재고 관리 (D2) — 재고 원장(inv_stock) + 입출고 이력(inv_movement).

발주(PO)가 입고(MI)로 재고가 되는 고리 — 품목×창고 위치 수량 관리.

Revision ID: 0004_inventory
Revises: 0003_sales_order
"""
from alembic import op

revision = "0004_inventory"
down_revision = "0003_sales_order"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS inv_stock (
        stock_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id     BIGINT NOT NULL,
        item_code     VARCHAR(50) NOT NULL,
        item_name     VARCHAR(200),
        location_code VARCHAR(30) NOT NULL,
        quantity      NUMERIC(14,3) NOT NULL DEFAULT 0,
        unit          VARCHAR(10) NOT NULL DEFAULT 'EA',
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, item_code, location_code))""")
    op.execute("""CREATE TABLE IF NOT EXISTS inv_movement (
        movement_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id     BIGINT NOT NULL,
        item_code     VARCHAR(50) NOT NULL,
        location_code VARCHAR(30) NOT NULL,
        movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('IN','OUT')),
        quantity      NUMERIC(14,3) NOT NULL,
        ref_type      VARCHAR(20),
        ref_no        VARCHAR(50),
        moved_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by    VARCHAR(50) NOT NULL DEFAULT 'system')""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_inv_movement_item ON inv_movement (item_code, moved_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS inv_movement")
    op.execute("DROP TABLE IF EXISTS inv_stock")
