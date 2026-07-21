# -*- coding: utf-8 -*-
"""고객 로고 참조 모델 (요구 #20) — customer_company_id 참조 + 승인본만 표시.

종전: 로고는 sys_tenant.settings 에 base64 한 장으로만 있었다(자사 로고, 승인 개념 없음).
견적서·승인도서에 **고객사** 로고가 필요해지면 문서마다 이미지를 복사해 넣는 수밖에 없어,
(1) 로고가 바뀌면 과거·미래 문서가 제각각이 되고
(2) 검토를 거치지 않은 로고가 그대로 고객 문서에 실릴 수 있었다.

참조 모델로 바꾼다:
  · 문서는 이미지를 복사하지 않고 customer_company_id 를 **참조**한다
  · 로고는 버전을 갖고 승인을 거친다
  · 표시 경로는 **APPROVED 만** 돌려준다 — 승인 안 된 최신본이 있어도 내보내지 않는다

Revision ID: 0050_customer_logo
Revises: 0049_erp_workflow
"""
from alembic import op

revision = "0050_customer_logo"
down_revision = "0049_erp_workflow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_company (
          customer_company_id BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          company_code VARCHAR(30) NOT NULL,
          company_name VARCHAR(150) NOT NULL,
          status       VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
          note         VARCHAR(300),
          created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_custco_status CHECK (status IN ('ACTIVE','INACTIVE')),
          UNIQUE (tenant_id, company_code)
        )""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS customer_logo_asset (
          logo_asset_id BIGSERIAL PRIMARY KEY,
          tenant_id     BIGINT NOT NULL,
          customer_company_id BIGINT NOT NULL
                        REFERENCES customer_company ON DELETE CASCADE,
          version_no    INT NOT NULL,
          logo_data     TEXT NOT NULL,
          checksum      VARCHAR(64) NOT NULL,
          approval_status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
          reject_reason VARCHAR(300),
          requested_by  VARCHAR(50),
          requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          approved_by   VARCHAR(50),
          approved_at   TIMESTAMPTZ,
          CONSTRAINT ck_logo_status
            CHECK (approval_status IN ('PENDING','APPROVED','REJECTED','SUPERSEDED')),
          UNIQUE (customer_company_id, version_no)
        )""")
    # 고객사당 표시본(APPROVED)은 하나뿐 — "어느 로고가 나가는가"에 답이 둘일 수 없다
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_logo_approved
                  ON customer_logo_asset (customer_company_id)
                  WHERE approval_status='APPROVED'""")

    # 문서는 이미지를 복사하지 않고 고객사를 참조한다
    op.execute("""ALTER TABLE doc_control
                  ADD COLUMN IF NOT EXISTS customer_company_id BIGINT
                  REFERENCES customer_company ON DELETE SET NULL""")


def downgrade() -> None:
    op.execute("ALTER TABLE doc_control DROP COLUMN IF EXISTS customer_company_id")
    op.execute("DROP TABLE IF EXISTS customer_logo_asset")
    op.execute("DROP TABLE IF EXISTS customer_company")
