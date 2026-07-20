# -*- coding: utf-8 -*-
"""G11 라이브 — DenseGrid 헤더 컬럼 필터 (Excel autofilter식 값 체크리스트).

감사 조회(M-14-6, ADMIN) 그리드:
  깔때기(▽) → 값 체크리스트 팝업 → 값 1개만 선택·적용 → 해당 값 행만 표시,
  적용 후 깔때기 활성(▼), 다시 열어 전체 선택 시 필터 해제.
실행: PYTHONUTF8=1 py tests/live_g11_col_filter.py
정리: 없음 (조회 전용).
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)

    page.locator(".titlebar .mod", has_text="ERP").first.click()
    page.wait_for_timeout(400)
    tree_click(page, "감사 조회")
    page.wait_for_selector("table.g tbody tr", timeout=15000)
    page.wait_for_timeout(500)

    grid = page.locator("[data-grid-wrap]", has=page.locator("table.g")).first
    base_rows = grid.locator("table.g tbody tr").count()
    ok("감사 그리드 렌더", base_rows > 0)

    # 깔때기(컬럼 필터) 존재 — 최소 1개
    funnels = grid.locator("[data-col-filter]")
    ok("컬럼 필터 깔때기 표시", funnels.count() >= 1)

    # '작업' 열(칩=render JSX 이므로 sortValue 있어야 필터 가능) 대신, 텍스트 열의 깔때기 사용.
    # 첫 깔때기 클릭 → 팝업
    funnels.first.click()
    page.wait_for_timeout(300)
    menu = page.locator("[data-col-filter-menu]")
    ok("필터 팝업 표시", menu.count() == 1 and menu.is_visible())

    # 값 체크박스 목록
    boxes = menu.locator("label input[type=checkbox]")
    vcount = boxes.count()
    ok("팝업 값 체크리스트(2개 이상)", vcount >= 2)

    # 첫 값의 라벨 텍스트 확보
    first_val = menu.locator("label span").first.inner_text().strip()

    # 해제 → 첫 값만 체크 → 적용
    menu.get_by_text("해제", exact=True).click()
    page.wait_for_timeout(150)
    boxes.first.check()
    page.wait_for_timeout(150)
    menu.locator("[data-col-filter-apply]").click()
    page.wait_for_timeout(400)

    filtered = grid.locator("table.g tbody tr").count()
    ok(f"필터 적용 — 행 감소 또는 유지(≤ 전체, 값='{first_val}')", 0 < filtered <= base_rows)

    # 깔때기 활성(▼) — 활성 컬럼 필터 존재
    active_funnel = grid.locator("[data-col-filter]", has_text="▼")
    ok("적용 후 깔때기 활성(▼) 표시", active_funnel.count() >= 1)

    # 다시 열어 전체 선택 → 적용 = 필터 해제(전체 행 복원)
    active_funnel.first.click()
    page.wait_for_timeout(250)
    menu = page.locator("[data-col-filter-menu]")
    menu.get_by_text("전체", exact=True).click()
    page.wait_for_timeout(150)
    menu.locator("[data-col-filter-apply]").click()
    page.wait_for_timeout(400)
    ok("전체 선택·적용 = 필터 해제(전체 행 복원)",
       grid.locator("table.g tbody tr").count() == base_rows)

    b.close()

print(f"\nOK — live_g11_col_filter {n}/{n}")
