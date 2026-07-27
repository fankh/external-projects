# -*- coding: utf-8 -*-
"""검증용 테넌트 정리 공용 헬퍼 (19.6).

배경: 프로브 테넌트를 만드는 스위트가 6종인데 **정리 목록을 각자 들고 있었다.** 그러다
`live_ai_prep`·`live_security_anomaly` 두 곳에서 `sys_hierarchy` 가 빠졌고, 온보딩이 심는
노드 3개가 매 실행 남았다 — 실측 30행(테넌트 10개분)이 쌓여 있었다. 테넌트 행이 없으니
화면에도 안 보이고 잔재 게이트(8.11)의 지문에도 없어 **아무도 모르는 채로** 늘었다.

교훈은 목록이 틀렸다는 것이 아니라 **목록이 여러 벌이면 언젠가 갈라진다**는 것이다.
온보딩이 무엇을 심는지 아는 곳은 하나여야 한다 — `POST /platform/tenants` 는
sys_tenant · sys_user · sys_hierarchy 를 심고, 그 뒤 사용 과정에서 감사·알림·역할이 붙는다.

사용:
    from _tenant import purge_tenant
    purge_tenant(psql, "ZTEST-CO")
"""


# 테넌트에 딸린 행을 지우는 순서 — FK 를 거스르지 않도록 자식부터.
# (sys_history.actor_id 는 사용자를 가리키므로 사용자보다 먼저 지운다)
_BY_USER = ("sys_notification", "sys_user_role")
_BY_TENANT = ("sys_anomaly", "sys_support_request", "sys_history",
              "sys_notification", "sys_hierarchy", "sys_user_role", "sys_user")


def purge_tenant(psql, tenant_code: str) -> str:
    """테넌트 코드로 프로브 테넌트를 통째로 제거한다. 없으면 아무것도 하지 않는다.

    반환: 지운 tenant_id (없었으면 빈 문자열).
    """
    tid = psql(f"SELECT tenant_id FROM sys_tenant WHERE tenant_code='{tenant_code}'")
    if not tid.isdigit():
        return ""
    for tbl in _BY_USER:
        psql(f"DELETE FROM {tbl} WHERE user_id IN "
             f"(SELECT user_id FROM sys_user WHERE tenant_id={tid})")
    psql(f"DELETE FROM sys_history WHERE actor_id IN "
         f"(SELECT user_id FROM sys_user WHERE tenant_id={tid})")
    for tbl in _BY_TENANT:
        psql(f"DELETE FROM {tbl} WHERE tenant_id={tid}")
    psql(f"DELETE FROM sys_tenant WHERE tenant_id={tid}")
    return tid


def orphan_rows(psql) -> str:
    """어느 테넌트에도 속하지 않는 잔재 행 수 (정리 확인용)."""
    return psql("SELECT count(*) FROM sys_hierarchy "
                "WHERE tenant_id NOT IN (SELECT tenant_id FROM sys_tenant)")
