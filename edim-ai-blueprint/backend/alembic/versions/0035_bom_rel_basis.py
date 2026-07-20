# -*- coding: utf-8 -*-
"""BOM 전개 근거 고정 (요구 #40) — 등록 관계 Revision 기준 다단계 전개.

1.7 Snapshot 은 Run 의 *결과*(BOM 행)를 불변 보존한다. 그러나 "그 BOM 이 어떤 관계 Revision 을
근거로 나왔는가"는 어디에도 없어서, 관계가 바뀐 뒤 같은 근거로 재실행했는지 확인할 수 없었다.

- code_relationship.revision_no : 관계 Revision (승인 라운드마다 증가)
- cpq_run.rel_basis             : 그 Run 의 전개가 사용한 (rel_id, revision_no) 집합 + 체크섬

Revision ID: 0035_bom_rel_basis
Revises: 0034_product_code_combo
"""
from alembic import op

revision = "0035_bom_rel_basis"
down_revision = "0034_product_code_combo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE code_relationship ADD COLUMN IF NOT EXISTS revision_no INT NOT NULL DEFAULT 1")
    op.execute("ALTER TABLE cpq_run ADD COLUMN IF NOT EXISTS rel_basis JSONB")


def downgrade() -> None:
    op.execute("ALTER TABLE cpq_run DROP COLUMN IF EXISTS rel_basis")
    op.execute("ALTER TABLE code_relationship DROP COLUMN IF EXISTS revision_no")
