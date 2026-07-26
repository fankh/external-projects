# -*- coding: utf-8 -*-
"""검증 코드 자체의 문법 게이트 (14.2) — tests/·tools/ 전량 컴파일.

14.1 에서 `live_all.py` 의 f-string 개행이 리터럴 개행으로 들어가 러너가 SyntaxError 로
죽었다. 그 결과 플릿은 **스위트를 한 건도 실행하지 못한 채** 끝났는데, 요약만 보면
'실패 0건' 으로 읽혔다 — 러너가 죽으면 결과가 없는 것이지 통과가 아니다.

검증 코드는 제품 코드와 달리 "돌려 보면 안다" 가 통하지 않는다(안 돌아간 것을 통과로
착각하기 때문). 그래서 커밋 전에 문법만이라도 정적으로 확인한다.

실행: py tests/check_test_syntax.py
"""
from __future__ import annotations

import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGETS = [ROOT / "tests", ROOT / "tools"]


def _arity_problems(path: pathlib.Path, tree: ast.Module) -> list[str]:
    """스위트가 자기 파일에 정의한 헬퍼를 **인자 수가 안 맞게** 부르는지 본다 (17.11).

    문법은 맞으니 컴파일은 통과하고, 실행 순간에 TypeError 로 죽는다. 스위트마다 `ok()` 를
    따로 정의하는데 어떤 파일은 `ok(label, cond)`, 어떤 파일은 `ok(label, cond, detail)` 이라
    다른 파일에서 쓰던 형태를 그대로 옮기면 그 지점까지 실행한 뒤에야 드러난다 —
    라이브 스위트는 그 전에 실 데이터를 이미 바꿔 놓았을 수 있다(정리 블록도 못 돈다).
    """
    funcs: dict[str, tuple[int, int, bool]] = {}   # 이름: (필수, 최대, *args 여부)
    for node in tree.body:                          # 모듈 최상위 정의만 본다
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            a = node.args
            pos = len(a.posonlyargs) + len(a.args)
            req = pos - len(a.defaults)
            funcs[node.name] = (req, pos, a.vararg is not None)
    out: list[str] = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)):
            continue
        spec = funcs.get(node.func.id)
        if spec is None:
            continue
        low, high, star = spec
        if any(isinstance(x, ast.Starred) for x in node.args):
            continue                                # 언팩은 셀 수 없다
        given = len(node.args)
        kw = {k.arg for k in node.keywords if k.arg}
        if star or None in {k.arg for k in node.keywords}:
            continue                                # **kwargs 전달은 셀 수 없다
        if given > high:
            out.append(f"{node.func.id}() 는 위치인자 {high}개인데 {given}개를 넘김 "
                       f"(line {node.lineno})")
        elif given + len(kw) < low:
            out.append(f"{node.func.id}() 는 인자 {low}개 필요한데 {given + len(kw)}개 "
                       f"(line {node.lineno})")
    return out


def main() -> int:
    bad: list[tuple[str, str]] = []
    n = 0
    for d in TARGETS:
        if not d.exists():
            continue
        for f in sorted(d.rglob("*.py")):
            n += 1
            try:
                tree = ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
                for msg in _arity_problems(f, tree):
                    bad.append((str(f.relative_to(ROOT)), msg))
            except SyntaxError as e:
                bad.append((str(f.relative_to(ROOT)), f"{e.msg} (line {e.lineno})"))
            except Exception as e:  # noqa: BLE001 — 읽기 실패도 드러낸다
                bad.append((str(f.relative_to(ROOT)), f"읽기 실패: {e}"))
    if bad:
        print(f"FAIL — 문법 오류 {len(bad)}건 (검증 코드는 안 돌아간 것이 통과로 보인다):")
        for path, msg in bad:
            print(f"  · {path} — {msg}")
        return 1
    print(f"PASS — 검증 코드 {n}개 문법 정상 (tests/·tools/)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
