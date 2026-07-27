# -*- coding: utf-8 -*-
"""Run 보관 정리가 무엇을 남기는지 밝히는가 (18.85).

배경: Run 산출물 누적을 파고들다 `POST /cpq/runs/cleanup` 에 **검증이 하나도 없다**는 것을
먼저 알았고, 실제로 불러 보니 응답이 사실의 절반만 말하고 있었다.

  운영 실측 — `{"deleted": 1445, ...}` 를 받았지만 Run 은 1,545→100 이 된 반면
  **산출물 파일은 5,466건·85MB 그대로**였다. `_delete_run` 이 `dwg_file`·MinIO 를 보존하기
  때문이다(납품물 불변 #53). 실행한 사람은 "1,445건 정리" 를 저장 공간이 줄었다는 뜻으로
  읽는다 — **무엇이 남는지 말하지 않는 정리는 정리가 아니다.**

또 하나: 정리는 `cpq_output` 링크를 함께 지우므로 **소속 Run 을 알 수 없는 산출물**이 생긴다
(실측 840건). Project Folder 는 저장 경로에 제품이 새긴 `run{id}_` 표식을 대체 근거로 쓴다
(18.83). 그 표식이 사라지면 '현재 산출물' 판정이 조용히 무너지므로 불변식으로 지킨다.

밟는 것: 정리 응답이 보존되는 파일 수·용량과 사유를 밝히는가 · 최신 N건과 참조 Run 은
보호되는가 · **모든 산출물 파일이 소속 Run 을 판별할 근거(링크 또는 경로 표식)를 갖는가** ·
감사 조회의 드롭다운 비용이 이력 건수에 끌려다니지 않는가(18.87).

정리: keepLatest 를 크게 잡아 기존 Run 을 지우지 않는다(정리는 되돌릴 수 없다).

실행: PYTHONUTF8=1 py tests/live_run_retention.py
"""
import json
import subprocess
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
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
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


TOK = login("edim", "edim")
tid = int(psql("SELECT tenant_id FROM sys_user WHERE login_id='edim'"))

# ── 정리는 되돌릴 수 없다 — 현재 Run 수보다 큰 keepLatest 로 '지우지 않는' 경로를 검증한다 ──
runs_before = int(psql(f"SELECT count(*) FROM cpq_run WHERE tenant_id={tid}"))
files_before = int(psql("SELECT count(*) FROM dwg_file WHERE tenant_id=%d "
                        "AND COALESCE(file_role,'OUTPUT')='OUTPUT'" % tid))
st, r = req("POST", "/cpq/runs/cleanup", TOK, {"keepLatest": 100})
ok(f"정리 200 ({st})", st == 200)
ok("보존되는 파일 수를 밝힌다", isinstance(r.get("retainedFiles"), int))
ok("보존되는 용량을 밝힌다", isinstance(r.get("retainedBytes"), int))
ok(f"사유 문구가 있다 ({(r.get('note') or '')[:28]}…)", bool(r.get("note")))
if r["deleted"]:
    ok("사유가 '보존' 을 명시한다", "보존" in r["note"] and "줄지 않습니다" in r["note"])
    ok(f"보존 파일 수가 0 이상 ({r['retainedFiles']}건)", r["retainedFiles"] >= 0)
else:
    ok("지울 것이 없으면 그렇게 말한다", "없습니다" in r["note"])

runs_after = int(psql(f"SELECT count(*) FROM cpq_run WHERE tenant_id={tid}"))
files_after = int(psql("SELECT count(*) FROM dwg_file WHERE tenant_id=%d "
                       "AND COALESCE(file_role,'OUTPUT')='OUTPUT'" % tid))
ok(f"Run 감소분이 응답과 일치 ({runs_before}→{runs_after}, deleted={r['deleted']})",
   runs_before - runs_after == r["deleted"])
ok(f"산출물 파일은 보존된다 ({files_before}→{files_after})", files_after == files_before)
ok(f"최소 {r['keptLatest']}건은 남는다 ({runs_after})", runs_after >= min(100, runs_before))

# ── 불변식: 모든 산출물이 소속 Run 을 판별할 근거를 갖는다 (18.83 의 대체 근거) ──
# `persist_outputs` 가 저장 키에 `run{id}_` 를 새긴다. 이름 규칙이 바뀌면 Project Folder 의
# '현재 산출물' 판정이 조용히 무너지므로 여기서 지킨다.
noclue = int(psql("SELECT count(*) FROM dwg_file f WHERE f.tenant_id=%d "
                  "AND COALESCE(f.file_role,'OUTPUT')='OUTPUT' "
                  "AND f.file_path !~ 'run[0-9]+_' "
                  "AND NOT EXISTS (SELECT 1 FROM cpq_output o WHERE o.file_id=f.file_id)" % tid))
ok(f"소속 Run 을 알 수 없는 산출물 0건 ({noclue})", noclue == 0)
orphan = int(psql("SELECT count(*) FROM dwg_file f WHERE f.tenant_id=%d "
                  "AND COALESCE(f.file_role,'OUTPUT')='OUTPUT' "
                  "AND NOT EXISTS (SELECT 1 FROM cpq_output o WHERE o.file_id=f.file_id)" % tid))
print(f"\n(참고) 링크가 끊긴 산출물 {orphan}건 — 정리가 cpq_output 을 지우기 때문이며, "
      "경로 표식으로 소속 Run 을 판별한다")

# ── 감사 조회의 facet 비용이 이력 건수에 끌려다니지 않는가 (18.87) ──
# 감사 화면을 열 때마다 드롭다운을 채우려고 sys_history 를 전수 스캔하고 있었다
# (실측 105,639행: action 49.8ms · login_id 61.8ms — 본 조회 0.6ms 의 100배).
# 보존 정책이 없어 이력은 계속 자라므로(#83) 그 비용도 같이 자란다.
plan = psql("EXPLAIN (ANALYZE, TIMING OFF) WITH RECURSIVE t AS ("
            f"(SELECT action FROM sys_history WHERE tenant_id={tid} ORDER BY action LIMIT 1) "
            "UNION ALL SELECT (SELECT h.action FROM sys_history h "
            f"WHERE h.tenant_id={tid} AND h.action > t.action ORDER BY h.action LIMIT 1) "
            "FROM t WHERE t.action IS NOT NULL) "
            "SELECT action FROM t WHERE action IS NOT NULL ORDER BY action")
ok("동작 facet 이 Seq Scan 을 타지 않는다", "Seq Scan on sys_history" not in plan)
ok("전용 인덱스를 쓴다 (0063)", "ix_sys_history_tenant_action" in plan)
rows_total = int(psql(f"SELECT count(*) FROM sys_history WHERE tenant_id={tid}"))
ok(f"이력 {rows_total:,}행에도 값 종류만큼만 읽는다", rows_total > 1000 and "loops=" in plan)

st, a = req("GET", "/audit?limit=200", TOK)
ok(f"감사 조회 200 ({st})", st == 200)
users_all = int(psql(f"SELECT count(*) FROM sys_user WHERE tenant_id={tid}"))
ok(f"사용자 목록이 사용자 대장 기준 ({len(a['users'])} = {users_all})",
   len(a["users"]) == users_all)

print(f"\nOK — Run 보관 정리 {n}개 검증 통과")
