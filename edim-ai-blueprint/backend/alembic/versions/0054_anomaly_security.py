# -*- coding: utf-8 -*-
"""sys_anomaly source 에 SECURITY 추가 (9.3) — 보안 이상 승격.

anomaly_scan 이 로그인 실패·자동 잠금을 SECURITY 소스 이상으로 승격하는데,
sys_anomaly_source_check 가 QC/COST/MILESTONE/MANUAL 만 허용해 INSERT 가 500 이었다.
라이브 테스트(live_security_anomaly)가 배포 전에 이 제약 위반을 잡았다.

Revision ID: 0054_anomaly_security
Revises: 0053_history_tenant_idx
"""
from alembic import op

revision = "0054_anomaly_security"
down_revision = "0053_history_tenant_idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE sys_anomaly DROP CONSTRAINT IF EXISTS sys_anomaly_source_check")
    op.execute(
        "ALTER TABLE sys_anomaly ADD CONSTRAINT sys_anomaly_source_check "
        "CHECK (source IN ('QC','COST','MILESTONE','MANUAL','SECURITY'))")


def downgrade() -> None:
    op.execute("ALTER TABLE sys_anomaly DROP CONSTRAINT IF EXISTS sys_anomaly_source_check")
    op.execute(
        "ALTER TABLE sys_anomaly ADD CONSTRAINT sys_anomaly_source_check "
        "CHECK (source IN ('QC','COST','MILESTONE','MANUAL'))")
