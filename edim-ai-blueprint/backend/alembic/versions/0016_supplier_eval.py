# -*- coding: utf-8 -*-
"""공급처 평가/등급 — com_supplier_eval.

발주 이행률(납기)·품질·단가 가중 평가 → 등급(A/B/C/D), 최신 등급을 com_company.evaluation_grade 로 반영.

Revision ID: 0016_supplier_eval
Revises: 0015_stock_reservation
"""
from alembic import op

revision = "0016_supplier_eval"
down_revision = "0015_stock_reservation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS com_supplier_eval (
        eval_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id   BIGINT NOT NULL,
        supplier_id BIGINT NOT NULL REFERENCES com_company ON DELETE CASCADE,
        period      VARCHAR(7) NOT NULL,
        delivery    NUMERIC(5,2) NOT NULL DEFAULT 0,
        quality     NUMERIC(5,2) NOT NULL DEFAULT 0,
        price       NUMERIC(5,2) NOT NULL DEFAULT 0,
        total       NUMERIC(5,2) NOT NULL DEFAULT 0,
        grade       VARCHAR(2) NOT NULL DEFAULT 'D',
        note        VARCHAR(300),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by  VARCHAR(50) NOT NULL DEFAULT 'system',
        UNIQUE (tenant_id, supplier_id, period))""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS com_supplier_eval")
