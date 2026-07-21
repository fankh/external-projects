# -*- coding: utf-8 -*-
"""Command Button Binding (요구 #59) — Button = Command 실행객체, Context 는 ID 기준.

UI 버튼은 지금까지 '무엇을 실행하는가'가 화면 정의 안에 자유 텍스트로만 있었다. 그래서
  · 어떤 버튼이 무엇을 실행하는지 목록화·감사할 수 없고
  · 실행에 필요한 컨텍스트를 화면이 임의 payload 로 실어 보낼 수 있었다
    (ID 대신 값 뭉치를 넘기면 서버가 받은 값을 그대로 믿게 된다)

Command 를 선언 객체로 만들고, 버튼은 그 코드를 참조하며, 컨텍스트는 **선언된 ID 키만** 받는다.

Revision ID: 0044_command_registry
Revises: 0043_binding_contract
"""
from alembic import op

revision = "0044_command_registry"
down_revision = "0043_binding_contract"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tbx_command (
          command_id   BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          command_code VARCHAR(40) NOT NULL,
          command_name VARCHAR(150) NOT NULL,
          handler_kind VARCHAR(10) NOT NULL DEFAULT 'MACRO',
          handler_ref  VARCHAR(150) NOT NULL,
          required_context JSONB NOT NULL DEFAULT '[]'::jsonb,
          status       VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          note         VARCHAR(300),
          created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by   VARCHAR(50), updated_at TIMESTAMPTZ,
          CONSTRAINT ck_cmd_kind   CHECK (handler_kind IN ('MACRO','SCREEN','API')),
          CONSTRAINT ck_cmd_status CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
          UNIQUE (tenant_id, command_code)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_command_tenant ON tbx_command (tenant_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tbx_command")
