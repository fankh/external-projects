# -*- coding: utf-8 -*-
"""Support Request 접근 통제 · Support Package 이중 승인 (요구 #68·#69).

2.9 이후 교차 테넌트 접근은 전면 차단이다. 그런데 EDIM 운영자가 고객사를 지원하려면
고객 자료를 봐야 할 때가 있다 — 지금은 그 경로가 아예 없어 psql 직접 접근 말고는 방법이 없었다
(통제도 기록도 없는 최악의 경로).

#68: 사유·범위·기간을 명시해 요청하고 **고객사가 승인**해야 열리며, 만료되면 자동으로 닫히고
     열람은 전부 감사에 남는다.
#69: 고객사에 배포되는 Support Package 는 **EDIM 검증 + 고객 승인** 둘 다 있어야 게시된다.

Revision ID: 0046_support_access
Revises: 0045_macro_graph
"""
from alembic import op

revision = "0046_support_access"
down_revision = "0045_macro_graph"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_support_request (
          request_id    BIGSERIAL PRIMARY KEY,
          target_tenant_id BIGINT NOT NULL,          -- 자료를 보게 될 고객사
          requester_tenant_id BIGINT NOT NULL,       -- 요청한 EDIM 운영 테넌트
          requester_id  BIGINT NOT NULL,
          reason        VARCHAR(300) NOT NULL,
          scope         JSONB NOT NULL DEFAULT '[]'::jsonb,
          hours         INT NOT NULL DEFAULT 4,
          status        VARCHAR(12) NOT NULL DEFAULT 'REQUESTED',
          decided_by    BIGINT,
          decided_at    TIMESTAMPTZ,
          expires_at    TIMESTAMPTZ,
          comment       VARCHAR(300),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_support_status
            CHECK (status IN ('REQUESTED','APPROVED','REJECTED','REVOKED','EXPIRED'))
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_target ON sys_support_request (target_tenant_id, status)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_support_package (
          sp_id         BIGSERIAL PRIMARY KEY,
          package_id    BIGINT NOT NULL REFERENCES tbx_package ON DELETE CASCADE,
          target_tenant_id BIGINT NOT NULL,
          edim_verified_by BIGINT, edim_verified_at TIMESTAMPTZ,
          customer_approved_by BIGINT, customer_approved_at TIMESTAMPTZ,
          status        VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          note          VARCHAR(300),
          created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_sp_status CHECK (status IN ('DRAFT','VERIFIED','PUBLISHED','REJECTED')),
          UNIQUE (package_id, target_tenant_id)
        )""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_support_package")
    op.execute("DROP TABLE IF EXISTS sys_support_request")
