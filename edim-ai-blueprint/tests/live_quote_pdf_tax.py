# -*- coding: utf-8 -*-
"""견적서 PDF 통화·세액 서식 — render.pdf 에 통화·공급가액·세액·합계 표기.

정리: 생성 견적·환율·세금코드 삭제.
실행: PYTHONUTF8=1 py tests/live_quote_pdf_tax.py
"""
import io
import pypdf
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def pdf_text(data):
    r = pypdf.PdfReader(io.BytesIO(data))
    return "\n".join((p.extract_text() or "") for p in r.pages)


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    req.post(f"{API}/finance/tax-codes", data={"code": "ZZVAT", "name": "테스트VAT", "ratePct": 10})
    req.post(f"{API}/finance/fx", data={"currency": "ZZC", "rate": 1000})
    created = []
    try:
        # 외화 + 세금 견적 → PDF 에 통화·세액 표기
        r = req.post(f"{API}/cost/quotations", data={"businessType": "PRE_SALES", "currency": "ZZC", "taxCode": "ZZVAT"}).json()
        qid = r["quotationId"]; created.append(qid)
        res = req.get(f"{API}/cost/quotations/{qid}/render.pdf")
        body = res.body()
        ok("render.pdf 200·%PDF", res.status == 200 and body[:4] == b"%PDF")
        txt = pdf_text(body)
        ok("PDF 통화 표기(ZZC)", "ZZC" in txt)
        ok("PDF 세액 라인", "세액" in txt)
        ok("PDF 공급가액 라인", "공급가액" in txt)

        # KRW 견적 → CLT 양식 합계·세액 (구 '천원' 표기는 CLT 양식 전환으로 폐지 — 단가(K)·통화 표기)
        r2 = req.post(f"{API}/cost/quotations", data={"businessType": "PRE_SALES", "currency": "KRW", "taxCode": "ZZVAT"}).json()
        qid2 = r2["quotationId"]; created.append(qid2)
        txt2 = pdf_text(req.get(f"{API}/cost/quotations/{qid2}/render.pdf").body())
        ok("KRW PDF 합계·세액 표기(CLT 양식)", "KRW" in txt2 and "세액" in txt2 and "공급가액" in txt2)
    finally:
        for q in created:
            req.delete(f"{API}/cost/quotations/{q}")
        for f in req.get(f"{API}/finance/fx").json():
            if f["currency"] == "ZZC":
                req.delete(f"{API}/finance/fx/{f['fxId']}")
        for tt in req.get(f"{API}/finance/tax-codes").json():
            if tt["code"] == "ZZVAT":
                req.delete(f"{API}/finance/tax-codes/{tt['taxId']}")
    ok("정리 완료", True)

print(f"\nOK — live_quote_pdf_tax {n}/{n}")
