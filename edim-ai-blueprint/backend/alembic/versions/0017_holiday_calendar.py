# -*- coding: utf-8 -*-
"""근무일/휴일 캘린더 — cal_holiday.

마일스톤 지연/기한을 영업일(주말·공휴일 제외) 기준으로 계산.

Revision ID: 0017_holiday_calendar
Revises: 0016_supplier_eval
"""
from alembic import op

revision = "0017_holiday_calendar"
down_revision = "0016_supplier_eval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS cal_holiday (
        holiday_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id    BIGINT NOT NULL,
        holiday_date DATE NOT NULL,
        name         VARCHAR(100) NOT NULL,
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
        UNIQUE (tenant_id, holiday_date))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cal_holiday ON cal_holiday (tenant_id, holiday_date)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS cal_holiday")
