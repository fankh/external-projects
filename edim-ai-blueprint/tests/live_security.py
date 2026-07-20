# -*- coding: utf-8 -*-
"""B8 라이브 E2E — 보안 강화 배치.

비밀번호 변경(구비밀번호 거부·왕복) · 로그인 5회 실패 자동 LOCKED · 잠금 해제로
카운터 초기화 · 권한 레벨 변경 감사 · 토큰 슬라이딩 갱신(X-EDIM-Token) ·
sys_history 감사 행 · 타이틀바 사용자 메뉴 다이얼로그 UI.
실행: PYTHONUTF8=1 py tests/live_security.py
"""
import json
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
API = BASE + "/api/v1"
n_pass = 0


def ok(label: str, cond: bool) -> None:
    global n_pass
    assert cond, f"FAIL {label}"
    n_pass += 1
    print(f"PASS {label}")


def call(method: str, path: str, body: dict | None = None, token: str | None = None):
    """(status, json, headers) — 4xx 도 본문 파싱."""
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data, timeout=15) as res:
            return res.status, json.loads(res.read()), dict(res.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()), dict(e.headers)


def login(user: str, pw: str, ttl: int | None = None):
    body = {"userId": user, "password": pw}
    if ttl:
        body["ttlSeconds"] = ttl
    return call("POST", "/auth/login", body)


# ── 1. 비밀번호 변경 왕복 (edim) ──
st, r, _ = login("edim", "edim")
ok("edim 로그인 (LOGIN_OK 감사)", st == 200 and "token" in r)
admin_token = r["token"]

st, r, _ = call("PUT", "/users/me/password",
                {"currentPassword": "wrong", "newPassword": "edim2"}, admin_token)
ok("현재 비밀번호 불일치 → 403", st == 403 and "올바르지" in r["detail"])

st, r, _ = call("PUT", "/users/me/password",
                {"currentPassword": "edim", "newPassword": "ed"}, admin_token)
ok("4자 미만 새 비밀번호 → 422", st == 422)

try:
    st, r, _ = call("PUT", "/users/me/password",
                    {"currentPassword": "edim", "newPassword": "edim2"}, admin_token)
    ok("비밀번호 변경 성공", st == 200 and r.get("changed"))
    st, r, _ = login("edim", "edim")
    ok("구비밀번호 로그인 거부 (401)", st == 401)
    st, r, _ = login("edim", "edim2")
    ok("새 비밀번호 로그인 성공", st == 200)
finally:
    # 원복 — 이후 회차·시연이 edim/edim 을 계속 쓴다
    st2, _, _ = call("PUT", "/users/me/password",
                     {"currentPassword": "edim2", "newPassword": "edim"}, admin_token)
    assert st2 == 200, "edim 비밀번호 원복 실패 — 수동 복구 필요!"
ok("비밀번호 원복 (edim/edim)", login("edim", "edim")[0] == 200)

# ── 2. 로그인 5회 실패 → 자동 LOCKED (lee.t) ──
try:
    last = None
    for i in range(5):
        last = login("lee.t", "wrong-" + str(i))
    ok("5회 실패 → 403 자동 잠금 안내", last[0] == 403 and "잠겼습니다" in last[1]["detail"])
    st, r, _ = login("lee.t", "edim")
    ok("잠긴 계정은 정답도 거부 (LOCKED 403)", st == 403 and "LOCKED" in r["detail"])
    st, users, _ = call("GET", "/users", token=admin_token)
    lee = next(u for u in users if u["login"] == "lee.t")
    ok("sys_user.status=LOCKED 반영", lee["status"] == "LOCKED")
finally:
    st2, _, _ = call("POST", "/users/lee.t/unlock", {}, admin_token)
    assert st2 == 200, "lee.t 잠금 해제 실패 — 수동 복구 필요!"
