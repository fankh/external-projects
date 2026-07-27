# -*- coding: utf-8 -*-
"""Product Relationship 슬롯 매핑 라이브 (4.6) — 요구 #29 "Mother 선택조건 → Child 전개 기준".

배경: code_relationship_slot_map 은 BOM 전개가 Child 슬롯을 채우는 유일한 근거인데
종전엔 시드로만 존재하고 쓰기 경로가 없었다 → 사용자가 만든 관계는 슬롯이 빈 채 전개됐다.

검증: 조회(선택 가능한 Slot 목록) → XOR 규칙 422 → 미실재 Slot 422 → 중복 409 →
     추가 후 전개 반영 → Revision 상승(#40 근거 이동) → 삭제.
정리: 추가한 매핑 삭제 (Revision 은 이력이라 보존).
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
MOTHER = "KDCR 3-13"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    from urllib.parse import quote
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


TOK = login("edim", "edim")
added = []

try:
    st, children = req("GET", f"/codes/relationships/{MOTHER}/children", TOK)
    ok(f"Mother 자식 관계 조회 ({len(children)})", st == 200 and children)
    ok("relId·매핑 수 노출", all("relId" in c and "slotMapCount" in c for c in children))

    # 매핑이 아직 없는 관계를 고른다 (있으면 첫 관계 사용)
    target = next((c for c in children if c["slotMapCount"] == 0), children[0])
    rel = target["relId"]
    st, view = req("GET", f"/codes/relationships/{rel}/slot-map", TOK)
    ok(f"매핑 조회 200 — {view['mother']} → {view['child']}", st == 200)
    ok(f"선택 가능한 Slot 목록 제공 (Mother {len(view['motherSlots'])}·Child {len(view['childSlots'])})",
       isinstance(view["motherSlots"], list) and isinstance(view["childSlots"], list))
    before_rev = int(psql(f"SELECT revision_no FROM code_relationship WHERE rel_id={rel}"))

    # ── XOR 규칙 ──
    cs = view["childSlots"][0] if view["childSlots"] else None
    ms = view["motherSlots"][0] if view["motherSlots"] else None
    if not cs:
        print("SKIP — Child 그룹에 Slot 이 없어 매핑 검증 불가")
    else:
        st, b = req("POST", f"/codes/relationships/{rel}/slot-map", TOK,
                    {"childSlot": cs, "motherSlot": ms or "A", "fixedValue": "X"})
        ok(f"계승·고정값 동시 지정 422 ({st})", st == 422 and "하나만" in (b or {}).get("detail", ""))
        st, b = req("POST", f"/codes/relationships/{rel}/slot-map", TOK,
                    {"childSlot": cs})
        ok(f"둘 다 미지정 422 ({st})", st == 422)
        st, b = req("POST", f"/codes/relationships/{rel}/slot-map", TOK,
                    {"childSlot": "ZZ", "fixedValue": "1"})
        ok(f"Child 그룹에 없는 Slot 422 ({st})", st == 422 and "없는 Slot" in (b or {}).get("detail", ""))
        if ms:
            st, b = req("POST", f"/codes/relationships/{rel}/slot-map", TOK,
                        {"childSlot": cs, "motherSlot": "ZZ"})
            ok(f"Mother 그룹에 없는 Slot 422 ({st})", st == 422)

        # ── 추가 ──
        st, m1 = req("POST", f"/codes/relationships/{rel}/slot-map", TOK,
                     {"childSlot": cs, "fixedValue": "ZTEST"})
        ok(f"고정값 매핑 추가 201 ({st})", st == 201)
        added.append((rel, m1["slotMapId"]))
        st, b = req("POST", f"/codes/relationships/{rel}/slot-map", TOK,
                    {"childSlot": cs, "fixedValue": "OTHER"})
        ok(f"같은 Child Slot 중복 409 ({st})", st == 409)

        st, view2 = req("GET", f"/codes/relationships/{rel}/slot-map", TOK)
        ok("매핑 목록에 반영", any(m["childSlot"] == cs and m["fixedValue"] == "ZTEST"
                              for m in view2["maps"]))
        after_rev = int(psql(f"SELECT revision_no FROM code_relationship WHERE rel_id={rel}"))
        ok(f"★ 매핑 변경이 관계 Revision 을 올림 ({before_rev} → {after_rev}) — #40 근거 이동",
           after_rev == before_rev + 1)

        # ── 19.7: 승인 이후 근거가 바뀌면 그 사실이 드러나야 한다 (#35) ──
        # 승인된 관계는 삭제는 막히는데(DRAFT 한정) 매핑은 자유롭게 바뀐다. 그런데 화면에는
        # APPROVED 만 보이므로 "승인된 그 내용이 지금 돌아간다" 고 읽힌다. Revision 은 올라도
        # '승인 당시 값' 이 없어 대조할 수 없었다 — 승인 시점 지문을 남겨 비교한다.
        st, ch2 = req("GET", f"/codes/relationships/{MOTHER}/children", TOK)
        row2 = next((c for c in ch2 if c["relId"] == rel), None)
        ok("자식 목록에 basisDrift 노출", row2 is not None and "basisDrift" in row2)
        ok(f"★ 승인 이후 매핑 변경이 드리프트로 드러난다 ({row2['basisDrift']})",
           row2["basisDrift"] is True)

        # 전개에 실제로 반영되는지 (해당 Child 의 resolvedCode 에 고정값이 들어간다)
        st, exp = req("POST", "/codes/products/expand", TOK,
                      {"rootCode": MOTHER, "slotValues": {"B": "13", "E": "15"}})
        hit = [i for i in exp["items"] if i["mainCode"] == view["child"]]
        ok(f"전개 결과에 Child 존재 ({len(hit)})", bool(hit))
        ok("★ 고정값이 Child 해석 코드에 전파",
           any("ZTEST" in i["resolvedCode"] for i in hit))

        # ── 삭제 ──
        st, _ = req("DELETE", f"/codes/relationships/{rel}/slot-map/{m1['slotMapId']}", TOK)
        ok(f"매핑 삭제 200 ({st})", st == 200)
        added.clear()
        st, view3 = req("GET", f"/codes/relationships/{rel}/slot-map", TOK)
        ok("삭제 반영", all(m["childSlot"] != cs or m["fixedValue"] != "ZTEST" for m in view3["maps"]))
        # 19.7 — 드리프트는 **횟수가 아니라 내용**을 본다. 되돌리면 승인 당시와 같아지므로
        # 사라져야 한다(Revision 은 계속 오르지만 그것은 이력이다). 카운터로 판정했다면
        # 검증용 매핑을 지운 뒤에도 영영 '변경됨' 으로 남아 실데이터가 오염된다.
        st, ch3 = req("GET", f"/codes/relationships/{MOTHER}/children", TOK)
        row3 = next((c for c in ch3 if c["relId"] == rel), None)
        ok(f"★ 되돌리면 드리프트가 사라진다 ({row3['basisDrift']}) — 내용 비교이지 횟수가 아니다",
           row3 is not None and row3["basisDrift"] is False)

    # 권한 가드
    gtok = login("kim01", "edim")
    st, _ = req("POST", f"/codes/relationships/{rel}/slot-map", gtok,
                {"childSlot": "A", "fixedValue": "1"})
    ok(f"GENERAL 매핑 추가 403 ({st})", st == 403)
    st, _ = req("GET", f"/codes/relationships/{rel}/slot-map", gtok)
    ok("GENERAL 조회는 허용", st == 200)
    st, _ = req("GET", "/codes/relationships/99999999/slot-map", TOK)
    ok(f"없는 관계 404 ({st})", st == 404)
finally:
    for rel, smid in added:
        req("DELETE", f"/codes/relationships/{rel}/slot-map/{smid}", TOK)
    print("정리 — 추가 매핑 삭제 (Revision 은 이력이라 보존)")

print(f"\nlive_slot_map: {n}/{n} PASS")
