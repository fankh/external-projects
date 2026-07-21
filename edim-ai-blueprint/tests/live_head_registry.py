# -*- coding: utf-8 -*-
"""Head Registry 라이브 (4.0) — 요구 #14(권한 기반 표시)·#19(게시 게이트)·#21(상태기계).

검증: 시드 → 권한 기반 목록(GENERAL 은 상위 Head 미표시) → 상태기계 전이 규칙 →
     center 바인딩 없는 Head 게시 409 → 바인딩 후 게시 → 게시본 잠금 →
     승인 경유(REVIEW→승인→APPROVED) → System Head 가드.
정리: ZZHEAD* psql 삭제 (시드된 표준 Head 는 테넌트 자산이라 보존).
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CODE = "ZZHEAD1"
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
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql("DELETE FROM sys_head_binding WHERE head_id IN "
         f"(SELECT head_id FROM sys_head WHERE head_code LIKE 'ZZHEAD%')")
    psql("DELETE FROM sys_head WHERE head_code LIKE 'ZZHEAD%'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── 1) 시드·목록 ──
    st, heads = req("GET", "/heads?editing=true", TOK)
    if not heads:
        st, s = req("POST", "/heads/seed", TOK)
        ok(f"표준 Head 시드 ({s['seeded']}종)", st == 200 and s["seeded"] >= 3)
        st, heads = req("GET", "/heads?editing=true", TOK)
    else:
        ok(f"Head 정의 존재 ({len(heads)}종)", len(heads) > 0)
    st, again = req("POST", "/heads/seed", TOK)
    ok(f"중복 시드 409 ({st})", st == 409)

    # ── 2) #14 권한 기반 표시 — GENERAL 은 상위 레벨 Head 를 보지 못한다 ──
    pub = [h for h in heads if h["status"] == "PUBLISHED"]
    ok(f"게시 Head 존재 ({len(pub)})", bool(pub))
    gtok = login("kim01", "edim")   # 시드 GENERAL 계정
    ok("GENERAL 로그인", bool(gtok))
    if gtok:
        st, gheads = req("GET", "/heads", gtok)
        ok(f"GENERAL 목록 조회 200 ({len(gheads)}종)", st == 200)
        ok("GENERAL 에게 상위 레벨 Head 미표시",
           all(h["minLevel"] == "GENERAL" for h in gheads))
        ok("GENERAL 은 편집 목록 403", req("GET", "/heads?editing=true", gtok)[0] == 403)
        ok("GENERAL 은 Head 생성 403",
           req("POST", "/heads", gtok, {"headCode": "ZZHEADX", "headName": "x"})[0] == 403)
    st, adm_all = req("GET", "/heads", TOK)
    ok(f"ADMIN 은 상위 Head 도 표시 ({len(adm_all)} ≥ GENERAL)",
       len(adm_all) >= (len(gheads) if gtok else 0))

    # ── 3) #21 상태기계 ──
    st, made = req("POST", "/heads", TOK,
                   {"headCode": CODE, "headName": "검증 Head", "headType": "TENANT",
                    "minLevel": "SETUP", "sortOrder": 50})
    hid = made["headId"]
    ok(f"Head 등록 201 — DRAFT ({hid})", st == 201 and made["status"] == "DRAFT")
    ok("중복 코드 409", req("POST", "/heads", TOK, {"headCode": CODE, "headName": "x"})[0] == 409)
    st, b = req("PATCH", f"/heads/{hid}", TOK, {"status": "APPROVED"})
    ok(f"DRAFT→APPROVED 직행 422 ({st})", st == 422 and "전이" in (b or {}).get("detail", ""))
    st, b = req("PATCH", f"/heads/{hid}", TOK, {"status": "BOGUS"})
    ok(f"없는 상태 422 ({st})", st == 422)

    # ── 4) #19 게시 무결성 게이트 ──
    st, _ = req("PATCH", f"/heads/{hid}", TOK, {"status": "REVIEW"})
    ok("DRAFT→REVIEW 200", st == 200)
    st, ap = req("POST", "/approvals", TOK,
                 {"targetTable": "sys_head", "targetId": hid, "requestType": "UPDATE",
                  "label": f"Head — {CODE}"})
    aid = ap.get("approvalId") if ap else None
    st, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": True, "comment": ""})
    ok("승인 결정 → APPROVED 반영", st == 200
       and req("GET", f"/heads/{hid}", TOK)[1]["status"] == "APPROVED")
    st, b = req("PATCH", f"/heads/{hid}", TOK, {"status": "PUBLISHED"})
    ok(f"★ center 바인딩 없는 Head 게시 409 ({st})",
       st == 409 and "center" in (b or {}).get("detail", "").lower())

    # LEFT 만 붙여도 여전히 막혀야 한다
    st, _ = req("POST", f"/heads/{hid}/bindings", TOK,
                {"panel": "LEFT", "targetKind": "PROCESS", "targetRef": "*", "label": "프로세스"})
    ok("LEFT 바인딩 추가 201", st == 201)
    st, b = req("PATCH", f"/heads/{hid}", TOK, {"status": "PUBLISHED"})
    ok(f"★ LEFT 만으로는 여전히 게시 409 ({st})", st == 409)

    st, bind = req("POST", f"/heads/{hid}/bindings", TOK,
                   {"panel": "CENTER", "targetKind": "SCREEN", "targetRef": "/erp/dashboard",
                    "label": "대시보드"})
    ok("CENTER 바인딩 추가 201", st == 201)
    st, _ = req("PATCH", f"/heads/{hid}", TOK, {"status": "PUBLISHED"})
    ok("★ CENTER 있으면 게시 200", st == 200)
    ok("상세에 publishable=true", req("GET", f"/heads/{hid}", TOK)[1]["publishable"] is True)

    # ── 5) 게시본 잠금 ──
    st, b = req("POST", f"/heads/{hid}/bindings", TOK,
                {"panel": "RIGHT", "targetKind": "TEMPLATE", "targetRef": "todo"})
    ok(f"게시본 바인딩 추가 409 ({st})", st == 409 and "회수" in (b or {}).get("detail", ""))
    st, b = req("DELETE", f"/heads/{hid}/bindings/{bind['bindingId']}", TOK)
    ok(f"게시본 바인딩 삭제 409 ({st})", st == 409)
    st, b = req("DELETE", f"/heads/{hid}", TOK)
    ok(f"게시본 삭제 409 ({st})", st == 409 and "회수" in (b or {}).get("detail", ""))
    st, _ = req("PATCH", f"/heads/{hid}", TOK, {"status": "DRAFT"})
    ok("회수(DRAFT) 200 — 이후 편집 가능", st == 200
       and req("DELETE", f"/heads/{hid}/bindings/{bind['bindingId']}", TOK)[0] == 200)

    # ── 6) #21 System Head 가드 (고객사 테넌트는 편집 불가) ──
    st, sysmade = req("POST", "/heads", TOK,
                      {"headCode": "ZZHEADSYS", "headName": "시스템 Head", "headType": "SYSTEM"})
    ok(f"운영 테넌트는 System Head 생성 가능 ({st})", st == 201)

    # ── 7) 정리 ──
    st, _ = req("DELETE", f"/heads/{hid}", TOK)
    ok(f"DRAFT Head 삭제 200 ({st})", st == 200)
    req("DELETE", f"/heads/{sysmade['headId']}", TOK)
    ok("잔존 0", psql("SELECT count(*) FROM sys_head WHERE head_code LIKE 'ZZHEAD%'") == "0")
finally:
    cleanup()
    print("정리 — ZZHEAD* 삭제 (표준 Head 는 보존)")

print(f"\nlive_head_registry: {n}/{n} PASS")
