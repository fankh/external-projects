"""클라이언트 헬스체크 — 실제 브라우저로 전 화면을 로드해 콘솔 오류·하이드레이션 크래시를 잡는다.
smoke(SSR HTML)가 못 잡는 클라이언트 크래시를 검사한다 (itam-web client-health 패턴).

사용:  npm run build  후  python scripts/client_health.py
"""
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
# 병렬 세션(itam-web 등)의 테스트 서버가 3370~3470 대역을 쓴다 — 충돌을 피해 3500대 사용
PORT = 3503
BASE = f'http://localhost:{PORT}'

# 전 화면 — components/chrome/menus.ts 와 동기 유지
ROUTES = [
    '/dashboard', '/board/notices', '/board/qna',
    '/finance/invest', '/finance/expense', '/finance/asset-reg',
    '/sr/new', '/sr/requests', '/sr/ci', '/sr/manage', '/sr/delayed',
    '/infra/systems', '/infra/operations', '/infra/incidents', '/infra/changes',
    '/projects/status', '/projects/schedule', '/projects/reports',
    '/pledge/my', '/pledge/dept', '/pledge/manage',
    '/awareness/remote', '/awareness/prints', '/awareness/violations',
    '/compliance/education', '/compliance/inspection',
    '/work/todo', '/work/approvals',
    '/settings/users', '/settings/menus', '/settings/permissions',
    '/settings/codes', '/settings/forms', '/settings/audit',
    '/platform/integrations',
]
# 권한별 렌더 분기 커버 — 관리자 전 화면 + 사용자 대표 화면
USER_ROUTES = ['/dashboard', '/pledge/my', '/awareness/violations', '/compliance/education', '/finance/invest']
# 모바일 뷰포트 검사 대상 — 셀프서비스(제출·조회) 화면. 가로 오버플로가 있으면 실패한다.
MOBILE_ROUTES = ['/dashboard', '/pledge/my', '/awareness/remote', '/work/todo', '/board/notices', '/sr/new']

ADMIN = {'login': 'admin', 'name': '시스템관리자', 'dept': '정보기획팀', 'role': 'ADMIN'}
USER = {'login': 'hw.kim', 'name': '김현우', 'dept': '개발1팀', 'role': 'USER'}


def cookie_for(acct):
    return {
        'name': 'ngv_portal_session',
        'value': urllib.parse.quote(json.dumps(acct, ensure_ascii=False)),
        'domain': 'localhost',
        'path': '/',
    }


def main() -> int:
    if not (ROOT / '.next').exists():
        print('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
        return 1

    server = subprocess.Popen(['npx.cmd' if sys.platform == 'win32' else 'npx', 'next', 'start', '-p', str(PORT)],
                              cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures: list[str] = []
    loaded = 0
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(BASE + '/login', timeout=2)
                break
            except Exception:
                time.sleep(0.5)

        with sync_playwright() as p:
            browser = p.chromium.launch()
            passes = (
                (ADMIN, ROUTES, {'width': 1440, 'height': 900}, False),
                (USER, USER_ROUTES, {'width': 1440, 'height': 900}, False),
                (USER, MOBILE_ROUTES, {'width': 390, 'height': 844}, True),
            )
            for acct, routes, viewport, mobile in passes:
                ctx = browser.new_context(viewport=viewport)
                ctx.add_cookies([cookie_for(acct)])
                page = ctx.new_page()
                errors: list[str] = []
                page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
                page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
                for route in routes:
                    errors.clear()
                    page.goto(BASE + route, wait_until='networkidle')
                    page.wait_for_timeout(150)
                    loaded += 1
                    if mobile:
                        # 본문(body) 가로 오버플로 — 표는 .tbl-wrap 내부 스크롤이어야 하고 페이지가 옆으로 밀리면 안 된다
                        over = page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
                        if over > 4:
                            errors.append(f'가로 오버플로 {over}px')
                    if errors:
                        tag = 'MOBILE ' if mobile else ''
                        failures.append(f'{tag}{acct["role"]} {route}: ' + ' | '.join(errors[:3]))
                ctx.close()
            browser.close()
    finally:
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/pid', str(server.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            server.terminate()

    if failures:
        print(f'✗ client-health: {loaded}화면 로드, {len(failures)}건 오류')
        for f in failures:
            print('  -', f)
        return 1
    print(f'✓ client-health: {loaded}화면 로드, 콘솔 오류·하이드레이션 크래시 없음')
    return 0


if __name__ == '__main__':
    sys.exit(main())
