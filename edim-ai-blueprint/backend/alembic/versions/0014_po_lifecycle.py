# -*- coding: utf-8 -*-
"""발주 라이프사이클 (G3, ERP-017) — erp_po + erp_po_item.

구조화 PO(헤더+라인아이템) · 승인 · 입고(GR) · 수량 3-way match(발주≥입고).
기존 doc_control PO 문서와 병행 — 이쪽이 상태기계·라인 수량 추적 정본.

Revision ID: 0014_po_lifecycle
Revises: 0013_arrangement_geometry
"""
from alembic import op

revision = "0014_po_lifecycle"
down_revision = "0013_arrangement_geometry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS erp_po (
        po_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id     BIGINT NOT NULL,
        po_no         VARCHAR(30) NOT NULL,
        supplier      VARCHAR(200),
        status        VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','APPROVED','RECEIVING','CLOSED','CANCELLED')),
        order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        expected_date DATE,
        note          VARCHAR(500),
        created_by    VARCHAR(50) NOT NULL DEFAULT 'system',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        approved_at   TIMESTAMPTZ,
        UNIQUE (tenant_id, po_no))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_erp_po_status ON erp_po (tenant_id, status)")
    op.execute("""CREATE TABLE IF NOT EXISTS erp_po_item (
        po_item_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        po_id        BIGINT NOT NULL REFERENCES erp_po ON DELETE CASCADE,
        item_code    VARCHAR(50),
        item_name    VARCHAR(200) NOT NULL,
        order_qty    NUMERIC(16,3) NOT NULL DEFAULT 1,
        unit_price   NUMERIC(16,2) NOT NULL DEFAULT 0,
        received_qty NUMERIC(16,3) NOT NULL DEFAULT 0,
        sort_order   INT NOT NULL DEFAULT 0)""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS erp_po_item")
    op.execute("DROP TABLE IF EXISTS erp_po")
