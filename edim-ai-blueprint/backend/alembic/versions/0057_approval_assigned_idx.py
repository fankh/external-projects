# -*- coding: utf-8 -*-
"""assigned_to 외래키 전용 인덱스 (13.7).

0056 이 만든 인덱스는 `(tenant_id, assigned_to) WHERE result IS NULL` 로 **승인함 조회용**
부분 인덱스였다. 외래키가 필요로 하는 것은 다르다 — `sys_user` 행을 지울 때 참조 여부를
확인하려면 **결정된 행까지 포함해** assigned_to 를 선두로 찾을 수 있어야 한다.
부분 인덱스로는 그 스캔이 커버되지 않아 사용자 삭제가 전체 스캔이 된다(정적 게이트가 지적).

0056 을 고치지 않고 리비전을 더하는 이유: 0056 은 이미 적용돼 있어 수정해도 다시 실행되지 않는다.

Revision ID: 0057_approval_assigned_idx
Revises: 0056_approval_delegate
"""
from alembic import op

revision = "0057_approval_assigned_idx"
down_revision = "0056_approval_delegate"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_approval_assigned_to_fk "
        "ON sys_approval_request (assigned_to)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_approval_assigned_to_fk")
