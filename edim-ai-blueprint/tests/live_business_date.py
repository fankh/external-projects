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

    # ── 1. 서버가 생각하는 '오늘' 이 업무 날짜와 같은가 (읽기 전용 진단) ──
    # 단가를 만들어 확인하면 잔재가 남는다 — 단가는 이력 자산이라 **삭제 경로가 없고**
    # 마감(validTo)만 가능하다. 그래서 진단 신호로 확인한다.
    r = call("GET", "/system/status", admin)
    ok("운영 상태 조회", r.ok, f"status={r.status} body={r.text()[:120]}")
    st = r.json()
    ok("businessDate 진단 제공", "businessDate" in st, str(st)[:200])
    bd = st["businessDate"]
    for key in ("db", "app", "aligned", "dbTimeZone", "appTimeZone"):
        ok(f"진단에 {key} 포함", key in bd, str(bd))

    ok("DB 세션의 오늘이 업무 날짜와 일치", bd["db"] == today,
       f"DB {bd['db']}(tz {bd['dbTimeZone']}) vs 업무 {today} — "
       f"이 시각에 등록되는 날짜가 하루 밀린다")
    ok("앱의 오늘이 업무 날짜와 일치", bd["app"] == today,
       f"앱 {bd['app']}(tz {bd['appTimeZone']}) vs 업무 {today}")
    ok("DB 와 앱의 오늘이 서로 일치", bd["aligned"] is True,
       f"DB {bd['db']} vs 앱 {bd['app']} — 같은 동작이 경로마다 다른 날짜가 된다")
    ok("aligned 가 실제 비교 결과와 모순되지 않음",
       bd["aligned"] == (bd["db"] == bd["app"]), str(bd))

    # ── 2. 날짜 기준이 실제 조회에도 반영되는가 (기존 데이터, 쓰기 없음) ──
    r = call("GET", "/prices", admin)
    ok("단가 대장 조회", r.ok, f"status={r.status}")
    rows = r.json()
    rows = rows if isinstance(rows, list) else (rows.get("items") or [])
    ok("대장이 데모 코드 3종에 갇혀 있지 않음",
       len({str(x.get("code")) for x in rows}) > 3 or len(rows) == 0,
       f"코드 {sorted({str(x.get('code')) for x in rows})} — "
       f"하드코딩 필터가 남아 있으면 고객 코드가 대장에서 사라진다")

    # active 판정은 오늘 기준이다 — 오늘이 밀리면 유효한 단가가 비활성으로 보인다
    bad = [x for x in rows
           if x.get("active") is True and str(x.get("from") or "") > today]
    ok("미래 개시분이 활성으로 표시되지 않음", not bad,
       f"{[x.get('code') for x in bad][:3]}")

    req.dispose()

print(f"\nOK — 업무 날짜 기준 {n}개 검증 통과")
