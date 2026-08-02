"""E2E 스위트 — 실제 브라우저로 핵심 폐쇄 루프를 검증한다 (Playwright).
smoke(SSR)·client_health(크래시)가 못 보는 '동작'을 본다: 결재 전파, 어댑터 채널의 업무 영향,
파일 업로드, 양식 개정 재산출, 재상신 생명주기, 스케줄러 자동 발화, 런타임 복구.

각 시나리오는 독립 서버(시드 초기화)에서 돌아 순서 간섭이 없다.
사용:  npm run build  후  python scripts/e2e_suite.py  (특정만: python scripts/e2e_suite.py sr settle)
"""
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE_PORT = 3520
UPLOAD = ROOT / 'scripts' / '.e2e-upload.txt'


def login(pg, base, name):
    pg.goto(f'{base}/login', wait_until='networkidle')
    pg.click(f'.acct:has-text("{name}")')
    pg.wait_for_url('**/dashboard')


def approve_first(pg, base, needle):
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text=needle).first
    assert row.count() > 0, f'결재 수신 없음: {needle}'
    row.locator('button:has-text("승인")').click()
    pg.wait_for_load_state('networkidle')


# ── 시나리오 정의 ─────────────────────────────────────────────

def sc_pledge(pg, base, check):
    """서약 제출 → 할일 마감 → 대시보드 갱신"""
    login(pg, base, '김현우')
    stat = pg.locator('.stat', has_text='보안서약서')
    check('미제출' in stat.inner_text(), '대시보드 서약 미제출')
    pg.goto(f'{base}/pledge/my', wait_until='networkidle')
    pg.check('input[name=agree]')
    pg.click('button:has-text("서약서 제출")')
    pg.wait_for_selector('text=제출 완료', timeout=10000)
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    check('완료' in pg.locator('.stat', has_text='보안서약서').inner_text(), '제출 → 서약 스탯 완료')
    check('2026년 일반 보안서약서 제출' not in pg.locator('.card', has_text='나의 할일').inner_text(), '할일 자동 마감')


