# -*- coding: utf-8 -*-
"""검증 규칙이 치수 매크로를 판정식으로 쓰던 것을 바로잡는다 (18.36).

문제: `POST /drawings/{no}/verify` 는 규칙 매크로의 값이 **0 이 아니면 통과**로 판정한다
(엔드포인트 규약). 그런데 시드가 붙여 둔 규칙은 치수 매크로였다 — `DIM B = A+56`,
`DIM K = A*1.62`. 치수는 설계값이라 0 이 되는 일이 거의 없으므로 **사실상 항상 합격**이었다.

실측(2026-07-27, 운영):
    A=1000 → K 1,620 (한계 1,500 초과) · B 1,056 (한계 900 초과) → **합격**
    A=5000 → K 8,100 (한계의 5.4배)                              → **합격**
    A=0    → K 0                                                  → 불합격
경고 문구는 "900 을 초과하면", "1,500 초과 시" 라고 임계값을 말하는데 판정은 그 값을 보지
않았다. 즉 **경고 문구가 약속한 검사가 수행되지 않았다.**

조치: 판정 전용 매크로(`CHK B 상한`, `CHK K 간섭`)를 만들고 규칙이 그것을 가리키게 한다.
치수 매크로는 도면 치수를 계산하는 다른 역할이므로 그대로 둔다(한 객체에 두 역할을 겹치면
한쪽을 고칠 때 다른 쪽이 깨진다).

기존 배포 데이터는 시드가 'dwg_verification 이 비어 있을 때만' 넣으므로 갱신되지 않는다 —
그래서 마이그레이션으로 바로잡는다. 이미 판정식을 가리키고 있으면 아무 일도 하지 않는다.

Revision ID: 0060_verify_rule_macro
Revises: 0059_value_deprecated
"""
from alembic import op

revision = "0060_verify_rule_macro"
down_revision = "0059_value_deprecated"
branch_labels = None
depends_on = None

_RULES = [
    ("B 치수 상한 검증", "CHK B 상한 (KDCR 3-13)", "=A+56<=900",
     "B(H) 상한 판정 — 치수식 DIM B 와 같은 식을 임계값과 비교한다"),
    ("K 전장 간섭 검증", "CHK K 간섭 (KDCR 3-13)", "=A*1.62<=1500",
     "K 전장 간섭 판정 — 치수식 DIM K 와 같은 식을 임계값과 비교한다"),
]


def upgrade() -> None:
    for rule, mname, mexpr, mdesc in _RULES:
        # 판정 매크로 생성(테넌트별) — 규칙이 존재하는 테넌트에만 만든다.
        # ON CONFLICT 를 쓰지 않는다: tbx_macro 의 UNIQUE 는 (tenant_id, macro_name, version)
        # 이라 (tenant_id, macro_name) 추론이 맞지 않는다(첫 시도가 그래서 롤백됐다).
        op.execute(f"""
            INSERT INTO tbx_macro (tenant_id, macro_name, macro_expr, description_text,
                                   apply_type, status)
            SELECT DISTINCT v.tenant_id, '{mname}', '{mexpr}', '{mdesc}', 'MACRO', 'APPROVED'
              FROM dwg_verification v
             WHERE v.rule_name = '{rule}'
               AND NOT EXISTS (SELECT 1 FROM tbx_macro m
                                WHERE m.tenant_id = v.tenant_id AND m.macro_name = '{mname}')
        """)
        # 규칙이 판정 매크로를 가리키게 한다
        op.execute(f"""
            UPDATE dwg_verification v
               SET macro_id = m.macro_id, updated_at = now()
              FROM tbx_macro m
             WHERE m.tenant_id = v.tenant_id
               AND m.macro_name = '{mname}'
               AND v.rule_name = '{rule}'
               AND v.macro_id <> m.macro_id
        """)


def downgrade() -> None:
    # 되돌리면 '항상 합격' 상태로 돌아간다 — 의도적으로 되돌리지 않는다.
    # (규칙이 가리키는 매크로만 바뀐 것이므로 데이터 손실은 없다)
    pass
