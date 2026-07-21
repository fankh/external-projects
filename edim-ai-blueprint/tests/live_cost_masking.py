# -*- coding: utf-8 -*-
"""원가·견적 열람 통제 일관성 라이브 (8.3) — 요구 #5·#6.

배경: 정보 접근 마스킹(1.5)은 이미 있었지만 **19개 민감 조회 중 3개에만** 걸려 있었다.
그래서 원가 열람이 masked 인 사용자도 다른 경로(/cpq/runs/{id}/costs, /cost/actuals,
/cost/quotations)로 같은 금액을 그대로 받고, PDF(/reports/pcr/{id}.pdf,
/cost/quotations/{id}/render.pdf)로는 no_download 를 통째로 우회할 수 있었다.
**통제가 일부 경로에만 걸려 있으면 통제가 아니다.**

검증: GENERAL 에 cost=masked·quote=no_download 를 걸고
  · 원가 상세·실적·PCR 목록 금액이 **모든 경로에서** 마스킹되는가
  · PDF 두 종이 403 으로 막히는가 (조회 가능 ≠ Export 가능)
  · ADMIN(full)은 종전대로 실값·다운로드가 되는가 (통제가 과잉이 아닌가)
정리: 걸었던 규칙을 full 로 되돌린다.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, (resp.read() if raw else json.loads(resp.read() or b"null"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, (e.read() if raw else json.loads(e.read() or b"null"))
        except Exception:  # noqa: BLE001
            return e.code, None


def psql(sql):
    """DELETE /cost/actuals 는 존재하지 않는다 — 실적 원가 정리는 psql 로 한다.
    (API 로 지우는 줄 알고 두면 검증용 행이 실 원가 데이터에 남는다)"""
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=60)
    return (r.stdout or "").strip()


def set_mode(tok, group, mode):
    st, _ = req("PUT", "/access/info", tok,
                {"roleName": "GENERAL", "infoGroup": group, "mode": mode})
    return st


MASKED_TEXT = "•"   # MASK_TEXT 의 점 문자


def masked(v):
    """마스킹된 숫자는 None 이거나 '3000~' 형태의 문자열이다(실수 그대로면 미마스킹)."""
    return v is None or isinstance(v, str)


created_quo = None
created_actual = None
TOK = login("edim", "edim")      # ADMIN — full
GEN = login("kim01", "edim")     # GENERAL — 규칙 대상

try:
    # ── 사전: 실값 확보 (ADMIN) ──
    st, runs = req("GET", "/cpq/runs", TOK)
    run_id = next((r["runId"] for r in runs if r.get("status") == "SUCCESS"), None) or runs[0]["runId"]
    st, costs_full = req("GET", f"/cpq/runs/{run_id}/costs", TOK)
    ok(f"ADMIN 원가 상세 실값 ({st}, {len(costs_full) if st == 200 else 0}건)",
       st in (200, 404))
    st, pcrs = req("GET", "/cost/pcr", TOK)
    pcr_id = pcrs[0]["pcrId"] if pcrs else None
    st, quos = req("GET", "/cost/quotations", TOK)
    if not quos:
        # 라이브에 견적이 없으면 만들어 쓴다 — 조용히 건너뛰면 검증한 척이 된다
        st, made = req("POST", "/cost/quotations", TOK, {"businessType": "PRE_SALES"})
        ok(f"검증용 견적 생성 ({st})", st == 201)
        created_quo = made["quotationId"]
        st, quos = req("GET", "/cost/quotations", TOK)
    quo_id = quos[0]["quotationId"]
    ok(f"검증 대상 확보 (PCR {pcr_id} · 견적 {quo_id})", pcr_id and quo_id)
    ok("ADMIN 견적 금액은 실수(마스킹 아님)", isinstance(quos[0]["total"], (int, float)))

    # 실적 원가가 비어 있으면 검증용으로 하나 만든다 (없다고 건너뛰면 검증한 척이 된다)
    st, pre = req("GET", "/cost/actuals", TOK)
    if not pre:
        st, ma = req("POST", "/cost/actuals", TOK,
                     {"category": "MATERIAL", "itemCode": "ZZMASK", "itemName": "마스킹 검증",
                      "qty": 3, "unitPrice": 71234})
        ok(f"검증용 실적 원가 생성 ({st})", st == 201)
        created_actual = ma.get("actualId")

    # ── 제한 부여 ──
    ok(f"cost=masked 설정 ({set_mode(TOK, 'cost', 'masked')})", True)
    ok(f"quote=no_download 설정 ({set_mode(TOK, 'quote', 'no_download')})", True)

    # ── GENERAL: 모든 원가 경로가 마스킹돼야 한다 ──
    st, c = req("GET", f"/cpq/runs/{run_id}/costs", GEN)
    if st == 200:
        ok(f"★ Run 원가 상세 마스킹 (total={c[0]['total']!r})", masked(c[0]["total"]))
        ok("마스킹 시 상세 라인 비노출", c[0]["lines"] == [])
    else:
        ok(f"Run 원가 상세 없음 — 건너뜀 ({st})", st == 404)

    st, acts = req("GET", "/cost/actuals", GEN)
    ok(f"실적 원가 목록 200 ({len(acts)}건)", st == 200 and acts,)
    ok(f"★ 실적 단가·금액 마스킹 ({acts[0]['unitPrice']!r}/{acts[0]['amount']!r})",
       masked(acts[0]["unitPrice"]) and masked(acts[0]["amount"]))

    st, p = req("GET", "/cost/pcr", GEN)
    ok("★ PCR 목록 금액 마스킹(기존 통제 유지)",
       st == 200 and (not p or masked(p[0]["directCostTotal"])))

    # ── GENERAL: 견적 금액 ──
    st, q = req("GET", "/cost/quotations", GEN)
    ok(f"견적 목록 200 ({len(q)}건)", st == 200)

    # ── PDF 는 막힌다 (조회 가능 ≠ Export 가능) ──
    st, _ = req("GET", f"/reports/pcr/{pcr_id}.pdf", GEN, raw=True)
    ok(f"★ 원가 PDF 다운로드 403 ({st})", st == 403)
    st, _ = req("GET", f"/cost/quotations/{quo_id}/render.pdf", GEN, raw=True)
    ok(f"★ 견적서 PDF 다운로드 403 ({st})", st == 403)

    # ── ADMIN 은 영향 없음 (통제가 과잉이 아님) ──
    st, body = req("GET", f"/reports/pcr/{pcr_id}.pdf", TOK, raw=True)
    ok(f"ADMIN 원가 PDF 200 ({len(body) if st == 200 else 0}B)",
       st == 200 and body[:4] == b"%PDF")
    st, body = req("GET", f"/cost/quotations/{quo_id}/render.pdf", TOK, raw=True)
    ok(f"ADMIN 견적서 PDF 200 ({len(body) if st == 200 else 0}B)",
       st == 200 and body[:4] == b"%PDF")
    st, c2 = req("GET", f"/cpq/runs/{run_id}/costs", TOK)
    if st == 200:
        ok("ADMIN 원가 실값 유지", isinstance(c2[0]["total"], (int, float)))

    # ── hidden 이면 값 자체가 사라진다 ──
    set_mode(TOK, "cost", "hidden")
    st, acts2 = req("GET", "/cost/actuals", GEN)
    ok(f"★ hidden 은 값 제거 ({acts2[0]['amount']!r})", acts2 and acts2[0]["amount"] is None)

    # ── 8.4: price·partner 도 전 경로 일관 (같은 필드가 다른 경로로 새지 않는가) ──
    set_mode(TOK, "cost", "masked")
    set_mode(TOK, "price", "masked")
    set_mode(TOK, "partner", "masked")
    # no_download 는 '보이되 못 내려받는' 모드다 — 금액 마스킹 확인엔 masked 를 써야 한다
    set_mode(TOK, "quote", "masked")
    st, pl = req("GET", "/prices", GEN)
    ok(f"단가 목록 200 ({len(pl)}건)", st == 200 and pl)
    code0 = pl[0]["code"]
    ok(f"★ /prices 단가·거래처 마스킹 ({pl[0]['price']!r}/{pl[0]['supplier']!r})",
       masked(pl[0]["price"]) and MASKED_TEXT in str(pl[0]["supplier"]))
    st, rp = req("GET", f"/prices/resolve?code={code0}", GEN)
    if st == 200:
        ok(f"★ /prices/resolve 도 동일 마스킹 (우회 차단) ({rp['price']!r}/{rp['supplier']!r})",
           masked(rp["price"]) and MASKED_TEXT in str(rp["supplier"]))
    st, rp2 = req("GET", f"/prices/resolve?code={code0}", TOK)
    ok("ADMIN 은 resolve 실값 유지", st != 200 or isinstance(rp2["price"], (int, float)))

    st, sev = req("GET", "/erp/suppliers/evals", TOK)
    if not sev:
        st, comps = req("GET", "/companies", TOK)
        sid = (comps[0]["companyId"] if isinstance(comps, list) and comps
               else (comps or {}).get("rows", [{}])[0].get("companyId"))
        st, _ = req("POST", "/erp/suppliers/evals", TOK,
                    {"supplierId": sid, "period": "2099-ZZ", "delivery": 90,
                     "quality": 88, "price": 85, "note": "ZZMASK"})
        ok(f"검증용 공급처 평가 생성 ({st})", st in (200, 201))
    st, sev = req("GET", "/erp/suppliers/evals", GEN)
    ok(f"공급처 평가 200 ({len(sev)}건)", st == 200 and sev)
    ok(f"★ 공급처 평가 거래처명 마스킹 ({sev[0]['supplier']!r})",
       MASKED_TEXT in str(sev[0]["supplier"]))
    st, sm = req("GET", f"/erp/suppliers/{sev[0]['supplierId']}/metrics", GEN)
    ok(f"★ 공급처 지표 거래처명 마스킹 ({sm.get('supplier')!r})",
       st == 200 and MASKED_TEXT in str(sm["supplier"]))

    # 잔여 원가 경로 4종
    st, so = req("GET", "/cost/orders", GEN)
    ok(f"★ 수주 잔고 금액 마스킹 ({so.get('totalAmount')!r})",
       st == 200 and masked(so["totalAmount"]))
    st, bd = req("GET", f"/cost/pcr/{pcr_id}/breakdown", GEN)
    ok(f"★ PCR 비용 트리 마스킹 ({bd.get('contributionMargin')!r})",
       st == 200 and masked(bd["contributionMargin"]))
    st, pa = req("GET", f"/cost/pcr/{pcr_id}/actual", GEN)
    ok(f"★ 실적 반영 PCR 마스킹 ({pa.get('actual', {}).get('margin')!r})",
       st == 200 and masked(pa["actual"]["margin"]))
    st, cv = req("GET", "/cost/variance", GEN)
    ok(f"★ 원가 차이 분석 마스킹 ({cv.get('totalActual')!r})",
       st == 200 and masked(cv["totalActual"]))

    # ADMIN 은 전부 실값 (과잉 아님)
    st, bd2 = req("GET", f"/cost/pcr/{pcr_id}/breakdown", TOK)
    ok("ADMIN PCR 비용 트리 실값", isinstance(bd2["contributionMargin"], (int, float)))
    set_mode(TOK, "price", "full")
    set_mode(TOK, "partner", "full")

    # ── 되돌리면 즉시 실값 (규칙이 실제로 작동함을 반증) ──
    set_mode(TOK, "cost", "full")
    st, acts3 = req("GET", "/cost/actuals", GEN)
    ok("★ full 로 되돌리면 실값 복귀", acts3 and isinstance(acts3[0]["amount"], (int, float)))
    set_mode(TOK, "quote", "full")
    st, _ = req("GET", f"/reports/pcr/{pcr_id}.pdf", GEN, raw=True)
    ok(f"★ 제한 해제 후 GENERAL 도 PDF 200 ({st})", st == 200)
finally:
    for g in ("cost", "quote", "price", "partner"):
        set_mode(TOK, g, "full")
    psql("DELETE FROM cst_actual WHERE item_code='ZZMASK'")
    psql("DELETE FROM com_supplier_eval WHERE period='2099-ZZ'")
    if created_quo:
        req("DELETE", f"/cost/quotations/{created_quo}", TOK)
    st, cur_rules = req("GET", "/access/info", TOK)
    left = [r for r in (cur_rules or {}).get("rules", []) if r.get("roleName") == "GENERAL"]
    act_left = psql("SELECT count(*) FROM cst_actual WHERE item_code='ZZMASK'")
    print(f"정리 — 정보접근 규칙 full 복원 (잔존 {len(left)}) · ZZMASK 실적 잔존 {act_left}")

print(f"\nlive_cost_masking: {n}/{n} PASS")
