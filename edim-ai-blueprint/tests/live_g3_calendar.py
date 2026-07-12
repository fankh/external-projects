# -*- coding: utf-8 -*-
"""G3 라이브 — 근무일/휴일 캘린더.

API: 공휴일 CRUD(중복 409)·영업일 수(주말·공휴일 제외)·N영업일 후 납기·마일스톤 workdaysLeft.
기준일: 2026-08-03(월)·08-05(수)·08-07(금)·08-10(월)·08-11(화).
정리: 테스트 공휴일 삭제.
실행: PYTHONUTF8=1 py tests/live_g3_calendar.py
"""
from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
HD = "2026-08-05"
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

    def workdays(a, b):
        return req.get(f"{API}/calendar/workdays?start={a}&end={b}").json()["workdays"]

    def clean():
        for h in req.get(f"{API}/calendar/holidays").json():
            if h["date"] == HD:
                req.delete(f"{API}/calendar/holidays/{h['holidayId']}")

    clean()
    try:
        # 공휴일 없이: 월→금 = 화수목금 = 4영업일
        ok("영업일(월→금, 공휴일 없음) = 4", workdays("2026-08-03", "2026-08-07") == 4)

        r = req.post(f"{API}/calendar/holidays", data={"date": HD, "name": "테스트휴일"})
        ok("공휴일 등록 201", r.status == 201)
        ok("중복 등록 409", req.post(f"{API}/calendar/holidays", data={"date": HD, "name": "x"}).status == 409)

        # 08-05(수) 공휴일 → 월→금 = 3영업일
        ok("영업일(공휴일 1일 제외) = 3", workdays("2026-08-03", "2026-08-07") == 3)

        # N영업일 후 납기 — 08-03 + 5영업일 (08-05 공휴일 skip) = 08-11(화)
        due = req.get(f"{API}/calendar/due?start=2026-08-03&days=5").json()["due"]
        ok("5영업일 후 납기 = 2026-08-11(공휴일 반영)", due == "2026-08-11")

        # 잘못된 날짜 422
        ok("잘못된 날짜 422", req.get(f"{API}/calendar/due?start=notadate&days=3").status == 422)

        # 목록에 등록 건 존재
        ok("공휴일 목록 포함", any(h["date"] == HD for h in req.get(f"{API}/calendar/holidays").json()))

        # 마일스톤 workdaysLeft 필드 노출
        ms = req.get(f"{API}/erp/milestones").json()
        ok("마일스톤 workdaysLeft 필드", isinstance(ms, list) and (not ms or "workdaysLeft" in ms[0]))
    finally:
        clean()
    ok("정리 — 공휴일 제거·영업일 원복", workdays("2026-08-03", "2026-08-07") == 4)

print(f"\nOK — live_g3_calendar {n}/{n}")
