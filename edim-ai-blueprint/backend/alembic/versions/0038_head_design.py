# -*- coding: utf-8 -*-
"""Head Design 분리 관리 (요구 #18) — 표시 순서·가시성·Pin·KPI 를 구조와 분리.

0037 의 sys_head/sys_head_binding 은 **구조**(무엇이 어디에 붙는가)다.
표시 방식(순서·숨김·고정·KPI)은 구조와 수명주기가 다르다 — 구조는 승인·게시를 거치지만
표시는 관리자가 즉시 바꾸거나 사용자가 개인화한다. 그래서 별도 테이블로 분리한다.

scope: TENANT(관리자 기본값) · USER(개인 덮어쓰기). 조회는 USER > TENANT > sys_head 기본 순.

Revision ID: 0038_head_design
Revises: 0037_head_registry
"""
from alembic import op

revision = "0038_head_design"
down_revision = "0037_head_registry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_head_design (
          design_id   BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          head_id     BIGINT NOT NULL REFERENCES sys_head ON DELETE CASCADE,
          scope       VARCHAR(8) NOT NULL DEFAULT 'TENANT',
          user_id     BIGINT,
          visible     BOOLEAN NOT NULL DEFAULT true,
          pinned      BOOLEAN NOT NULL DEFAULT false,
          display_order INT NOT NULL DEFAULT 0,
          kpi_keys    JSONB NOT NULL DEFAULT '[]'::jsonb,
          updated_by  VARCHAR(50), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_head_design_scope CHECK (scope IN ('TENANT','USER')),
          CONSTRAINT ck_head_design_user  CHECK ((scope='USER') = (user_id IS NOT NULL))
        )""")
    # 같은 Head 에 대해 테넌트 기본은 1행, 사용자 개인화도 1행
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_head_design_tenant
                  ON sys_head_design (head_id) WHERE scope='TENANT'""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_head_design_user
                  ON sys_head_design (head_id, user_id) WHERE scope='USER'""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_head_design")
