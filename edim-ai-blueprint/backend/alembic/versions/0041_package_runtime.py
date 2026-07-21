# -*- coding: utf-8 -*-
"""Package Runtime 연결·Rollback (요구 #63).

0040 으로 패키지가 PUBLISHED 까지 갈 수 있게 됐지만, **어느 버전이 실제로 동작하는가**를
가리키는 것이 없었다. 같은 코드의 v1·v2 가 모두 PUBLISHED 여도 런타임이 무엇을 쓰는지 불명확.

is_active 포인터로 "지금 도는 버전"을 명시한다.
  · 코드당 활성은 최대 1개 (부분 유니크)
  · 게시 = 그 버전을 활성으로, 나머지 버전은 비활성 (이력은 PUBLISHED 로 남는다)
  · Rollback = 과거 PUBLISHED 버전을 다시 활성으로 (되돌려도 기록은 지우지 않는다)

Revision ID: 0041_package_runtime
Revises: 0040_toolbox_package
"""
from alembic import op

revision = "0041_package_runtime"
down_revision = "0040_toolbox_package"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE tbx_package ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE tbx_package ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ")
    # 코드당 활성 버전은 하나뿐
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_pkg_active
                  ON tbx_package (tenant_id, package_code) WHERE is_active""")
    # 이미 게시된 것이 있으면 최신 버전을 활성으로 승격 (도입 시 런타임 공백 방지)
    op.execute("""UPDATE tbx_package p SET is_active = true, activated_at = now()
                  WHERE p.status='PUBLISHED' AND p.version_no = (
                    SELECT max(q.version_no) FROM tbx_package q
                    WHERE q.tenant_id=p.tenant_id AND q.package_code=p.package_code
                      AND q.status='PUBLISHED')""")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ux_pkg_active")
    op.execute("ALTER TABLE tbx_package DROP COLUMN IF EXISTS activated_at")
    op.execute("ALTER TABLE tbx_package DROP COLUMN IF EXISTS is_active")
