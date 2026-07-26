# -*- coding: utf-8 -*-
"""code_item_value.approval_status 에 DEPRECATED 추가 (17.7) — 0058 의 누락 수정.

0058 에서 "코드의 쓰기 경로를 전수로 모아 집합을 정했다" 고 적었지만 실제로는 빠뜨렸다.
`patch_code_value` 의 폐기 처리(`sets["approval_status"] = "DEPRECATED"`)는 SET 절을 dict 로
조립하기 때문에 `approval_status=%s` 형태의 검색에 걸리지 않는다 — 8.8 의 수작업 점검이
같은 지점을 놓쳤던 것과 **같은 이유**이고, 그 사실이 바로 위 주석에 적혀 있는데도 반복했다.

결과: Variant 값 폐기(F5·S-1-2)가 CHECK 위반으로 500. 플릿의 live_f5_updates 가 잡았다.

이후 열거는 함수 단위(그 함수가 이 테이블에 쓰는가 → 그 함수 안의 대문자 리터럴)로 한다.
줄 기준 창(window)으로 훑으면 dict 조립처럼 컬럼명과 테이블명이 떨어져 있는 경우를 놓친다.

Revision ID: 0059_value_deprecated
Revises: 0058_status_check
"""
from alembic import op

revision = "0059_value_deprecated"
down_revision = "0058_status_check"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE code_item_value DROP CONSTRAINT IF EXISTS "
               "ck_code_item_value_approval_status")
    op.execute("""ALTER TABLE code_item_value ADD CONSTRAINT
        ck_code_item_value_approval_status CHECK (approval_status IN
        ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'DEPRECATED'))""")


def downgrade() -> None:
    op.execute("ALTER TABLE code_item_value DROP CONSTRAINT IF EXISTS "
               "ck_code_item_value_approval_status")
    op.execute("""ALTER TABLE code_item_value ADD CONSTRAINT
        ck_code_item_value_approval_status CHECK (approval_status IN
        ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))""")
