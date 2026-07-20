# -*- coding: utf-8 -*-
"""정보 접근 권한·마스킹 (요구 #4/#6) — 작업 권한과 분리된 열람 통제.

역할 × 정보그룹 → 모드(full/masked/summary/hidden/no_download) + 기간 한정 임시 접근.
미설정 = full (기존 동작 보존 — 기존 계정·스위트 무영향).

Revision ID: 0031_info_access
Revises: 0030_user_mfa
"""
from alembic import op

revision = "0031_info_access"
down_revision = "0030_user_mfa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_info_access (
            info_access_id  BIGSERIAL PRIMARY KEY,
            tenant_id       BIGINT NOT NULL,
            role_name       VARCHAR(50) NOT NULL,
            info_group      VARCHAR(30) NOT NULL,
            mode            VARCHAR(20) NOT NULL DEFAULT 'full',
            updated_by      VARCHAR(50),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (tenant_id, role_name, info_group)
        )""")
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_temp_access (
            temp_access_id  BIGSERIAL PRIMARY KEY,
            tenant_id       BIGINT NOT NULL,
            user_id         BIGINT NOT NULL,
            info_group      VARCHAR(30) NOT NULL,
            mode            VARCHAR(20) NOT NULL DEFAULT 'full',
            reason          TEXT,
            granted_by      BIGINT,
            valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
            valid_to        TIMESTAMPTZ NOT NULL,
            revoked         BOOLEAN NOT NULL DEFAULT false,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS idx_temp_access_user "
               "ON sys_temp_access (tenant_id, user_id, info_group, valid_to)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_temp_access")
    op.execute("DROP TABLE IF EXISTS sys_info_access")
