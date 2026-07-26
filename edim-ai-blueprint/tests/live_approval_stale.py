# -*- coding: utf-8 -*-
"""묵은 승인 요청이 그 사이의 변경을 조용히 되돌리지 못하게 (17.6).

승인 요청이 미결로 남아 있는 동안 대상은 계속 바뀔 수 있다. 종전에는 결정 시 대상의
**현재 상태를 확인하지 않아**, 비활성으로 내려둔 제품 코드가 묵은 요청 승인만으로
APPROVED 로 되살아났다. 관리자가 방금 막아 둔 것이 소리 없이 풀리는 형태다.

같은 자리에 또 하나 있었다 — 일부 분기는 `AND status='REVIEW'` 같은 조건을 UPDATE 에
달아 뒀는데, 조건이 안 맞으면 **0행이 바뀌어도 요청은 APPROVED 로 기록되고 요청자에게는
'승인' 알림이 갔다**. 아무것도 하지 않고 했다고 답하는 형태이므로, 결정 전에 미리 확인해
409 로 거절한다(부분 반영도 생기지 않는다).

반려는 막지 않는다 — 반려는 아무 권한도 부여하지 않고, 막으면 승인함에서 치울 수 없는
요청이 남는다. 이 성질도 함께 밟는다.

실행: PYTHONUTF8=1 py tests/live_approval_stale.py
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
    tok = r.json()["token"]

    r = call("GET", "/codes/products?limit=200", tok)
    ok("제품 코드 조회", r.ok, f"status={r.status}")
    items = r.json()
    items = items if isinstance(items, list) else items.get("items", [])
    ok("대상 제품 코드 존재", len(items) > 0)
    pc = items[0]
    pid, before = int(pc["productCodeId"]), pc.get("approvalStatus")
    print(f"   대상 #{pid} {pc.get('mainCode')} — 현재 {before}")

    def status_now() -> str:
        got = call("GET", "/codes/products?limit=200", tok).json()
        got = got if isinstance(got, list) else got.get("items", [])
        return next(x.get("approvalStatus") for x in got
                    if int(x["productCodeId"]) == pid)

    try:
        # 1. 승인 요청을 올려 미결 상태를 만든다
        r = call("POST", "/approvals", tok, data={
            "targetTable": "product_code", "targetId": pid,
            "requestType": "UPDATE", "label": "묵은 요청 검증"})
        ok("승인 요청 생성", r.status == 201, f"status={r.status} body={r.text()[:160]}")
        aid = r.json()["approvalId"]

        # 2. 그 사이 관리자가 대상을 비활성으로 내린다
        r = call("PATCH", f"/codes/products/{pid}", tok, data={"status": "INACTIVE"})
        ok("대상 비활성화", r.ok, f"status={r.status} body={r.text()[:160]}")
        ok("비활성 반영 확인", status_now() == "INACTIVE")

        # 3. 묵은 요청을 승인 — 되살아나면 안 된다
        r = call("POST", f"/approvals/{aid}/decide", tok,
                 data={"approve": True, "comment": "묵은 요청 검증"})
        ok("비활성 대상에 대한 승인은 409", r.status == 409,
           f"status={r.status} body={r.text()[:200]} — 방금 막아 둔 코드가 소리 없이 풀린다")
        ok("거절 사유에 현재 상태가 드러남", "INACTIVE" in r.text(), r.text()[:200])
        ok("대상 상태가 그대로", status_now() == "INACTIVE",
           "승인이 거절됐는데 상태가 바뀌었다 — 부분 반영")

        # 4. 반려는 막히지 않는다 (승인함에 치울 수 없는 요청이 남으면 안 된다)
        r = call("POST", f"/approvals/{aid}/decide", tok,
                 data={"approve": False, "comment": "묵은 요청 정리"})
        ok("반려는 대상 상태와 무관하게 가능", r.ok,
           f"status={r.status} body={r.text()[:200]} — 막으면 치울 수 없는 요청이 남는다")
        ok("반려 결과 기록", r.json().get("result") == "REJECTED", str(r.json())[:120])
        ok("반려가 비활성 코드를 덮어쓰지 않음", status_now() == "INACTIVE",
           f"현재 {status_now()} — 요청을 닫는 것과 자산을 건드리는 것은 다른 일이다")
    finally:
        # 5. 원상 복구 — 검증이 실패해도 대상 상태는 되돌린다
        if before:
            call("PATCH", f"/codes/products/{pid}", tok, data={"status": before})
            print(f"   (복구) #{pid} → {before}")

    ok("대상 상태 원복 확인", status_now() == before, f"현재 {status_now()} / 원래 {before}")

    req.dispose()

print(f"\nOK — 묵은 승인 요청 {n}개 검증 통과")
