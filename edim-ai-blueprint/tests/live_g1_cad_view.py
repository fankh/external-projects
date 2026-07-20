# -*- coding: utf-8 -*-
"""G1 라이브 — CAD 뷰어 인터랙션: 실시간 드로잉 좌표 표시 + 그리드 오버레이 토글.

UI(제품 선정 C-1 → CAD 모드, CadSvg):
  좌표 — 캔버스 위 마우스 이동 시 X/Y 도면 단위 실시간 표기(data-cad-coord), 이탈 시 사라짐.
  그리드 — ▦ 토글 → 격자선(data-cad-grid) 표시·재클릭 해제, 좌표 HUD 에 grid step 병기.
실행: PYTHONUTF8=1 py tests/live_g1_cad_view.py
정리: 데이터 생성 없음 (뷰어 전용).
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/cpq", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)

    page.locator(".titlebar .mod", has_text="CPQ").first.click()
    page.wait_for_timeout(400)
    tree_click(page, "제품 선정")
    page.wait_for_timeout(1500)

    # CAD 모드 전환 → CadSvg 렌더 대기
    page.get_by_role("button", name="CAD").first.click()
    page.wait_for_selector("[data-cad-wrap] svg", timeout=15000)
    page.wait_for_selector("[data-cad-wrap] svg g line, [data-cad-wrap] svg g polyline, [data-cad-wrap] svg g circle", timeout=15000)
    wrap = page.locator("[data-cad-wrap]").first
    svg = wrap.locator("svg").first
    ok("C-1 CAD 모드 — CadSvg 도면 렌더", svg.count() == 1)

    box = svg.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    # ── 실시간 좌표 ──
    ok("초기 좌표 HUD 없음(마우스 밖)", wrap.locator("[data-cad-coord]").count() == 0)
    page.mouse.move(cx, cy)
    page.wait_for_timeout(150)
    coord = wrap.locator("[data-cad-coord]")
    ok("마우스 이동 = 좌표 HUD 표시", coord.count() == 1 and coord.is_visible())
    t1 = coord.inner_text()
    ok("좌표 HUD = X/Y 표기", ("X" in t1 and "Y" in t1))
    page.mouse.move(cx + 90, cy + 60)
    page.wait_for_timeout(150)
    t2 = wrap.locator("[data-cad-coord]").inner_text()
    ok("좌표 이동 시 값 갱신", t2 != t1)

    # ── 그리드 오버레이 ──
    ok("초기 그리드 없음", wrap.locator("[data-cad-grid]").count() == 0)
    wrap.locator("[data-cad-grid-toggle]").click()
    page.wait_for_timeout(200)
    ok("▦ = 그리드 오버레이 표시(격자선)",
       wrap.locator("[data-cad-grid] line").count() > 4)
    page.mouse.move(cx + 20, cy + 20)
    page.wait_for_timeout(120)
    ok("그리드 ON 시 좌표 HUD 에 grid step 병기",
       "grid" in wrap.locator("[data-cad-coord]").inner_text())
    wrap.locator("[data-cad-grid-toggle]").click()
    page.wait_for_timeout(200)
    ok("▦ 재클릭 = 그리드 해제", wrap.locator("[data-cad-grid]").count() == 0)

    # 측정/줌 기존 기능 무해 확인
    wrap.locator("[data-cad-measure-toggle]").click()
    page.wait_for_timeout(150)
    ok("측정 토글 공존(회귀 없음)", wrap.locator("[data-cad-measure-toggle]").count() == 1)

    b.close()

print(f"\nOK — live_g1_cad_view {n}/{n}")
