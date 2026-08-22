/* 클라이언트 헬스 체크 — 스모크(SSR HTML)가 못 잡는 하이드레이션/클라이언트 런타임 크래시를 잡는다.
 * 실제 브라우저로 권한그룹 4종(Admin·자산담당·보안담당·사용자) × 각자 접근 가능한 화면을 로그인 상태로 열어,
 * 응답 상태(4xx·5xx)와 처리되지 않은 예외(pageerror)와
 * Next 기본 오류 화면('client-side exception')이 없는지 확인한다.
 * 실행: node scripts/client-health.mjs   (원격: HEALTH_BASE=http://localhost:3390 node scripts/client-health.mjs) */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFreshBuild } from './build-guard.mjs'

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

const ASSET_MGR = { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' }
const SEC_MGR = { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR' }

// 역할별 대상 화면은 내비 정의(components/chrome/menus.ts)에서 그대로 읽는다 — 여기에 목록을 또 두면
//  화면·권한이 바뀔 때 세 번째 손질 지점이 생긴다(스모크가 내비 ↔ 화면 가드 일치를 이미 검사한다).
//  그동안 ADMIN·USER 만 브라우저로 열어, 자산담당·보안담당에게만 보이는 패널·일괄 액션 바의 클라이언트
//  크래시는 이 스위트가 볼 수 없었다(역할 조건부 렌더가 많은 앱이라 사각이 넓다).
const navSrc = fs.readFileSync(path.join(ROOT, 'components', 'chrome', 'menus.ts'), 'utf8')
const NAV_CONST = {}
for (const m of navSrc.matchAll(/const ([A-Z_]+): Role\[\] = \[([^\]]*)\]/g)) {
  NAV_CONST[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const ROUTE_ROLES = {}
for (const m of navSrc.matchAll(/href: '([^']+)'[^}]*roles: ([A-Z_]+|\[[^\]]*\])/g)) {
  ROUTE_ROLES[m[1]] = NAV_CONST[m[2]] ?? [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const routesFor = (role) => Object.entries(ROUTE_ROLES).filter(([, rs]) => rs.includes(role)).map(([href]) => href)

// 무해한 콘솔 잡음 — 실패로 치지 않는다 (실제 크래시는 pageerror 로 잡는다)
const BENIGN = [/favicon/i, /Failed to load resource.*404/i, /Download the React DevTools/i]

// 빌드 신선도 — 예전 빌드를 열면 하이드레이션 크래시 수정이 반영되지 않은 채 통과한다(scripts/build-guard.mjs)
assertFreshBuild(ROOT, { remote: REMOTE })

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
      let httpStatus = 0
      try {
        // 응답 상태도 본다 — 서버 렌더가 500 이면 Next 오류 페이지가 뜰 뿐 pageerror·client-side exception 이 없어
        //  '화면이 열렸다'로 통과한다. 실제로 서버 코드의 TDZ 참조 하나가 /ai/insights 를 500 으로 떨어뜨렸는데
        //  이 스위트가 그대로 통과시킨 적이 있다(스모크의 라우트 접근 매트릭스만 잡아냄).
        const res = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
        httpStatus = res ? res.status() : 0
        await page.waitForTimeout(400)
        crashed = (await page.content()).includes('client-side exception')
      } catch (e) { errs.push('GOTO: ' + e.message) }
      const ok = errs.length === 0 && !crashed && httpStatus < 400
      ok ? pass++ : fail++
      console.log(`${ok ? '✓' : '✗'} [${tag}] ${route}${ok ? '' : ' — ' + (httpStatus >= 400 ? `HTTP ${httpStatus}; ` : '') + (crashed ? 'client-side exception; ' : '') + errs.slice(0, 2).join(' | ')}`)
      await page.close()
    }
    await ctx.close()
  }

  console.log(`클라이언트 헬스 — ${REMOTE ? '원격' : '로컬'} ${BASE}\n`)
  await checkRoutes(ADMIN, routesFor('ADMIN'), 'ADMIN')
  await checkRoutes(ASSET_MGR, routesFor('ASSET_MGR'), 'ASSET_MGR')
  await checkRoutes(SEC_MGR, routesFor('SEC_MGR'), 'SEC_MGR')
  await checkRoutes(USER, routesFor('USER'), 'USER')
  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
