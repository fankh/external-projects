# -*- coding: utf-8 -*-
"""고객 로고 참조 모델 라이브 (8.0) — 요구 #20 "customer_company_id 참조 + 승인본만 표시".

핵심 성질 두 가지를 실증한다.
  1) **승인본만 표시** — 더 새 로고가 올라와 있어도 승인 전이면 절대 나가지 않는다.
  2) **참조 모델** — 문서는 이미지를 복사하지 않으므로, 로고를 교체·재승인하면
     문서를 손대지 않아도 표시가 따라간다.
정리: ZZCUST*/ZZDOC* psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
DOC = "ZZDOC-LOGO-1"
n = 0

# 1x1 PNG (data URL) — 버전마다 다른 내용이 되도록 뒤에 주석 바이트를 덧붙인다
PNG1 = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4"
        "nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=")
PNG2 = PNG1 + "AA"
PNG3 = PNG1 + "BB"


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
    psql("UPDATE doc_control SET customer_company_id=NULL WHERE doc_no LIKE 'ZZDOC%'")
    psql("DELETE FROM sys_approval_request WHERE target_table='doc_control' AND target_id IN "
         "(SELECT doc_control_id FROM doc_control WHERE doc_no LIKE 'ZZDOC%')")
    psql("DELETE FROM doc_control WHERE doc_no LIKE 'ZZDOC%'")
    psql("DELETE FROM customer_company WHERE company_code LIKE 'ZZCUST%'")
    psql("DELETE FROM sys_role_permission WHERE resource_key='approval'")


TOK = login("edim", "edim")          # ADMIN — 승인 가능
GEN = login("kim01", "edim")         # GENERAL
cleanup()

try:
    # ── 고객사 등록 ──
    st, c1 = req("POST", "/customers", TOK, {"companyCode": "ZZCUST1", "companyName": "가나중공업"})
    cid = c1["customerCompanyId"]
    ok(f"고객사 등록 201 ({st})", st == 201)
    st, dup = req("POST", "/customers", TOK, {"companyCode": "ZZCUST1", "companyName": "중복"})
    ok(f"중복 고객사 409 ({st})", st == 409)

    st, logo = req("GET", f"/customers/{cid}/logo", TOK)
    ok("로고 없음 — 데이터 대신 사유를 밝힘",
       st == 200 and logo["logoData"] is None and logo["approved"] is False and logo["reason"])

    # ── 업로드는 PENDING, 승인 전에는 나가지 않는다 ──
    st, b = req("POST", f"/customers/{cid}/logo", TOK, {"logoData": "not-an-image"})
    ok(f"이미지 아닌 값 422 ({st})", st == 422)
    st, a1 = req("POST", f"/customers/{cid}/logo", TOK, {"logoData": PNG1})
    ok(f"★ 로고 업로드는 PENDING ({a1.get('approvalStatus')})",
       st == 201 and a1["approvalStatus"] == "PENDING" and a1["versionNo"] == 1)

    st, logo = req("GET", f"/customers/{cid}/logo", TOK)
    ok("★ 승인 전 로고는 표시되지 않음 (대기 1건)",
       logo["logoData"] is None and logo["approved"] is False and logo["pendingLogos"] == 1)

    st, lst = req("GET", "/customers", TOK)
    row = next(x for x in lst if x["customerCompanyId"] == cid)
    ok("목록도 승인본 없음으로 표시",
       row["hasApprovedLogo"] is False and row["pendingLogos"] == 1)

    # ── 승인하면 표시된다 ──
    st, ap = req("POST", f"/customers/logos/{a1['logoAssetId']}/approve", TOK)
    ok(f"★ 승인 200 ({ap.get('approvalStatus')})", st == 200 and ap["approvalStatus"] == "APPROVED")
    st, logo = req("GET", f"/customers/{cid}/logo", TOK)
    ok("★ 승인 후 표시됨 (v1)",
       logo["approved"] is True and logo["logoData"] == PNG1 and logo["versionNo"] == 1)
    st, again = req("POST", f"/customers/logos/{a1['logoAssetId']}/approve", TOK)
    ok(f"이미 승인된 건 재승인 409 ({st})", st == 409)

    # ── 핵심: 더 새 로고가 올라와도 승인 전이면 옛 승인본이 나간다 ──
    st, a2 = req("POST", f"/customers/{cid}/logo", TOK, {"logoData": PNG2})
    ok(f"새 버전 업로드 (v{a2.get('versionNo')})", st == 201 and a2["versionNo"] == 2)
    st, logo = req("GET", f"/customers/{cid}/logo", TOK)
    ok("★ 미승인 최신본은 나가지 않고 승인본(v1)이 유지됨",
       logo["versionNo"] == 1 and logo["logoData"] == PNG1 and logo["pendingLogos"] == 1)

    st, ap2 = req("POST", f"/customers/logos/{a2['logoAssetId']}/approve", TOK)
    st, logo = req("GET", f"/customers/{cid}/logo", TOK)
    ok("★ v2 승인 후 표시본 교체", logo["versionNo"] == 2 and logo["logoData"] == PNG2)
    ok("이전 표시본 SUPERSEDED",
       psql(f"SELECT approval_status FROM customer_logo_asset "
            f"WHERE logo_asset_id={a1['logoAssetId']}") == "SUPERSEDED")
    ok("표시본은 고객사당 하나",
       psql(f"SELECT count(*) FROM customer_logo_asset WHERE customer_company_id={cid} "
            "AND approval_status='APPROVED'") == "1")

    # ── 반려 ──
    st, a3 = req("POST", f"/customers/{cid}/logo", TOK, {"logoData": PNG3})
    st, rj = req("POST", f"/customers/logos/{a3['logoAssetId']}/reject", TOK,
                 {"reason": "해상도 부족"})
    ok(f"반려 200 ({rj.get('approvalStatus')})", st == 200 and rj["approvalStatus"] == "REJECTED")
    st, logo = req("GET", f"/customers/{cid}/logo", TOK)
    ok("★ 반려본은 표시에 영향 없음 (v2 유지)", logo["versionNo"] == 2)
    st, hist = req("GET", f"/customers/{cid}/logos", TOK)
    ok(f"이력 3건·상태 보존 ({[h['approvalStatus'] for h in hist]})",
       len(hist) == 3 and {h["approvalStatus"] for h in hist} == {"APPROVED", "SUPERSEDED", "REJECTED"})
    ok("이력에는 이미지 데이터를 싣지 않음", all("logoData" not in h for h in hist))

    # ── 참조 모델: 문서는 이미지를 복사하지 않는다 ──
    st, _ = req("POST", "/documents", TOK, {"docNo": DOC, "title": "로고 참조 검증", "docType": "QUO"})
    ok(f"문서 등록 ({st})", st == 201)
    st, br = req("GET", f"/documents/{DOC}/branding", TOK)
    ok("참조 미설정이면 로고 없음", br["customerCompanyId"] is None and br["logoData"] is None)

    st, sc = req("PUT", f"/documents/{DOC}/customer", TOK, {"customerCompanyId": cid})
    ok(f"문서에 고객사 참조 설정 ({st})", st == 200)
    st, br = req("GET", f"/documents/{DOC}/branding", TOK)
    ok("★ 문서가 참조를 따라 승인 로고 해석 (v2)",
       br["approved"] is True and br["logoData"] == PNG2 and br["companyCode"] == "ZZCUST1")

    # 로고를 교체·재승인 → 문서를 건드리지 않아도 표시가 따라간다
    st, a4 = req("POST", f"/customers/{cid}/logo", TOK, {"logoData": PNG1})
    st, _ = req("POST", f"/customers/logos/{a4['logoAssetId']}/approve", TOK)
    st, br2 = req("GET", f"/documents/{DOC}/branding", TOK)
    ok("★ 로고 교체가 문서 수정 없이 반영됨 (v4)",
       br2["versionNo"] == 4 and br2["logoData"] == PNG1)

    # 승인본이 없는 고객사를 참조하면 문서에도 싣지 않는다
    st, c2 = req("POST", "/customers", TOK, {"companyCode": "ZZCUST2", "companyName": "미승인사"})
    st, _ = req("POST", f"/customers/{c2['customerCompanyId']}/logo", TOK, {"logoData": PNG3})
    st, _ = req("PUT", f"/documents/{DOC}/customer", TOK,
                {"customerCompanyId": c2["customerCompanyId"]})
    st, br3 = req("GET", f"/documents/{DOC}/branding", TOK)
    ok("★ 승인본 없는 고객사는 문서에도 로고 없음 + 사유",
       br3["approved"] is False and br3["logoData"] is None and "승인" in (br3["reason"] or ""))

    # ── 404·권한 ──
    st, _ = req("GET", "/customers/99999999/logo", TOK)
    ok(f"없는 고객사 404 ({st})", st == 404)
    st, _ = req("POST", "/customers/logos/99999999/approve", TOK)
    ok(f"없는 로고 승인 404 ({st})", st == 404)
    st, _ = req("PUT", f"/documents/{DOC}/customer", TOK, {"customerCompanyId": 99999999})
    ok(f"없는 고객사 참조 404 ({st})", st == 404)
    st, _ = req("POST", "/customers", GEN, {"companyCode": "ZZCUSTG", "companyName": "X"})
    ok(f"GENERAL 고객사 등록 403 ({st})", st == 403)
    st, _ = req("POST", f"/customers/{cid}/logo", GEN, {"logoData": PNG1})
    ok(f"GENERAL 로고 업로드 403 ({st})", st == 403)
    st, _ = req("POST", f"/customers/logos/{a4['logoAssetId']}/approve", GEN)
    ok(f"GENERAL 승인 403 ({st})", st == 403)
    st, _ = req("GET", f"/customers/{cid}/logo", GEN)
    ok("GENERAL 표시 조회는 허용 (문서에 실려야 하므로)", st == 200)

    # ── 8.10: 로고 승인도 승인 행위 — APPROVE 동사 필요 ──
    st, a9 = req("POST", f"/customers/{cid}/logo", TOK, {"logoData": PNG2 + "CC"})
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "approval", "verbs": ["READ"]})
    ok(f"approval 자원에 READ 만 부여 ({st})", st == 200)
    st, b = req("POST", f"/customers/logos/{a9['logoAssetId']}/approve", TOK)
    ok(f"★ APPROVE 없이 로고 승인 403 ({st})",
       st == 403 and "APPROVE" in (b or {}).get("detail", ""))
    st, _ = req("PUT", "/roles/ADMIN/verbs", TOK, {"resourceKey": "approval", "verbs": []})
    ok(f"동사 설정 제거 ({st})", st == 200)

finally:
    cleanup()
    left = psql("SELECT count(*) FROM customer_company WHERE company_code LIKE 'ZZCUST%'")
    assets = psql("SELECT count(*) FROM customer_logo_asset WHERE customer_company_id NOT IN "
                  "(SELECT customer_company_id FROM customer_company)")
    print(f"정리 — ZZCUST*/ZZDOC* 삭제 (고객사 {left} · 고아 로고 {assets})")

print(f"\nlive_customer_logo: {n}/{n} PASS")
