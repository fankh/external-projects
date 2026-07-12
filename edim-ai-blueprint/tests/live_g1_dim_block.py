# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 치수(DI)·블록(REG) 삽입.

API: dim=치수선+거리텍스트(DIM 레이어)·block=라벨 박스(사각+텍스트, BLOCK 레이어)·영속.
정리: 실체화 파일 삭제.
실행: PYTHONUTF8=1 py tests/live_g1_dim_block.py
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

    s = req.post(f"{API}/cad/part-drawing/save", data={"dims": {}, "name": "dimblock_test.dxf"}).json()
    fid = s["fileId"]
    base = len(s["document"]["entities"])
    ok("부품도 실체화", isinstance(fid, int) and base > 0)

    # 치수 — (9000,0)-(10000,0) 거리 1000
    r = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "dim", "x1": 9000, "y1": 0, "x2": 10000, "y2": 0}]}).json()
    ok("치수 add 적용", r.get("applied") == 1)
    doc = r["document"]
    ok("치수 → 엔티티 +2(선+텍스트)", len(doc["entities"]) == base + 2)
    dimtext = next((e for e in doc["entities"] if e["entityType"] == "text"
                    and e["textContent"] == "1000" and e["layerName"] == "DIM"), None)
    ok("거리 텍스트(1000)·DIM 레이어", dimtext is not None)
    dimline = next((e for e in doc["entities"] if e["entityType"] == "line" and e["layerName"] == "DIM"
                    and near(e["startPoint"]["x"], 9000)), None)
    ok("치수선 DIM 레이어", dimline is not None)

    base2 = len(doc["entities"])
    # 블록 — (7000,7000)-(7600,7400) 라벨 박스
    r2 = req.post(f"{API}/cad/view/{fid}/edit", data={"ops": [
        {"op": "add", "entityType": "block", "x1": 7000, "y1": 7000, "x2": 7600, "y2": 7400, "text": "PUMP-1"}]}).json()
    ok("블록 add 적용", r2.get("applied") == 1)
    doc2 = r2["document"]
    ok("블록 → 엔티티 +2(사각+텍스트)", len(doc2["entities"]) == base2 + 2)
    blk = next((e for e in doc2["entities"] if e["entityType"] == "polyline" and e.get("isClosed")
                and e["layerName"] == "BLOCK" and len(e["vertexPoints"]) == 4
                and any(near(v["x"], 7000) and near(v["y"], 7000) for v in e["vertexPoints"])), None)
    ok("블록 사각 BLOCK 레이어(4정점)", blk is not None)
    blktext = next((e for e in doc2["entities"] if e["entityType"] == "text"
                    and e["textContent"] == "PUMP-1" and e["layerName"] == "BLOCK"), None)
    ok("블록 라벨 텍스트(PUMP-1)", blktext is not None)

    # 영속
    ok("영속 — 재-GET +4", len(req.get(f"{API}/cad/view/{fid}").json()["document"]["entities"]) == base + 4)
    ok("정리 — 실체화 파일 삭제", req.delete(f"{API}/files/{fid}").status in (200, 204))

print(f"\nOK — live_g1_dim_block {n}/{n}")
