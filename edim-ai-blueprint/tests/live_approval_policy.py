# -*- coding: utf-8 -*-
"""승인 정책 — 요청자 본인 결정 금지(4-eyes) 라이브 검증 (11.4).

종전에는 **본인이 올린 요청을 본인이 승인**할 수 있었다. 규격에 명시된 요구는 아니지만
문서·설계 통제에서 감사가 흔히 요구하는 항목이라 **테넌트 정책(기본 꺼짐)** 으로 제공한다.
기본을 켜면 관리자 1인으로 운영하는 고객사가 아무것도 승인하지 못하므로 도입은 고객사가 정한다.

이 스위트는 정책을 **켰다가 반드시 되돌린다** — 켜진 채로 남으면 다른 스위트의 승인이 막힌다.

실행: PYTHONUTF8=1 py tests/live_approval_policy.py
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

    def policy(value: bool):
        return call("PUT", "/settings/approval-policy", admin,
                    data={"selfApprovalBlocked": value})

    def new_request() -> int:
        """본인 명의 승인 요청 1건 생성."""
        r = call("POST", "/approvals", admin, data={
            "targetTable": "sys_hierarchy", "targetId": 1,
            "label": "정책 검증용 요청"})
        assert r.status in (200, 201), f"요청 생성 실패 {r.status} {r.text()[:120]}"
        j = r.json()
        return j.get("approvalId") or j.get("id")

    restored = False
    try:
        # ── 1. 기본값은 꺼짐 ──
        r = call("GET", "/settings/approval-policy", admin)
        ok("정책 조회", r.ok, f"status={r.status}")
        before = r.json()["selfApprovalBlocked"]
        ok("기본값은 꺼짐 (기존 동작 무영향)", before is False, str(before))

        # ── 2. 꺼진 상태에서는 본인 승인이 된다 (종전 동작 보존) ──
        aid = new_request()
        r = call("POST", f"/approvals/{aid}/decide", admin,
                 data={"approve": True, "comment": "정책 꺼짐 검증"})
        ok("정책 꺼짐 — 본인 승인 허용 (종전 동작)", r.ok, f"status={r.status}")

        # ── 3. 켜면 본인 결정이 막힌다 ──
        ok("정책 켜기", policy(True).ok)
        ok("조회에 반영", call("GET", "/settings/approval-policy", admin)
           .json()["selfApprovalBlocked"] is True)

        aid2 = new_request()
        r = call("POST", f"/approvals/{aid2}/decide", admin,
                 data={"approve": True, "comment": "본인 승인 시도"})
        ok("본인 승인 차단(403)", r.status == 403, f"status={r.status} body={r.text()[:120]}")
        ok("차단 사유가 정책임을 알 수 있음", "본인" in r.text(), r.text()[:120])
        r = call("POST", f"/approvals/{aid2}/decide", admin,
                 data={"approve": False, "comment": "본인 반려 시도"})
        ok("본인 반려도 차단(403)", r.status == 403, f"status={r.status}")

        # ── 4. 일괄 경로도 막히되, 건너뛴 사실이 따로 보고돼야 한다 ──
        # ('이미 결정됨' skipped 에 섞이면 정책이 작동한 줄 모른다)
        r = call("POST", "/approvals/decide-batch", admin,
                 data={"approvalIds": [aid2], "approve": True, "comment": "일괄 시도"})
        ok("일괄 호출 자체는 성공", r.ok, f"status={r.status} body={r.text()[:140]}")
        b = r.json()
        ok("본인 요청은 처리되지 않음", b["processed"] == 0, str(b))
        ok("selfBlocked 로 별도 보고", b.get("selfBlocked") == 1, str(b))
        ok("selfBlockedIds 에 해당 건", aid2 in (b.get("selfBlockedIds") or []), str(b))

        # 요청이 실제로 미결 상태로 남았는지
        r = call("GET", "/approvals?status=PENDING", admin)
        if r.ok:
            pend = r.json()
            items = pend if isinstance(pend, list) else (pend.get("items") or [])
            ok("차단된 요청은 미결로 남음",
               any((x.get("approvalId") or x.get("id")) == aid2 for x in items),
               f"{len(items)}건 조회")

        # ── 5. 되돌리면 원래대로 ──
        ok("정책 끄기", policy(False).ok)
        restored = True
        ok("조회에 반영", call("GET", "/settings/approval-policy", admin)
           .json()["selfApprovalBlocked"] is False)
        r = call("POST", f"/approvals/{aid2}/decide", admin,
                 data={"approve": True, "comment": "정책 해제 후 처리"})
        ok("정책 끔 — 본인 승인 다시 허용", r.ok, f"status={r.status}")

        # ── 6. 권한 ──
        ok("무인증 정책 변경 차단(401)",
           call("PUT", "/settings/approval-policy",
                data={"selfApprovalBlocked": True}).status == 401)
    finally:
        # 정책이 켜진 채 남으면 다른 스위트의 승인이 전부 막힌다 — 반드시 되돌린다
        if not restored:
            policy(False)
            print("   (정리) 정책을 기본값으로 되돌림")

    req.dispose()

print(f"\nOK — 승인 정책 {n}개 검증 통과")
