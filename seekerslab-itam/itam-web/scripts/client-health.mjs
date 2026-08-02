/* 클라이언트 헬스 체크 — 스모크(SSR HTML)가 못 잡는 하이드레이션/클라이언트 런타임 크래시를 잡는다.
 * 실제 브라우저로 30개 화면을 로그인 상태로 열어, 처리되지 않은 예외(pageerror)와
 * Next 기본 오류 화면('client-side exception')이 없는지 확인한다.
 * 실행: node scripts/client-health.mjs   (원격: HEALTH_BASE=http://localhost:3390 node scripts/client-health.mjs) */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3388
const BASE = process.env.HEALTH_BASE || `http://localhost:${PORT}`
const REMOTE = !!process.env.HEALTH_BASE

// playwright 는 전역 설치 — file:// 로 로드
const pw = await import('file:///C:/Users/seekers/AppData/Roaming/npm/node_modules/playwright/index.js')
const { chromium } = pw.default ?? pw
const EXE = 'C:/Users/seekers/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'

const ADMIN = { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }
const USER = { login: 'mj.kim', name: '김민준', dept: '플랫폼개발팀', role: 'USER' }

// (route, account) — ADMIN 은 전 화면, USER 는 접근 가능한 대표 화면
const ADMIN_ROUTES = [
  '/dashboard', '/board/notices', '/board/qna', '/assets/register', '/assets/lifecycle',
  '/assets/intake', '/assets/movement', '/assets/returns', '/assets/disposal', '/inventory/stock',
  '/inventory/contracts', '/inventory/survey', '/inventory/survey-plan', '/discovery/scan', '/discovery/found',
  '/discovery/reconcile', '/discovery/saas', '/discovery/external', '/platform/integrations', '/ai/assistant',
  '/ai/insights', '/ai/reports', '/workflow/approvals', '/settings/menus', '/settings/permissions',
  '/settings/users', '/settings/codes', '/settings/scan-policy', '/settings/saas-catalog', '/settings/ai-policy',
]
const USER_ROUTES = ['/dashboard', '/board/notices', '/board/qna', '/assets/register', '/ai/assistant', '/workflow/approvals']

// 무해한 콘솔 잡음 — 실패로 치지 않는다 (실제 크래시는 pageerror 로 잡는다)
const BENIGN = [/favicon/i, /Failed to load resource.*404/i, /Download the React DevTools/i]

let server = null
if (!REMOTE) {
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore' })
  // 준비 대기
  const start = Date.now()
  while (Date.now() - start < 60000) {
    try { const r = await fetch(`${BASE}/login`); if (r.status === 200) break } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
}

let pass = 0, fail = 0
const cookie = (acct) => ({ name: 'itam_session', value: encodeURIComponent(JSON.stringify(acct)), url: BASE })

try {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })

  const checkRoutes = async (acct, routes, tag) => {
    const ctx = await browser.newContext()
    await ctx.addCookies([cookie(acct)])
    for (const route of routes) {
      const page = await ctx.newPage()
      const errs = []
      page.on('pageerror', (e) => errs.push('PAGEERROR: ' + (e.message || e)))
      page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((re) => re.test(m.text()))) errs.push('CONSOLE: ' + m.text()) })
      let crashed = false
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
        await page.waitForTimeout(400)
        crashed = (await page.content()).includes('client-side exception')
      } catch (e) { errs.push('GOTO: ' + e.message) }
      const ok = errs.length === 0 && !crashed
      ok ? pass++ : fail++
      console.log(`${ok ? '✓' : '✗'} [${tag}] ${route}${ok ? '' : ' — ' + (crashed ? 'client-side exception; ' : '') + errs.slice(0, 2).join(' | ')}`)
      await page.close()
    }
    await ctx.close()
  }

  console.log(`클라이언트 헬스 — ${REMOTE ? '원격' : '로컬'} ${BASE}\n`)
  await checkRoutes(ADMIN, ADMIN_ROUTES, 'ADMIN')
  await checkRoutes(USER, USER_ROUTES, 'USER')
  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
