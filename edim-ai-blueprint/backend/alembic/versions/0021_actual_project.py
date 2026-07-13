# -*- coding: utf-8 -*-
"""원가 실적 프로젝트 귀속 — cst_actual.project_no.

프로젝트별 실적 원가 집계·차이분석(추정 Run 도 프로젝트 스코프)을 위한 귀속 컬럼.

Revision ID: 0021_actual_project
Revises: 0020_lot_serial
"""
from alembic import op

revision = "0021_actual_project"
down_revision = "0020_lot_serial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cst_actual ADD COLUMN IF NOT EXISTS project_no VARCHAR(30)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cst_actual_project ON cst_actual (tenant_id, project_no)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_cst_actual_project")
    op.execute("ALTER TABLE cst_actual DROP COLUMN IF EXISTS project_no")
