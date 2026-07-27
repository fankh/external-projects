# -*- coding: utf-8 -*-
"""MFA(2단계 인증)가 실제로 로그인을 막는가 (18.93).

배경: 요구 #10 `MFA·로그인 감사` 는 Finish 로 적혀 있고 구현도 실재한다(RFC 6238 TOTP,
로그인 경로에서 `mfa_enabled` 검사, 실패 시 `LOGIN_MFA_FAIL` 감사). 그런데 API 표면 실측에서
`/users/me/mfa` 계열이 **한 번도 호출된 적 없는** 경로로 잡혔다 — 이 저장소에서 미호출 경로는
세 번 연속 실제 결함을 갖고 있었다(18.36 검증 항상 합격 · 18.39 도면 조용한 절단 ·
18.76 묶음 상한 부재). 그래서 끝까지 밟는다.

밟는 것: setup 이 시크릿을 주는가 · 틀린 코드로는 활성화되지 않는가 · 활성화 후 **OTP 없이
로그인하면 통과하지 못하는가**(여기가 핵심 — 켤 수는 있는데 막지 않으면 없는 것과 같다) ·
틀린 OTP 는 401 이고 감사에 남는가 · 맞는 OTP 로는 로그인되는가 · 해제하면 원상복귀하는가.

주의: 실 계정에 MFA 를 켜면 다른 스위트가 잠긴다. **전용 계정을 만들고 끝나면 지운다.**

실행: PYTHONUTF8=1 py tests/live_mfa.py
"""
import base64
import hashlib
import hmac
import json
import struct
import subprocess
import time
import urllib.error
import urllib.request

API = "https://edim.seekerslab.com/api/v1"
PROBE = "zzmfa_probe"
PW = "Zzmfa!2345"
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


def totp(secret_b32: str, at: float | None = None) -> str:
    """RFC 6238 TOTP — 서버 구현과 같은 규격(SHA1·6자리·30초)."""
    key = base64.b32decode(secret_b32, casefold=True)
    counter = int((at or time.time()) // 30)
    mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    off = mac[-1] & 0x0F
    val = struct.unpack(">I", mac[off:off + 4])[0] & 0x7FFFFFFF
    return f"{val % 1000000:06d}"


def req(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    h = {"Content-Type": "application/json"}
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    r = urllib.request.Request(API + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:  # noqa: BLE001
            return e.code, None


def cleanup():
    psql(f"DELETE FROM sys_history WHERE target_id IN "
         f"(SELECT user_id FROM sys_user WHERE login_id='{PROBE}')")
    psql(f"DELETE FROM sys_user WHERE login_id='{PROBE}'")


ADM = req("POST", "/auth/login", None, {"userId": "edim", "password": "edim"})[1]["token"]
cleanup()
try:
    st, _ = req("POST", "/users", ADM, {"login": PROBE, "name": "ZZ MFA 프로브",
                                        "department": "검증", "level": "GENERAL",
                                        "initialPassword": PW})
    ok(f"프로브 계정 생성 ({st})", st in (200, 201))

    st, r = req("POST", "/auth/login", None, {"userId": PROBE, "password": PW})
    ok(f"MFA 전 로그인 성공 ({st})", st == 200 and r.get("token"))
    tok = r["token"]

    st, m = req("GET", "/users/me/mfa", tok)
    ok(f"초기 상태 미설정 ({m})", st == 200 and not m["enabled"])

    st, s = req("POST", "/users/me/mfa/setup", tok)
    ok(f"setup 시크릿 발급 ({st})", st == 200 and len(s.get("secret", "")) >= 16)
    secret = s["secret"]
    st, m = req("GET", "/users/me/mfa", tok)
    ok("발급 후 pending (아직 미활성)", m["pending"] and not m["enabled"])

    st, _ = req("POST", "/users/me/mfa/enable", tok, {"code": "000000"})
    ok(f"틀린 코드로는 활성화 불가 ({st})", st == 422)

    st, _ = req("POST", "/users/me/mfa/enable", tok, {"code": totp(secret)})
    ok(f"맞는 코드로 활성화 ({st})", st == 200)
    ok("상태가 enabled", req("GET", "/users/me/mfa", tok)[1]["enabled"] is True)

    # ── 핵심: 켠 뒤 OTP 없이 로그인하면 토큰이 나오면 안 된다 ──
    st, r = req("POST", "/auth/login", None, {"userId": PROBE, "password": PW})
    ok(f"OTP 없는 로그인은 토큰을 주지 않는다 ({st} · {list((r or {}))})",
       st == 200 and r.get("mfaRequired") is True and not r.get("token"))

    st, r = req("POST", "/auth/login", None,
                {"userId": PROBE, "password": PW, "otp": "000000"})
    ok(f"틀린 OTP 는 401 ({st})", st == 401)
    fails = psql("SELECT count(*) FROM sys_history h JOIN sys_user u ON u.user_id=h.target_id "
                 f"WHERE u.login_id='{PROBE}' AND h.action='LOGIN_MFA_FAIL'")
    ok(f"실패가 감사에 남는다 ({fails}건)", fails.isdigit() and int(fails) >= 1)

    st, r = req("POST", "/auth/login", None,
                {"userId": PROBE, "password": PW, "otp": totp(secret)})
    ok(f"맞는 OTP 로 로그인 ({st})", st == 200 and r.get("token"))
    tok2 = r["token"]

    st, _ = req("POST", "/users/me/mfa/disable", tok2, {"code": totp(secret)})
    ok(f"해제 ({st})", st == 200)
    st, r = req("POST", "/auth/login", None, {"userId": PROBE, "password": PW})
    ok("해제 후 OTP 없이 로그인 복귀", st == 200 and r.get("token"))
finally:
    cleanup()
    left = psql(f"SELECT count(*) FROM sys_user WHERE login_id='{PROBE}'")
    print(f"정리 — 프로브 계정 삭제 (잔존 {left})", flush=True)

print(f"\nOK — MFA {n}개 검증 통과")
