# -*- coding: utf-8 -*-
"""견적 확정의 원가 근거 완전성 라이브 검증 (11.9).

11.6 에서 PCR 이 단가 미해결을 표시하게 됐지만, **견적 확정은 그대로 통과**시켰다 —
경고를 본 사용자가 확정 버튼 한 번으로 우회할 수 있으면 통제가 아니다. 미해결 품목은
0 원 라인으로 견적서에 실리고 견적 어디에도 표시가 없었다.

여기서 보는 것:
1) 확정 응답·목록에 **발행 시점 근거**가 스냅샷으로 남는가 (PCR 은 upsert 로 덮어써지므로
   조인으로 읽으면 이미 발행된 견적의 근거가 소급 변경된다).
2) 도입 전 발행분이 '근거 완전' 으로 오표시되지 않는가 (basisKnown=false 로 구분).
3) 정책(quoteBlockIncompleteBasis)을 켜면 확정이 막히고, 명시적 승인으로만 진행되는가.

정책은 **켰다가 반드시 되돌린다** — 켜진 채 남으면 다른 스위트의 견적 확정이 막힌다.

실행: PYTHONUTF8=1 py tests/live_quote_basis.py
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

    def set_policy(block: bool, self_block: bool = False):
        return call("PUT", "/settings/approval-policy", admin, data={
            "selfApprovalBlocked": self_block, "quoteBlockIncompleteBasis": block})

    def quotes():
        r = call("GET", "/cost/quotations", admin)
        assert r.ok, f"견적 목록 실패 {r.status}"
        return r.json()

    # PCR 을 최신 Run 기준으로 갱신해 근거를 확정한다
    r = call("POST", "/cost/pcr", admin,
             data={"businessType": "PRE_SALES", "marginRate": 0.35})
    ok("PCR 생성", r.ok, f"status={r.status} body={r.text()[:140]}")
    pcr_unpriced = r.json()["unpricedCount"]
    print(f"   (근거) 현재 원가의 단가 미해결 {pcr_unpriced}건")

    restored = False
    try:
        # ── 1. 정책 꺼짐 — 확정은 되지만 근거는 반드시 따라온다 ──
        ok("정책 끄기(기본값)", set_policy(False).ok)
        r = call("POST", "/cost/quotations", admin,
                 data={"businessType": "PRE_SALES", "currency": "KRW"})
        ok("견적 확정", r.status == 201, f"status={r.status} body={r.text()[:160]}")
        q = r.json()
        for key in ("unpricedCount", "basisComplete", "notes"):
            ok(f"확정 응답에 {key} 포함", key in q, str(q)[:200])
        ok("확정 응답의 근거가 PCR 과 일치", q["unpricedCount"] == pcr_unpriced,
           f"견적 {q['unpricedCount']} vs PCR {pcr_unpriced}")
        ok("basisComplete 가 건수와 일치",
           q["basisComplete"] == (q["unpricedCount"] == 0), str(q)[:160])
        ok("불완전할 때만 사유 문구",
           bool(q["notes"]) == (q["unpricedCount"] > 0), str(q["notes"]))
        qno = q["quotationNo"]

        # ── 2. 목록 — 발행 시점 근거가 스냅샷으로 남는다 ──
        rows = quotes()
        mine = [x for x in rows if x["quotationNo"] == qno]
        ok("확정한 견적이 목록에 있음", bool(mine), f"{len(rows)}건")
        m = mine[0]
        ok("목록에 unpricedCount 포함", "unpricedCount" in m, str(m)[:200])
        ok("목록의 근거가 확정 결과와 일치", m["unpricedCount"] == q["unpricedCount"],
           f"목록 {m['unpricedCount']} vs 확정 {q['unpricedCount']}")
        ok("목록에 basisKnown 포함", "basisKnown" in m)
        ok("새 견적은 근거를 안다", m["basisKnown"] is True)

        # ── 3. 도입 전 발행분은 '근거 완전' 으로 오표시되지 않는다 ──
        legacy = [x for x in rows if x.get("basisKnown") is False]
        ok("도입 전 발행분은 basisComplete 를 단정하지 않음",
           all(x.get("basisComplete") is None for x in legacy),
           f"{len(legacy)}건 중 단정된 행 존재")
        print(f"   (참고) 도입 전 발행분 {len(legacy)}건은 '확인 불가' 로 구분됨")

        # ── 4. 정책을 켜면 확정이 막힌다 (근거가 불완전할 때만) ──
        ok("정책 켜기", set_policy(True).ok)
        r = call("POST", "/cost/quotations", admin,
                 data={"businessType": "PRE_SALES", "currency": "KRW"})
        if pcr_unpriced > 0:
            ok("근거 불완전 시 확정 차단(409)", r.status == 409,
               f"status={r.status} body={r.text()[:160]}")
            ok("차단 사유에 미해결 코드가 보임", "단가 미해결" in r.text(), r.text()[:160])
            before = len(quotes())
            # 명시적 승인으로만 강행 가능
            r2 = call("POST", "/cost/quotations", admin, data={
                "businessType": "PRE_SALES", "currency": "KRW",
                "acknowledgeIncompleteBasis": True})
            ok("명시적 승인 시 확정 가능(201)", r2.status == 201,
               f"status={r2.status} body={r2.text()[:160]}")
            ok("강행한 사실이 응답에 남음", r2.json().get("acknowledged") is True,
               str(r2.json())[:160])
            ok("차단된 요청은 견적을 만들지 않았다", len(quotes()) == before + 1,
               f"{before} → {len(quotes())}")
        else:
            # 근거가 완전하면 정책이 켜져도 막히지 않아야 한다 (과잉 차단 없음)
            ok("근거 완전 시 정책이 켜져도 확정 허용", r.status == 201,
               f"status={r.status} body={r.text()[:160]}")

        # ── 5. 되돌리기 ──
        ok("정책 끄기", set_policy(False).ok)
        restored = True
        ok("정책 조회에 반영",
           call("GET", "/settings/approval-policy", admin)
           .json()["quoteBlockIncompleteBasis"] is False)
    finally:
        if not restored:
            set_policy(False)
            print("   (정리) 정책을 기본값으로 되돌림")

    req.dispose()

print(f"\nOK — 견적 근거 완전성 {n}개 검증 통과")
