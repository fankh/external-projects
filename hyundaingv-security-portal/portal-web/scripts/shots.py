"""디자인 검수용 스크린샷 — 화면별로 실제 렌더를 받아 눈으로 확인한다."""
import base64, hashlib, hmac, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PORT = int(os.environ.get('SHOT_PORT', '3520'))
BASE = f'http://localhost:{PORT}'
OUT = Path(os.environ.get('SHOT_DIR', ROOT / 'shots'))
ROUTES = sys.argv[1:] or [
    '/dashboard', '/finance/invest', '/sr/requests', '/sr/new',
    '/infra/systems', '/projects/status', '/compliance/inspection',
    '/work/approvals', '/settings/users', '/platform/integrations', '/board/notices',
]
ADMIN = {'login': 'admin', 'name': '시스템관리자', 'dept': '정보기획팀', 'role': 'ADMIN'}
SECRET = os.environ.get('SESSION_SECRET', 'ngv-gate-nondefault-secret').encode()

def _b64url(d): return base64.urlsafe_b64encode(d).rstrip(b'=').decode()

def cookie_for(acct):
    body = {**acct, 'exp': int(time.time() * 1000) + 3600_000}
    payload = _b64url(json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode())
    sig = _b64url(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return f'{payload}.{sig}'

# 사전 점검 — 이전 실행이 남긴 서버가 같은 포트를 잡고 있으면 낡은 빌드를 찍게 된다.
try:
    urllib.request.urlopen(f'{BASE}/login', timeout=1)
    print(f'포트 {PORT} 를 이미 사용 중이다 — 남은 프로세스를 정리하고 다시 실행한다.')
    sys.exit(2)
except urllib.error.URLError:
    pass
except Exception:
    print(f'포트 {PORT} 응답 있음 — 정리 후 재실행'); sys.exit(2)

srv = subprocess.Popen(['npm.cmd', 'run', 'start', '--', '-p', str(PORT)], cwd=ROOT,
                       env={**os.environ, 'SESSION_SECRET': SECRET.decode()},
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False)
try:
    for _ in range(120):
        try:
            urllib.request.urlopen(f'{BASE}/login', timeout=1); break
        except Exception: time.sleep(0.5)
    else:
        print('서버 기동 실패'); sys.exit(1)
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=1)
        ctx.add_cookies([{'name': 'ngv_portal_session', 'value': cookie_for(ADMIN),
                          'domain': 'localhost', 'path': '/'}])
        pg = ctx.new_page()
        pg.goto(f'{BASE}/login', wait_until='networkidle')
        pg.screenshot(path=str(OUT / '00-login.png'), full_page=True)
        print('00-login.png')
        for i, r in enumerate(ROUTES, 1):
            pg.goto(BASE + r, wait_until='networkidle')
            pg.wait_for_timeout(250)
            name = f"{i:02d}-{r.strip('/').replace('/', '-')}.png"
            pg.screenshot(path=str(OUT / name), full_page=True)
            print(name)
        b.close()
finally:
    # Windows 에서 npm.cmd 를 terminate 하면 자식 node 가 남아 포트를 계속 점유한다 — 트리째 종료.
    subprocess.run(['taskkill', '/F', '/T', '/PID', str(srv.pid)],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
