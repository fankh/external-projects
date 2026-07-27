"""0063 — 감사 조회 facet 인덱스 (18.87).

감사 화면을 열 때마다 드롭다운 두 개를 채우려고 `sys_history` 를 **전수 스캔**하고 있었다.
운영 실측(105,639행·34MB): `DISTINCT action` 49.8ms(Seq Scan, buffers 2,133) ·
`DISTINCT login_id` 61.8ms(Seq Scan). 본 조회 자체는 인덱스를 타 0.6ms 다 —
**목록보다 드롭다운이 100배 비쌌다.**

감사 이력은 보존 정책이 없어 계속 자라므로(#83) 이 비용도 함께 자란다. 100만 행이면
같은 조회가 약 0.5초, 1,000만 행이면 5초대가 된다 — 화면이 느려지는 것을 넘어 규정 대응
조회가 실용성을 잃는다.

사용자 목록은 `sys_user` 에서 직접 얻도록 코드에서 바꿨고(테넌트당 수십 행), 동작 목록은
여기서 인덱스를 더해 Index Only Scan 으로 내린다. `action` 은 카디널리티가 낮아
(현재 20종 미만) 인덱스 항목이 좁고 heap 접근이 없다.

Revision ID: 0063_audit_facet_index
Revises: 0062_pw_changed_at
"""
from alembic import op

revision = "0063_audit_facet_index"
down_revision = "0062_pw_changed_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_sys_history_tenant_action "
        "ON sys_history (tenant_id, action)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_sys_history_tenant_action")
