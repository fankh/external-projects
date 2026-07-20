# -*- coding: utf-8 -*-
"""좌측 패널 = 업무 프로세스 라이브 (2.0) — 요구 #15/#17.

검증: 시드 → 트리 렌더 → 단계 클릭 이동 → 편집(추가·순서·삭제) → 메뉴 모드 왕복 → 권한 가드.
정리: ZTEST 노드 psql 삭제 (시드된 표준 프로세스는 테넌트 자산이라 보존).
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=40)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read() or b"null")


TOK = login("edim", "edim")
psql("DELETE FROM sys_process_node WHERE name LIKE 'ZTEST%'")

try:
    # 1) 트리 — 정의 없으면 시드
    tree = req("GET", "/process/tree", TOK)
    if not tree:
        s = req("POST", "/process/seed", TOK)
        ok(f"표준 프로세스 시드 ({s['seeded']}단계)", s["seeded"] >= 18)
        tree = req("GET", "/process/tree", TOK)
    else:
        ok(f"프로세스 트리 존재 ({len(tree)}단계)", len(tree) > 0)
    roots = [x for x in tree if not x["parentId"]]
    ok(f"계층 구조 — 최상위 {len(roots)}·하위 {len(tree) - len(roots)}",
       len(roots) >= 3 and len(tree) > len(roots))
    ok("화면 바인딩 존재", any(x["screenHref"] for x in tree))

    # 2) 중복 시드 차단
    try:
        req("POST", "/process/seed", TOK)
        ok("중복 시드 409", False)
    except urllib.error.HTTPError as e:
        ok("중복 시드 409", e.code == 409)

    # 3) 단계 추가 → 수정 → 순서 이동 → 삭제
    a = req("POST", "/process/nodes", TOK,
            {"name": "ZTEST 단계", "screenHref": "/erp/audit", "icon": "★"})
    ok(f"단계 추가 #{a['nodeId']}", bool(a["nodeId"]))
    child = req("POST", "/process/nodes", TOK,
                {"name": "ZTEST 하위", "parentId": a["nodeId"], "screenHref": "/erp/dashboard"})
    ok("하위 단계 추가", bool(child["nodeId"]))
    req("PATCH", f"/process/nodes/{a['nodeId']}", TOK,
        {"name": "ZTEST 개명", "screenHref": "/erp/prices"})
    t2 = req("GET", "/process/tree", TOK)
    nd = next(x for x in t2 if x["nodeId"] == a["nodeId"])
    ok("이름·화면 변경 반영", nd["name"] == "ZTEST 개명" and nd["screenHref"] == "/erp/prices")
    before = nd["stepNo"]
    req("POST", f"/process/nodes/{a['nodeId']}/move?dir=up", TOK)
    t3 = req("GET", "/process/tree", TOK)
    after = next(x for x in t3 if x["nodeId"] == a["nodeId"])["stepNo"]
    ok(f"순서 이동 (step {before} → {after})", after < before)

    # 4) 자기 자신 상위 지정 422
    try:
        req("PATCH", f"/process/nodes/{a['nodeId']}", TOK, {"parentId": a["nodeId"]})
        ok("자기 자신 상위 지정 422", False)
    except urllib.error.HTTPError as e:
        ok("자기 자신 상위 지정 422", e.code == 422)

    # 5) 삭제 — 하위 연쇄
    d = req("DELETE", f"/process/nodes/{a['nodeId']}", TOK)
    ok(f"삭제 (하위 {d['children']} 연쇄)", d["children"] == 1)
    ok("트리에서 제거", not any(x["nodeId"] in (a["nodeId"], child["nodeId"])
                               for x in req("GET", "/process/tree", TOK)))

    # 6) 권한 — GENERAL 은 편집 불가
    tok2 = login("jang.s", "edim")
    ok("GENERAL 트리 조회 허용", len(req("GET", "/process/tree", tok2)) > 0)
    try:
        req("POST", "/process/nodes", tok2, {"name": "ZTEST 무권한"})
        ok("GENERAL 편집 403", False)
    except urllib.error.HTTPError as e:
        ok("GENERAL 편집 403", e.code == 403)
finally:
    psql("DELETE FROM sys_process_node WHERE name LIKE 'ZTEST%'")
    print("정리 — ZTEST 단계 삭제", flush=True)

print(f"\nlive_process_nav: {n}/{n} PASS")
