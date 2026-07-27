# -*- coding: utf-8 -*-
"""작업 권한 동사 라이브 (5.2) — 요구 #3 "생성·수정·실행·승인·배포".

배경: sys_role_permission.action 이 READ/WRITE 뿐이라 "승인할 수 있다"와 "수정할 수 있다"가
구분되지 않았다(실측 READ 6·WRITE 11·기타 0).
규약: **미설정 = 허용** — 자원에 동사가 하나도 없으면 종전 레벨 게이트를 따른다(도입 무영향).
      한 역할이라도 명시하면 그때부터 명시된 동사만 허용.

검증: 어휘 422 → 미설정 시 승인 통과(무영향) → SETUP 역할에 READ 만 부여 시 승인 403 →
     APPROVE 부여 시 통과 → 설정 제거 시 원복.
정리: 검증 중 넣은 동사 행을 반드시 제거(제거하지 않으면 승인 흐름이 막힌다).
"""
import json
import subprocess
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
RES = "approval"
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


def clear_verbs():
    """검증용 동사 행 제거 — 남으면 실제 승인 흐름이 막히므로 반드시 원복."""
    # 18.99 — cpq-selection 은 **화면 매트릭스와 같은 키**다. 지우는 기준은 동사 목록이 아니라
    # **resource_type='SCREEN'**(동사 API 가 만든 행) 이어야 한다. 종전에는 동사 목록으로만
    # 지워 **SCREEN/READ 한 행이 남았고**, 그 한 행이 자원을 '설정됨' 으로 만들어 함대의 Run
    # 계열 6개 스위트가 전부 403 이 됐다(18.99 실측). 남긴 것이 값이 아니라 '설정의 존재'
    # 였다는 점이 함정이다 — 되돌릴 때는 내가 만든 **행 자체**를 기준으로 삼는다.
    psql("DELETE FROM sys_role_permission WHERE resource_key IN ('cpq-selection','tbx-macro') "
         "AND resource_type='SCREEN'")
    psql("DELETE FROM sys_role_permission WHERE resource_key IN ('workflow','package') ")
    psql("DELETE FROM sys_role_permission WHERE resource_key='%s' "
         "AND action IN ('READ','CREATE','UPDATE','EXECUTE','APPROVE','DEPLOY')" % RES)


TOK = login("edim", "edim")
clear_verbs()


def make_pending(target_id: int = 0):
    """승인 대기 1건 생성 — 결정 가능 여부만 보고, 끝나면 반려로 정리한다.

    같은 대상에 미결이 남아 있으면 409(중복 방지)이므로 대상 id 를 달리해 만든다."""
    st, ap = req("POST", "/approvals", TOK,
                 {"targetTable": "sys_head", "targetId": target_id, "requestType": "UPDATE",
                  "label": "ZZVERB 권한 동사 검증"})
    assert st == 201 and ap and "approvalId" in ap, f"승인 요청 생성 실패({st}): {ap}"
    return ap["approvalId"]


