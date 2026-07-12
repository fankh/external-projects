# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 엔티티 편집 라운드트립: 이동/삭제 → DXF 재저장 → 영속.

API(SETUP):
  import — arrangement DXF 를 /cad/import 로 편집 대상 파일 생성.
  move   — e{n} 이동 → 반환 문서 좌표가 델타만큼 이동.
  delete — 엔티티 삭제 → 엔티티 수 −1.
  persist— 재-GET /cad/view 로 삭제/이동 유지 확인.
  guard  — 없는 entityId = 422.
정리: DELETE /files/{id} (업로드 파일 제거).
실행: PYTHONUTF8=1 py tests/live_g1_cad_edit.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def first_line(doc):
    for e in doc["entities"]:
        if e["entityType"] == "line":
            return e
    return None


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    # 편집 대상 DXF 확보 — arrangement 실 DXF 를 import
    dxf = req.get(f"{API}/cad/arrangement.dxf").body()
    ok("arrangement DXF 확보", dxf[:2] == b"  " or b"SECTION" in dxf[:2000] or len(dxf) > 100)

    imp = req.post(f"{API}/cad/import", multipart={
        "uploadedFile": {"name": "edit_test.dxf", "mimeType": "application/dxf", "buffer": dxf},
        "project": "PS-61313-5",
    }).json()
    fid = imp["fileId"]
    doc0 = imp["document"]
    base_count = len(doc0["entities"])
    ok("DXF import → 편집 대상 파일 생성", isinstance(fid, int) and base_count > 0)

    ln = first_line(doc0)
    ok("LINE 엔티티 존재(이동 대상)", ln is not None)
    eid = ln["entityId"]
    sx0, sy0 = ln["startPoint"]["x"], ln["startPoint"]["y"]

    # move — dx=100, dy=50
    r = req.post(f"{API}/cad/view/{fid}/edit",
                 data={"ops": [{"op": "move", "entityId": eid, "dx": 100, "dy": 50}]}).json()
    ok("move 적용 1건", r.get("applied") == 1)
    ln2 = next((e for e in r["document"]["entities"] if e["entityId"] == eid), None)
    ok("이동 후 좌표 = 델타 반영",
       ln2 is not None
       and abs(ln2["startPoint"]["x"] - (sx0 + 100)) < 0.5
       and abs(ln2["startPoint"]["y"] - (sy0 + 50)) < 0.5)

    # delete — 같은 eid
    r2 = req.post(f"{API}/cad/view/{fid}/edit",
                  data={"ops": [{"op": "delete", "entityId": eid}]}).json()
    ok("delete 적용 1건", r2.get("applied") == 1)
    ok("삭제 후 엔티티 수 −1", len(r2["document"]["entities"]) == base_count - 1)

    # persist — 재조회
    view = req.get(f"{API}/cad/view/{fid}").json()
    ok("영속 — 재-GET 엔티티 수 유지(−1)", len(view["document"]["entities"]) == base_count - 1)

    # guard — 없는 entityId
    bad = req.post(f"{API}/cad/view/{fid}/edit",
                   data={"ops": [{"op": "move", "entityId": "e99999", "dx": 1, "dy": 1}]})
    ok("없는 entityId = 422", bad.status == 422)

    # cleanup
    dele = req.delete(f"{API}/files/{fid}")
    ok("정리 — DELETE /files/{id}", dele.status in (200, 204))

print(f"\nOK — live_g1_cad_edit {n}/{n}")
