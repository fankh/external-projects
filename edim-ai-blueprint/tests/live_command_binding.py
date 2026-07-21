# -*- coding: utf-8 -*-
"""Command Button Binding 라이브 (6.8) — 요구 #59 "Button=Command, Context 는 ID 기준".

배경: 버튼의 실행 대상이 화면 정의 안 자유 텍스트라 감사·통제가 불가했고,
화면이 임의 payload 를 실어 보내면 서버가 그대로 믿는 구조였다.
검증: Command 등록 → 미등록 command 버튼 422 → 등록분 통과 → invoke 시 선언 키만 허용 →
     필수 누락 422 → 값 뭉치 422 → 폐기 실행 409 → 사용 중 삭제 409.
정리: ZZCMD*·ZZFC* psql 삭제.
"""
import json
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote

BASE = "https://edim.seekerslab.com"
API = f"{BASE}/api/v1"
CMD = "ZZCMDRUN"
FORM = "ZZFC-BTN"
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
    r = urllib.request.Request(API + quote(path, safe="/?=&%"), data=data, method=method,
                               headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql("DELETE FROM tbx_ui_form WHERE form_name LIKE 'ZZFC%'")
    psql("DELETE FROM tbx_command WHERE command_code LIKE 'ZZCMD%'")


TOK = login("edim", "edim")
cleanup()

try:
    # ── Command 등록 ──
    st, _ = req("PUT", f"/toolbox/commands/{CMD}", TOK,
                {"commandCode": CMD, "commandName": "Run", "handlerKind": "BOGUS",
                 "handlerRef": "x"})
    ok(f"handlerKind 어휘 422 ({st})", st == 422)
    st, c = req("PUT", f"/toolbox/commands/{CMD}", TOK,
                {"commandCode": CMD, "commandName": "Run 실행", "handlerKind": "MACRO",
                 "handlerRef": "Shaft 길이 계산", "requiredContext": ["projectNo", "runId"]})
    ok(f"Command 등록 200 ({st})", st == 200 and c["requiredContext"] == ["projectNo", "runId"])
    st, lst = req("GET", "/toolbox/commands", TOK)
    ok("목록에 노출", any(x["commandCode"] == CMD for x in lst))

    # ── 버튼은 등록된 Command 만 참조 ──
    st, b = req("PUT", f"/toolbox/forms/{FORM}", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "b1", "kind": "PushButton", "command": "ZZCMD-NOPE"}]})
    ok(f"★ 미등록 Command 버튼 422 ({st})", st == 422 and "Command" in (b or {}).get("detail", ""))
    st, _ = req("PUT", f"/toolbox/forms/{FORM}", TOK,
                {"formType": "SCREEN",
                 "layout": [{"id": "b1", "kind": "PushButton", "command": CMD, "label": "실행"}]})
    ok(f"★ 등록 Command 버튼은 저장 200 ({st})", st == 200)

    # ── invoke: 컨텍스트는 선언된 ID 만 ──
    st, r = req("POST", f"/toolbox/commands/{CMD}/invoke", TOK,
                {"context": {"projectNo": "PS-61313-5", "runId": "192"}})
    ok(f"★ 선언 키·ID 값이면 실행 수락 ({st})", st == 200 and r["accepted"] is True)
    st, b = req("POST", f"/toolbox/commands/{CMD}/invoke", TOK,
                {"context": {"projectNo": "PS-61313-5"}})
    ok(f"★ 필수 컨텍스트 누락 422 ({st})", st == 422 and "누락" in (b or {}).get("detail", ""))
    st, b = req("POST", f"/toolbox/commands/{CMD}/invoke", TOK,
                {"context": {"projectNo": "PS-61313-5", "runId": "192", "secret": "1"}})
    ok(f"★ 선언되지 않은 키 422 ({st})", st == 422 and "선언되지" in (b or {}).get("detail", ""))
    st, b = req("POST", f"/toolbox/commands/{CMD}/invoke", TOK,
                {"context": {"projectNo": "{\"rows\":[1,2,3],\"sql\":\"drop\"}", "runId": "192"}})
    ok(f"★ ID 아닌 값 뭉치 422 ({st})", st == 422 and "ID" in (b or {}).get("detail", ""))

    # ── 폐기·삭제 가드 ──
    psql(f"UPDATE tbx_command SET status='RETIRED' WHERE command_code='{CMD}'")
    st, b = req("POST", f"/toolbox/commands/{CMD}/invoke", TOK,
                {"context": {"projectNo": "PS-61313-5", "runId": "192"}})
    ok(f"★ 폐기 Command 실행 409 ({st})", st == 409)
    psql(f"UPDATE tbx_command SET status='DRAFT' WHERE command_code='{CMD}'")
    st, b = req("DELETE", f"/toolbox/commands/{CMD}", TOK)
    ok(f"★ 사용 중 Command 삭제 409 ({st})", st == 409 and FORM in (b or {}).get("detail", ""))
    psql(f"DELETE FROM tbx_ui_form WHERE form_name='{FORM}'")
    st, _ = req("DELETE", f"/toolbox/commands/{CMD}", TOK)
    ok(f"미사용이면 삭제 200 ({st})", st == 200)
    st, _ = req("POST", f"/toolbox/commands/{CMD}/invoke", TOK, {"context": {}})
    ok(f"없는 Command 404 ({st})", st == 404)

    # ── 권한 ──
    gtok = login("kim01", "edim")
    st, _ = req("PUT", "/toolbox/commands/ZZCMDX", gtok,
                {"commandCode": "ZZCMDX", "commandName": "x", "handlerRef": "y"})
    ok(f"GENERAL Command 등록 403 ({st})", st == 403)
finally:
    cleanup()
    left = psql("SELECT count(*) FROM tbx_command WHERE command_code LIKE 'ZZCMD%'")
    print(f"정리 — ZZCMD*/ZZFC* 삭제 (잔존 {left})")

print(f"\nlive_command_binding: {n}/{n} PASS")
