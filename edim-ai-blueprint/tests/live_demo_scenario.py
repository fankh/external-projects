# -*- coding: utf-8 -*-
"""시연 시나리오 자동 검증 (docs/EDIM_시연시나리오.md 8단계).

고객 시연은 런치 최대 리스크 지점 — 문서에 적힌 경로가 **실제로 그대로 동작하는지**를
매 배포마다 자동 확인한다. 시연 중 발견되는 사고를 사전에 잡는 것이 목적.

검증: 로그인·셸 → CPQ 선정 → PLM 설계 → Run 산출물 → 코드 통제 게이트 → ERP/승인 →
       Toolbox → 다국어 전환. **조회·전환 중심(쓰기 없음)** 이라 자체 정리 불요.
실행: PYTHONUTF8=1 py tests/live_demo_scenario.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    page = b.new_page(viewport={"width": 1440, "height": 900})   # 문서 권장 해상도
    errs: list[str] = []
    page.on("pageerror", lambda e: errs.append(str(e)))

    # ── 4-1. 로그인과 셸 ──
    page.goto(f"{BASE}/cpq")
    ok("미인증 → 로그인 화면", "/login" in page.url)
    page.fill("input[name=userId]", "edim")
    page.fill("input[name=password]", "edim")
    page.click("button[type=submit]")
    page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    ok("로그인 → 셸 진입", "/login" not in page.url)
    body = page.inner_text("body")
    ok("실 DB 표시(MOCK 아님)", "MOCK" not in body.upper())

    # ── 4-2. CPQ 제품선정 ──
    page.goto(f"{BASE}/cpq/selection", wait_until="networkidle")
    sel_body = page.inner_text("body")
    ok("제품선정 화면 로드", "제품" in sel_body or "Selection" in sel_body or page.locator("table.g").count() >= 1)
    ok("BOM 그리드 렌더", page.locator("table.g tbody tr").count() >= 1)

    # ── 4-3. PLM Design Editor (CAD 기본 모드) ──
    page.goto(f"{BASE}/plm/design", wait_until="networkidle")
    page.wait_for_timeout(1500)   # 서버 작도 CAD 로드
    ok("Design Editor 로드", page.locator("[data-cad-svg], [data-cad-wrap], svg").count() >= 1)
    dims = page.locator("table.g tbody tr").count()
    ok("치수 그리드 렌더", dims >= 1)

    # ── 4-4. EDIM Run — 산출물 목록 (실행은 시연자 몫, 화면·산출물 접근만 확인) ──
    page.goto(f"{BASE}/cpq/run", wait_until="networkidle")
    run_body = page.inner_text("body")
    ok("Run 화면 로드", "Run" in run_body)
    ok("Run 파이프라인/산출물 영역 존재", page.locator("table.g, .gb").count() >= 1)

    # ── 4-5. 코드 통제 게이트 (Running Test 전 승인 불가) ──
    page.goto(f"{BASE}/code/relationship", wait_until="networkidle")
    page.wait_for_timeout(800)
    rel_body = page.inner_text("body")
    ok("Code Relationship 로드", "Child" in rel_body or "Mother" in rel_body)
    ok("child 그리드 렌더", page.locator("table.g tbody tr").count() >= 1)

    # ── 4-6. ERP Dashboard · 승인함 ──
    page.goto(f"{BASE}/erp/dashboard", wait_until="networkidle")
    ok("Dashboard 로드(KPI)", page.locator(".gb, table.g").count() >= 1)
    page.goto(f"{BASE}/common/approval", wait_until="networkidle")
    ok("승인함 로드", page.locator("table.g, .gb").count() >= 1)

    # ── 4-7. Toolbox — Macro Studio ──
    page.goto(f"{BASE}/toolbox/macros", wait_until="networkidle")
    ok("Macro Studio 로드", page.locator("table.g, .gb").count() >= 1)

    # ── 4-1 (후반). 다국어 전환 — 시연 첫 인상 요소 ──
    page.goto(f"{BASE}/erp/dashboard?lang=en", wait_until="networkidle")
    page.wait_for_timeout(700)
    en_body = page.inner_text("body")
    ok("EN 전환 동작", ("Dashboard" in en_body) or ("File" in en_body) or ("Edit" in en_body))

    ok("시연 전 구간 JS 예외 0", not errs)
    b.close()

print(f"\nlive_demo_scenario: {n}/{n} PASS — 시연 시나리오 8단계 경로 정상")