def sc_sr(pg, base, check):
    """SR 신청(첨부) → 승인 → CI 배정 → 반려 재상신 생명주기"""
    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.select_option('select[name=kind]', '데이터')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 데이터 추출')
    pg.set_input_files('input[name=file]', str(UPLOAD))
    pg.click('button:has-text("결재 상신")')
    pg.wait_for_url('**/sr/requests**')
    check('📎1' in pg.locator('tr', has_text='E2E 데이터 추출').inner_text(), '신청 첨부 뱃지')

    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text='E2E 데이터 추출')
    check('📎1' in row.inner_text(), '결재함 첨부 표시')
    row.locator('input[name=reason]').fill('근거 보완 필요')
    row.locator('button:has-text("반려")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '김현우')
    pg.goto(f'{base}/work/todo', wait_until='networkidle')
    check('보완 후 재상신' in pg.content(), '반려 → 재상신 할일')
    pg.goto(f'{base}/sr/requests', wait_until='networkidle')
    pg.locator('tr', has_text='E2E 데이터 추출').locator('button:has-text("재상신")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    approve_first(pg, base, '[재상신] E2E 데이터 추출')
    pg.goto(f'{base}/sr/ci', wait_until='networkidle')
    check('E2E 데이터 추출' in pg.content(), '재상신 승인 → CI배정')


def sc_settle(pg, base, check):
    """정산품의 반려 → 재상신 → 승인 → 지급완료"""
    login(pg, base, '이수진')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    card = pg.locator('.card', has_text='정산품의')
    card.locator('select[name=contractId]').select_option('CT-2026-03')
    card.locator('input[name=amount]').fill('2000')
    card.locator('button:has-text("정산품의 상신")').click()
    pg.wait_for_selector('text=ST-2026-0003', timeout=10000)

    login(pg, base, '박정호')
    row = pg.locator('tr', has_text='정산품의-비용').first
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    row = pg.locator('tr', has_text='정산품의-비용').first
    row.locator('input[name=reason]').fill('증빙 누락')
    row.locator('button:has-text("반려")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '이수진')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    pg.locator('tr', has_text='ST-2026-0003').locator('button:has-text("재상신")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    approve_first(pg, base, '[재상신] [정산품의-비용]')
    pg.goto(f'{base}/finance/expense', wait_until='networkidle')
    check('지급완료' in pg.locator('tr', has_text='ST-2026-0003').inner_text(), '재상신 승인 → 지급완료')


def sc_adapter(pg, base, check):
    """채널 토글 → 발송 실패/성공, secdata 이관 → 출력물 폐기 결재"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    pg.locator('tr', has_text='그룹웨어 메일').locator('button:has-text("중지")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    pg.goto(f'{base}/pledge/dept', wait_until='networkidle')
    pg.locator('form:has(input[value="개발1팀"]) button').first.click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    check('실패' in pg.locator('.card', has_text='발송 이력').inner_text(), '채널 중지 → 발송 실패 기록')

    pg.locator('tr', has_text='그룹웨어 메일').locator('button:has-text("가동")').click()
    pg.wait_for_load_state('networkidle')
    pg.locator('tr', has_text='보안·출력물 시스템').locator('button:has-text("가동")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '박정호')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    pg.click('button:has-text("전일자 이관 실행")')
    pg.wait_for_selector('text=PR-2026-0001', timeout=10000)
    check('고객사 정산 내역서' in pg.content(), 'secdata 이관 5건')

    login(pg, base, '김현우')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    for _ in range(2):
        form = pg.locator('form:has(select[name=method])').first
        if form.count() == 0:
            break
        form.locator('button:has-text("폐기 등록")').click()
        pg.wait_for_load_state('networkidle')
        pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    pg.click('button:has-text("내 폐기현황 결재상신")')
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')
    approve_first(pg, base, '출력물폐기')
    pg.goto(f'{base}/awareness/prints', wait_until='networkidle')
    check('폐기확정' in pg.content(), '폐기 결재 승인 → 폐기확정')


def sc_revision(pg, base, check):
    """서약양식 개정 → 전원 재서약 재산출 → 스캔본 등록"""
    from datetime import datetime, timedelta, timezone
    today = (datetime.now(timezone.utc) + timedelta(hours=9)).strftime('%Y-%m-%d')
    login(pg, base, '박정호')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    row = pg.locator('tr', has_text='일반 보안서약서')
    row.locator('input[name=revisedAt]').fill(today)
    row.locator('button:has-text("개정")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    check('8' in pg.locator('.stat', has_text='미서약').inner_text(), '개정 → 전원(8명) 재서약 대상')
    pg.locator('tr', has_text='강도윤').locator('button:has-text("스캔본 업로드")').click()
    pg.wait_for_load_state('networkidle')
    pg.goto(f'{base}/pledge/manage', wait_until='networkidle')
    check('7' in pg.locator('.stat', has_text='미서약').inner_text(), '스캔본 등록 → 미서약 감소')


def sc_codes(pg, base, check):
    """공통코드 토글 → 장애 등록 선택지 반영"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/codes', wait_until='networkidle')
    pg.locator('.card', has_text='장애등급').locator('tr', has_text='3등급').locator('button:has-text("중지")').click()
    pg.wait_for_load_state('networkidle')
    login(pg, base, '박정호')
    pg.goto(f'{base}/infra/incidents', wait_until='networkidle')
    opts = pg.locator('select[name=grade] option').all_inner_texts()
    check(opts == ['1등급', '2등급'], f'중지 코드 선택지 제거 ({opts})')


def sc_approval_line(pg, base, check):
    """결재선 변경 → 이후 상신의 결재자 변경"""
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/settings/users', wait_until='networkidle')
    row = pg.locator('tr', has_text='SR 신청')
    row.locator('select[name=approver]').select_option('시스템관리자')
    row.locator('button:has-text("저장")').click()
    pg.wait_for_load_state('networkidle')

    login(pg, base, '김현우')
    pg.goto(f'{base}/sr/new', wait_until='networkidle')
    pg.fill('input[name=system]', 'ERP')
    pg.fill('input[name=title]', 'E2E 결재선 검증')
    pg.click('button:has-text("결재 상신")')
    pg.wait_for_url('**/sr/requests**')

    login(pg, base, '박정호')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    check('E2E 결재선 검증' not in pg.locator('.card', has_text='수신함 — 결재 대기').inner_text(), '기존 결재자 미수신')
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/work/approvals', wait_until='networkidle')
    check(pg.locator('tr', has_text='E2E 결재선 검증').count() > 0, '변경된 결재자 수신')


def sc_scheduler(pg, base, check):
    """알림 배치 스케줄러 자동 발화 (PORTAL_NOTIFY_INTERVAL_MS=2000)"""
    time.sleep(3.5)
    login(pg, base, '시스템관리자')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    check('일일 알림 배치' in pg.locator('.card', has_text='배치 실행 이력').inner_text(), '자동 배치 이력')
    pg.goto(f'{base}/settings/audit', wait_until='networkidle')
    check('스케줄러' in pg.content(), '감사 행위자=스케줄러')


def sc_runtime(pg, base, check):
    """브랜디드 404 + ChunkReload 자동 복구"""
    login(pg, base, '김현우')
    pg.goto(f'{base}/no-such-screen', wait_until='networkidle')
    check('화면을 찾을 수 없습니다' in pg.content(), '브랜디드 404')
    pg.goto(f'{base}/dashboard', wait_until='networkidle')
    pg.evaluate('window.__marker = 1')
    pg.evaluate("window.dispatchEvent(new ErrorEvent('error', { message: 'ChunkLoadError: Loading chunk 1 failed' }))")
    pg.wait_for_load_state('networkidle')
    pg.wait_for_timeout(800)
    check(pg.evaluate('window.__marker') is None, '청크 오류 → 자동 새로고침')


def sc_profile(pg, base, check):
    """프로필 스위칭 — PORTAL_PROFILE=manufacturer 로 브랜딩·채널 구성 전환"""
    pg.goto(f'{base}/login', wait_until='networkidle')
    check('HANBIT IT PORTAL' in pg.content(), '로그인 브랜딩 전환')
    login(pg, base, '시스템관리자')
    check('한빛제조' in pg.locator('.statusbar').inner_text(), '상태바 고객사 전환')
    pg.goto(f'{base}/platform/integrations', wait_until='networkidle')
    body = pg.content()
    check('한빛제조' in body and '그룹웨어 메일·문자' in body, '채널 구성 전환')
    check('문자(SMS) 발송' not in body, 'SMS 채널 제거(6채널)')
    check('erp-asset' in body, 'ERP 자산 어댑터 바인딩')
    login(pg, base, '박정호')
    pg.goto(f'{base}/finance/asset-reg', wait_until='networkidle')
    check('SN-NB-88121' in pg.content(), 'erp-asset 어댑터 실동작(자산 조회)')


SCENARIOS = [
    ('pledge', '서약 제출 → 할일 마감', sc_pledge, {}),
    ('sr', 'SR 생명주기 (첨부·반려·재상신·승인)', sc_sr, {}),
    ('settle', '정산 반려 → 재상신 → 지급완료', sc_settle, {}),
    ('adapter', '어댑터 채널 토글·secdata 이관·폐기 결재', sc_adapter, {}),
    ('revision', '양식 개정 → 전원 재서약 재산출', sc_revision, {}),
    ('codes', '공통코드 토글 → 업무 선택지', sc_codes, {}),
    ('line', '결재선 변경 → 결재자 변경', sc_approval_line, {}),
    ('scheduler', '알림 배치 자동 발화', sc_scheduler, {'PORTAL_NOTIFY_INTERVAL_MS': '2000'}),
    ('runtime', '404 · ChunkReload 복구', sc_runtime, {}),
    ('profile', '고객사 프로필 스위칭 (manufacturer)', sc_profile, {'PORTAL_PROFILE': 'manufacturer'}),
]


def run_scenario(idx, key, title, fn, extra_env, browser):
    port = BASE_PORT + idx
    base = f'http://localhost:{port}'
    env = {**os.environ, **extra_env}
    env.pop('PORTAL_DATA_FILE', None)  # 항상 시드 초기화
    server = subprocess.Popen(
        ['npx.cmd' if sys.platform == 'win32' else 'npx', 'next', 'start', '-p', str(port)],
        cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failures = []

    def check(cond, label):
        if not cond:
            failures.append(label)

    try:
        for _ in range(60):
            try:
                body = urllib.request.urlopen(f'{base}/login', timeout=2).read().decode('utf-8')
                # 프로필과 무관한 로그인 카드 문구로 우리 앱임을 확인 (타 세션 서버 오인 방지)
                assert '계정을 선택하세요' in body, f'포트 {port} 를 다른 앱이 점유'
                break
            except AssertionError:
                raise
            except Exception:
                time.sleep(0.5)
        ctx = browser.new_context(viewport={'width': 1560, 'height': 900})
        pg = ctx.new_page()
        fn(pg, base, check)
        ctx.close()
    except Exception as e:  # noqa: BLE001 — 시나리오 실패를 수집하고 다음으로
        failures.append(f'예외: {e}')
    finally:
        if sys.platform == 'win32':
            subprocess.run(['taskkill', '/pid', str(server.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            server.terminate()
    status = '✓' if not failures else '✗'
    print(f'{status} [{key}] {title}' + (': ' + ' | '.join(failures) if failures else ''))
    return not failures


def main() -> int:
    if not (ROOT / '.next').exists():
        print('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
        return 1
    only = set(sys.argv[1:])
    targets = [(i, s) for i, s in enumerate(SCENARIOS) if not only or s[0] in only]
    UPLOAD.write_text('e2e upload payload ' * 30, encoding='utf-8')
    passed = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for i, (key, title, fn, extra_env) in targets:
            if run_scenario(i, key, title, fn, extra_env, browser):
                passed += 1
        browser.close()
    UPLOAD.unlink(missing_ok=True)
    total = len(targets)
    print(f'\n{"✓" if passed == total else "✗"} e2e: {passed}/{total} 시나리오 통과')
    return 0 if passed == total else 1


if __name__ == '__main__':
    sys.exit(main())
