# -*- coding: utf-8 -*-
"""G3 라이브 — 다통화/환율 + 세금엔진.

API: 환율 CRUD(KRW 기준·KRW 등록 422)·세금코드 CRUD(중복 409·세율 422)·세금엔진(통화→세액·합계+KRW 환산·미등록 통화 422).
정리: 생성 환율·세금코드 삭제.
실행: PYTHONUTF8=1 py tests/live_g3_finance.py
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


with sync_playwright() as pw:
    anon = pw.request.new_context()
    tok = anon.post(f"{API}/auth/login", data={"userId": "edim", "password": "edim"}).json()["token"]
    req = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {tok}"})

    def clean():
        for f in req.get(f"{API}/finance/fx").json():
            if f["currency"] in ("ZZT",):
                req.delete(f"{API}/finance/fx/{f['fxId']}")
        for t in req.get(f"{API}/finance/tax-codes").json():
            if t["code"] == "ZZTAX":
                req.delete(f"{API}/finance/tax-codes/{t['taxId']}")

    clean()
    try:
        # 기준통화 KRW 항상 포함
        base = req.get(f"{API}/finance/fx").json()
        ok("환율 목록 — KRW 기준통화 포함", any(f["currency"] == "KRW" and f["rate"] == 1.0 for f in base))
        ok("KRW 등록 = 422(기준통화)", req.post(f"{API}/finance/fx", data={"currency": "KRW", "rate": 2}).status == 422)

        # 테스트 통화 ZZT = 1000 KRW
        ok("환율 등록 201", req.post(f"{API}/finance/fx", data={"currency": "ZZT", "rate": 1000}).status == 201)
        ok("환율 목록에 ZZT", any(f["currency"] == "ZZT" and f["rate"] == 1000.0 for f in req.get(f"{API}/finance/fx").json()))

        # 세금코드 ZZTAX 10%
        ok("세금코드 등록 201", req.post(f"{API}/finance/tax-codes", data={"code": "ZZTAX", "name": "테스트세", "ratePct": 10}).status == 201)
        ok("세금코드 중복 409", req.post(f"{API}/finance/tax-codes", data={"code": "ZZTAX", "name": "x", "ratePct": 5}).status == 409)
        ok("세율 범위 초과 422", req.post(f"{API}/finance/tax-codes", data={"code": "ZZBAD", "name": "x", "ratePct": 150}).status == 422)

        # 세금엔진 — ZZT 10000 + 10% → 세액 1000·합계 11000·KRW 11,000,000
        r = req.post(f"{API}/finance/quote-calc", data={"currency": "ZZT", "amount": 10000, "taxCode": "ZZTAX"}).json()
        ok("세액 = 10%(1000)", abs(r["taxAmount"] - 1000) < 0.01)
        ok("합계 = 11000", abs(r["total"] - 11000) < 0.01)
        ok("환율 1000 반영 — KRW 합계 11,000,000", abs(r["baseTotal"] - 11_000_000) < 0.01 and r["baseCurrency"] == "KRW")

        # KRW 무세금 — 그대로
        rk = req.post(f"{API}/finance/quote-calc", data={"currency": "KRW", "amount": 5000, "taxCode": ""}).json()
        ok("KRW 무세금 = 원금·rate 1", abs(rk["total"] - 5000) < 0.01 and rk["rate"] == 1.0 and abs(rk["baseTotal"] - 5000) < 0.01)

        # 미등록 통화 422
        ok("미등록 통화 = 422", req.post(f"{API}/finance/quote-calc", data={"currency": "ZQX", "amount": 1, "taxCode": ""}).status == 422)
    finally:
        clean()
    ok("정리 — 테스트 환율·세금코드 제거",
       not any(f["currency"] == "ZZT" for f in req.get(f"{API}/finance/fx").json())
       and not any(t["code"] == "ZZTAX" for t in req.get(f"{API}/finance/tax-codes").json()))

print(f"\nOK — live_g3_finance {n}/{n}")
