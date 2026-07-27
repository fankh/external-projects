# -*- coding: utf-8 -*-
"""필터 인자가 실제로 거르는가 (18.62) — 정적 게이트가 못 보는 면.

배경: 18.59 에서 `GET /files` 가 `project` 를 선언만 하고 쓰지 않는 것을 찾았고, 18.60 에서
그 유형을 정적 게이트(check_unused_params)로 고정했다. 그런데 게이트는 **이름이 본문에
나오는가**만 본다 — 읽고도 엉뚱하게 쓰거나, 모르는 값이면 조건을 통째로 버리는 경우는
그대로 통과한다. 그래서 값으로 확인한다.

방법: 말이 되지 않는 값을 넣고 부른다. 걸러 주는 엔드포인트라면 **결과가 줄거나 거부**해야
한다. 거르지 않은 결과와 **완전히 같으면** 그 인자는 듣지 않는 것이다.

이 방법으로 찾은 것:
  · `/anomalies?status=…&source=…` — 모르는 값이면 **필터를 버리고 전체**를 돌려줬다.
    화면은 걸러진 목록이라 표시하는데 실제로는 전부다. 오타 하나에 '이상 없음' 이
    '전부 이상' 처럼 보인다.
  · `/arrangements?forCode=…` — 없는 코드면 '제품군 없음' 으로 스코프한 것과 같은 목록
    (공통만)을 돌려줬다. 기준이 없는데 걸러 준 것처럼 보인다.
  · `/cost/variance?project=…` — 없는 프로젝트에 0 으로 채운 분석표를 돌려줘 '차이 없음'
    처럼 읽혔다.

정리: 조회만 하므로 잔재가 없다.

실행: PYTHONUTF8=1 py tests/live_filter_honesty.py
"""
import json
import urllib.error
import urllib.parse
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
NONSENSE = "ZZ존재하지않는값9137"
n = 0
skipped: list[str] = []


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login():
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


TOK = login()


def get(path, params=None):
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    r = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOK}"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


def size(v):
    if isinstance(v, list):
        return len(v)
    if isinstance(v, dict):
        for k in ("items", "rows", "data", "results", "list"):
            if isinstance(v.get(k), list):
                return len(v[k])
    return -1


# ── 고친 세 곳: 모르는 값을 조용히 무시하지 않는다 ──
st, _ = get("/anomalies", {"status": NONSENSE})
ok(f"/anomalies 모르는 상태 422 ({st})", st == 422)
st, _ = get("/anomalies", {"source": NONSENSE})
ok(f"/anomalies 모르는 출처 422 ({st})", st == 422)
# 18.68 — 화이트리스트는 **DB CHECK 제약과 같은 목록**이어야 한다. 어긋나면 실제로 쓰이는
# 값이 '모르는 값' 이 된다. `SECURITY` 가 빠져 있었고, 종전 구현은 모르는 값에 조건을 버려
# `?source=SECURITY` 가 전체를 돌려줬다(검증은 결과가 비어 있을 때만 봐서 못 알아챘다).
for src in ("QC", "COST", "MILESTONE", "MANUAL", "SECURITY"):
    st, _ = get("/anomalies", {"source": src})
    ok(f"/anomalies?source={src} 200 ({st})", st == 200)

st, b = get("/anomalies", {"status": "open"})
ok(f"/anomalies 아는 값은 통과 ({st})", st == 200)
ok("소문자도 받는다", all(r["status"] == "OPEN" for r in (b or {}).get("rows", [])))
st, b = get("/anomalies")
ok(f"빈 값은 전체 보기 ({st})", st == 200)

st, _ = get("/arrangements", {"forCode": NONSENSE})
ok(f"/arrangements 없는 코드 422 ({st})", st == 422)
st, b = get("/arrangements", {"forCode": "KDCR 3-13"})
ok(f"/arrangements 있는 코드 200 ({st}, {size(b)}건)", st == 200 and size(b) > 0)

st, _ = get("/cost/variance", {"project": NONSENSE})
ok(f"/cost/variance 없는 프로젝트 422 ({st})", st == 422)
st, b = get("/cost/variance", {"project": "PS-61313-5"})
ok(f"/cost/variance 있는 프로젝트 200 ({st})", st == 200)
st, b = get("/cost/variance")
ok(f"빈 값은 테넌트 전체 ({st})", st == 200)

# ── 넓은 회귀: 필터 인자에 말이 되지 않는 값을 넣으면 결과가 같지 않아야 한다 ──
# 새 필터가 들어올 때 같은 결함이 다시 생기는지 본다. 기준 결과가 비어 있으면 판정할 수
# 없으므로 건너뛰고, **몇 건을 건너뛰었는지 반드시 출력한다**(조용히 줄이면 전부 확인한
# 것처럼 읽힌다).
SWEEP = [
    ("/dev/requirements", "status"), ("/codes/products", "status"),
    ("/codes/values", "group"), ("/companies", "q"), ("/materials", "q"),
    ("/hierarchy", "treeType"), ("/notifications", "type"), ("/documents", "q"),
    ("/drawings/dimensions", "drawing"), ("/macros/functions", "q"),
    ("/erp/work-process", "code"), ("/erp/stock/movements", "item"),
    ("/erp/work-orders", "q"), ("/eco/changes", "q"), ("/eco/ledger", "status"),
    ("/eco/ledger", "targetType"), ("/erp/milestones", "project"),
    ("/erp/processes", "domain"), ("/cpq/selections", "projectNo"),
    ("/drawings", "code"), ("/drawings", "q"), ("/parts", "q"),
    ("/files", "project"), ("/audit", "action"), ("/audit", "user"),
]
for path, param in SWEEP:
    st0, base = get(path)
    if st0 != 200 or size(base) <= 0:
        skipped.append(f"{path}?{param} (기준 {st0}/{size(base)})")
        continue
    st1, filt = get(path, {param: NONSENSE})
    if st1 != 200:
        ok(f"{path}?{param} 거부 ({st1})", st1 in (400, 404, 422))
        continue
    same = json.dumps(base, ensure_ascii=False) == json.dumps(filt, ensure_ascii=False)
    ok(f"{path}?{param} 걸러진다 ({size(base)}→{size(filt)})", not same)

print(f"\n건너뜀 {len(skipped)}건 (기준 결과 없음 — 판정 불가):")
for s in skipped:
    print(f"  · {s}")
print(f"\nOK — 필터 정직성 {n}개 검증 통과")
