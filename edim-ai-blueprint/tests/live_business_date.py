# -*- coding: utf-8 -*-
"""업무 날짜 기준 일치 검증 (12.1).

PostgreSQL 컨테이너는 Etc/UTC 로, 백엔드 컨테이너도 UTC 로 떴다. 사용자·서버 OS 는 KST 이므로
**00:00~09:00 KST 사이에만** 시스템이 '어제' 로 동작했다 — 단가 유효개시일이 하루 앞당겨
저장되고, 단가 해석도 어제 기준으로 이뤄진다. 오류가 나지 않고 날짜만 조용히 밀리며,
하루 중 9시간만 재현되므로 평소 테스트로는 드러나지 않는다.

그래서 '서버가 생각하는 오늘' 과 '업무 시간대의 오늘' 이 일치하는지 상시 확인한다.
이 스위트가 실패하면 **지금 이 시각에 등록되는 날짜 데이터가 하루 밀리고 있다**는 뜻이다.

실행: PYTHONUTF8=1 py tests/live_business_date.py
"""
import datetime as _dt
import os
import zoneinfo

from playwright.sync_api import sync_playwright

BASE = os.getenv("EDIM_LIVE_BASE", "https://edim.seekerslab.com/api/v1")
TZ = zoneinfo.ZoneInfo(os.getenv("EDIM_TZ", "Asia/Seoul"))
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

    today = _dt.datetime.now(TZ).date().isoformat()
    hour = _dt.datetime.now(TZ).hour
    print(f"   (기준) 업무 시간대 오늘 = {today} · 현재 {hour}시 "
          f"{'← UTC 와 날짜가 갈리는 구간' if hour < 9 else ''}")

    CODE = "ZTZ-DATE-CHK"
    GROUP = "ZTZG"

    def prices_of(code: str):
        r = call("GET", "/prices", admin)
        if not r.ok:
            return []
        rows = r.json()
        rows = rows if isinstance(rows, list) else (rows.get("items") or [])
        return [x for x in rows if str(x.get("code") or "") == code]

    def cleanup(drop_code: bool = False):
        for x in prices_of(CODE):
            call("DELETE", f"/prices/{x.get('priceId') or x.get('id')}", admin)
        if drop_code:
            r = call("GET", "/codes/products", admin)
            rows = r.json() if r.ok else []
            rows = rows if isinstance(rows, list) else (rows.get("items") or [])
            for p in rows:
                if str(p.get("mainCode") or "") == CODE:
                    call("DELETE", f"/codes/products/{p.get('productCodeId') or p.get('id')}",
                         admin)

    cleanup(drop_code=True)

    # 단가는 실재 제품 코드에만 붙는다 — 다른 코드의 기존 기간과 겹치지 않도록 전용 코드를 쓴다
    g = call("POST", "/codes/groups", admin, data={
        "groupCode": GROUP, "groupName": "시간대검증그룹", "groupType": "SPECIFICATION"})
    ok("검증용 그룹 준비 (생성 201 또는 기존 409)", g.status in (201, 409), f"status={g.status}")
    c = call("POST", "/codes/products", admin, data={
        "mainCode": CODE, "codeName": "시간대 검증용", "groupCode": GROUP})
    ok("검증용 제품코드 준비", c.status in (201, 409), f"status={c.status} body={c.text()[:120]}")

    # ── 1. validFrom 을 생략하면 서버가 오늘로 채운다 — 그 '오늘' 이 업무 날짜여야 한다 ──
    r = call("POST", "/prices", admin, data={
        "code": CODE, "supplier": "시간대검증", "price": 1000, "source": "PURCHASE"})
    ok("단가 등록 (validFrom 생략)", r.status == 201,
       f"status={r.status} body={r.text()[:140]}")

    r = call("GET", "/prices", admin)
    ok("단가 목록 조회", r.ok, f"status={r.status}")
    rows = r.json()
    rows = rows if isinstance(rows, list) else (rows.get("items") or [])
    mine = [x for x in rows if str(x.get("code") or "") == CODE]
    ok("등록한 단가가 목록에 있음", bool(mine), f"{len(rows)}건")
    got = str(mine[0].get("validFrom") or mine[0].get("from") or "")
    ok("자동 채운 유효개시일이 업무 날짜와 일치", got == today,
       f"서버 {got} vs 업무 {today} — 이 시각에 등록되는 날짜가 하루 밀리고 있다")

    # ── 2. 오늘 시작하는 단가는 오늘 기준으로 해석돼야 한다 ──
    # (해석이 UTC CURRENT_DATE 를 쓰면 오늘 개시분을 아직 못 찾는다)
    r = call("GET", f"/prices/resolve?code={CODE}", admin)
    ok("단가 해석 호출", r.ok, f"status={r.status} body={r.text()[:140]}")
    res = r.json()
    ok("오늘 개시 단가가 해석됨", float(res.get("price") or 0) == 1000,
       f"{res} — 해석 기준일이 업무 날짜보다 이르면 오늘 개시분을 못 찾는다")

    # ── 3. 명시한 날짜는 그대로 저장돼야 한다 (자동 채움과 무관) ──
    cleanup()
    r = call("POST", "/prices", admin, data={
        "code": CODE, "supplier": "시간대검증2", "price": 2000,
        "source": "PURCHASE", "validFrom": "2030-01-01"})
    ok("명시 날짜로 등록", r.status == 201, f"status={r.status}")
    rows = call("GET", "/prices", admin).json()
    rows = rows if isinstance(rows, list) else (rows.get("items") or [])
    mine = [x for x in rows if str(x.get("code") or "") == CODE]
    got2 = str(mine[0].get("validFrom") or mine[0].get("from") or "")
    ok("명시한 날짜가 그대로 저장", got2 == "2030-01-01", got2)

    cleanup(drop_code=True)
    ok("정리 후 잔재 0", not prices_of(CODE), f"잔재 {len(prices_of(CODE))}")

    req.dispose()

print(f"\nOK — 업무 날짜 기준 {n}개 검증 통과")
