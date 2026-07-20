# -*- coding: utf-8 -*-
"""셸 라이브 — MDI 파라미터 다중 인스턴스(v34.36) · 로그인 부가 요소(v34.37).

실행: PYTHONUTF8=1 py tests/live_shell_mdi_login.py
정리: 데이터 생성 없음 (탭 상태는 브라우저 localStorage — 컨텍스트 종료로 소멸).
"""
import json
import os
import urllib.request
from urllib.parse import unquote

BASE = os.getenv("BASE", "https://edim.seekerslab.com/").rstrip("/")
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


r0 = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]
drawings = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{API}/drawings", headers={"Authorization": f"Bearer {TOK}"})).read())
codes = [d["drawingNo"] for d in drawings[:2]]
assert len(codes) == 2, "도면 2건 필요"

from playwright.sync_api import sync_playwright  # noqa: E402

with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_context(viewport={"width": 1600, "height": 900}).new_page()

    # ── 1. 로그인 부가 요소 (레거시 LoginScreen 패리티) ──
    p.goto(f"{BASE}/login", wait_until="networkidle")
    ok("로그인 로케일 스위처", p.locator("[data-login-locale]").count() == 1)
    ok("로그인 테넌트 RO 필드", p.locator("#tenant").input_value() == "NOVA Solution")
    st_text = p.locator("[data-login-status]").inner_text()
    ok("로그인 버전 상태바", "EDIM v" in st_text and "." in st_text)
    p.select_option("[data-login-locale]", "en")
    p.wait_for_timeout(1200)
    ok("로케일 EN 전환 (SSR 라벨)", p.locator("label[for=tenant]").inner_text().strip() == "Tenant")
    p.select_option("[data-login-locale]", "ko")
    p.wait_for_timeout(1200)

    p.fill("input[name=userId]", "edim")
    p.fill("input[name=password]", "edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_url("**/erp/**", timeout=15000)

    # ── 2. MDI 파라미터 다중 인스턴스 — Work Process 를 도면 2건으로 ──
    for c in codes:
        p.goto(f"{BASE}/plm/work-process?code={c}", wait_until="networkidle")
        p.wait_for_timeout(600)
    strip = p.locator("[data-mdi-strip] .t")
    labels = [strip.nth(i).inner_text() for i in range(strip.count())]
    wp = [x for x in labels if "S-4-1-2" in x]
    ok(f"인스턴스 탭 2개 ({codes[0]}·{codes[1]})",
       len(wp) == 2 and codes[0] in " ".join(wp) and codes[1] in " ".join(wp))

    p.locator("[data-mdi-strip] .t", has_text=codes[0]).first.click()
    p.wait_for_timeout(800)
    # 도면번호 공백 등 → URL 은 %20 인코딩 — unquote 후 비교
    ok("탭 클릭 시 인스턴스 쿼리 복원", f"code={codes[0]}" in unquote(p.url))

    on = p.locator("[data-mdi-strip] .t.on")
    ok("활성 탭 = 해당 인스턴스", on.count() == 1 and codes[0] in on.inner_text())

    p.keyboard.press("Alt+w")
    p.wait_for_timeout(800)
    labels2 = [strip.nth(i).inner_text() for i in range(strip.count())]
    wp2 = [x for x in labels2 if "S-4-1-2" in x]
    ok("Alt+W 인스턴스 단위 닫기", len(wp2) == 1 and codes[1] in " ".join(wp2))

    # 선택 상태 파라미터(sel=)는 탭을 늘리지 않음
    p.goto(f"{BASE}/erp/companies", wait_until="networkidle")
    p.wait_for_timeout(500)
    p.goto(f"{BASE}/erp/companies?sel=1", wait_until="networkidle")
    p.wait_for_timeout(500)
    labels3 = [strip.nth(i).inner_text() for i in range(strip.count())]
    ok("선택 파라미터는 단일 탭 유지", sum(1 for x in labels3 if "M-14-2" in x) == 1)
    b.close()

print(f"\nlive_shell_mdi_login: {n}/{n} PASS")
