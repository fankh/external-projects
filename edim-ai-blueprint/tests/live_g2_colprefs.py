# -*- coding: utf-8 -*-
"""G2 라이브 — 그리드 컬럼 리사이즈·순서 변경 영속(감사 조회, prefKey=audit).

리사이즈 핸들 드래그→너비 증가·새로고침 유지 · 헤더 드래그→순서 변경·유지 · ⚙ 초기화 복원.
실행: PYTHONUTF8=1 py tests/live_g2_colprefs.py
"""
from playwright.sync_api import sync_playwright
from _nav import tree_click, tree_node  # 2.3 — 좌측 기본 패널이 프로세스라 메뉴 모드 전환 필요

BASE = "https://edim.seekerslab.com"
n = 0


def ok(label, cond):
    global n
    assert cond, f"FAIL {label}"
    n += 1
    print(f"PASS {label}")


def open_audit(p):
    p.goto(f"{BASE}/erp", wait_until="domcontentloaded")
    p.wait_for_selector('.login-dlg, .app .titlebar', timeout=15000)
    if p.locator('.login-dlg').count():
        p.get_by_label('사번').fill('edim'); p.get_by_label('비밀번호').fill('edim')
        p.get_by_role('button', name='로그인 (Enter)').click()
    p.wait_for_selector('.app .titlebar', timeout=15000)
    p.locator('.titlebar .mod', has_text='ERP').first.click(); p.wait_for_timeout(300)
    tree_click(p, '감사 조회')
    p.wait_for_selector('table.g:visible tbody tr', timeout=15000); p.wait_for_timeout(400)


def th(p, text):
    return p.locator('table.g:visible thead th', has_text=text).first


def data_headers(p):
    # 정렬(▲▼)·컬럼 필터(▽) 글리프 제거 후 순수 헤더명만
    out = []
    for t in p.locator('table.g:visible thead th').all_inner_texts():
        h = t.replace('▲', '').replace('▼', '').replace('▽', '').strip()
        if h:
            out.append(h)
    return out


def reset_cols(p):
    p.locator('[data-col-menu]').first.click(force=True); p.wait_for_timeout(200)
    p.locator('[data-col-reset]').first.click(); p.wait_for_timeout(400)


with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 18.78 — prefs 저장은 **비동기 서버 액션**이라 '얼마쯤 기다린다' 로는 부하에서 깨진다
    # (플릿에서 이 스위트만 반복 실패했고, 단독 실행에서도 재현됐다). 시간이 아니라
    # **저장이 끝났는지**를 API 로 확인하고 새로고침한다.
    api = pw.request.new_context()
    _tok = api.post(f"{BASE}/api/v1/auth/login",
                    data={"userId": "edim", "password": "edim"}).json()["token"]
    api = pw.request.new_context(extra_http_headers={"Authorization": f"Bearer {_tok}"})

    def wait_saved(bucket, what, timeout_ms=8000):
        """서버 prefs 버킷에 이 그리드(prefKey=audit) 항목이 생길 때까지 기다린다.

        DenseGrid 는 너비를 `gridColWidths`, 순서를 `gridColOrder` 버킷에 prefKey 별로 담는다
        (컬럼 표시/숨김은 `gridColumns`). 버킷·키 이름을 잘못 보면 '저장 안 됨' 으로 오판한다 —
        실제로 `prefs/audit`(버킷 오인)과 `audit`(키 오인)으로 두 번 잘못 짚었다.
        """
        import time as _t
        end = _t.time() + timeout_ms / 1000
        last = None
        while _t.time() < end:
            last = (api.get(f"{BASE}/api/v1/prefs/{bucket}").json() or {}).get("value")
            # 배포본 화면의 prefKey 는 `next-audit` 이다(`audit` 은 레거시 SPA 시절 잔여 항목).
            # 키를 잘못 보면 '저장 안 됨' 으로 오판한다 — 실제로 두 번 잘못 짚었다.
            for k in ("next-audit", "audit"):
                if isinstance(last, dict) and last.get(k):
                    return last[k]
            _t.sleep(0.2)
        raise AssertionError(f"FAIL prefs 저장 대기 초과 — {what} (버킷 {bucket} 마지막 값: {last})")

    def wait_dom(fn, what, timeout_ms=8000):
        """화면이 조건을 만족할 때까지 기다린다.

        새로고침 직후 prefs 는 **비동기 fetch 로 불러와 적용**된다. 고정 대기(400ms)로 읽으면
        부하에서 적용 전 값을 보게 되고, 그것이 '영속 실패' 로 보고된다 — 플릿에서 이 스위트가
        반복 실패한 실제 원인이 이것이었다(제품 결함이 아니라 검증의 조급함).
        """
        import time as _t
        end = _t.time() + timeout_ms / 1000
        last = None
        while _t.time() < end:
            last = fn()
            if last is not None and last is not False:
                return last
            _t.sleep(0.2)
        raise AssertionError(f"FAIL 화면 반영 대기 초과 — {what}")

    p = b.new_context(viewport={'width': 1600, 'height': 900}).new_page()
    open_audit(p)
    reset_cols(p)   # 클린 상태
    open_audit(p)

    # ── 리사이즈 ──
    col = th(p, '일시')
    w0 = col.bounding_box()['width']
    handle = col.locator('[data-col-resize]')
    hb = handle.bounding_box()
    p.mouse.move(hb['x'] + 3, hb['y'] + hb['height'] / 2)
    p.mouse.down(); p.mouse.move(hb['x'] + 90, hb['y'] + hb['height'] / 2, steps=6); p.mouse.up()
    p.wait_for_timeout(400)
    w1 = th(p, '일시').bounding_box()['width']
    ok(f"리사이즈 — 너비 증가 {round(w0)}→{round(w1)}", w1 > w0 + 40)

    saved = wait_saved("gridColWidths", "리사이즈 너비")
    ok(f"리사이즈가 서버에 저장됨 ({saved})", bool(saved))
    open_audit(p)   # 새로고침
    w2 = wait_dom(lambda: (lambda w: w if abs(w - w1) < 12 else None)(
        th(p, '일시').bounding_box()['width']), "리사이즈 너비 복원")
    ok(f"리사이즈 영속 — 새로고침 후 유지 ({round(w2)})", abs(w2 - w1) < 12)

    # ── 순서 변경 ── '작업'을 '일시' 앞으로
    before = data_headers(p)
    th(p, '작업').drag_to(th(p, '일시'))
    # 18.78 — 여기도 시간 대기 대신 **저장 확인**으로 바꾼다(순서 키가 생길 때까지).
    wait_saved("gridColOrder", "컬럼 순서")
    after = data_headers(p)
    ok(f"순서 변경 — 작업이 앞으로 ({before[:2]}→{after[:2]})", after.index('작업') < after.index('일시'))

    open_audit(p)   # 새로고침
    wait_dom(lambda: data_headers(p).index('작업') < data_headers(p).index('일시') or None,
             "컬럼 순서 복원")
    ok("순서 영속 — 새로고침 후 유지", True)

    # ── 초기화 ──
    reset_cols(p)
    open_audit(p)
    wait_dom(lambda: (abs(th(p, '일시').bounding_box()['width'] - w0) < 12) or None, "초기화 너비")
    ok("초기화 — 너비 복원", True)
    wait_dom(lambda: (data_headers(p).index('일시') < data_headers(p).index('작업')) or None,
             "초기화 순서")
    ok("초기화 — 순서 복원(일시가 작업보다 앞)", True)

    b.close()

print(f"\nOK — live_g2_colprefs {n}/{n}")
