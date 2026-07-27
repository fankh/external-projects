# -*- coding: utf-8 -*-
"""대시보드 경로의 정보그룹 통제 (18.66~18.67) — 통제에 닿지 못하던 두 화면.

배경: 재고 화면의 금액 표기를 보다가 `_mask_num` 이 hidden/summary 에 `None`, masked 에
`"100000~"` 를 돌려주는데 화면은 `₩{Math.round(v ?? 0)}` 로 찍는다는 것을 봤고(18.65),
그 김에 **서버가 실제로 마스킹하고 있는가**를 되짚었다. 그러다 확인한 것:

  · `/erp/analytics` — 누적 원가·원가 추이·차이분석·월별 기여마진을 **마스킹 없이** 돌려줬다.
    같은 수치를 `/cpq/runs/{id}/costs`·`/cost/variance`·PCR 은 `cost` 그룹으로 가린다.
    원인은 우회가 아니라 **`request` 인자가 없어 열람 모드를 물어볼 수단 자체가 없었던 것**.
  · `/erp/dashboard` — '이번 달 수주' 가 **하드코딩된 `₩ 8.4억`** 이었다. 주석엔 '견적/수주
    모듈 구축 전 고정값' 이라 적혀 있었지만 그 모듈은 이미 있다. 화면 맨 위에서 지어낸
    숫자가 실적처럼 보였다.

주의: `sys_info_access` 는 기본이 비어 있어(=full) 평소엔 아무것도 가려지지 않는다. 그래서
이 스위트는 **모드를 켜서** 확인하고 끝나면 되돌린다. 켜지 않은 상태에서 '통제가 동작한다'
고 말할 수는 없다.

정리: 바꾼 역할 모드를 full 로 되돌린다(실패해도 finally 에서 복구).

실행: PYTHONUTF8=1 py tests/live_dashboard_masking.py
"""
import json
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}",
                                        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def set_mode(tok, group, mode, role="GENERAL"):
    st, _ = req("PUT", "/access/info", tok, {"roleName": role, "infoGroup": group, "mode": mode})
    return st


def hidden_or_masked(v):
    """가려진 숫자는 None 이거나 '3000~' 형태의 문자열이다(실수 그대로면 미마스킹)."""
    return v is None or isinstance(v, str)


TOK = login("edim", "edim")     # ADMIN — full
GEN = login("kim01", "edim")    # GENERAL — 통제 대상

try:
    # ── 통제를 켜지 않은 상태(기본 full)에서는 숫자 그대로여야 한다 ──
    st, a = req("GET", "/erp/analytics", GEN)
    ok(f"analytics 200 ({st})", st == 200)
    ok("기본(full)에서는 원가가 숫자",
       all(isinstance(v["total"], (int, float)) for v in a["costByType"].values())
       or not a["costByType"])

    # ── cost=hidden · quote=masked 로 켠다 ──
    ok(f"cost=hidden 설정 ({set_mode(TOK, 'cost', 'hidden')})", True)
    ok(f"quote=masked 설정 ({set_mode(TOK, 'quote', 'masked')})", True)

    st, a = req("GET", "/erp/analytics", GEN)
    ok(f"analytics 200 ({st})", st == 200)
    ok("누적 원가가 가려진다",
       all(hidden_or_masked(v["total"]) for v in a["costByType"].values()))
    ok("원가 추이가 가려진다",
       all(hidden_or_masked(t[k]) for t in a["costTrend"]
           for k in ("material", "manufacturing", "direct")))
    v = a["variance"]
    ok("차이분석 분류가 가려진다",
       all(hidden_or_masked(c[k]) for c in v["categories"]
           for k in ("estimate", "actual", "variance")))
    ok("차이분석 합계가 가려진다",
       all(hidden_or_masked(v[k]) for k in ("totalEstimate", "totalActual", "totalVariance")))
    ok(f"열람 모드를 응답에 밝힌다 ({v.get('maskMode')})", v.get("maskMode") == "hidden")
    mo = a.get("monthlyOrders") or []
    ok(f"월별 기여마진이 가려진다 ({len(mo)}개월)",
       all(hidden_or_masked(m["margin"]) for m in mo))
    ok("월 매출은 quote 통제를 따른다",
       all(hidden_or_masked(m["revenue"]) for m in mo))

    # ── 대시보드 KPI: 지어낸 값이 아니라 실제 값이고, 통제도 따른다 ──
    st, d = req("GET", "/erp/dashboard", GEN)
    ok(f"dashboard 200 ({st})", st == 200)
    kpi = next(k for k in d["kpis"] if "수주" in k["label"])
    ok(f"고정값 ₩ 8.4억 이 사라졌다 ({kpi['value']})", "8.4억" not in kpi["value"])
    ok("수주 금액이 quote 통제를 따른다", kpi["value"].endswith("~") or kpi["value"] == "••••")
    ok(f"건수를 함께 밝힌다 ({kpi.get('note')})", "건" in (kpi.get("note") or ""))

    # ── ADMIN(full)은 그대로 본다 — 통제가 역할 단위임을 확인 ──
    st, a2 = req("GET", "/erp/analytics", TOK)
    ok(f"ADMIN 은 원가를 그대로 본다 ({st})",
       st == 200 and all(isinstance(x["total"], (int, float))
                         for x in a2["costByType"].values()))
    st, d2 = req("GET", "/erp/dashboard", TOK)
    kpi2 = next(k for k in d2["kpis"] if "수주" in k["label"])
    ok(f"ADMIN 수주 KPI 는 실값 ({kpi2['value']})", kpi2["value"].startswith("₩"))
finally:
    set_mode(TOK, "cost", "full")
    set_mode(TOK, "quote", "full")
    print("정리 — GENERAL cost·quote 를 full 로 원복")

print(f"\nOK — 대시보드 정보그룹 통제 {n}개 검증 통과")
