# -*- coding: utf-8 -*-
"""Drawing Run Job · Parameter Binding (요구 #54) — Snapshot 기준 도면 재생성.

Run 파이프라인은 실행 시점의 살아 있는 값으로 DXF 를 만든다. 그래서 "그때 그 도면을
다시 뽑아 달라"는 요구에 답할 수 없었다 — 원본 치수가 이미 바뀌었을 수 있기 때문이다.

Job 은 **Snapshot 을 근거로** 도면을 만든다:
  · 파라미터는 Snapshot payload 에서 꺼낸다(살아 있는 값을 다시 읽지 않는다)
  · 어떤 payload 경로가 어떤 도면 파라미터가 되는지 param_bindings 로 선언한다
  · 같은 Snapshot + 같은 바인딩이면 항상 같은 산출물(체크섬으로 확인)

Revision ID: 0047_drawing_job
Revises: 0046_support_access
"""
from alembic import op

revision = "0047_drawing_job"
down_revision = "0046_support_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS dwg_run_job (
          job_id      BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          job_code    VARCHAR(40) NOT NULL,
          snapshot_id BIGINT NOT NULL REFERENCES sys_snapshot ON DELETE CASCADE,
          drawing_no  VARCHAR(50),
          param_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
          status      VARCHAR(12) NOT NULL DEFAULT 'DRAFT',
          resolved_params JSONB,
          output_checksum VARCHAR(64),
          output_file_id BIGINT,
          note        VARCHAR(300),
          created_by  VARCHAR(50) NOT NULL DEFAULT 'system',
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          finished_at TIMESTAMPTZ,
          CONSTRAINT ck_job_status CHECK (status IN ('DRAFT','READY','DONE','FAILED')),
          UNIQUE (tenant_id, job_code)
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_dwg_job_snapshot ON dwg_run_job (snapshot_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dwg_run_job")
