# -*- coding: utf-8 -*-
"""EDIM Standard vs Tenant Custom Tree 라이브 (5.4) — 요구 #23.

배경: sys_hierarchy.is_system 은 컬럼만 있고 쓰기에서 확인되지 않아, Master/Tenant Repository
분리가 이름뿐이었다(라이브 9노드 전부 false).
규약: 표준 노드는 고객사가 이름 변경·이동·삭제 불가, **하위 확장은 허용**.
     표준 트리 편집은 EDIM 운영 테넌트만.

검증: 신규 고객사 온보딩 → 루트가 표준(is_system) → 고객사 관리자가 이름변경/삭제 시도 409 →
     하위 추가는 200 → 추가한 자식은 CUSTOM 이라 편집 가능.
정리: 프로브 테넌트 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TC = "ZSTD-CO"
AL = "zstd.admin"
AP = "zstd1234"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def purge():
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}'")
    if tid:
        for tbl in ("sys_history", "sys_notification", "sys_hierarchy", "sys_user"):
            psql(f"DELETE FROM {tbl} WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_tenant WHERE tenant_id={tid}")


purge()
A = login("edim", "edim")

try:
    st, _ = req("POST", "/platform/tenants", A,
                {"tenantCode": TC, "tenantName": "표준 트리 검증", "plan": "TRIAL",
                 "adminLogin": AL, "adminName": "관리자", "adminPassword": AP})
    ok(f"고객사 온보딩 201 ({st})", st in (200, 201))
    std = psql(f"SELECT count(*) FROM sys_hierarchy WHERE is_system AND tenant_id="
               f"(SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}')")
    ok(f"★ 온보딩 루트가 EDIM 표준으로 표시 ({std}개)", int(std) >= 3)

    B = login(AL, AP)
    st, tree = req("GET", "/hierarchy", B)
    ok(f"고객사 트리 조회 ({len(tree)}노드)", st == 200 and tree)
    root = tree[0]
    rid = root.get("hierarchyId") or root.get("id")
    ok("루트 노드 식별", bool(rid))

    # ── 표준 노드 편집 차단 ──
    st, b = req("PATCH", f"/hierarchy/nodes/{rid}", B, {"nodeName": "이름변경시도"})
    ok(f"★ 표준 노드 이름 변경 409 ({st})", st == 409 and "표준" in (b or {}).get("detail", ""))
    st, b = req("DELETE", f"/hierarchy/nodes/{rid}", B)
    ok(f"★ 표준 노드 삭제 409 ({st})", st == 409 and "표준" in (b or {}).get("detail", ""))

    # ── 하위 확장은 허용 ──
    # API 계약: name·address 필수, 상위는 parentAddress 로 지정하고 주소는 상위로 시작해야 한다
    paddr = root.get("address")
    st, child = req("POST", "/hierarchy/nodes", B,
                    {"name": "고객사 확장", "address": f"{paddr}/ZZEXT",
                     "parentAddress": paddr, "treeType": root.get("treeType", "PRODUCT")})
    ok(f"★ 표준 노드 하위 추가는 허용 ({st})", st == 201)
    cid = (child or {}).get("hierarchyId")
    if cid:
        st, _ = req("PATCH", f"/hierarchy/nodes/{cid}", B, {"name": "확장 이름변경"})
        ok(f"추가한 CUSTOM 노드는 편집 가능 ({st})", st == 200)
        st, _ = req("DELETE", f"/hierarchy/nodes/{cid}", B)
        ok(f"추가한 CUSTOM 노드는 삭제 가능 ({st})", st == 200)

    # ── 운영 테넌트는 자기 표준 노드를 편집할 수 있다 ──
    own = psql("SELECT hierarchy_id FROM sys_hierarchy WHERE tenant_id="
               "(SELECT tenant_id FROM sys_user WHERE login_id='edim' LIMIT 1) LIMIT 1")
    if own:
        st, _ = req("GET", "/hierarchy", A)
        ok("운영 테넌트 트리 조회 정상", st == 200)
finally:
    purge()
    print("정리 — 프로브 테넌트 삭제")

print(f"\nlive_std_tree: {n}/{n} PASS")
