# -*- coding: utf-8 -*-
"""Hierarchy 노드 속성 (트리아지 #22) — remark·color·is_locked.

신규 기준(HIERARCHY_TREE_USER_EDIT_APPROVAL_WORKFLOW)의 Remark/Symbol/Lock/Color 중
symbol 은 기구현 — 잔여 3속성 추가. 잠금 노드는 개명/이동/삭제 409.

Revision ID: 0029_hierarchy_attrs
Revises: 0028_handoff_snapshot
"""
from alembic import op

revision = "0029_hierarchy_attrs"
down_revision = "0028_handoff_snapshot"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE sys_hierarchy ADD COLUMN IF NOT EXISTS remark VARCHAR(200)")
    op.execute("ALTER TABLE sys_hierarchy ADD COLUMN IF NOT EXISTS color VARCHAR(16)")
    op.execute("ALTER TABLE sys_hierarchy ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE sys_hierarchy DROP COLUMN IF EXISTS is_locked")
    op.execute("ALTER TABLE sys_hierarchy DROP COLUMN IF EXISTS color")
    op.execute("ALTER TABLE sys_hierarchy DROP COLUMN IF EXISTS remark")
