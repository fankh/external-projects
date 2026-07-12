# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 엔티티 편집 2차: 복사/회전/미러 라운드트립.

API(SETUP): copy=엔티티 수 +1 · rotate 90°=길이 보존·좌표 변경 · mirror(수직축)=길이 보존·좌표 변경.
정리: DELETE /files/{id}.
실행: PYTHONUTF8=1 py tests/live_g1_cad_edit2.py
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


def line_by_id(doc, eid):
    return next((e for e in doc["entities"] if e["entityId"] == eid), None)


def length(ln):
    return math.hypot(ln["endPoint"]["x"] - ln["startPoint"]["x"],
                      ln["endPoint"]["y"] - ln["startPoint"]["y"])


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "edit2_test.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]
    doc0 = imp["document"]
    base = len(doc0["entities"])
    ln0 = next((e for e in doc0["entities"] if e["entityType"] == "line"), None)
    ok("import + LINE 확보", isinstance(fid, int) and ln0 is not None)
    eid = ln0["entityId"]
    len0 = length(ln0)
    s0 = (ln0["startPoint"]["x"], ln0["startPoint"]["y"])

    # copy → 엔티티 +1
    r = req.post(f"{API}/cad/view/{fid}/edit",
                 data={"ops": [{"op": "copy", "entityId": eid, "dx": 300, "dy": 200}]}).json()
    ok("copy 적용 1건", r.get("applied") == 1)
    ok("복사 후 엔티티 수 +1", len(r["document"]["entities"]) == base + 1)
    ok("원본 엔티티 id 유지(복사본은 말미 추가)", line_by_id(r["document"], eid) is not None)

    # rotate 90° → 길이 보존 · 좌표 변경
    r = req.post(f"{API}/cad/view/{fid}/edit",
                 data={"ops": [{"op": "rotate", "entityId": eid, "angle": 90}]}).json()
    lr = line_by_id(r["document"], eid)
    ok("rotate 적용 1건", r.get("applied") == 1)
    ok("회전 후 길이 보존", lr is not None and abs(length(lr) - len0) < 0.5)
    ok("회전 후 좌표 변경",
       abs(lr["startPoint"]["x"] - s0[0]) > 0.5 or abs(lr["startPoint"]["y"] - s0[1]) > 0.5)

    # mirror(수직축, 중심 통과) → 길이 보존 + 반사 항등식(start.x ↔ end.x 스왑·y 불변)
    sx_old, sy_old = lr["startPoint"]["x"], lr["startPoint"]["y"]
    ex_old = lr["endPoint"]["x"]
    r = req.post(f"{API}/cad/view/{fid}/edit",
                 data={"ops": [{"op": "mirror", "entityId": eid, "axis": "y"}]}).json()
    lm = line_by_id(r["document"], eid)
    ok("mirror 적용 1건", r.get("applied") == 1)
    ok("미러 후 길이 보존", lm is not None and abs(length(lm) - len0) < 0.5)
    ok("미러 반사 항등식 (start.x→end.x·y 불변)",
       abs(lm["startPoint"]["x"] - ex_old) < 0.5 and abs(lm["startPoint"]["y"] - sy_old) < 0.5)

    # guard — 없는 id rotate
    bad = req.post(f"{API}/cad/view/{fid}/edit",
                   data={"ops": [{"op": "rotate", "entityId": "e99999", "angle": 90}]})
    ok("없는 id rotate = 422", bad.status == 422)

    dele = req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", dele.status in (200, 204))

print(f"\nOK — live_g1_cad_edit2 {n}/{n}")
