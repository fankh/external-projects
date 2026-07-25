# -*- coding: utf-8 -*-
"""승인 위임 대상 (ADM-003 "승인 요청 일괄 처리·위임·규칙", 13.5).

승인함은 미결 요청을 전원에게 보여 줄 뿐 **누구에게 맡겨졌는지** 개념이 없었다.
담당자가 부재하거나 특정인이 처리해야 하는 건을 지정할 수단이 없어, 실무에서는
"누가 볼 차례인가" 를 시스템 밖에서 관리해야 했다.

approver_id 를 재사용하지 않는 이유: 그 컬럼은 **누가 결정했는가**(사후 사실)이고
assigned_to 는 **누가 결정해야 하는가**(사전 지정)라 의미가 다르다. 한 칸에 섞으면
지정만 하고 아직 결정하지 않은 상태를 표현할 수 없다.

Revision ID: 0056_approval_delegate
Revises: 0055_quotation_basis
"""
from alembic import op

revision = "0056_approval_delegate"
down_revision = "0055_quotation_basis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE sys_approval_request "
        "ADD COLUMN IF NOT EXISTS assigned_to bigint REFERENCES sys_user(user_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_approval_assigned_to "
        "ON sys_approval_request (tenant_id, assigned_to) WHERE result IS NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_approval_assigned_to")
    op.execute("ALTER TABLE sys_approval_request DROP COLUMN IF EXISTS assigned_to")
