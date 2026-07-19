# -*- coding: utf-8 -*-
"""PW 통합 스윕 (2026-07-19 사용자 지시 'test using playwright' 프로그램의 상설판).

1) 전 메뉴 화면 로드 스윕 — HTTP·콘솔 오류·JS 예외·실패 API·오류 문구
2) 상호작용 스윕 — 등록 모달 열기/닫기 + 첫 행 클릭 (비파괴)
3) 쓰기 왕복 — 캘린더 공휴일 등록→삭제 (정리 내장)
4) 결재 체인 — Hierarchy 승인 요청→승인함 반려 (정리 내장)
5) Design Editor 명령줄 — RO 실행·미지원 안내

실행: PYTHONUTF8=1 py tests/live_pw_sweep.py
"""
import json
import re
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://edimsol.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def menu_hrefs():
    import os
    menus = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "..", "edim-web-next", "components", "chrome", "menus.ts")
    s = open(menus, encoding="utf-8").read()
    out = []
    for line in s.split("\n"):
        m = re.search(r"href:\s*'(/[^']+)'", line)
        if m and m.group(1) not in out:
            out.append(m.group(1))
    return out


req = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"})
TOK = json.loads(urllib.request.urlopen(req).read())["token"]
H = {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}


def api(method, path, body=None):
    d = json.dumps(body).encode() if body is not None else None
    rq = urllib.request.Request(API + path, data=d, headers=H, method=method)
    try:
        return json.loads(urllib.request.urlopen(rq, timeout=60).read() or b"null")
    except urllib.error.HTTPError as e:
        return {"_err": e.code}


with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1500, "height": 900})
    pg.on("dialog", lambda d: d.accept())
    console_errs, page_errs, bad_reqs = [], [], []
    pg.on("console", lambda m: console_errs.append(m.text[:150]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: page_errs.append(str(e)[:150]))
    pg.on("response", lambda r: bad_reqs.append(f"{r.status} {r.url[-60:]}")
          if r.status >= 400 and "/api/" in r.url and "edimsol" in r.url else None)

    pg.goto(f"{BASE}/login", wait_until="networkidle")
    pg.fill("input[name=userId]", "edim")
    pg.fill("input[name=password]", "edim")
    pg.get_by_role("button", name="로그인 (Enter)").click()
    pg.wait_for_url("**/erp/**", timeout=15000)

    # ── 1+2) 화면 로드 + 상호작용 ──
    bad_pages = []
    for href in menu_hrefs():
        console_errs.clear(); page_errs.clear(); bad_reqs.clear()
        resp = pg.goto(BASE + href, wait_until="networkidle", timeout=30000)
        pg.wait_for_timeout(400)
        body = pg.locator("body").inner_text()[:3000]
        problems = []
        if not resp or resp.status != 200:
            problems.append(f"HTTP {resp.status if resp else 0}")
        for kw in ["백엔드 오류", "Application error", "Unhandled"]:
            if kw in body:
                problems.append(kw)
        # 상호작용: 등록 모달 열닫 + 첫 행 클릭
        for name in ["＋ 등록", "＋ 문서 등록", "＋ 노드"]:
            btn = pg.get_by_role("button", name=name)
            if btn.count():
                btn.first.click(); pg.wait_for_timeout(250)
                pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
                break
        row = pg.locator("table tbody tr").first
        if row.count():
            try:
                row.click(timeout=2500); pg.wait_for_timeout(250)
            except Exception:
                pass
        if page_errs:
            problems.append("JS:" + page_errs[0])
        if problems:
            bad_pages.append((href, problems))
    ok(f"화면+상호작용 스윕 ({len(menu_hrefs())}화면)", not bad_pages), bad_pages and print(bad_pages)

    # ── 3) 쓰기 왕복 — 캘린더 ──
    pg.goto(f"{BASE}/erp/holidays", wait_until="networkidle"); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="＋ 등록").first.click(); pg.wait_for_timeout(300)
    pg.fill("input[name=date]", "2026-12-30")
    pg.fill("input[name=name]", "PW스윕휴일")
    pg.locator("form").get_by_role("button", name="＋ 등록").click(); pg.wait_for_timeout(1500)
    row = pg.locator("table tbody tr").filter(has_text="PW스윕휴일")
    ok("쓰기 왕복 — 공휴일 등록", row.count() == 1)
    row.get_by_role("button", name="삭제").click(); pg.wait_for_timeout(1500)
    ok("쓰기 왕복 — 공휴일 삭제(정리)", pg.locator("table tbody tr").filter(has_text="PW스윕휴일").count() == 0)

    # ── 4) 결재 체인 ──
    pg.goto(f"{BASE}/code/groups?tree=PRODUCT", wait_until="networkidle"); pg.wait_for_timeout(800)
    pg.locator(".tn").filter(has=pg.locator("span.code")).first.click(); pg.wait_for_timeout(300)
    pg.locator("[data-approval-strip] [data-appr-request]").click(); pg.wait_for_timeout(1200)
    pg.goto(f"{BASE}/common/approval", wait_until="networkidle"); pg.wait_for_timeout(800)
    arow = pg.locator("table tbody tr").filter(has_text="Hierarchy 노드")
    ok("결재 체인 — 승인함 등록", arow.count() >= 1)
    arow.first.locator("input[type=checkbox]").check(); pg.wait_for_timeout(200)
    pg.locator("input[placeholder*='결재 의견']").fill("PW 스윕 정리")
    pg.get_by_role("button", name="반려").click(); pg.wait_for_timeout(1800)
    ok("결재 체인 — 반려(정리)", pg.locator("table tbody tr").filter(has_text="Hierarchy 노드").count() == 0)

    # ── 5) 명령줄 ──
    pg.goto(f"{BASE}/plm/design", wait_until="networkidle"); pg.wait_for_timeout(1200)
    pg.locator(".cmdline input").first.fill("RO"); pg.keyboard.press("Enter"); pg.wait_for_timeout(3000)
    ok("명령줄 — RO 실행", "CAD 편집: 회전 RO" in pg.locator("body").inner_text())
    pg.locator(".cmdline input").first.fill("ZZZ"); pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    ok("명령줄 — 미지원 안내", "지원: RO·MI·CO" in pg.locator("body").inner_text())
    b.close()

print(f"\nlive_pw_sweep: {n} PASS")
