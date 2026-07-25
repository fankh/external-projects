# -*- coding: utf-8 -*-
"""alembic 마이그레이션 체인 무결성 — DB 불요 (파일만 읽는 정적 검사).

신규 고객 설치는 빈 DB 에서 `upgrade head` 로 전 체인을 순차 적용한다.
체인이 끊기거나 분기(head 2개)가 생기면 **설치가 실패하거나 일부 테이블이 누락**되는데,
운영 DB 는 이미 stamp 되어 있어 개발 중에는 드러나지 않는다 — 그래서 정적으로 막는다.
"""
import os
import re
from collections import Counter

import pytest

VERSIONS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "alembic", "versions")


def _load():
    revs, downs = {}, {}
    for f in sorted(os.listdir(VERSIONS_DIR)):
        if not f.endswith(".py") or f.startswith("__"):
            continue
        s = open(os.path.join(VERSIONS_DIR, f), encoding="utf-8").read()
        r = re.search(r"^revision\s*=\s*['\"]([^'\"]+)", s, re.M)
        d = re.search(r"^down_revision\s*=\s*(?:['\"]([^'\"]+)['\"]|None)", s, re.M)
        assert r, f"revision 식별자 없음: {f}"
        revs[r.group(1)] = f
        downs[r.group(1)] = d.group(1) if (d and d.group(1)) else None
    return revs, downs


REVS, DOWNS = _load()


def test_revisions_exist():
    assert len(REVS) >= 50, f"리비전이 너무 적다: {len(REVS)}"


def test_revision_ids_unique():
    """파일마다 revision 이 고유해야 한다 (복사·붙여넣기 사고 방지)."""
    assert len(REVS) == len(set(REVS)), "중복 revision"


def test_single_root():
    roots = [r for r, d in DOWNS.items() if d is None]
    assert len(roots) == 1, f"루트가 {len(roots)}개 — 빈 DB 에서 시작점이 모호해진다: {roots}"


def test_single_head():
    """head 가 2개면 `upgrade head` 가 실패한다(어느 쪽인지 모름)."""
    heads = [r for r in REVS if r not in DOWNS.values()]
    assert len(heads) == 1, f"head 가 {len(heads)}개 — 분기 발생: {heads}"


def test_no_broken_links():
    """down_revision 이 실재하지 않으면 체인이 끊겨 그 지점부터 적용되지 않는다."""
    missing = [(r, d) for r, d in DOWNS.items() if d and d not in REVS]
    assert not missing, f"끊긴 링크: {missing}"


def test_no_forks():
    """같은 down_revision 을 둘 이상이 가리키면 분기 — 병합 리비전 없이는 적용 불가."""
    c = Counter(d for d in DOWNS.values() if d)
    forks = [(k, v) for k, v in c.items() if v > 1]
    assert not forks, f"분기 지점: {forks}"


def test_chain_reaches_all_revisions():
    """루트에서 head 까지 따라가면 전 리비전을 지나야 한다 — 고아 리비전 방지."""
    child = {d: r for r, d in DOWNS.items() if d}
    root = next(r for r, d in DOWNS.items() if d is None)
    seen, cur = {root}, root
    while cur in child:
        cur = child[cur]
        assert cur not in seen, f"순환 발견: {cur}"
        seen.add(cur)
    orphans = set(REVS) - seen
    assert not orphans, f"체인에 연결되지 않은 리비전: {sorted(orphans)}"


@pytest.mark.parametrize("rev,fname", sorted(REVS.items()))
def test_each_has_upgrade(rev, fname):
    s = open(os.path.join(VERSIONS_DIR, fname), encoding="utf-8").read()
    assert re.search(r"^def upgrade\(", s, re.M), f"upgrade() 없음: {fname}"
