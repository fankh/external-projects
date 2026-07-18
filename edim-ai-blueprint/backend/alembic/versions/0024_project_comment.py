"""U9 Project 중심 대화 (SYS-018·M-15-5, 슬라이드 57·77) — 프로젝트 코멘트 스레드.

Revision ID: 0024_project_comment
Revises: 0023_warehouse_depth
"""
from alembic import op

revision = "0024_project_comment"
down_revision = "0023_warehouse_depth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_project_comment (
          comment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tenant_id  BIGINT NOT NULL,
          project_no VARCHAR(50) NOT NULL,
          author     VARCHAR(50) NOT NULL,
          body       VARCHAR(1000) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_project_comment ON sys_project_comment (tenant_id, project_no, comment_id DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_project_comment")
