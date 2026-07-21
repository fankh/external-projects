# -*- coding: utf-8 -*-
"""Set-up↔Operation Lock · 다중 사용자 세션 라이브 (7.8) — 요구 #12.

검증 두 축:
  A) Set-up Version — 게시 → 무변경 재게시 409 → **Set-up 을 실제로 바꾼 뒤 drift 감지** →
     재게시 시 이전 버전 SUPERSEDED. (저장값끼리 비교하는 무의미한 검증이 되지 않도록,
     drift 는 살아 있는 Set-up 을 다시 지문화해 비교한다 — 2.7a 교훈)
  B) Work Lock — 획득 → 남이 같은 자원 409(보유자·만료 명시) → 본인 재획득은 연장 →
     **점유 중 남의 쓰기 차단** → 해제 후 통과 → 만료분 자동 정리 → 권한.
정리: ZZLOCK* 그룹·점유·테스트 게시본 psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
GRP = "ZZLOCKG"
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
    psql("DELETE FROM sys_work_lock WHERE resource_key LIKE 'ZZLOCK%'")
    psql("DELETE FROM code_item_value WHERE item_id IN (SELECT item_id FROM code_item "
         "WHERE group_id IN (SELECT group_id FROM code_group WHERE group_code LIKE 'ZZLOCK%'))")
    psql("DELETE FROM sys_approval_request WHERE target_table='code_item' AND target_id IN "
         "(SELECT item_id FROM code_item WHERE group_id IN "
         "(SELECT group_id FROM code_group WHERE group_code LIKE 'ZZLOCK%'))")
    psql("DELETE FROM code_item WHERE group_id IN "
         "(SELECT group_id FROM code_group WHERE group_code LIKE 'ZZLOCK%')")
    psql("DELETE FROM code_group WHERE group_code LIKE 'ZZLOCK%'")
    psql("DELETE FROM sys_setup_version WHERE note LIKE 'ZZLOCK%'")
    # 테스트가 밀어낸 기존 게시본을 되돌린다 (남의 상태를 바꿔 두지 않는다)
    psql("UPDATE sys_setup_version SET status='PUBLISHED' WHERE setup_version_id IN "
         "(SELECT DISTINCT ON (tenant_id) setup_version_id FROM sys_setup_version "
         "ORDER BY tenant_id, version_no DESC)")


TOK = login("edim", "edim")          # ADMIN
OTH = login("setup1", "edim")        # 같은 테넌트 다른 SETUP 사용자
cleanup()

try:
    # ── A. Set-up Version ──
    st, before = req("GET", "/setup/versions", TOK)
    ok(f"버전 조회 200 (게시 {len(before['versions'])}건)", st == 200 and "liveChecksum" in before)
    ok(f"살아 있는 지문 계산됨 ({before['liveCounts']})", len(before["liveChecksum"]) == 64)

    st, v1 = req("POST", "/setup/versions/publish", TOK, {"note": "ZZLOCK v1"})
    ok(f"★ Set-up 게시 201 — v{v1.get('versionNo')}", st == 201 and len(v1["checksum"]) == 64)

    st, dup = req("POST", "/setup/versions/publish", TOK, {"note": "ZZLOCK dup"})
    ok(f"★ 무변경 재게시 409 ({st})", st == 409 and "변경 없음" in (dup or {}).get("detail", ""))

    st, after = req("GET", "/setup/versions", TOK)
    ok("게시 직후 drift 없음", after["drift"] is False
       and after["active"]["checksum"] == v1["checksum"])

    # Set-up 을 실제로 바꾼다 → drift 가 살아나야 한다
    st, _ = req("POST", "/codes/groups", TOK,
                {"groupCode": GRP, "groupName": "락 검증 그룹", "hierarchyAddress": "9.9"})
    ok(f"Set-up 변경(그룹 신설) {st}", st in (200, 201))
    st, drifted = req("GET", "/setup/versions", TOK)
    ok("★ Set-up 변경 후 drift 감지", drifted["drift"] is True
       and drifted["liveChecksum"] != v1["checksum"])
    ok("변경이 건수에도 드러남",
       drifted["liveCounts"]["groups"] == before["liveCounts"]["groups"] + 1)

    st, v2 = req("POST", "/setup/versions/publish", TOK, {"note": "ZZLOCK v2"})
    ok(f"★ 변경 후 재게시 201 — v{v2.get('versionNo')}", st == 201 and v2["versionNo"] == v1["versionNo"] + 1)
    ok("이전 버전 SUPERSEDED",
       psql(f"SELECT status FROM sys_setup_version WHERE setup_version_id={v1['setupVersionId']}")
       == "SUPERSEDED")
    ok("게시본은 하나만 활성",
       psql("SELECT count(*) FROM sys_setup_version WHERE status='PUBLISHED' "
            "AND tenant_id=(SELECT tenant_id FROM sys_setup_version WHERE setup_version_id="
            f"{v2['setupVersionId']})") == "1")
    st, redrift = req("GET", "/setup/versions", TOK)
    ok("재게시 후 drift 해소", redrift["drift"] is False)

    # ── B. Work Lock ──
    st, lk = req("POST", "/locks", TOK,
                 {"resourceKind": "CODE_GROUP", "resourceKey": GRP, "minutes": 30,
                  "note": "ZZLOCK 편집"})
    lid = lk["lockId"]
    ok(f"★ 점유 획득 201 (만료 {lk.get('expiresAt')})", st == 201)

    st, con = req("POST", "/locks", OTH,
                  {"resourceKind": "CODE_GROUP", "resourceKey": GRP, "minutes": 10})
    ok(f"★ 남의 자원 점유 409 ({st})", st == 409 and "편집 중" in (con or {}).get("detail", ""))
    ok(f"거부 사유에 보유자·만료 명시 ({(con or {}).get('detail','')[:60]})",
       "님이" in con["detail"] and "까지" in con["detail"])

    st, again = req("POST", "/locks", TOK,
                    {"resourceKind": "CODE_GROUP", "resourceKey": GRP, "minutes": 60})
    ok("본인 재획득은 연장(중복 생성 아님)", st == 201 and again["lockId"] == lid)
    ok("행은 하나만",
       psql(f"SELECT count(*) FROM sys_work_lock WHERE resource_key='{GRP}'") == "1")

    # 점유 중 남의 쓰기는 막힌다 — 조용히 덮지 않는다
    st, blocked = req("POST", f"/codes/groups/{GRP}/items", OTH,
                      {"slot": "", "name": "남이 쓰는 항목", "values": []})
    ok(f"★ 점유 중 남의 쓰기 409 ({st})", st == 409 and "편집 중" in (blocked or {}).get("detail", ""))
    st, mine = req("POST", f"/codes/groups/{GRP}/items", TOK,
                   {"slot": "", "name": "보유자 항목", "values": ["V1"]})
    ok(f"★ 보유자 본인 쓰기는 통과 ({st})", st == 201)

    st, lst = req("GET", "/locks", TOK)
    row = next((x for x in lst if x["resourceKey"] == GRP), None)
    ok(f"목록에 보유자 표시 ({row and row['holderName']})", row and row["holderName"])

    # 해제 권한
    st, _ = req("DELETE", f"/locks/{lid}", OTH)
    ok(f"타인 해제 거부 403 ({st})", st == 403)
    st, _ = req("DELETE", f"/locks/{lid}", TOK)
    ok("보유자 해제 200", st == 200)
    st, freed = req("POST", f"/codes/groups/{GRP}/items", OTH,
                    {"slot": "", "name": "해제 후 항목", "values": []})
    ok(f"★ 해제 후 남의 쓰기 통과 ({st})", st == 201)

    # 만료는 자동 정리된다
    st, lk2 = req("POST", "/locks", OTH,
                  {"resourceKind": "CODE_GROUP", "resourceKey": GRP, "minutes": 5})
    psql(f"UPDATE sys_work_lock SET expires_at=now() - interval '1 min' WHERE lock_id={lk2['lockId']}")
    st, taken = req("POST", "/locks", TOK, {"resourceKind": "CODE_GROUP", "resourceKey": GRP})
    ok(f"★ 만료 점유는 자동 정리 후 재획득 ({st})", st == 201)
    req("DELETE", f"/locks/{taken['lockId']}", TOK)

    # 입력 검증·권한
    st, b = req("POST", "/locks", TOK, {"resourceKind": "NOPE", "resourceKey": "X"})
    ok(f"알 수 없는 자원 종류 422 ({st})", st == 422)
    st, b = req("POST", "/locks", TOK, {"resourceKind": "CODE_GROUP", "resourceKey": "  "})
    ok(f"빈 자원 키 422 ({st})", st == 422)
    st, _ = req("DELETE", "/locks/99999999", TOK)
    ok(f"없는 점유 404 ({st})", st == 404)

    gtok = login("kim01", "edim")
    st, _ = req("POST", "/setup/versions/publish", gtok, {"note": "ZZLOCK ng"})
    ok(f"GENERAL 게시 403 ({st})", st == 403)
    st, _ = req("GET", "/setup/versions", gtok)
    ok("GENERAL 조회는 허용", st == 200)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM sys_work_lock WHERE resource_key LIKE 'ZZLOCK%'")
    lg = psql("SELECT count(*) FROM code_group WHERE group_code LIKE 'ZZLOCK%'")
    print(f"정리 — ZZLOCK* 삭제 (점유 {left} · 그룹 {lg})")

print(f"\nlive_setup_lock: {n}/{n} PASS")
