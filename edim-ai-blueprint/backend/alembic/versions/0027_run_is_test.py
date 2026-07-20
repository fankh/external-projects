# -*- coding: utf-8 -*-
"""테스트/업무 Run 구분 (E3 잔여) — cpq_run.is_test.

라이브 스위트·Studio Test Run 이 만드는 Run 을 업무 Run 과 구분 —
Run 이력(E-3) TEST 배지·통계(analytics) 오염 방지.

Revision ID: 0027_run_is_test
Revises: 0026_dwg_text_index
"""
from alembic import op

revision = "0027_run_is_test"
down_revision = "0026_dwg_text_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cpq_run ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE cpq_run DROP COLUMN IF EXISTS is_test")
