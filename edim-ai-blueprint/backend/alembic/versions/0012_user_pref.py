# -*- coding: utf-8 -*-
"""사용자 환경설정 (D8) — sys_user_pref.

화면 즐겨찾기·최근 항목·그리드 컬럼 설정 등 사용자별 UI 선호를 key-value(jsonb)로 영속.

Revision ID: 0012_user_pref
Revises: 0011_anomaly
"""
from alembic import op

revision = "0012_user_pref"
down_revision = "0011_anomaly"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS sys_user_pref (
        pref_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id   BIGINT NOT NULL,
        login_id    VARCHAR(50) NOT NULL,
        pref_key    VARCHAR(60) NOT NULL,
        pref_value  JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, login_id, pref_key))""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_user_pref")
