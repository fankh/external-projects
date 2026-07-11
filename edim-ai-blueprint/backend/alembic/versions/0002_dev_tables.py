# -*- coding: utf-8 -*-
"""dev tables — 운영자 요구사항 접수함 (개발서버 도구, 54-테이블 설계 스키마 외).

시드의 _ensure_dev_table 에서 이관 — 스키마 생성은 마이그레이션이 담당(C6),
시드는 데이터만 담당한다.

Revision ID: 0002_dev_tables
Revises: 0001_base
"""
from alembic import op

revision = "0002_dev_tables"
down_revision = "0001_base"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS dev_requirement (
        req_id      SERIAL PRIMARY KEY,
        tenant_id   INT NOT NULL,
        screen_id   VARCHAR(50),
        category    VARCHAR(20)  NOT NULL DEFAULT 'CHANGE',
        title       VARCHAR(200) NOT NULL,
        content     TEXT         NOT NULL DEFAULT '',
        priority    VARCHAR(10)  NOT NULL DEFAULT 'P2',
        status      VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
        requester   VARCHAR(50)  NOT NULL,
        resolution  TEXT,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ)""")
    op.execute("""CREATE TABLE IF NOT EXISTS dev_requirement_image (
        image_id    SERIAL PRIMARY KEY,
        req_id      INT NOT NULL REFERENCES dev_requirement(req_id) ON DELETE CASCADE,
        file_name   VARCHAR(200) NOT NULL,
        file_path   VARCHAR(300) NOT NULL,
        file_size   INT NOT NULL,
        content_type VARCHAR(60) NOT NULL DEFAULT 'image/png',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now())""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dev_requirement_image")
    op.execute("DROP TABLE IF EXISTS dev_requirement")
