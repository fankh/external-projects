# -*- coding: utf-8 -*-
"""견적에 원가 근거 완전성 스냅샷 (11.9).

단가 미해결 품목은 0 원으로 원가에 들어가고, 그 축소된 금액이 매출→견적가로 그대로
이어진다(11.6). PCR 은 그 사실을 표시하게 됐지만 **견적 확정은 그대로 통과**시켰다 —
한쪽에서만 막으면 통제가 아니다.

근거를 PCR 에서 조인해 읽지 않고 견적에 **스냅샷**으로 남기는 이유: PCR 은 upsert 로
덮어써지므로, 나중에 다시 만든 PCR 의 근거가 이미 발행된 견적의 근거로 소급 표시된다.
상업 문서는 발행 시점의 근거가 남아야 한다.

Revision ID: 0055_quotation_basis
Revises: 0054_anomaly_security
"""
from alembic import op

revision = "0055_quotation_basis"
down_revision = "0054_anomaly_security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE cst_quotation "
        "ADD COLUMN IF NOT EXISTS unpriced_count integer NOT NULL DEFAULT 0")
    op.execute(
        "ALTER TABLE cst_quotation "
        "ADD COLUMN IF NOT EXISTS unpriced_codes jsonb NOT NULL DEFAULT '[]'::jsonb")
    # 기존 견적은 발행 시점 근거를 알 수 없다 — 0/[] 로 두면 '근거 완전' 으로 오표시되므로
    # 미상(-1)으로 구분한다. 조회는 -1 을 '확인 불가' 로 표시한다.
    op.execute(
        "UPDATE cst_quotation SET unpriced_count = -1 WHERE created_at < now()")


def downgrade() -> None:
    op.execute("ALTER TABLE cst_quotation DROP COLUMN IF EXISTS unpriced_codes")
    op.execute("ALTER TABLE cst_quotation DROP COLUMN IF EXISTS unpriced_count")
