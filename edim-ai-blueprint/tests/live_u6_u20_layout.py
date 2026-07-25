# -*- coding: utf-8 -*-
"""U6 잔여(양식 자리표시자 배치 편집·영속) + U20 잔여(child 개별 도면 연결).

U6: Print Set-up 캔버스에서 자리표시자를 드래그 이동 → 저장 → 새로고침 후 유지 → 원복.
U20: child 코드별 연결 도면 조회 API 계약 + Relationship 화면 도면 링크/미연결 정직 표시.

실행: PYTHONUTF8=1 py tests/live_u6_u20_layout.py
정리: 저장한 배치는 기본 배치로 되돌려 저장 (tbx_ui_form 은 버전만 증가 — 설계상 정상).
"""
import json
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
FORM = "PRINT_FORM_LAYOUT"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def call(method: str, path: str, tok: str, data=None):
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

# ── U20 — child 도면 연결 API ──
prod = call("GET", "/codes/products", tok)
code_list = [p.get("code") or p.get("mainCode") for p in prod][:10]
code_list = [c for c in code_list if c]
ok("제품 코드 확보", len(code_list) >= 1)

r = call("GET", f"/codes/drawing-files?codes={urllib.parse.quote(','.join(code_list))}", tok)
ok("도면 연결 API 200", isinstance(r, dict) and "files" in r)
ok("요청 수 반영", r.get("requested") == len(set(code_list)))
ok("응답은 연결된 코드만 (미연결 키 없음)",
   all(k in code_list for k in r["files"]))
if r["files"]:
    one = next(iter(r["files"].values()))
    ok("연결 항목 계약(fileId·fileName)", "fileId" in one and str(one["fileName"]).lower().endswith(".dxf"))
else:
    ok("연결 도면 0건도 정상 응답", r["files"] == {})

ok("빈 요청 → 빈 맵", call("GET", "/codes/drawing-files?codes=", tok)["files"] == {})

# 상한 초과분을 조용히 버리지 않고 고지하는지 (9.79) — '조회 안 함' 이 '도면 없음' 으로 오표시되면 안 된다
many = ",".join(f"NOCODE-{i}" for i in range(60))
r_cap = call("GET", f"/codes/drawing-files?codes={urllib.parse.quote(many)}", tok)
ok("상한 초과 시 truncated 고지", r_cap.get("truncated") == 10)
ok("상한 내 요청은 truncated 0", r_cap.get("requested") == 50)

# ── U6 — 자리표시자 배치 영속 ──
try:
    before = call("GET", f"/toolbox/forms/{FORM}", tok)
    had_layout = True
except urllib.error.HTTPError as e:
    before, had_layout = None, False
    ok("미저장 시 404 (기본 배치 사용)", e.code == 404)

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

    # U20 UI — Relationship child 도면 링크
    page.goto(f"{BASE}/code/relationship", wait_until="networkidle")
    page.wait_for_timeout(1200)   # child 도면 맵 비동기 조회
    linked = page.locator("[data-child-dwg]").count()
    none_marked = page.locator("[data-child-dwg-none]").count()
    ok("child 도면 아이콘 렌더(연결/미연결 합)", linked + none_marked >= 1)

    # U6 UI — 드래그 이동 → 저장 → 새로고침 유지
    page.goto(f"{BASE}/cpq/print-setup", wait_until="networkidle")
    ok("자리표시자 박스 렌더", page.locator("[data-ps-box]").count() >= 4)
    box = page.locator("[data-ps-box]").nth(1)
    bb = box.bounding_box()
    assert bb, "FAIL 박스 좌표 없음"
    page.mouse.move(bb["x"] + 20, bb["y"] + 10)
    page.mouse.down()
    page.mouse.move(bb["x"] + 80, bb["y"] + 60, steps=8)
    page.mouse.up()
    page.wait_for_timeout(200)
    moved = box.bounding_box()
    ok("드래그로 위치 이동", moved is not None and abs(moved["x"] - bb["x"]) > 20)
    ok("저장 버튼 활성(미저장 표시)", page.locator("[data-ps-layout-save]").is_enabled())
    page.locator("[data-ps-layout-save]").click()
    page.wait_for_timeout(1500)

    saved = call("GET", f"/toolbox/forms/{FORM}", tok)
    ok("배치 서버 영속", isinstance(saved.get("layout"), list) and len(saved["layout"]) >= 4)

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(800)
    after = page.locator("[data-ps-box]").nth(1).bounding_box()
    ok("새로고침 후 배치 유지", after is not None and abs(after["x"] - moved["x"]) < 6)
    ok("JS 예외 0", not errs)

    # 원복 — 기본 배치로 되돌려 저장
    page.locator("[data-ps-layout-reset]").click()
    page.wait_for_timeout(200)
    page.locator("[data-ps-layout-save]").click()
    page.wait_for_timeout(1500)
    restored = page.locator("[data-ps-box]").nth(1).bounding_box()
    ok("기본 배치 원복", restored is not None and abs(restored["x"] - bb["x"]) < 6)
    b.close()

print(f"\nlive_u6_u20_layout: {n}/{n} PASS — 자리표시자 편집기·child 도면 연결")
