# -*- coding: utf-8 -*-
"""B1 라이브 E2E — 범용 승인 요청 실배선 (POST /approvals · PUT /macros/{name}).

Design Editor 승인 요청 → 승인함 수신 → 승인 결정 → 요청자 알림 왕복.
Macro Studio 저장 → tbx_macro DRAFT 영속 확인.
실행: PYTHONUTF8=1 py tests/live_b1_approval_flow.py
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
n_pass = 0


def ok(label: str, cond: bool) -> None:
    global n_pass
    assert cond, f"FAIL {label}"
    n_pass += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/plm", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    sb = lambda: p.locator(".statusbar").inner_text()  # noqa: E731

    # Next — 토큰은 httpOnly 쿠키: API 검증은 urllib
    import json as _json
    import urllib.request as _ur
    r0 = _ur.Request(f"{BASE}/api/v1/auth/login",
                     data=_json.dumps({"userId": "edim", "password": "edim"}).encode(),
                     headers={"Content-Type": "application/json"}, method="POST")
    _tok = _json.loads(_ur.urlopen(r0).read())["token"]
    _H = {"Authorization": f"Bearer {_tok}", "Content-Type": "application/json"}

    def _get(path):
        return _json.loads(_ur.urlopen(_ur.Request(f"{BASE}/api/v1{path}", headers=_H)).read())

    # 사전 정리 — 이전 런의 PENDING 도면 요청은 반려 (assetType 은 원시값 dwg_drawing 로 노출)
    for it in _get("/approvals/inbox"):
        if it.get("assetType") in ("도면", "dwg_drawing") and "KDCR 3-13" in (it.get("target") or ""):
            _ur.urlopen(_ur.Request(f"{BASE}/api/v1/approvals/{it['id']}/decide",
                                    data=_json.dumps({"approve": False, "comment": "B1 사전 정리"}).encode(),
                                    headers=_H, method="POST"))

    # 1. Design Editor 승인 요청 → 실등록
    tree_click(p, "Design Editor (S-4-1-1)")
    p.locator("svg[data-cad-svg]").first.wait_for(timeout=10000)
    p.get_by_role("button", name="승인 요청").click()
    p.locator("text=승인 요청 등록 ✓").wait_for(timeout=8000)
    ok("Design Editor 승인 요청 등록", True)

    # 2. 승인함에서 수신 확인 (dwg_drawing 요청)
    p.goto(f"{BASE}/common/approval", wait_until="networkidle")
    p.wait_for_timeout(1000)
    row = p.locator("table.g:visible tbody tr", has_text="KDCR 3-13 Rev.B")
    ok("승인함 수신 (sys_approval_request)", row.count() >= 1)

    # 3. 승인 결정 → 목록 제거 (Next — 체크박스 다중선택 + 승인)
    row.first.locator("input[type=checkbox]").check()
    p.wait_for_timeout(200)
    p.get_by_role("button", name="승인", exact=True).click()
    p.wait_for_timeout(1800)
    ok("승인 결정 → 인박스 제거",
       p.locator("table.g:visible tbody tr", has_text="KDCR 3-13 Rev.B").count() == 0)

    # 4. 요청자 알림 (decide → APPROVAL_RESULT)
    notif = _get("/notifications")
    ok("결정 알림 생성 (APPROVAL_RESULT)",
       any(n.get("type") == "APPROVAL_RESULT" and "승인" in (n.get("title") or "")
           for n in notif))

    # 5. Macro Studio 저장 → tbx_macro DRAFT 영속 (Next — 행 선택 후 저장 (F12))
    p.goto(f"{BASE}/toolbox/macros", wait_until="networkidle")
    p.wait_for_timeout(1200)
    p.locator("table.g:visible tbody tr", has_text="Shaft 길이 계산").first.click()
    p.wait_for_timeout(500)
    p.get_by_role("button", name="저장 (F12)").click()
    p.locator("text=저장").first.wait_for(timeout=12000)
    p.wait_for_timeout(800)
    macros = _get("/macros")
    shaft = next((m for m in macros if m["name"] == "Shaft 길이 계산"), None)
    ok("Macro 저장 (tbx_macro DRAFT)", shaft is not None)
    ok("tbx_macro status=DRAFT 반영", shaft["status"] == "DRAFT")

    b.close()

print(f"\nB1 승인 워크플로 라이브: {n_pass}/6 pass")
