# -*- coding: utf-8 -*-
"""핵심 승인 상태 컬럼에 CHECK 제약 (17.1).

승인 상태의 허용 집합이 **파이썬에만** 있었다. 예상 밖 값이 들어가면 DB 는 그대로 저장하고,
이후 조회는 `WHERE approval_status='APPROVED'` 로 걸러 내므로 그 행은 **조용히 사라진다**
(승인했는데 목록에 안 보이는 형태). `doc_control.released_status`·`tbx_macro.status` 에는
이미 CHECK 가 있어 두 방식이 섞여 있었다.

부수 효과: 거버넌스 정의서의 '상태흐름' 시트는 CHECK 제약에서 생성되므로, 종전에는
**가장 중요한 승인 테이블들이 문서에서 통째로 빠져 있었다**. 이 제약이 그 공백을 메운다.

허용 집합은 규격(권한승인정의서 승인상태기계)과 코드의 실제 쓰기 경로를 합집합으로 잡았다 —
규격에만 있고 아직 안 쓰는 PENDING 도 포함해, 구현될 때 500 이 나지 않게 한다.

SQL 은 **리터럴로 적는다**. 문서 생성기(tools/gen_governance.py)가 이 파일의 CHECK 를 읽어
상태흐름 시트를 만들기 때문에, f-string 으로 조립하면 제약은 걸리지만 문서에는 안 실린다.
기존 행이 집합 밖이면 마이그레이션이 실패한다 — 실패가 맞다(조용히 넘기면 어떤 값이
돌아다니는지 모른 채 제약만 생긴다). 적용 전 분포를 확인했다.

Revision ID: 0058_status_check
Revises: 0057_approval_assigned_idx
"""
from alembic import op

revision = "0058_status_check"
down_revision = "0057_approval_assigned_idx"
branch_labels = None
depends_on = None

_NAMES = [
    "ck_product_code_approval_status",
    "ck_code_relationship_approval_status",
    "ck_code_item_value_approval_status",
    "ck_cst_quotation_status",
]
_TABLES = ["product_code", "code_relationship", "code_item_value", "cst_quotation"]


def upgrade() -> None:
    for table, name in zip(_TABLES, _NAMES):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
    op.execute("""ALTER TABLE product_code ADD CONSTRAINT
        ck_product_code_approval_status CHECK (approval_status IN
        ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'INACTIVE'))""")
    op.execute("""ALTER TABLE code_relationship ADD CONSTRAINT
        ck_code_relationship_approval_status CHECK (approval_status IN
        ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))""")
    op.execute("""ALTER TABLE code_item_value ADD CONSTRAINT
        ck_code_item_value_approval_status CHECK (approval_status IN
        ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))""")
    op.execute("""ALTER TABLE cst_quotation ADD CONSTRAINT
        ck_cst_quotation_status CHECK (status IN
        ('DRAFT', 'SENT', 'ORDERED', 'LOST'))""")


def downgrade() -> None:
    for table, name in zip(_TABLES, _NAMES):
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}")
