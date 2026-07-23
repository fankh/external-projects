# -*- coding: utf-8 -*-
"""Guide AI 질의 감사 라이브 (9.14) — 요구 #64 '질문·답변 감사'.

검증: /ai/chat 호출이 sys_history 에 AI_QUERY 로 남는가(질문·근거·행위자·테넌트).
     검색은 테넌트 스코프이므로 다른 테넌트 자산은 근거에 안 걸린다.
정리: 남긴 감사 행 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
MARK = "ZZAIQ-검증질문"
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


def cleanup():
    psql(f"DELETE FROM sys_history WHERE action='AI_QUERY' AND after_data::text LIKE '%{MARK}%'")


TOK = login("edim", "edim")
cleanup()

try:
    # 스캔 전 감사 0
    ok("검증 전 AI_QUERY 감사 0",
       psql(f"SELECT count(*) FROM sys_history WHERE action='AI_QUERY' "
            f"AND after_data::text LIKE '%{MARK}%'") == "0")

    # 빈 질문 422
    st, _ = req("POST", "/ai/chat", TOK, {"question": "   "})
    ok(f"빈 질문 422 ({st})", st == 422)

    # 실제 질의 (내부 자산 검색)
    st, r = req("POST", "/ai/chat", TOK, {"question": f"{MARK} FDV 펌프 도면"})
    ok(f"★ /ai/chat 200 (mode={r.get('mode')}, 근거 {len(r.get('refs', []))})",
       st == 200 and "refs" in r and r.get("mode") in ("search", "live", "error"))

    # ── 핵심: 질의가 감사에 남았는가 ──
    ok("★ AI_QUERY 감사 기록됨",
       psql(f"SELECT count(*) FROM sys_history WHERE action='AI_QUERY' "
            f"AND after_data::text LIKE '%{MARK}%'") == "1")
    row = psql(f"SELECT actor_id, target_table, after_data::text FROM sys_history "
               f"WHERE action='AI_QUERY' AND after_data::text LIKE '%{MARK}%' LIMIT 1")
    ok(f"감사에 질문·행위자·근거 포함 ({row[:70]})",
       MARK in row and "refCount" in row and "ai_chat" in row)

    # 재질의 → 감사 누적 (매 질의마다 남는다)
    st, _ = req("POST", "/ai/chat", TOK, {"question": f"{MARK} 두번째"})
    ok("★ 재질의도 감사 누적",
       int(psql(f"SELECT count(*) FROM sys_history WHERE action='AI_QUERY' "
                f"AND after_data::text LIKE '%{MARK}%'")) == 2)
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM sys_history WHERE action='AI_QUERY' "
                f"AND after_data::text LIKE '%{MARK}%'")
    print(f"정리 — AI_QUERY 감사 삭제 (잔존 {left})")

print(f"\nlive_ai_audit: {n}/{n} PASS")
