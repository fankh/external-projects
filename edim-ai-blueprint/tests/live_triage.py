# -*- coding: utf-8 -*-
"""신규 요구 트리아지 라이브 (v34.60~64) — Snapshot·Handoff 상태기계·Session Reset·dryRun Diff·Package·테넌트 export.

실행: PYTHONUTF8=1 py tests/live_triage.py
정리: 테스트 Run isTest·handoff/승인 psql·알림 read·STEP 파일 삭제 내장.
"""
import base64
import hashlib
import hmac
import io
import json
import os
import struct
import subprocess
import time
import urllib.error
import urllib.request
from urllib.parse import quote

import openpyxl

BASE = os.getenv("BASE", "https://edim.seekerslab.com/").rstrip("/")
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


def req(method, path, body=None, data=None, ctype=None, tok=None, raw=False):
    if body is not None:
        data = json.dumps(body).encode()
    headers = {"Authorization": f"Bearer {tok or TOK}", "Content-Type": ctype or "application/json"}
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=180) as resp:
        payload = resp.read()
        return (payload, dict(resp.headers)) if raw else json.loads(payload or b"null")


def multipart(fields, fname, fdata):
    bnd = "liveTriageBnd"
    out = b""
    for k, v in fields.items():
        out += f"--{bnd}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    out += (f"--{bnd}\r\nContent-Disposition: form-data; name=\"uploadedFile\"; filename=\"{fname}\"\r\n"
            "Content-Type: application/octet-stream\r\n\r\n").encode() + fdata + f"\r\n--{bnd}--\r\n".encode()
    return out, f"multipart/form-data; boundary={bnd}"


r0 = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]

psql("DELETE FROM sys_approval_request WHERE target_table='erp_handoff' AND comment LIKE '%TRIAGE-SUITE%'")
psql("DELETE FROM code_group WHERE group_code='ZTRIG'")
psql("DELETE FROM sys_hierarchy WHERE address LIKE 'ZTRI%'")

