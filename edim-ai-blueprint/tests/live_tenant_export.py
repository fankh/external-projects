# -*- coding: utf-8 -*-
"""테넌트 오프보딩 export 가 제품 구성을 재현할 수 있는가 (18.91).

배경: 요구사항 '백업/RPO·RTO·오프보딩 export' 가 Finish 로 되어 있어 실제로 받아 봤다.
동작은 했지만(13종·건수 명시) **Code Set-up 마스터가 통째로 빠져 있었다** —
`code_group`·`code_item`·`code_item_value`. 제품 코드(`product_code`)는 나가는데 **그 코드를
만드는 규칙**은 나가지 않으니, 받은 쪽은 코드 체계를 다시 세울 수 없다. BOM·단가·Macro·
치수·Arrangement 도 같이 빠져 있었고, **파일 목록(`dwg_file`)** 도 없어 `/files/zip` 으로 받은
파일이 어느 프로젝트·어느 역할의 것인지 대조할 방법이 없었다.

오프보딩은 계약상 권리다 — '내보내기가 있다' 와 '내보낸 것으로 재현할 수 있다' 는 다르다.

밟는 것: 묶음이 열리는가 · 매니페스트가 종별 건수를 밝히는가 · **Code Set-up 마스터·BOM·
Macro·파일 목록이 들어 있는가** · 건수가 DB 와 일치하는가 · 비밀번호 해시 같은 민감 필드가
빠져 있는가 · 금액 테이블이 열람 통제를 따르고 **제외 사실을 매니페스트에 적는가**.

정리: 바꾼 역할 모드를 full 로 되돌린다.

실행: PYTHONUTF8=1 py tests/live_tenant_export.py
"""
import io
import json
import subprocess
import urllib.error
import urllib.request
import zipfile

API = "https://edim.seekerslab.com/api/v1"
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
    r = urllib.request.Request(f"{API}/auth/login",
                               data=json.dumps({"userId": uid, "password": pw}).encode(),
                               headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["token"]


def get_zip(tok):
    r = urllib.request.Request(f"{API}/tenant/export.zip",
                               headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.status, resp.read(), dict(resp.headers)


def set_mode(tok, group, mode, role="ADMIN"):
    r = urllib.request.Request(
        f"{API}/access/info", method="PUT",
        data=json.dumps({"roleName": role, "infoGroup": group, "mode": mode}).encode(),
        headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.status


TOK = login("edim", "edim")
tid = int(psql("SELECT tenant_id FROM sys_user WHERE login_id='edim'"))

try:
    st, blob, hdr = get_zip(TOK)
    ok(f"export 200 ({st})", st == 200)
    z = zipfile.ZipFile(io.BytesIO(blob))
    names = set(z.namelist())
    ok(f"묶음이 열린다 ({len(names)}개 항목)", "manifest.txt" in names)
    man = z.read("manifest.txt").decode("utf-8")

    # ── 제품 구성을 재현할 수 있는 최소 집합 ──
    for need in ("code_groups", "code_items", "code_item_values", "boms",
                 "macros", "dimensions", "arrangements", "files"):
        ok(f"{need} 포함", f"{need}.json" in names)

    # ── 건수가 DB 와 일치하는가 (있다고만 하고 비어 있으면 소용없다) ──
    for name, sql in (("code_groups", f"SELECT count(*) FROM code_group WHERE tenant_id={tid}"),
                      ("code_item_values",
                       f"SELECT count(*) FROM code_item_value WHERE tenant_id={tid}"),
                      ("macros", f"SELECT count(*) FROM tbx_macro WHERE tenant_id={tid}"),
                      ("files", f"SELECT count(*) FROM dwg_file WHERE tenant_id={tid}")):
        got = len(json.loads(z.read(f"{name}.json").decode("utf-8")))
        want = int(psql(sql))
        ok(f"{name} 건수 일치 ({got} = {want})", got == want)

    ok("매니페스트가 파일 원본 채널을 안내한다", "/files/zip" in man and "files.json" in man)

    # ── 민감 필드는 나가지 않는다 ──
    users = json.loads(z.read("users.json").decode("utf-8"))
    ok(f"사용자에 비밀번호 계열 필드 없음 ({len(users)}명)",
       users and not any(k for u in users for k in u
                         if "password" in k.lower() or "hash" in k.lower()))

    # ── 금액 테이블은 열람 통제를 따르고, 제외 사실을 밝힌다 ──
    ok(f"cost=no_download 설정 ({set_mode(TOK, 'cost', 'no_download')})", True)
    st, blob2, _ = get_zip(TOK)
    z2 = zipfile.ZipFile(io.BytesIO(blob2))
    man2 = z2.read("manifest.txt").decode("utf-8")
    ok("통제 시 단가가 빠진다", "prices.json" not in set(z2.namelist()))
    ok("빠진 사실을 매니페스트에 적는다", "prices: 제외됨" in man2)
    ok("구성 자산은 그대로 나간다(전체 차단 아님)", "code_groups.json" in set(z2.namelist()))
finally:
    set_mode(TOK, "cost", "full")
    print("정리 — ADMIN cost 를 full 로 원복")

print(f"\nOK — 테넌트 오프보딩 export {n}개 검증 통과")
