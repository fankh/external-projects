# -*- coding: utf-8 -*-
"""B15 라이브 회귀 — RBAC 403 매트릭스 · 401 · 업로드 에러 케이스 · i18n 폴백.

브라우저 없이 Playwright APIRequestContext 로 순수 API 검증.
실행: PYTHONUTF8=1 py tests/live_b15_regression.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def login(user: str) -> str:
        r = req.post(f"{BASE}/auth/login", data={"userId": user, "password": "edim"})
        assert r.ok, r.status
        return r.json()["token"]

    tok_general = login("kim01")     # GENERAL (시드 v2)
    tok_admin = login("edim")        # ADMIN

    def call(token: str, method: str, path: str, **kw):
        return req.fetch(f"{BASE}{path}", method=method,
                         headers={"Authorization": f"Bearer {token}",
                                  "Content-Type": "application/json"}, **kw)

    # 1. RBAC 403 매트릭스 — GENERAL 은 쓰기 전부 거부 (SETUP+ 필요)
    WRITE_ENDPOINTS = [
        ("POST", "/approvals", {"targetTable": "t", "label": "x"}),
        ("PUT", "/macros/Shaft%20길이%20계산", {"expr": "=1"}),
        ("POST", "/prices", {"code": "FDV-480", "price": 1, "source": "견적", "validFrom": "2030-01-01"}),
        ("POST", "/documents", {"docNo": "X", "title": "x"}),
        ("PUT", "/drawings/dimensions", {"dims": []}),
        ("POST", "/arrangements", {"code": "X", "name": "x"}),
        ("POST", "/materials", {"code": "X", "name": "x"}),
        ("PUT", "/roles/GENERAL/permissions", {"permissions": {}}),
        ("PUT", "/erp/work-process", {"items": []}),
        ("PUT", "/toolbox/templets/X", {"definition": {}}),
    ]
    for method, path, body in WRITE_ENDPOINTS:
        r = call(tok_general, method, path, data=body)
        ok(f"GENERAL {method} {path} -> 403", r.status == 403)

    # 2. GENERAL 읽기는 허용
    r = call(tok_general, "GET", "/prices")
    ok("GENERAL GET /prices -> 200", r.status == 200)

    # 3. 무효/변조 토큰 -> 401
    r = req.get(f"{BASE}/prices", headers={"Authorization": "Bearer bad.token.sig"})
    ok("변조 토큰 -> 401", r.status == 401)
    r = req.get(f"{BASE}/prices")
    ok("무토큰 -> 401", r.status == 401)

    # 4. 업로드 에러 케이스 (ADMIN 토큰)
    r = req.post(f"{BASE}/files/upload",
                 headers={"Authorization": f"Bearer {tok_admin}"},
                 multipart={
                     "uploadedFile": {"name": "evil.exe", "mimeType": "application/octet-stream",
                                      "buffer": b"MZ"},
                     "folder": "RECEIVED", "project": "PS-61313-5"})
    ok("업로드 .exe -> 422", r.status == 422)
    r = req.post(f"{BASE}/files/upload",
                 headers={"Authorization": f"Bearer {tok_admin}"},
                 multipart={
                     "uploadedFile": {"name": "a.txt", "mimeType": "text/plain", "buffer": b"x"},
                     "folder": "NOPE", "project": "PS-61313-5"})
    ok("업로드 folder 오류 -> 422", r.status == 422)

    # 5. i18n 폴백 — 미지원 로케일은 빈 사전, en 은 확장 키 포함
    r = req.get(f"{BASE}/i18n/xx")
    ok("i18n 미지원 로케일 -> 200 빈 사전", r.ok and r.json() == {})
    r = req.get(f"{BASE}/i18n/en")
    ok("i18n en >= 600 키", r.ok and len(r.json()) >= 600)

    req.dispose()

print(f"\nB15 회귀: {n}/16 pass")
