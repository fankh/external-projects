# -*- coding: utf-8 -*-
"""Idempotency-Key 저장소 (18.45).

개발표준 §3 은 "생성 계열은 `Idempotency-Key` 헤더 지원 (재시도 안전)" 을 규정하는데
**구현이 하나도 없었다**. 헤더를 보내도 무시되고 매번 새 행이 생긴다 — 운영 실측:
같은 요청 4회(그중 2회는 같은 Idempotency-Key) → 원가 실적 4행 생성.
재시도·더블클릭이 그대로 **원가 이중 계상**이 된다.

설계: 키를 **먼저 선점**하고 작업한다. 작업 후 저장하면 동시 요청 두 개가 모두 조회를
빗나가 둘 다 실행된다(그 뒤 키 저장에서만 충돌한다 — 이미 늦었다).
  1) INSERT ... ON CONFLICT DO NOTHING 으로 키 행을 선점
  2) 선점 실패 = 이미 처리됐거나 처리 중 → 저장된 응답을 돌려주거나 409
  3) 작업 후 응답을 그 행에 기록

보존 기간은 운영 부담을 감안해 짧게 둔다(재시도는 즉시 일어난다) — 정리는 별도 배치가
아니라 조회 시점의 만료 판정으로 처리한다.

Revision ID: 0061_idempotency
Revises: 0060_verify_rule_macro
"""
from alembic import op

revision = "0061_idempotency"
down_revision = "0060_verify_rule_macro"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sys_idempotency (
          idem_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tenant_id   BIGINT NOT NULL,
          idem_key    VARCHAR(120) NOT NULL,
          endpoint    VARCHAR(120) NOT NULL,
          status      VARCHAR(12) NOT NULL DEFAULT 'RUNNING',
          response    JSONB,
          actor_id    BIGINT,
          created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (tenant_id, idem_key, endpoint),
          CONSTRAINT ck_sys_idempotency_status CHECK (status IN ('RUNNING', 'DONE'))
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sys_idempotency_created "
               "ON sys_idempotency (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_sys_idempotency_tenant_fk "
               "ON sys_idempotency (tenant_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS sys_idempotency")
