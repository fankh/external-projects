# -*- coding: utf-8 -*-
"""B20 라이브 — Macro 4-Way 영속·CODING 모드·tbx_macro_ref 역참조·함수 검색 (TBX-014).

API: 4-Way 저장/복원 → 참조 자동 추출 → 영향도 → CODING 검증 → 함수 자연어 검색.
UI: Studio 4-Way 복원 칩·참조 칩·기능 찾기 검색·CODING 모드 게이트.
실행: PYTHONUTF8=1 py tests/live_b20_macro.py
정리: TEST 매크로 원복 불요 (전용 이름 사용 후 상태만 확인 — tbx_macro 는 upsert, 삭제 API 없음
      → TEST-B20 매크로는 시드와 무관한 전용 행으로 남지 않도록 기존 'Shaft 길이 계산' 스냅샷 원복).
"""
import json
import urllib.error
import urllib.request
from urllib.parse import quote

from playwright.sync_api import sync_playwright

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label: str, cond: bool) -> None:
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method: str, path: str, data=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(API + path, data=body, method=method, headers=h)
    with urllib.request.urlopen(r) as res:
        return json.loads(res.read())


def status_of(method: str, path: str, data=None, headers=None) -> int:
    try:
        req(method, path, data, headers)
        return 200
    except urllib.error.HTTPError as e:
        return e.code


tok = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})["token"]
A = {"Authorization": f"Bearer {tok}"}
NAME = quote("Shaft 길이 계산")

# 0. 스냅샷 — 스위트 종료 시 원복 (finally 로 크래시에도 보장)
before = next(m for m in req("GET", "/macros", headers=A) if m["name"] == "Shaft 길이 계산")


def restore_snapshot() -> None:
    req("PUT", f"/macros/{NAME}", {
        "expr": before["expr"], "prompt": before["prompt"],
        "codeText": before["codeText"], "descriptionText": before["description"],
        "flowchartDef": before["flowchartDef"], "applyType": before["applyType"],
        "testInput": before["testInput"], "testResult": before["testResult"],
    }, A)


# 크래시 포함 어떤 종료 경로에서도 원복 (이후 실행의 시드 전제 보존)
import atexit  # noqa: E402
atexit.register(restore_snapshot)

# 1. 시드 v17 — 4-Way 필드·CODING 매크로·참조
ok("시드 4-Way (code·flowchart·desc)", bool(before["codeText"])
   and before["flowchartDef"] and len(before["flowchartDef"]["nodes"]) == 4
   and bool(before["description"]))
ok("시드 test_input/result 영속", before["testInput"] == {"MC": 520, "FES": 15}
   and before["testResult"]["value"] == 2685)
coding = next((m for m in req("GET", "/macros", headers=A) if m["applyType"] == "CODING"), None)
ok("CODING 모드 매크로 (중량 추정)", coding is not None and "weight_estimate" in coding["codeText"])
refs = req("GET", f"/macros/{quote('DIM D (KDCR 3-13)')}/refs", headers=A)
ok("시드 참조 — DIM D → Table12", any(r["target"] == "Table12" for r in refs))
impact = req("GET", f"/tables/{quote('Table12')}/impact", headers=A)
ok("영향도 — Table12 참조 매크로 ≥2", len(impact) >= 2)

# 2. 4-Way 저장 → 참조 자동 재구성 → 복원 확인
r = req("PUT", f"/macros/{NAME}", {
    "expr": before["expr"], "prompt": before["prompt"],
    "codeText": before["codeText"] + "\n# b20-roundtrip",
    "descriptionText": "B20 왕복 검증 설명",
    "flowchartDef": {"nodes": before["flowchartDef"]["nodes"][:2], "edges": []},
    "applyType": "MACRO",
    "testInput": {"MC": 600, "FES": 20}, "testResult": {"value": 999, "ok": True},
}, A)
ok("4-Way 저장 (버전 증가·참조 재구성)", r["version"] > before["version"] and r["refs"] >= 1)
after = next(m for m in req("GET", "/macros", headers=A) if m["name"] == "Shaft 길이 계산")
ok("저장 후 복원 — 코드·설명·플로차트·Test", "b20-roundtrip" in after["codeText"]
   and after["description"] == "B20 왕복 검증 설명"
   and len(after["flowchartDef"]["nodes"]) == 2
   and after["testInput"]["MC"] == 600)
mrefs = req("GET", f"/macros/{NAME}/refs", headers=A)
ok("수식 참조 자동 추출 (Table12)", any(x["target"] == "Table12" for x in mrefs))

# 3. CODING 검증 — 코드 필수 422 · applyType 오류 422
ok("CODING 코드 없이 -> 422",
   status_of("PUT", "/macros/TEST-B20-CODING", {"applyType": "CODING", "codeText": ""}, A) == 422)
ok("applyType 오류 -> 422",
   status_of("PUT", "/macros/TEST-B20-X", {"expr": "=1", "applyType": "NOPE"}, A) == 422)

# 4. 함수 자연어 검색 (TBX-014)
fns = req("GET", f"/macros/functions?q={quote('반올림')}", headers=A)
ok("검색 '반올림' → PreC", any(f["name"] == "PREC" for f in fns))
fns = req("GET", f"/macros/functions?q={quote('합계')}", headers=A)
ok("검색 '합계' → SUM", any(f["name"] == "SUM" for f in fns))
fns = req("GET", "/macros/functions", headers=A)
ok("전체 카탈로그 ≥10", len(fns) >= 10)

# 5. UI — Studio 4-Way 복원·참조 칩·기능 찾기
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/toolbox", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)
    p.locator(".tn", has_text="Macro Studio (S-2-2)").click()
    p.locator(".st", has_text="flowchart_def").wait_for(timeout=10000)
    ok("UI 4-Way 복원 칩 (flowchart_def·code_text)", True)
    p.locator("[data-macro-refs] .st", has_text="TABLE:Table12").wait_for(timeout=8000)
    ok("UI 참조 칩 — TABLE:Table12", True)
    p.get_by_label("기능 찾기").fill("합계")
    p.locator("[data-fn-results]", has_text="SUM").wait_for(timeout=8000)
    ok("UI 기능 찾기 — '합계' → SUM", True)
    b.close()

# 6. 원복 — 스냅샷으로 되돌림 (atexit 로도 보장되지만 명시 검증)
restore_snapshot()
restored = next(m for m in req("GET", "/macros", headers=A) if m["name"] == "Shaft 길이 계산")
ok("원복 — 스냅샷 복원 (b20 흔적 제거)", "b20-roundtrip" not in restored["codeText"]
   and len(restored["flowchartDef"]["nodes"]) == 4)

print(f"\nB20 Toolbox 심화 라이브: {n}/{n} pass")