try:
    # ── 어휘 검증 ──
    st, b = req("PUT", f"/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["BOGUS"]})
    ok(f"허용되지 않는 동사 422 ({st})", st == 422)
    st, _ = req("GET", "/roles/ADMIN/verbs", TOK)
    ok(f"역할 동사 조회 200 ({st})", st == 200)
    st, _ = req("GET", "/roles/NO_SUCH/verbs", TOK)
    ok(f"없는 역할 404 ({st})", st == 404)

    # ── 미설정 = 허용 (도입 무영향) ──
    aid = make_pending()
    st, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": False, "comment": "미설정 확인"})
    ok(f"★ 동사 미설정이면 종전대로 승인 통과 ({st})", st == 200)

    # ── READ 만 부여하면 승인 불가 ──
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ"]})
    ok(f"ADMIN 역할에 READ 만 부여 ({st})", st == 200)
    aid = make_pending()
    st, b = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": False, "comment": "권한 없음 확인"})
    ok(f"★ APPROVE 없으면 승인 403 ({st})", st == 403 and "APPROVE" in (b or {}).get("detail", ""))

    # ── APPROVE 부여하면 통과 ──
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": RES, "verbs": ["READ", "APPROVE"]})
    ok("APPROVE 동사 부여", st == 200)
    st, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": False, "comment": "권한 부여 후"})
    ok(f"★ APPROVE 부여 후 승인 통과 ({st})", st == 200)
    st, rows = req("GET", "/roles/ADMIN/verbs", TOK)
    ok("조회에 동사 반영", any(r["resourceKey"] == RES and "APPROVE" in r["verbs"] for r in rows))

    # ── 8.5: 같은 승인 행위인데 경로마다 다르면 통제가 아니다 ──
    # 단건만 막고 일괄·도면 경로가 열려 있으면, APPROVE 없는 역할이 그쪽으로 우회한다.
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ"]})
    ok(f"APPROVE 회수 ({st})", st == 200)
    # 17.7 — 종전에는 없는 head_id(901·902)를 대상으로 삼았다. 승인 요청이 대상의 실재·소유를
    # 확인하지 않던 시절에나 통하던 픽스처다(17.3 에서 교차 테넌트 전이의 원인이기도 했다).
    # 여기서 보려는 것은 '동사 없이 일괄 승인이 막히는가' 이므로, 대상은 실재하는 Head 여야
    # 하고 결정 가능 상태(REVIEW)여야 한다 — 아니면 검증이 다른 이유로 통과·실패한다.
    for code in ("ZZVERBB1", "ZZVERBB2"):
        st, _hb = req("POST", "/heads", TOK,
                      {"headCode": code, "headName": f"일괄 검증 {code}", "headType": "TENANT"})
        assert st in (200, 201, 409), f"검증용 Head 생성 실패({st}): {_hb}"
    batch_ids = [int(x) for x in psql(
        "SELECT string_agg(head_id::text, ' ' ORDER BY head_id) FROM sys_head "
        "WHERE head_code IN ('ZZVERBB1','ZZVERBB2')").split()]
    assert len(batch_ids) == 2, f"검증용 Head 2건이 필요합니다: {batch_ids}"
    for _bid in batch_ids:
        psql(f"UPDATE sys_head SET status='REVIEW' WHERE head_id={_bid}")
    a1, a2 = make_pending(batch_ids[0]), make_pending(batch_ids[1])
    st, b = req("POST", "/approvals/decide-batch", TOK,
                {"approvalIds": [a1, a2], "approve": True, "comment": "일괄 우회 시도"})
    ok(f"★ 일괄 승인도 APPROVE 없으면 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    ok("일괄 거부 후 실제로 미결 상태 유지",
       psql(f"SELECT count(*) FROM sys_approval_request WHERE approval_id IN ({a1},{a2}) "
            "AND result IS NULL") == "2")

    st, dl = req("GET", "/drawings", TOK)
    dno = (dl[0]["drawingNo"] if isinstance(dl, list) and dl
           else (dl or {}).get("rows", [{}])[0].get("drawingNo"))
    st, b = req("POST", f"/drawings/{urllib.parse.quote(dno)}/approvals", TOK,
                {"step": "WRITE", "approve": True, "comment": "도면 우회 시도"})
    ok(f"★ 도면 단계 결정도 APPROVE 없으면 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))

    # APPROVE 를 주면 세 경로 모두 통과 (통제가 과잉이 아님)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": RES, "verbs": ["READ", "APPROVE"]})
    st, r = req("POST", "/approvals/decide-batch", TOK,
                {"approvalIds": [a1, a2], "approve": True, "comment": "권한 부여 후 일괄"})
    ok(f"★ APPROVE 부여 후 일괄 승인 통과 ({st}, 처리 {(r or {}).get('processed')})",
       st == 200 and r["processed"] == 2)

    # ── 8.7: 승인 '결과'를 직접 쓰는 경로도 승인 행위다 ──
    # product_code.approval_status='APPROVED' 는 승인함이 만들어 내는 결과인데,
    # PATCH/일괄 상태변경으로 그냥 찍을 수 있으면 승인 절차 자체가 무의미해진다.
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ"]})
    ok(f"APPROVE 재회수 ({st})", st == 200)
    st, pl = req("GET", "/codes/products", TOK)
    rows = pl if isinstance(pl, list) else (pl or {}).get("rows", [])
    ok(f"제품 코드 존재 ({len(rows)}건)", bool(rows))
    # 전부 APPROVED 일 수 있으므로 대상 하나를 DRAFT 로 내려 두고 검증한다
    # (조건에 맞는 행이 없다고 건너뛰면 검증한 척이 된다 — 끝에 원상 복구)
    target = rows[0]
    pid = target["productCodeId"]
    before = target["status"]
    globals()["_restore_pid"], globals()["_restore_to"] = pid, before
    staged = before
    if before == "APPROVED":
        st, _ = req("PATCH", f"/codes/products/{pid}", TOK, {"status": "DRAFT"})
        ok(f"검증 준비 — 대상을 DRAFT 로 (승인 부여가 아니므로 허용) ({st})", st == 200)
        staged = "DRAFT"
    st, b = req("PATCH", f"/codes/products/{pid}", TOK, {"status": "APPROVED"})
    ok(f"★ APPROVE 없이 상태 직접 APPROVED 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    ok(f"거부 후 상태 그대로 ({staged})",
       psql(f"SELECT approval_status FROM product_code WHERE product_code_id={pid}") == staged)
    st, b = req("POST", "/codes/products/batch", TOK,
                {"ids": [pid], "action": "STATUS", "status": "APPROVED"})
    ok(f"★ 일괄 APPROVED 도 403 ({st})", st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    # 승인 부여가 아닌 전이(DRAFT)는 종전대로 허용 — 통제가 과잉이 아님
    st, _ = req("PATCH", f"/codes/products/{pid}", TOK, {"status": "DRAFT"})
    ok(f"DRAFT 로 되돌리기는 종전대로 허용 ({st})", st == 200)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": RES, "verbs": ["READ", "APPROVE"]})
    st, _ = req("PATCH", f"/codes/products/{pid}", TOK, {"status": "APPROVED"})
    ok(f"★ APPROVE 부여 후 상태 변경 통과 ({st})", st == 200)
    # 원복은 finally 에서 한 번 더 보장한다

    # ── 8.8: Head 도 같은 구멍 — REVIEW→APPROVED 직접 전이 ──
    # 바로 아래 PUBLISHED 는 DEPLOY 동사를 요구하는데 APPROVED 만 무방비였다.
    # 앞 블록이 APPROVE 를 부여한 채 끝나므로 여기서 반드시 회수하고 시작한다
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ"]})
    ok(f"Head 검증 전 APPROVE 회수 ({st})", st == 200)
    st, hd = req("POST", "/heads", TOK,
                 {"headCode": "ZZVERBHD", "headName": "동사 검증 Head", "headType": "TENANT"})
    ok(f"검증용 Head 생성 ({st})", st in (200, 201))
    hid = hd.get("headId")
    globals()["_head_id"] = hid
    st, _ = req("PATCH", f"/heads/{hid}", TOK, {"status": "REVIEW"})
    ok(f"DRAFT→REVIEW 는 승인 행위가 아니므로 허용 ({st})", st == 200)
    st, b = req("PATCH", f"/heads/{hid}", TOK, {"status": "APPROVED"})
    ok(f"★ APPROVE 없이 Head APPROVED 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    ok("거부 후 REVIEW 유지",
       psql(f"SELECT status FROM sys_head WHERE head_id={hid}") == "REVIEW")
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": RES, "verbs": ["READ", "APPROVE"]})
    st, _ = req("PATCH", f"/heads/{hid}", TOK, {"status": "APPROVED"})
    ok(f"★ APPROVE 부여 후 Head 승인 통과 ({st})", st == 200)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ"]})

    # ── 8.9: Workflow 게시도 배포 행위 (Head·Package 는 이미 DEPLOY 를 요구) ──
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "workflow", "verbs": ["READ"]})
    ok(f"workflow 자원에 READ 만 부여 ({st})", st == 200)
    st, wf = req("POST", "/erp/workflows", TOK,
                 {"templateCode": "ZZVERBWF", "templateName": "동사 검증 흐름", "processCode": "OR",
                  "nodes": [{"nodeCode": "S", "nodeType": "START"},
                            {"nodeCode": "E", "nodeType": "END"}],
                  "edges": [{"fromNode": "S", "toNode": "E"}]})
    ok(f"검증용 Workflow 등록 ({st})", st == 201)
    wid = wf["templateId"]
    globals()["_wf_id"] = wid
    st, b = req("POST", f"/erp/workflows/{wid}/publish", TOK)
    ok(f"★ DEPLOY 없이 Workflow 게시 403 ({st})",
       st == 403 and "DEPLOY" in (b or {}).get("detail", ""))
    ok("거부 후 DRAFT 유지",
       psql(f"SELECT status FROM erp_workflow_template WHERE template_id={wid}") == "DRAFT")
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": "workflow", "verbs": ["READ", "DEPLOY"]})
    st, _ = req("POST", f"/erp/workflows/{wid}/publish", TOK)
    ok(f"★ DEPLOY 부여 후 게시 통과 ({st})", st == 200)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "workflow", "verbs": []})

    # ── 8.10: Sub Code 값 승인(approve=true)도 승인 행위 ──
    # 8.8 수작업 점검이 놓친 지점 — SET 절을 dict 로 조립해 정규식에 안 걸렸다.
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ"]})
    vid = psql("SELECT value_id FROM code_item_value WHERE approval_status<>'APPROVED' LIMIT 1")
    if not vid:
        vid = psql("SELECT value_id FROM code_item_value ORDER BY value_id LIMIT 1")
    # 이 검증은 값을 APPROVED 로 바꾼다 — 실 Sub Code 데이터이므로 원래 상태를 기억해 두고
    # finally 에서 반드시 되돌린다 (8.7a 에서 제품 코드로 같은 실수를 했다)
    vstat = psql(f"SELECT approval_status FROM code_item_value WHERE value_id={vid}")
    globals()["_val_id"], globals()["_val_status"] = vid, vstat
    ok(f"검증 대상 값 확보 (#{vid} · {vstat})", bool(vid) and bool(vstat))
    st, b = req("PATCH", f"/codes/values/{vid}", TOK, {"approve": True})
    ok(f"★ APPROVE 없이 값 승인 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": ["READ", "APPROVE"]})
    st, _ = req("PATCH", f"/codes/values/{vid}", TOK, {"approve": True})
    ok(f"★ APPROVE 부여 후 값 승인 통과 ({st})", st == 200)

    # ── 18.99: '실행' 도 요구 #3 의 동사다 (생성·수정·실행·승인·배포) ──
    # 다섯 중 실효는 APPROVE·DEPLOY 둘뿐이었다. BOM Run 은 결과가 원가·견적의 근거가 되는
    # '실행' 인데 어떤 동사도 요구하지 않아, 화면 매트릭스를 읽기 전용으로 내려도 API 로는
    # 그대로 돌릴 수 있었다. 자원 키는 화면 매트릭스와 같은 어휘(`cpq-selection`)를 쓴다.
    EXEC_RES = "cpq-selection"
    # 이 자원에는 **시드가 만든 화면 권한 행(MENU/READ)** 이 있고, 동사 API 의 DELETE 는
    # READ 도 함께 지운다. 원래 행을 기억해 두고 finally 에서 되돌린다.
    globals()["_exec_seeded"] = psql(
        "SELECT COALESCE(string_agg(p.action, ',' ORDER BY p.action),'') "
        "FROM sys_role_permission p JOIN sys_role r ON r.role_id=p.role_id "
        f"WHERE r.role_name='ADMIN' AND p.resource_key='{EXEC_RES}'")
    ok(f"실행 자원의 기존 화면 권한 확보 ({globals()['_exec_seeded'] or '없음'})",
       "READ" in (globals()["_exec_seeded"] or ""))

    # (1) 화면 권한 매트릭스의 READ 는 **동사 설정이 아니다**. 설정으로 치면 시드가 ADMIN×
    #     제품선정을 READ 로 두고 있으므로 EXECUTE 검사를 넣는 순간 **ADMIN 의 모든 Run 이
    #     막힌다**(18.99 함정). 동사 행이 없는 지금 상태에서 실행이 되는지부터 본다.
    verb_rows = psql("SELECT count(*) FROM sys_role_permission p JOIN sys_role r "
                     f"ON r.role_id=p.role_id WHERE p.resource_key='{EXEC_RES}' "
                     "AND p.resource_type='SCREEN'")
    ok(f"동사 행은 없는 상태 ({verb_rows}건)", verb_rows == "0")
    st, r1 = req("POST", "/cpq/runs", TOK, {"runType": "BOM", "isTest": True})
    ok(f"★ 화면 권한만 있으면 실행은 종전대로 허용 ({st}) — 화면 READ 는 동사 설정이 아니다",
       st in (200, 202) and (r1 or {}).get("runId"))
    globals()["_exec_runs"] = [r1["runId"]]

    # (2) 동사 API 로 READ 만 주는 것은 "읽기만 준다" 는 의사 표시다 → 실행 불가.
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": EXEC_RES, "verbs": ["READ"]})
    ok(f"동사 API 로 READ 만 부여 ({st})", st == 200)
    st, b = req("POST", "/cpq/runs", TOK, {"runType": "BOM", "isTest": True})
    ok(f"★ EXECUTE 없으면 Run 403 ({st})",
       st == 403 and "EXECUTE" in (b or {}).get("detail", ""))
    st, _ = req("PUT", f"/roles/ADMIN/verbs", TOK,
                {"resourceKey": EXEC_RES, "verbs": ["READ", "EXECUTE"]})
    st, r2 = req("POST", "/cpq/runs", TOK, {"runType": "BOM", "isTest": True})
    ok(f"★ EXECUTE 부여 후 실행 통과 ({st}) — 과잉 차단 아님",
       st in (200, 202) and (r2 or {}).get("runId"))
    globals()["_exec_runs"].append(r2["runId"])

    # 같은 규약이 Macro 실행에도 걸린다 (자원 키는 tbx-macro)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": "tbx-macro", "verbs": ["APPROVE"]})
    st, b = req("POST", "/macros/evaluate", TOK, {"formula": "1+1", "variables": {}})
    ok(f"★ EXECUTE 없으면 Macro 평가 403 ({st})",
       st == 403 and "EXECUTE" in (b or {}).get("detail", ""))
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK,
                {"resourceKey": "tbx-macro", "verbs": ["EXECUTE"]})
    st, b = req("POST", "/macros/evaluate", TOK, {"formula": "1+1", "variables": {}})
    ok(f"★ EXECUTE 부여 후 Macro 평가 통과 ({st})", st == 200 and (b or {}).get("value") == 2)
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "tbx-macro", "verbs": []})

    # ── 설정 제거 = 미설정 복귀 ──
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": RES, "verbs": []})
    ok(f"동사 설정 제거 ({st})", st == 200)
    aid = make_pending()
    st, _ = req("POST", f"/approvals/{aid}/decide", TOK, {"approve": False, "comment": "원복 확인"})
    ok(f"★ 제거 후 종전 동작으로 복귀 ({st})", st == 200)

    # 권한 가드 — 동사 지정은 ADMIN 전용
    gtok = login("kim01", "edim")
    st, _ = req("PUT", "/roles/ADMIN/verbs", gtok, {"resourceKey": RES, "verbs": ["READ"]})
    ok(f"GENERAL 동사 지정 403 ({st})", st == 403)
