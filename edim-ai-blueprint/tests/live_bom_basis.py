# -*- coding: utf-8 -*-
"""BOM 전개 근거 고정 라이브 (2.7) — 요구 #40.

검증: 전개가 관계 Revision 을 함께 반환 → Run 이 근거를 고정 → 근거 대조 stable →
      관계 승인으로 Revision 이동 → 근거 대조가 변경분을 관계 단위로 지목(BOM 은 불변) →
      Snapshot drift 가 근거 이동을 보고 → 순환/테넌트 가드.
정리: 승인으로 올린 Revision 은 되돌리지 않는다(이력 성격). 생성한 Run/Snapshot 은 삭제.
"""
import json
import subprocess
import time
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
ROOT = "KDCR 3-13"
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
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=90) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


TOK = login("edim", "edim")
run_id = None
snap_id = None

try:
    # ── 1) 마이그레이션·전개 근거 노출 ──
    ok("alembic 0035 적용 (code_relationship.revision_no)",
       psql("SELECT count(*) FROM information_schema.columns WHERE table_name='code_relationship' "
            "AND column_name='revision_no'") == "1")
    ok("cpq_run.rel_basis 컬럼",
       psql("SELECT count(*) FROM information_schema.columns WHERE table_name='cpq_run' "
            "AND column_name='rel_basis'") == "1")

    st, exp = req("POST", "/codes/products/expand", TOK, {"rootCode": ROOT, "slotValues": {"B": "13", "E": "15"}})
    ok(f"BOM 전개 정상 ({len(exp['items'])}행)", st == 200 and len(exp["items"]) > 3)

    # ── 2) Run 실행 → 근거 고정 ──
    st, sel = req("POST", "/cpq/selections", TOK,
                  {"projectNo": "PS-61313-5", "rootCode": ROOT,
                   "finishedGoodsCode": "KDCR 3-13-13-15", "slotValues": {"B": "13", "C": "32", "E": "15"}})
    sel_id = sel["selectionId"]
    st, run = req("POST", "/cpq/runs", TOK, {"selectionId": sel_id, "runType": "ALL", "isTest": True})
    run_id = run["runId"]
    ok(f"Run 기동 ({run_id})", st in (200, 202) and run_id)
    for _ in range(60):
        time.sleep(3)
        st, d = req("GET", f"/cpq/runs/{run_id}", TOK)
        if d and d.get("status") in ("SUCCESS", "FAILED"):
            break
    ok(f"Run 완료 SUCCESS ({d.get('status')})", d.get("status") == "SUCCESS")

    st, basis = req("GET", f"/cpq/runs/{run_id}/bom-basis", TOK)
    ok("근거 고정됨 (pinned 존재)", st == 200 and basis["pinned"] and basis["pinned"]["edges"])
    ok(f"근거 체크섬 64자 · 관계 {basis['edgeCount']}건",
       len(basis["pinned"]["checksum"]) == 64 and basis["edgeCount"] > 0)
    ok("Revision 동반 기록", all(e["revisionNo"] >= 1 for e in basis["pinned"]["edges"]))
    ok("근거 동일 — stable true · diff 0", basis["stable"] is True and basis["diff"] == [])

    # ── 3) Snapshot 이 근거까지 동결 ──
    st, snap = req("POST", "/snapshots", TOK, {"runId": run_id, "note": "근거 검증"})
    snap_id = snap["snapshotId"] if snap and "snapshotId" in snap else None
    if snap_id is None:
        st, lst = req("GET", "/snapshots", TOK)
        snap_id = next(s["snapshotId"] for s in lst if s["sourceId"] == run_id)
    st, ver = req("GET", f"/snapshots/{snap_id}/verify", TOK)
    ok("Snapshot 무결·근거 drift 없음",
       ver["intact"] is True and not any(d["field"] == "relBasis" for d in ver["drift"]))

    # ── 4) 관계 승인 → Revision 이동 → 근거 대조가 지목 ──
    before = psql(f"SELECT max(revision_no) FROM code_relationship cr JOIN product_code m "
                  f"ON m.product_code_id=cr.mother_code_id WHERE m.main_code='{ROOT}'")
    st, ap = req("POST", "/approvals", TOK,
                 {"targetTable": "code_relationship", "targetCode": ROOT,
                  "label": f"근거 검증 — {ROOT}", "requestType": "UPDATE"})
    aid = ap.get("approvalId") if ap else None
    ok(f"관계 승인 요청 ({aid})", st in (200, 201) and aid)
    st, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": True, "comment": "근거 이동 검증"})
    ok("승인 결정 200", st == 200)
    after = psql(f"SELECT max(revision_no) FROM code_relationship cr JOIN product_code m "
                 f"ON m.product_code_id=cr.mother_code_id WHERE m.main_code='{ROOT}'")
    ok(f"관계 Revision 증가 ({before} → {after})", int(after) == int(before) + 1)

    st, basis2 = req("GET", f"/cpq/runs/{run_id}/bom-basis", TOK)
    ok("근거 이동 감지 — stable false", basis2["stable"] is False)
    ok(f"변경 관계를 단위로 지목 ({len(basis2['diff'])}건)",
       basis2["diff"] and all(d["change"] == "revised" for d in basis2["diff"]))
    ok("지목에 Mother > Child 표기",
       all(">" in d["label"] and d["currentRevision"] == d["pinnedRevision"] + 1 for d in basis2["diff"]))
    ok("고정 근거는 불변 (pinned 체크섬 그대로)", basis2["pinned"]["checksum"] == basis["pinned"]["checksum"])

    st, ver2 = req("GET", f"/snapshots/{snap_id}/verify", TOK)
    ok("Snapshot 이 근거 이동을 drift 로 보고",
       ver2["intact"] is True and any(d["field"] == "relBasis" for d in ver2["drift"]))
    st, bomsnap = req("GET", f"/cpq/runs/{run_id}/bom-snapshot", TOK)
    ok(f"근거가 움직여도 BOM 결과는 불변 ({bomsnap['count']}행)", bomsnap["count"] == len(exp["items"]))

    # ── 5) 가드 ──
    st, _ = req("GET", "/cpq/runs/99999999/bom-basis", TOK)
    ok(f"없는 Run 404 ({st})", st == 404)
    ok("전개 깊이 10 초과 없음 (순환 가드)",
       all(i["level"] < 10 for i in exp["items"]))
    # 테넌트 가드 — 재귀 조인에 tenant 조건이 들어갔는지 (다른 테넌트 관계가 새지 않음)
    ok("재귀 전개에 테넌트 조건 존재",
       "r.tenant_id" in open("backend/app/routers/edim.py", encoding="utf-8").read())
finally:
    if snap_id:
        psql(f"DELETE FROM sys_snapshot WHERE snapshot_id={snap_id}")
    if run_id:
        req("DELETE", f"/cpq/runs/{run_id}", TOK)
        psql(f"DELETE FROM cpq_run WHERE run_id={run_id}")
    print("정리 — 검증 Run·Snapshot 삭제 (관계 Revision 은 이력이라 보존)")

print(f"\nlive_bom_basis: {n}/{n} PASS")
