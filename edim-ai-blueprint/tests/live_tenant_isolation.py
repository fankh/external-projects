# -*- coding: utf-8 -*-
"""테넌트 격리 실증 스위트 (2.9) — 교차 테넌트 자원 접근 차단.

1.2 로 런타임이 멀티테넌트가 된 뒤, 라우터 SQL 중 tenant 조건이 빠진 구문이 남아 있으면
연번 ID 만 알아도 남의 고객사 자원이 조회·변경된다. 정적 감사로 60건을 추린 뒤
실제 신규 테넌트 토큰으로 기존 테넌트 자원 ID 를 찔러 **실증**한다.

이 스위트가 지키는 계약 (**차등 판정**):
  다른 테넌트의 자원 ID 로 보낸 요청의 응답이, **존재하지 않는 ID** 로 보낸 응답과 같아야 한다.
  - 쓰기(변경/삭제)는 추가로 2xx 가 나오면 안 된다 — 성공 자체가 곧 침해다.
  - 404 를 강요하지 않는다: 목록형 하위 자원은 없는 ID 에도 `200 []` 이 정상이고,
    그 경우 데이터도 존재 사실도 새지 않는다. 반대로 응답이 갈리면 그 자체가 존재 오라클이다.
  이 기준을 처음 적용했을 때 GET 13종이 '누출' 로 잡혔으나, 실제로는 없는 ID 와 응답이 동일해
  안전한 것으로 확인됐다(스위트 판정 기준의 결함이었지 제품 결함이 아니었음).

실행: PYTHONUTF8=1 py tests/live_tenant_isolation.py
정리: 프로브 테넌트 psql 삭제 (자체 정리).
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
TC = "ZISO-CO"
AL = "ziso.admin"
AP = "ziso1234"
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


def purge():
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{TC}'")
    if tid:
        for tbl in ("sys_history", "sys_notification", "sys_hierarchy", "sys_user"):
            psql(f"DELETE FROM {tbl} WHERE tenant_id={tid}")
        psql(f"DELETE FROM sys_tenant WHERE tenant_id={tid}")


purge()
A = login("edim", "edim")   # 자원 보유 테넌트

try:
    st, _ = req("POST", "/platform/tenants", A,
                {"tenantCode": TC, "tenantName": "격리 검증", "plan": "TRIAL",
                 "adminLogin": AL, "adminName": "격리 관리자", "adminPassword": AP})
    ok(f"프로브 테넌트 생성 ({st})", st in (200, 201))
    B = login(AL, AP)
    ok("프로브 테넌트 관리자 로그인", bool(B))
    st, own = req("GET", "/cpq/runs", B)
    ok(f"신규 테넌트는 빈 상태 (Run {len(own)}건)", st == 200 and own == [])

    # ── A 테넌트 자원 ID 수집 ──
    res = {}
    _, runs = req("GET", "/cpq/runs", A)
    res["run"] = next((r["runId"] for r in runs if r.get("status") == "SUCCESS"), None)
    _, sels = req("GET", "/cpq/selections?projectNo=PS-61313-5", A)
    res["selection"] = sels[0]["selectionId"] if sels else None
    _, dwgs = req("GET", "/drawings", A)
    res["drawing"] = dwgs[0]["drawingNo"] if dwgs else None
    _, parts = req("GET", "/parts", A)
    res["part"] = parts[0]["partNo"] if parts else None
    _, comps = req("GET", "/companies", A)
    res["company"] = comps[0]["companyId"] if comps else None
    _, snaps = req("GET", "/snapshots", A)
    res["snapshot"] = snaps[0]["snapshotId"] if snaps else None
    _, docs = req("GET", "/documents", A)
    res["doc"] = docs[0]["docNo"] if docs else None
    _, macros = req("GET", "/macros", A)
    res["macro"] = (macros[0].get("name") or macros[0].get("macroName")) if macros else None
    _, nodes = req("GET", "/hierarchy", A)
    res["node"] = next((x["hierarchyId"] for x in nodes if x.get("hierarchyId")), None) if nodes else None
    ok(f"A 테넌트 자원 수집 ({sum(1 for v in res.values() if v is not None)}종)",
       res["run"] is not None and res["drawing"] is not None)

    # ── 교차 접근 시도 — 전부 404/403 이어야 한다 ──
    PROBES = [
        ("GET", f"/cpq/runs/{res['run']}", None, "Run 상태·산출물"),
        ("GET", f"/cpq/runs/{res['run']}/bom-snapshot", None, "Run BOM Snapshot"),
        ("GET", f"/cpq/runs/{res['run']}/bom-basis", None, "Run 전개 근거"),
        ("DELETE", f"/cpq/selections/{res['selection']}", None, "견적안 삭제"),
        ("GET", f"/drawings/{res['drawing']}/bom", None, "도면 BOM"),
        ("DELETE", f"/drawings/{res['drawing']}", None, "도면 삭제"),
        ("PUT", f"/parts/{res['part']}", {"name": "X"}, "부품 수정"),
        ("PUT", f"/companies/{res['company']}", {"name": "X"}, "거래처 수정"),
        ("GET", f"/snapshots/{res['snapshot']}", None, "Snapshot 조회"),
        ("GET", f"/snapshots/{res['snapshot']}/verify", None, "Snapshot 검증"),
        ("PATCH", f"/documents/{res['doc']}/meta", {"title": "X"}, "문서 메타 수정"),
        ("DELETE", f"/macros/{res['macro']}", None, "매크로 삭제"),
        ("DELETE", f"/hierarchy/nodes/{res['node']}", None, "Hierarchy 노드 삭제"),
    ]
    leaks = []
    probed = 0
    for method, path, body, label in PROBES:
        if "None" in path:
            continue
        probed += 1
        st, b = req(method, path, B, body)
        # 200/201/204 = 실제 접근, 409 = 존재 사실 노출. 정답은 404/403.
        if st in (200, 201, 202, 204, 409):
            leaks.append(f"{label} {method} {path} → {st}")
    ok(f"교차 테넌트 접근 전량 차단 ({probed}종 · 누출 {len(leaks)})",
       not leaks or print("\n".join("  누출: " + x for x in leaks)) and False)

    # ── 자동 도출 GET 스윕 — 손으로 고른 13종을 넘어 경로 파라미터 GET 전수 ──
    # 파괴적 메서드는 자동 스윕하지 않는다: 격리가 깨져 있으면 프로브가 실제 고객 데이터를
    # 지우거나 바꾸기 때문이다. 읽기(GET)만 자동화하고, 쓰기는 위 PROBES 의 통제된 목록으로만 찌른다.
    import os
    import re as _re
    router = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "..", "backend", "app", "routers", "edim.py")
    src = open(router, encoding="utf-8").read()
    get_paths = [g for g in _re.findall(r'@router\.get\(\s*["\']([^"\']+)["\']', src) if "{" in g]

    _, pcrs = req("GET", "/cost/pcr", A)
    _, ecos = req("GET", "/eco/changes", A)
    _, prjs = req("GET", "/projects", A)
    _, codes = req("GET", "/codes/products", A)
    _, evs = req("GET", "/erp/events", A)

    def first(rows, *keys):
        rows = rows if isinstance(rows, list) else (rows or {}).get("items") or []
        for r in rows:
            for k in keys:
                if isinstance(r, dict) and r.get(k) not in (None, ""):
                    return r[k]
        return None

    # 파라미터명 → A 테넌트 실자원 (해석 못 하는 파라미터는 판정하지 않는다)
    VAL = {
        "run_id": res["run"], "snapshot_id": res["snapshot"], "drawing_no": res["drawing"],
        "part_no": res["part"], "doc_no": res["doc"], "company_id": res["company"],
        "node_id": res["node"], "code": first(codes, "mainCode"),
        "pcr_id": first(pcrs, "pcrId"), "eco_no": first(ecos, "ecoNo"),
        "project_no": first(prjs, "projectNo"), "event_id": first(evs, "eventId"),
        "quotation_id": None, "po_no": None,
    }
    # {name} 은 경로마다 대상이 달라 개별 지정
    PER_PATH = {"/macros/{name}/refs": {"name": res["macro"]}}

    swept, skipped, auto_leaks = 0, 0, []
    for tmpl in sorted(set(get_paths)):
        names = _re.findall(r"\{([^}]+)\}", tmpl)
        vals = {**{k: VAL.get(k) for k in names}, **PER_PATH.get(tmpl, {})}
        if any(vals.get(k) in (None, "") for k in names):
            skipped += 1
            continue
        path = tmpl
        fake = tmpl
        for k in names:
            path = path.replace("{" + k + "}", str(vals[k]))
            sentinel = "99999999" if str(vals[k]).isdigit() else "ZZ-NO-SUCH"
            fake = fake.replace("{" + k + "}", sentinel)
        # 판정 기준: **차등(differential)**.
        # "남의 자원 ID" 응답이 "존재하지 않는 ID" 응답과 완전히 같아야 한다.
        # 404 를 강요하지 않는 이유 — 목록형 하위 자원은 없는 ID 에도 200 [] 이 정상이고,
        # 그 경우 데이터도 존재 사실도 새지 않는다. 반대로 응답이 갈리면 그 자체가 존재 오라클이다.
        st_real, b_real = req("GET", path, B)
        st_fake, b_fake = req("GET", fake, B)
        swept += 1

        def norm(body, subs):
            """응답에서 '요청자가 보낸 ID' 를 지운 뒤 비교한다.
            404 detail 이 입력 ID 를 되돌려주는 건 호출자가 이미 아는 값이라 정보 노출이 아니다."""
            s = json.dumps(body, sort_keys=True, ensure_ascii=False)
            for v in subs:
                s = s.replace(str(v), "<ID>")
            return s

        if (st_real, norm(b_real, [vals[k] for k in names])) != \
           (st_fake, norm(b_fake, ["99999999", "ZZ-NO-SUCH"])):
            auto_leaks.append(f"{tmpl}: 남의 ID={st_real} {json.dumps(b_real, ensure_ascii=False)[:70]} "
                              f"≠ 없는 ID={st_fake} {json.dumps(b_fake, ensure_ascii=False)[:70]}")
    if auto_leaks:
        print("\n".join("  누출: " + x for x in auto_leaks))
    ok(f"경로 파라미터 GET 자동 스윕 — {swept}종 차등 동일 (해석 불가 {skipped}종 제외)",
       swept >= 20 and not auto_leaks)

    # ── A 테넌트 자신은 정상 동작 (과차단 회귀 방지) ──
    st, _ = req("GET", f"/cpq/runs/{res['run']}", A)
    ok(f"자기 테넌트 Run 조회는 정상 200 ({st})", st == 200)
    st, _ = req("GET", f"/snapshots/{res['snapshot']}", A)
    ok(f"자기 테넌트 Snapshot 조회 정상 ({st})", st == 200)

    # ── 존재하지 않는 ID 도 같은 404 (존재 여부 구분 불가) ──
    st1, _ = req("GET", "/cpq/runs/99999999", B)
    st2, _ = req("GET", f"/cpq/runs/{res['run']}", B)
    ok(f"남의 Run 과 없는 Run 이 동일 응답 ({st2} == {st1})", st1 == st2 == 404)
finally:
    purge()
    print("정리 — 프로브 테넌트 삭제")

print(f"\nlive_tenant_isolation: {n}/{n} PASS")