st, r, _ = login("lee.t", "edim")
ok("잠금 해제(UNLOCK) 후 로그인 = 실패 카운터 초기화", st == 200)

# ── 3. 권한 레벨 변경 + 감사 ──
st, r, _ = call("PATCH", "/users/lee.t/level", {"level": "SETUP"}, admin_token)
ok("레벨 변경 GENERAL→SETUP", st == 200 and r["level"] == "SETUP")
st, r, _ = call("PATCH", "/users/lee.t/level", {"level": "SETUP"}, admin_token)
ok("동일 레벨 재변경 → 409", st == 409)
st, r, _ = call("PATCH", "/users/lee.t/level", {"level": "GENERAL"}, admin_token)
ok("레벨 원복 SETUP→GENERAL", st == 200)

# ── 4. 토큰 슬라이딩 갱신 ──
st, r, _ = login("edim", "edim", ttl=300)   # 잔여 5분 < 30분 창
short_token = r["token"]
st, _, hdr = call("GET", "/users", token=short_token)
renewed = hdr.get("X-EDIM-Token") or hdr.get("x-edim-token")
ok("만료 임박 토큰 → X-EDIM-Token 재발급", st == 200 and bool(renewed))
st, _, _ = call("GET", "/users", token=renewed)
ok("재발급 토큰으로 호출 성공", st == 200)
st, _, hdr = call("GET", "/users", token=admin_token)   # 8h 토큰 — 창 밖
ok("잔여 충분 토큰은 재발급 없음", st == 200 and not hdr.get("X-EDIM-Token"))

# ── 5. 감사 이력 (sys_history) ──
st, rows, _ = call("GET", "/history?limit=60", token=admin_token)
actions = {r["action"] for r in rows if r["target"].startswith("sys_user")}
for a in ("LOGIN_OK", "LOGIN_FAIL", "LOCK", "UNLOCK", "PW_CHANGE", "LEVEL_CHANGE"):
    ok(f"감사 행 {a}", a in actions)

# ── 6. UI — 타이틀바 사용자 메뉴 → 비밀번호 변경 다이얼로그 ──
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/erp", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)

    p.locator("[data-user-menu]").click()
    p.locator("div", has_text="비밀번호 변경").last.click()
    p.locator("[data-pw-dialog]").wait_for(timeout=3000)
    ok("사용자 메뉴 → 비밀번호 변경 다이얼로그", True)

    p.get_by_label("현재 비밀번호").fill("wrong")
    p.get_by_label("새 비밀번호", exact=True).fill("edim2")
    p.get_by_label("새 비밀번호 확인").fill("edim2")
    p.get_by_role("button", name="변경", exact=True).click()
    p.wait_for_timeout(1200)
    ok("구비밀번호 오류 붉은 안내",
       "올바르지" in p.locator("[data-pw-dialog]").inner_text())
    p.locator("[data-pw-dialog] span", has_text="✕").first.click()

    # 사용자·권한 화면 — 레벨 변경 버튼 실배선 (jang.s GENERAL→SETUP→원복, API 검증)
    tree_click(p, "사용자·권한 (M-14-6)")
    p.wait_for_selector("td.code >> text=jang.s", timeout=8000)
    p.locator("tr", has_text="jang.s").first.click()
    p.locator("[data-level-select]").select_option("SETUP")
    p.locator("[data-level-change]").click()
    p.wait_for_timeout(1200)
    st_ui, users_ui, _ = call("GET", "/users", token=admin_token)
    jang = next(u for u in users_ui if u["login"] == "jang.s")
    ok("UI 레벨 변경 (sys_history LEVEL_CHANGE)", jang["userLevel" if "userLevel" in jang else "level"] == "SETUP")
    b.close()

st, _, _ = call("PATCH", "/users/jang.s/level", {"level": "GENERAL"}, admin_token)
ok("jang.s 레벨 원복", st == 200)

print(f"\nB8 보안 강화 라이브: {n_pass}/27 pass")
