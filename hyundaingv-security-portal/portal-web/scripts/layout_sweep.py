"""레이아웃 스윕 — 카드 밖으로 이탈해 도달 불가한 컨트롤을 잡는다.

.hstack 은 flex-wrap 기본값이 nowrap 이라, 첨부 input(고정폭)·버튼이 붙은 입력줄이
c2 그리드 반폭에서 카드를 넘치면 스크롤 조상이 없는 한 컨트롤에 도달할 수 없다.
(선례: 점검계획 수립 폼이 주석 경고에도 컨트롤 6개로 늘며 재발 — v1.5 계열)

.tbl-wrap(overflow-x:auto) 안의 이탈은 설계된 가로 스크롤이므로 제외한다 —
스크롤 가능한 조상이 있으면 통과, 없으면 실패.

사용:  npm run build  후  npm run layout
"""
import base64
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = 3507  # client_health(3503)·smoke(3418)·e2e(3700+) 와 겹치지 않는 대역
BASE = f'http://localhost:{PORT}'

# client_health.py ROUTES 와 동기 유지
ROUTES = [
    '/dashboard', '/board/notices', '/board/qna',
    '/finance/invest', '/finance/expense', '/finance/asset-reg',
    '/sr/new', '/sr/requests', '/sr/ci', '/sr/manage', '/sr/delayed',
    '/infra/systems', '/infra/racks', '/infra/operations', '/infra/incidents', '/infra/changes',
    '/projects/status', '/projects/schedule', '/projects/reports',
    '/pledge/my', '/pledge/dept', '/pledge/manage',
    '/awareness/remote', '/awareness/prints', '/awareness/violations',
    '/compliance/education', '/compliance/inspection', '/compliance/security-review',
    '/compliance/risks', '/compliance/policies', '/compliance/dr',
    '/work/todo', '/work/approvals',
    '/settings/users', '/settings/menus', '/settings/permissions', '/settings/groups',
    '/settings/codes', '/settings/forms', '/settings/audit',
    '/platform/integrations', '/search',
]

WIDTHS = (1280, 1366, 1440)  # 사내 노트북 상용 폭 + 기준 폭
ADMIN = {'login': 'admin', 'name': '시스템관리자', 'dept': '정보기획팀', 'role': 'ADMIN'}
SECRET_STR = os.environ.get('SESSION_SECRET', 'ngv-gate-nondefault-secret')

# 카드 오른쪽 경계를 넘은 컨트롤 중, 스크롤 가능한 조상이 없는 것만 수집한다
PROBE = """(() => { const out = [];
  document.querySelectorAll('.card').forEach((c) => { const cb = c.getBoundingClientRect();
    c.querySelectorAll('button,.btn,input,select').forEach((el) => { const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.right <= cb.right + 1) return;
      let n = el.parentElement, scrollable = false;
      while (n && n !== document.body) { const cs = getComputedStyle(n);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) { scrollable = true; break; }
        n = n.parentElement; }
      if (!scrollable) out.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20),
                                  by: Math.round(r.right - cb.right) }); }); });
  return out.slice(0, 5); })()"""


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


def cookie_for(acct):
    body = {**acct, 'exp': int(time.time() * 1000) + 60 * 60 * 1000}
    payload = _b64url(json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode())
    sig = _b64url(hmac.new(SECRET_STR.encode(), payload.encode(), hashlib.sha256).digest())
    return {'name': 'ngv_portal_session', 'value': f'{payload}.{sig}', 'domain': 'localhost', 'path': '/'}


def main() -> int:
    if not (ROOT / '.next').exists():
        print('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
        return 1
    server = subprocess.Popen(['npx.cmd' if sys.platform == 'win32' else 'npx', 'next', 'start', '-p', str(PORT)],
                              cwd=ROOT, env={**os.environ, 'SESSION_SECRET': SECRET_STR},
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures: list[str] = []
    try:
        for _ in range(90):
            try:
                urllib.request.urlopen(BASE + '/login', timeout=2)
                break
            except Exception:
                time.sleep(0.5)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            # 폭마다 c2 그리드 반폭이 달라진다 — 1440 만 보면 1280 에서만 나는 이탈을 놓친다
            for width in WIDTHS:
                ctx = browser.new_context(viewport={'width': width, 'height': 900})
                ctx.add_cookies([cookie_for(ADMIN)])
                page = ctx.new_page()
                for route in ROUTES:
                    page.goto(BASE + route, wait_until='networkidle')
                    page.wait_for_timeout(120)
                    for hit in page.evaluate(PROBE):
                        failures.append(f'w={width} {route}: {hit["t"]} 이 카드 밖 {hit["by"]}px (스크롤 조상 없음)')
                ctx.close()
            browser.close()
    finally:
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/pid', str(server.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            server.terminate()
    if failures:
        for f in failures:
            print('✗ ' + f)
        print(f'✗ layout: {len(ROUTES)}화면 x {len(WIDTHS)}폭 중 {len(failures)}건 도달 불가 이탈')
        return 1
    print(f'✓ layout: {len(ROUTES)}화면 x {len(WIDTHS)}폭 카드 이탈 컨트롤 없음')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
