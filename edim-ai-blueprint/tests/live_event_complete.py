# -*- coding: utf-8 -*-
"""업무 이벤트 완료 권한·기록 라이브 (8.2) — ERP-030.

배경: /erp/events/{id}/complete 는 등급 요구도 담당자 확인도 없어, 로그인한 사람이면
누구나 **남의 업무**를 완료 처리할 수 있었고 누가 눌렀는지도 남지 않았다
(재배정·에스컬레이션은 이미 감사에 남는데 정작 업무를 닫는 행위만 비어 있었다).

검증: 담당자 아닌 GENERAL → 403(담당자 이름 명시) / 담당자 본인 → 200 /
     SETUP 이상 대리 완료 → 200 + onBehalf 기록 / 담당자 없는 이벤트 → 통과(미설정=허용) /
     완료가 감사에 남는가.
정리: 생성한 이벤트 psql 삭제.
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


def mk_event(assignee_login=None):
    """검증용 이벤트 직접 생성 — 기존 proc_def/project 를 재사용한다."""
    who = (f"(SELECT user_id FROM sys_user WHERE login_id='{assignee_login}' LIMIT 1)"
           if assignee_login else "NULL")
    # psql 은 RETURNING 값 뒤에 'INSERT 0 1' 태그도 찍는다 — 첫 줄만 취한다
    out = psql(
        "INSERT INTO erp_process_event (tenant_id, proc_def_id, project_id, ref_type, ref_id, "
        f"status, assignee_id, data) SELECT tenant_id, proc_def_id, project_id, 'ZZEVT', 0, "
        f"'OPEN', {who}, '{{}}'::jsonb FROM erp_process_event LIMIT 1 RETURNING event_id")
    return out.splitlines()[0].strip()


def cleanup():
    psql("DELETE FROM sys_history WHERE target_table='erp_process_event' AND target_id IN "
         "(SELECT event_id FROM erp_process_event WHERE ref_type='ZZEVT')")
    psql("DELETE FROM erp_process_event WHERE ref_type='ZZEVT'")


TOK = login("edim", "edim")     # ADMIN
GEN = login("kim01", "edim")    # GENERAL — 담당자 아님
cleanup()

try:
    base = psql("SELECT count(*) FROM erp_process_event")
    ok(f"기존 이벤트 존재 ({base}건) — 템플릿 재사용 가능", int(base) > 0)

    # ── 담당자가 지정된 이벤트 ──
    e1 = mk_event("lee.t")       # 담당자 = lee.t (GENERAL)
    ok(f"담당자 지정 이벤트 생성 ({e1})", e1.isdigit())

    st, b = req("POST", f"/erp/events/{e1}/complete", GEN, {"comment": "남의 업무 완료 시도"})
    ok(f"★ 담당자 아닌 GENERAL 완료 거부 403 ({st})", st == 403)
    ok(f"거부 사유에 담당자 명시 ({(b or {}).get('detail','')[:50]})",
       "Lee" in (b or {}).get("detail", "") or "담당자" in (b or {}).get("detail", ""))
    ok("거부 후 상태 유지(OPEN)",
       psql(f"SELECT status FROM erp_process_event WHERE event_id={e1}") != "DONE")

    # 담당자 본인은 완료할 수 있다
    LEE = login("lee.t", "edim")
    st, r1 = req("POST", f"/erp/events/{e1}/complete", LEE, {"comment": "본인 완료"})
    ok(f"★ 담당자 본인 완료 200 ({st})", st == 200 and r1["status"] == "DONE")
    ok(f"완료자 기록 ({r1.get('completedBy')})", r1["completedBy"] == "lee.t")
    ok("완료가 감사에 남음",
       psql("SELECT count(*) FROM sys_history WHERE target_table='erp_process_event' "
            f"AND target_id={e1} AND action='EVENT_COMPLETE'") == "1")
    ok("data 에 완료자 보존",
       "lee.t" in psql(f"SELECT data::text FROM erp_process_event WHERE event_id={e1}"))

    # ── SETUP 이상은 대리 완료 가능(감독 권한) ──
    e2 = mk_event("lee.t")
    st, r2 = req("POST", f"/erp/events/{e2}/complete", TOK, {"comment": "관리자 대리 완료"})
    ok(f"★ SETUP 이상 대리 완료 200 ({st})", st == 200)
    ok("대리 완료가 onBehalf 로 구분됨",
       "true" in psql("SELECT after_data::text FROM sys_history WHERE target_table="
                      f"'erp_process_event' AND target_id={e2} AND action='EVENT_COMPLETE'").lower())

    # ── 담당자 없는 이벤트는 종전대로 통과 (미설정 = 허용) ──
    e3 = mk_event(None)
    st, r3 = req("POST", f"/erp/events/{e3}/complete", GEN, {"comment": "무담당 완료"})
    ok(f"★ 담당자 없는 이벤트는 GENERAL 도 완료 가능 ({st}) — 기존 운영 유지", st == 200)
    ok("무담당 완료도 감사에 남음",
       psql("SELECT count(*) FROM sys_history WHERE target_table='erp_process_event' "
            f"AND target_id={e3} AND action='EVENT_COMPLETE'") == "1")

    # ── 중복 완료·없는 이벤트 ──
    st, _ = req("POST", f"/erp/events/{e3}/complete", GEN, {"comment": "중복"})
    ok(f"이미 완료된 이벤트 404 ({st})", st == 404)
    st, _ = req("POST", "/erp/events/99999999/complete", TOK, {"comment": "x"})
    ok(f"없는 이벤트 404 ({st})", st == 404)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM erp_process_event WHERE ref_type='ZZEVT'")
    print(f"정리 — ZZEVT 이벤트 삭제 (잔존 {left})")

print(f"\nlive_event_complete: {n}/{n} PASS")
