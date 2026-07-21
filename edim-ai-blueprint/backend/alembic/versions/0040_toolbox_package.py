# -*- coding: utf-8 -*-
"""Toolbox Program Package 단위·상태기계 (요구 #56, #61 위험도 · #62 Sandbox 전제).

사용자 확장(Macro/UI Form/Templet)은 지금까지 **낱개로 승인·배포**돼, "무엇을 언제 함께
내보냈는가"가 없었고 되돌릴 단위도 없었다. Package 로 묶어 상태기계를 태운다.

상태: DRAFT → GUARD(설계시 검사 통과) → SANDBOX(격리 테스트 통과) → APPROVED(승인) → PUBLISHED(불변)
  · PUBLISHED 는 내용 변경 불가 — 바꾸려면 새 버전(version_no+1)을 만든다
  · 위험도 4등급(LOW/MEDIUM/HIGH/CRITICAL) — CRITICAL 은 EDIM 운영자 승인 필요(#61)
  · 항목은 등록 시점 정의를 snapshot 으로 고정해, 원본이 나중에 바뀌어도 패키지 내용은 불변

Revision ID: 0040_toolbox_package
Revises: 0039_arrangement_family
"""
from alembic import op

revision = "0040_toolbox_package"
down_revision = "0039_arrangement_family"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS tbx_package (
          package_id   BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          package_code VARCHAR(40) NOT NULL,
          package_name VARCHAR(150) NOT NULL,
          version_no   INT NOT NULL DEFAULT 1,
          status       VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          risk_level   VARCHAR(10) NOT NULL DEFAULT 'LOW',
          guard_report JSONB,
          sandbox_report JSONB,
          checksum     VARCHAR(64),
          note         VARCHAR(300),
          created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_by   VARCHAR(50), updated_at TIMESTAMPTZ,
          published_at TIMESTAMPTZ,
          CONSTRAINT ck_pkg_status CHECK (status IN ('DRAFT','GUARD','SANDBOX','APPROVED','PUBLISHED','RETIRED')),
          CONSTRAINT ck_pkg_risk   CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
          UNIQUE (tenant_id, package_code, version_no)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_pkg_tenant ON tbx_package (tenant_id, status)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS tbx_package_item (
          item_id    BIGSERIAL PRIMARY KEY,
          package_id BIGINT NOT NULL REFERENCES tbx_package ON DELETE CASCADE,
          item_type  VARCHAR(10) NOT NULL,
          item_ref   VARCHAR(150) NOT NULL,
          snapshot   JSONB,
          CONSTRAINT ck_pkg_item_type CHECK (item_type IN ('MACRO','FORM','TEMPLET')),
          UNIQUE (package_id, item_type, item_ref)
        )""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tbx_package_item")
    op.execute("DROP TABLE IF EXISTS tbx_package")
