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
    a1, a2 = make_pending(901), make_pending(902)
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
    # 검증용으로 상태를 바꾼 제품 코드는 반드시 되돌린다 (중간 실패로 DRAFT 가 남았던 적 있음)
    _pid, _to = globals().get("_restore_pid"), globals().get("_restore_to")
    if _pid and _to:
        psql(f"UPDATE product_code SET approval_status='{_to}' WHERE product_code_id={_pid}")
        print(f"정리 — 제품 코드 #{_pid} 상태 {_to} 로 원복")
    clear_verbs()
    psql("DELETE FROM sys_approval_request WHERE comment LIKE 'ZZVERB%'")
    left = psql(f"SELECT count(*) FROM sys_role_permission WHERE resource_key='{RES}'")
    print(f"정리 — 검증 동사 행 제거 (잔존 {left})")

print(f"\nlive_action_verbs: {n}/{n} PASS")
