# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 교차점 스냅 + Polar(45°).

교차점: 십자 두 선의 교점 근처 작도 시작 → 시작점이 정확히 교점에 스냅.
Polar: Shift 유지 + 대각선 드래그 → 45° 정렬(Δx≈Δy) 선 생성.
정리: 실체화/업로드 파일 삭제.
실행: PYTHONUTF8=1 py tests/live_g1_cad_snap2.py
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

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


CTM = """([x,y]) => { const g=document.querySelector('svg[data-cad-svg] g'); const m=g.getScreenCTM();
  const p=new DOMPoint(x,y).matrixTransform(m); return {x:p.x, y:p.y}; }"""


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "snap2_ui.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5"}).json()
    fid = imp["fileId"]
    # 십자 두 선 — 교점 (20500, 0)
    req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "line", "x1": 20000, "y1": 0, "x2": 21000, "y2": 0},
        {"op": "add", "entityType": "line", "x1": 20500, "y1": -500, "x2": 20500, "y2": 500}]})
    base = len(req.get(f"{API}/cad/view/{fid}").json()["document"]["entities"])
    ok("십자 선 추가", base >= 2)
    IX, IY = 20500.0, 0.0

    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    tree_click(p, "Project Folder·이력 (M-15-8/9)")
    p.locator("tr:visible", has_text="snap2_ui.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="snap2_ui.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    p.locator("svg[data-cad-svg] g > *").first.wait_for(timeout=10000)
    p.locator("[data-cad-edit-toggle]").click(); p.wait_for_timeout(120)
    p.locator("[data-cad-draw-tool='line']").click(); p.wait_for_timeout(120)
    box = p.locator("svg[data-cad-svg]").bounding_box()

    # ── 교차점 스냅 ── 교점 근처(5px)에서 작도 시작
    def lines_from(doc, x, y):
        return [e for e in doc["entities"] if e["entityType"] == "line"
                and near(e["startPoint"]["x"], x) and near(e["startPoint"]["y"], y)]
    doc0 = req.get(f"{API}/cad/view/{fid}").json()["document"]
    before = len(lines_from(doc0, IX, IY))
    es = p.evaluate(CTM, [IX, IY])
    p.mouse.move(es["x"] + 5, es["y"] + 4)
    p.mouse.down()
    p.mouse.move(box["x"] + box["width"] - 20, box["y"] + 20, steps=6)
    p.mouse.up()
    p.wait_for_timeout(1200)
    doc1 = req.get(f"{API}/cad/view/{fid}").json()["document"]
    ok("작도 후 +1", len(doc1["entities"]) == base + 1)
    ok("교차점 스냅 — 시작점=교점(20500,0)", len(lines_from(doc1, IX, IY)) == before + 1)

    # ── Polar 45° ── 교점(스냅) 시작 + Shift + 대각선 → 45°(Δx≈Δy)
    es2 = p.evaluate(CTM, [IX, IY])
    p.mouse.move(es2["x"] + 4, es2["y"] + 4)
    p.keyboard.down("Shift"); p.mouse.down()
    p.mouse.move(es2["x"] - 160, es2["y"] + 160, steps=8)   # 등거리 대각선 → 45° 로 스냅
    p.mouse.up(); p.keyboard.up("Shift")
    p.wait_for_timeout(1200)
    doc2 = req.get(f"{API}/cad/view/{fid}").json()["document"]
    polar = [e for e in lines_from(doc2, IX, IY)
             if abs(abs(e["endPoint"]["x"] - IX) - abs(e["endPoint"]["y"] - IY)) < max(1.0, abs(e["endPoint"]["x"] - IX) * 0.02)
             and abs(e["endPoint"]["x"] - IX) > 1]
    ok("Polar 45° — Δx≈Δy 선 생성", len(polar) >= 1)

    b.close()
    req.delete(f"{API}/files/{fid}")
    ok("정리 — 파일 삭제", True)

print(f"\nOK — live_g1_cad_snap2 {n}/{n}")
