"""U17 설계 오류조건 평가 — 순수 로직 (DB·프레임워크 의존 없음).

`dwg_dimension.error_check` 에 설계자가 적어 둔 것은 **정상 범위가 아니라 오류 조건**이다
(예: '④ > 300' = 300 을 넘으면 오류). 따라서 식이 **참이면 위반**이다.

값이 없거나 구문을 해석할 수 없는 경우를 위반으로 몰지 않고 '미평가'로 구분한다 —
경고를 남발하면 실제 위반이 묻히기 때문이다.

DB 를 타지 않으므로 `backend/tests/test_design_rules.py` 에서 단독 유닛 테스트가 가능하다.
"""
from __future__ import annotations

import re
from typing import Callable

# 지원 비교 연산자 (엑셀 감각: 같지 않음은 <>)
OPS: dict[str, Callable[[float, float], bool]] = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "=": lambda a, b: a == b,
    "<>": lambda a, b: a != b,
}

# 좌변 생략 시 자기 값. 긴 연산자를 먼저 매칭해야 '<=' 가 '<' 로 잘리지 않는다.
_RE = re.compile(
    r"^\s*([A-Za-z][\w.]*)?\s*(<=|>=|<>|<|>|=)\s*([A-Za-z][\w.]*|-?\d+(?:\.\d+)?)\s*$")


def evaluate(expr: str, own: float | None,
             values: dict[str, float]) -> tuple[bool | None, str]:
    """오류조건 1건 평가.

    반환 `(위반 여부, 사유/근거)`:
      · `(True,  '670 > 300')`  — 위반 (식이 참)
      · `(False, '670 > 1000')` — 정상
      · `(None,  '…')`          — 미평가 (미설정·구문 불가·값 미정)

    `own` 은 그 치수 자신의 값(좌변 생략 시 사용), `values` 는 치수라벨→값 맵.
    """
    e = (expr or "").strip()
    if not e:
        return None, "미설정"
    m = _RE.match(e)
    if not m:
        return None, f"구문 해석 불가: {e}"
    lhs_name, op, rhs_raw = m.group(1), m.group(2), m.group(3)
    lhs = values.get(lhs_name) if lhs_name else own
    if lhs is None:
        return None, f"좌변 값 미정({lhs_name or '자기 값'})"
    try:
        rhs = float(rhs_raw)
    except ValueError:
        rhs = values.get(rhs_raw)
        if rhs is None:
            return None, f"우변 값 미정({rhs_raw})"
    return OPS[op](lhs, rhs), f"{lhs:g} {op} {rhs:g}"
