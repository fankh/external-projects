# -*- coding: utf-8 -*-
"""블록 배치 → DXF 생성 (18.39) — 미호출 경로 보강 + 조용한 절단 차단.

배경: API 표면 커버리지 실측(18.9)에서 `POST /cad/from-blocks`·`.dxf` 가 **한 번도 호출된
적 없는** 경로로 잡혔다. 같은 목록에서 고른 `/drawings/{no}/verify` 가 실제로 결함을 갖고
있었으므로(18.36 — 사실상 항상 합격) 이쪽도 확인한다.

찾은 것: `blocks[:500]`·`dims[:200]`·`labels[:200]` 로 **조용히 잘랐다**. 목록이 잘리는
것과 달리 **도면은 잘려도 완성된 도면처럼 보인다** — 빠진 형상을 알아챌 방법이 없고, 그
도면으로 제작이 진행되면 실물이 달라진다. → 상한 초과는 그리지 않고 422 로 알린다.

밟는 것: 정상 생성(엔티티 수 반영) · 빈 blocks 422 · 상한 초과 422와 사유의 개수·상한 ·
경계값은 통과 · .dxf 응답이 실제 DXF 인가.
정리: 서버에 아무것도 저장하지 않는 순수 변환이라 잔재가 없다.

실행: PYTHONUTF8=1 py tests/live_cad_blocks.py
"""
import json
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(path, tok, body, raw=False):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode(), method="POST",
                               headers={"Authorization": f"Bearer {tok}",
                                        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            blob = resp.read()
            return resp.status, (blob if raw else json.loads(blob or b"null"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


TOK = login("edim", "edim")


def blocks(count):
    return [{"id": f"B{i}", "name": f"블록{i}", "x": i * 10.0, "y": 0.0,
             "w": 8.0, "h": 5.0} for i in range(count)]


# ── 정상 생성 ──
st, r = req("/cad/from-blocks", TOK, {"name": "ZZ블록도", "blocks": blocks(3),
                                      "labels": [{"text": "검증", "x": 0, "y": 20}]})
ok(f"블록도 생성 200 ({st})", st == 200)
doc = (r or {}).get("document") or {}
ok(f"도면 문서 반환 (엔티티 {len(doc.get('entities', []))}개)", bool(doc.get("entities")))

# ── 빈 입력은 그리지 않는다 ──
st, b = req("/cad/from-blocks", TOK, {"blocks": []})
ok(f"빈 blocks 422 ({st})", st == 422 and "blocks" in (b or {}).get("detail", ""))

# ── 상한 초과: 잘라 그리지 않고 알린다 (18.39) ──
st, b = req("/cad/from-blocks", TOK, {"name": "ZZ초과", "blocks": blocks(501)})
detail = (b or {}).get("detail", "")
ok(f"★ 상한 초과 422 ({st}) — 잘라서 그리면 빠진 형상을 알 수 없다", st == 422)
ok(f"거부 사유에 실제 개수·상한이 있다 — {detail[:60]}", "501" in detail and "500" in detail)

# ── 경계값은 통과 (과잉 차단 아님) ──
st, r = req("/cad/from-blocks", TOK, {"name": "ZZ경계", "blocks": blocks(500)})
ok(f"★ 경계값(500개)은 통과 ({st}) — 과잉 차단 아님", st == 200)

# ── .dxf 응답이 실제 DXF 인가 ──
st, blob = req("/cad/from-blocks.dxf", TOK, {"name": "ZZ다운", "blocks": blocks(2)}, raw=True)
ok(f"DXF 다운로드 200 ({st} · {len(blob) if st == 200 else 0}B)", st == 200)
ok("DXF 형식(SECTION 헤더 포함)", b"SECTION" in blob and b"ENTITIES" in blob)

print(f"\nlive_cad_blocks: {n}/{n} PASS")
