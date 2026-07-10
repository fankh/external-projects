# -*- coding: utf-8 -*-
"""F6 라이브 — 통합 검색 확장: 부품·공급처·창고·매크로·프로젝트(+사용자 SETUP 게이트) + 딥링크.

실행: PYTHONUTF8=1 py tests/live_f6_search.py
정리: 데이터 생성 없음 (조회 전용 + UI 탭 오픈).
"""
from urllib.parse import quote

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(tok, path):
        return req.get(API + path, headers={"Authorization": f"Bearer {tok}"})

    tok = req.post(f"{API}/auth/login",
                   data={"userId": "edim", "password": "edim"}).json()["token"]
    tok_gen = req.post(f"{API}/auth/login",
                       data={"userId": "kim01", "password": "edim"}).json()["token"]

    # 1. 부품 — 실제 부품명 조각으로 검색 (시드 의존 없이 동적)
    parts = call(tok, "/parts").json()
    frag = parts[0]["name"][:3]
    r = call(tok, f"/search?q={quote(frag)}").json()
    ok(f"부품 그룹 검색 ('{frag}')", any(p["name"].startswith(frag) or frag in p["name"]
       for p in r.get("parts", [])))

    # 2. 공급처
    r = call(tok, f"/search?q={quote('대신')}").json()
    ok("공급처 그룹 — 대신금속", any("대신" in c["name"] for c in r.get("companies", [])))

    # 3. 창고 — 트리 첫 노드 코드로
    wh = call(tok, "/erp/warehouses").json()
    wcode = wh[0]["code"][:4]
    r = call(tok, f"/search?q={quote(wcode)}").json()
    ok(f"창고 그룹 검색 ('{wcode}')", len(r.get("warehouses", [])) >= 1)

    # 4. 매크로
    r = call(tok, f"/search?q={quote('Shaft')}").json()
    ok("Macro 그룹 — Shaft 길이 계산", any("Shaft" in m["name"] for m in r.get("macros", [])))

    # 5. 프로젝트
    r = call(tok, f"/search?q={quote('Micron')}").json()
    ok("프로젝트 그룹 — Micron #7", any(p["projectNo"] == "PS-61313-5"
       for p in r.get("projects", [])))

    # 6. 사용자 — SETUP+ 만 (ADMIN 검색됨 · GENERAL 빈 그룹)
    r = call(tok, f"/search?q={quote('kim')}").json()
    ok("ADMIN — 사용자 그룹 검색", any(u["login"] == "kim01" for u in r.get("users", [])))
    r = call(tok_gen, f"/search?q={quote('kim')}").json()
    ok("GENERAL — 사용자 그룹 미노출", r.get("users", []) == [])

    # ── UI — 드롭다운 그룹 + 딥링크 ──
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/common", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.wait_for_timeout(800)

    # 부품 검색 → 부품 상세 딥링크
    page.keyboard.press("Control+k")
    page.locator(".toolbar input.in").fill(frag)
    page.wait_for_selector("[data-search-results]", timeout=5000)
    dd = page.locator("[data-search-results]").inner_text()
    ok("드롭다운 — 부품 그룹 표시", "부품" in dd)
    page.locator("[data-search-results] div", has_text=parts[0]["name"]).last.click()
    page.wait_for_timeout(900)
    ok("부품 딥링크 — 부품 상세 탭", parts[0]["name"][:6] in page.locator(".mdi").inner_text())

    # 프로젝트 검색 → 컨텍스트 전환 + S-3-5
    page.keyboard.press("Control+k")
    page.locator(".toolbar input.in").fill("Micron")
    page.wait_for_selector("[data-search-results]", timeout=5000)
    dd = page.locator("[data-search-results]").inner_text()
    ok("드롭다운 — 프로젝트 그룹 표시", "프로젝트" in dd)
    page.locator("[data-search-results] div", has_text="PS-61313-5").last.click()
    page.wait_for_timeout(1200)
    ok("프로젝트 딥링크 — 타이틀바 컨텍스트 + S-3-5",
       "Micron #7" in page.locator(".titlebar").inner_text()
       and "S-3-5" in page.locator(".mdi").inner_text())

    # 공급처 검색 → M-14-2
    page.keyboard.press("Control+k")
    page.locator(".toolbar input.in").fill("대신")
    page.wait_for_selector("[data-search-results]", timeout=5000)
    page.locator("[data-search-results] div", has_text="대신금속").last.click()
    page.wait_for_timeout(900)
    ok("공급처 딥링크 — M-14-2 탭", "M-14-2" in page.locator(".mdi").inner_text())
    b.close()

print(f"\nOK — live_f6_search {n}/{n}")
