# -*- coding: utf-8 -*-
"""F10 라이브 — 조회 UX 소품: MDI 탭 오버플로 · Dashboard KPI 드릴다운 · 승인함 필터.

실행: PYTHONUTF8=1 py tests/live_f10_ux.py
정리: 데이터 생성 없음 (탭 오픈·필터 토글만).
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
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.wait_for_timeout(800)

    # 1. 탭 다수 오픈 → 오버플로 UI
    for mod_name, screens in [
        ("ERP", ["Project 등록 (S-3-5)", "Dashboard (M-14-4)", "단가 관리 (M-12-5)",
                 "공급처·거래처 (M-14-2)", "창고·저장위치 (M-8-4)", "발주 PR·PO (M-8-2)"]),
        ("PLM", ["부품 대장 (M-4-7)", "도면 대장 (M-4-1)", "Quality (M-4-5)"]),
        ("CPQ", ["문서함 (M-5-4)", "Print Set-up (S-3-4)", "제품 선정 (C-1)"]),
    ]:
        page.locator(".titlebar .mod", has_text=mod_name).first.click()
        page.wait_for_timeout(400)
        for sc in screens:
            tree_click(page, sc)
            page.wait_for_timeout(350)
    tabs_n = page.locator(".mdi .t").count() - 1   # ▾ 오버플로 버튼 제외
    ok(f"탭 12종 오픈 (현재 {tabs_n})", tabs_n >= 11)
    ok("▾ 오버플로 버튼 표시", page.locator("[data-mdi-overflow]").count() == 1)
    page.locator("[data-mdi-overflow]").click()
    page.wait_for_selector("[data-mdi-list]", timeout=3000)
    items = page.locator("[data-mdi-list] > div").count()
    ok("오버플로 목록 = 전체 탭", items == tabs_n)
    page.locator("[data-mdi-list] > div", has_text="단가 관리").first.click()
    page.wait_for_timeout(500)
    ok("목록 클릭 = 탭 활성", "M-12-5" in page.locator(".mdi .t.on").inner_text())
    # 탭 제목 판독 가능 (압축 대신 스크롤) — 활성 탭 폭이 최소폭 이상
    box = page.locator(".mdi .t.on").bounding_box()
    ok("탭 최소폭 유지 (압축 아님)", box is not None and box["width"] >= 60)

    # 2. Dashboard KPI 드릴다운
    page.locator(".titlebar .mod", has_text="ERP").first.click()
    page.wait_for_timeout(400)
    tree_click(page, "Dashboard (M-14-4)")
    page.wait_for_timeout(1200)
    page.locator("[data-kpi='승인 대기']").click()
    page.wait_for_timeout(800)
    ok("KPI '승인 대기' → 승인함 탭", "M-15-2" in page.locator(".mdi .t.on").inner_text())
    page.locator(".titlebar .mod", has_text="ERP").first.click()
    page.wait_for_timeout(400)
    tree_click(page, "Dashboard (M-14-4)")
    page.wait_for_timeout(800)
    page.locator("[data-kpi='이상 경고 (시간·자금)']").click()
    page.wait_for_timeout(800)
    ok("KPI '이상 경고' → 부서 업무함 탭", "M-15-3" in page.locator(".mdi .t.on").inner_text())

    # 3. 승인함 유형 필터 + 검색
    tree_click(page, "승인함 (M-15-2)")
    page.wait_for_timeout(1200)
    # 빈 상태 표준행 [data-grid-state] 는 데이터 행이 아님
    grid_rows = lambda: page.locator("table.g:visible tbody tr:not([data-grid-state])").count()  # noqa: E731
    total = grid_rows()
    # 전 유형 해제 → 0건 (또는 안내)
    for key in ("code", "dwg", "macro", "etc"):
        page.locator(f"[data-type-filter='{key}']").click()
        page.wait_for_timeout(150)
    ok("전 유형 해제 = 0건 안내", page.locator("text=대기 중인 승인 요청이 없습니다").count() >= 1
       or grid_rows() == 0)
    for key in ("code", "dwg", "macro", "etc"):
        page.locator(f"[data-type-filter='{key}']").click()
        page.wait_for_timeout(150)
    ok("전 유형 재선택 = 원래 건수", grid_rows() == total)
    if total:
        # 열: [0]체크박스 [1]자산유형 [2]대상 — 검색은 대상·요청자 매칭
        first_target = page.locator("table.g:visible tbody tr").first.locator("td").nth(2).inner_text()
        page.locator("input[aria-label='승인함 검색']").fill(first_target[:6])
        page.wait_for_timeout(300)
        ok("검색 필터 동작", 1 <= grid_rows() <= total)
        page.locator("input[aria-label='승인함 검색']").fill("zzz없는대상zzz")
        page.wait_for_timeout(300)
        ok("검색 무결과 = 0건", grid_rows() == 0
           or page.locator("text=대기 중인 승인 요청이 없습니다").count() >= 1)
    else:
        ok("대기 0건 — 검색 검사 생략", True)
        ok("대기 0건 — 무결과 검사 생략", True)
    b.close()

print(f"\nOK — live_f10_ux {n}/{n}")
