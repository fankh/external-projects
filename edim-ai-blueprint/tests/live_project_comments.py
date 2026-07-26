# -*- coding: utf-8 -*-
"""프로젝트 대화(코멘트) 라이브 검증 (18.11) — 미검증 쓰기 경로 보강.

18.9 의 API 표면 실측에서 **플릿이 한 번도 두드리지 않는 쓰기 경로 8건**이 드러났고,
그중 업무 데이터를 다루는 것이 프로젝트 대화(등록·삭제)였다. 대화는 "이력 관리 — 수정 불가,
본인/ADMIN 만 삭제" 규약을 갖고 있는데 그 규약이 검증된 적이 없었다.

찾은 결함(18.11): 등록이 1000자에서 **조용히 잘렸다**(`text[:1000]`). 수정 불가이므로
잘린 뒤에는 되돌릴 수 없고, 사용자는 잃었다는 사실조차 모른다 → 상한 초과는 422 로 알린다.

밟는 것:
  · 등록 → 목록에 보임 · 작성자·본문 보존(잘리지 않음)
  · 빈 내용 422 · 상한 초과 422(자수·상한을 사유에 담는가) · 상한 경계는 통과
  · 없는 프로젝트 404
  · 남의 글은 GENERAL 이 지우지 못한다(403) · 본인은 지운다 · ADMIN 은 남의 글도 지운다
  · 삭제는 감사에 남는다(원본이 사라지므로 누가·무엇을 지웠는지)
정리: 만든 대화는 모두 삭제한다.

실행: PYTHONUTF8=1 py tests/live_project_comments.py
"""
import json
import subprocess
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
MARK = "ZZCMT"
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
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql(f"DELETE FROM sys_project_comment WHERE body LIKE '{MARK}%'")


ADMIN = login("edim", "edim")
GEN = login("kim01", "edim")
cleanup()

try:
    st, projects = req("GET", "/erp/projects", ADMIN)
    rows = projects if isinstance(projects, list) else (projects or {}).get("rows", [])
    ok(f"프로젝트 목록 조회 ({st})", st == 200 and rows)
    pno = rows[0].get("projectNo") or rows[0].get("project_no")
    ok(f"대상 프로젝트 확보 ({pno})", bool(pno))

    # ── 등록 → 목록 ──
    st, c1 = req("POST", f"/projects/{pno}/comments", ADMIN, {"body": f"{MARK} 관리자 메모"})
    ok(f"대화 등록 201 ({st})", st == 201 and c1.get("id"))
    cid1 = c1["id"]
    st, lst = req("GET", f"/projects/{pno}/comments", ADMIN)
    mine = next((x for x in lst if x["id"] == cid1), None)
    ok("목록에 즉시 반영", mine is not None)
    ok(f"작성자 기록 ({mine['author']})", mine["author"] == "edim")
    ok("본문 보존", mine["body"] == f"{MARK} 관리자 메모")

    # ── 입력 검증 ──
    st, b = req("POST", f"/projects/{pno}/comments", ADMIN, {"body": "   "})
    ok(f"빈 내용 422 ({st})", st == 422)
    st, _ = req("POST", "/projects/ZZNOPRJ-999/comments", ADMIN, {"body": f"{MARK} x"})
    ok(f"없는 프로젝트 404 ({st})", st == 404)

    # ★ 상한 초과는 잘라 저장하지 않고 알린다 (18.11)
    long_body = MARK + "가" * 1200
    st, b = req("POST", f"/projects/{pno}/comments", ADMIN, {"body": long_body})
    ok(f"★ 상한 초과 422 ({st}) — 수정 불가 대화를 조용히 자르지 않는다", st == 422)
    detail = (b or {}).get("detail", "")
    ok("거부 사유에 실제 자수와 상한이 있다", "1000" in detail and str(len(long_body)) in detail)
    ok("잘린 행이 생기지 않았다",
       psql(f"SELECT count(*) FROM sys_project_comment WHERE body LIKE '{MARK}가%'") == "0")
    # 경계값은 통과해야 한다 (과잉 차단 아님)
    edge = MARK + "나" * (1000 - len(MARK))
    st, ce = req("POST", f"/projects/{pno}/comments", ADMIN, {"body": edge})
    ok(f"상한 경계(1000자) 등록 201 ({st}) — 과잉 차단 아님", st == 201)
    st, lst = req("GET", f"/projects/{pno}/comments", ADMIN)
    got = next((x for x in lst if x["id"] == ce["id"]), None)
    ok("경계값 본문이 그대로 보존", got and len(got["body"]) == 1000)

    # ── 삭제 권한 ──
    st, cg = req("POST", f"/projects/{pno}/comments", GEN, {"body": f"{MARK} 일반 사용자 메모"})
    ok(f"GENERAL 도 등록 가능 ({st})", st == 201)
    cidg = cg["id"]
    st, _ = req("DELETE", f"/projects/comments/{cid1}", GEN)
    ok(f"★ 남의 글은 GENERAL 이 삭제 불가 403 ({st})", st == 403)
    st, _ = req("DELETE", f"/projects/comments/{cidg}", GEN)
    ok(f"본인 글은 삭제 가능 ({st})", st == 200)
    st, _ = req("DELETE", f"/projects/comments/{cid1}", ADMIN)
    ok(f"★ ADMIN 은 남의 글도 삭제 가능 ({st})", st == 200)
    st, _ = req("DELETE", f"/projects/comments/{cid1}", ADMIN)
    ok(f"이미 지운 글 404 ({st})", st == 404)

    # ── 삭제는 감사에 남는다 (원본이 사라지므로) ──
    hit = psql("SELECT count(*) FROM sys_history WHERE target_table='sys_project_comment' "
               f"AND action='DELETE' AND target_id IN ({cid1},{cidg})")
    ok(f"★ 삭제가 감사에 남는다 ({hit}건)", hit == "2")
    before = psql("SELECT before_data::text FROM sys_history "
                  "WHERE target_table='sys_project_comment' AND action='DELETE' "
                  f"AND target_id={cidg} LIMIT 1")
    ok("감사에 원본 작성자·본문이 보존", "kim01" in before and MARK in before)
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM sys_project_comment WHERE body LIKE '{MARK}%'")
    print(f"정리 — {MARK}* 대화 삭제 (잔존 {left})")

print(f"\nlive_project_comments: {n}/{n} PASS")
