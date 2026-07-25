# -*- coding: utf-8 -*-
"""U17 잔여 — 설계 오류조건 위반 판정·경고 연동 (슬라이드 44).

error_check 식(설계자가 기입한 **오류 조건**)을 현재 치수값으로 평가해
위반/미평가를 구분한다. 식이 참이면 위반(정상 범위가 아니라 오류 조건이므로).

검증: API 판정 4형태(자기값·타참조·비교대상 참조·구문오류/값미정) + UI 경고(배너·행 하이라이트).
실행: PYTHONUTF8=1 py tests/live_u17_error_check.py
정리: 시험용 error_check 는 원복 (저장 → 판정 → 원복).
"""
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
DRAWING = "KDCR 3-13"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method: str, path: str, tok: str, data=None):
    r = urllib.request.Request(
        API + path, method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.load(resp)


_login = urllib.request.Request(
    API + "/auth/login", data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"})
with urllib.request.urlopen(_login, timeout=30) as r:
    tok = json.load(r)["token"]

# 원본 보존 (자체 정리 원칙)
orig = req("GET", f"/drawings/dimensions/design-params?drawing={DRAWING.replace(' ', '%20')}", tok)
ok("설계 파라미터 조회", len(orig) >= 1)
vals = {d["no"]: d for d in orig}


def save(items: list[dict]) -> None:
    payload = {"drawing": DRAWING, "items": [
        {"no": d["no"], "designPriority": d.get("designPriority"), "dataPriority": d.get("dataPriority"),
         "basePoint": d.get("basePoint", ""), "errorCheck": d.get("errorCheck", ""),
         "remarks": d.get("remarks", "")} for d in items]}
    req("PUT", "/drawings/dimensions/design-params", tok, payload)


def check() -> dict:
    return req("GET", f"/drawings/dimensions/error-check?drawing={DRAWING.replace(' ', '%20')}", tok)


try:
    # 값이 있는 치수(A=670 등)와 값이 없는 치수를 각각 확보
    with_val = [d["no"] for d in orig if d["no"] in ("A", "C", "E")]
    ok("값 보유 치수 확보", len(with_val) >= 2)
    a, c = with_val[0], with_val[1]

    # ① 자기 값 조건 — 위반(참)
    save([{**vals[a], "errorCheck": "> 1"}])
    r = check()
    ok("자기값 조건 위반 검출", any(v["no"] == a for v in r["violations"]))
    ok("ok=False (위반 존재)", r["ok"] is False)

    # ② 자기 값 조건 — 비위반(거짓)
    save([{**vals[a], "errorCheck": "> 999999"}])
    r = check()
    ok("비위반 시 violations 제외", not any(v["no"] == a for v in r["violations"]))
    ok("ok=True (위반 없음)", r["ok"] is True)

    # ③ 타 치수 참조 비교
    save([{**vals[a], "errorCheck": f"{c} < {a}"}])
    r = check()
    hit = next((v for v in r["violations"] if v["no"] == a), None)
    ok("타 치수 참조 비교 판정", hit is not None)
    ok("판정 근거(detail) 숫자 병기", hit is not None and any(ch.isdigit() for ch in hit["detail"]))

    # ④ 구문 오류·값 미정 → 미평가 (경고 아님 — 정직 구분)
    save([{**vals[a], "errorCheck": "이건 조건식이 아님"}])
    r = check()
    ok("구문 오류 → unevaluated", any(u["no"] == a for u in r["unevaluated"]))
    ok("구문 오류는 violations 아님", not any(v["no"] == a for v in r["violations"]))

    save([{**vals[a], "errorCheck": "ZZ > 1"}])
    r = check()
    ok("미정 참조 → unevaluated", any(u["no"] == a and "미정" in u["detail"] for u in r["unevaluated"]))

    # ⑤ UI — 점검 버튼 → 위반 배너·행 하이라이트
    save([{**vals[a], "errorCheck": "> 1"}])
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page()
        errs: list[str] = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"{BASE}/login")
        page.fill("input[name=userId]", "edim")
        page.fill("input[name=password]", "edim")
        page.click("button[type=submit]")
        page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        page.goto(f"{BASE}/plm/work-process", wait_until="networkidle")
        ok("점검 버튼 렌더", page.locator("[data-dp-check]").count() >= 1)
        page.locator("[data-dp-check]").first.click()
        page.wait_for_selector("[data-dp-check-result]", timeout=30000)
        ok("점검 결과 배너 표시", page.locator("[data-dp-check-result]").count() == 1)
        ok("위반 항목 렌더", page.locator("[data-dp-violation]").count() >= 1)
        ok("위반 행 하이라이트", page.locator("[data-dp-row-violation]").count() >= 1)
        ok("JS 예외 0", not errs)
        b.close()
finally:
    save(orig)   # 원복
    r = check()
    restored = req("GET", f"/drawings/dimensions/design-params?drawing={DRAWING.replace(' ', '%20')}", tok)
    same = {d["no"]: d.get("errorCheck", "") for d in restored} == {d["no"]: d.get("errorCheck", "") for d in orig}
    print(f"{'PASS' if same else 'FAIL'} 시험 조건 원복")
    assert same, "FAIL 원복"
    n += 1

print(f"\nlive_u17_error_check: {n}/{n} PASS — 오류조건 판정·경고 연동")
