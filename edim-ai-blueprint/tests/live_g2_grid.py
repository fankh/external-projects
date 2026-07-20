# -*- coding: utf-8 -*-
"""G2 라이브 — DenseGrid 그리드 내 찾기(Ctrl+F) + 공용 다중행 선택.

UI(감사 조회 M-14-6A, ADMIN):
  찾기 — 🔍/Ctrl+F 로 찾기창 열기 → 부분일치 필터(보이는 행 감소·n/m 카운트)·Esc 복원.
  다중선택 — 헤더 체크박스=전체선택(.msel)·행 체크박스 토글·Shift 범위·'선택 CSV(N)' 버튼 활성.
실행: PYTHONUTF8=1 py tests/live_g2_grid.py
정리: 데이터 생성 없음 (조회/클라이언트 CSV 전용).
"""
import re
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
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)

    # 감사 조회 열기 (ERP)
    page.locator(".titlebar .mod", has_text="ERP").first.click()
    page.wait_for_timeout(400)
    tree_click(page, "감사 조회")
    page.wait_for_selector("table.g tbody tr", timeout=15000)   # 감사 500행 로드(콜드 스타트 여유)
    page.wait_for_timeout(400)

    wrap = page.locator("[data-grid-wrap]", has=page.locator("table.g")).first
    wrap.wait_for(timeout=8000)
    grid = wrap.locator("table.g").first
    ok("감사 조회 접근(ADMIN) — 그리드 렌더", grid.locator("tbody tr").count() > 0)
    base_rows = grid.locator("tbody tr").count()

    # ── 그리드 내 찾기 ──
    # 검색 대상은 원시값 컬럼(작업 열은 Chip=JSX 라 비검색). 다중선택 체크박스 열로 인덱스 +1.
    # 열: [0]체크박스 [1]일시 [2]작업(칩) [3]대상 [4]수행자 [5]사번 → 대상(target) 사용
    tds = grid.locator("tbody tr").first.locator("td")
    target0 = tds.nth(3).inner_text().strip() or tds.nth(4).inner_text().strip()
    term = target0[: max(3, len(target0) // 2)]

    # 🔍 아이콘으로 찾기창 열기
    wrap.locator("[title='찾기 (Ctrl+F)']").click()
    page.wait_for_timeout(200)
    find = wrap.locator("input[placeholder='찾기…']")
    ok("🔍 = 찾기창 표시", find.count() == 1 and find.is_visible())
    find.fill(term)
    page.wait_for_timeout(300)
    filtered = grid.locator("tbody tr").count()
    ok(f"찾기 '{term}' = 행 필터(부분일치)", 0 < filtered <= base_rows)
    # 남은 모든 행이 필터어를 포함
    all_have = all(term.lower() in r.lower()
                   for r in grid.locator("tbody tr").all_inner_texts())
    ok("필터 결과 전 행이 검색어 포함", all_have)
    # n/m 카운트 표기 (페이지네이션과 무관 — 라벨은 전체 필터/전체 기준)
    count_txt = wrap.inner_text()
    mm = re.search(r"(\d[\d,]*)\s*/\s*(\d[\d,]*)", count_txt)
    nn = int(mm.group(1).replace(',', '')) if mm else -1
    tot = int(mm.group(2).replace(',', '')) if mm else -1
    ok("n/m 카운트 표기(0<n≤m)", mm is not None and 0 < nn <= tot)

    # 없는 문자열 → 0행 (빈 상태 표준행 [data-grid-state]는 데이터 행이 아님)
    find.fill("ZZZ_없는검색어_QWX")
    page.wait_for_timeout(250)
    ok("무매치 = 0행", grid.locator("tbody tr:not([data-grid-state])").count() == 0)
    # Esc = 찾기 해제·전체 복원
    find.press("Escape")
    page.wait_for_timeout(250)
    ok("Esc = 찾기 해제·전체 행 복원",
       grid.locator("tbody tr:not([data-grid-state])").count() == base_rows)

    # Ctrl+F 경로(그리드 포커스 → 전역검색 대신 그리드 내 찾기)
    grid.locator("tbody tr").first.click()   # 그리드 포커스
    page.keyboard.press("Control+f")
    page.wait_for_timeout(200)
    ok("Ctrl+F(그리드 포커스) = 그리드 내 찾기 개시",
       wrap.locator("input[placeholder='찾기…']").is_visible())
    wrap.locator("input[placeholder='찾기…']").press("Escape")
    page.wait_for_timeout(150)

    # ── 공용 다중행 선택 ──
    csv_btn = page.get_by_role("button", name=re.compile(r"선택 CSV"))
    ok("초기 '선택 CSV' 버튼 비활성", csv_btn.is_disabled())

    head_cb = grid.locator("thead input[type=checkbox]").first
    head_cb.click()   # 전체 선택
    page.wait_for_timeout(200)
    # 페이지네이션: 렌더된 행은 페이지 단위(.msel), 전체 선택은 전 페이지(pager 총계) 대상
    pager = page.locator("[data-grid-pager]")
    pm = re.search(r"/\s*([\d,]+)\s*행", pager.inner_text()) if pager.count() else None
    total = int(pm.group(1).replace(",", "")) if pm else base_rows
    ok("헤더 체크박스 = 전체 선택(렌더 행 .msel)",
       grid.locator("tbody tr.msel").count() == grid.locator("tbody tr").count())
    ok(f"전체 선택 후 '선택 CSV(전체 {total})' 활성",
       (not csv_btn.is_disabled()) and re.search(rf"\({total}\)", csv_btn.inner_text()) is not None)

    head_cb.click()   # 전체 해제
    page.wait_for_timeout(200)
    ok("헤더 재클릭 = 전체 해제", grid.locator("tbody tr.msel").count() == 0
       and csv_btn.is_disabled())

    # 개별 + Shift 범위 (행 0 클릭 → 행 3 Shift-클릭 = 4행)
    cbs = grid.locator("tbody tr td input[type=checkbox]")
    if cbs.count() >= 4:
        cbs.nth(0).click()
        page.wait_for_timeout(120)
        cbs.nth(3).click(modifiers=["Shift"])
        page.wait_for_timeout(200)
        ok("Shift 범위 선택 = 4행", grid.locator("tbody tr.msel").count() == 4
           and re.search(r"\(4\)", csv_btn.inner_text()) is not None)
    else:
        ok("Shift 범위(행 부족 시 스킵)", True)

    b.close()

print(f"\nOK — live_g2_grid {n}/{n}")
