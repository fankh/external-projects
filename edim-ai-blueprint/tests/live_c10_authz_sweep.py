# -*- coding: utf-8 -*-
"""C10 — authz 전수 스윕. 라우터(edim.py)에서 write 엔드포인트를 자동 도출해

GENERAL 계정 → 403(SETUP/ADMIN 게이트) · 무토큰 → 401 을 전수 검증.
b15 의 고정 목록(약 10개) 대비 **자동 생성** — 신규 write op 누락 방지.

실행: PYTHONUTF8=1 py tests/live_c10_authz_sweep.py
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "https://edim.seekerslab.com").rstrip("/") + "/api/v1"
HERE = os.path.dirname(os.path.abspath(__file__))
ROUTER = os.path.join(HERE, "..", "backend", "app", "routers", "edim.py")


def login(user, pw="edim"):
    body = json.dumps({"userId": user, "password": pw}).encode()
    req = urllib.request.Request(f"{BASE}/auth/login", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)["token"]


def call(method, path, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=b"{}", headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:  # noqa: BLE001
        return 0


# ── 라우터에서 write 엔드포인트 자동 도출 (SETUP/ADMIN 게이트 대상) ──
src = open(ROUTER, encoding="utf-8").read()
# @router.post("/path", ... dependencies=[SETUP|ADMIN] ...) 형태
PAT = re.compile(
    r'@router\.(post|put|patch|delete)\(\s*["\']([^"\']+)["\'][^)]*?(SETUP|ADMIN)', re.S)
writes = []
for m in PAT.finditer(src):
    method, path, gate = m.group(1).upper(), m.group(2), m.group(3)
    # 경로 파라미터 치환 ({x} → 1, 문자열형은 zzz)
    p = re.sub(r"\{[^}]*_no\}|\{[^}]*name\}|\{[^}]*code\}|\{group\}|\{login\}|\{doc_no\}", "zzz", path)
    p = re.sub(r"\{[^}]+\}", "1", p)
    writes.append((method, p, gate, path))

# 중복 제거
seen = set()
uniq = []
for w in writes:
    k = (w[0], w[1])
    if k not in seen:
        seen.add(k)
        uniq.append(w)

print(f"라우터에서 도출한 SETUP/ADMIN write 엔드포인트: {len(uniq)}개")

tok_general = login("kim01")   # GENERAL (시드 v2)

fails = []
n_403 = n_401 = 0
for method, p, gate, orig in uniq:
    s_general = call(method, p, tok_general)   # GENERAL → 403 기대 (auth 통과 후 게이트 차단)
    s_notoken = call(method, p, None)          # 무토큰 → 401 기대
    ok_g = s_general in (403,)                 # 게이트 차단 (422/409 = auth 통과 = BAD)
    ok_n = s_notoken in (401,)
    if ok_g:
        n_403 += 1
    else:
        fails.append(f"GENERAL {method} {orig} -> {s_general} (403 기대)")
    if ok_n:
        n_401 += 1
    else:
        fails.append(f"무토큰 {method} {orig} -> {s_notoken} (401 기대)")

print(f"GENERAL→403: {n_403}/{len(uniq)} · 무토큰→401: {n_401}/{len(uniq)}")
if fails:
    print(f"FAIL — {len(fails)}건:")
    for f in fails[:20]:
        print(f"  {f}")
else:
    print(f"PASS — write 엔드포인트 {len(uniq)}개 전수 authz (GENERAL 403 · 무토큰 401)")
sys.exit(1 if fails else 0)
