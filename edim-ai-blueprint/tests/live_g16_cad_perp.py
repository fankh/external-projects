# -*- coding: utf-8 -*-
"""G16 라이브 — CAD perp(수선) 스냅.

빈 공간의 시작점 S 에서 대상 선 세그먼트 근처로 작도 → 끝점이 수선의 발 F 로 스냅
(그려진 선이 대상 선과 수직·끝점이 대상 선상). ⊥ 인디케이터(data-cad-perp).
좌표 매핑: SVG 엔티티 그룹 getScreenCTM.
실행: PYTHONUTF8=1 py tests/live_g16_cad_perp.py
정리: DELETE /files/{id}.
"""
import math
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


CTM_JS = """([x,y]) => {
  const g = document.querySelector('svg[data-cad-svg] g');
  const m = g.getScreenCTM();
  const p = new DOMPoint(x, y).matrixTransform(m);
  return { x: p.x, y: p.y };
}"""


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    # 최소 단일 선 DXF (교차/부가 스냅점 없는 깨끗한 perp 장면)
    MIN_DXF = (
        "0\nSECTION\n2\nHEADER\n0\nENDSEC\n"
        "0\nSECTION\n2\nENTITIES\n"
        "0\nLINE\n8\n0\n10\n0.0\n20\n0.0\n30\n0.0\n11\n1000.0\n21\n600.0\n31\n0.0\n"
        "0\nENDSEC\n0\nEOF\n"
    ).encode()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "perp_ui.dxf", "mimeType": "application/dxf", "buffer": MIN_DXF},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]
    doc0 = imp["document"]
    base = len(doc0["entities"])

    ln = next(e for e in doc0["entities"] if e["entityType"] == "line")
    A = (ln["startPoint"]["x"], ln["startPoint"]["y"])
    B = (ln["endPoint"]["x"], ln["endPoint"]["y"])
    L = math.dist(A, B)
    # 세그먼트의 0.35 지점 P (끝점·중점 아님) — 수선의 발 목표
    t = 0.35
    P = (A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]))
    # 단위 수직 벡터 n
    ux, uy = (B[0] - A[0]) / L, (B[1] - A[1]) / L
    nx, ny = -uy, ux
    off = L * 0.16                   # 빈 공간 확보용 오프셋(뷰 내 유지)
    S = (P[0] + nx * off, P[1] + ny * off)
    ok("import + 대상 선/수선 목표", base > 0 and L > 0)

    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    p.locator(".tn", has_text="Project Folder·이력 (M-15-8/9)").click()
    p.locator("tr:visible", has_text="perp_ui.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="perp_ui.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    p.locator("svg[data-cad-svg] g > *").first.wait_for(timeout=10000)
    p.locator("[data-cad-edit-toggle]").click(); p.wait_for_timeout(120)
    p.locator("[data-cad-draw-tool='line']").click(); p.wait_for_timeout(120)

    ss = p.evaluate(CTM_JS, [S[0], S[1]])
    ps = p.evaluate(CTM_JS, [P[0], P[1]])
    p.mouse.move(ss["x"], ss["y"])        # 빈 공간 시작점 (스냅 안됨)
    p.mouse.down()
    # 대상 선의 P 근처로 이동 → perp 스냅
    p.mouse.move(ps["x"] + 3, ps["y"] + 3, steps=10)
    p.wait_for_timeout(200)
    ok("작도 중 ⊥ perp 인디케이터 표시", p.locator("[data-cad-perp]").count() >= 1)
    p.mouse.up()
    p.wait_for_timeout(1200)

    doc1 = req.get(f"{API}/cad/view/{fid}").json()["document"]
    ok("작도 후 엔티티 +1", len(doc1["entities"]) == base + 1)

    # 새 선 찾기 (시작점이 S 근처)
    def near(a, b, tol):
        return abs(a - b) < tol
    tol = L * 0.06
    newl = [e for e in doc1["entities"] if e["entityType"] == "line"
            and near(e["startPoint"]["x"], S[0], tol) and near(e["startPoint"]["y"], S[1], tol)]
    ok("새 선 시작점 ≈ S", len(newl) == 1)
    e = newl[0]
    ex, ey = e["endPoint"]["x"], e["endPoint"]["y"]
    # 끝점이 수선의 발 P 근처
    ok("끝점 ≈ 수선의 발 P", near(ex, P[0], tol) and near(ey, P[1], tol))
    # 그려진 선이 대상 선과 수직 (방향 내적 ≈ 0)
    dx, dy = ex - e["startPoint"]["x"], ey - e["startPoint"]["y"]
    dlen = math.hypot(dx, dy)
    dot = abs((dx / dlen) * ux + (dy / dlen) * uy) if dlen else 1
    ok(f"그려진 선 ⟂ 대상 선 (|cos|={dot:.3f}<0.08)", dot < 0.08)

    b.close()
    req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", True)

print(f"\nOK — live_g16_cad_perp {n}/{n}")
