# -*- coding: utf-8 -*-
"""sys_history 감사 조회 복합 인덱스 (launch-scale) — 측정 기반.

9.1 은 FK 컬럼을 인덱싱했지만 tenant_id 는 FK 가 아니라 빠졌다. 멀티테넌트에서 tenant_id 는
모든 스코프 쿼리의 선두 필터다. 대상 테이블 감사 결과 tenant_id 인덱스가 없는 것 중 유일하게
규모가 큰 것이 sys_history(약 29,800행, 감사 로그라 계속 증가).

EXPLAIN 실측:
  · 기본 이력 목록(WHERE tenant ORDER BY history_id DESC LIMIT 20) — PK 역스캔, 18 buffers·0.24ms (문제 없음)
  · **D9 감사 필터(WHERE tenant AND acted_at 범위 ORDER BY acted_at)** — 29,814행 **Seq Scan** + top-N 정렬,
    562 buffers. 감사 조회 화면(기간·사용자·작업 필터)이 매번 전체 테이블을 훑는다.

복합 (tenant_id, acted_at DESC) 하나로 그 seq-scan 을 인덱스 범위 스캔으로 바꾼다.
다른 tenant_id 미인덱스 테이블은 전부 1,500행 미만이라 지금은 seq scan 이 더 싸다(과인덱싱 안 함).

Revision ID: 0053_history_tenant_idx
Revises: 0052_fk_indexes
"""
from alembic import op

revision = "0053_history_tenant_idx"
down_revision = "0052_fk_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_sys_history_tenant_acted "
               "ON sys_history (tenant_id, acted_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_sys_history_tenant_acted")
