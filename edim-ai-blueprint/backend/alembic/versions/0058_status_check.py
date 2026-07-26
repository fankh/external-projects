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

Revision ID: 0058_status_check
Revises: 0057_approval_assigned_idx
"""
from alembic import op

revision = "0058_status_check"
down_revision = "0057_approval_assigned_idx"
branch_labels = None
depends_on = None

_CHECKS = [
    # (테이블, 컬럼, 허용 집합)
    ("product_code", "approval_status",
     ("DRAFT", "PENDING", "APPROVED", "REJECTED", "INACTIVE")),
    ("code_relationship", "approval_status",
     ("DRAFT", "PENDING", "APPROVED", "REJECTED")),
    ("code_item_value", "approval_status",
     ("DRAFT", "PENDING", "APPROVED", "REJECTED")),
    ("cst_quotation", "status",
     ("DRAFT", "SENT", "ORDERED", "LOST")),
]


def upgrade() -> None:
    for table, col, allowed in _CHECKS:
        vals = ", ".join(f"'{v}'" for v in allowed)
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS ck_{table}_{col}")
        # 기존 행이 집합 밖이면 마이그레이션이 실패한다 — 실패가 맞다(조용히 넘기면
        # 어떤 값이 돌아다니는지 모른 채로 제약만 생긴다). 적용 전 분포를 확인했다.
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT ck_{table}_{col} "
            f"CHECK ({col} IN ({vals}))")


def downgrade() -> None:
    for table, col, _ in _CHECKS:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS ck_{table}_{col}")
