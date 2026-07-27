# -*- coding: utf-8 -*-
"""승인 결정의 동시 처리 안전 (18.97).

배경: P0 `Approval 상태기계` 를 점검하며 `_apply_decision` 을 읽었다. 결정은 **원자적
조건부 UPDATE**(`UPDATE … WHERE result IS NULL RETURNING …`)로 되어 있어 경합에 안전해
보인다 — 두 사람이 동시에 눌러도 한 쪽만 행을 얻고 나머지는 `None` → 404 다.

그런데 이 저장소는 같은 종류의 문제를 채번에서 이미 겪었고(9.18 프로젝트 PS 채번, 9.19 ECO
채번), 그때도 "코드를 보면 안전해 보인다" 가 근거가 아니었다 — **동시에 눌러 봐야** 안다.
승인은 자산 상태를 바꾸는 행위라 두 번 적용되면 이력과 상태가 어긋난다.

밟는 것: 같은 요청에 동시 결정 N건 → **정확히 1건만 성공** · 나머지는 404(처리 가능한 요청
없음) · 승인 행에 결정자·시각이 한 벌만 남는가 · 대상 자산이 두 번 전이되지 않았는가.

정리: 만든 제품 코드와 승인 요청을 지운다.

실행: PYTHONUTF8=1 py tests/live_approval_race.py
"""
import json
import subprocess
import threading
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
CODE = "ZZRACE-1"
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


def req(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}",
                                        "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def cleanup():
    psql("DELETE FROM sys_approval_request WHERE target_id IN "
         f"(SELECT product_code_id FROM product_code WHERE main_code='{CODE}')")
    psql("DELETE FROM sys_history WHERE target_table='product_code' AND target_id IN "
         f"(SELECT product_code_id FROM product_code WHERE main_code='{CODE}')")
    psql(f"DELETE FROM product_code WHERE main_code='{CODE}'")


TOK = login("edim", "edim")
tid = int(psql("SELECT tenant_id FROM sys_user WHERE login_id='edim'"))
cleanup()
try:
    # 승인 대상이 될 제품 코드 (DRAFT)
    st, c = req("POST", "/codes/products", TOK,
                # Slot 이 정의된 그룹은 수기 생성을 거부한다(#28) — Slot 없는 그룹을 쓴다.
                {"mainCode": CODE, "codeName": "ZZ 경합 검증", "groupCode": "GEN"})
    ok(f"대상 코드 생성 ({st})", st in (200, 201))
    pcid = int(psql(f"SELECT product_code_id FROM product_code WHERE main_code='{CODE}'"))

    st, a = req("POST", "/approvals", TOK,
                {"targetTable": "product_code", "targetId": pcid, "reqKind": "APPROVE",
                 "stage": "검증"})
    ok(f"승인 요청 생성 ({st})", st in (200, 201) and a.get("approvalId"))
    aid = a["approvalId"]

    # ── 같은 요청을 동시에 결정한다 ──
    results: list[int] = []
    lock = threading.Lock()

    def fire():
        s, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": True, "comment": ""})
        with lock:
            results.append(s)

    threads = [threading.Thread(target=fire) for _ in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    wins = [s for s in results if s == 200]
    lost = [s for s in results if s != 200]
    ok(f"동시 6건 중 성공 정확히 1건 ({results})", len(wins) == 1)
    ok(f"나머지는 처리 불가로 거부 ({sorted(set(lost))})", all(s == 404 for s in lost))

    # ── 결정 흔적이 한 벌만 남는가 ──
    row = psql(f"SELECT result||'|'||COALESCE(approver_id::text,'')||'|'||"
               f"(decided_at IS NOT NULL)::text FROM sys_approval_request WHERE approval_id={aid}")
    ok(f"승인 행에 결정 한 벌 ({row})", row.startswith("APPROVED|") and row.endswith("|true"))
    hist = psql("SELECT count(*) FROM sys_history WHERE target_table='product_code' "
                f"AND target_id={pcid} AND action IN ('APPROVE','APPROVED','DECIDE')")
    ok(f"자산 전이 이력이 중복되지 않는다 ({hist}건)", hist in ("0", "1"))
    status = psql(f"SELECT approval_status FROM product_code WHERE product_code_id={pcid}")
    ok(f"대상 상태가 한 번만 전이 ({status})", status == "APPROVED")
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM product_code WHERE main_code='{CODE}'")
    print(f"정리 — ZZRACE 코드·요청 삭제 (잔존 {left})", flush=True)

print(f"\nOK — 승인 동시 결정 {n}개 검증 통과")
