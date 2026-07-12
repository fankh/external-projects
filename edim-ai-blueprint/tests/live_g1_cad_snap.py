# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 객체 스냅 + Ortho.

UI(CAD 뷰어 편집·작도): 기존 엔티티 끝점/중점 근처에서 작도 시작 → 좌표가 정확히 스냅.
  Ortho — Shift 유지 시 축정렬(수평/수직) 선 생성.
좌표 매핑: SVG 엔티티 그룹 getScreenCTM 으로 도면→화면 변환(정확 위치 지정).
정리: DELETE /files/{id}.
실행: PYTHONUTF8=1 py tests/live_g1_cad_snap.py
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


def near(a, b, tol=0.1):
    return abs(a - b) < tol


CTM_JS = """([x,y]) => {
  const g = document.querySelector('svg[data-cad-svg] g');
  const m = g.getScreenCTM();
  const p = new DOMPoint(x, y).matrixTransform(m);
  return { x: p.x, y: p.y };
}"""


def lines_from(doc, P):
    return [e for e in doc["entities"] if e["entityType"] == "line"
            and near(e["startPoint"]["x"], P["x"]) and near(e["startPoint"]["y"], P["y"])]


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "snap_ui.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]
    doc0 = imp["document"]
    base = len(doc0["entities"])
    ln0 = next(e for e in doc0["entities"] if e["entityType"] == "line")
    E = {"x": ln0["startPoint"]["x"], "y": ln0["startPoint"]["y"]}                 # 끝점
    M = {"x": (ln0["startPoint"]["x"] + ln0["endPoint"]["x"]) / 2,
         "y": (ln0["startPoint"]["y"] + ln0["endPoint"]["y"]) / 2}               # 중점
    ok("import + 스냅 기준점(끝점·중점)", base > 0)

    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    p.locator(".tn", has_text="Project Folder·이력 (M-15-8/9)").click()
    p.locator("tr:visible", has_text="snap_ui.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="snap_ui.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    p.locator("svg[data-cad-svg] g > *").first.wait_for(timeout=10000)
    p.locator("[data-cad-edit-toggle]").click(); p.wait_for_timeout(120)
    p.locator("[data-cad-draw-tool='line']").click(); p.wait_for_timeout(120)
    box = p.locator("svg[data-cad-svg]").bounding_box()

    # ── 끝점 스냅 + Ortho(Shift) ──
    before_E = len(lines_from(doc0, E))
    es = p.evaluate(CTM_JS, [E["x"], E["y"]])
    p.mouse.move(es["x"] + 5, es["y"] + 5)     # 끝점 5px 근처 → 스냅
    p.keyboard.down("Shift")
    p.mouse.down()
    p.mouse.move(box["x"] + box["width"] - 16, box["y"] + 16, steps=8)   # 빈 여백(코너)
    p.mouse.up()
    p.keyboard.up("Shift")
    p.wait_for_timeout(1200)
    doc1 = req.get(f"{API}/cad/view/{fid}").json()["document"]
    ok("작도 후 엔티티 +1", len(doc1["entities"]) == base + 1)
    from_E = lines_from(doc1, E)
    ok("끝점 스냅 — 시작점이 정확히 끝점 좌표", len(from_E) == before_E + 1)
    new_E = [e for e in from_E if not (near(e["endPoint"]["x"], ln0["endPoint"]["x"])
                                       and near(e["endPoint"]["y"], ln0["endPoint"]["y"]))]
    ok("Ortho — 새 선이 축정렬(수평 또는 수직)",
       any(near(e["endPoint"]["y"], E["y"]) or near(e["endPoint"]["x"], E["x"]) for e in new_E))

    # ── 중점 스냅 ──
    before_M = len(lines_from(doc1, M))
    ms = p.evaluate(CTM_JS, [M["x"], M["y"]])
    p.mouse.move(ms["x"] - 5, ms["y"] + 4)     # 중점 근처 → 스냅
    p.mouse.down()
    p.mouse.move(box["x"] + 16, box["y"] + box["height"] - 16, steps=8)
    p.mouse.up()
    p.wait_for_timeout(1200)
    doc2 = req.get(f"{API}/cad/view/{fid}").json()["document"]
    ok("중점 스냅 — 시작점이 정확히 중점 좌표", len(lines_from(doc2, M)) == before_M + 1)

    b.close()
    req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", True)

print(f"\nOK — live_g1_cad_snap {n}/{n}")
