# -*- coding: utf-8 -*-
"""Head Registry (요구 #14·#19·#21) — 권한 기반 Head 표시·선택 + 편집 상태기계 + Publish 무결성 게이트.

EP2 슬라이드 56: Head 는 다단계 구조로 개발자용/기업 관리자용/사용자(Set-up·일반)용이 나뉘고,
각 Head 마다 Sub Item 과 Hierarchy 연결을 따로 설정한다. 2.0 의 프로세스 패널(#17)은
"한 Head 안의 좌측 바인딩"에 해당하고, 그 위의 Head 계층 자체가 없었다.

- sys_head         : Head 정의(코드·이름·유형·최소 열람 레벨·상태·순서)
- sys_head_binding : Head별 좌/중/우 패널 바인딩 (#17 을 Head 단위로 확장)

상태기계(#21): DRAFT → REVIEW(승인 요청) → APPROVED → PUBLISHED.
게시 게이트(#19): CENTER 패널 바인딩이 없는 Head 는 PUBLISHED 로 갈 수 없다.

Revision ID: 0037_head_registry
Revises: 0036_file_role
"""
from alembic import op

revision = "0037_head_registry"
down_revision = "0036_file_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_head (
          head_id     BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          head_code   VARCHAR(30) NOT NULL,
          head_name   VARCHAR(100) NOT NULL,
          head_type   VARCHAR(10) NOT NULL DEFAULT 'TENANT',
          min_level   VARCHAR(10) NOT NULL DEFAULT 'GENERAL',
          status      VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          sort_order  INT NOT NULL DEFAULT 0,
          note        VARCHAR(300),
          created_by  VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by  VARCHAR(50), updated_at TIMESTAMPTZ,
          CONSTRAINT ck_head_type  CHECK (head_type IN ('SYSTEM','TENANT')),
          CONSTRAINT ck_head_level CHECK (min_level IN ('GENERAL','SETUP','ADMIN','PLATFORM')),
          CONSTRAINT ck_head_status CHECK (status IN ('DRAFT','REVIEW','APPROVED','PUBLISHED','RETIRED')),
          UNIQUE (tenant_id, head_code)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_head_tenant ON sys_head (tenant_id, status, sort_order)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_head_binding (
          binding_id  BIGSERIAL PRIMARY KEY,
          head_id     BIGINT NOT NULL REFERENCES sys_head ON DELETE CASCADE,
          panel       VARCHAR(8) NOT NULL,
          target_kind VARCHAR(10) NOT NULL DEFAULT 'SCREEN',
          target_ref  VARCHAR(200) NOT NULL,
          label       VARCHAR(100),
          sort_order  INT NOT NULL DEFAULT 0,
          CONSTRAINT ck_head_panel CHECK (panel IN ('LEFT','CENTER','RIGHT')),
          CONSTRAINT ck_head_target CHECK (target_kind IN ('SCREEN','PROCESS','TEMPLATE'))
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_head_binding ON sys_head_binding (head_id, panel, sort_order)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_head_binding")
    op.execute("DROP TABLE IF EXISTS sys_head")
