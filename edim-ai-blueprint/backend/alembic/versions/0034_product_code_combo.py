# -*- coding: utf-8 -*-
"""Product Code Builder (요구 #28 · 핵심 불변식) — 승인된 Sub Code 조합으로만 제품 코드 생성.

기존엔 POST /codes/products 가 mainCode 자유텍스트를 그대로 받아 저장했다.
즉 "이 제품 코드가 어떤 Sub Code 값들의 조합인가"가 DB 에 남지 않아 역추적·중복 조합 차단이 불가능했다.

- code_item_value.revision_no  : Sub Code Revision (승인 단위). 조합은 "승인 시점 Revision" 을 함께 고정한다.
- product_code.combo / combo_hash / origin : 조합 원본(JSONB) + 정규화 SHA-256 + 생성 경로(COMPOSED/MANUAL).
  같은 조합 재생성은 부분 유니크 인덱스로 DB 레벨에서 차단(레거시 MANUAL 행은 NULL 이라 무영향).
- product_code_item.value_id/value_code/revision_no : 슬롯 정의뿐이던 자식 테이블에 "선택된 값" 을 기록.

Revision ID: 0034_product_code_combo
Revises: 0033_process_panel
"""
from alembic import op

revision = "0034_product_code_combo"
down_revision = "0033_process_panel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE code_item_value ADD COLUMN IF NOT EXISTS revision_no INT NOT NULL DEFAULT 1")

    op.execute("ALTER TABLE product_code ADD COLUMN IF NOT EXISTS combo JSONB")
    op.execute("ALTER TABLE product_code ADD COLUMN IF NOT EXISTS combo_hash VARCHAR(64)")
    op.execute("ALTER TABLE product_code ADD COLUMN IF NOT EXISTS origin VARCHAR(12) NOT NULL DEFAULT 'MANUAL'")
    # 같은 조합 = 같은 제품 코드. 레거시(수기) 행은 combo_hash NULL 이라 제약 밖.
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_product_code_combo
                  ON product_code (tenant_id, combo_hash) WHERE combo_hash IS NOT NULL""")

    op.execute("ALTER TABLE product_code_item ADD COLUMN IF NOT EXISTS value_id BIGINT")
    op.execute("ALTER TABLE product_code_item ADD COLUMN IF NOT EXISTS value_code VARCHAR(30)")
    op.execute("ALTER TABLE product_code_item ADD COLUMN IF NOT EXISTS revision_no INT")


def downgrade() -> None:
    op.execute("ALTER TABLE product_code_item DROP COLUMN IF EXISTS revision_no")
    op.execute("ALTER TABLE product_code_item DROP COLUMN IF EXISTS value_code")
    op.execute("ALTER TABLE product_code_item DROP COLUMN IF EXISTS value_id")
    op.execute("DROP INDEX IF EXISTS ux_product_code_combo")
    op.execute("ALTER TABLE product_code DROP COLUMN IF EXISTS origin")
    op.execute("ALTER TABLE product_code DROP COLUMN IF EXISTS combo_hash")
    op.execute("ALTER TABLE product_code DROP COLUMN IF EXISTS combo")
    op.execute("ALTER TABLE code_item_value DROP COLUMN IF EXISTS revision_no")
