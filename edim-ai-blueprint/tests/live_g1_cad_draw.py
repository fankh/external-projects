# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 자유 작도: line/circle/rect 생성 → DXF 추가·영속.

API: add(line·circle·rect) → 엔티티 +1, 지정 좌표/반경/닫힌 폴리라인 생성 확인.
UI: 작도 툴(／) 드래그 → 엔티티 +1 (영속). 정리: DELETE /files/{id}.
실행: PYTHONUTF8=1 py tests/live_g1_cad_draw.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def near(a, b, tol=1.0):
    return abs(a - b) < tol


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "draw_api.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]
    base = len(imp["document"]["entities"])
    ok("import", base > 0)

    # add line
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "line", "layer": "DRAW", "x1": 9000, "y1": 9000, "x2": 9500, "y2": 9400}]}).json()
    ok("add line 적용", r.get("applied") == 1 and len(r["document"]["entities"]) == base + 1)
    ln = next((e for e in r["document"]["entities"] if e["entityType"] == "line"
               and near(e["startPoint"]["x"], 9000) and near(e["startPoint"]["y"], 9000)), None)
    ok("생성된 line 좌표 일치", ln is not None and near(ln["endPoint"]["x"], 9500) and near(ln["endPoint"]["y"], 9400))

    # add circle
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "circle", "layer": "DRAW", "x1": 8000, "y1": 8000, "radius": 250}]}).json()
    ok("add circle 적용", r.get("applied") == 1 and len(r["document"]["entities"]) == base + 2)
    ci = next((e for e in r["document"]["entities"] if e["entityType"] == "circle"
               and near(e["centerPoint"]["x"], 8000) and near(e["radius"], 250)), None)
    ok("생성된 circle 반경 일치", ci is not None)

    # add rect → 닫힌 폴리라인 4정점
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "rect", "layer": "DRAW", "x1": 7000, "y1": 7000, "x2": 7600, "y2": 7400}]}).json()
    ok("add rect 적용", r.get("applied") == 1 and len(r["document"]["entities"]) == base + 3)
    rc = next((e for e in r["document"]["entities"] if e["entityType"] == "polyline"
               and e.get("isClosed") and len(e["vertexPoints"]) == 4
               and any(near(v["x"], 7000) and near(v["y"], 7000) for v in e["vertexPoints"])), None)
    ok("생성된 rect = 닫힌 폴리라인 4정점", rc is not None)

    # 영속
    ok("영속 — 재-GET +3", len(req.get(f"{API}/cad/view/{fid}").json()["document"]["entities"]) == base + 3)
    req.delete(f"{API}/files/{fid}")

    # ── UI: ／ 작도 툴 드래그 ──
    imp2 = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "draw_ui.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid2 = imp2["fileId"]
    base2 = len(imp2["document"]["entities"])

    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    p.locator(".tn", has_text="Project Folder·이력 (M-15-8/9)").click()
    p.locator("tr:visible", has_text="draw_ui.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="draw_ui.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    p.locator("svg[data-cad-svg] g > *").first.wait_for(timeout=10000)
    p.locator("[data-cad-edit-toggle]").click()
    p.wait_for_timeout(150)
    ok("작도 툴 노출", p.locator("[data-cad-draw-tool='line']").count() == 1)
    p.locator("[data-cad-draw-tool='line']").click()
    p.wait_for_timeout(150)
    box = p.locator("svg[data-cad-svg]").bounding_box()
    p.mouse.move(box["x"] + 40, box["y"] + 40)
    p.mouse.down()
    p.mouse.move(box["x"] + 220, box["y"] + 160, steps=6)
    p.mouse.up()
    p.wait_for_timeout(1200)
    b.close()
    after = len(req.get(f"{API}/cad/view/{fid2}").json()["document"]["entities"])
    ok("UI ／ 드래그 = 엔티티 +1(영속)", after == base2 + 1)
    req.delete(f"{API}/files/{fid2}")
    ok("정리", True)

print(f"\nOK — live_g1_cad_draw {n}/{n}")
