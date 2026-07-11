# -*- coding: utf-8 -*-
"""C10 — 부하 기준선 (BOM 전개 동시 5). locust 없이 표준 라이브러리로 간이 측정.

BOM 전개(재귀 CTE)는 핵심 가치사슬의 무거운 경로 → 동시 부하에서 지연·처리량 기준선 기록.
실행: PYTHONUTF8=1 py tests/load_baseline.py  [총횟수] [동시수]
"""
import json
import os
import statistics
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = os.environ.get("BASE", "https://edim.seekerslab.com").rstrip("/") + "/api/v1"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 50
CONC = int(sys.argv[2]) if len(sys.argv) > 2 else 5


def login():
    body = json.dumps({"userId": "edim", "password": "edim"}).encode()
    req = urllib.request.Request(f"{BASE}/auth/login", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["token"]


TOKEN = login()
PAYLOAD = json.dumps({"rootCode": "KDCR 3-13", "slotValues": {"B": "13", "C": "32", "E": "15"}}).encode()


def expand(_):
    req = urllib.request.Request(
        f"{BASE}/codes/products/expand", data=PAYLOAD,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"}, method="POST")
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
            return (time.perf_counter() - t0) * 1000, r.status
    except Exception as e:  # noqa: BLE001
        return (time.perf_counter() - t0) * 1000, getattr(e, "code", 0)


print(f"부하 기준선 — BOM 전개 {N}회 · 동시 {CONC} · {BASE}")
wall0 = time.perf_counter()
with ThreadPoolExecutor(CONC) as ex:
    results = list(ex.map(expand, range(N)))
wall = time.perf_counter() - wall0

lat = sorted(r[0] for r in results)
ok = sum(1 for r in results if r[1] == 200)
p = lambda q: lat[min(len(lat) - 1, int(len(lat) * q))]  # noqa: E731
print(f"  성공: {ok}/{N} · 처리량: {N / wall:.1f} req/s · 총 {wall:.1f}s")
print(f"  지연(ms): avg {statistics.mean(lat):.0f} · p50 {p(0.5):.0f} · p95 {p(0.95):.0f} · max {lat[-1]:.0f}")
# 기준선 판정 — 전건 성공 + p95 합리적(5s 이내)
verdict = ok == N and p(0.95) < 5000
print("== PASS (기준선 확보)" if verdict else "== CHECK (성공률/지연 확인)")
sys.exit(0 if verdict else 1)
