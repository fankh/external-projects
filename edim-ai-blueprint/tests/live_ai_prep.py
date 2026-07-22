# -*- coding: utf-8 -*-
"""AI 학습·RCCS Data 정리 거버넌스 라이브 (9.0) — 요구 #66·#67.

실제 추출·생성 모델은 크레딧 대기·2차라 제외하고, 근거 문서의 **불변식**만 실증한다:
  1) 교차 테넌트 차단 — 고객 A 의 조회에 고객 B 의 프로젝트가 절대 나오지 않는다
  2) 항상 Draft — AI 후보는 DRAFT 로만 생성되고, 검증 전에는 Package 로 묶을 수 없다
  3) 역할 분리 — Tenant 는 요청·자료·조회, **EDIM 운영자만** 분석·검증·Package·반영
  4) 스스로 Published 를 만들지 않는다 — 반영해도 후보는 IMPORTED 까지, RCCS 는 사람 승인 흐름
정리: ZZAIP* 프로젝트 psql 삭제.

계정: edim@nova = EDIM 운영자 / admin@NOVA-DEMO = 고객사 Admin / setup1@NOVA-DEMO = 고객 SETUP
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


def cleanup():
    psql("DELETE FROM ai_prep_project WHERE project_code LIKE 'ZZAIP%'")


OP = login("edim", "edim")          # EDIM 운영자 (nova)
CUST_A = login("admin", "edim")     # 고객사 A Admin (NOVA-DEMO)
CUST_A_SETUP = login("setup1", "edim")  # 고객사 A SETUP
CUST_A_GEN = None                   # (고객 GENERAL 은 nova 쪽만 있어 별도 확보)
cleanup()

try:
    # ── 요청 생성: Tenant Admin 만 ──
    st, b = req("POST", "/ai/prep/projects", CUST_A_SETUP,
                {"projectCode": "ZZAIP1", "projectName": "SETUP 시도"})
    ok(f"SETUP 은 요청 생성 불가 403 ({st})", st == 403)
    st, p1 = req("POST", "/ai/prep/projects", CUST_A,
                 {"projectCode": "ZZAIP1", "projectName": "펌프 도면 정리",
                  "purpose": "기존 도면 RCCS 이관", "confidentiality": "SENSITIVE",
                  "crossTenantLearningAllowed": False})
    pid = p1["projectId"]
    ok(f"★ 고객 Admin 요청 생성 201 ({st})", st == 201 and p1["status"] == "REQUESTED")
    st, _ = req("POST", "/ai/prep/projects", CUST_A,
                {"projectCode": "ZZAIP1", "projectName": "중복"})
    ok(f"중복 코드 409 ({st})", st == 409)

    # ── 자료 등록: 자기 프로젝트에 ──
    st, a1 = req("POST", f"/ai/prep/projects/{pid}/assets", CUST_A_SETUP,
                 {"fileName": "KDCR-3-13.dxf", "assetType": "DRAWING"})
    ok(f"★ 자료 등록 201 (PENDING) ({st})",
       st == 201 and a1["usagePermissionStatus"] == "PENDING")

    # ── 교차 테넌트 차단: 운영자가 아닌 다른 고객은 못 본다 ──
    # (nova 테넌트의 고객 GENERAL 로 접근 시 자기 테넌트 것만 보여야 함)
    novagen = login("kim01", "edim")     # nova 테넌트 GENERAL — 다른 고객사
    st, lst = req("GET", "/ai/prep/projects", novagen)
    ok("★ 다른 테넌트는 이 프로젝트를 못 봄",
       st == 200 and all(x["projectId"] != pid for x in lst))
    st, _ = req("GET", f"/ai/prep/projects/{pid}", novagen)
    ok(f"★ 다른 테넌트 직접 조회 404 (존재 숨김) ({st})", st == 404)
    st, _ = req("POST", f"/ai/prep/projects/{pid}/assets", novagen,
                {"fileName": "몰래.dxf"})
    ok(f"★ 다른 테넌트 자료 주입 차단 ({st})", st in (403, 404))

    # ── 분석 실행: EDIM 운영자 전용 ──
    st, _ = req("POST", f"/ai/prep/projects/{pid}/run", CUST_A,
                {"candidates": [{"targetObjectType": "product_code", "candidateName": "PC-1"}]})
    ok(f"★ 고객은 분석 실행 불가 403 ({st})", st == 403)
    st, b = req("POST", f"/ai/prep/projects/{pid}/run", OP,
                {"candidates": [{"targetObjectType": "NONSENSE", "candidateName": "X"}]})
    ok(f"알 수 없는 대상 유형 422 ({st})", st == 422)
    st, run = req("POST", f"/ai/prep/projects/{pid}/run", OP,
                  {"candidates": [
                      {"targetObjectType": "product_code", "candidateName": "FDV-480 후보",
                       "confidence": 0.82, "duplicateRisk": 0.1},
                      {"targetObjectType": "part_relationship", "candidateName": "임펠러 관계",
                       "confidence": 0.7}]})
    ok(f"★ 운영자 분석 실행 200 — 후보 {run.get('candidatesCreated')} ({st})",
       st == 200 and run["candidatesCreated"] == 2 and run["status"] == "REVIEW")
    ok("★ 생성된 후보는 전부 DRAFT",
       psql(f"SELECT count(*) FROM ai_mapping_candidate WHERE project_id={pid} "
            "AND status<>'DRAFT'") == "0")
    ok("후보는 프로젝트의 고객 테넌트에 귀속(운영자 테넌트 아님)",
       psql(f"SELECT DISTINCT c.tenant_id=p.tenant_id FROM ai_mapping_candidate c "
            f"JOIN ai_prep_project p ON p.project_id=c.project_id WHERE c.project_id={pid}") == "t")

    # 고객은 결과를 조회할 수 있다 (view_result)
    st, det = req("GET", f"/ai/prep/projects/{pid}", CUST_A)
    ok(f"고객 결과 조회 (후보 {len(det['candidates'])})",
       st == 200 and len(det["candidates"]) == 2
       and all(c["status"] == "DRAFT" for c in det["candidates"]))

    # ── Package 는 검증 전엔 못 만든다 ──
    st, b = req("POST", f"/ai/prep/projects/{pid}/package", OP, {"packageName": "성급한 패키지"})
    ok(f"★ 미검증 후보 남으면 Package 409 ({st})",
       st == 409 and "검증되지 않은" in (b or {}).get("detail", ""))

    # ── 검증: 운영자 전용 ──
    cand_ids = [c["candidateId"] for c in det["candidates"]]
    st, _ = req("POST", f"/ai/prep/candidates/{cand_ids[0]}/review", CUST_A,
                {"decision": "APPROVED"})
    ok(f"★ 고객은 검증 불가 403 ({st})", st == 403)
    st, r1 = req("POST", f"/ai/prep/candidates/{cand_ids[0]}/review", OP,
                 {"decision": "APPROVED", "comment": "적합"})
    ok(f"★ 운영자 검증(승인) — REVIEWED ({st})", st == 200 and r1["status"] == "REVIEWED")
    st, r2 = req("POST", f"/ai/prep/candidates/{cand_ids[1]}/review", OP,
                 {"decision": "REJECTED", "comment": "중복"})
    ok("검증(반려) — REJECTED", r2["status"] == "REJECTED")

    # ── Package 생성 → 반영 ──
    st, pkg = req("POST", f"/ai/prep/projects/{pid}/package", OP, {"packageName": "펌프 이관 v1"})
    ok(f"★ 검증 후 Package 생성 201 — 편입 {pkg.get('includedCandidateCount')} ({st})",
       st == 201 and pkg["includedCandidateCount"] == 1)
    pkg_id = pkg["packageId"]
    st, _ = req("POST", f"/ai/prep/packages/{pkg_id}/apply", CUST_A)
    ok(f"★ 고객은 반영 불가 403 ({st})", st == 403)
    st, ap = req("POST", f"/ai/prep/packages/{pkg_id}/apply", OP)
    ok(f"★ 운영자 반영 200 — IMPORTED {ap.get('importedCandidates')} ({st})",
       st == 200 and ap["importedCandidates"] == 1 and ap["status"] == "APPLIED")

    # ── 핵심 불변식: 이 파이프라인은 스스로 Published 를 만들지 않는다 ──
    ok("★ 반영해도 후보는 IMPORTED 까지 (APPROVED/PUBLISHED 아님)",
       psql(f"SELECT count(*) FROM ai_mapping_candidate WHERE project_id={pid} "
            "AND status IN ('APPROVED','PUBLISHED')") == "0")
    ok("반영된 후보는 IMPORTED 1건",
       psql(f"SELECT count(*) FROM ai_mapping_candidate WHERE project_id={pid} "
            "AND status='IMPORTED'") == "1")
    st, det2 = req("GET", f"/ai/prep/projects/{pid}", OP)
    ok("프로젝트 상태 APPLIED", det2["status"] == "APPLIED")
    st, _ = req("POST", f"/ai/prep/packages/{pkg_id}/apply", OP)
    ok(f"중복 반영 409 ({st})", st == 409)

    # ── 운영자는 전 고객사 프로젝트를 본다 (서비스 제공 근거) ──
    st, oplist = req("GET", "/ai/prep/projects", OP)
    ok("운영자 목록에 고객 프로젝트 보임",
       st == 200 and any(x["projectId"] == pid for x in oplist))
    st, _ = req("GET", "/ai/prep/projects/99999999", OP)
    ok(f"없는 프로젝트 404 ({st})", st == 404)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM ai_prep_project WHERE project_code LIKE 'ZZAIP%'")
    print(f"정리 — ZZAIP* 삭제 (잔존 {left})")

print(f"\nlive_ai_prep: {n}/{n} PASS")
