# -*- coding: utf-8 -*-
"""Template Library — 읽기전용 원본 → Tenant 복사·Lock (요구 #57).

tbx_templet 에는 is_system 만 있고 **원본과 사본의 관계가 없었다**. 그래서
  · 어떤 사본이 어느 원본에서 나왔는지 알 수 없고(계보 부재)
  · 원본을 고칠 때 영향받는 사본을 찾을 수 없으며(영향분석 불가)
  · 사본에서 건드리면 안 되는 부분을 지정할 수도 없었다(부분 Lock 부재)

- origin_templet_id : 복사 원본 (clone 계보)
- locked_fields     : 사본에서 편집 금지 필드 목록 (원본이 지정)

Revision ID: 0042_templet_library
Revises: 0041_package_runtime
"""
from alembic import op

revision = "0042_templet_library"
down_revision = "0041_package_runtime"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tbx_templet ADD COLUMN IF NOT EXISTS origin_templet_id BIGINT")
    op.execute("ALTER TABLE tbx_templet ADD COLUMN IF NOT EXISTS locked_fields JSONB NOT NULL DEFAULT '[]'::jsonb")
    op.execute("CREATE INDEX IF NOT EXISTS ix_templet_origin ON tbx_templet (origin_templet_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_templet_origin")
    op.execute("ALTER TABLE tbx_templet DROP COLUMN IF EXISTS locked_fields")
    op.execute("ALTER TABLE tbx_templet DROP COLUMN IF EXISTS origin_templet_id")
