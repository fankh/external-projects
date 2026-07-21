# -*- coding: utf-8 -*-
"""RCCS Set-up 라이브 (4.8~5.0) — 요구 #26(Item Head 자동)·#27(원자재/구매품 그룹)·#31(Family Scope).

배경:
  #26 종전엔 Slot 글자를 사용자가 직접 입력해 409 충돌이 잦았다.
  #27 그룹 유형 드롭다운이 API 거부값(PART/MATERIAL/ETC)이라 원자재·구매품 그룹을 만들 수 없었다.
  #31 arrangement.product_family 가 자유 텍스트라 C-1 이 무관한 제품군 Arrangement 까지 제시했다.
정리: ZZR* 그룹·항목·Arrangement psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
GRP = "ZZRCCS"
ARR = "ZZR-ARR1"
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


def cleanup():
    psql("DELETE FROM sys_approval_request WHERE target_table='code_item' AND target_id IN "
         f"(SELECT ci.item_id FROM code_item ci JOIN code_group cg ON cg.group_id=ci.group_id WHERE cg.group_code LIKE 'ZZRCCS%')")
    psql("DELETE FROM code_item_value WHERE item_id IN "
         f"(SELECT ci.item_id FROM code_item ci JOIN code_group cg ON cg.group_id=ci.group_id WHERE cg.group_code LIKE 'ZZRCCS%')")
    psql("DELETE FROM code_item WHERE group_id IN (SELECT group_id FROM code_group WHERE group_code LIKE 'ZZRCCS%')")
    psql("DELETE FROM sys_approval_request WHERE target_table='arrangement_code' AND target_id IN "
         f"(SELECT arrangement_id FROM arrangement_code WHERE arrangement_code LIKE 'ZZR-%')")
    psql("DELETE FROM arrangement_code WHERE arrangement_code LIKE 'ZZR-%'")
    psql("DELETE FROM code_group WHERE group_code LIKE 'ZZRCCS%'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── #27 그룹 유형 — API 어휘 4종은 되고, 옛 UI 목록(PART/MATERIAL/ETC)은 안 된다 ──
    for gt, expect in (("SPECIFICATION", 201), ("RAW_MATERIAL", 201), ("GPI", 201),
                       ("PRODUCT", 201), ("PART", 422), ("MATERIAL", 422), ("ETC", 422)):
        st, _ = req("POST", "/codes/groups", TOK,
                    {"groupCode": f"{GRP}{gt[:3]}", "groupName": f"검증 {gt}", "groupType": gt})
        ok(f"그룹 유형 {gt:<13} → {st}", st == expect)
    st, groups = req("GET", "/codes/groups", TOK)
    kinds = {g["groupType"] for g in groups if g["groupCode"].startswith(GRP)}
    ok(f"원자재·구매품 그룹 실제 생성됨 ({', '.join(sorted(kinds))})",
       {"RAW_MATERIAL", "GPI"} <= kinds)

    # ── #26 Item Head 자동 부여 ──
    g = f"{GRP}RAW"
    st, a1 = req("POST", f"/codes/groups/{g}/items", TOK, {"name": "전압", "values": ["220", "380"]})
    ok(f"Slot 미지정 등록 201 — 자동 {a1.get('slot')}", st == 201 and a1["slot"] == "A")
    st, a2 = req("POST", f"/codes/groups/{g}/items", TOK, {"name": "주파수", "values": ["50", "60"]})
    ok(f"두 번째 자동 부여 = B ({a2.get('slot')})", st == 201 and a2["slot"] == "B")
    st, a3 = req("POST", f"/codes/groups/{g}/items", TOK, {"slot": "Z", "name": "수동 지정"})
    ok("명시 지정도 그대로 동작 (Z)", st == 201 and a3["slot"] == "Z")
    st, a4 = req("POST", f"/codes/groups/{g}/items", TOK, {"name": "다음 자동"})
    ok(f"Z 를 건너뛰고 C 부여 ({a4.get('slot')})", st == 201 and a4["slot"] == "C")
    st, b = req("POST", f"/codes/groups/{g}/items", TOK, {"slot": "A", "name": "중복"})
    ok(f"명시 중복은 409 ({st})", st == 409)
    st, b = req("POST", f"/codes/groups/{g}/items", TOK, {"name": ""})
    ok(f"이름 없으면 422 ({st})", st == 422)

    # ── #31 Arrangement Family Scope ──
    st, b = req("POST", "/arrangements", TOK,
                {"code": ARR, "name": "검증 배치", "family": "NO_SUCH_GROUP"})
    ok(f"없는 제품군 422 ({st})", st == 422 and "제품군" in (b or {}).get("detail", ""))
    st, _ = req("POST", "/arrangements", TOK,
                {"code": ARR, "name": "검증 배치", "family": f"{GRP}SPE"})
    ok(f"실재 그룹으로 등록 201 ({st})", st == 201)
    st, _ = req("POST", "/arrangements", TOK,
                {"code": ARR + "C", "name": "공통 배치", "family": ""})
    ok("제품군 비우면 공통으로 등록 201", st == 201)

    st, all_arr = req("GET", "/arrangements", TOK)
    mine = {a["code"]: a for a in all_arr if a["code"].startswith("ZZR-")}
    ok("범위 지정 Arrangement 는 common=false", mine[ARR]["common"] is False)
    ok("공통 Arrangement 는 common=true", mine[ARR + "C"]["common"] is True)

    # 다른 제품군 코드로 조회하면 범위 지정분은 빠지고 공통만 남는다
    st, scoped = req("GET", "/arrangements?forCode=KDCR 3-13", TOK)
    codes = {a["code"] for a in scoped}
    ok(f"★ 타 제품군 코드 조회 시 범위 지정분 제외 ({ARR} 없음)", ARR not in codes)
    ok("★ 공통 Arrangement 는 항상 포함", ARR + "C" in codes)
    st, unscoped = req("GET", "/arrangements", TOK)
    ok("필터 없이는 전부 조회", ARR in {a["code"] for a in unscoped})
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM code_group WHERE group_code LIKE '{GRP}%'")
    print(f"정리 — ZZRCCS 그룹·ZZR- Arrangement 삭제 (잔존 {left})")

print(f"\nlive_rccs_setup: {n}/{n} PASS")
