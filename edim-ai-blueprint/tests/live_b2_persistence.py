# -*- coding: utf-8 -*-
"""B2 라이브 E2E — 편집 영속화 (치수 F12 · Work Process MAKE/BUY · UI Designer layout).

각 화면에서 편집 → 저장 → 새로고침 → 값 유지 왕복 검증.
실행: PYTHONUTF8=1 py tests/live_b2_persistence.py
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


def login(pw, url: str):
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(url, wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    return b, p


def _preclean() -> None:
    """자가 치유 — 이전 크래시가 남긴 E=325 를 320 으로 원복 (반복 실행 안정성)."""
    import json as _json
    import urllib.request as _ur
    r = _ur.Request(f"{BASE}/api/v1/auth/login",
                    data=_json.dumps({"userId": "edim", "password": "edim"}).encode(),
                    headers={"Content-Type": "application/json"}, method="POST")
    tok = _json.loads(_ur.urlopen(r).read())["token"]
    body = _json.dumps({"drawing": "KDCR 3-13", "dims": [
        {"no": "E", "value": "320", "binding": "VARIANT", "kind": "DETAIL"}]}).encode()
    _ur.urlopen(_ur.Request(f"{BASE}/api/v1/drawings/dimensions", data=body,
                            headers={"Content-Type": "application/json",
                                     "Authorization": f"Bearer {tok}"}, method="PUT"))


_preclean()

with sync_playwright() as pw:
    b, p = login(pw, f"{BASE}/plm")
    sb = lambda: p.locator(".statusbar").inner_text()  # noqa: E731

    # 1. Design Editor — E 치수 변경 → F12 저장 → 서버 값 확인 → 원복
    tree_click(p, "Design Editor (S-4-1-1)")
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    # DB 치수 로드 완료 대기 (mock 값 선편집 → 로드 덮어쓰기 레이스 방지, s3 과 동일)
    p.locator("td span:visible", has_text="320.0000").first.wait_for(timeout=10000)
    p.locator("td span:visible", has_text="320.0000").first.dblclick()
    p.locator("td input:visible").fill("325")
    p.keyboard.press("Enter")
    p.get_by_role("button", name="임시저장 F12").click()
    p.locator("text=임시저장 ✓").wait_for(timeout=12000)
    ok("치수 임시저장 (dwg_dimension)", True)
    # Next 는 토큰이 httpOnly 쿠키 — urllib 로 직접 검증/원복
    import json as _json
    import urllib.request as _ur
    r0 = _ur.Request(f"{BASE}/api/v1/auth/login",
                     data=_json.dumps({"userId": "edim", "password": "edim"}).encode(),
                     headers={"Content-Type": "application/json"}, method="POST")
    _tok = _json.loads(_ur.urlopen(r0).read())["token"]
    _H = {"Authorization": f"Bearer {_tok}", "Content-Type": "application/json"}
    dims = _json.loads(_ur.urlopen(_ur.Request(
        f"{BASE}/api/v1/drawings/dimensions", headers=_H)).read())
    e_dim = next(d for d in dims if d["no"] == "E")
    ok("서버 반영 E=325", float(e_dim["value"]) == 325)
    _ur.urlopen(_ur.Request(f"{BASE}/api/v1/drawings/dimensions",
                            data=_json.dumps({"drawing": "KDCR 3-13",
                                              "dims": [{"no": "E", "value": "320"}]}).encode(),
                            headers=_H, method="PUT"))

    # 2. Work Process — MAKE/BUY 버튼 토글 → data-wp-save → 새로고침 후 유지 → 원복
    # Next 열: [0]자재 [1]공급처 [2]MAKE/BUY(버튼) …
    tree_click(p, "Work Process (S-4-1-2)")
    p.wait_for_timeout(1000)
    mb = lambda: p.locator("table.g:visible tbody tr").first.locator("td").nth(2)  # noqa: E731
    before = mb().inner_text().strip()
    mb().locator("button").click()
    p.wait_for_timeout(300)
    p.locator("[data-wp-save]").click()
    p.locator("text=저장 ✓").wait_for(timeout=12000)
    ok("Work Process 저장 (erp_work_process)", True)
    p.reload(wait_until="networkidle")
    p.wait_for_timeout(1500)
    after = mb().inner_text().strip()
    ok(f"새로고침 후 MAKE/BUY 유지 ({before}→{after})", after != before)
    # 원복
    mb().locator("button").click()
    p.wait_for_timeout(300)
    p.locator("[data-wp-save]").click()
    p.locator("text=저장 ✓").wait_for(timeout=12000)

    # 3. UI Designer — 위젯 추가 → 저장 → 새로고침 후 유지 (버전 증가)
    p.goto(f"{BASE}/toolbox", wait_until="networkidle")
    p.wait_for_timeout(400)
    tree_click(p, "UI Designer (S-2-1)")
    p.wait_for_timeout(1000)
    n_before = p.locator(".m2:visible").count()
    p.locator(".tn.l2:visible", has_text="Combo").first.click()
    p.wait_for_timeout(300)
    assert p.locator(".m2:visible").count() == n_before + 1, "widget not added"
    p.get_by_role("button", name="저장 F12").click()
    p.locator("text=레이아웃 저장 ✓").wait_for(timeout=12000)
    ok("레이아웃 저장 (tbx_ui_form)", True)
    p.reload(wait_until="networkidle")
    p.wait_for_timeout(1200)
    tree_click(p, "UI Designer (S-2-1)")
    p.wait_for_timeout(1000)
    n_after = p.locator(".m2:visible").count()
    ok(f"새로고침 후 위젯 유지 ({n_before}→{n_after})", n_after == n_before + 1)

    b.close()

print(f"\nB2 편집 영속화 라이브: {n}/6 pass")
