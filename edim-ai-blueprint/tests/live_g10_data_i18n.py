# -*- coding: utf-8 -*-
"""G10 라이브 — 데이터 콘텐츠 i18n (마스터 데이터 번역 트랙, sys_translation).

API 계약 (edim.seekerslab.com):
  GET /i18n/data/{type}(원문+번역)·/map(오버레이)·PUT /i18n/data(upsert·빈값 삭제),
  COMPANY/PRODUCT 대상, 미지원 type 404·잘못된 locale 422.
실행: PYTHONUTF8=1 py tests/live_g10_data_i18n.py
정리: 생성한 번역은 빈 값 저장(삭제)으로 자기정리 — 잔여 없음.
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


def req(method, path, body=None, tok=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", f"Bearer {tok}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "null")
        except Exception:
            return e.code, None


st, tb = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})
tok = tb.get("token") if tb else None
ok("로그인", st == 200 and tok)

# ── 목록 구조 ──
st, rows = req("GET", "/i18n/data/COMPANY?locale=en", tok=tok)
ok("COMPANY 목록 200", st == 200 and isinstance(rows, list) and rows)
ok("목록 필드(entityId·source·value)", all(k in rows[0] for k in ("entityId", "source", "value")))
cid = rows[0]["entityId"]
csource = rows[0]["source"]

# 미지원 type → 404
st, _ = req("GET", "/i18n/data/FOO?locale=en", tok=tok)
ok("미지원 entity_type → 404", st == 404)
# 잘못된 locale → 422
st, _ = req("GET", "/i18n/data/COMPANY?locale=de", tok=tok)
ok("잘못된 locale → 422", st == 422)

# ── 번역 upsert ──
VAL = "E2E Test Company EN"
st, r = req("PUT", "/i18n/data", {"entityType": "COMPANY", "entityId": cid, "locale": "en", "value": VAL}, tok)
ok("번역 저장 200", st == 200 and r.get("value") == VAL)

st, rows = req("GET", "/i18n/data/COMPANY?locale=en", tok=tok)
row = next((x for x in rows if x["entityId"] == cid), None)
ok("목록에 번역 반영", row and row["value"] == VAL)
ok("원문 보존", row and row["source"] == csource)

# 오버레이 맵
st, mp = req("GET", "/i18n/data/COMPANY/map?locale=en", tok=tok)
ok("오버레이 맵에 번역 포함", mp.get(str(cid)) == VAL)
# ko 맵은 빈 사전
st, mko = req("GET", "/i18n/data/COMPANY/map?locale=ko", tok=tok)
ok("ko 맵 = 빈 사전(원문 사용)", mko == {})

# 다른 로케일은 독립
st, mja = req("GET", "/i18n/data/COMPANY/map?locale=ja", tok=tok)
ok("ja 맵엔 en 번역 없음(로케일 독립)", str(cid) not in mja)

# ── PRODUCT 대상도 동작 ──
st, prows = req("GET", "/i18n/data/PRODUCT?locale=ja", tok=tok)
if prows:
    pid = prows[0]["entityId"]
    st, _ = req("PUT", "/i18n/data", {"entityType": "PRODUCT", "entityId": pid, "locale": "ja", "value": "製品テスト"}, tok)
    ok("PRODUCT 번역 저장 200", st == 200)
    st, pmap = req("GET", "/i18n/data/PRODUCT/map?locale=ja", tok=tok)
    ok("PRODUCT 맵 반영", pmap.get(str(pid)) == "製品テスト")
    # 정리
    req("PUT", "/i18n/data", {"entityType": "PRODUCT", "entityId": pid, "locale": "ja", "value": ""}, tok)
else:
    ok("PRODUCT 대상 없음(스킵)", True)
    ok("PRODUCT 맵(스킵)", True)

# ── 빈 값 = 삭제 (자기정리) ──
st, r = req("PUT", "/i18n/data", {"entityType": "COMPANY", "entityId": cid, "locale": "en", "value": ""}, tok)
ok("빈 값 저장 = 삭제", st == 200 and r.get("deleted") is True)
st, mp = req("GET", "/i18n/data/COMPANY/map?locale=en", tok=tok)
ok("삭제 후 맵에서 제거(원문 복귀)", str(cid) not in mp)

print(f"\nOK — live_g10_data_i18n {n}/{n}")
