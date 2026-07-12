# -*- coding: utf-8 -*-
"""Head 메뉴 편집 (D10) — sys_menu_config.

사용자별 모듈 표시 구성 (기업 사용자는 ERP 하부만 등). 빈 목록/미설정 = 전체 표시.

Revision ID: 0010_menu_config
Revises: 0009_milestone
"""
from alembic import op

revision = "0010_menu_config"
down_revision = "0009_milestone"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS sys_menu_config (
        config_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id   BIGINT NOT NULL,
        login_id    VARCHAR(50) NOT NULL,
        modules     JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_by  VARCHAR(50),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, login_id))""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_menu_config")
