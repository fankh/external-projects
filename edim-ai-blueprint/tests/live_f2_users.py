# -*- coding: utf-8 -*-
"""F2 라이브 — 사용자 등록·프로필 수정·삭제 (M-14-6, SYS-005).

API: 등록(USER_CREATE 감사) → 409/422/403 → 신규 계정 실로그인 → PATCH 프로필 →
     삭제 보호(사용 이력 409 · 본인 422) → 미사용 계정 하드 삭제.
UI: ＋ 사용자 등록 다이얼로그 → 목록 반영 → 정보 수정 → 검색 필터.
실행: PYTHONUTF8=1 py tests/live_f2_users.py
정리: 스위트 자체 수행 — 로그인 이력이 남는 f2.probe 는 ssh psql 로 감사행+계정 제거
      (규칙 '스위트 내 원복 또는 psql'), 나머지는 API DELETE.
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
    """서버 psql (정리 전용) — ssh edim-server 경유."""
    r = subprocess.run(
        ["ssh", "edim-server",
         f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
        capture_output=True, text=True, timeout=30)
    return (r.stdout or "").strip()


def purge_f2_users() -> None:
    # f2.* 계정의 FK 참조(감사행·알림·역할) 제거 후 계정 제거 — 멱등
    psql("DELETE FROM sys_history WHERE actor_id IN "
         "(SELECT user_id FROM sys_user WHERE login_id LIKE 'f2.%')")
    psql("DELETE FROM sys_notification WHERE user_id IN "
         "(SELECT user_id FROM sys_user WHERE login_id LIKE 'f2.%')")
    psql("DELETE FROM sys_user_role WHERE user_id IN "
         "(SELECT user_id FROM sys_user WHERE login_id LIKE 'f2.%')")
    psql("DELETE FROM sys_user WHERE login_id LIKE 'f2.%'")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(tok, method, path, data=None):
        return req.fetch(API + path, method=method,
                         headers={"Authorization": f"Bearer {tok}",
                                  **({"Content-Type": "application/json"} if data is not None else {})},
                         data=None if data is None else data)

    purge_f2_users()   # 이전 실패 런 잔존 정리

    tok = req.post(f"{API}/auth/login",
                   data={"userId": "edim", "password": "edim"}).json()["token"]
    tok_gen = req.post(f"{API}/auth/login",
                       data={"userId": "kim01", "password": "edim"}).json()["token"]

    # 1. 목록 — email 필드 포함
    rows = call(tok, "GET", "/users").json()
    ok("사용자 목록 >=5 (시드 edim·kim01·park.f·lee.t·jang.s)", len(rows) >= 5)
    ok("email 필드 노출", all("email" in r for r in rows))

    # 2. 권한 — GENERAL 등록/수정/삭제 403
    ok("GENERAL 등록 -> 403", call(tok_gen, "POST", "/users",
       {"login": "f2.x", "name": "x", "initialPassword": "xxxx"}).status == 403)
    ok("GENERAL 수정 -> 403", call(tok_gen, "PATCH", "/users/kim01",
       {"name": "x"}).status == 403)
    ok("GENERAL 삭제 -> 403", call(tok_gen, "DELETE", "/users/kim01").status == 403)

    # 3. 등록 + 검증 게이트
    r = call(tok, "POST", "/users",
             {"login": "f2.probe", "name": "F2 검증", "department": "기술",
              "email": "f2@probe.test", "level": "SETUP", "initialPassword": "f2pass"})
    ok("등록 201", r.status == 201)
    ok("응답 필드", r.json()["login"] == "f2.probe" and r.json()["level"] == "SETUP")
    ok("중복 login -> 409", call(tok, "POST", "/users",
       {"login": "f2.probe", "name": "x", "initialPassword": "xxxx"}).status == 409)
    ok("login 형식 위반 -> 422", call(tok, "POST", "/users",
       {"login": "F2!bad", "name": "x", "initialPassword": "xxxx"}).status == 422)
    ok("PLATFORM 레벨 -> 422", call(tok, "POST", "/users",
       {"login": "f2.plat", "name": "x", "level": "PLATFORM", "initialPassword": "xxxx"}).status == 422)
    ok("짧은 비밀번호 -> 422", call(tok, "POST", "/users",
       {"login": "f2.pw", "name": "x", "initialPassword": "abc"}).status == 422)

    # 4. 신규 계정 실로그인 (비밀번호 해시 검증)
    r = req.post(f"{API}/auth/login", data={"userId": "f2.probe", "password": "f2pass"})
    ok("신규 계정 로그인 성공", r.ok and r.json()["user"]["userLevel"] == "SETUP")
    ok("오답 로그인 거부", not req.post(
        f"{API}/auth/login", data={"userId": "f2.probe", "password": "wrong"}).ok)

    # 5. 프로필 수정
    ok("PATCH 프로필 200", call(tok, "PATCH", "/users/f2.probe",
       {"name": "F2 수정", "department": "영업", "email": "f2@edited.test"}).ok)
    got = next((x for x in call(tok, "GET", "/users").json() if x["login"] == "f2.probe"), None)
    ok("수정 반영 (이름·부서·이메일)", got is not None and got["name"] == "F2 수정"
       and got["dept"] == "영업" and got["email"] == "f2@edited.test")
    ok("빈 PATCH -> 422", call(tok, "PATCH", "/users/f2.probe", {}).status == 422)
    ok("빈 이름 -> 422", call(tok, "PATCH", "/users/f2.probe", {"name": " "}).status == 422)
    ok("없는 사용자 -> 404", call(tok, "PATCH", "/users/zz.none", {"name": "x"}).status == 404)

    # 6. 삭제 보호 — 사용 이력(로그인 감사) 409 · 본인 422 · 미사용 계정은 삭제 가능
    ok("로그인 이력 계정 삭제 -> 409", call(tok, "DELETE", "/users/f2.probe").status == 409)
    ok("본인 삭제 -> 422", call(tok, "DELETE", "/users/edim").status == 422)
    r = call(tok, "POST", "/users",
             {"login": "f2.temp", "name": "임시", "initialPassword": "tmp1234"})
    ok("미사용 계정 등록", r.status == 201)
    ok("미사용 계정 하드 삭제 200", call(tok, "DELETE", "/users/f2.temp").status == 200)
    ok("삭제 후 목록 부재", all(
        x["login"] != "f2.temp" for x in call(tok, "GET", "/users").json()))

    # 7. 감사 행 — USER_CREATE/UPDATE/DELETE
    hist = " ".join(h["action"] for h in call(tok, "GET", "/history?limit=40").json())
    ok("감사 USER_CREATE/UPDATE/DELETE", all(
        a in hist for a in ("USER_CREATE", "USER_UPDATE", "USER_DELETE")))

    # ── UI — 등록 다이얼로그 · 정보 수정 · 검색 필터 ──
    b = pw.chromium.launch()
    page = b.new_context(viewport={"width": 1600, "height": 900}).new_page()
    page.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    page.wait_for_selector(".login-dlg, .app .titlebar", timeout=15000)
    if page.locator(".login-dlg").count():
        page.get_by_label("사번").fill("edim")
        page.get_by_label("비밀번호").fill("edim")
        page.get_by_role("button", name="로그인 (Enter)").click()
    page.wait_for_selector(".app .titlebar", timeout=15000)
    page.locator(".tn", has_text="사용자·권한 (M-14-6)").first.click()
    # 부하 중 하이드레이션 전 클릭 무시 대비 — 버튼 출현 대기, 미출현 시 1회 재클릭 (캡스톤 #5 플레이크)
    try:
        page.get_by_role("button", name="＋ 사용자 등록").wait_for(timeout=8000)
    except Exception:  # noqa: BLE001
        page.locator(".tn", has_text="사용자·권한 (M-14-6)").first.click()
        page.get_by_role("button", name="＋ 사용자 등록").wait_for(timeout=15000)

    # Next — RegisterModal(data-modal) name 속성 폼
    page.get_by_role("button", name="＋ 사용자 등록").click()
    page.wait_for_selector("[data-modal]", timeout=3000)
    dlg = page.locator("[data-modal]")
    dlg.locator("input[name=login]").fill("f2.ui")
    dlg.locator("input[name=name]").fill("F2 UI 사용자")
    dlg.locator("input[name=initialPassword]").fill("uipass")
    dlg.locator("button[type=submit]").click()
    page.wait_for_timeout(1500)
    ok("UI 등록 ✓ (API 반영)", any(
        x["login"] == "f2.ui" for x in call(tok, "GET", "/users").json()))
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)
    ok("UI 목록 반영", page.locator("table.g:visible tbody tr", has_text="f2.ui").count() >= 1)

    # 정보 수정 (F2 이식 다이얼로그) — f2.ui 행 선택 후
    page.locator("table.g:visible tbody tr", has_text="f2.ui").first.click()
    page.wait_for_timeout(300)
    page.locator("[data-user-edit-open]").click()
    page.wait_for_selector("[data-user-edit]", timeout=3000)
    page.locator("[data-user-edit] input[aria-label='수정 이름']").fill("F2 UI 수정")
    page.locator("[data-user-edit] button[type=submit]").click()
    page.wait_for_selector("text=정보 수정 ✓", timeout=6000)
    ok("UI 정보 수정 ✓", True)

    # 검색 — DenseGrid 공용 찾기 (Ctrl+F)
    wrap = page.locator("[data-grid-wrap]", has=page.locator("tr", has_text="f2.ui")).first
    wrap.locator("[title='찾기 (Ctrl+F)']").click()
    wrap.locator("input[placeholder='찾기…']").fill("f2.ui")
    page.wait_for_timeout(400)
    ok("UI 검색 필터 (1행)",
       wrap.locator("tbody tr:not([data-grid-state])").count() == 1
       and "f2.ui" in wrap.inner_text())
    b.close()

    # UI 생성분 정리 (f2.ui 는 로그인 이력 없음 — API 삭제 가능)
    ok("UI 사용자 정리", call(tok, "DELETE", "/users/f2.ui").status == 200)

    # f2.probe — 로그인 감사행 때문에 API 삭제 불가 → psql 정리 (규칙 허용 경로)
    purge_f2_users()
    left = psql("SELECT count(*) FROM sys_user WHERE login_id LIKE 'f2.%'")
    ok("psql 정리 — f2.* 잔존 0", left == "0")

print(f"\nOK — live_f2_users {n}/{n}")
