# -*- coding: utf-8 -*-
"""견적 통화·세액 자동적재 — 다통화/세금엔진 → cst_quotation 연결.

API: 견적 확정 시 통화 환산·세액 적재(KRW·외화)·목록 breakdown·미등록 통화/세금 422.
정리: 생성 견적·환율·세금코드 삭제.
실행: PYTHONUTF8=1 py tests/live_quote_tax.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def near(a, b, tol=1.0):
    return abs(a - b) < tol


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    pcrs = req.get(f"{API}/cost/pcr").json()
    ok("PCR 존재(PRE_SALES)", any(p["businessType"] == "PRE_SALES" for p in pcrs))
    revenue = float(next(p for p in pcrs if p["businessType"] == "PRE_SALES")["sections"]["revenue"])

    # 세금코드 ZZVAT 10% · 환율 ZZC=1000
    req.post(f"{API}/finance/tax-codes", data={"code": "ZZVAT", "name": "테스트VAT", "ratePct": 10})
    req.post(f"{API}/finance/fx", data={"currency": "ZZC", "rate": 1000})

    created = []
    try:
        # KRW + 10% 세금
        r = req.post(f"{API}/cost/quotations", data={"businessType": "PRE_SALES", "currency": "KRW", "taxCode": "ZZVAT"}).json()
        created.append(r["quotationId"])
        ok("KRW 견적 — 공급가 = PCR 매출", near(r["subtotal"], revenue, 1))
        ok("세액 = 10%", near(r["tax"], round(revenue * 0.1, 2), 1) and r["taxPct"] == 10)
        ok("합계 = 공급가+세액", near(r["total"], r["subtotal"] + r["tax"], 1) and r["currency"] == "KRW")

        # 외화 ZZC(=1000 KRW) + 10%
        r2 = req.post(f"{API}/cost/quotations", data={"businessType": "PRE_SALES", "currency": "ZZC", "taxCode": "ZZVAT"}).json()
        created.append(r2["quotationId"])
        ok("외화 견적 — 통화 환산 공급가(매출/1000)", r2["currency"] == "ZZC" and near(r2["subtotal"], round(revenue / 1000, 2), 1))
        ok("외화 세액 10%", near(r2["tax"], round(r2["subtotal"] * 0.1, 2), 1))

        # 목록 breakdown
        lst = req.get(f"{API}/cost/quotations").json()
        q1 = next(q for q in lst if q["quotationId"] == created[0])
        ok("목록 세액 breakdown(vat 역산)", q1["taxCode"] == "ZZVAT" and near(q1["tax"], round(revenue * 0.1, 2), 2) and near(q1["subtotal"], revenue, 2))

        # 가드
        ok("미등록 통화 422", req.post(f"{API}/cost/quotations", data={"businessType": "PRE_SALES", "currency": "ZQX"}).status == 422)
        ok("미등록 세금 422", req.post(f"{API}/cost/quotations", data={"businessType": "PRE_SALES", "taxCode": "ZQTAX"}).status == 422)
    finally:
        for qid in created:
            req.delete(f"{API}/cost/quotations/{qid}")
        for f in req.get(f"{API}/finance/fx").json():
            if f["currency"] == "ZZC":
                req.delete(f"{API}/finance/fx/{f['fxId']}")
        for tt in req.get(f"{API}/finance/tax-codes").json():
            if tt["code"] == "ZZVAT":
                req.delete(f"{API}/finance/tax-codes/{tt['taxId']}")
    ok("정리 완료", all(req.delete(f"{API}/cost/quotations/{q}").status in (200, 404, 409) for q in created))

print(f"\nOK — live_quote_tax {n}/{n}")
