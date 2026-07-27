"""승인 당시의 전개 근거 지문 (19.7 · 요구 #35)

승인된 관계는 **삭제는 막히는데**(DRAFT 한정) 슬롯 매핑은 자유롭게 바뀐다. 매핑은 BOM 이
Child 슬롯을 채우는 유일한 근거이므로, 승인 이후 매핑이 바뀌면 **승인된 것과 지금 돌아가는
것이 다른데도 화면에는 APPROVED 로만 보인다**. Revision 은 올라가지만 '승인 당시 몇이었나'
가 없어 대조할 수 없었다.

제품 코드 조합이 이미 쓰는 방식(comboHash·revDrift)을 그대로 따른다 — 승인 시점의 근거
지문을 남기고, 지금 지문과 다르면 드러낸다. 되돌리면(추가했다 지우면) 지문이 같아지므로
'변경 횟수' 가 아니라 **'지금 내용이 승인된 내용과 같은가'** 를 답한다.

기존 APPROVED 행은 현재 지문으로 채운다 — 도입 시점에 없던 변경을 드리프트로 보고하지
않기 위해서다.
"""
from alembic import op

revision = "0064_rel_approved_basis"
down_revision = "0063_audit_facet_index"
branch_labels = None
depends_on = None

# 근거 지문 — 수량 + 슬롯 매핑 집합(자식 슬롯 순). 앱과 **같은 식**을 써야 하므로
# 라우터의 _REL_BASIS_HASH_SQL 과 문자열이 일치해야 한다.
_HASH = """md5(coalesce(r.quantity::text,'') || '|' || coalesce(
    (SELECT string_agg(m.child_slot || '>' || coalesce(m.mother_slot,'') || '='
                       || coalesce(m.fixed_value,''), ',' ORDER BY m.child_slot)
       FROM code_relationship_slot_map m WHERE m.rel_id = r.rel_id), ''))"""


def upgrade() -> None:
    op.execute("ALTER TABLE code_relationship "
               "ADD COLUMN IF NOT EXISTS approved_basis_hash varchar(64)")
    op.execute(f"UPDATE code_relationship r SET approved_basis_hash = {_HASH} "
               "WHERE r.approval_status = 'APPROVED'")


def downgrade() -> None:
    op.execute("ALTER TABLE code_relationship DROP COLUMN IF EXISTS approved_basis_hash")
