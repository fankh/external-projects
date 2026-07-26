# -*- coding: utf-8 -*-
"""하드닝 라이브 — 재감사 백로그 완주분(v34.50~53): Run is_test · 패키지 워터마크 · Table 낙관적 잠금.

실행: PYTHONUTF8=1 py tests/live_hardening.py
정리: Table 행 원복 (finally 강제 복원). 읽기 외 서버 잔재 없음.
"""
import io
import json
import os
import urllib.error
import urllib.request
import zipfile
from urllib.parse import quote

BASE = os.getenv("BASE", "https://edim.seekerslab.com/").rstrip("/")
API = f"{BASE}/api/v1"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def req(method, path, body=None, with_headers=False, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, headers=H, method=method)
    with urllib.request.urlopen(r) as resp:
        blob = resp.read()
        payload = blob if raw else json.loads(blob or b"null")
        if with_headers:
            return payload, {k.lower(): v for k, v in resp.headers.items()}
        return payload


r0 = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]
H = {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}

# 1) Run is_test — 목록 필드 노출 + 통계는 업무 Run 만 (테스트 Run 수 ≤ 전체-통계 차)
runs, run_hdr = req("GET", "/cpq/runs", with_headers=True)
ok("Run 목록 isTest 필드", all("isTest" in r for r in runs[:5]))
test_n = sum(1 for r in runs if r["isTest"])
total_stat = req("GET", "/erp/analytics")["runStats"]["total"]
truncated = run_hdr.get("x-truncated") == "true"
ok("Run 목록이 절단 여부를 알린다 (16.9)", "x-truncated" in run_hdr)
if truncated:
    # 목록은 상한에서 잘렸고 통계는 전체를 센다 — 두 모집단이 다르므로 등식이 성립하지 않는다.
    # 종전에는 등식으로 단정해, Run 이 상한을 넘기자 실패했다(제품이 아니라 검증의 문제였다).
    ok(f"절단 시 부등식 성립 (목록 {len(runs)} · 통계 {total_stat} · 테스트 {test_n})",
       test_n <= len(runs) and total_stat >= len(runs) - test_n)
    print(f"   (참고) Run 목록이 상한 {run_hdr.get('x-limit')} 에서 잘렸다 — "
          f"전체 통계와는 모집단이 다르다")
else:
    ok(f"통계 제외 정합 (전체 {len(runs)} = 업무 {total_stat} + 테스트 {test_n})",
       len(runs) == total_stat + test_n)

# 1b) 감사 로그 XLSX 도 잘렸으면 잘렸다고 해야 한다 (17.10)
# 종전에는 기본 1,000행(최대 10,000)에서 자르면서 X-Truncated: 0 을 돌려줬다 —
# _xlsx_response 의 판정 기준이 EXPORT_ROW_CAP(50,000)이라 이 상한에는 걸리지 않았다.
# 침묵이 아니라 **완전하다고 적극적으로 답하는** 형태이고, 감사 로그는 보관·제출용이라
# 누락을 모르면 곤란하다. JSON `/audit` 은 16.2 에서 이미 고쳤는데 XLSX 만 남아 있었다.
# JSON 쪽 truncated=true 면 이력이 상한보다 많다는 뜻 — 같은 조건으로 XLSX 를 확인한다.
_a = req("GET", "/audit?limit=1")
_more = bool(_a.get("truncated")) if isinstance(_a, dict) else False
ok("감사 JSON 은 절단을 알린다 (16.2)", "truncated" in _a)
_, xh = req("GET", "/history/export.xlsx?limit=1", with_headers=True, raw=True)
ok(f"감사 XLSX 가 적용 상한을 알린다 (X-Limit={xh.get('x-limit')})", xh.get("x-limit") == "1")
ok("감사 XLSX 절단 고지 필드 존재", "x-truncated" in xh)
if _more:
    # 잘라 놓고 완전하다고 답하면 감사 자료의 누락을 알 수 없다 — 같은 데이터, 다른 경로
    ok(f"★ 같은 상한에서 JSON 이 절단이면 XLSX 도 절단 표시 ({xh.get('x-truncated')})",
       xh.get("x-truncated") == "1")
    ok(f"절단 시 행 수가 상한 이하 ({xh.get('x-row-count')})",
       int(xh.get("x-row-count", "0")) <= 1)
else:
    print("   (참고) 이력이 1건 이하라 절단 판정을 밟지 못했다")

# 2) 고객 전달 패키지 워터마크
rq = urllib.request.Request(f"{API}/files/export-package?project=PS-61313-5",
                            headers={"Authorization": f"Bearer {TOK}"})
with urllib.request.urlopen(rq, timeout=300) as resp:
    stamped = int(resp.headers.get("X-Watermarked", "0"))
    blob = resp.read()
zf = zipfile.ZipFile(io.BytesIO(blob))
ok(f"X-Watermarked ≥1 ({stamped}건)", stamped >= 1)
from pypdf import PdfReader  # noqa: E402
pdfs = [x for x in zf.namelist() if x.lower().endswith(".pdf")]
if pdfs:
    text = "".join(pg.extract_text() or "" for pg in PdfReader(io.BytesIO(zf.read(pdfs[0]))).pages[:2])
    ok("PDF 텍스트 CONFIDENTIAL", "CONFIDENTIAL" in text)
else:
    ok("PDF 없음 — 텍스트 검사 생략", True)

# 3) Table 행 낙관적 잠금 (원복 포함)
tbl = req("GET", "/tables/Table12")
row = tbl["rows"][0]
key = row["key"]
orig = dict(row["values"])
col = tbl["columns"][0]
mod = dict(orig)
mod[col] = (float(orig.get(col) or 0)) + 1
try:
    req("PUT", f"/tables/Table12/rows/{key}", {"key": key, "values": mod, "baseValues": orig})
    ok("스냅샷 일치 저장 200", True)
    try:
        req("PUT", f"/tables/Table12/rows/{key}", {"key": key, "values": orig, "baseValues": orig})
        ok("stale 스냅샷 409", False)
    except urllib.error.HTTPError as e:
        ok("stale 스냅샷 409", e.code == 409)
    req("PUT", f"/tables/Table12/rows/{key}", {"key": key, "values": orig, "baseValues": mod})
    ok("fresh 스냅샷 원복 200", True)
finally:
    req("PUT", f"/tables/Table12/rows/{key}", {"key": key, "values": orig})
    print("정리 — Table 행 원값 복원", flush=True)

print(f"\nlive_hardening: {n}/{n} PASS")
