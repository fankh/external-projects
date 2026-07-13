# -*- coding: utf-8 -*-
"""G21 라이브 — Cvs·CadSvg 엔진 통합 (블록 → DrawingDocument → DXF).

API 계약 (edim.seekerslab.com):
  POST /cad/from-blocks → 블록 모델을 실 DXF(ezdxf) 작도한 정규화 DrawingDocument
  (블록=닫힌 폴리라인 + 라벨 텍스트, div y-down→도면 y-up 반전), 빈 blocks 422,
  POST /cad/from-blocks.dxf → DXF 다운로드.
실행: PYTHONUTF8=1 py tests/live_g21_engine_unify.py
정리: 없음 (변환 전용, 영속 없음).
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


def req(method, path, body=None, tok=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", f"Bearer {tok}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            b = resp.read()
            return resp.status, (b if raw else json.loads(b or "null"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, (e.read() if raw else json.loads(e.read() or "null"))
        except Exception:
            return e.code, None


st, tb = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})
tok = tb.get("token") if tb else None
ok("로그인", st == 200 and tok)

payload = {
    "name": "UnifyTest",
    "blocks": [
        {"id": "m", "name": "Mother", "sub": "KDX 9-9", "x": 200, "y": 12, "w": 150, "h": 60},
        {"id": "c1", "name": "Child", "sub": "KDC-1", "x": 20, "y": 130, "w": 118, "h": 52, "dashed": True},
    ],
    "dims": [{"x": 20, "y": 205, "w": 250, "label": "Child 2"}],
    "labels": [{"x": 0, "y": 0, "text": "TAG"}],
}

st, d = req("POST", "/cad/from-blocks", payload, tok)
ok("from-blocks 200 · document", st == 200 and "document" in d)
doc = d["document"]
ents = doc["entities"]
polys = [e for e in ents if e["entityType"] == "polyline"]
texts = [e["textContent"] for e in ents if e["entityType"] == "text"]
ok("블록 2개 → 닫힌 폴리라인 2개", len(polys) == 2 and all(p.get("isClosed") for p in polys))
ok("블록 라벨 텍스트(Mother·KDX 9-9·Child·KDC-1)",
   {"Mother", "KDX 9-9", "Child", "KDC-1"} <= set(texts))
ok("치수 라벨(Child 2)", "Child 2" in texts)
ok("자유 라벨(TAG)", "TAG" in texts)

# y-flip 검증 — Mother 블록 상단 y=-12·하단 y=-72
mother = next(p for p in polys if any(abs(v["y"] + 12) < 0.5 for v in p["vertexPoints"]))
ok("y 반전 — Mother 상단 y=-12", any(abs(v["y"] + 12) < 0.5 for v in mother["vertexPoints"]))
ok("y 반전 — Mother 하단 y=-72", any(abs(v["y"] + 72) < 0.5 for v in mother["vertexPoints"]))
ok("레이어 BLOCK·BLOCK_DASHED·DIM·LABEL",
   {"BLOCK", "BLOCK_DASHED", "DIM", "LABEL"} <= {e["layerName"] for e in ents})
ok("bounds 유효", doc["bounds"]["maxX"] > doc["bounds"]["minX"])

# 빈 blocks → 422
st, _ = req("POST", "/cad/from-blocks", {"blocks": []}, tok)
ok("빈 blocks → 422", st == 422)

# DXF 다운로드
st, raw = req("POST", "/cad/from-blocks.dxf", payload, tok, raw=True)
ok("from-blocks.dxf 200", st == 200)
txt = raw.decode("utf-8", "ignore")
ok("유효 DXF (SECTION·ENTITIES·LWPOLYLINE)",
   "SECTION" in txt and "ENTITIES" in txt and "LWPOLYLINE" in txt)

print(f"\nOK — live_g21_engine_unify {n}/{n}")
