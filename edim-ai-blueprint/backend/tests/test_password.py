# -*- coding: utf-8 -*-
"""비밀번호 해시 유닛 테스트 — DB 불요.

레거시(sha256) 해시 인정과 승격은 **운영 DB 에 이미 저장된 계정이 계속 로그인되는지**를
좌우한다. 여기가 깨지면 전 사용자가 잠기므로 경계를 촘촘히 굳혀 둔다.
"""
import hashlib

import pytest

from app.services.password import (ITERATIONS, SCHEME, hash_password,
                                   needs_upgrade, verify_password)


def _legacy(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()


# ── 새 형식 ──
def test_hash_format():
    h = hash_password("secret")
    parts = h.split("$")
    assert parts[0] == SCHEME and int(parts[1]) == ITERATIONS
    assert len(parts[2]) == 32 and len(parts[3]) == 64      # salt 16B, dk 32B


def test_same_password_different_hash():
    """솔트가 있으므로 동일 비밀번호도 매번 다른 해시 — 레인보우 테이블 무력화."""
    assert hash_password("edim") != hash_password("edim")


def test_verify_roundtrip():
    ok, up = verify_password("p@ss word", hash_password("p@ss word"))
    assert ok and up is None          # 최신 형식이면 승격 없음


def test_wrong_password_rejected():
    assert verify_password("wrong", hash_password("right")) == (False, None)


def test_unicode_password():
    h = hash_password("비밀번호1234")
    assert verify_password("비밀번호1234", h)[0]
    assert not verify_password("비밀번호1235", h)[0]


def test_case_sensitive():
    h = hash_password("Edim")
    assert not verify_password("edim", h)[0]


# ── 레거시 인정·승격 ──
def test_legacy_accepted_and_upgraded():
    ok, up = verify_password("edim", _legacy("edim"))
    assert ok, "기존 계정이 로그인되지 않으면 전 사용자가 잠긴다"
    assert up and up.startswith(SCHEME + "$"), "승격 해시를 돌려줘야 한다"
    assert verify_password("edim", up)[0], "승격된 해시로도 로그인돼야 한다"


def test_legacy_wrong_password_rejected():
    assert verify_password("nope", _legacy("edim")) == (False, None)


def test_legacy_uppercase_hex_not_matched_silently():
    """대문자 hex 는 우리 형식이 아니다 — 통과시키면 안 된다."""
    assert verify_password("edim", _legacy("edim").upper()) == (False, None)


def test_needs_upgrade():
    assert needs_upgrade(_legacy("edim"))
    assert not needs_upgrade(hash_password("edim"))
    assert not needs_upgrade("")


# ── 거부해야 하는 입력 ──
@pytest.mark.parametrize("stored", [
    None, "", "   ",
    "pbkdf2_sha256$abc",                       # 필드 부족
    "pbkdf2_sha256$notanint$aa$bb",            # 반복수 파싱 불가
    "pbkdf2_sha256$1000$zz$bb",                # 솔트가 hex 아님
    "plaintext",                               # 알 수 없는 형식
    "0123456789abcdef",                        # 64자 미만 hex
])
def test_malformed_stored_rejected(stored):
    assert verify_password("edim", stored) == (False, None)


def test_empty_password_rejected():
    assert verify_password("", hash_password("edim")) == (False, None)


def test_hash_empty_password_raises():
    """빈 비밀번호를 해시하면 '누구나 로그인' 계정이 생긴다 — 만들지 않는다."""
    with pytest.raises(ValueError):
        hash_password("")


def test_lower_iteration_hash_upgraded():
    """반복수를 올린 뒤에는 기존 해시도 다음 로그인에 재계산된다."""
    h = hash_password("edim")
    weak = h.replace(f"${ITERATIONS}$", "$1000$", 1)
    # 1000회로 다시 계산해 유효한 레코드를 만든다
    salt = bytes.fromhex(weak.split("$")[2])
    dk = hashlib.pbkdf2_hmac("sha256", b"edim", salt, 1000).hex()
    weak = f"{SCHEME}$1000${salt.hex()}${dk}"
    ok, up = verify_password("edim", weak)
    assert ok and up and f"${ITERATIONS}$" in up
