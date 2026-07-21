# -*- coding: utf-8 -*-
"""커서 결과셋 무효화 정적 게이트 (8.6).

배경 — 8.4a 에서 내가 직접 만든 결함:
    cur.execute("SELECT ...")
    qm = _info_mode(cur, ...)      # ← 이 함수가 **같은 커서로** 질의한다
    return [... for r in cur.fetchall()]   # ← 결과셋이 이미 갈렸다 → 빈 목록

오류가 나지 않는다는 점이 고약하다. 빈 목록은 '데이터 없음' 과 구분되지 않아, 조회가
조용히 아무것도 돌려주지 않는 상태로 배포된다(실제로 공급자 코드 매핑 2종이 그렇게 나갔고
라이브 스위트가 잡았다).

규칙: 함수 안에서 `cur.execute` → (커서를 쓰는 헬퍼 호출) → `cur.fetch*` 순서가 나타나면 실패.
      헬퍼 뒤에 새 `cur.execute` 가 있으면 안전하므로 넘어간다.

기준선 갱신: 정당한 예외라면 `py tests/check_cursor_reuse.py --update` 후 커밋 메시지에 근거를 남긴다.
실행: PYTHONUTF8=1 py tests/check_cursor_reuse.py
"""
from __future__ import annotations

import ast
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
TARGETS = [ROOT / "backend" / "app" / "routers" / "edim.py"]
BASELINE = pathlib.Path(__file__).with_name("cursor_reuse_allowlist.txt")

FETCH = {"fetchone", "fetchall", "fetchmany"}


def _cursor_helpers(tree: ast.Module) -> set[str]:
    """모듈 안에서 '커서를 받아 질의하는' 함수 이름 — 이들이 결과셋을 갈아엎는다."""
    out: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        args = [a.arg for a in node.args.args]
        if not args or args[0] != "cur":
            continue
        for sub in ast.walk(node):
            if (isinstance(sub, ast.Call) and isinstance(sub.func, ast.Attribute)
                    and sub.func.attr == "execute"):
                out.add(node.name)
                break
    return out


def _events(fn: ast.FunctionDef, helpers: set[str]) -> list[tuple[int, str, str]]:
    """함수 본문의 (줄번호, 종류, 이름) 이벤트를 소스 순서대로."""
    ev: list[tuple[int, str, str]] = []
    for node in ast.walk(fn):
        if not isinstance(node, ast.Call):
            continue
        f = node.func
        if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == "cur":
            if f.attr == "execute":
                ev.append((node.lineno, "execute", "cur.execute"))
            elif f.attr in FETCH:
                ev.append((node.lineno, "fetch", f"cur.{f.attr}"))
        elif isinstance(f, ast.Name) and f.id in helpers:
            # 커서를 실제로 넘겨 호출한 경우만
            if node.args and isinstance(node.args[0], ast.Name) and node.args[0].id == "cur":
                ev.append((node.lineno, "helper", f.id))
    return sorted(ev, key=lambda e: e[0])


def scan() -> list[str]:
    findings: list[str] = []
    for path in TARGETS:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        helpers = _cursor_helpers(tree)
        for fn in [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]:
            if fn.name in helpers:
                continue
            pending = False       # 아직 거두지 않은 execute 가 있는가
            clobber: str | None = None   # 그 사이에 끼어든 헬퍼
            for lineno, kind, name in _events(fn, helpers):
                if kind == "execute":
                    pending, clobber = True, None
                elif kind == "helper" and pending:
                    clobber = name
                elif kind == "fetch":
                    if pending and clobber:
                        findings.append(
                            f"{path.name}::{fn.name}::{clobber}::{name}")
                    pending, clobber = False, None
    return sorted(set(findings))


def main() -> int:
    found = scan()
    base = set()
    if BASELINE.exists():
        base = {ln.strip() for ln in BASELINE.read_text(encoding="utf-8").splitlines()
                if ln.strip() and not ln.startswith("#")}
    if "--update" in sys.argv:
        BASELINE.write_text("\n".join(found) + ("\n" if found else ""), encoding="utf-8")
        print(f"기준선 갱신 — {len(found)}항목")
        return 0
    new = [f for f in found if f not in base]
    gone = [b for b in base if b not in set(found)]
    if new:
        print("FAIL — 커서 결과셋이 갈릴 수 있는 신규 지점 (8.6)")
        for f in new:
            file, fnname, helper, fetch = f.split("::")
            print(f"  · {file} {fnname}(): cur.execute → {helper}(cur, …) → {fetch}")
        print("\n  헬퍼 호출 **전에** fetch 해서 결과를 먼저 거두십시오.")
        print("  정당한 예외라면 py tests/check_cursor_reuse.py --update 로 기준선 갱신.")
        return 1
    print(f"PASS — 커서 결과셋 무효화 신규 0 (기준선 {len(base)}항목 · 현재 {len(found)}항목"
          + (f" · 해소 {len(gone)}" if gone else "") + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
