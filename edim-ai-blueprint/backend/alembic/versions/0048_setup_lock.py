# -*- coding: utf-8 -*-
"""Set-up↔Operation Lock · 다중 사용자 세션 (요구 #12).

두 가지 공백을 메운다.

1) **Set-up Version Set** — 운영(CPQ Run·견적)은 그때의 Set-up(코드 그룹·항목·값·관계)을 근거로
   돈다. 그런데 Set-up 은 언제든 바뀔 수 있어, "이 운영이 어느 Set-up 을 근거로 했는가"가 없었다.
   게시 시점의 Set-up 내용을 체크섬으로 고정하고, 이후 변화를 drift 로 지적한다(Snapshot 규약과 동일).

2) **Work Lock** — 같은 자원을 두 사람이 동시에 편집하면 나중 저장이 앞 저장을 조용히 덮었다.
   자원 단위로 점유를 선언하고, 다른 사람이 잡고 있으면 **누가 언제까지** 잡았는지 알려준다.

Revision ID: 0048_setup_lock
Revises: 0047_drawing_job
"""
from alembic import op

revision = "0048_setup_lock"
down_revision = "0047_drawing_job"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_setup_version (
          setup_version_id BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          version_no  INT NOT NULL,
          status      VARCHAR(12) NOT NULL DEFAULT 'PUBLISHED',
          checksum    VARCHAR(64) NOT NULL,
          counts      JSONB NOT NULL DEFAULT '{}'::jsonb,
          note        VARCHAR(300),
          published_by VARCHAR(50),
          published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT ck_setupver_status CHECK (status IN ('PUBLISHED','SUPERSEDED')),
          UNIQUE (tenant_id, version_no)
        )""")
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_setup_active
                  ON sys_setup_version (tenant_id) WHERE status='PUBLISHED'""")
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_work_lock (
          lock_id     BIGSERIAL PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          resource_kind VARCHAR(20) NOT NULL,
          resource_key  VARCHAR(150) NOT NULL,
          holder_id   BIGINT NOT NULL,
          acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at  TIMESTAMPTZ NOT NULL,
          note        VARCHAR(200)
        )""")
    # 같은 자원에 유효 점유는 하나뿐 (만료분은 해제 시 지운다)
    op.execute("""CREATE UNIQUE INDEX IF NOT EXISTS ux_work_lock_resource
                  ON sys_work_lock (tenant_id, resource_kind, resource_key)""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_work_lock")
    op.execute("DROP TABLE IF EXISTS sys_setup_version")
