# -*- coding: utf-8 -*-
"""Arrangement Family Scope 정합 (요구 #31) — 제품군을 실재하는 코드 그룹으로 묶는다.

arrangement_code.product_family 는 자유 텍스트('AHU')라 어떤 제품군도 참조하지 않았다.
그래서 C-1 제품 선정은 **현재 구성 중인 코드와 무관한 Arrangement 까지 전부** 보여 줬다.
family_group_id 로 실제 code_group 을 가리키게 하고, NULL 은 '전 제품군 공통' 으로 읽는다
(기존 행은 NULL 이므로 도입 무영향).

Revision ID: 0039_arrangement_family
Revises: 0038_head_design
"""
from alembic import op

revision = "0039_arrangement_family"
down_revision = "0038_head_design"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE arrangement_code ADD COLUMN IF NOT EXISTS family_group_id BIGINT")
    # 이름이 그대로 일치하는 그룹이 있으면 자동 연결 (없으면 NULL = 공통)
    op.execute("""UPDATE arrangement_code a SET family_group_id = cg.group_id
                  FROM code_group cg
                  WHERE cg.tenant_id = a.tenant_id AND cg.group_code = a.product_family
                    AND a.family_group_id IS NULL""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_arr_family ON arrangement_code (tenant_id, family_group_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_arr_family")
    op.execute("ALTER TABLE arrangement_code DROP COLUMN IF EXISTS family_group_id")
