# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 축척 인쇄(plot to scale): 1:scale 벡터 PDF.

API: plot.pdf → application/pdf·%PDF·축척/용지별 생성·scale=0 기본화·잘못된 file 404.
UI: CAD 뷰어에 🖶 축척 PDF 버튼 노출. 정리: DELETE /files/{id}.
실행: PYTHONUTF8=1 py tests/live_g1_cad_plot.py
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


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "plot_test.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]
    ok("import", isinstance(fid, int))

    r = req.get(f"{API}/cad/view/{fid}/plot.pdf?scale=100&paper=A4&orient=landscape")
    body = r.body()
    ok("plot.pdf 200 · application/pdf", r.status == 200 and "application/pdf" in r.headers.get("content-type", ""))
    ok("PDF 시그니처(%PDF)·비자명 크기", body[:4] == b"%PDF" and len(body) > 800)
    ok("파일명 축척 표기(1-100)", "1-100" in r.headers.get("content-disposition", ""))

    r2 = req.get(f"{API}/cad/view/{fid}/plot.pdf?scale=50&paper=A3&orient=portrait")
    ok("A3·1:50·세로도 유효 PDF", r2.status == 200 and r2.body()[:4] == b"%PDF")

    r3 = req.get(f"{API}/cad/view/{fid}/plot.pdf?scale=0")
    ok("scale=0 → 기본 축척(유효 PDF)", r3.status == 200 and r3.body()[:4] == b"%PDF")

    r404 = req.get(f"{API}/cad/view/99999999/plot.pdf?scale=100")
    ok("없는 file = 404", r404.status == 404)

    # UI — 🖶 축척 PDF 버튼 노출
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    tree_click(p, "Project Folder·이력 (M-15-8/9)")
    p.locator("tr:visible", has_text="plot_test.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="plot_test.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    ok("CAD 뷰어 🖶 축척 PDF 버튼 노출",
       p.get_by_role("button", name="축척 PDF").count() >= 1)
    b.close()

    req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", True)

print(f"\nOK — live_g1_cad_plot {n}/{n}")
