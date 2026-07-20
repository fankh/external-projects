# -*- coding: utf-8 -*-
"""사용자 선택적 MFA (트리아지 #10) — TOTP(RFC 6238) opt-in.

활성화한 사용자만 로그인 2단계(OTP) — 데모 계정·기존 스위트 무영향.

Revision ID: 0030_user_mfa
Revises: 0029_hierarchy_attrs
"""
from alembic import op

revision = "0030_user_mfa"
down_revision = "0029_hierarchy_attrs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64)")
    op.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    op.execute("ALTER TABLE sys_user DROP COLUMN IF EXISTS mfa_enabled")
    op.execute("ALTER TABLE sys_user DROP COLUMN IF EXISTS totp_secret")
