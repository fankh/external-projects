# -*- coding: utf-8 -*-
"""Macro Builder 5-View 단일 Graph (요구 #60).

tbx_macro 에는 5개 뷰가 이미 컬럼으로 있다 — prompt_text · macro_expr · flowchart_def ·
description_text · code_text. 그러나 **다섯이 같은 것을 말한다는 보장이 없었다**:
서로 독립 컬럼이라 하나만 고쳐도 나머지는 옛 내용 그대로 남고, 무엇이 정본인지도 없었다.

Command Graph 를 정본으로 둔다. Graph 는 수식(macro_expr)에서 파생되며,
각 뷰는 마지막으로 Graph 와 맞춘 시점의 지문을 갖는다 → 어긋난 뷰를 지목할 수 있다.

Revision ID: 0045_macro_graph
Revises: 0044_command_registry
"""
from alembic import op

revision = "0045_macro_graph"
down_revision = "0044_command_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tbx_macro ADD COLUMN IF NOT EXISTS graph_def JSONB")
    op.execute("ALTER TABLE tbx_macro ADD COLUMN IF NOT EXISTS graph_checksum VARCHAR(64)")
    op.execute("ALTER TABLE tbx_macro ADD COLUMN IF NOT EXISTS view_fingerprints JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("ALTER TABLE tbx_macro ADD COLUMN IF NOT EXISTS graph_synced_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE tbx_macro DROP COLUMN IF EXISTS graph_synced_at")
    op.execute("ALTER TABLE tbx_macro DROP COLUMN IF EXISTS view_fingerprints")
    op.execute("ALTER TABLE tbx_macro DROP COLUMN IF EXISTS graph_checksum")
    op.execute("ALTER TABLE tbx_macro DROP COLUMN IF EXISTS graph_def")
