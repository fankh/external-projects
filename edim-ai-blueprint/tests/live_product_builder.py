# -*- coding: utf-8 -*-
"""Product Code Builder 라이브 (2.2) — 요구 #28 핵심 불변식.

검증: 자유텍스트 차단 → Sub Code 등록(PENDING) → 승인 반영(결함 수정분) →
      조합 생성(파생 코드·해시) → 동일 조합 409 → 조합 상세·Revision drift → 권한 가드.
정리: ZZBUILD 그룹 자산 psql 삭제 (제품 코드는 API 삭제로 참조 가드까지 확인).
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
GRP = "ZZBUILD"
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
    """(status, json) — 4xx 도 예외 없이 반환."""
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql("DELETE FROM product_code_item WHERE product_code_id IN "
         f"(SELECT product_code_id FROM product_code WHERE main_code LIKE '{GRP}%')")
    psql(f"DELETE FROM product_code WHERE main_code LIKE '{GRP}%'")
    psql("DELETE FROM sys_approval_request WHERE target_table='code_item' AND target_id IN "
         f"(SELECT ci.item_id FROM code_item ci JOIN code_group cg ON cg.group_id=ci.group_id WHERE cg.group_code='{GRP}')")
    psql("DELETE FROM code_item_value WHERE item_id IN "
         f"(SELECT ci.item_id FROM code_item ci JOIN code_group cg ON cg.group_id=ci.group_id WHERE cg.group_code='{GRP}')")
    psql(f"DELETE FROM code_item WHERE group_id IN (SELECT group_id FROM code_group WHERE group_code='{GRP}')")
    psql(f"DELETE FROM code_group WHERE group_code='{GRP}'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── 1) 기존 Slot 그룹의 자유텍스트 등록 차단 (#28 불변식) ──
    st, groups = req("GET", "/codes/groups", TOK)
    slotted = [g["groupCode"] for g in groups if g["slotCount"] > 0]
    slotless = [g["groupCode"] for g in groups if g["slotCount"] == 0]
    ok(f"Slot 정의 그룹 존재 ({', '.join(slotted)})", bool(slotted))
    # 시드 GEN — 조합 대상이 아닌 코드(구매품·일회성)의 정식 수기 등록 창구
    ok(f"Slot 미정의 그룹 존재 ({', '.join(slotless)})", "GEN" in slotless)
    st, b = req("POST", "/codes/products", TOK,
                {"mainCode": f"{GRP} FREETEXT", "codeName": "자유텍스트", "groupCode": slotted[0]})
    ok(f"Slot 그룹 자유텍스트 등록 422 ({st})", st == 422 and "조합" in (b or {}).get("detail", ""))
    if slotless:
        st, _ = req("POST", "/codes/products", TOK,
                    {"mainCode": f"{GRP} MANUALOK", "codeName": "수기", "groupCode": slotless[0]})
        ok("Slot 미정의 그룹 수기 등록 201", st == 201)
        st, lst = req("GET", "/codes/products", TOK)
        pid = next(p["productCodeId"] for p in lst if p["mainCode"] == f"{GRP} MANUALOK")
        ok("수기 등록 origin=MANUAL", next(p for p in lst if p["productCodeId"] == pid)["origin"] == "MANUAL")
        st, _ = req("DELETE", f"/codes/products/{pid}", TOK)
        ok("수기 등록 정리 삭제", st == 200)

    # ── 2) 테스트 그룹 + Sub Code 등록 (PENDING) ──
    st, _ = req("POST", "/codes/groups", TOK,
                {"groupCode": GRP, "groupName": "조합 검증 그룹", "groupType": "PRODUCT"})
    ok(f"검증 그룹 생성 201 ({GRP})", st == 201)
    st, spec = req("GET", f"/codes/products/builder?group={GRP}", TOK)
    ok("Slot 0 → buildable false", st == 200 and spec["slots"] == [] and spec["buildable"] is False)

    st, _ = req("POST", f"/codes/groups/{GRP}/items", TOK, {"slot": "A", "name": "형식", "values": ["X1", "X2"]})
    ok("Sub Code A 등록 201 (PENDING)", st == 201)
    st, _ = req("POST", f"/codes/groups/{GRP}/items", TOK, {"slot": "B", "name": "크기", "values": ["Y1"]})
    ok("Sub Code B 등록 201 (PENDING)", st == 201)

    st, spec = req("GET", f"/codes/products/builder?group={GRP}", TOK)
    ok("미승인 Slot 은 blocked·buildable false",
       all(s["blocked"] and s["pending"] > 0 for s in spec["slots"]) and spec["buildable"] is False)
    st, b = req("POST", "/codes/products/build", TOK, {"groupCode": GRP, "selections": {"A": "X1", "B": "Y1"}})
    ok(f"미승인 값 조합 422 ({st})", st == 422 and "승인" in (b or {}).get("detail", ""))

    # PATCH approve — 승인함을 거치지 않는 직접 승인 경로 (S-1-1 Slot 승인 버튼)
    st, vals = req("GET", f"/codes/values?group={GRP}", TOK)
    v_x2 = next(v for v in vals if v["slot"] == "A" and v["valueCode"] == "X2")
    st, _ = req("PATCH", f"/codes/values/{v_x2['valueId']}", TOK, {"approve": True})
    ok("값 직접 승인 200", st == 200)
    st, spec = req("GET", f"/codes/products/builder?group={GRP}", TOK)
    ok("승인한 값만 Slot A 에 노출 (1건)",
       [len(s["values"]) for s in spec["slots"] if s["slot"] == "A"] == [1])
    st, b = req("PATCH", f"/codes/values/{v_x2['valueId']}", TOK, {"approve": True, "deprecate": True})
    ok(f"승인+폐기 동시 지정 422 ({st})", st == 422)

    # ── 3) 승인이 실제로 값에 반영되는지 (기존 결함 수정분) ──
    st, inbox = req("GET", "/approvals/inbox", TOK)
    mine = [a["id"] for a in inbox if GRP in str(a.get("target", ""))]
    ok(f"승인함에 Sub Code 요청 2건 등록 ({len(mine)})", len(mine) == 2)
    for aid in mine:
        st, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": True, "comment": ""})
        assert st == 200, f"decide {aid} -> {st}"
    st, spec = req("GET", f"/codes/products/builder?group={GRP}", TOK)
    ok("승인 후 값 노출 — A 2건·B 1건",
       {s["slot"]: len(s["values"]) for s in spec["slots"]} == {"A": 2, "B": 1})
    ok("buildable true", spec["buildable"] is True)
    ok("Revision 표기(Rev 1)", all(v["revisionNo"] == 1 for s in spec["slots"] for v in s["values"]))

    # ── 4) 조합 검증 ──
    st, b = req("POST", "/codes/products/build", TOK, {"groupCode": GRP, "selections": {"A": "X1"}})
    ok(f"Slot 누락 422 — B 명시 ({st})", st == 422 and "B" in (b or {}).get("detail", ""))
    st, b = req("POST", "/codes/products/build", TOK, {"groupCode": GRP, "selections": {"A": "X1", "B": "Y1", "Z": "?"}})
    ok(f"없는 Slot 422 ({st})", st == 422 and "Z" in (b or {}).get("detail", ""))
    st, b = req("POST", "/codes/products/build", TOK, {"groupCode": GRP, "selections": {"A": "NOPE", "B": "Y1"}})
    ok(f"없는 값 422 ({st})", st == 422 and "NOPE" in (b or {}).get("detail", ""))

    st, built = req("POST", "/codes/products/build", TOK,
                    {"groupCode": GRP, "codeName": "조합 검증품", "selections": {"A": "X1", "B": "Y1"}})
    ok(f"조합 생성 201 — {built.get('mainCode') if built else '?'}",
       st == 201 and built["mainCode"] == f"{GRP} X1-Y1")
    ok("origin=COMPOSED·해시 64자", built["origin"] == "COMPOSED" and len(built["comboHash"]) == 64)
    pid1 = built["productCodeId"]

    st, b = req("POST", "/codes/products/build", TOK, {"groupCode": GRP, "selections": {"A": "X1", "B": "Y1"}})
    ok(f"동일 조합 재생성 409 ({st})", st == 409 and f"{GRP} X1-Y1" in (b or {}).get("detail", ""))

    st, built2 = req("POST", "/codes/products/build", TOK, {"groupCode": GRP, "selections": {"A": "X2", "B": "Y1"}})
    ok("다른 조합은 생성 201", st == 201 and built2["mainCode"] == f"{GRP} X2-Y1")
    ok("조합이 다르면 해시도 다름", built2["comboHash"] != built["comboHash"])
    pid2 = built2["productCodeId"]

    # ── 5) 조합 상세·Revision drift ──
    st, comp = req("GET", f"/codes/products/{pid1}/composition", TOK)
    ok("조합 상세 — Slot 2·해시 무결",
       st == 200 and len(comp["slots"]) == 2 and comp["intact"] is True and comp["drift"] == [])
    ok("고정 Slot 값 일치",
       {s["slot"]: s["valueCode"] for s in comp["slots"]} == {"A": "X1", "B": "Y1"})

    vid = next(v["valueId"] for s in spec["slots"] if s["slot"] == "A"
               for v in s["values"] if v["valueCode"] == "X1")
    st, _ = req("PATCH", f"/codes/values/{vid}", TOK, {"valueName": "개정된 이름"})
    ok("Sub Code 값 개정 200", st == 200)
    st, comp = req("GET", f"/codes/products/{pid1}/composition", TOK)
    ok("개정 후 조합은 불변·drift 로만 표기",
       comp["drift"] == ["A"] and comp["intact"] is True
       and next(s for s in comp["slots"] if s["slot"] == "A")["boundRevision"] == 1
       and next(s for s in comp["slots"] if s["slot"] == "A")["currentRevision"] == 2)

    # ── 6) 권한 가드 ──
    gtok = None
    try:
        gtok = login("general1", "edim")
    except Exception:  # noqa: BLE001
        pass
    if gtok:
        st, _ = req("POST", "/codes/products/build", gtok, {"groupCode": GRP, "selections": {"A": "X2", "B": "Y1"}})
        ok(f"GENERAL 조합 생성 403 ({st})", st == 403)
        st, _ = req("GET", f"/codes/products/builder?group={GRP}", gtok)
        ok("GENERAL 조합 선택지 조회는 허용", st == 200)

    # ── 7) 삭제 — 조합 자식 행이 삭제를 막지 않는다 ──
    st, _ = req("DELETE", f"/codes/products/{pid1}", TOK)
    ok(f"조합 코드 삭제 200 (구성 행 연쇄) ({st})", st == 200)
    st, _ = req("DELETE", f"/codes/products/{pid2}", TOK)
    ok("두 번째 조합 코드 삭제 200", st == 200)
    left = psql(f"SELECT count(*) FROM product_code WHERE main_code LIKE '{GRP}%'")
    ok(f"제품 코드 잔존 0 ({left})", left == "0")
finally:
    cleanup()
    print("정리 — ZZBUILD 그룹·Sub Code·제품 코드 삭제")

print(f"\nlive_product_builder: {n}/{n} PASS")
