# -*- coding: utf-8 -*-
"""G9 라이브 — 수주 확정 시 후속 착수 이벤트 자동 생성 (D1→업무함 고리).

API 계약 (edim.seekerslab.com):
  견적 ORDERED 전이 → OR(수주) 후행(AP 승인도서·PL Part List)을 프로젝트 TODO 이벤트로 시딩,
  재수주(같은 프로젝트) 시 중복 없음(idempotent), /erp/events 반영.
실행: PYTHONUTF8=1 py tests/live_g9_order_followup.py
정리: 테스트로 생성한 견적·후속 이벤트 psql 삭제 안내(끝). 견적 생성엔 PRE_SALES PCR 선행 필요.
"""
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method, path, body=None, tok=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", f"Bearer {tok}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "null")
        except Exception:
            return e.code, None


st, tb = req("POST", "/auth/login", {"userId": "edim", "password": "edim"})
tok = tb.get("token") if tb else None
ok("로그인", st == 200 and tok)


def make_ordered():
    """견적 생성 → SENT → ORDERED. (quotationId, quotationNo, orderResponse) 반환."""
    st, c = req("POST", "/cost/quotations", {"businessType": "PRE_SALES"}, tok)
    assert st == 201, f"quotation create -> {st} {c}"
    qid, qno = c["quotationId"], c["quotationNo"]
    st, _ = req("PATCH", f"/cost/quotations/{qid}/status", {"status": "SENT"}, tok)
    assert st == 200, f"SENT -> {st}"
    st, res = req("PATCH", f"/cost/quotations/{qid}/status",
                  {"status": "ORDERED", "expectedDelivery": "2026-12-31"}, tok)
    assert st == 200, f"ORDERED -> {st} {res}"
    return qid, qno, res


# ── 1차 수주 ──
qid_a, qno_a, res_a = make_ordered()
ok("수주 전환 200 · followupEvents 필드 존재", isinstance(res_a.get("followupEvents"), list))

# 해당 견적의 프로젝트 파악
st, orders = req("GET", "/cost/orders", tok=tok)
order_rows = orders.get("orders", orders) if isinstance(orders, dict) else orders
proj = next((o["project"] for o in order_rows if o.get("quotationNo") == qno_a), None)
ok("수주 잔고에서 프로젝트 확인", proj is not None)

# 업무함에 AP(승인 도서)·PL(Part List) 후속 TODO 존재
st, events = req("GET", "/erp/events", tok=tok)
proj_events = [e for e in events if e["project"] == proj]
names = {e["procName"] for e in proj_events}
ok(f"후속 착수 이벤트 — 승인 도서 존재 ({proj})", "승인 도서" in names)
ok(f"후속 착수 이벤트 — Part List 존재 ({proj})", "Part List" in names)
# 신규 생성분(res_a.followupEvents)은 TODO 로 시딩 — 기존 시드 이벤트 상태는 무관
todo_names = {e["procName"] for e in proj_events if e["status"] in ("TODO", "진행", "지연")}
created = {f["name"] for f in res_a["followupEvents"]}
ok(f"신규 후속 이벤트는 TODO 시딩 (생성 {sorted(created) or '없음(기존 존재)'})",
   all(nm in todo_names for nm in created))

# ── 2차 수주(같은 프로젝트) — 중복 없음(idempotent) ──
qid_b, qno_b, res_b = make_ordered()
ok("재수주 followupEvents = [] (중복 방지)", res_b.get("followupEvents") == [])

print(f"\nOK — live_g9_order_followup {n}/{n}")
print("\n정리 SQL:")
print(f"  DELETE FROM erp_process_event WHERE ref_type='QUOTATION' AND ref_id IN ({qid_a},{qid_b});")
print(f"  DELETE FROM cst_quotation WHERE quotation_id IN ({qid_a},{qid_b});")
