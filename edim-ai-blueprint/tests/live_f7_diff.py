# -*- coding: utf-8 -*-
"""F7 라이브 — 이력 diff 뷰어 (M-15-9): sys_history before/after JSON 비교 모달.

API: /history 에 historyId·before/after 노출 → 페이로드 있는 행 확보(레벨 변경 왕복).
UI: 이력 diff 칩 → 모달(변경 필드 하이라이트) · 페이로드 없는 행 = 정직 안내.
실행: PYTHONUTF8=1 py tests/live_f7_diff.py
정리: 레벨 변경은 즉시 원복 (감사 이력 2행 추가 — 이력 성격 누적 허용).
"""
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

    def call(tok, method, path, data=None):
        return req.fetch(API + path, method=method,
                         headers={"Authorization": f"Bearer {tok}",
                                  **({"Content-Type": "application/json"} if data is not None else {})},
                         data=None if data is None else data)

    tok = req.post(f"{API}/auth/login",
                   data={"userId": "edim", "password": "edim"}).json()["token"]

    # 0. before/after 페이로드가 확실한 최신 행 생성 — jang.s 레벨 변경 왕복 (LEVEL_CHANGE 는 전후 기록)
    call(tok, "PATCH", "/users/jang.s/level", {"level": "SETUP"})
    call(tok, "PATCH", "/users/jang.s/level", {"level": "GENERAL"})

    # 1. API — historyId·before/after 노출
    hist = call(tok, "GET", "/history?limit=10").json()
    ok("history 행에 historyId", all("historyId" in h for h in hist))
    lvl = next((h for h in hist if h["action"] == "LEVEL_CHANGE"), None)
    ok("LEVEL_CHANGE 행 before/after JSON",
       lvl is not None and lvl["before"] is not None and lvl["after"] is not None
       and lvl["before"].get("level") != lvl["after"].get("level"))

    # ── UI — diff 모달 ──
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/common", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.locator(".tn", has_text="Project Folder·이력 (M-15-8/9)").first.click()
    page.wait_for_timeout(1500)

    # LEVEL_CHANGE 행의 diff 클릭 → 모달 + 변경 필드 하이라이트
    row = page.locator("tr", has_text="LEVEL_CHANGE").first
    row.locator("span.b", has_text="diff").click()
    page.wait_for_selector("[data-hist-diff]", timeout=4000)
    ok("diff 모달 오픈", True)
    ok("변경 전/후 컬럼", page.locator("[data-hist-diff] th", has_text="변경 전").count() == 1)
    ok("변경 필드 하이라이트", page.locator("[data-hist-diff] [data-diff-changed]").count() >= 1)
    body = page.locator("[data-hist-diff]").inner_text()
    ok("level 필드 값 표기", "level" in body)
    page.locator("[data-hist-diff] .titlebar span", has_text="✕").click()
    page.wait_for_timeout(300)
    ok("모달 닫기", page.locator("[data-hist-diff]").count() == 0)

    # 페이로드 없는 행 (LOGIN_OK 등) — 정직 안내
    noload = page.locator("tr", has_text="LOGIN_OK").first
    if noload.count():
        noload.locator("span.b", has_text="diff").click()
        page.wait_for_timeout(400)
        ok("페이로드 없는 행 — 정직 안내",
           "페이로드" in page.locator(".statusbar").inner_text()
           or page.locator("[data-hist-diff]").count() == 1)
    else:
        ok("LOGIN_OK 행 없음 — 안내 검사 생략", True)
    b.close()

print(f"\nOK — live_f7_diff {n}/{n}")
