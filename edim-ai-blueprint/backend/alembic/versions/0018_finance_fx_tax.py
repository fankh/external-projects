# -*- coding: utf-8 -*-
"""다통화/환율 + 세금 마스터 — fx_rate·tax_code.

견적 통화 환산(→기준통화 KRW)·세액 계산 기반 데이터.

Revision ID: 0018_finance_fx_tax
Revises: 0017_holiday_calendar
"""
from alembic import op

revision = "0018_finance_fx_tax"
down_revision = "0017_holiday_calendar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS fx_rate (
        fx_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id  BIGINT NOT NULL,
        currency   VARCHAR(3) NOT NULL,
        rate       NUMERIC(18,6) NOT NULL,   -- 외화 1단위 = rate KRW
        valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
        created_by VARCHAR(50) NOT NULL DEFAULT 'system',
        UNIQUE (tenant_id, currency, valid_from))""")
    op.execute("""CREATE TABLE IF NOT EXISTS tax_code (
        tax_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id  BIGINT NOT NULL,
        code       VARCHAR(20) NOT NULL,
        name       VARCHAR(100) NOT NULL,
        rate_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
        created_by VARCHAR(50) NOT NULL DEFAULT 'system',
        UNIQUE (tenant_id, code))""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS fx_rate")
    op.execute("DROP TABLE IF EXISTS tax_code")
