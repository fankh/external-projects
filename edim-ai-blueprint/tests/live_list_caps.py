# -*- coding: utf-8 -*-
"""리스트 안전 상한 라이브 (9.20) — 무한 성장 그리드 회로차단.

배경: 핵심 트랜잭션 그리드(projects·erp/events·work-orders·qc/inspections·eco/changes·
eco/ledger·cost/actuals)가 테넌트 전 행을 무제한 반환했다 — 데이터가 수천 행으로 늘면
쿼리 지연·거대 응답·메모리 압박. 최신순 상한(기본 2000·최대 10000, limit 파라미터)으로
회로차단. 이 스위트는 limit 이 실제로 행 수를 제한함을 검증한다(마스터/참조 그리드는
전량 필요하므로 대상 외 — 별도 페이지네이션 과제).
"""
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0

# (경로, 응답에서 리스트를 꺼내는 함수)
GRIDS = [
    ("/projects", lambda d: d),
    ("/erp/events", lambda d: d),
    ("/erp/work-orders", lambda d: d),
    ("/qc/inspections", lambda d: d),
    ("/eco/changes", lambda d: d),
    ("/eco/ledger", lambda d: d["rows"]),
    ("/cost/actuals", lambda d: d),
]


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


TOK = login("edim", "edim")


def get(path):
    r = urllib.request.Request(API + path, method="GET",
                               headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return resp.status, json.loads(resp.read() or b"null")


for path, pick in GRIDS:
    sep = "&" if "?" in path else "?"
    st_full, full = get(f"{path}{sep}limit=10000")
    st_cap, cap = get(f"{path}{sep}limit=1")
    nf = len(pick(full))
    nc = len(pick(cap))
    ok(f"{path} 200 (전체 {nf}행)", st_full == 200 and st_cap == 200)
    ok(f"★ {path} limit=1 상한 준수 ({nc}행 ≤ 1)", nc <= 1)
    if nf >= 2:
        ok(f"★ {path} 상한이 실제 제한 (전체 {nf} → 1)", nc == 1)

# 음수/과대 limit 도 안전 클램프 (0 행 이상, 500 없음)
st, d = get("/projects?limit=-5")
ok(f"음수 limit 안전 처리 200 ({st})", st == 200 and isinstance(d, list))
st, d = get("/projects?limit=999999")
ok(f"과대 limit 안전 처리 200 ({st})", st == 200 and isinstance(d, list) and len(d) <= 10000)

print(f"\nlive_list_caps: {n}/{n} PASS")
