# -*- coding: utf-8 -*-
"""좌측 패널 = 업무 프로세스 (요구 #15/#17 Panel Binding).

좌측을 고정 메뉴 트리가 아니라 고객사가 정의하는 업무 프로세스로 구성한다.
각 단계는 화면(href)에 바인딩되며, 순서·계층·이름·아이콘을 자유롭게 편집한다.

Revision ID: 0033_process_panel
Revises: 0032_snapshot_registry
"""
from alembic import op

revision = "0033_process_panel"
down_revision = "0032_snapshot_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_process_node (
            node_id      BIGSERIAL PRIMARY KEY,
            tenant_id    BIGINT NOT NULL,
            parent_id    BIGINT REFERENCES sys_process_node(node_id) ON DELETE CASCADE,
            name         VARCHAR(80) NOT NULL,
            icon         VARCHAR(8),
            screen_href  VARCHAR(200),
            step_no      INTEGER NOT NULL DEFAULT 0,
            note         VARCHAR(200),
            status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            created_by   BIGINT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_process_node_tenant "
               "ON sys_process_node (tenant_id, parent_id, step_no)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_process_node")
