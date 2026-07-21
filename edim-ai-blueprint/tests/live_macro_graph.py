# -*- coding: utf-8 -*-
"""Macro 5-View 단일 Graph 라이브 (7.0) — 요구 #60.

배경: 5개 뷰가 서로 독립 컬럼이라 하나만 고쳐도 나머지는 옛 내용으로 남았고 정본이 없었다.
검증: Graph 미생성 상태 → 재생성(수식 정본) → 결정성(같은 수식=같은 체크섬) →
     뷰 변경 시 stale 지목 → 재정렬 → 수식 변경 시 체크섬 변화 → 빈 수식·파싱 실패 422.
정리: ZZGRAPH 매크로 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
M = "ZZGRAPH"
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
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql("DELETE FROM tbx_macro WHERE macro_name LIKE 'ZZGRAPH%'")


TOK = login("edim", "edim")
cleanup()

try:
    # 5-View 를 가진 매크로 준비
    psql("INSERT INTO tbx_macro (tenant_id, macro_name, prompt_text, macro_expr, "
         "description_text, apply_type, status) SELECT tenant_id, '" + M + "', "
         "'길이를 구한다', 'SQRT(A + B) * 2', '설명 원본', 'MACRO', 'DRAFT' "
         "FROM sys_user WHERE login_id='edim' LIMIT 1")

    st, g0 = req("GET", f"/macros/{M}/graph", TOK)
    ok(f"Graph 미생성 상태 조회 200 ({st})", st == 200 and g0["hasGraph"] is False)
    ok("미생성 시 stale 지목 없음", g0["staleViews"] == [])

    # ── 재생성 (수식이 정본) ──
    st, r1 = req("POST", f"/macros/{M}/graph/rebuild", TOK)
    ok(f"★ Graph 재생성 200 — 노드 {r1.get('nodes')}·엣지 {r1.get('edges')}", st == 200 and r1["nodes"] >= 4)
    ok(f"입력·함수 추출 (inputs {r1['inputs']} · funcs {r1['functions']})",
       r1["inputs"] == ["A", "B"] and r1["functions"] == ["SQRT"])
    ck1 = r1["checksum"]
    ok("체크섬 64자", len(ck1) == 64)

    st, g1 = req("GET", f"/macros/{M}/graph", TOK)
    ok("Graph 저장·조회", g1["hasGraph"] is True and g1["checksum"] == ck1)
    ok("★ 재생성 직후 어긋난 뷰 없음", g1["staleViews"] == [])

    # ── 결정성: 같은 수식 재생성 = 같은 체크섬 ──
    st, r2 = req("POST", f"/macros/{M}/graph/rebuild", TOK)
    ok("★ 같은 수식이면 같은 Graph 체크섬 (결정적)", r2["checksum"] == ck1)

    # ── 한 뷰만 고치면 그 뷰가 stale 로 지목된다 ──
    psql("UPDATE tbx_macro SET description_text='설명만 수정' WHERE macro_name='" + M + "'")
    st, g2 = req("GET", f"/macros/{M}/graph", TOK)
    ok(f"★ 고친 뷰만 stale 지목 ({g2['staleViews']})", g2["staleViews"] == ["description"])
    ok("나머지 뷰는 동기 상태",
       all(v["synced"] for v in g2["views"] if v["view"] != "description"))

    # ── 재정렬하면 해소 ──
    st, _ = req("POST", f"/macros/{M}/graph/rebuild", TOK)
    st, g3 = req("GET", f"/macros/{M}/graph", TOK)
    ok("★ 재정렬 후 stale 해소", g3["staleViews"] == [])
    ok("수식이 그대로면 체크섬도 그대로", g3["checksum"] == ck1)

    # ── 수식을 바꾸면 Graph 도 바뀐다 ──
    psql("UPDATE tbx_macro SET macro_expr='SQRT(A + C) * 2' WHERE macro_name='" + M + "'")
    st, r3 = req("POST", f"/macros/{M}/graph/rebuild", TOK)
    ok(f"★ 수식 변경 시 체크섬 변화", r3["checksum"] != ck1 and r3["inputs"] == ["A", "C"])

    # ── 실패 경로 ──
    psql("UPDATE tbx_macro SET macro_expr='((A +' WHERE macro_name='" + M + "'")
    st, b = req("POST", f"/macros/{M}/graph/rebuild", TOK)
    ok(f"★ 파싱 실패 422 ({st})", st == 422 and "파싱" in (b or {}).get("detail", ""))
    psql("UPDATE tbx_macro SET macro_expr='' WHERE macro_name='" + M + "'")
    st, b = req("POST", f"/macros/{M}/graph/rebuild", TOK)
    ok(f"★ 빈 수식 422 ({st})", st == 422 and "비어" in (b or {}).get("detail", ""))
    st, _ = req("GET", "/macros/NO_SUCH_MACRO/graph", TOK)
    ok(f"없는 Macro 404 ({st})", st == 404)

    # ── 권한 ──
    gtok = login("kim01", "edim")
    st, _ = req("POST", f"/macros/{M}/graph/rebuild", gtok)
    ok(f"GENERAL 재생성 403 ({st})", st == 403)
    st, _ = req("GET", f"/macros/{M}/graph", gtok)
    ok("GENERAL 조회는 허용", st == 200)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM tbx_macro WHERE macro_name LIKE 'ZZGRAPH%'")
    print(f"정리 — ZZGRAPH 삭제 (잔존 {left})")

print(f"\nlive_macro_graph: {n}/{n} PASS")
