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


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, headers=H, method=method)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read() or b"null")


r0 = urllib.request.Request(f"{API}/auth/login",
    data=json.dumps({"userId": "edim", "password": "edim"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
TOK = json.loads(urllib.request.urlopen(r0).read())["token"]
H = {"Authorization": f"Bearer {TOK}", "Content-Type": "application/json"}

# 1) Run is_test — 목록 필드 노출 + 통계는 업무 Run 만 (테스트 Run 수 ≤ 전체-통계 차)
runs = req("GET", "/cpq/runs")
ok("Run 목록 isTest 필드", all("isTest" in r for r in runs[:5]))
test_n = sum(1 for r in runs if r["isTest"])
total_stat = req("GET", "/erp/analytics")["runStats"]["total"]
ok(f"통계 제외 정합 (전체 {len(runs)} = 업무 {total_stat} + 테스트 {test_n})",
   len(runs) == total_stat + test_n)

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
