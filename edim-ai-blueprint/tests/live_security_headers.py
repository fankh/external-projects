# -*- coding: utf-8 -*-
"""보안 응답 헤더 라이브 (9.8) — nginx 하드닝 회귀 방지.

메인 앱(Next SSR)과 API 응답에 표준 보안 헤더가 있는지 확인한다. 누군가 nginx 설정을
바꾸며 실수로 빼면 여기서 실패한다.
"""
import urllib.request

BASE = "https://edim.seekerslab.com"
n = 0

REQUIRED = {
    "strict-transport-security": "max-age",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "referrer-policy": "strict-origin",
    "content-security-policy": "frame-ancestors",
}


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def headers_of(path):
    r = urllib.request.Request(BASE + path, method="GET")
    with urllib.request.urlopen(r, timeout=30) as resp:
        return {k.lower(): v for k, v in resp.headers.items()}


for path, label in (("/login", "메인 앱(Next SSR)"), ("/api/v1/health", "API")):
    h = headers_of(path)
    for hdr, expect in REQUIRED.items():
        ok(f"{label} — {hdr} ({expect})", expect.lower() in h.get(hdr, "").lower())
    # 서버 버전 비노출
    ok(f"{label} — 서버 버전 숨김 ({h.get('server')})", h.get("server", "") == "nginx")

print(f"\nlive_security_headers: {n}/{n} PASS")
