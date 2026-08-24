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
    const badLinks = []
    const badApis = []
    const unnamed = []
    const unlabeled = []
    const seenApi = new Set()
    // 한 화면에서 링크 두 종류를 함께 본다 — 화면 링크는 라우트 권한, API 링크는 실제 응답으로 판정한다.
    const collectLinks = async (page, label) => {
      try {
        const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href') || ''))
        for (const raw of hrefs) {
          const path0 = raw.split('?')[0].split('#')[0]
          const allowed = ROUTE_ROLES[path0]
          if (!allowed || allowed.includes(acct.role)) continue
          badLinks.push(`${label} → ${path0}`)
        }
      } catch (e) { badLinks.push(`${label} → 링크 수집 실패: ${e.message}`) }
      try {
        const apis = await page.$$eval('a[href^="/api/"]', (as) => as.map((a) => a.getAttribute('href') || ''))
        for (const raw of [...new Set(apis)]) {
          if (seenApi.has(raw)) continue
          seenApi.add(raw)
          const res = await ctx.request.get(`${BASE}${raw}`)
          if (res.status() >= 400) badApis.push(`${label} → ${raw} (HTTP ${res.status()})`)
        }
      } catch (e) { badApis.push(`${label} → API 링크 확인 실패: ${e.message}`) }
      // 이름 없는 조작 컨트롤 — 보이는 글자도 aria-label·title 도 없는 버튼·링크는 스크린리더에서 '버튼'으로만 읽히고,
      //  아이콘만 남은 컨트롤은 눈으로도 뜻을 알 수 없다. 화면을 이미 열어 두었으므로 같은 순회에서 함께 센다.
      try {
        const nameless = await page.$$eval('button, a[href]', (els) => els.filter((e) => {
          const txt = (e.textContent || '').trim()
          const label = e.getAttribute('aria-label') || e.getAttribute('title') || ''
          return !txt && !label
        }).map((e) => e.outerHTML.slice(0, 60)))
        for (const n of nameless) unnamed.push(`${label} → ${n}`)
      } catch (e) { unnamed.push(`${label} → 컨트롤 이름 확인 실패: ${e.message}`) }
      // 이름 없는 입력 — 스크린리더가 '콤보 상자'로만 읽는 필터·입력은 무엇을 고르는 칸인지 알 수 없다.
      //  라벨(label for·감싼 label)·aria-label·title·placeholder 중 하나면 충분하다.
      try {
        const noName = await page.$$eval('input:not([type=hidden]), select, textarea', (els) => els.filter((e) => {
          const aria = e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('placeholder') || ''
          const id = e.getAttribute('id')
          const lab = id ? document.querySelector('label[for="' + id + '"]') : null
          return !aria && !lab && !e.closest('label')
        }).map((e) => e.outerHTML.slice(0, 70)))
        for (const n of noName) unlabeled.push(`${label} → ${n}`)
      } catch (e) { unlabeled.push(`${label} → 입력 이름 확인 실패: ${e.message}`) }
    }
    const ctx = await browser.newContext()
    await ctx.addCookies([cookie(acct)])
    // 대시보드 '운영 대기' 큐 ↔ 드릴다운 목록 정합 — 큐가 N 건이라고 말하면 그 링크가 여는 목록도 N 건이어야 한다.
    //  큐 건수와 목적지 필터가 각자 조건을 적어 두면 조용히 갈린다(보증 임박 창이 정책을 안 따라 큐와 대장이 달랐던 계열).
    //  대장 드릴다운(?receipt=1·?maint=1·?status=분실 …)만 대상 — 목록 화면이 '표시 N건 / 전체 M건'을 스스로 적는다.
    const checkQueueParity = async () => {
      const page = await ctx.newPage()
      const bad = []
      let queuesN = 0
      try {
        await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 })
        const queues = await page.$$eval('a[href^="/assets/register?"]', (as) => as
          .map((a) => ({ href: a.getAttribute('href') || '', label: (a.querySelector('span')?.textContent || '').trim(), n: Number((a.querySelector('.chip')?.textContent || '').replace(/[^0-9]/g, '')) }))
          .filter((q) => Number.isFinite(q.n) && q.n > 0))
        // 링크를 하나도 못 찾으면 통과가 아니라 실패다 — 조용히 아무것도 검사하지 않는 공허한 통과를 막는다.
        queuesN = queues.length
        if (queues.length === 0) bad.push('대장 드릴다운 큐 링크를 찾지 못함 — 검사 무효')
        for (const q of queues) {
          await page.goto(`${BASE}${q.href}`, { waitUntil: 'networkidle', timeout: 20000 })
          await page.waitForTimeout(200)
          const cnt = (await page.locator('span.cnt').first().textContent().catch(() => '')) || ''
          const shown = Number((cnt.match(/([0-9]+)건/) || [])[1] ?? -1)
          if (shown !== q.n) bad.push(`${q.label || q.href}: 큐 ${q.n} ≠ 목록 ${shown} (${q.href})`)
        }
      } catch (e) { bad.push('큐 정합 확인 실패: ' + e.message) }
      await page.close()
      const okQ = bad.length === 0
      okQ ? pass++ : fail++
      console.log(`${okQ ? '✓' : '✗'} [${tag}] 운영 대기 큐 ↔ 대장 드릴다운 건수 정합(큐 ${queuesN}건)${okQ ? '' : ' — ' + bad.slice(0, 6).join(', ')}`)
    }
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
        await collectLinks(page, route)
        // 상세 패널 링크 — 목록 화면은 행을 선택해야 문서 발급·딥링크가 나타난다(로드만으로는 보이지 않아,
        //  자산 문서 발급 링크 같은 상세 전용 컨트롤이 이 순회의 사각이었다). 첫 행을 선택해 한 번 더 훑는다.
        const selectRowAndCollect = async (label) => {
          const firstRow = page.locator('tbody tr.clickable').first()
          if ((await firstRow.count()) === 0) return
          try {
            await firstRow.click()
            await page.waitForTimeout(400)
            await collectLinks(page, label)
          } catch { /* 선택이 없는 표(읽기 전용)는 건너뛴다 */ }
        }
        await selectRowAndCollect(`${route}(상세)`)
        // 자산 대장은 상태별로 상세 컨트롤이 달라진다(대여중은 대여 확인서, 수리중은 수리 의뢰, 분실은 신고서…).
        //  첫 행만 보면 그 상태의 링크만 훑게 되므로, 화면의 상태 필터 값을 그대로 읽어 상태마다 한 행씩 더 본다.
        //  필터 목록을 화면에서 읽으므로 상태가 늘어도 검사는 따라온다(여기 목록을 또 적어두지 않는다).
        if (route === '/assets/register') {
          const statuses = await page.$$eval('select option', (os) => os.map((o) => o.getAttribute('value') || ''))
          for (const st of statuses.filter((x) => x && x !== '전체' && !x.includes('—'))) {
            try {
              await page.goto(`${BASE}${route}?status=${encodeURIComponent(st)}`, { waitUntil: 'networkidle', timeout: 20000 })
              await page.waitForTimeout(200)
              await selectRowAndCollect(`${route}?status=${st}(상세)`)
            } catch { /* 해당 상태 자산이 없으면 건너뛴다 */ }
          }
        }
      } catch (e) { errs.push('GOTO: ' + e.message) }
      const ok = errs.length === 0 && !crashed && httpStatus < 400
      ok ? pass++ : fail++
      console.log(`${ok ? '✓' : '✗'} [${tag}] ${route}${ok ? '' : ' — ' + (httpStatus >= 400 ? `HTTP ${httpStatus}; ` : '') + (crashed ? 'client-side exception; ' : '') + errs.slice(0, 2).join(' | ')}`)
      await page.close()
    }
    // 역할당 한 건으로 집계 — 링크마다 세면 화면 구성이 바뀔 때 검사 수가 흔들린다.
    const linkOk = badLinks.length === 0
    linkOk ? pass++ : fail++
    console.log(`${linkOk ? '✓' : '✗'} [${tag}] 링크 권한 정합 — 접근 불가 화면으로 가는 링크 없음${linkOk ? '' : ' — ' + [...new Set(badLinks)].slice(0, 6).join(', ')}`)
    const apiOk = badApis.length === 0
    apiOk ? pass++ : fail++
    console.log(`${apiOk ? '✓' : '✗'} [${tag}] API 링크 권한 정합 — 화면이 내준 API 링크가 모두 응답${apiOk ? '' : ' — ' + [...new Set(badApis)].slice(0, 6).join(', ')}`)
    // 역할당 한 건으로 집계 — 컨트롤마다 세면 화면 구성이 바뀔 때 검사 수가 흔들린다(링크 검사와 같은 규약).
    const nameOk = unnamed.length === 0
    nameOk ? pass++ : fail++
    console.log(`${nameOk ? '✓' : '✗'} [${tag}] 조작 컨트롤 이름 — 이름 없는 버튼·링크 없음${nameOk ? '' : ' — ' + [...new Set(unnamed)].slice(0, 4).join(', ')}`)
    const labelOk = unlabeled.length === 0
    labelOk ? pass++ : fail++
    console.log(`${labelOk ? '✓' : '✗'} [${tag}] 입력 이름 — 라벨 없는 입력·선택 없음${labelOk ? '' : ' (' + unlabeled.length + ') — ' + [...new Set(unlabeled)].slice(0, 12).join(' | ')}`)
    if (acct.role === 'ADMIN' || acct.role === 'ASSET_MGR') await checkQueueParity()
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