finally:
    _vid, _vst = globals().get("_val_id"), globals().get("_val_status")
    if _vid and _vst:
        psql(f"UPDATE code_item_value SET approval_status='{_vst}' WHERE value_id={_vid}")
        print(f"정리 — Sub Code 값 #{_vid} 상태 {_vst} 로 원복")
    _wf = globals().get("_wf_id")
    if _wf:
        psql(f"DELETE FROM erp_workflow_template WHERE template_id={_wf}")
        print(f"정리 — 검증용 Workflow #{_wf} 삭제")
    _hid = globals().get("_head_id")
    if _hid:
        psql(f"DELETE FROM sys_head_binding WHERE head_id={_hid}")
        psql(f"DELETE FROM sys_head WHERE head_id={_hid}")
        print(f"정리 — 검증용 Head #{_hid} 삭제")
    # 일괄 검증용 Head — 승인 요청이 먼저 지워져야 FK/미결이 남지 않는다
    psql("DELETE FROM sys_approval_request WHERE target_table='sys_head' AND target_id IN "
         "(SELECT head_id FROM sys_head WHERE head_code IN ('ZZVERBB1','ZZVERBB2'))")
    psql("DELETE FROM sys_head_binding WHERE head_id IN "
         "(SELECT head_id FROM sys_head WHERE head_code IN ('ZZVERBB1','ZZVERBB2'))")
    psql("DELETE FROM sys_head WHERE head_code IN ('ZZVERBB1','ZZVERBB2')")
    print("정리 — 일괄 검증용 Head 삭제")
    # 검증용으로 상태를 바꾼 제품 코드는 반드시 되돌린다 (중간 실패로 DRAFT 가 남았던 적 있음)
    _pid, _to = globals().get("_restore_pid"), globals().get("_restore_to")
    if _pid and _to:
        psql(f"UPDATE product_code SET approval_status='{_to}' WHERE product_code_id={_pid}")
        print(f"정리 — 제품 코드 #{_pid} 상태 {_to} 로 원복")
    clear_verbs()
    # 18.99 — 동사 API 의 DELETE 는 READ 도 지운다. 시드가 만든 화면 권한 행(MENU)을 되돌린다.
    # (되돌리지 않으면 권한 매트릭스에서 ADMIN×제품선정 칸이 조용히 NONE 이 된다)
    _seeded = globals().get("_exec_seeded")
    if _seeded:
        for _act in {a for a in _seeded.split(",") if a}:
            psql("INSERT INTO sys_role_permission (role_id, resource_type, resource_key, action) "
                 "SELECT r.role_id,'MENU','cpq-selection','%s' FROM sys_role r "
                 "WHERE r.role_name='ADMIN' AND NOT EXISTS (SELECT 1 FROM sys_role_permission p "
                 "WHERE p.role_id=r.role_id AND p.resource_key='cpq-selection' "
                 "AND p.action='%s')" % (_act, _act))
        print(f"정리 — 화면 권한 행 복원 (ADMIN×cpq-selection = {_seeded})")
    psql("DELETE FROM sys_approval_request WHERE comment LIKE 'ZZVERB%'")
    left = psql(f"SELECT count(*) FROM sys_role_permission WHERE resource_key='{RES}'")
    # 실행 자원에 동사 행이 남으면 **모든 Run 이 403 이 된다** — 잔존을 세는 데서 그치지 않고
    # 0이 아니면 실패로 알린다(조용히 남기면 다음 함대가 통째로 무너진다).
    exec_left = psql("SELECT count(*) FROM sys_role_permission "
                     "WHERE resource_key IN ('cpq-selection','tbx-macro') "
                     "AND resource_type='SCREEN'")
    print(f"정리 — 검증 동사 행 제거 (approval 잔존 {left} · 실행 자원 잔존 {exec_left})")
    assert exec_left == "0", f"정리 실패 — 실행 자원 동사 행 {exec_left}건 잔존 (Run 이 막힌다)"

print(f"\nlive_action_verbs: {n}/{n} PASS")
