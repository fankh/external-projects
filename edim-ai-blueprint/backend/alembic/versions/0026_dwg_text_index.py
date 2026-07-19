"""U10 선행 2단계 — 도면 텍스트 인덱스 (s25 '메타데이터/속성/텍스트 추출 기반').

DXF 의 TEXT/MTEXT·레이어명을 추출해 검색 가능하게 저장 — 내부 Q&A '도면 내용' 검색 원천.

Revision ID: 0026_dwg_text_index
Revises: 0025_design_priority
"""
from alembic import op

revision = "0026_dwg_text_index"
down_revision = "0025_design_priority"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS dwg_text_index (
            file_id BIGINT PRIMARY KEY,
            tenant_id BIGINT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            entity_count INT NOT NULL DEFAULT 0,
            indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_dwg_text_index_tenant ON dwg_text_index (tenant_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS dwg_text_index")
