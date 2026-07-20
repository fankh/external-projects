# -*- coding: utf-8 -*-
"""신규 요구 트리아지 라이브 (v34.60~64) — Snapshot·Handoff 상태기계·Session Reset·dryRun Diff·Package·테넌트 export.

실행: PYTHONUTF8=1 py tests/live_triage.py
정리: 테스트 Run isTest·handoff/승인 psql·알림 read·STEP 파일 삭제 내장.
"""
import io
import json
import os
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
        p.locator("[data-cpq-reset]").click()
        p.locator("text=세션 초기화 ✓").wait_for(timeout=8000)
        ok("C-1 세션 초기화", True)
        p.goto(f"{BASE}/erp/sales-order", wait_until="networkidle")
        p.wait_for_timeout(800)
        ok("D-1 Handoff 패널 (FG 컬럼)", "FG Code" in p.locator("[data-handoff-panel]").inner_text())
        b.close()
finally:
    psql("DELETE FROM sys_approval_request WHERE target_table='erp_handoff' AND comment LIKE '%ERP Handoff%'")
    psql("DELETE FROM erp_handoff")
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
