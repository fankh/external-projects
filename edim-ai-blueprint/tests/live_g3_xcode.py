# -*- coding: utf-8 -*-
"""G3 라이브 — X-code 검토 흐름.

API: 비표준(X) 견적안 저장→PENDING 대기열 · 승인/반려→x_code_status·큐 제거 · 표준코드는 큐 미포함 · 재검토 409 · 잘못된 결정 422.
정리: 생성 견적안 DELETE (Run 미참조).
실행: PYTHONUTF8=1 py tests/live_g3_xcode.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
ROOT = "KDCR 3-13"
PROJ = "PS-61313-5"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def mk(code):
        r = req.post(f"{API}/cpq/selections",
                     data={"projectNo": PROJ, "rootCode": ROOT, "finishedGoodsCode": code, "slotValues": {"A": "690"}})
        return r.json().get("selectionId") if r.status == 201 else None

    def queue_ids():
        return [x["selectionId"] for x in req.get(f"{API}/cpq/x-review").json()]

    created = []
    try:
        a = mk("XZZTEST-A"); b = mk("XZZTEST-B"); std = mk("ZZSTD-1")
        created = [x for x in (a, b, std) if x]
        ok("X 견적안 2 + 표준 1 생성", all([a, b, std]))

        q = queue_ids()
        ok("X-code 대기열 — X 2건 PENDING 포함", a in q and b in q)
        ok("표준 코드는 대기열 미포함", std not in q)

        # 승인
        r = req.post(f"{API}/cpq/selections/{a}/x-review", data={"decision": "APPROVE", "comment": "ok"}).json()
        ok("승인 → APPROVED", r["xCodeStatus"] == "APPROVED")
        ok("승인 건 대기열 제거", a not in queue_ids())

        # 반려
        r2 = req.post(f"{API}/cpq/selections/{b}/x-review", data={"decision": "REJECT"}).json()
        ok("반려 → REJECTED", r2["xCodeStatus"] == "REJECTED")
        ok("반려 건 대기열 제거", b not in queue_ids())

        # 재검토(비-PENDING) 409
        ok("이미 결정된 건 재검토 = 409",
           req.post(f"{API}/cpq/selections/{a}/x-review", data={"decision": "APPROVE"}).status == 409)
        # 잘못된 결정 422
        ok("잘못된 decision = 422",
           req.post(f"{API}/cpq/selections/{b}/x-review", data={"decision": "MAYBE"}).status == 422)
    finally:
        for sid in created:
            req.delete(f"{API}/cpq/selections/{sid}")
    ok("정리 — 생성 견적안 삭제", all(req.delete(f"{API}/cpq/selections/{s}").status in (200, 404) for s in created))

print(f"\nOK — live_g3_xcode {n}/{n}")
