# -*- coding: utf-8 -*-
"""UI 로 만든 Run 을 되돌리는 공용 헬퍼 (19.14).

배경: 화면의 `Run ▶` 을 누르는 검증은 **사용자와 같은 경로**를 밟아야 하므로 정식 Run 을
만든다(여기까지는 맞다). 문제는 그 Run 이 그대로 남으면 **프로젝트의 '최신 SUCCESS Run'**
이 되고, 고객 전달 패키지는 그 Run 의 산출물을 담는다는 것이다(18.77·18.80). 즉 검증이
제품의 납품 기준을 조용히 갈아치운다.

되돌리는 기준은 **자기가 만든 것**이어야 한다 — 시간 범위 같은 무딘 기준은 남의 Run 까지
건드린다(18.83 의 교훈). 그래서 실행 전 max(run_id)를 찍어 두고 그 이후 것만 표기한다.

정리 목록을 스위트마다 따로 들면 언젠가 갈라진다(19.6 에서 테넌트 정리가 그랬다) —
그래서 한 곳에 둔다.

사용:
    from _runs import run_hwm, mark_test_runs
    hwm = run_hwm(psql)
    ...  # UI 로 Run 실행
    mark_test_runs(psql, hwm)
"""


def run_hwm(psql) -> int:
    """지금까지의 max(run_id) — 이 뒤에 생기는 것이 '내가 만든 것'."""
    v = psql("SELECT COALESCE(max(run_id),0) FROM cpq_run")
    return int(v) if str(v).strip().isdigit() else 0


def mark_test_runs(psql, hwm: int) -> int:
    """hwm 이후 생긴 비-테스트 Run 을 테스트 표기로 되돌린다. 반환: 표기한 건수."""
    out = psql(f"UPDATE cpq_run SET is_test=true WHERE run_id > {int(hwm)} AND NOT is_test "
               "RETURNING run_id")
    n = len([x for x in out.split() if x.strip()])
    print(f"정리 — UI 실행 Run 테스트 표기 ({n}건)", flush=True)
    return n
