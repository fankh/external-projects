# -*- coding: utf-8 -*-
"""날짜 파라미터 검증 라이브 (9.32) — 오형식 날짜 500→422.

배경: 사용자 날짜 파라미터를 검증 없이 %s::date 로 캐스트하던 엔드포인트가 오형식 입력
('notadate') 에 PostgreSQL 캐스트 오류 → 500 을 냈다(실측 /audit?fromDate=notadate 500).
_valid_date 헬퍼로 사전 검증해 빈 값은 무시, 오형식은 422 로 정정. GET(감사·단가해석) +
POST(공휴일·마일스톤·환율)에 적용. 오형식 POST 는 쿼리 전에 422 이라 아무것도 쓰지 않는다.
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


TOK = login("edim", "edim")


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


# ── GET: 감사 로그 날짜 필터 ──
ok(f"★ /audit fromDate 오형식 → 422 (500 아님)", req("GET", "/audit?fromDate=notadate") == 422)
ok(f"★ /audit toDate 오형식 → 422", req("GET", "/audit?toDate=2026-13-99") == 422)
ok(f"/audit 정상 날짜 → 200", req("GET", "/audit?fromDate=2026-01-01&toDate=2026-12-31") == 200)
ok(f"/audit 날짜 미지정 → 200", req("GET", "/audit") == 200)

# ── GET: 단가 해석 at ──
ok(f"★ /prices/resolve at 오형식 → 422", req("GET", "/prices/resolve?code=ZZ&at=notadate") == 422)

# ── POST: 공휴일 (오형식은 쿼리 전 422 — 미기록) ──
ok(f"★ 공휴일 등록 오형식 날짜 → 422 (미기록)", req("POST", "/calendar/holidays", {"date": "notadate", "name": "ZZ검증"}) == 422)

# ── POST: 환율 (오형식은 INSERT 전 422) ──
ok(f"★ 환율 upsert 오형식 validFrom → 422", req("POST", "/finance/fx", {"currency": "USD", "rate": 1300, "validFrom": "bad"}) == 422)

print(f"\nlive_date_validation: {n}/{n} PASS")
