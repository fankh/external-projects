# -*- coding: utf-8 -*-
"""비밀번호 해시·복구 라이브 검증 (9.96/9.97).

두 가지를 고정한다.
1) **레거시 sha256 계정이 계속 로그인된다** — 여기가 깨지면 전 사용자가 잠긴다.
   시드 계정은 로그인 시 pbkdf2 로 승격되므로, 승격 전/후 어느 상태든 통과해야 한다.
2) **잊은 비밀번호를 복구할 수 있다** — 종전에는 경로 자체가 없었다(DB 직접 수정만 가능).
   5회 실패로 잠근 뒤 관리자 재설정만으로 되살아나는지 실제로 밟는다.

실행: PYTHONUTF8=1 py tests/live_password_recovery.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
LOGIN = "pwrecov"          # 이 스위트 전용 계정 (없으면 생성, 있으면 재사용)
n = 0


def ok(label: str, cond: bool, detail: str = "") -> None:
    global n
    assert cond, f"FAIL {label}{(' — ' + detail) if detail else ''}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    req = pw.request.new_context()

    def call(method: str, path: str, token: str | None = None, **kw):
        h = {"Content-Type": "application/json"}
        if token:
            h["Authorization"] = f"Bearer {token}"
        return req.fetch(f"{BASE}{path}", method=method, headers=h, **kw)

    def login(user: str, pwd: str):
        return call("POST", "/auth/login", data={"userId": user, "password": pwd})

    # ── 1. 레거시/승격 해시 무관하게 시드 계정 로그인 ──
    r = login("edim", "edim")
    ok("시드 ADMIN 로그인 (해시 형식 무관)", r.ok, f"status={r.status}")
    admin = r.json()["token"]

    r2 = login("edim", "edim")
    ok("승격 후 재로그인", r2.ok and bool(r2.json().get("token")))

    ok("오답 거부", login("edim", "edim-wrong").status == 401)

    # ── 2. 검증 계정 준비 ──
    r = call("POST", "/users", admin, data={
        "login": LOGIN, "name": "비밀번호복구검증", "department": "QA",
        "level": "GENERAL", "initialPassword": "InitPw!2345"})
    ok("검증 계정 준비 (생성 201 또는 기존 409)", r.status in (201, 409), f"status={r.status}")
    if r.status == 409:
        # 앞선 실행이 임시 비밀번호로 바꿔 놨다 — 알려진 값으로 되돌린다
        rr = call("POST", f"/users/{LOGIN}/reset-password", admin,
                  data={"newPassword": "InitPw!2345"})
        ok("기존 계정 초기화", rr.ok, f"status={rr.status}")

    ok("초기 비밀번호 로그인", login(LOGIN, "InitPw!2345").ok)

    # ── 3. 5회 실패 → 자동 잠금 ──
    last = 0
    for i in range(5):
        last = login(LOGIN, f"wrong{i}").status
    ok("5회 연속 실패 시 자동 잠금(403)", last == 403, f"status={last}")
    ok("잠긴 계정은 올바른 비밀번호로도 로그인 불가",
       login(LOGIN, "InitPw!2345").status == 403)

    # ── 4. 관리자 재설정 = 실제 복구 경로 ──
    r = call("POST", f"/users/{LOGIN}/reset-password", admin, data={})
    ok("관리자 재설정 성공", r.ok, f"status={r.status}")
    body = r.json()
    tmp = body["temporaryPassword"]
    ok("임시 비밀번호 12자 생성", len(tmp) == 12, tmp)
    ok("혼동 문자(0/O/1/l/I) 미포함", not set(tmp) & set("0O1lI"), tmp)
    ok("잠금 동시 해제 보고", body["unlocked"] is True)

    ok("임시 비밀번호로 즉시 로그인 — 복구 완료", login(LOGIN, tmp).ok)
    ok("구 비밀번호는 무효", login(LOGIN, "InitPw!2345").status == 401)

    # ── 5. 오·남용 차단 ──
    ok("본인 계정 재설정 거부(409)",
       call("POST", "/users/edim/reset-password", admin, data={}).status == 409)
    ok("8자 미만 지정 거부(422)",
       call("POST", f"/users/{LOGIN}/reset-password", admin,
            data={"newPassword": "short"}).status == 422)
    ok("없는 사용자 404",
       call("POST", "/users/__nosuch__/reset-password", admin, data={}).status == 404)

    general = login(LOGIN, tmp).json()["token"]
    ok("비관리자 재설정 차단(403)",
       call("POST", f"/users/{LOGIN}/reset-password", general, data={}).status == 403)
    ok("무인증 재설정 차단(401)",
       call("POST", f"/users/{LOGIN}/reset-password", data={}).status == 401)

    # ── 6. 지정 비밀번호 + 본인 변경 흐름 ──
    ok("관리자 지정 비밀번호 재설정",
       call("POST", f"/users/{LOGIN}/reset-password", admin,
            data={"newPassword": "Chosen!2345"}).ok)
    ok("지정 비밀번호로 로그인", login(LOGIN, "Chosen!2345").ok)
    tok = login(LOGIN, "Chosen!2345").json()["token"]
    ok("본인 비밀번호 변경 — 현재 비밀번호 틀리면 403",
       call("PUT", "/users/me/password", tok,
            data={"currentPassword": "nope", "newPassword": "Self!23456"}).status == 403)
    ok("본인 비밀번호 변경 성공",
       call("PUT", "/users/me/password", tok,
            data={"currentPassword": "Chosen!2345", "newPassword": "Self!23456"}).ok)
    ok("변경된 비밀번호로 로그인", login(LOGIN, "Self!23456").ok)

    # ── 7. 마지막 관리자 보호 (9.99) ──
    # 관리자가 0명이 되면 비밀번호 재설정·잠금 해제·레벨 복구가 전부 ADMIN 전용이라
    # 제품 안에서 되돌릴 방법이 사라진다. 강등·비활성·삭제 3경로 모두 막혀야 한다.
    r = call("GET", "/users", admin)
    ok("사용자 목록 조회", r.ok, f"status={r.status}")
    users = r.json()
    users = users if isinstance(users, list) else users.get("items", [])
    admins = [u for u in users
              if str(u.get("level") or u.get("userLevel") or "") in ("ADMIN", "PLATFORM")
              and str(u.get("status") or "ACTIVE") == "ACTIVE"]
    ok("활성 관리자 존재", len(admins) >= 1, f"{len(admins)}명")

    # 가드가 **과잉 차단**하지 않는지 결정적으로 확인한다 — 임시 ADMIN 을 만들어
    # 관리자가 2명 이상인 상태에서 강등·삭제가 정상 동작하는지 본다.
    TMP = "adm_tmp01"
    call("DELETE", f"/users/{TMP}", admin)          # 앞선 실행 잔재 정리
    r = call("POST", "/users", admin, data={
        "login": TMP, "name": "임시관리자", "department": "QA",
        "level": "ADMIN", "initialPassword": "TmpAdm!2345"})
    ok("임시 ADMIN 생성", r.status in (201, 409), f"status={r.status}")
    ok("관리자 2명 이상일 때 강등 허용 — 가드 과잉 차단 없음",
       call("PATCH", f"/users/{TMP}/level", admin, data={"level": "GENERAL"}).ok)
    ok("임시 계정 삭제", call("DELETE", f"/users/{TMP}", admin).status in (200, 204, 404, 409))

    if len(admins) == 1:
        last = admins[0].get("login") or admins[0].get("loginId")
        ok("마지막 관리자 강등 차단(409)",
           call("PATCH", f"/users/{last}/level", admin,
                data={"level": "GENERAL"}).status == 409)
        ok("마지막 관리자 비활성 차단(409)",
           call("PATCH", f"/users/{last}/active", admin,
                data={"active": False}).status == 409)
        ok("마지막 관리자 삭제 차단(409)",
           call("DELETE", f"/users/{last}", admin).status == 409)
    else:
        # 관리자가 2명 이상이면 '마지막 1명' 조건이 성립하지 않는다 —
        # 조용히 통과시키지 말고 무엇을 검사하지 못했는지 남긴다.
        print(f"SKIP 마지막 관리자 차단 3종 — 활성 관리자 {len(admins)}명 "
              f"(1명일 때만 성립하는 조건)")

    # 다음 실행을 위해 알려진 값으로 되돌린다
    call("POST", f"/users/{LOGIN}/reset-password", admin,
         data={"newPassword": "InitPw!2345"})

    req.dispose()

print(f"\nOK — 비밀번호 해시·복구 {n}개 검증 통과")
