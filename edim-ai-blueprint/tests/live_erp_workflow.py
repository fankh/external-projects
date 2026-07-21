# -*- coding: utf-8 -*-
"""ERP Domain/Process/Workflow 선반영 라이브 (7.9) — 요구 #50.

근거: EDIM_FULL_IMPLEMENTATION_SCOPE_ERP_DIGITAL_TWIN_2026_07_18.md §6.1·§6.2·§10.1.
검증: 카탈로그 시드(Domain/Process) → Template DRAFT 등록(불완전 허용) →
     **게시 시점 그래프 강제**(끊긴 연결·닿지 않는 노드·덫·다중 START·승인 등급 누락) →
     **재작업 순환은 허용**(실제 업무에 존재) → 게시·체크섬·버전 승계 → 권한.
정리: ZZWF* psql 삭제.
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
    psql("DELETE FROM erp_workflow_template WHERE template_code LIKE 'ZZWF%'")


def mk(code, nodes, edges, proc="OR", name="검증 흐름"):
    return {"templateCode": code, "templateName": name, "processCode": proc,
            "nodes": nodes, "edges": edges}


S = {"nodeCode": "S", "nodeName": "시작", "nodeType": "START"}
E = {"nodeCode": "E", "nodeName": "종료", "nodeType": "END"}


def edge(f, t):
    return {"fromNode": f, "toNode": t}


TOK = login("edim", "edim")
GEN = login("kim01", "edim")
cleanup()

try:
    # ── 카탈로그 시드 (§6.2) ──
    st, doms = req("GET", "/erp/domains", TOK)
    codes = {d["domainCode"] for d in doms}
    ok(f"Domain 카탈로그 {len(doms)}건", st == 200 and len(doms) >= 14)
    ok("문서의 운영 Head 가 반영됨(영업·생산·QC·재무)",
       {"SALES", "PROD", "QC", "FIN"} <= codes)

    st, procs = req("GET", "/erp/processes", TOK)
    pcodes = {p["processCode"] for p in procs}
    ok(f"Process 카탈로그 {len(procs)}건", st == 200 and len(procs) >= 30)
    ok("§6.2 Process Code 후보 반영 (CPO·QCR·BOM·WR·CR)",
       {"CPO", "QCR", "BOM", "WR", "CR"} <= pcodes)
    ok("회사별 대체 허용 플래그 존재(tenant_override_allowed)",
       all("tenantOverrideAllowed" in p for p in procs))
    st, fin = req("GET", "/erp/processes?domain=FIN", TOK)
    ok(f"Domain 필터 동작 (FIN {len(fin)}건)",
       st == 200 and fin and all(p["domainCode"] == "FIN" for p in fin))

    # ── 등록: 카탈로그에 없는 Process 는 거부 ──
    st, b = req("POST", "/erp/workflows", TOK, mk("ZZWFX", [S, E], [edge("S", "E")], proc="NOPE"))
    ok(f"카탈로그에 없는 Process 404 ({st})", st == 404)
    st, b = req("POST", "/erp/workflows", TOK,
                mk("ZZWFX", [{"nodeCode": "S", "nodeType": "WEIRD"}], []))
    ok(f"알 수 없는 노드 유형 422 ({st})", st == 422)

    # ── DRAFT 는 불완전해도 저장되고, 문제를 알려 준다 ──
    st, d1 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF1", [S, {"nodeCode": "T1", "nodeType": "TASK"}], [edge("S", "T1")]))
    t1 = d1["templateId"]
    ok(f"★ 불완전 DRAFT 등록 201 (문제 {len(d1['problems'])}건)", st == 201 and d1["problems"])
    ok(f"END 없음을 지적 ({d1['problems'][0][:40]})",
       any("END" in p for p in d1["problems"]))
    st, pub = req("POST", f"/erp/workflows/{t1}/publish", TOK)
    ok(f"★ END 없는 흐름 게시 422 ({st})", st == 422 and "END" in (pub or {}).get("detail", ""))
    ok("게시 실패 후에도 DRAFT 유지",
       psql(f"SELECT status FROM erp_workflow_template WHERE template_id={t1}") == "DRAFT")

    # 끊긴 연결
    st, d2 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF2", [S, E], [edge("S", "E"), edge("E", "GHOST")]))
    st, pub = req("POST", f"/erp/workflows/{d2['templateId']}/publish", TOK)
    ok(f"★ 끊긴 연결 게시 422 ({st})", st == 422 and "GHOST" in (pub or {}).get("detail", ""))

    # START 에서 닿지 않는 노드
    st, d3 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF3", [S, E, {"nodeCode": "ORPHAN", "nodeType": "TASK"}],
                    [edge("S", "E"), edge("ORPHAN", "E")]))
    st, pub = req("POST", f"/erp/workflows/{d3['templateId']}/publish", TOK)
    ok(f"★ 닿지 않는 노드 게시 422 ({st})",
       st == 422 and "ORPHAN" in (pub or {}).get("detail", ""))

    # END 로 갈 수 없는 덫
    st, d4 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF4", [S, E, {"nodeCode": "TRAP", "nodeType": "TASK"}],
                    [edge("S", "E"), edge("S", "TRAP")]))
    st, pub = req("POST", f"/erp/workflows/{d4['templateId']}/publish", TOK)
    ok(f"★ 빠져나올 수 없는 노드 게시 422 ({st})",
       st == 422 and "TRAP" in (pub or {}).get("detail", ""))

    # START 2개
    st, d5 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF5", [S, {"nodeCode": "S2", "nodeType": "START"}, E],
                    [edge("S", "E"), edge("S2", "E")]))
    st, pub = req("POST", f"/erp/workflows/{d5['templateId']}/publish", TOK)
    ok(f"★ START 중복 게시 422 ({st})", st == 422 and "START" in (pub or {}).get("detail", ""))

    # 승인 노드에 결재 등급 누락
    st, d6 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF6", [S, {"nodeCode": "APV", "nodeType": "APPROVAL"}, E],
                    [edge("S", "APV"), edge("APV", "E")]))
    st, pub = req("POST", f"/erp/workflows/{d6['templateId']}/publish", TOK)
    ok(f"★ 결재 등급 없는 승인 노드 게시 422 ({st})",
       st == 422 and "APV" in (pub or {}).get("detail", ""))

    # ── 성립하는 흐름은 게시된다 ──
    good = mk("ZZWF7", [S, {"nodeCode": "REVIEW", "nodeType": "TASK", "screenKey": "erp/order"},
                        {"nodeCode": "APV", "nodeType": "APPROVAL", "actorLevel": "SETUP"}, E],
              [edge("S", "REVIEW"), edge("REVIEW", "APV"), edge("APV", "E")], proc="OR")
    st, d7 = req("POST", "/erp/workflows", TOK, good)
    t7 = d7["templateId"]
    ok(f"성립하는 DRAFT 는 문제 0건 ({d7['problems']})", st == 201 and not d7["problems"])
    st, p7 = req("POST", f"/erp/workflows/{t7}/publish", TOK)
    ok(f"★ 게시 200 (노드 {p7.get('nodeCount')}·연결 {p7.get('edgeCount')})",
       st == 200 and p7["status"] == "PUBLISHED" and len(p7["checksum"]) == 64)
    st, p7b = req("POST", f"/erp/workflows/{t7}/publish", TOK)
    ok(f"중복 게시 409 ({st})", st == 409)

    # 재작업 순환은 막지 않는다 — 실제 업무에 존재하는 흐름
    st, d8 = req("POST", "/erp/workflows", TOK,
                 mk("ZZWF8", [S, {"nodeCode": "WORK", "nodeType": "TASK"},
                              {"nodeCode": "INSP", "nodeType": "TASK"}, E],
                    [edge("S", "WORK"), edge("WORK", "INSP"), edge("INSP", "WORK"),
                     edge("INSP", "E")], proc="RM"))
    st, p8 = req("POST", f"/erp/workflows/{d8['templateId']}/publish", TOK)
    ok(f"★ 재작업 순환(WORK↔INSP)은 게시 허용 ({st})", st == 200)

    # 새 버전이 이전 게시본을 승계
    st, d9 = req("POST", "/erp/workflows", TOK, dict(good, templateName="v2"))
    ok(f"같은 코드 재등록은 새 버전 ({d9.get('versionNo')})", d9["versionNo"] == 2)
    st, p9 = req("POST", f"/erp/workflows/{d9['templateId']}/publish", TOK)
    ok("★ 새 버전 게시 200", st == 200)
    ok("이전 버전 SUPERSEDED",
       psql(f"SELECT status FROM erp_workflow_template WHERE template_id={t7}") == "SUPERSEDED")
    ok("게시본은 코드당 하나",
       psql("SELECT count(*) FROM erp_workflow_template "
            "WHERE template_code='ZZWF7' AND status='PUBLISHED'") == "1")

    # 상세 조회
    st, det = req("GET", f"/erp/workflows/{d9['templateId']}", TOK)
    ok(f"상세 조회 200 (노드 {len(det['nodes'])})", st == 200 and len(det["nodes"]) == 4)
    ok("화면 바인딩 자리 보존(screenKey)",
       any(x["screenKey"] == "erp/order" for x in det["nodes"]))
    st, lst = req("GET", "/erp/workflows", TOK)
    ok("목록에 상태·체크섬 반영",
       any(x["templateId"] == d9["templateId"] and x["status"] == "PUBLISHED" for x in lst))
    st, _ = req("GET", "/erp/workflows/99999999", TOK)
    ok(f"없는 Workflow 404 ({st})", st == 404)

    # ── 권한 ──
    st, _ = req("POST", "/erp/workflows", GEN, mk("ZZWFG", [S, E], [edge("S", "E")]))
    ok(f"GENERAL 등록 403 ({st})", st == 403)
    st, _ = req("POST", f"/erp/workflows/{d9['templateId']}/publish", GEN)
    ok(f"GENERAL 게시 403 ({st})", st == 403)
    st, _ = req("GET", "/erp/processes", GEN)
    ok("GENERAL 카탈로그 조회는 허용", st == 200)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM erp_workflow_template WHERE template_code LIKE 'ZZWF%'")
    orph = psql("SELECT count(*) FROM erp_workflow_node WHERE template_id NOT IN "
                "(SELECT template_id FROM erp_workflow_template)")
    print(f"정리 — ZZWF* 삭제 (템플릿 {left} · 고아 노드 {orph})")

print(f"\nlive_erp_workflow: {n}/{n} PASS")
