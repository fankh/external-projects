# -*- coding: utf-8 -*-
"""PLM Code Drawing vs Project Output 이원화 (요구 #53 · 핵심 불변식).

dwg_file 하나에 ① 작도 원본(엔진/편집 대상) ② Run 산출물(제조 deliverable) ③ 접수 자료가
구분 없이 섞여 있었다. 그래서 같은 파일명으로 저장하면 **과거 Run 의 산출물 행이 새 파일로
갈아끼워지는** 실결함이 있었다(요구 #55 '과거 산출물 불변' 위반).

file_role 로 역할을 명시하고, OUTPUT 은 쓰기 경로에서 불변으로 취급한다.
백필: 접수 폴더 → RECEIVED · cpq_output 이 참조하는 행 → OUTPUT · 나머지(임의 작도 저장) → SOURCE.

Revision ID: 0036_file_role
Revises: 0035_bom_rel_basis
"""
from alembic import op

revision = "0036_file_role"
down_revision = "0035_bom_rel_basis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE dwg_file ADD COLUMN IF NOT EXISTS file_role VARCHAR(10) NOT NULL DEFAULT 'OUTPUT'")
    op.execute("UPDATE dwg_file SET file_role='RECEIVED' WHERE folder='RECEIVED'")
    op.execute("""UPDATE dwg_file SET file_role='OUTPUT'
                  WHERE folder <> 'RECEIVED'
                    AND file_id IN (SELECT file_id FROM cpq_output WHERE file_id IS NOT NULL)""")
    op.execute("""UPDATE dwg_file SET file_role='SOURCE'
                  WHERE folder <> 'RECEIVED'
                    AND file_id NOT IN (SELECT file_id FROM cpq_output WHERE file_id IS NOT NULL)""")
    op.execute("""ALTER TABLE dwg_file DROP CONSTRAINT IF EXISTS ck_dwg_file_role""")
    op.execute("""ALTER TABLE dwg_file ADD CONSTRAINT ck_dwg_file_role
                  CHECK (file_role IN ('SOURCE','OUTPUT','RECEIVED'))""")
    # (tenant, project, name) 유니크 인덱스는 두지 않는다 — 라이브에 이미 같은 이름의 SOURCE 행이
    # 9쌍 존재해(과거 CAD 테스트 저장분) 인덱스 생성이 실패하면 배포 자체가 막힌다.
    # 유일성은 앱의 저장 경로(프로젝트+이름+SOURCE 매칭)가 담보한다.
    op.execute("CREATE INDEX IF NOT EXISTS ix_dwg_file_role ON dwg_file (tenant_id, file_role)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_dwg_file_role")
    op.execute("ALTER TABLE dwg_file DROP CONSTRAINT IF EXISTS ck_dwg_file_role")
    op.execute("ALTER TABLE dwg_file DROP COLUMN IF EXISTS file_role")
