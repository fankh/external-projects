# -*- coding: utf-8 -*-
"""BOM Snapshot + ERP Handoff 최소 상태기계 (신규요구 트리아지 #39/#41/#44~47/#49).

Run 완료 시 BOM 전개 결과를 cpq_run.bom_snapshot 으로 고정하고,
ERP 는 승인된 Handoff 만 수신한다 (validated→approval_requested→approved→accepted,
변경은 새 Version — 이전 건 superseded_by).

Revision ID: 0028_handoff_snapshot
Revises: 0027_run_is_test
"""
from alembic import op

revision = "0028_handoff_snapshot"
down_revision = "0027_run_is_test"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE cpq_run ADD COLUMN IF NOT EXISTS bom_snapshot JSONB")
    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_handoff (
          handoff_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tenant_id BIGINT NOT NULL,
          project_no VARCHAR(50) NOT NULL,
          run_id BIGINT NOT NULL,
          version INT NOT NULL DEFAULT 1,
          status VARCHAR(20) NOT NULL DEFAULT 'validated'
            CHECK (status IN ('validated','approval_requested','approved','rejected','accepted','superseded')),
          validation JSONB,
          superseded_by BIGINT,
          created_by VARCHAR(50),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          decided_at TIMESTAMPTZ,
          accepted_at TIMESTAMPTZ
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_erp_handoff_project ON erp_handoff (tenant_id, project_no)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS erp_handoff")
    op.execute("ALTER TABLE cpq_run DROP COLUMN IF EXISTS bom_snapshot")
