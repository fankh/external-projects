# -*- coding: utf-8 -*-
"""내보내기 안전 상한 라이브 (9.21) — 대용량 export OOM 방지 회로차단.

배경: export.xlsx 계열이 테넌트 전 행을 메모리로 끌어와 워크북을 만든다 — 공유 단일
백엔드에서 한 테넌트의 대용량 내보내기가 OOM·지연을 일으켜 전 테넌트에 영향. 쿼리에
LIMIT(상한+1) 을 걸어 fetch 를 제한하고, 초과 시 상위 N행만 담고 파일 말미 고지 +
X-Truncated 헤더로 정직하게 알린다. 이 스위트는 export 경로가 유효한 xlsx 를 계속
내보내고 새 헤더(X-Truncated=0, 정상 데이터)가 붙는지 검증한다(절단 경로는 5만행
필요라 단위 불변식으로 대체 — 정상 경로 무회귀 확인).
"""
import json
import urllib.error
import urllib.request

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
n = 0

EXPORTS = ["/parts/export.xlsx", "/drawings/export.xlsx",
           "/erp/warehouses/export.xlsx", "/companies/export.xlsx", "/prices/export.xlsx"]


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def login(uid, pw):
    r = urllib.request.Request(f"{API}/auth/login", data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


TOK = login("edim", "edim")


def get_raw(path):
    r = urllib.request.Request(API + path, method="GET",
                               headers={"Authorization": f"Bearer {TOK}"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


for path in EXPORTS:
    st, hdr, body = get_raw(path)
    ok(f"{path} 200", st == 200)
    ok(f"★ {path} 유효 xlsx (PK 매직)", body[:2] == b"PK")
    ok(f"★ {path} X-Truncated 헤더 존재·정상 0 ({hdr.get('X-Truncated')})",
       hdr.get("X-Truncated") == "0")
    ok(f"{path} X-Row-Count 노출 ({hdr.get('X-Row-Count')})",
       hdr.get("X-Row-Count") is not None)

print(f"\nlive_export_caps: {n}/{n} PASS")
