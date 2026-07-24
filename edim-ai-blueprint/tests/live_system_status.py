# -*- coding: utf-8 -*-
"""운영 준비 상태 엔드포인트 라이브 (9.6) — /system/status.

배포 검증·ops 모니터링용. EDIM 운영자 전용(PLATFORM), 적용 마이그레이션 리비전 노출.
검증: 무토큰 401 · 고객 Admin 403 · 운영자 200(migrationHead·tableCount·db) · 공개 /health 무변경.
"""
import json
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


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok=None):
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    r = urllib.request.Request(API + path, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


OP = login("edim", "edim")       # nova 운영자 (PLATFORM 권한)
GEN = login("kim01", "edim")     # 일반

# 무토큰 401
st, _ = req("GET", "/system/status")
ok(f"무토큰 401 ({st})", st == 401)

# 일반 사용자 403 (운영자 전용)
st, _ = req("GET", "/system/status", GEN)
ok(f"★ 비운영자 403 ({st})", st == 403)

# 운영자 200 — 마이그레이션 리비전·테이블 수·db
st, s = req("GET", "/system/status", OP)
ok(f"★ 운영자 200 ({st})", st == 200)
ok(f"db ok ({s.get('db')})", s.get("db") is True)
ok(f"★ migrationHead 노출 ({s.get('migrationHead')})",
   bool(s.get("migrationHead")) and s["migrationHead"][0].isdigit())
ok(f"tableCount 노출 ({s.get('tableCount')})", isinstance(s.get("tableCount"), int) and s["tableCount"] >= 50)
ok(f"serverTime 노출 ({s.get('serverTime')})", bool(s.get("serverTime")))
ok(f"★ dbLoad 실시간 부하 신호 ({s.get('dbLoad')})",
   isinstance(s.get("dbLoad"), dict) and "activeQueries" in s["dbLoad"]
   and "longestQuerySec" in s["dbLoad"])

# 공개 /health 는 그대로 (계약 유지)
st, h = req("GET", "/health")
ok(f"공개 /health 무변경 ({h})", st == 200 and h.get("status") == "ok" and h.get("db") is True)

print(f"\nlive_system_status: {n}/{n} PASS")
