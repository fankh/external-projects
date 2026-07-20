# -*- coding: utf-8 -*-
"""Snapshot 레지스트리 (요구 #9) — 실행 결과를 Snapshot ID 로 고정·재현.

Run 시점의 선택/BOM/원가/산출물을 payload 로 동결하고 checksum 으로 무결성을 보장한다.
ERP Handoff 는 Snapshot 을 참조해 "무엇을 근거로 넘겼는가"가 ID 하나로 추적된다.

Revision ID: 0032_snapshot_registry
Revises: 0031_info_access
"""
from alembic import op

revision = "0032_snapshot_registry"
down_revision = "0031_info_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_snapshot (
            snapshot_id     BIGSERIAL PRIMARY KEY,
            tenant_id       BIGINT NOT NULL,
            snapshot_code   VARCHAR(40) NOT NULL,
            snapshot_type   VARCHAR(30) NOT NULL DEFAULT 'CPQ_RUN',
            source_id       BIGINT NOT NULL,
            version_no      INTEGER NOT NULL DEFAULT 1,
            payload         JSONB NOT NULL,
            checksum        VARCHAR(64) NOT NULL,
            note            TEXT,
            created_by      BIGINT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, snapshot_code)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_snapshot_source "
               "ON sys_snapshot (tenant_id, snapshot_type, source_id)")
    op.execute("ALTER TABLE erp_handoff ADD COLUMN IF NOT EXISTS snapshot_id BIGINT")


def downgrade() -> None:
    op.execute("ALTER TABLE erp_handoff DROP COLUMN IF EXISTS snapshot_id")
    op.execute("DROP TABLE IF EXISTS sys_snapshot")
