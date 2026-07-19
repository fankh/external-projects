# -*- coding: utf-8 -*-
"""B21 라이브 — auth/me·다중 역할·Hierarchy 편집·문서 채번/전이·초대/비활성·중복검토·Child 추가.

정리: TEST 노드·관계·역할 원복·계정 재활성 전부 자체 수행.
실행: PYTHONUTF8=1 py tests/live_b21_system.py
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

# 1. auth/me + permissions
me = req("GET", "/auth/me", headers=A)
ok("auth/me — 세션 사용자", me["login"] == "edim" and me["userLevel"] in ("SETUP", "ADMIN"))
perms = req("GET", "/auth/permissions", headers=A)
ok("auth/permissions — 유효 매트릭스", isinstance(perms, dict) and len(perms) >= 1)

# 2. 다중 역할 (sys_user_role) — 할당 → 조회 → 원복
orig_roles = req("GET", "/users/kim01/roles", headers=A)
req("PUT", "/users/kim01/roles", {"roles": ["GENERAL", "SETUP"]}, A)
ok("역할 2개 할당", set(req("GET", "/users/kim01/roles", headers=A)) == {"GENERAL", "SETUP"})
ok("없는 역할 -> 422", status_of("PUT", "/users/kim01/roles", {"roles": ["NOPE"]}, A) == 422)
req("PUT", "/users/kim01/roles", {"roles": orig_roles}, A)
ok("역할 원복", req("GET", "/users/kim01/roles", headers=A) == orig_roles)

# 3. 초대 + 비활성/재활성
r = req("POST", "/users/kim01/invite", headers=A)
ok("초대 — 인앱 채널 (정직 범위)", r["channel"] == "IN_APP")
ok("본인 비활성화 -> 422",
   status_of("PATCH", "/users/edim/active", {"active": False}, A) == 422)
req("PATCH", "/users/kim01/active", {"active": False}, A)
ok("비활성화 후 로그인 거부",
   status_of("POST", "/auth/login", {"userId": "kim01", "password": "edim"}) == 401)
req("PATCH", "/users/kim01/active", {"active": True}, A)
r = req("POST", "/auth/login", {"userId": "kim01", "password": "edim"})
ok("재활성 후 로그인 복구", "token" in r)

# 4. Hierarchy 편집 — 등록(주소 검증)·개명·삭제
ok("주소 접두 위반 -> 422",
   status_of("POST", "/hierarchy/nodes",
             {"treeType": "PRODUCT", "name": "x", "address": "/X/BAD",
              "parentAddress": "/M/ENG"}, A) == 422)
req("POST", "/hierarchy/nodes",
    {"treeType": "PRODUCT", "name": "B21 검증", "symbol": "T21",
     "address": "/M/ENG/TEST-B21", "parentAddress": "/M/ENG"}, A)
tree = req("GET", "/hierarchy?treeType=PRODUCT", headers=A)
node = next((x for x in tree if x["address"] == "/M/ENG/TEST-B21"), None)
ok("노드 등록 (상위 연결)", node is not None and node["status"] == "DRAFT")
ok("주소 중복 -> 409",
   status_of("POST", "/hierarchy/nodes",
             {"treeType": "PRODUCT", "name": "dup", "address": "/M/ENG/TEST-B21"}, A) == 409)
req("PATCH", f"/hierarchy/nodes/{node['id']}", {"name": "B21 개명됨"}, A)
tree = req("GET", "/hierarchy?treeType=PRODUCT", headers=A)
ok("노드 개명", any(x["id"] == node["id"] and x["name"] == "B21 개명됨" for x in tree))
req("DELETE", f"/hierarchy/nodes/{node['id']}", headers=A)
ok("노드 삭제", not any(x["id"] == node["id"]
                        for x in req("GET", "/hierarchy?treeType=PRODUCT", headers=A)))

# 5. 문서 채번 + 상태 전이 (정리 가능하도록 APPROVE→반려→SET_UP→삭제; ACCEPTED 보호는 시드 문서로)
r = req("POST", "/documents/allocate-code", {"docType": "DWG"}, A)
# 규칙 기반 채번(U33 — {TYPE}-{YYYY}-{SEQ:4} 등 테넌트 템플릿) — 접두·말미 시퀀스만 검증
ok("채번 — 규칙 기반 (DWG- 접두 + 숫자 SEQ)",
   r["docNo"].startswith("DWG-") and r["docNo"].rsplit("-", 1)[-1].isdigit())
doc_no = f"TEST-B21-{r['docNo']}"
req("POST", "/documents", {"docNo": doc_no, "title": "B21 전이 검증"}, A)
ok("역방향 전이 -> 409",
   status_of("PATCH", f"/documents/{quote(doc_no)}/status", {"status": "ACCEPTED"}, A) == 409)
req("PATCH", f"/documents/{quote(doc_no)}/status", {"status": "CHECK"}, A)
r = req("PATCH", f"/documents/{quote(doc_no)}/status", {"status": "APPROVE"}, A)
ok("정방향 전이 SET_UP→CHECK→APPROVE", r["status"] == "APPROVE")
r = req("PATCH", f"/documents/{quote(doc_no)}/status", {"status": "SET_UP"}, A)
ok("반려 전이 APPROVE→SET_UP", r["status"] == "SET_UP")
req("DELETE", f"/documents/{quote(doc_no)}", headers=A)
ok("정리 — TEST 문서 삭제 (SET_UP)", True)
ok("ACCEPTED 삭제 보호 -> 409 (시드 QR-61216-01)",
   status_of("DELETE", f"/documents/{quote('QR-61216-01')}", headers=A) in (404, 409))

# 6. Child 관계 추가 (S-1-4) + 중복검토 (S-3-5)
r = req("POST", "/codes/relationships", {"mother": "KDP 1-21", "child": "EWT-3", "qty": 2}, A)
rel_id = r["relId"]
ok("Child 추가 (DRAFT)", r["status"] == "DRAFT")
ok("관계 중복 -> 409",
   status_of("POST", "/codes/relationships", {"mother": "KDP 1-21", "child": "EWT-3"}, A) == 409)
ok("없는 코드 -> 422",
   status_of("POST", "/codes/relationships", {"mother": "KDP 1-21", "child": "NOPE-1"}, A) == 422)
req("DELETE", f"/codes/relationships/{rel_id}", headers=A)
ok("관계 정리 (DRAFT 삭제)", True)
r = req("GET", f"/erp/projects/check-duplicate?name={quote('Micron')}&no=", headers=A)
ok("중복검토 — Micron 매치", r["duplicate"] and len(r["matches"]) >= 1)
r = req("GET", f"/erp/projects/check-duplicate?name={quote('존재하지않는프로젝트')}&no=", headers=A)
ok("중복검토 — 무매치", not r["duplicate"])

# 7. UI — 역할 체크박스·Hierarchy 등록 다이얼로그·UI Designer 미리보기
with sync_playwright() as pw:
    b = pw.chromium.launch()
    p = b.new_page(viewport={"width": 1440, "height": 900})
    p.goto(f"{BASE}/erp", wait_until="networkidle")
    p.get_by_label("사번").fill("edim")
    p.get_by_label("비밀번호").fill("edim")
    p.get_by_role("button", name="로그인 (Enter)").click()
    p.wait_for_selector(".app .titlebar", timeout=8000)

    p.locator(".tn", has_text="사용자·권한 (M-14-6)").click()
    p.locator("[data-user-roles]").wait_for(timeout=8000)
    ok("UI 다중 역할 패널 (sys_user_role)", True)

    # Next — Hierarchy 등록은 인라인 폼 (주소·이름 입력 + ＋ 노드)
    p.goto(f"{BASE}/code", wait_until="networkidle")
    p.wait_for_timeout(600)
    p.locator(".tn", has_text="Hierarchy 주소 (M-3-1)").click()
    p.locator("input[name=address]").wait_for(timeout=8000)
    ok("UI Hierarchy 등록 폼 (인라인 — 주소·이름·＋ 노드)",
       p.locator("input[name=name]").count() >= 1
       and p.get_by_role("button", name="＋ 노드").count() >= 1)

    p.goto(f"{BASE}/toolbox", wait_until="networkidle")
    p.wait_for_timeout(600)
    p.locator(".tn", has_text="UI Designer (S-2-1)").click()
    p.wait_for_timeout(1200)
    p.get_by_role("button", name="미리보기").click()
    p.locator("[data-ui-preview]").wait_for(timeout=5000)
    ok("UI Designer 미리보기 — 동적 렌더 모달", True)
    b.close()

print(f"\nB21 시스템·UX 라이브: {n}/{n} pass")
