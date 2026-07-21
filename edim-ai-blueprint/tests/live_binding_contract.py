# -*- coding: utf-8 -*-
"""UI Data Binding Contract 라이브 (6.6) — 요구 #58 "DB 직접 접근 금지, Contract 경유만".

배경: layout_def 가 자유 텍스트라 테이블/컬럼을 직접 가리키는 화면을 만들 수 있었다
(구조 변경 영향 추적 불가·정보 접근 통제 우회 여지).
검증: Contract 등록 → 직접 참조 레이아웃 409 → 미등록 binding 422 → 등록 Contract 는 통과 →
     바인딩 없는 순수 위젯은 종전대로 허용(무영향) → 오탐 없음 → 사용 중 Contract 삭제 409.
정리: ZZC* Contract·ZZFORM* 화면 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CC = "ZZCPRICE"
FORM = "ZZFORM-BIND"
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
    psql("DELETE FROM tbx_ui_form WHERE form_name LIKE 'ZZFORM%'")
    psql("DELETE FROM tbx_binding_contract WHERE contract_code LIKE 'ZZC%'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── Contract 등록 ──
    st, b = req("PUT", f"/toolbox/contracts/{CC}", TOK,
                {"contractCode": CC, "contractName": "단가 조회", "sourceKind": "BOGUS",
                 "sourceRef": "prices"})
    ok(f"원천 종류 어휘 422 ({st})", st == 422)
    st, c = req("PUT", f"/toolbox/contracts/{CC}", TOK,
                {"contractCode": CC, "contractName": "단가 조회", "sourceKind": "TABLE",
                 "sourceRef": "Table12", "allowedFields": ["code", "price"]})
    ok(f"Contract 등록 200 ({st})", st == 200 and c["allowedFields"] == ["code", "price"])
    st, lst = req("GET", "/toolbox/contracts", TOK)
    ok("목록에 노출", any(x["contractCode"] == CC for x in lst))

    # ── DB 직접 참조는 막힌다 ──
    st, b = req("PUT", f"/toolbox/forms/{FORM}", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "w1", "kind": "Grid", "source": "SELECT * FROM cst_price"}]})
    ok(f"★ SQL 직접 참조 409 ({st})", st == 409 and "직접" in (b or {}).get("detail", ""))
    st, b = req("PUT", f"/toolbox/forms/{FORM}", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "w1", "kind": "Grid", "table": "product_code"}]})
    ok(f"★ 테이블명 직접 참조 409 ({st})", st == 409)

    # ── 미등록 Contract 참조는 422 ──
    st, b = req("PUT", f"/toolbox/forms/{FORM}", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "w1", "kind": "Grid", "binding": "ZZC-NOPE"}]})
    ok(f"★ 미등록 Contract 422 ({st})", st == 422 and "등록되지" in (b or {}).get("detail", ""))

    # ── 등록 Contract 는 통과 ──
    st, _ = req("PUT", f"/toolbox/forms/{FORM}", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "w1", "kind": "Grid", "binding": CC, "label": "단가"}]})
    ok(f"★ 등록 Contract 경유는 저장 200 ({st})", st == 200)

    # ── 무영향: 바인딩 없는 순수 표시 위젯 ──
    st, _ = req("PUT", f"/toolbox/forms/{FORM}2", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "w1", "kind": "PushButton", "label": "실행"},
                            {"id": "w2", "kind": "Label", "label": "code_name 표시"}]})
    ok(f"★ 바인딩 없는 화면은 종전대로 저장 200 ({st})", st == 200)
    st, _ = req("PUT", f"/toolbox/forms/{FORM}3", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "w1", "kind": "Label", "label": "PRODUCT_CODE_LIST"}]})
    ok(f"★ 유사 문자열 오탐 없음 (PRODUCT_CODE_LIST) ({st})", st == 200)

    # ── 사용 중 Contract 삭제 차단 ──
    st, b = req("DELETE", f"/toolbox/contracts/{CC}", TOK)
    ok(f"★ 사용 중 Contract 삭제 409 ({st})", st == 409 and FORM in (b or {}).get("detail", ""))
    psql(f"DELETE FROM tbx_ui_form WHERE form_name='{FORM}'")
    st, _ = req("DELETE", f"/toolbox/contracts/{CC}", TOK)
    ok(f"미사용이면 삭제 200 ({st})", st == 200)
    st, _ = req("DELETE", f"/toolbox/contracts/{CC}", TOK)
    ok(f"없는 Contract 404 ({st})", st == 404)

    # ── 권한 ──
    gtok = login("kim01", "edim")
    st, _ = req("PUT", "/toolbox/contracts/ZZCX", gtok,
                {"contractCode": "ZZCX", "contractName": "x", "sourceRef": "y"})
    ok(f"GENERAL Contract 등록 403 ({st})", st == 403)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM tbx_binding_contract WHERE contract_code LIKE 'ZZC%'")
    print(f"정리 — ZZC*/ZZFORM* 삭제 (잔존 {left})")

print(f"\nlive_binding_contract: {n}/{n} PASS")
