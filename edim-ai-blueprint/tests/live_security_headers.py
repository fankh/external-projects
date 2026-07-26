# -*- coding: utf-8 -*-
"""보안 응답 헤더 라이브 (9.8) — nginx 하드닝 회귀 방지.

메인 앱(Next SSR)과 API 응답에 표준 보안 헤더가 있는지 확인한다. 누군가 nginx 설정을
바꾸며 실수로 빼면 여기서 실패한다.
"""
import urllib.error
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

# ── 구형 /api (v1 규약 밖) 경로가 열려 있지 않은지 (18.6) ──
# as-built API 목록을 뽑다가 드러났다: /api/v1 이 아닌 프로토타입 라우터 5개가 아직 마운트돼
# 있고, **애플리케이션 인증이 전혀 없다**(require_auth 는 edim 라우터 전용 의존성이다).
# 실제로 막고 있는 것은 nginx 의 server 레벨 auth_basic 하나뿐인데, 그 사실이 어디에도
# 적혀 있지 않았다 — 즉 **우연히 안전한 상태**였다. 유일한 소비자인 레거시 롤백 SPA 는
# 토큰을 보내지 않으므로 앱 인증을 걸면 롤백 자산이 깨진다. 그래서 통제 방식은 그대로 두고
# **그 통제가 살아 있다는 것을 불변식으로 고정**한다: location /api/ 에 auth_basic off 가
# 들어가거나 라우터가 다른 곳으로 옮겨지면 이 검증이 실패한다.
LEGACY = ["/api/health", "/api/models", "/api/drawings/upload",
          "/api/drawings/generate", "/api/drawings/export/dxf"]
for path in LEGACY:
    try:
        with urllib.request.urlopen(
                urllib.request.Request(BASE + path, method="GET"), timeout=30) as resp:
            code = resp.status
    except urllib.error.HTTPError as e:
        code = e.code
    ok(f"구형 {path} — 자격증명 없이 접근 차단 ({code})", code == 401)

print(f"\nlive_security_headers: {n}/{n} PASS")