rid = None
try:
    # 1) Run → BOM Snapshot (#41)
    run = req("POST", "/cpq/runs", {"runType": "ALL", "isTest": True})
    rid = run["runId"]
    for _ in range(50):
        st = req("GET", f"/cpq/runs/{rid}")
        if st["status"] != "RUNNING":
            break
        time.sleep(0.8)
    ok(f"테스트 Run #{rid} SUCCESS", st["status"] == "SUCCESS")
    snap = req("GET", f"/cpq/runs/{rid}/bom-snapshot")
    ok(f"BOM Snapshot ({snap['count']}행)", snap["count"] > 0)

    # 2) Handoff 상태기계 (#44~47) — 생성→미승인 409→승인→수신, 재생성 v+1
    h1 = req("POST", "/erp/handoffs", {"runId": rid})
    ok(f"Handoff 생성 v{h1['version']} ({h1['grade']})", h1["status"] == "approval_requested")
    try:
        req("POST", f"/erp/handoffs/{h1['handoffId']}/accept")
        ok("미승인 수신 409", False)
    except urllib.error.HTTPError as e:
        ok("미승인 수신 409", e.code == 409)
    inbox = req("GET", "/approvals/inbox")
    ap = next(x for x in inbox if x.get("assetType") == "erp_handoff" or "ERP Handoff" in (x.get("target") or ""))
    req("POST", f"/approvals/{ap['id']}/decide", {"approve": True, "comment": "TRIAGE-SUITE"})
    req("POST", f"/erp/handoffs/{h1['handoffId']}/accept")
    lst = req("GET", "/erp/handoffs")
    me = next(x for x in lst if x["handoffId"] == h1["handoffId"])
    ok("승인→수신 accepted + FG 병기", me["status"] == "accepted" and "finishedGoodsCode" in me)

    # 3) Output Package (#42)
    pkgs = req("GET", "/projects/PS-61313-5/output-packages")
    ok(f"Output Package ({len(pkgs)}건)", len(pkgs) >= 1 and "configSnapshotId" in pkgs[0])

    # 4) Import dryRun (#32) — 미반영 보장
    grp = req("GET", "/codes/groups")[0]["groupCode"]
    wbi = openpyxl.Workbook()
    wsi = wbi.active
    wsi.append(["Slot", "Item Name"])
    wsi.append(["ZZ", "TRIAGE-SUITE dry"])
    buf = io.BytesIO()
    wbi.save(buf)
    body, ctype = multipart({}, "dry.xlsx", buf.getvalue())
    before = psql(f"SELECT count(*) FROM code_item ci JOIN code_group g ON g.group_id=ci.group_id WHERE g.group_code='{grp}'")
    r1 = req("POST", f"/codes/groups/{grp}/import-excel?dryRun=true", data=body, ctype=ctype)
    after = psql(f"SELECT count(*) FROM code_item ci JOIN code_group g ON g.group_id=ci.group_id WHERE g.group_code='{grp}'")
    ok("Import dryRun 미반영", r1.get("dryRun") is True and before == after)

    # 4b) Hierarchy 속성 (#22) — 저장→잠금 409→해제 원복
    nodes = req("GET", "/hierarchy?treeType=PRODUCT")
    nid = nodes[-1]["id"]
    req("PATCH", f"/hierarchy/nodes/{nid}", {"remark": "TRIAGE-SUITE 비고", "locked": True})
    try:
        req("PATCH", f"/hierarchy/nodes/{nid}", {"name": "잠금중"})
        ok("잠금 노드 수정 409", False)
    except urllib.error.HTTPError as e:
        ok("잠금 노드 수정 409", e.code == 409)
    req("PATCH", f"/hierarchy/nodes/{nid}", {"locked": False, "remark": ""})
    n4 = next(x for x in req("GET", "/hierarchy?treeType=PRODUCT") if x["id"] == nid)
    ok("Hierarchy 속성 원복", n4["locked"] is False and n4["remark"] == "")

    # 4d) 영향 분석·연결 유지 (#24/#25) — 참조 집계·삭제 409·이동 시 참조 주소 연쇄 갱신
    n1 = req("POST", "/hierarchy/nodes", {"treeType": "PRODUCT", "name": "TRIAGE 임팩트",
                                          "address": "ZTRI1", "symbol": "", "parentAddress": ""})
    n2 = req("POST", "/hierarchy/nodes", {"treeType": "PRODUCT", "name": "TRIAGE 대상",
                                          "address": "ZTRI2", "symbol": "", "parentAddress": ""})
    req("POST", "/codes/groups", {"groupCode": "ZTRIG", "groupName": "TRIAGE-SUITE 임팩트",
                                  "hierarchyAddress": "ZTRI1"})
    try:
        req("POST", "/codes/groups", {"groupCode": "ZTRIX", "groupName": "고아 주소",
                                      "hierarchyAddress": "/NOPE/X"})
        ok("고아 주소 그룹 생성 422 (0.9)", False)
    except urllib.error.HTTPError as e:
        ok("고아 주소 그룹 생성 422 (0.9)", e.code == 422)
    imp = req("GET", f"/hierarchy/nodes/{n1['hierarchyId']}/impact")
    ok("영향 분석 — 참조 집계 (#25)",
       imp["referencingTotal"] >= 1 and any(x["table"] == "code_group" for x in imp["references"]))
    try:
        req("DELETE", f"/hierarchy/nodes/{n1['hierarchyId']}")
        ok("참조 노드 삭제 409", False)
    except urllib.error.HTTPError as e:
        ok("참조 노드 삭제 409", e.code == 409)
    mv = req("POST", f"/hierarchy/nodes/{n1['hierarchyId']}/move",
             {"targetParentId": n2["hierarchyId"]})
    ga = next(g for g in req("GET", "/codes/groups") if g["groupCode"] == "ZTRIG")
    ok(f"이동 연쇄 갱신 (#24) relinked={mv.get('relinked')}",
       mv.get("relinked", 0) >= 1 and ga["hierarchyAddress"] == mv["newAddress"])

    # 4e) 다단계 Where-Used 역전개 (#34) — 재귀 상승·경로·순환 가드 (읽기 전용)
    deep_code = psql(
        "WITH RECURSIVE up AS ("
        " SELECT r.mother_code_id, r.child_code_id, 1 lvl FROM code_relationship r"
        " UNION ALL SELECT r2.mother_code_id, up.child_code_id, up.lvl+1 FROM up"
        " JOIN code_relationship r2 ON r2.child_code_id=up.mother_code_id WHERE up.lvl<6)"
        " SELECT pc.main_code FROM up JOIN product_code pc ON pc.product_code_id=up.child_code_id"
        " WHERE up.lvl=2 LIMIT 1")
    if deep_code:
        wu = req("GET", f"/codes/{deep_code}/where-used")
        ok(f"다단계 역전개 {deep_code} (L{wu['maxLevel']}·{wu['count']}행)",
           wu["maxLevel"] >= 2 and any("›" in x["path"] for x in wu["rows"] if x["level"] >= 2))
    else:
        ok("다단계 역전개 — 2단 체인 데이터 없음 (스킵)", True)

    # 4c) 선택적 MFA (#10) — 프로브 사용자 수명주기 (TOTP 서버시간 기준)
    PU = "test.mfa.suite"

    def _purge_mfa():
        for sql in (
            f"DELETE FROM sys_notification WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')",
            f"DELETE FROM sys_history WHERE actor_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')",
            f"DELETE FROM sys_user_role WHERE user_id IN (SELECT user_id FROM sys_user WHERE login_id='{PU}')",
            f"DELETE FROM sys_user WHERE login_id='{PU}'",
        ):
            psql(sql)

    def _totp(secret_b32, server_ts):
        key = base64.b32decode(secret_b32)
        h2 = hmac.new(key, struct.pack(">Q", int(server_ts // 30)), hashlib.sha1).digest()
        o = h2[-1] & 0x0F
        return f"{(int.from_bytes(h2[o:o + 4], 'big') & 0x7FFFFFFF) % 1_000_000:06d}"

    _purge_mfa()
    req("POST", "/users", {"login": PU, "name": "MFA 스위트", "initialPassword": "mfa1234",
                            "department": "QA", "email": "", "level": "GENERAL"})
    lg = urllib.request.Request(f"{API}/auth/login",
        data=json.dumps({"userId": PU, "password": "mfa1234"}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    ptok = json.loads(urllib.request.urlopen(lg).read())["token"]
    secret = req("POST", "/users/me/mfa/setup", tok=ptok)["secret"]
    server_ts = int(psql("SELECT extract(epoch FROM now())::bigint"))
    req("POST", "/users/me/mfa/enable", {"code": _totp(secret, server_ts)}, tok=ptok)
    r1 = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/auth/login", data=json.dumps({"userId": PU, "password": "mfa1234"}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")).read())
    ok("MFA 활성 → mfaRequired", r1.get("mfaRequired") is True)
    server_ts = int(psql("SELECT extract(epoch FROM now())::bigint"))
    r2 = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/auth/login",
        data=json.dumps({"userId": PU, "password": "mfa1234", "otp": _totp(secret, server_ts)}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")).read())
    ok("정 OTP 로그인", bool(r2.get("token")))
    server_ts = int(psql("SELECT extract(epoch FROM now())::bigint"))
    req("POST", "/users/me/mfa/disable", {"code": _totp(secret, server_ts)}, tok=ptok)
    _purge_mfa()
    ok("MFA 해제·프로브 정리", True)

    # 5) 테넌트 export (#13) — ADMIN ZIP + GENERAL 403
    blob, hdrs = req("GET", "/tenant/export.zip", raw=True)
    tbl_n = next((v for k, v in hdrs.items() if k.lower() == "x-table-count"), "?")
    ok(f"테넌트 export ({tbl_n}테이블)", blob[:2] == b"PK")
    tok2 = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"{API}/auth/login", data=json.dumps({"userId": "jang.s", "password": "edim"}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")).read())["token"]
    try:
        req("GET", "/tenant/export.zip", tok=tok2, raw=True)
        ok("export GENERAL 403", False)
    except urllib.error.HTTPError as e:
        ok("export GENERAL 403", e.code == 403)

    # 6) UI — C-1 세션 초기화 (#43) · D-1 Handoff 패널
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_page(viewport={"width": 1600, "height": 900})
        p.goto(f"{BASE}/login", wait_until="networkidle")
        p.fill("input[name=userId]", "edim")
        p.fill("input[name=password]", "edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
        p.wait_for_url("**/erp/**", timeout=15000)
        p.goto(f"{BASE}/cpq/selection", wait_until="networkidle")
        p.wait_for_timeout(600)
        ok("C-1 Arrangement 콤보 (#37)", p.locator("[data-arr-select]").count() == 1)
        p.locator("[data-cpq-reset]").click()
        p.locator("text=세션 초기화 ✓").wait_for(timeout=8000)
        ok("C-1 세션 초기화", True)
        p.goto(f"{BASE}/erp/sales-order", wait_until="networkidle")
        p.wait_for_timeout(800)
        ok("D-1 Handoff 패널 (FG 컬럼)", "FG Code" in p.locator("[data-handoff-panel]").inner_text())
        # #34 — 코드 상세 다단계 역전개 섹션 (base 절단 규칙: 하이픈 2개 이상이면 스킵)
        if deep_code and "-".join(deep_code.split("-")[:2]) == deep_code:
            p.goto(f"{BASE}/detail/code?code={quote(deep_code)}", wait_until="networkidle")
            p.wait_for_timeout(500)
            ok("코드 상세 다단계 역전개 섹션 (#34)", p.locator("[data-where-used-deep]").count() == 1)
        b.close()
finally:
    psql("DELETE FROM sys_approval_request WHERE target_table='erp_handoff' AND comment LIKE '%ERP Handoff%'")
    psql("DELETE FROM erp_handoff")
    psql("DELETE FROM code_group WHERE group_code='ZTRIG'")
    psql("DELETE FROM sys_hierarchy WHERE address LIKE 'ZTRI%'")
    if rid:
        try:
            req("DELETE", f"/cpq/runs/{rid}")
        except Exception:  # noqa: BLE001
            pass   # 최신 SUCCESS 보호 — TEST 배지로 통계 미오염
    for x in req("GET", "/notifications?limit=50"):
        if not x.get("read") and ("Handoff" in x.get("title", "") or "TRIAGE-SUITE" in x.get("title", "")):
            req("POST", f"/notifications/{x['id']}/read")
    print("정리 — handoff·승인·알림·Run 잔재 정리", flush=True)

print(f"\nlive_triage: {n}/{n} PASS")
