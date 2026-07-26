# -*- coding: utf-8 -*-
"""설계 검증 규칙 자동 판정 (D4) — 임계값이 실제로 적용되는가 (18.36).

배경: API 표면 커버리지 실측(18.9)에서 `POST /drawings/{no}/verify` 가 **한 번도 호출된 적
없는** 경로로 잡혔다. 검증을 붙이려 호출해 보니 결함이 드러났다 —

    A=1000 → K 1,620 (한계 1,500 초과) · B 1,056 (한계 900 초과) → **합격**
    A=5000 → K 8,100 (한계의 5.4배)                              → **합격**
    A=0    → K 0                                                  → 불합격

판정 규약은 "규칙 매크로 값이 0 이 아니면 통과" 인데, 시드가 붙여 둔 규칙이 **치수 매크로**
(`DIM B = A+56`, `DIM K = A*1.62`)였다. 치수는 0 이 되는 일이 거의 없으니 사실상 항상
합격이었다. **경고 문구가 약속한 검사가 수행되지 않았다.** → 판정 전용 매크로로 교체(0060).

여기서는 임계값이 실제로 걸리는지, 그리고 합격/불합격이 값에 따라 갈리는지를 밟는다.
정리: 읽기 전용 평가라 데이터를 바꾸지 않는다.

실행: PYTHONUTF8=1 py tests/live_design_verify.py
"""
import json
import urllib.error
import urllib.request
from urllib.parse import quote

API = "https://edim.seekerslab.com/api/v1"
DRAWING = "KDCR 3-13"
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


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}",
                                        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


TOK = login("edim", "edim")


def verify(a_value):
    return req("POST", f"/drawings/{quote(DRAWING)}/verify", TOK,
               {"measurements": {"A": a_value}})


# ── 한계 안쪽: 합격 ──
# A=500 → B 556(<=900) · K 810(<=1500)
st, r = verify(500)
ok(f"검증 실행 200 ({st})", st == 200)
ok(f"규칙 2건 평가 ({r.get('evaluated')})", r.get("evaluated") == 2)
ok(f"★ 한계 안쪽은 합격 (B 556 · K 810) — {r.get('suggestion')}",
   r.get("suggestion") == "합격" and r.get("fail") == 0)

# ── B 한계 초과: 불합격 ──
# A=1000 → B 1,056 (>900 위반) · K 1,620 (>1500 위반) — 둘 다 걸린다
st, r = verify(1000)
ok(f"★ 한계 초과는 불합격 (B 1,056 · K 1,620) — {r.get('suggestion')}",
   r.get("suggestion") == "불합격")
ok(f"★ 위반 규칙 수가 값과 맞는다 (fail={r.get('fail')})", r.get("fail") == 2)
warns = [x.get("warning") for x in r.get("results", []) if not x.get("pass")]
ok(f"★ 위반에 경고 문구가 붙는다 — {str(warns)[:70]}",
   all(w for w in warns) and any("900" in (w or "") for w in warns))

# ── 경계값: 한계 자체는 통과(<=) ──
# B=900 이 되려면 A=844, K=1367 (<=1500) → 둘 다 통과
st, r = verify(844)
ok(f"★ 경계값(B=900)은 통과 — {r.get('suggestion')} (한계 '초과' 가 기준)",
   r.get("suggestion") == "합격")

# ── 한 규칙만 위반: 부분 판정이 드러나는가 ──
# A=900 → B 956(위반) · K 1,458(<=1500 통과)
st, r = verify(900)
ok(f"★ 한 규칙만 위반해도 불합격 (fail={r.get('fail')}/2)",
   r.get("suggestion") == "불합격" and r.get("fail") == 1 and r.get("pass") == 1)

# ── 규칙 없는 도면은 정직하게 404 ──
st, b = req("POST", f"/drawings/{quote('KDCR 3-12')}/verify", TOK, {"measurements": {"A": 10}})
ok(f"활성 규칙 없는 도면 404 ({st})", st == 404 and "규칙" in (b or {}).get("detail", ""))

# ── 없는 도면 ──
st, _ = req("POST", "/drawings/ZZNODRAW-999/verify", TOK, {"measurements": {"A": 10}})
ok(f"없는 도면 404 ({st})", st == 404)

print(f"\nlive_design_verify: {n}/{n} PASS")
