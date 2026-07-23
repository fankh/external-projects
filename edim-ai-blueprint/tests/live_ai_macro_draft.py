# -*- coding: utf-8 -*-
"""Macro AI Draft 무상태 불변식 라이브 (9.15) — 요구 #65 '항상 Draft'.

핵심 불변식: /ai/macro-generate 는 **초안 제안만** 반환하고 아무것도 저장/게시하지 않는다.
AI 가 macro 를 자동 생성·게시할 수 없다 — tbx_macro 행이 늘지 않아야 한다. 실제 반영은
사용자가 수동 저장 후 Toolbox 거버넌스(draft→guard→sandbox→approved→published)를 거친다.
크레딧과 무관한 거버넌스층(LLM 응답 품질은 크레딧 대기).
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


TOK = login("edim", "edim")        # SETUP+
GEN = login("kim01", "edim")       # GENERAL

# 권한: 생성 도우미는 SETUP 전용
st, _ = req("POST", "/ai/macro-generate", GEN, {"prompt": "합계 매크로"})
ok(f"★ GENERAL 은 macro-generate 403 ({st})", st == 403)

# 빈 프롬프트 422
st, _ = req("POST", "/ai/macro-generate", TOK, {"prompt": "   "})
ok(f"빈 프롬프트 422 ({st})", st == 422)

# ── 핵심: 생성은 무상태 — tbx_macro 가 늘지 않는다 ──
before = int(psql("SELECT count(*) FROM tbx_macro"))
pub_before = int(psql("SELECT count(*) FROM tbx_macro WHERE status='PUBLISHED'") or 0)
st, r = req("POST", "/ai/macro-generate", TOK, {"prompt": "MC 가 500 초과면 Table12 합계"})
ok(f"★ 초안 반환 200 (mode={r.get('mode')})", st == 200 and "formula" in r)
ok("★ 초안에 formula·description 포함", bool(r.get("formula")) and "description" in r)
after = int(psql("SELECT count(*) FROM tbx_macro"))
pub_after = int(psql("SELECT count(*) FROM tbx_macro WHERE status='PUBLISHED'") or 0)
ok(f"★ 생성은 아무것도 저장하지 않음 (tbx_macro {before}→{after})", after == before)
ok(f"★ AI 가 게시본을 만들지 않음 (PUBLISHED {pub_before}→{pub_after})", pub_after == pub_before)

# 재호출도 무상태
st, _ = req("POST", "/ai/macro-generate", TOK, {"prompt": "두번째 프롬프트"})
ok("재호출도 무상태",
   int(psql("SELECT count(*) FROM tbx_macro")) == before)

print(f"\nlive_ai_macro_draft: {n}/{n} PASS")
