# -*- coding: utf-8 -*-
"""G1 라이브 — Design Editor CAD 명령 툴바 실동작.

API: 부품도 실체화(part-drawing/save→fileId, 재호출 시 같은 fileId 재사용)·이동/복사/삭제 편집 영속.
UI: Design Editor CAD 명령 버튼(복사/이동/삭제…) 클릭 시 편집 모드 활성(무반응 아님).
정리: 실체화 파일 DELETE.
실행: PYTHONUTF8=1 py tests/live_g1_design_edit.py
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


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    # 실체화
    s1 = req.post(f"{API}/cad/part-drawing/save", data={"dims": {}, "name": "designedit_test.dxf"}).json()
    fid = s1["fileId"]
    base = len(s1["document"]["entities"])
    ok("부품도 실체화 → fileId·엔티티", isinstance(fid, int) and base > 0)
    s2 = req.post(f"{API}/cad/part-drawing/save", data={"dims": {}, "name": "designedit_test.dxf"}).json()
    ok("재실체화 = 같은 fileId(중복 없음)", s2["fileId"] == fid)

    ln = next((e for e in s1["document"]["entities"] if e["entityType"] == "line"), None)
    ok("LINE 엔티티 존재", ln is not None)
    eid = ln["entityId"]
    # 복사 → +1
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [{"op": "copy", "entityId": eid, "dx": 100, "dy": 80}]}).json()
    ok("복사(CO) 적용 → 엔티티 +1", r.get("applied") == 1 and len(r["document"]["entities"]) == base + 1)
    # 삭제 → -1
    r2 = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [{"op": "delete", "entityId": eid}]}).json()
    ok("삭제(E) 적용 → 엔티티 -1", r2.get("applied") == 1 and len(r2["document"]["entities"]) == base)
    ok("영속 — 재-GET 유지", len(req.get(f"{API}/cad/view/{fid}").json()["document"]["entities"]) == base)

    # UI — CAD 명령 버튼이 편집 모드 활성(무반응 아님)
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1600, "height": 900})
    p.goto(f"{BASE}/plm", wait_until="domcontentloaded")
    p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
    if p.locator('.login-dlg').count():
        p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
        p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=15000)
    p.locator('.titlebar .mod', has_text='PLM').first.click(); p.wait_for_timeout(400)
    p.locator('.tn', has_text='Design Editor').first.click()
    p.wait_for_selector('svg[data-cad-svg] g > *', timeout=15000); p.wait_for_timeout(500)
    ok("CAD 명령 버튼(복사 CO) 존재", p.get_by_role('button', name='복사 CO').count() >= 1)
    ok("초기 편집 토글 없음(읽기 전용)", p.locator('[data-cad-edit-toggle]').count() == 0)
    p.get_by_role('button', name='복사 CO').first.click()
    p.wait_for_selector('[data-cad-edit-toggle]', timeout=8000)
    ok("복사 CO 클릭 → 편집 모드 활성(무반응 아님)", p.locator('[data-cad-edit-toggle]').count() == 1)
    b.close()

    # 정리
    ok("정리 — 실체화 파일 삭제", req.delete(f"{API}/files/{fid}").status in (200, 204))

print(f"\nOK — live_g1_design_edit {n}/{n}")
