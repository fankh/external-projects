# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 마퀴 다중 선택 + 일괄 편집.

UI(CAD 뷰어, 편집 모드): 빈곳 드래그 = 박스 선택 → 'N개 선택' 패널 → 🗑 일괄 삭제 → DXF 재저장.
API: 다중 op 배열(이동/삭제) 한 요청 처리 확인. 영속은 재-GET 로 검증. 정리: DELETE /files/{id}.
실행: PYTHONUTF8=1 py tests/live_g1_cad_marquee.py
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

    # ── API: 다중 op 배열(일괄) ──
    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "marquee_api.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid_api = imp["fileId"]
    ents = [e["entityId"] for e in imp["document"]["entities"]]
    base = len(ents)
    ok("API import", base >= 3)
    r = req.post(f"{API}/cad/view/{fid_api}/edit",
                 data={"ops": [{"op": "delete", "entityId": ents[0]},
                               {"op": "delete", "entityId": ents[1]}]}).json()
    ok("일괄 delete 2건 적용", r.get("applied") == 2)
    ok("일괄 삭제 후 엔티티 −2", len(r["document"]["entities"]) == base - 2)
    ok("영속 — 재-GET −2", len(req.get(f"{API}/cad/view/{fid_api}").json()["document"]["entities"]) == base - 2)
    req.delete(f"{API}/files/{fid_api}")

    # ── UI: 마퀴 선택 + 🗑 일괄 삭제 ──
    imp2 = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "marquee_ui.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp2["fileId"]
    base_ui = len(imp2["document"]["entities"])

    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim")
        p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    tree_click(p, "Project Folder·이력 (M-15-8/9)")
    p.locator("tr:visible", has_text="marquee_ui.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="marquee_ui.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    p.locator("svg[data-cad-svg] g > *").first.wait_for(timeout=10000)
    ok("CAD 뷰어 렌더", p.locator("svg[data-cad-svg] g > *").count() > 0)

    # 편집 모드 진입 → ✎ 버튼 존재(=editable)
    ok("편집 버튼 노출(editable)", p.locator("[data-cad-edit-toggle]").count() == 1)
    p.locator("[data-cad-edit-toggle]").click()
    p.wait_for_timeout(200)

    # 마퀴: SVG 좌상단 여백(빈곳)에서 대각선 드래그로 전체 포함
    box = p.locator("svg[data-cad-svg]").bounding_box()
    p.mouse.move(box["x"] + 6, box["y"] + 6)
    p.mouse.down()
    p.mouse.move(box["x"] + box["width"] - 6, box["y"] + box["height"] - 6, steps=8)
    p.mouse.up()
    p.wait_for_timeout(300)
    panel = p.locator("[data-cad-entity-info]")
    ok("마퀴 = 다중 선택 패널('선택')", panel.count() == 1 and "선택" in panel.inner_text())

    # 🗑 일괄 삭제 → DXF 재저장
    p.locator("[data-cad-delete]").click()
    p.wait_for_timeout(1200)
    b.close()

    after = len(req.get(f"{API}/cad/view/{fid}").json()["document"]["entities"])
    ok("마퀴 일괄 삭제 후 엔티티 감소(영속)", after < base_ui)
    req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", True)

print(f"\nOK — live_g1_cad_marquee {n}/{n}")
