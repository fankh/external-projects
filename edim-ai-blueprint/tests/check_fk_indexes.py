# -*- coding: utf-8 -*-
"""인덱스 없는 외래키 게이트 (9.1) — 라이브 DB 대상.

인덱스 없는 FK 는 부모 삭제 시 자식 전체 seq-scan(cascade 지연·락 경합)·조인 저하를 부른다.
이번 세션에서 sys_history.actor_id·sys_notification.user_id 로 사용자 삭제가 막히는 통증을
세 번 겪었고, 그 원인이 정확히 이것이었다. 9.1(alembic 0052)에서 전량 인덱싱했으므로,
새 FK 가 인덱스 없이 추가되면 여기서 실패한다.

기준선 갱신(정당한 예외): py tests/check_fk_indexes.py --save
실행: py tests/check_fk_indexes.py
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

BASELINE = pathlib.Path(__file__).with_name("fk_index_allowlist.txt")

_SQL = (
    "SELECT c.conrelid::regclass::text || '.' || a.attname "
    "FROM pg_constraint c "
    "JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1] "
    "WHERE c.contype=(chr(102)) AND NOT EXISTS ("
    "  SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indkey[0]=c.conkey[1]) "
    "ORDER BY 1"
)


def _unindexed() -> list[str]:
    r = subprocess.run(
        ["ssh", "edim-server",
         f'sudo docker exec edim-postgres psql -U edim -d edim -tAc "{_SQL}"'],
        capture_output=True, text=True, timeout=90)
    out = []
    for line in (r.stdout or "").splitlines():
        s = line.strip()
        # SSH 배너·빈 줄 제거 — 'table.col' 형태만 취한다
        if s and "." in s and " " not in s and all(
                ch.isalnum() or ch in "._" for ch in s):
            out.append(s)
    return sorted(set(out))


def main() -> int:
    found = _unindexed()
    base = set()
    if BASELINE.exists():
        base = {ln.strip() for ln in BASELINE.read_text(encoding="utf-8").splitlines()
                if ln.strip() and not ln.startswith("#")}
    if "--save" in sys.argv:
        BASELINE.write_text("\n".join(found) + ("\n" if found else ""), encoding="utf-8")
        print(f"기준선 갱신 — 인덱스 없는 FK {len(found)}개")
        return 0
    new = [f for f in found if f not in base]
    if new:
        print(f"FAIL — 인덱스 없는 새 외래키 {len(new)}개 (9.1)")
        for f in new:
            print(f"  · {f}")
        print("\n  alembic 마이그레이션에 CREATE INDEX 를 추가하십시오.")
        print("  정당한 예외라면 py tests/check_fk_indexes.py --save 로 기준선 갱신.")
        return 1
    print(f"PASS — 인덱스 없는 FK 신규 0 (기준선 {len(base)}개 · 현재 {len(found)}개)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
