# -*- coding: utf-8 -*-
"""감사 기록 커버리지 게이트 (13.8) — 소스 정적 검사.

쓰기 엔드포인트가 `_audit()`(또는 sys_history 직접 기록) 없이 데이터를 바꾸면
**누가 언제 무엇을 바꿨는지 남지 않는다**. 문서·설계 통제 제품에서 감사 추적은
기능이 아니라 전제다(SYS-005·B8).

전수 조사에서 업무 쓰기 32곳에 기록이 없었다. 한 번에 다 채우면 커밋이 커지고 각 지점의
target_table/target_id 판단이 흐려지므로, **기준선을 고정해 증가를 막고** 위험이 큰 것부터
줄인다. 기준선 항목이 줄어드는 것은 항상 허용되고, **새로 늘어나면 실패**한다.

기준선 갱신(항목을 줄였을 때): py tests/check_audit_coverage.py --save
실행: py tests/check_audit_coverage.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "backend" / "app" / "routers" / "edim.py"
BASELINE = pathlib.Path(__file__).with_name("audit_coverage_allowlist.txt")

_WRITE = re.compile(r"\b(INSERT INTO|UPDATE |DELETE FROM)\b")
_ROUTE = re.compile(r'@router\.(post|put|patch|delete)\("([^"]+)"')
_DEF = re.compile(r"^(async )?def (\w+)")

# 감사 대상이 아닌 경로 — 개인 설정·읽음 표시·내부 개발 도구.
# (업무 데이터가 아니라 사용자별 UI 상태이므로 이력 가치가 없다)
EXEMPT_PREFIX = ("/dev/", "/prefs/", "/notifications/", "/cad/view/")


def _unaudited() -> list[str]:
    lines = SRC.read_text(encoding="utf-8").split("\n")
    out: list[str] = []
    for i, line in enumerate(lines):
        m = _ROUTE.match(line)
        if not m:
            continue
        verb, path = m.group(1).upper(), m.group(2)
        j = i
        while j < len(lines) and not _DEF.match(lines[j]):
            j += 1
        if j >= len(lines):
            continue
        k = j + 1
        while k < len(lines) and not (
                lines[k].startswith("@router.") or _DEF.match(lines[k])
                or lines[k].startswith("class ")):
            k += 1
        body = "\n".join(lines[j:k])
        if not _WRITE.search(body):
            continue
        if "_audit(" in body or "sys_history" in body:
            continue
        if any(path.startswith(p) for p in EXEMPT_PREFIX):
            continue
        out.append(f"{verb} {path}")
    return sorted(set(out))


def main() -> int:
    current = _unaudited()
    if "--save" in sys.argv:
        # 기존 '#' 주석(왜 남아 있는지에 대한 설명)은 보존한다 — 갱신할 때마다 사라지면
        # 다음 사람은 남은 항목이 방치인지 판단된 예외인지 알 수 없다.
        head: list[str] = []
        if BASELINE.exists():
            for line in BASELINE.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("#") or (not line.strip() and head):
                    head.append(line)
                elif line.strip():
                    break
        BASELINE.write_text("\n".join(head + current) + "\n", encoding="utf-8")
        print(f"기준선 저장 — 감사 없는 쓰기 {len(current)}건 (주석 {len(head)}줄 보존)")
        return 0
    base = set()
    if BASELINE.exists():
        # '#' 로 시작하는 줄은 주석 — 남은 항목이 왜 예외인지 기준선에 함께 적어 둔다
        base = {x.strip() for x in BASELINE.read_text(encoding="utf-8").splitlines()
                if x.strip() and not x.strip().startswith("#")}
    added = sorted(set(current) - base)
    removed = sorted(base - set(current))
    if added:
        print(f"FAIL — 감사 기록 없는 신규 쓰기 엔드포인트 {len(added)}건:")
        for a in added:
            print(f"  · {a}")
        print("\n  _audit(cur, tid, 대상테이블, 대상id, 액션, request.state.user_id, ...) 를 "
              "추가하십시오.\n  개인 설정처럼 이력 가치가 없다면 EXEMPT_PREFIX 에 근거와 함께 "
              "등록하십시오.")
        return 1
    msg = f"PASS — 감사 없는 쓰기 신규 0 (기준선 {len(base)}건 · 현재 {len(current)}건)"
    if removed:
        msg += f" · 해소 {len(removed)}건 — --save 로 기준선을 줄이십시오"
    print(msg)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
