# -*- coding: utf-8 -*-
"""고객사 프로비저닝 라이브 (1.3) — 온보딩 1스텝·계약 게이트·플랫폼 2계층 권한.

검증: 생성(테넌트+관리자+기본 노드) → 신규 관리자 로그인 → 자사만 조회 → 중지 시 로그인 차단
     → 재개 → 고객사 ADMIN 의 플랫폼 API 403 → 정리(psql).
실행: PYTHONUTF8=1 py tests/live_platform_tenant.py
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TC = "ZTEST-CO"
AL = "ztest.admin"
AP = "ztest1234"
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
    return json.loads(urllib.request.urlopen(r).read())


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read() or b"null")


def purge():
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}'")
    if tid:
        for tbl in ("sys_history", "sys_notification", "sys_hierarchy", "sys_user"):
            psql(f"DELETE FROM {tbl} WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_tenant WHERE tenant_id={tid}")


purge()
adm = login("edim", "edim")["token"]

try:
    # 1) 온보딩 1스텝 — 테넌트 + 관리자 + Hierarchy 루트
    r = req("POST", "/platform/tenants", adm, {
        "tenantCode": TC, "tenantName": "테스트 고객사", "plan": "TRIAL",
        "adminLogin": AL, "adminName": "테스트 관리자", "adminPassword": AP})
    ok(f"고객사 생성 (노드 {r['seededNodes']})", r["tenantCode"] == TC and r["seededNodes"] >= 3)
    lst = req("GET", "/platform/tenants", adm)
    row = next(x for x in lst if x["tenantCode"] == TC)
    ok(f"목록 반영 — {row['tenantName']} · {row['plan']} · 사용자 {row['users']}",
       row["users"] == 1 and row["status"] == "ACTIVE")

    # 2) 신규 관리자 로그인 — 자기 테넌트로 세션 (빈 데이터)
    new_login = login(AL, AP)
    ntok = new_login["token"]
    ok(f"신규 관리자 로그인 → {new_login['user']['tenantId']}", new_login["user"]["tenantId"] == TC)
    ok("신규 고객사 데이터 비어 있음 (격리)",
       len(req("GET", "/codes/products", ntok)) == 0 and len(req("GET", "/users", ntok)) == 1)
    ok("기본 Hierarchy 노드 시드", len(req("GET", "/hierarchy?treeType=PRODUCT", ntok)) >= 3)

    # 3) 고객사 ADMIN 은 플랫폼 API 불가 (2계층 권한 — 요구 #5)
    try:
        req("GET", "/platform/tenants", ntok)
        ok("고객사 ADMIN 플랫폼 API 403", False)
    except urllib.error.HTTPError as e:
        ok("고객사 ADMIN 플랫폼 API 403", e.code == 403)

    # 4) 계약 게이트 — 중지 시 로그인 차단, 재개 시 복귀
    req("PATCH", f"/platform/tenants/{TC}", adm, {"status": "SUSPENDED"})
    try:
        login(AL, AP)
        ok("중지 고객사 로그인 차단 403", False)
    except urllib.error.HTTPError as e:
        ok("중지 고객사 로그인 차단 403", e.code == 403)
    req("PATCH", f"/platform/tenants/{TC}", adm, {"status": "ACTIVE"})
    ok("재개 후 로그인 복귀", bool(login(AL, AP).get("token")))

    # 5) 플랫폼 운영 테넌트 자기보호
    try:
        req("PATCH", "/platform/tenants/nova", adm, {"status": "SUSPENDED"})
        ok("플랫폼 테넌트 중지 차단 409", False)
    except urllib.error.HTTPError as e:
        ok("플랫폼 테넌트 중지 차단 409", e.code == 409)

    # 6) 중복 코드 409
    try:
        req("POST", "/platform/tenants", adm, {
            "tenantCode": TC, "tenantName": "중복", "adminLogin": "x", "adminPassword": "xxxxxx"})
        ok("중복 코드 409", False)
    except urllib.error.HTTPError as e:
        ok("중복 코드 409", e.code == 409)
finally:
    purge()
    print("정리 — 테스트 고객사 삭제", flush=True)

print(f"\nlive_platform_tenant: {n}/{n} PASS")
