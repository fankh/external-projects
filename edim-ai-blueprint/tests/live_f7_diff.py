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
    # Next — 감사 조회(M-14-6A) 행 선택 → 필드별 diff 하이라이트 패널 (레거시 M-15-9 diff 모달 동등)
    page.locator(".titlebar .mod", has_text="ERP").first.click()
    page.wait_for_timeout(400)
    page.locator(".tn", has_text="감사 조회").first.click()
    page.wait_for_selector("table.g:visible tbody tr", timeout=15000)
    page.wait_for_timeout(500)

    # 그리드 내 찾기로 LEVEL_CHANGE 행만 필터 → 첫 행 클릭
    wrap = page.locator("[data-grid-wrap]").first
    wrap.locator("[title='찾기 (Ctrl+F)']").click()
    wrap.locator("input[placeholder='찾기…']").fill("LEVEL_CHANGE")
    page.wait_for_timeout(400)
    page.locator("table.g:visible tbody tr", has_text="LEVEL_CHANGE").first.click()
    page.wait_for_selector("[data-hist-diff]", timeout=4000)
    ok("diff 패널 오픈", True)
    ok("변경 전/후 컬럼", page.locator("[data-hist-diff] th", has_text="변경 전").count() == 1)
    ok("변경 필드 하이라이트", page.locator("[data-hist-diff] [data-diff-changed]").count() >= 1)
    body = page.locator("[data-hist-diff]").inner_text()
    ok("level 필드 값 표기", "level" in body)

    # 다른 행 선택 = 패널 전환 (LOGIN_OK — 페이로드 유무와 무관하게 이전 diff 잔존 금지)
    wrap.locator("input[placeholder='찾기…']").fill("LOGIN_OK")
    page.wait_for_timeout(400)
    noload = page.locator("table.g:visible tbody tr", has_text="LOGIN_OK").first
    if noload.count():
        noload.click()
        page.wait_for_timeout(400)
        panel = page.locator("[data-hist-diff]")
        # 페이로드 없으면 패널 미표시, 있으면 해당 행 페이로드로 갱신 — SETUP→GENERAL 하이라이트 잔존 금지
        stale = panel.count() and "SETUP" in panel.inner_text() and "GENERAL" in panel.inner_text()
        ok("행 전환 = 패널 갱신(이전 diff 잔존 없음)", not stale)
    else:
        ok("LOGIN_OK 행 없음 — 전환 검사 생략", True)
    b.close()

print(f"\nOK — live_f7_diff {n}/{n}")
