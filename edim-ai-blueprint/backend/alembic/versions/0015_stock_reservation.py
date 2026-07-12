# -*- coding: utf-8 -*-
"""재고 예약/할당 (ATP) — inv_reservation.

on-hand 만 있던 재고에 예약 차원 추가: available = Σ on-hand − Σ ACTIVE 예약.
수주/작업지시가 재고를 선점(reserve)해 가용재고(ATP)를 정확히 반영.

Revision ID: 0015_stock_reservation
Revises: 0014_po_lifecycle
"""
from alembic import op

revision = "0015_stock_reservation"
down_revision = "0014_po_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS inv_reservation (
        reservation_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id      BIGINT NOT NULL,
        item_code      VARCHAR(50) NOT NULL,
        quantity       NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
        ref_type       VARCHAR(20),
        ref_no         VARCHAR(50),
        status         VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE','RELEASED','FULFILLED')),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by     VARCHAR(50) NOT NULL DEFAULT 'system')""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_inv_reservation_item "
               "ON inv_reservation (tenant_id, item_code, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS inv_reservation")
