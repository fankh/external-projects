"""U5 창고·자재 심화 (슬라이드 46) — 유통기한·창고 정기점검 실적·대체 자재.

- inv_movement.expiry_date: 입고 로트 유통기한 (만료 임박 경고 근거)
- erp_wh_inspection: 창고 위치 정기점검 실적 (검사주기 필드는 B19 기구현 — 실적 기록 신설)
- prt_part_substitute: 부품 대체 관계 (자기 자신 금지·쌍 유일)

Revision ID: 0023_warehouse_depth
Revises: 0022_stock_valuation
"""
from alembic import op

revision = "0023_warehouse_depth"
down_revision = "0022_stock_valuation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inv_movement ADD COLUMN IF NOT EXISTS expiry_date DATE")
    op.execute("""
        CREATE TABLE IF NOT EXISTS erp_wh_inspection (
          inspection_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tenant_id     BIGINT NOT NULL,
          location_code VARCHAR(50) NOT NULL,
          result        VARCHAR(10) NOT NULL CHECK (result IN ('OK','ISSUE')),
          note          VARCHAR(300),
          inspected_by  VARCHAR(50) NOT NULL,
          inspected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )""")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wh_inspection_loc ON erp_wh_inspection (tenant_id, location_code, inspected_at DESC)")
    op.execute("""
        CREATE TABLE IF NOT EXISTS prt_part_substitute (
          sub_id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tenant_id          BIGINT NOT NULL,
          part_id            BIGINT NOT NULL REFERENCES prt_part,
          substitute_part_id BIGINT NOT NULL REFERENCES prt_part,
          note               VARCHAR(300),
          created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_part_substitute UNIQUE (tenant_id, part_id, substitute_part_id),
          CONSTRAINT ck_part_substitute_self CHECK (part_id <> substitute_part_id)
        )""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS prt_part_substitute")
    op.execute("DROP TABLE IF EXISTS erp_wh_inspection")
    op.execute("ALTER TABLE inv_movement DROP COLUMN IF EXISTS expiry_date")
