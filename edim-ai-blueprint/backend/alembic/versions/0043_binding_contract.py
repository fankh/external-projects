# -*- coding: utf-8 -*-
"""UI Builder Data Binding Contract (요구 #58) — DB 직접 접근 금지, Contract 경유만.

UI Designer 로 만든 화면(tbx_ui_form.layout_def)은 위젯이 어떤 데이터를 읽는지 **자유 텍스트**로
적을 수 있었다. 즉 테이블/컬럼을 직접 가리키는 화면을 만들 수 있고, 그러면
  · 테이블 구조가 바뀔 때 어떤 화면이 깨지는지 알 수 없고
  · 화면이 볼 수 있는 컬럼 범위를 통제할 수 없다(정보 접근 통제 1.5 우회)

Contract 를 통해서만 데이터에 닿게 한다: 위젯은 contract 코드를 참조하고,
Contract 가 어떤 원천의 어떤 필드까지 허용하는지 선언한다.

Revision ID: 0043_binding_contract
Revises: 0042_templet_library
"""
from alembic import op

revision = "0043_binding_contract"
down_revision = "0042_templet_library"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tbx_binding_contract (
          contract_id   BIGSERIAL PRIMARY KEY,
          tenant_id     BIGINT NOT NULL,
          contract_code VARCHAR(40) NOT NULL,
          contract_name VARCHAR(150) NOT NULL,
          source_kind   VARCHAR(10) NOT NULL DEFAULT 'TABLE',
          source_ref    VARCHAR(150) NOT NULL,
          allowed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
          status        VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          note          VARCHAR(300),
          created_by    VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by    VARCHAR(50), updated_at TIMESTAMPTZ,
          CONSTRAINT ck_contract_kind CHECK (source_kind IN ('TABLE','MACRO','API')),
          CONSTRAINT ck_contract_status CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
          UNIQUE (tenant_id, contract_code)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_contract_tenant ON tbx_binding_contract (tenant_id, status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tbx_binding_contract")
