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


def main() -> int:
    bad: list[tuple[str, str]] = []
    n = 0
    for d in TARGETS:
        if not d.exists():
            continue
        for f in sorted(d.rglob("*.py")):
            n += 1
            try:
                ast.parse(f.read_text(encoding="utf-8"), filename=str(f))
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
