# -*- coding: utf-8 -*-
"""G3 라이브 — 역할 생성/삭제.

API: 커스텀 역할 생성·예약/중복 409·내장 삭제 409·사용자 배정 시 삭제 409·미배정 삭제.
안전: edim 역할은 원본 캡처 후 반드시 복원(finally).
실행: PYTHONUTF8=1 py tests/live_g3_roles.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
RN = "ZZROLE_TEST"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def names():
        return {r["name"] for r in req.get(f"{API}/roles").json()}

    orig = req.get(f"{API}/users/edim/roles").json()   # 원본 역할 백업
    # 사전 정리
    if RN in names():
        req.delete(f"{API}/roles/{RN}")
    try:
        ok("역할 생성 201", req.post(f"{API}/roles", data={"name": RN, "description": "테스트"}).status == 201)
        ok("생성 역할 목록 포함", RN in names())
        ok("중복 생성 409", req.post(f"{API}/roles", data={"name": RN}).status == 409)
        ok("예약(내장) 이름 생성 409", req.post(f"{API}/roles", data={"name": "ADMIN"}).status == 409)
        ok("내장 역할 삭제 409", req.delete(f"{API}/roles/GENERAL").status == 409)

        # 사용자 배정 시 삭제 409 (edim 에 임시 부여 → 복원)
        req.put(f"{API}/users/edim/roles", data={"roles": orig + [RN]})
        ok("배정된 역할 삭제 409", req.delete(f"{API}/roles/{RN}").status == 409)
        req.put(f"{API}/users/edim/roles", data={"roles": orig})   # 복원
        ok("edim 역할 복원", req.get(f"{API}/users/edim/roles").json() == orig)

        # 미배정 삭제
        ok("역할 삭제 200", req.delete(f"{API}/roles/{RN}").status == 200)
        ok("삭제 후 목록 제거", RN not in names())
    finally:
        req.put(f"{API}/users/edim/roles", data={"roles": orig})   # 안전 복원
        if RN in names():
            req.delete(f"{API}/roles/{RN}")
    ok("정리 — 원본 역할 유지", req.get(f"{API}/users/edim/roles").json() == orig)

print(f"\nOK — live_g3_roles {n}/{n}")
