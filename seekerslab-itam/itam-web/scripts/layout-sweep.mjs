/** 레이아웃 스윕 — 카드 밖으로 이탈해 도달 불가한 컨트롤을 잡는다.
 *
 *  .hstack 은 flex-wrap 기본값이 nowrap 이라, 첨부 input(고정폭)·버튼이 붙은 입력줄이
 *  좁은 폭에서 카드를 넘치면 스크롤 조상이 없는 한 컨트롤에 도달할 수 없다.
 *  (거버넌스 포털에서 같은 결함군 5건 — inspection·sr/ci·projects·dr·reports — 이 확인됐고,
 *   주석 경고에도 재발했다. 사람 눈으로는 못 막아 게이트로 고정한다.)
 *
 *  .tbl-wrap 등 overflow-x:auto 컨테이너 안의 이탈은 설계된 가로 스크롤이므로 제외한다 —
 *  스크롤 가능한 조상이 있으면 통과, 없으면 실패.
 *
 *  사용:  npm run build  후  npm run layout
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3391 // client-health(3388) 와 겹치지 않는 대역
const BASE = process.env.LAYOUT_BASE || `http://localhost:${PORT}`
const REMOTE = !!process.env.LAYOUT_BASE

// playwright 는 전역 설치 — file:// 로 로드 (client-health.mjs 와 동일)
const pw = await import('file:///C:/Users/seekers/AppData/Roaming/npm/node_modules/playwright/index.js')
const { chromium } = pw.default ?? pw
const EXE = 'C:/Users/seekers/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'

const ADMIN = { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }

// client-health.mjs ADMIN_ROUTES 와 동기 유지
const ROUTES = [
  '/dashboard', '/board/notices', '/board/qna', '/assets/register', '/assets/lifecycle',
  '/assets/intake', '/assets/movement', '/assets/returns', '/assets/disposal', '/inventory/stock',
  '/inventory/contracts', '/inventory/survey', '/inventory/survey-plan', '/discovery/scan', '/discovery/found',
  '/discovery/reconcile', '/discovery/saas', '/discovery/external', '/platform/integrations', '/ai/assistant',
  '/ai/insights', '/ai/reports', '/workflow/approvals', '/settings/menus', '/settings/permissions',
  '/settings/users', '/settings/codes', '/settings/scan-policy', '/settings/saas-catalog', '/settings/ai-policy',
]

// 폭마다 그리드 반폭이 달라진다 — 기준 폭 하나로는 특정 구간에서만 나는 이탈을 놓친다
const WIDTHS = [768, 1024, 1280, 1366, 1440]

// 카드 경계를 넘은 컨트롤 중, 스크롤 가능한 조상이 없는 것만 수집한다
const PROBE = `(() => { const out = [];
  document.querySelectorAll('.card').forEach((c) => { const cb = c.getBoundingClientRect();
    c.querySelectorAll('button,.btn,input,select').forEach((el) => { const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.right <= cb.right + 1) return;
      // 스크롤 조상은 반드시 카드 '안'이어야 한다 — 카드 위(앱 셸의 content 등)에서 스크롤되는 것은
      // 페이지 전체가 옆으로 밀린다는 뜻이라 설계된 표 스크롤이 아니다.
      let n = el.parentElement, scrollable = false;
      while (n && n !== c) { const cs = getComputedStyle(n);
        if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 2) { scrollable = true; break; }
        n = n.parentElement; }
      if (!scrollable) out.push({ t: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20),
                                  by: Math.round(r.right - cb.right) }); }); });
  return out.slice(0, 5); })()`

let server = null
if (!REMOTE) {
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore' })
  const start = Date.now()
  while (Date.now() - start < 60000) {
    try { const r = await fetch(`${BASE}/login`); if (r.status === 200) break } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
}

const cookie = (acct) => ({ name: 'itam_session', value: encodeURIComponent(JSON.stringify(acct)), url: BASE })
const failures = []
let checks = 0

try {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addCookies([cookie(ADMIN)])
    const page = await ctx.newPage()
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(120)
      checks++
      for (const hit of await page.evaluate(PROBE)) {
        failures.push(`w=${width} ${route}: ${hit.t} 이 카드 밖 ${hit.by}px (스크롤 조상 없음)`)
      }
    }
    await ctx.close()
  }
  await browser.close()
} catch (err) {
  failures.push(`실행 오류: ${err instanceof Error ? err.message : err}`)
} finally {
  server?.kill()
}

for (const f of failures) console.log('✗ ' + f)
if (failures.length === 0) {
  console.log(`✓ layout: ${ROUTES.length}화면 x ${WIDTHS.length}폭 (${checks}건) 카드 이탈 컨트롤 없음`)
} else {
  console.log(`✗ layout: ${checks}건 중 ${failures.length}건 도달 불가 이탈`)
}
process.exit(failures.length === 0 ? 0 : 1)
