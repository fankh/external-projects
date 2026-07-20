# -*- coding: utf-8 -*-
"""좌측 패널 내비 헬퍼 — 2.0 이후 기본 패널이 '업무 프로세스' 로 바뀐 뒤 공용.

2.0(좌측 패널 = 업무 프로세스)부터 신규 세션의 좌측 트리는 메뉴가 아니라 프로세스 단계다.
메뉴 라벨(`.tn`, has_text='사용자·권한 (M-14-6)')로 화면을 여는 기존 스위트 36종이 여기서 멈췄고,
2.0/2.1 검증이 새 패널만 봤기 때문에 드러나지 않았다(2.3 에서 일괄 복구).

to_menu() 는 멱등이다 — 이미 메뉴 모드면 아무것도 하지 않는다.
"""


def to_menu(page, wait: int = 350) -> None:
    """좌측 패널을 메뉴 모드로 전환 (프로세스 모드일 때만)."""
    tog = page.locator("[data-process-to-menu]")
    if tog.count():
        tog.first.click()
        page.wait_for_timeout(wait)


def tree_click(page, label: str, wait: int = 0):
    """메뉴 트리 노드 클릭 — 필요하면 메뉴 모드로 전환한 뒤 라벨로 찾는다."""
    to_menu(page)
    node = page.locator(".tn", has_text=label).first
    node.click()
    if wait:
        page.wait_for_timeout(wait)
    return node


def tree_node(page, label: str):
    """메뉴 트리 노드 로케이터 — 존재 여부 검사용 (모드 전환 포함)."""
    to_menu(page)
    return page.locator(".tn", has_text=label)
