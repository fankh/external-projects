# -*- coding: utf-8 -*-
"""비밀번호 변경 시각 — 그 이전에 발급된 토큰을 무효화하기 위한 기준 (18.51).

문제: 관리자가 비밀번호를 재설정해도 **기존 토큰이 최대 8시간 그대로 통했다**(운영 실측 —
옛 비밀번호 로그인은 401 인데 옛 토큰 조회는 200). 비밀번호 재설정은 계정 탈취에 대한
표준 대응인데, 그 대응이 이미 열린 세션을 끊지 못했다.

계정 비활성화는 매 요청 `status='ACTIVE'` 재확인으로 **즉시** 반영된다(15.3). 같은 목적
(계정 탈취 대응)의 다른 경로만 반영되지 않던 것 — 이 저장소에서 반복해 나온 형태다.

기준값: 토큰은 `login.exp.tenantId.sig` 이고 발급 시각을 담지 않지만, 모든 발급이 동일한
TOKEN_TTL 을 쓰므로 `exp - TOKEN_TTL` 이 발급 시각이다. 이 값이 pw_changed_at 보다 이르면
거부한다. (토큰 형식을 바꾸지 않으므로 구형 토큰 호환도 그대로다.)

기존 계정은 NULL 로 둔다 — NULL 이면 검사하지 않으므로 **이미 로그인한 사용자를 갑자기
끊지 않는다**. 다음 비밀번호 변경부터 적용된다.

Revision ID: 0062_pw_changed_at
Revises: 0061_idempotency
"""
from alembic import op

revision = "0062_pw_changed_at"
down_revision = "0061_idempotency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS pw_changed_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE sys_user DROP COLUMN IF EXISTS pw_changed_at")
