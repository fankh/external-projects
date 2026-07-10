# -*- coding: utf-8 -*-
"""F3 라이브 — 권한 기반 UI 게이팅 (SYS-005): 쓰기 버튼 disabled·관리 화면 가드·승인함 읽기 전용.

GENERAL(kim01): 사용자·권한 메뉴 미표시 → ⌘K 진입 시 403 안내 · 등록 버튼 disabled ·
                F2 권한 사유 · 승인함 결정 disabled + 내 요청.
SETUP(f3.setup 임시): M-14-6 진입 가능(읽기) · ADMIN 전용 버튼만 disabled · 단가 등록 enabled.
ADMIN(edim): 게이트가 과차단하지 않음 (등록 버튼 enabled).
실행: PYTHONUTF8=1 py tests/live_f3_rbac_ui.py
정리: f3.* 계정 ssh psql 제거 (로그인 감사행 FK — live_f2 와 동일 경로).
"""
import subprocess

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql: str) -> str:
    r = subprocess.run(
        ["ssh", "edim-server",
         f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
        capture_output=True, text=True, timeout=30)
    return (r.stdout or "").strip()


def purge_f3_users() -> None:
    psql("DELETE FROM sys_history WHERE actor_id IN "
         "(SELECT user_id FROM sys_user WHERE login_id LIKE 'f3.%')")
    psql("DELETE FROM sys_user_role WHERE user_id IN "
         "(SELECT user_id FROM sys_user WHERE login_id LIKE 'f3.%')")
    psql("DELETE FROM sys_user WHERE login_id LIKE 'f3.%'")


def login(page, user, pw):
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill(user)
        page.get_by_label("비밀번호").fill(pw)
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.wait_for_timeout(1200)   # permissions fetch


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(tok, method, path, data=None):
        return req.fetch(API + path, method=method,
                         headers={"Authorization": f"Bearer {tok}",
                                  **({"Content-Type": "application/json"} if data is not None else {})},
                         data=None if data is None else data)

    purge_f3_users()
    tok = req.post(f"{API}/auth/login",
                   data={"userId": "edim", "password": "edim"}).json()["token"]
    tok_gen = req.post(f"{API}/auth/login",
                       data={"userId": "kim01", "password": "edim"}).json()["token"]

    # 0. API 전제 — GENERAL 유효 권한에 결정/쓰기 없음 + inbox 에 requesterLogin
    perms = call(tok_gen, "GET", "/auth/permissions").json()
    ok("GENERAL 매트릭스 — com-approval WRITE 없음", perms.get("com-approval") != "WRITE")
    inbox = call(tok, "GET", "/approvals/inbox").json()
    ok("inbox requesterLogin 필드", all("requesterLogin" in r for r in inbox))

    b = pw.chromium.launch()

    # ── GENERAL (kim01) ──
    ctx = b.new_context(viewport={"width": 1600, "height": 900})
    page = ctx.new_page()
    login(page, "kim01", "edim")

    ok("GENERAL — '사용자·권한' 메뉴 미표시 (SYS-005)",
       page.locator(".tn", has_text="사용자·권한 (M-14-6)").count() == 0)

    # ⌘K 로 화면 직접 진입 시 403 안내 (프론트 숨김 ≠ 보안 — 가드가 받친다)
    page.keyboard.press("Control+k")
    page.locator(".toolbar input.in").fill("사용자")
    page.wait_for_timeout(900)
    page.locator("[data-search-results] div", has_text="사용자·권한").first.click()
    page.wait_for_selector("[data-access-denied]", timeout=4000)
    ok("GENERAL — 직접 진입 시 403 안내 화면", True)

    page.locator(".tn", has_text="단가 관리 (M-12-5)").first.click()
    page.wait_for_timeout(1000)
    reg = page.get_by_role("button", name="＋ 단가 등록")
    ok("GENERAL — 단가 등록 disabled + 사유 툴팁",
       reg.is_disabled() and "SETUP" in (reg.get_attribute("title") or ""))

    page.locator(".titlebar .mod", has_text="PLM").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="부품 대장 (M-4-7)").first.click()
    page.wait_for_timeout(1000)
    ok("GENERAL — 부품 등록 disabled",
       page.get_by_role("button", name="＋ 부품 등록 F2").is_disabled())
    page.keyboard.press("F2")
    page.wait_for_timeout(500)
    ok("GENERAL — F2 는 다이얼로그 대신 사유",
       page.locator("[data-part-reg]").count() == 0
       and "권한 부족" in page.locator(".statusbar").inner_text())

    page.locator(".titlebar .mod", has_text="공통").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="승인함 (M-15-2)").first.click()
    page.wait_for_timeout(1200)
    page.locator("table.g:visible tbody tr").first.click()
    page.wait_for_timeout(400)
    ok("GENERAL — 승인/반려 disabled + 읽기 전용 칩",
       page.get_by_role("button", name="승인").is_disabled()
       and page.get_by_role("button", name="반려").is_disabled()
       and page.locator("text=읽기 전용").count() >= 1)
    page.locator("[data-view-mine]").click()
    page.wait_for_timeout(400)
    ok("GENERAL — 내 요청 뷰 (요청 권한 없음 = 0건 안내)",
       page.locator("text=내가 요청한 대기 건 없음").count() == 1)
    ctx.close()

    # ── SETUP (임시 f3.setup) ──
    r = call(tok, "POST", "/users",
             {"login": "f3.setup", "name": "F3 셋업", "department": "기술",
              "level": "SETUP", "initialPassword": "f3pass"})
    ok("SETUP 임시 계정 등록", r.status == 201)
    ctx2 = b.new_context(viewport={"width": 1600, "height": 900})
    page = ctx2.new_page()
    login(page, "f3.setup", "f3pass")
    ok("SETUP — 사용자·권한 메뉴 표시", page.locator(".tn", has_text="사용자·권한 (M-14-6)").count() == 1)
    page.locator(".tn", has_text="사용자·권한 (M-14-6)").first.click()
    page.wait_for_timeout(1200)
    ok("SETUP — 목록 로드 (읽기 허용)", page.locator("table.g:visible tbody tr").count() >= 5)
    addu = page.get_by_role("button", name="＋ 사용자 등록")
    ok("SETUP — 사용자 등록 disabled (ADMIN 전용)",
       addu.is_disabled() and "ADMIN" in (addu.get_attribute("title") or ""))
    page.locator(".tn", has_text="단가 관리 (M-12-5)").first.click()
    page.wait_for_timeout(1000)
    ok("SETUP — 단가 등록 enabled (과차단 없음)",
       page.get_by_role("button", name="＋ 단가 등록").is_enabled())
    ctx2.close()

    # ── ADMIN (edim) — 과차단 회귀 ──
    ctx3 = b.new_context(viewport={"width": 1600, "height": 900})
    page = ctx3.new_page()
    login(page, "edim", "edim")
    page.locator(".tn", has_text="사용자·권한 (M-14-6)").first.click()
    page.wait_for_timeout(1200)
    ok("ADMIN — 사용자 등록 enabled",
       page.get_by_role("button", name="＋ 사용자 등록").is_enabled())
    page.locator(".titlebar .mod", has_text="공통").first.click()
    page.wait_for_timeout(600)
    page.locator(".tn", has_text="승인함 (M-15-2)").first.click()
    page.wait_for_timeout(1200)
    if page.locator("table.g:visible tbody tr").count():
        page.locator("table.g:visible tbody tr").first.click()
        page.wait_for_timeout(400)
        ok("ADMIN — 승인 버튼 enabled", page.get_by_role("button", name="승인").is_enabled())
    else:
        ok("ADMIN — 대기 0건 (결정 버튼 검사 생략)", True)
    ctx3.close()
    b.close()

    # 정리
    purge_f3_users()
    ok("psql 정리 — f3.* 잔존 0",
       psql("SELECT count(*) FROM sys_user WHERE login_id LIKE 'f3.%'") == "0")

print(f"\nOK — live_f3_rbac_ui {n}/{n}")
