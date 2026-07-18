"""U17 설계우선순위 테이블 (슬라이드 44) — dwg_dimension 오류체크 조건 컬럼.

기존 design_priority·data_priority·base_point 는 base 스키마에 이미 존재(미사용) — error_check 만 추가.

Revision ID: 0025_design_priority
Revises: 0024_project_comment
"""
from alembic import op

revision = "0025_design_priority"
down_revision = "0024_project_comment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE dwg_dimension ADD COLUMN IF NOT EXISTS error_check VARCHAR(100)")


def downgrade() -> None:
    op.execute("ALTER TABLE dwg_dimension DROP COLUMN IF EXISTS error_check")
