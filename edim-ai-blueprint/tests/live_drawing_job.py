# -*- coding: utf-8 -*-
"""Drawing Run Job 라이브 (7.6) — 요구 #54 "Snapshot 기준 재생성·Parameter Binding".

배경: Run 파이프라인은 실행 시점의 살아 있는 값으로 DXF 를 만들어, 과거 도면을 다시 뽑을 수 없었다.
검증: Job 등록(바인딩 필수) → Snapshot 근거 실행 → **재실행 결과 동일**(결정성) →
     풀리지 않는 바인딩 422 → 없는 Snapshot 404 → 권한 가드.
정리: ZZJOB* psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
JOB = "ZZJOB1"
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


def cleanup():
    psql("DELETE FROM dwg_run_job WHERE job_code LIKE 'ZZJOB%'")


TOK = login("edim", "edim")
cleanup()

try:
    st, snaps = req("GET", "/snapshots", TOK)
    ok(f"Snapshot 존재 ({len(snaps)}건)", st == 200 and snaps)
    sid = snaps[0]["snapshotId"]
    st, snap = req("GET", f"/snapshots/{sid}", TOK)
    payload = snap.get("payload") or {}
    ok("Snapshot payload 확보", bool(payload))

    # ── 등록 검증 ──
    st, b = req("POST", "/drawings/jobs", TOK,
                {"jobCode": JOB, "snapshotId": sid, "paramBindings": {}})
    ok(f"★ 바인딩 없는 Job 거부 422 ({st})", st == 422 and "바인딩" in (b or {}).get("detail", ""))
    st, b = req("POST", "/drawings/jobs", TOK,
                {"jobCode": JOB, "snapshotId": 99999999, "paramBindings": {"A": "bomRows"}})
    ok(f"없는 Snapshot 404 ({st})", st == 404)

    # payload 에 실재하는 수치 경로를 바인딩한다
    st, job = req("POST", "/drawings/jobs", TOK,
                  {"jobCode": JOB, "snapshotId": sid, "drawingNo": "KDCR 3-13",
                   "paramBindings": {"A": "bomRows", "B": "runId"}})
    jid = job["jobId"]
    ok(f"Job 등록 201 ({st})", st == 201 and job["status"] == "DRAFT")
    st, _ = req("POST", "/drawings/jobs", TOK,
                {"jobCode": JOB, "snapshotId": sid, "paramBindings": {"A": "bomRows"}})
    ok("중복 Job 코드 409", st == 409)

    # ── 실행: Snapshot 근거 ──
    st, r1 = req("POST", f"/drawings/jobs/{jid}/run", TOK)
    ok(f"★ Job 실행 200 — 산출 {r1.get('bytes')}B", st == 200 and r1["status"] == "DONE")
    ok(f"★ Snapshot 에서 파라미터 해석 ({r1['resolvedParams']})", r1["resolvedParams"])
    ck1 = r1["outputChecksum"]
    ok("산출물 체크섬 64자", len(ck1) == 64)

    # ── 결정성: 같은 Snapshot 재실행 = 같은 산출물 ──
    st, r2 = req("POST", f"/drawings/jobs/{jid}/run", TOK)
    ok("★ 재실행 결과 동일 (같은 Snapshot = 같은 도면)", r2["outputChecksum"] == ck1)

    st, lst = req("GET", "/drawings/jobs", TOK)
    row = next(x for x in lst if x["jobId"] == jid)
    ok("목록에 상태·체크섬 반영", row["status"] == "DONE" and row["outputChecksum"] == ck1)

    # ── 풀리지 않는 바인딩은 그리지 않고 알린다 ──
    st, bad = req("POST", "/drawings/jobs", TOK,
                  {"jobCode": "ZZJOB2", "snapshotId": sid,
                   "paramBindings": {"A": "nope.missing", "B": "bomRows"}})
    bid = bad["jobId"]
    st, b = req("POST", f"/drawings/jobs/{bid}/run", TOK)
    ok(f"★ 풀리지 않는 바인딩 422 ({st})",
       st == 422 and "파라미터를 풀 수 없" in (b or {}).get("detail", ""))
    ok("실패가 상태에 반영", psql(f"SELECT status FROM dwg_run_job WHERE job_id={bid}") == "FAILED")

    # 수치가 아닌 값도 거부
    st, bad2 = req("POST", "/drawings/jobs", TOK,
                   {"jobCode": "ZZJOB3", "snapshotId": sid, "paramBindings": {"A": "status"}})
    st, b = req("POST", f"/drawings/jobs/{bad2['jobId']}/run", TOK)
    ok(f"★ 수치 아닌 값 422 ({st})", st == 422 and "수치" in (b or {}).get("detail", ""))

    # ── 권한 ──
    gtok = login("kim01", "edim")
    st, _ = req("POST", "/drawings/jobs", gtok,
                {"jobCode": "ZZJOBX", "snapshotId": sid, "paramBindings": {"A": "bomRows"}})
    ok(f"GENERAL Job 등록 403 ({st})", st == 403)
    st, _ = req("POST", f"/drawings/jobs/{jid}/run", gtok)
    ok(f"GENERAL 실행 403 ({st})", st == 403)
    st, _ = req("GET", "/drawings/jobs", gtok)
    ok("GENERAL 조회는 허용", st == 200)
    st, _ = req("POST", "/drawings/jobs/99999999/run", TOK)
    ok(f"없는 Job 404 ({st})", st == 404)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM dwg_run_job WHERE job_code LIKE 'ZZJOB%'")
    print(f"정리 — ZZJOB* 삭제 (잔존 {left})")

print(f"\nlive_drawing_job: {n}/{n} PASS")
