# -*- coding: utf-8 -*-
"""base schema — EDIM 54 테이블 (원천: docs/ddl/edim_schema.sql, 번들 base_schema.sql).

기존 DB(라이브)는 이 리비전을 실행하지 않고 head 로 stamp 한다(테이블 이미 존재).
신규 DB 는 upgrade 시 전체 스키마를 생성한다.

Revision ID: 0001_base
Revises:
"""
import pathlib

from alembic import op

revision = "0001_base"
down_revision = None
branch_labels = None
depends_on = None

_SQL = (pathlib.Path(__file__).resolve().parent.parent / "base_schema.sql").read_text(encoding="utf-8")


def upgrade() -> None:
    # 함수/DO($$) 블록이 없는 순수 DDL — 문장별 실행 (psycopg3 다중문 제약 회피)
    for stmt in _SQL.split(";"):
        if stmt.strip():
            op.execute(stmt)


def downgrade() -> None:
    raise NotImplementedError("base schema — downgrade 미지원 (신규 DB 재생성으로 대체)")
