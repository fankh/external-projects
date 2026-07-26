# -*- coding: utf-8 -*-
"""세션 수명·알림 수신 검증 (15.3).

두 가지를 고정한다.

1) **비활성화가 즉시 반영되는가** — 인증 미들웨어가 매 요청 `status='ACTIVE'` 를 재확인한다.
   이 성질이 깨지면 해고·사고로 계정을 막아도 **기존 토큰으로 최대 8시간 접근**이 이어진다.
   토큰 수명(8h)에 기대지 않고 실제로 즉시 끊기는지 밟는다.

2) **알림이 본인 것만 보이고, 읽음 보고가 정직한가** — 종전에는 없는 알림·남의 알림에도
   `read:true` 를 돌려줬다(쓰기는 없으므로 보안 문제는 아니지만, 아무것도 하지 않고 했다고
   답하면 클라이언트가 목록이 그대로인 이유를 알 수 없다).

검증용 계정은 스스로 만들고 지운다.

실행: PYTHONUTF8=1 py tests/live_session_notify.py
"""
import os
import time

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
LOGIN = "sesschk"
PW = "SessChk!2345"
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

    r = call("POST", "/auth/login", data={"userId": "edim", "password": "edim"})
    assert r.ok, f"로그인 실패 {r.status}"
    admin = r.json()["token"]

    def ensure_user():
        r = call("POST", "/users", admin, data={
            "login": LOGIN, "name": "세션검증", "department": "QA",
            "level": "GENERAL", "initialPassword": PW})
        if r.status == 409:
            # 앞선 실행 잔재 — 알려진 상태로 되돌린다
            call("PATCH", f"/users/{LOGIN}/active", admin, data={"active": True})
            call("POST", f"/users/{LOGIN}/reset-password", admin, data={"newPassword": PW})
        return r.status

    st = ensure_user()
    ok("검증 계정 준비 (생성 201 또는 기존 409)", st in (201, 409), f"status={st}")

    r = call("POST", "/auth/login", data={"userId": LOGIN, "password": PW})
    ok("검증 계정 로그인", r.ok, f"status={r.status} body={r.text()[:120]}")
    tok = r.json()["token"]

    # ── 1. 토큰이 유효한 동안은 정상 동작 ──
    ok("토큰으로 조회 성공", call("GET", "/notifications", tok).ok)

    # ── 2. 비활성화 → 같은 토큰이 즉시 막혀야 한다 ──
    r = call("PATCH", f"/users/{LOGIN}/active", admin, data={"active": False})
    ok("계정 비활성화", r.ok, f"status={r.status} body={r.text()[:120]}")

    r = call("GET", "/notifications", tok)
    ok("비활성화 즉시 기존 토큰 차단(401)", r.status == 401,
       f"status={r.status} — 토큰 수명(8h)에 기대면 해고·사고 후에도 접근이 이어진다")
    ok("차단 사유를 알 수 있음", "비활성" in r.text() or "사용자" in r.text(), r.text()[:120])
    ok("비활성 계정은 재로그인도 불가",
       call("POST", "/auth/login", data={"userId": LOGIN, "password": PW}).status in (401, 403))

    # ── 3. 재활성화하면 다시 통한다 (과잉 차단이 아님) ──
    ok("계정 재활성화", call("PATCH", f"/users/{LOGIN}/active", admin,
                            data={"active": True}).ok)
    r = call("POST", "/auth/login", data={"userId": LOGIN, "password": PW})
    ok("재활성화 후 로그인 가능", r.ok, f"status={r.status}")
    tok2 = r.json()["token"]
    ok("재발급 토큰으로 조회 성공", call("GET", "/notifications", tok2).ok)

    # ── 3b. 비밀번호 재설정이 이미 열린 세션을 끊는가 (18.51) ──
    # 계정 비활성화는 즉시 반영되는데(위 2번), **같은 목적(계정 탈취 대응)의 다른 경로**인
    # 비밀번호 재설정은 반영되지 않았다 — 옛 비밀번호 로그인은 401 인데 옛 토큰은 200 이었다
    # (운영 실측). 관리자가 비밀번호를 바꾸는 이유가 바로 그 세션을 끊기 위해서다.
    ok("재설정 전 토큰 유효", call("GET", "/notifications", tok2).ok)
    # 판정은 초 단위다(토큰의 발급 시각이 초로 잘려 있다 — 18.52). 발급과 재설정이 같은 초에
    # 몰리면 그 토큰은 유효로 남는다 — 의도한 성질이므로 **경계를 넘겨서** 확인한다.
    time.sleep(1.2)
    r = call("POST", f"/users/{LOGIN}/reset-password", admin, data={"newPassword": PW + "9"})
    ok("관리자 비밀번호 재설정", r.ok, f"status={r.status}")
    r = call("GET", "/notifications", tok2)
    ok("★ 재설정 후 옛 토큰 차단(401)", r.status == 401,
       f"status={r.status} — 비밀번호를 바꿔도 열린 세션이 남으면 탈취 대응이 되지 않는다")
    ok("차단 사유가 비밀번호 변경임을 밝힌다", "비밀번호" in r.text(), r.text()[:120])
    r = call("POST", "/auth/login", data={"userId": LOGIN, "password": PW + "9"})
    ok("새 비밀번호로 재로그인 가능", r.ok, f"status={r.status}")
    tok2 = r.json()["token"]
    ok("재로그인 토큰은 정상 동작", call("GET", "/notifications", tok2).ok)
    # 본인 변경은 새 토큰을 함께 돌려준다 — 그 토큰이 바로 쓰이는가
    # 판정은 **초 단위**다(토큰의 발급 시각이 초로 잘려 있다 — 18.52). 같은 초에 발급된
    # 토큰은 유효로 두므로, '변경 전 토큰이 끊기는가' 를 보려면 **초 경계를 넘겨야** 한다.
    # 붙여서 호출하면 구현이 보장하지 않는 것을 요구하게 되고, 그건 검증의 잘못이다.
    time.sleep(1.2)
    r = call("PUT", "/users/me/password", tok2,
             data={"currentPassword": PW + "9", "newPassword": PW})
    ok("본인 비밀번호 변경", r.ok, f"status={r.status}")
    fresh = r.json().get("token")
    ok("★ 본인 변경은 새 토큰을 함께 돌려준다", bool(fresh))
    ok("★ 그 토큰으로 바로 조회 가능 (다시 로그인 불필요)",
       call("GET", "/notifications", fresh).ok)
    ok("★ 변경 전 토큰은 끊긴다 (다른 기기 세션 정리)",
       call("GET", "/notifications", tok2).status == 401)
    tok2 = fresh

    # ── 4. 알림은 본인 것만 — 읽음 보고가 정직한가 ──
    r = call("GET", "/notifications", admin)
    ok("관리자 알림 조회", r.ok, f"status={r.status}")
    admin_notes = r.json()
    other_id = next((x.get("id") for x in admin_notes if x.get("id")), None)

    mine = call("GET", "/notifications", tok2).json()
    ok("검증 계정 알림 목록 조회", isinstance(mine, list), str(mine)[:120])
    ok("남의 알림이 내 목록에 없음",
       other_id is None or other_id not in [x.get("id") for x in mine],
       f"타인 알림 #{other_id} 노출")

    if other_id is not None:
        r = call("POST", f"/notifications/{other_id}/read", tok2)
        ok("남의 알림 읽음 처리는 404 (했다고 답하지 않는다)", r.status == 404,
           f"status={r.status} — 아무것도 안 하고 read:true 를 돌려주면 안 된다")
    r = call("POST", "/notifications/99999999/read", tok2)
    ok("없는 알림 읽음 404", r.status == 404, f"status={r.status}")

    r = call("POST", "/notifications/read-all", tok2)
    ok("모두 읽음 호출", r.ok, f"status={r.status}")
    ok("처리 건수를 실제로 보고", isinstance(r.json().get("read"), int), str(r.json()))

    # ── 5. 정리 ──
    call("PATCH", f"/users/{LOGIN}/active", admin, data={"active": False})
    r = call("DELETE", f"/users/{LOGIN}", admin)
    ok("검증 계정 정리 (삭제 200 또는 이력 보호 409)", r.status in (200, 204, 409),
       f"status={r.status}")
    if r.status == 409:
        print("   (참고) 업무 이력이 있어 삭제 대신 비활성 상태로 남긴다 — 제품 규칙")

    req.dispose()

print(f"\nOK — 세션·알림 {n}개 검증 통과")
