# -*- coding: utf-8 -*-
"""이상 이벤트 통합 (D4/D6/D7 승격) — sys_anomaly.

QC 불합격·원가 차이경보·마일스톤 지연을 하나의 이상 이벤트로 승격 (Dashboard 일원화).
dedup_key 로 중복 방지 (스캔 반복 안전).

Revision ID: 0011_anomaly
Revises: 0010_menu_config
"""
from alembic import op

revision = "0011_anomaly"
down_revision = "0010_menu_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""CREATE TABLE IF NOT EXISTS sys_anomaly (
        anomaly_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id   BIGINT NOT NULL,
        source      VARCHAR(20) NOT NULL
                    CHECK (source IN ('QC','COST','MILESTONE','MANUAL')),
        severity    VARCHAR(10) NOT NULL DEFAULT 'MED'
                    CHECK (severity IN ('HIGH','MED','LOW')),
        title       VARCHAR(300) NOT NULL,
        ref_no      VARCHAR(80),
        dedup_key   VARCHAR(120) NOT NULL,
        status      VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','ACK','RESOLVED')),
        detail      JSONB,
        created_by  VARCHAR(50) NOT NULL DEFAULT 'system',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved_at TIMESTAMPTZ,
        UNIQUE (tenant_id, dedup_key))""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_anomaly_status ON sys_anomaly (tenant_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_anomaly")
