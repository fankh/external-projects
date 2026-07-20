# -*- coding: utf-8 -*-
"""Snapshot 체계 라이브 (1.7) — 요구 #9 실행 결과 고정·재현.

검증: Run 실행 → 고정(checksum) → 재고정 v2 → 조회/목록 → 검증(무결·drift 0)
     → 원본 변화 시 drift 보고 → Handoff 자동 고정·연결 → 정리.
"""
import json
import subprocess
import time
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


def psql(sql):
    r = subprocess.run(["ssh", "edim-server",
                        f"sudo docker exec edim-postgres psql -U edim -d edim -tAc \"{sql}\""],
                       capture_output=True, text=True, timeout=40)
    return (r.stdout or "").strip()


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=180) as resp:
        return json.loads(resp.read() or b"null")


r0 = urllib.request.Request(f"{API}/auth/login",
                            data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
                            headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]

psql("DELETE FROM sys_approval_request WHERE target_table='erp_handoff' AND comment LIKE '%SNAP-SUITE%'")
rid = None

try:
    ok("alembic 0032 자동 적용", "0032_snapshot_registry" in psql("SELECT version_num FROM alembic_version"))

    run = req("POST", "/cpq/runs", {"runType": "ALL", "isTest": True})
    rid = run["runId"]
    for _ in range(60):
        st = req("GET", f"/cpq/runs/{rid}")
        if st["status"] != "RUNNING":
            break
        time.sleep(0.8)
    ok(f"테스트 Run #{rid} SUCCESS", st["status"] == "SUCCESS")

    # 1) 고정 — checksum·BOM 행수
    s1 = req("POST", "/snapshots", {"runId": rid, "note": "SNAP-SUITE 1차"})
    ok(f"Snapshot 고정 {s1['snapshotCode']} (BOM {s1['bomRows']}행·checksum {s1['checksum'][:8]})",
       s1["version"] == 1 and len(s1["checksum"]) == 64 and s1["bomRows"] > 0)

    # 2) 재고정 = 새 버전 (기존 불변)
    s2 = req("POST", "/snapshots", {"runId": rid, "note": "SNAP-SUITE 2차"})
    ok(f"재고정 v{s2['version']} — 기존 v1 보존",
       s2["version"] == 2 and s2["snapshotId"] != s1["snapshotId"])

    # 3) 조회·목록
    full = req("GET", f"/snapshots/{s1['snapshotId']}")
    ok("Snapshot 조회 — payload 동결 내용",
       full["payload"]["runId"] == rid and full["payload"]["bomRows"] == s1["bomRows"]
       and "bom" in full["payload"] and "costs" in full["payload"])
    lst = req("GET", f"/snapshots?sourceId={rid}")
    ok(f"목록 필터 ({len(lst)}건)", len(lst) == 2 and lst[0]["snapshotCode"].startswith("SNAP-R"))

    # 4) 검증 — 무결·drift 0 (원본 그대로)
    v1 = req("GET", f"/snapshots/{s1['snapshotId']}/verify")
    ok(f"검증 — 무결 {v1['intact']}·drift {v1['driftCount']}",
       v1["intact"] and v1["sourceExists"] and v1["driftCount"] == 0 and v1["reproducible"])

    # 5) 원본 변화 → drift 보고 (Snapshot 자체는 불변)
    psql(f"UPDATE cpq_run SET bom_snapshot = (bom_snapshot - 0) WHERE run_id={rid}")
    v2 = req("GET", f"/snapshots/{s1['snapshotId']}/verify")
    ok(f"원본 변경 후 drift 검출 ({v2['driftCount']}건: {[d['field'] for d in v2['drift']]})",
       v2["intact"] and v2["driftCount"] >= 1 and any(d["field"] == "bomRows" for d in v2["drift"]))
    full2 = req("GET", f"/snapshots/{s1['snapshotId']}")
    ok("Snapshot 불변 — 동결 값 유지",
       full2["payload"]["bomRows"] == s1["bomRows"] and full2["checksum"] == s1["checksum"])

    # 6) Handoff 자동 고정·연결 (요구: ERP 는 Snapshot 근거로 수신)
    h = req("POST", "/erp/handoffs", {"runId": rid})
    ok(f"Handoff 자동 Snapshot {h['snapshotCode']}", bool(h.get("snapshotId")))
    hl = next(x for x in req("GET", "/erp/handoffs") if x["handoffId"] == h["handoffId"])
    ok("Handoff 목록에 Snapshot 병기", hl["snapshotCode"] == h["snapshotCode"])
    linked = next(x for x in req("GET", "/snapshots") if x["snapshotId"] == h["snapshotId"])
    ok("Snapshot 목록 ERP 연계 표시", linked["handedOff"] is True)

    # 7) 없는 Snapshot 404
    try:
        req("GET", "/snapshots/99999999/verify")
        ok("미존재 Snapshot 404", False)
    except urllib.error.HTTPError as e:
        ok("미존재 Snapshot 404", e.code == 404)
finally:
    psql("DELETE FROM sys_approval_request WHERE target_table='erp_handoff' AND comment LIKE '%ERP Handoff%'")
    psql("DELETE FROM erp_handoff")
    if rid:
        psql(f"DELETE FROM sys_snapshot WHERE source_id={rid}")
        try:
            req("DELETE", f"/cpq/runs/{rid}")
        except Exception:  # noqa: BLE001
            pass
    for x in req("GET", "/notifications?limit=50"):
        if not x.get("read") and "Handoff" in x.get("title", ""):
            req("POST", f"/notifications/{x['id']}/read")
    print("정리 — Snapshot·handoff·승인·알림·Run 잔재 삭제", flush=True)

print(f"\nlive_snapshot: {n}/{n} PASS")
