# -*- coding: utf-8 -*-
"""배치 구성도 좌표 (C11) — arrangement_component 캔버스 geometry.

C-1 구성도를 실블록으로 렌더하기 위한 좌표(pos_x/pos_y/width/height) 추가.
기존 데모 컴포넌트는 sort_order 기반 자동 2열 배치로 초기화.

Revision ID: 0013_arrangement_geometry
Revises: 0012_user_pref
"""
from alembic import op

revision = "0013_arrangement_geometry"
down_revision = "0012_user_pref"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE arrangement_component ADD COLUMN IF NOT EXISTS pos_x INT")
    op.execute("ALTER TABLE arrangement_component ADD COLUMN IF NOT EXISTS pos_y INT")
    op.execute("ALTER TABLE arrangement_component ADD COLUMN IF NOT EXISTS width INT")
    op.execute("ALTER TABLE arrangement_component ADD COLUMN IF NOT EXISTS height INT")
    # 데모 초기 배치 — sort_order 기반 2열 그리드 (좌표 미지정분)
    op.execute("""UPDATE arrangement_component SET
        pos_x = 20 + (sort_order % 2) * 150,
        pos_y = 20 + (sort_order / 2) * 70,
        width = 130, height = 56
        WHERE pos_x IS NULL""")


def downgrade() -> None:
    for col in ("pos_x", "pos_y", "width", "height"):
        op.execute(f"ALTER TABLE arrangement_component DROP COLUMN IF EXISTS {col}")
