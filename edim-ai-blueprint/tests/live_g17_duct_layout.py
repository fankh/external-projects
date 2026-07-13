# -*- coding: utf-8 -*-
"""G17 라이브 — DuctDesign 실엔진화 (M-4-3).

API 계약 (edim.seekerslab.com):
  GET /cad/duct-layout?diffusers=&floor= → 실 DXF 작도 정규화 문서
  (ROOM·NOZONE·DUCT·DIFFUSER·DIM 레이어, DIFFUSER 원 수 = diffusers, 12 상한 클램프).
실행: PYTHONUTF8=1 py tests/live_g17_duct_layout.py
정리: 없음 (생성 전용, 영속 없음).
"""
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method, path, tok=None):
    r = urllib.request.Request(BASE + path, method=method)
    if tok:
        r.add_header("Authorization", f"Bearer {tok}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        return e.code, None


lr = urllib.request.Request(BASE + "/auth/login", data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
                            headers={"Content-Type": "application/json"}, method="POST")
tok = json.loads(urllib.request.urlopen(lr, timeout=30).read())["token"]
ok("로그인", bool(tok))


def diffuser_circles(doc):
    return [e for e in doc["entities"] if e["entityType"] == "circle" and e["layerName"] == "DIFFUSER"]


# 기본 3
st, d = req("GET", "/cad/duct-layout?diffusers=3&floor=3F", tok)
ok("duct-layout 200 · document", st == 200 and d and "document" in d)
doc = d["document"]
ok("엔티티 존재(실엔진 작도)", len(doc["entities"]) > 0)
layers = {e["layerName"] for e in doc["entities"]}
ok("레이어 ROOM·DUCT·DIFFUSER·DIM 포함", {"ROOM", "DUCT", "DIFFUSER", "DIM"} <= layers)
ok("DIFFUSER 원 3개", len(diffuser_circles(doc)) == 3)
# 방(폴리라인)·덕트 경로 존재
ok("ROOM 폴리라인 존재", any(e["entityType"] == "polyline" and e["layerName"] == "ROOM" for e in doc["entities"]))
ok("DUCT 경로 폴리라인 존재", any(e["entityType"] == "polyline" and e["layerName"] == "DUCT" for e in doc["entities"]))
ok("bounds 유효", doc["bounds"]["maxX"] > doc["bounds"]["minX"])

# Diffuser 5
st, d5 = req("GET", "/cad/duct-layout?diffusers=5&floor=2F", tok)
ok("Diffuser 5 → 원 5개", len(diffuser_circles(d5["document"])) == 5)

# 상한 클램프 (12)
st, d20 = req("GET", "/cad/duct-layout?diffusers=20", tok)
ok("diffusers=20 → 12 클램프", len(diffuser_circles(d20["document"])) == 12)
# 하한 (0 → 1)
st, d0 = req("GET", "/cad/duct-layout?diffusers=0", tok)
ok("diffusers=0 → 최소 1", len(diffuser_circles(d0["document"])) == 1)

print(f"\nOK — live_g17_duct_layout {n}/{n}")
