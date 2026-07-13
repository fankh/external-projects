# -*- coding: utf-8 -*-
"""거래처 비활성 플래그 — com_company.is_active.

비활성 거래처는 선택 리스트(고객/공급처 콤보)에서 제외하되 이력 참조는 보존(소프트).

Revision ID: 0019_company_active
Revises: 0018_finance_fx_tax
"""
from alembic import op

revision = "0019_company_active"
down_revision = "0018_finance_fx_tax"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE com_company ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true")


def downgrade() -> None:
    op.execute("ALTER TABLE com_company DROP COLUMN IF EXISTS is_active")
