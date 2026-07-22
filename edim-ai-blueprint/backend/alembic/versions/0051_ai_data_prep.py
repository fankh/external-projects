# -*- coding: utf-8 -*-
"""AI 학습·RCCS Data 정리 거버넌스 (요구 #66·#67) — 구조·권한 골격만 선반영.

근거: EDIM_PRIVATE_AI_CUSTOMER_LEARNING_GOVERNANCE_2026_07_19.md §13,
     EDIM_AI_LEARNING_RCCS_DATA_PREPARATION_SPEC_2026_07_18.md §7·§8·§10.

핵심은 **거버넌스 불변식**이지 생성 그 자체가 아니다(생성은 크레딧 대기·2차). 이번 범위:
  · 고객 자료는 고객사별로 분리 — 다른 고객 AI 에 절대 섞이지 않는다(교차 테넌트 차단)
  · AI 결과는 **항상 Draft 로 시작**, 운영 반영은 사람 검증·승인을 거친다
  · 역할 분리 — Tenant 는 자료 제공·요청·결과 조회, **EDIM 개발자만** 분석·검증·Import Package·반영
  · cross_tenant_learning_allowed 를 기록(기본 금지)

실제 추출(도면·문서·Vector)과 Published RCCS 반영은 §10 후반(2차)·크레딧 대기라 제외한다
(#50 에서 Instance/Task 를 제외한 것과 같은 '구조 먼저' 원칙).

Revision ID: 0051_ai_data_prep
Revises: 0050_customer_logo
"""
from alembic import op

revision = "0051_ai_data_prep"
down_revision = "0050_customer_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_prep_project (
          project_id   BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          project_code VARCHAR(40) NOT NULL,
          project_name VARCHAR(150) NOT NULL,
          purpose      VARCHAR(300),
          source_scope VARCHAR(300),
          confidentiality VARCHAR(12) NOT NULL DEFAULT 'NORMAL',
          retention_policy VARCHAR(60),
          ai_training_allowed BOOLEAN NOT NULL DEFAULT FALSE,
          cross_tenant_learning_allowed BOOLEAN NOT NULL DEFAULT FALSE,
          status       VARCHAR(12) NOT NULL DEFAULT 'REQUESTED',
          requested_by VARCHAR(50) NOT NULL DEFAULT 'system',
          assigned_developer VARCHAR(50),
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_aiproj_status
            CHECK (status IN ('REQUESTED','ANALYZING','REVIEW','PACKAGED','APPLIED','REJECTED')),
          CONSTRAINT ck_aiproj_conf
            CHECK (confidentiality IN ('NORMAL','SENSITIVE','SECRET')),
          UNIQUE (tenant_id, project_code)
        )""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_source_asset (
          asset_id     BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          project_id   BIGINT NOT NULL REFERENCES ai_prep_project ON DELETE CASCADE,
          file_id      BIGINT,
          asset_type   VARCHAR(20) NOT NULL DEFAULT 'DOCUMENT',
          file_name    VARCHAR(200) NOT NULL,
          source_description VARCHAR(300),
          confidentiality VARCHAR(12) NOT NULL DEFAULT 'NORMAL',
          usage_permission_status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_aiasset_use
            CHECK (usage_permission_status IN ('PENDING','APPROVED','REJECTED'))
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_aiasset_project ON ai_source_asset (project_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_mapping_candidate (
          candidate_id BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          project_id   BIGINT NOT NULL REFERENCES ai_prep_project ON DELETE CASCADE,
          target_object_type VARCHAR(30) NOT NULL,
          candidate_name VARCHAR(150) NOT NULL,
          candidate_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          confidence_score  NUMERIC(4,3) NOT NULL DEFAULT 0,
          duplicate_risk_score NUMERIC(4,3) NOT NULL DEFAULT 0,
          conflict_risk_score  NUMERIC(4,3) NOT NULL DEFAULT 0,
          status       VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_aicand_status
            CHECK (status IN ('DRAFT','REVIEWED','REJECTED','IMPORTED'))
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_aicand_project ON ai_mapping_candidate (project_id)")

    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_developer_review (
          review_id    BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          candidate_id BIGINT NOT NULL REFERENCES ai_mapping_candidate ON DELETE CASCADE,
          reviewer     VARCHAR(50) NOT NULL,
          review_status VARCHAR(12) NOT NULL,
          review_comment VARCHAR(300),
          reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_airev_status CHECK (review_status IN ('APPROVED','REJECTED','CORRECTED'))
        )""")

    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_import_package (
          package_id   BIGSERIAL PRIMARY KEY,
          tenant_id    BIGINT NOT NULL,
          project_id   BIGINT NOT NULL REFERENCES ai_prep_project ON DELETE CASCADE,
          package_name VARCHAR(150) NOT NULL,
          included_candidate_count INT NOT NULL DEFAULT 0,
          validation_status VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          status       VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          applied_at   TIMESTAMPTZ,
          CONSTRAINT ck_aipkg_status CHECK (status IN ('DRAFT','APPROVED','APPLIED','REJECTED'))
        )""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_import_package")
    op.execute("DROP TABLE IF EXISTS ai_developer_review")
    op.execute("DROP TABLE IF EXISTS ai_mapping_candidate")
    op.execute("DROP TABLE IF EXISTS ai_source_asset")
    op.execute("DROP TABLE IF EXISTS ai_prep_project")
