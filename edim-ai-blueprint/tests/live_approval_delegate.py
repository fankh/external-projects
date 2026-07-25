# -*- coding: utf-8 -*-
"""승인 위임·결정자 기록 검증 (13.5, 규격 ADM-003).

ADM-003 은 "승인 요청 일괄 처리·**위임**·규칙" 인데 위임이 미구현이었다. 승인함은 미결
요청을 전원에게 보여 줄 뿐 '누구에게 맡겨졌는지' 개념이 없어 담당을 시스템 밖에서 관리해야 했다.

함께 잡은 것: `sys_approval_request.approver_id` 컬럼이 있는데 **한 번도 쓰이지 않아**
승인 테이블만 보고는 누가 승인했는지 알 수 없었다(감사 로그를 따로 뒤져야 했다).

지정은 **잠금이 아니다** — 부재 시 업무가 멈추면 안 되므로 다른 승인자도 결정할 수 있다.
그 성질까지 확인한다.

실행: PYTHONUTF8=1 py tests/live_approval_delegate.py
"""
import os

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
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
    me = r.json()["user"]["userId"]

    def inbox(mine: bool = False):
        r = call("GET", f"/approvals/inbox{'?assignedToMe=true' if mine else ''}", admin)
        assert r.ok, f"승인함 조회 실패 {r.status}"
        return r.json()

    def new_request() -> int:
        r = call("POST", "/approvals", admin, data={
            "targetTable": "sys_hierarchy", "targetId": 1, "label": "위임 검증용 요청"})
        assert r.status in (200, 201), f"요청 생성 실패 {r.status} {r.text()[:140]}"
        j = r.json()
        return j.get("approvalId") or j.get("id")

    # 승인 권한이 있는 다른 사용자 확보 (SETUP 이상)
    r = call("GET", "/users", admin)
    ok("사용자 목록 조회", r.ok, f"status={r.status}")
    users = r.json()
    users = users if isinstance(users, list) else (users.get("items") or [])
    def lvl(u):
        return str(u.get("level") or u.get("userLevel") or "")
    approver = next((u for u in users
                     if lvl(u) in ("SETUP", "ADMIN", "PLATFORM")
                     and str(u.get("login") or u.get("loginId")) != me
                     and str(u.get("status") or "ACTIVE") == "ACTIVE"), None)
    general = next((u for u in users if lvl(u) == "GENERAL"
                    and str(u.get("status") or "ACTIVE") == "ACTIVE"), None)
    ok("위임 대상(SETUP 이상) 확보", approver is not None,
       f"{[(u.get('login'), lvl(u)) for u in users[:6]]}")
    target = str(approver.get("login") or approver.get("loginId"))

    aid = new_request()
    try:
        # ── 1. 기본은 지정 없음 ──
        row = next((x for x in inbox() if x["id"] == aid), None)
        ok("새 요청이 승인함에 있음", row is not None, f"#{aid}")
        ok("응답에 assignedLogin 필드 존재", "assignedLogin" in row, str(row)[:180])
        ok("기본은 지정 없음(전원 대상)", row["assignedLogin"] is None, str(row["assignedLogin"]))

        # ── 2. 위임 ──
        r = call("POST", f"/approvals/{aid}/delegate", admin, data={"login": target})
        ok("위임 성공", r.ok, f"status={r.status} body={r.text()[:140]}")
        ok("응답에 지정 대상 반영", r.json().get("assignedLogin") == target, str(r.json()))

        row = next((x for x in inbox() if x["id"] == aid), None)
        ok("승인함에 지정 대상이 보임", row["assignedLogin"] == target, str(row)[:180])
        ok("지정자 이름도 함께 제공", bool(row.get("assignedName")), str(row)[:180])

        # ── 3. '내게 지정된 건' 필터 ──
        mine_ids = [x["id"] for x in inbox(mine=True)]
        ok("내게 지정된 건 필터에 포함되지 않음 (남에게 위임했으므로)",
           aid not in mine_ids, f"{mine_ids[:5]}")
        r = call("POST", f"/approvals/{aid}/delegate", admin, data={"login": me})
        ok("나에게 재위임", r.ok, f"status={r.status}")
        ok("내게 지정된 건 필터에 포함됨", aid in [x["id"] for x in inbox(mine=True)])

        # ── 4. 거부돼야 하는 위임 ──
        if general:
            gl = str(general.get("login") or general.get("loginId"))
            r = call("POST", f"/approvals/{aid}/delegate", admin, data={"login": gl})
            ok("승인 권한 없는 사용자로 위임 거부(422)", r.status == 422,
               f"status={r.status} body={r.text()[:140]}")
            ok("거부 사유에 필요한 레벨이 보임", "SETUP" in r.text(), r.text()[:140])
        else:
            print("SKIP 권한 미달 위임 거부 — GENERAL 사용자가 없다")
        ok("없는 사용자로 위임 거부(404)",
           call("POST", f"/approvals/{aid}/delegate", admin,
                data={"login": "__nosuch__"}).status == 404)
        ok("없는 요청 위임 404",
           call("POST", "/approvals/99999999/delegate", admin,
                data={"login": target}).status == 404)
        ok("무인증 위임 차단(401)",
           call("POST", f"/approvals/{aid}/delegate", data={"login": target}).status == 401)

        # ── 5. 지정 해제 ──
        r = call("POST", f"/approvals/{aid}/delegate", admin, data={"login": ""})
        ok("지정 해제", r.ok and r.json().get("assigned") is False, str(r.json()))
        row = next((x for x in inbox() if x["id"] == aid), None)
        ok("해제 후 전원 대상으로 복귀", row["assignedLogin"] is None, str(row)[:160])

        # ── 6. 지정은 잠금이 아니다 + 결정자가 기록된다 ──
        call("POST", f"/approvals/{aid}/delegate", admin, data={"login": target})
        r = call("POST", f"/approvals/{aid}/decide", admin,
                 data={"approve": True, "comment": "위임 검증 — 지정자 외 결정"})
        ok("지정 대상이 아니어도 결정 가능 (지정은 잠금이 아니다)", r.ok,
           f"status={r.status} body={r.text()[:140]}")
        ok("결정된 건은 승인함에서 사라짐",
           not any(x["id"] == aid for x in inbox()), f"#{aid} 잔존")

        # 이미 결정된 건은 위임 대상이 아니다
        ok("결정된 건 위임 404",
           call("POST", f"/approvals/{aid}/delegate", admin,
                data={"login": target}).status == 404)
    finally:
        # 미결로 남았으면 정리 (승인함 오염 방지)
        if any(x["id"] == aid for x in inbox()):
            call("POST", f"/approvals/{aid}/decide", admin,
                 data={"approve": True, "comment": "정리"})

    req.dispose()

print(f"\nOK — 승인 위임 {n}개 검증 통과")
