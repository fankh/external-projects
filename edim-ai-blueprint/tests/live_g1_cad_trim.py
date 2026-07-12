# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 트림/연장.

API: 십자로 교차하는 선 추가 → trim(끝점을 교점으로 단축)·extend(교점까지 연장)·평행=422.
UI: CAD 뷰어 편집 모드에 ✂ 트림 툴 노출.
정리: DELETE /files/{id}.
실행: PYTHONUTF8=1 py tests/live_g1_cad_trim.py
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


def near(a, b, tol=0.5):
    return abs(a - b) < tol


def find_line(doc, sx, sy, ex, ey):
    for e in doc["entities"]:
        if e["entityType"] != "line":
            continue
        s, en = e["startPoint"], e["endPoint"]
        if ((near(s["x"], sx) and near(s["y"], sy) and near(en["x"], ex) and near(en["y"], ey))
                or (near(s["x"], ex) and near(s["y"], ey) and near(en["x"], sx) and near(en["y"], sy))):
            return e
    return None


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "trim_test.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]

    # A 수평(12000,0)-(12100,0) · B 수직(12050,±50) · C 짧은 수평(12000,100)-(12030,100) · D 평행(12000,200)-(12100,200)
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "line", "x1": 12000, "y1": 0, "x2": 12100, "y2": 0},
        {"op": "add", "entityType": "line", "x1": 12050, "y1": -50, "x2": 12050, "y2": 50},
        {"op": "add", "entityType": "line", "x1": 12000, "y1": 100, "x2": 12030, "y2": 100},
        {"op": "add", "entityType": "line", "x1": 12000, "y1": 200, "x2": 12100, "y2": 200},
    ]}).json()
    doc = r["document"]
    A = find_line(doc, 12000, 0, 12100, 0)
    B = find_line(doc, 12050, -50, 12050, 50)
    C = find_line(doc, 12000, 100, 12030, 100)
    D = find_line(doc, 12000, 200, 12100, 200)
    ok("교차 선 4개 추가", all([A, B, C, D]))

    # trim A → B: A 의 끝(12100,0) 근처 클릭 → 교점(12050,0) 으로 단축
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "trim", "entityId": A["entityId"], "boundaryId": B["entityId"], "x1": 12100, "y1": 0}]}).json()
    ok("trim 적용", r.get("applied") == 1)
    A2 = find_line(r["document"], 12000, 0, 12050, 0)
    ok("트림 — 끝점이 교점(12050,0)으로 단축", A2 is not None)

    # extend C → B: C 의 끝(12030,100) 근처 클릭 → 교점(12050,100) 까지 연장
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "trim", "entityId": C["entityId"], "boundaryId": B["entityId"], "x1": 12030, "y1": 100}]}).json()
    ok("extend 적용", r.get("applied") == 1)
    C2 = find_line(r["document"], 12000, 100, 12050, 100)
    ok("연장 — 끝점이 교점(12050,100)까지 연장", C2 is not None)

    # guard — 평행선(D)에 트림 = 교점 없음 → 422
    bad = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "trim", "entityId": A["entityId"], "boundaryId": D["entityId"], "x1": 12050, "y1": 0}]})
    ok("평행선 트림 = 422(교점 없음)", bad.status == 422)

    # 영속
    fin = req.get(f"{API}/cad/view/{fid}").json()["document"]
    ok("영속 — 트림/연장 유지", find_line(fin, 12000, 0, 12050, 0) is not None
       and find_line(fin, 12000, 100, 12050, 100) is not None)

    # UI — ✂ 트림 툴 노출
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/common", wait_until="networkidle")
    if p.locator(".login-dlg").count():
        p.get_by_label("사번").fill("edim"); p.get_by_label("비밀번호").fill("edim")
        p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=10000)
    p.locator(".tn", has_text="Project Folder·이력 (M-15-8/9)").click()
    p.locator("tr:visible", has_text="trim_test.dxf").first.wait_for(timeout=15000)
    p.locator("tr:visible", has_text="trim_test.dxf").first.dblclick()
    p.locator(".mdi .t.on", has_text="CAD").wait_for(timeout=6000)
    p.locator("svg[data-cad-svg] g > *").first.wait_for(timeout=10000)
    p.locator("[data-cad-edit-toggle]").click(); p.wait_for_timeout(150)
    ok("✂ 트림 툴 노출·활성", p.locator("[data-cad-trim-toggle]").count() == 1)
    p.locator("[data-cad-trim-toggle]").click(); p.wait_for_timeout(150)
    b.close()

    req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", True)

print(f"\nOK — live_g1_cad_trim {n}/{n}")
