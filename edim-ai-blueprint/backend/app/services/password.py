# -*- coding: utf-8 -*-
"""비밀번호 해시 — 솔트 + 키 스트레칭(PBKDF2-HMAC-SHA256).

종전에는 `sha256(pw).hexdigest()` 였다. 솔트가 없어 같은 비밀번호는 같은 해시가 되고,
스트레칭이 없어 GPU 로 초당 수십억 회 시도가 가능하다 — DB 가 한 번 유출되면
전 사용자 비밀번호가 사실상 즉시 복원된다. 고객사 DB 를 다루는 제품에서 감수할 수 없다.

**기존 해시를 버리지 않는다**: 저장 형식에 스킴을 붙이고, 스킴이 없는 64자 hex 는
레거시 sha256 으로 인정한 뒤 **로그인 성공 시 조용히 새 형식으로 승격**한다.
그래야 일괄 마이그레이션 없이(= 전 사용자 비밀번호 재설정 없이) 넘어갈 수 있다.

저장 형식:  pbkdf2_sha256$<반복수>$<솔트hex>$<해시hex>
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re

SCHEME = "pbkdf2_sha256"
# OWASP 권고 하한(2023) 이상. 로그인 1회당 수십 ms — 사용자 체감은 없고
# 오프라인 대입 비용은 sha256 대비 5~6 자릿수 올라간다.
ITERATIONS = 260_000
_SALT_BYTES = 16

_LEGACY_RE = re.compile(r"^[0-9a-f]{64}$")


def hash_password(password: str) -> str:
    """새 비밀번호를 저장 형식 문자열로 변환한다."""
    if not isinstance(password, str) or not password:
        raise ValueError("비밀번호가 비어 있습니다")
    salt = os.urandom(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"{SCHEME}${ITERATIONS}${salt.hex()}${dk.hex()}"


def _legacy_hash(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, stored: str | None) -> tuple[bool, str | None]:
    """비밀번호를 검증한다.

    반환: (일치 여부, 승격된 해시 | None)
    두 번째 값이 None 이 아니면 호출부가 **DB 에 갱신해야 한다** — 레거시 해시를
    새 형식으로 올리는 유일한 시점이다. 갱신에 실패해도 로그인 자체는 성공시킨다
    (보안 개선이 로그인 가용성을 깨서는 안 된다).
    """
    if not password or not stored:
        return False, None
    stored = stored.strip()

    if stored.startswith(SCHEME + "$"):
        try:
            _, iters_s, salt_hex, hash_hex = stored.split("$", 3)
            iters = int(iters_s)
            salt = bytes.fromhex(salt_hex)
        except (ValueError, TypeError):
            return False, None          # 손상된 레코드 — 통과시키지 않는다
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
        if not hmac.compare_digest(dk.hex(), hash_hex):
            return False, None
        # 반복수 상향 시 다음 로그인에 자동 재계산
        return True, (hash_password(password) if iters < ITERATIONS else None)

    if _LEGACY_RE.match(stored):
        if hmac.compare_digest(_legacy_hash(password), stored):
            return True, hash_password(password)   # 승격
        return False, None

    return False, None


def needs_upgrade(stored: str | None) -> bool:
    """저장된 해시가 구형식인지 — 진단·점검용."""
    return bool(stored) and not str(stored).strip().startswith(SCHEME + "$")
