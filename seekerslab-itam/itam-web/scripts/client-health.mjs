/* 클라이언트 헬스 체크 — 스모크(SSR HTML)가 못 잡는 하이드레이션/클라이언트 런타임 크래시를 잡는다.
 * 실제 브라우저로 권한그룹 4종(Admin·자산담당·보안담당·사용자) × 각자 접근 가능한 화면을 로그인 상태로 열어,
 * 응답 상태(4xx·5xx)와 처리되지 않은 예외(pageerror)와
 * Next 기본 오류 화면('client-side exception')이 없는지 확인한다.
 * 실행: node scripts/client-health.mjs   (원격: HEALTH_BASE=http://localhost:3390 node scripts/client-health.mjs) */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFreshBuild, assertPortFree } from './build-guard.mjs'

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
// 포트 선점 — 앞 실행이 남긴 서버가 있으면 spawn 은 바인드에 실패하고 준비 확인만 그 서버에서 통과한다
//  (신선한 시드라는 전제가 깨진 채 남의 상태를 검사한다). 착각하느니 멈춘다(scripts/build-guard.mjs)
if (!REMOTE) await assertPortFree(PORT)

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

// 한 문서 안에서 같은 id 가 두 번 쓰였는가 — 화면·인쇄 문서·양성 대조가 이 한 판정을 공유한다.
//  판정을 세 곳에 적으면 양성 대조가 '자기 사본만' 검증하게 되어, 정작 화면을 재는 쪽이 고장나도 통과한다.
const dupIdsOn = (page) => page.evaluate(() => {
  const seen = new Map()
  for (const el of document.querySelectorAll('[id]')) {
    const id = el.getAttribute('id')
    if (id) seen.set(id, (seen.get(id) || 0) + 1)
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => id + ' ×' + n)
})

let pass = 0, fail = 0
const cookie = (acct) => ({ name: 'itam_session', value: encodeURIComponent(JSON.stringify(acct)), url: BASE })

try {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })

  const checkRoutes = async (acct, routes, tag) => {
    const badLinks = []
    const badApis = []
    const unnamed = []
    const unlabeled = []
    const notFocusable = []
    const dupIds = []
    let idScreens = 0
    const seenApi = new Set()
    // 한 화면에서 링크 두 종류를 함께 본다 — 화면 링크는 라우트 권한, API 링크는 실제 응답으로 판정한다.
    const htmlDocLinks = new Set()
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
          // HTML 을 돌려주는 문서(인쇄용 자산 카드·라벨·확인서…)는 따로 모아 뒤에서 브라우저로 연다.
          //  여기서는 상태 코드만 본다 — 200 이라고 화면이 동작하는 것은 아니다. 실제로 CSP 를 세운 뒤
          //  이 문서들의 인쇄·닫기 버튼이 전부 죽었는데(인라인 onclick 차단) 이 검사는 200 이라 초록이었다.
          if ((res.headers()['content-type'] || '').startsWith('text/html')) htmlDocLinks.add(raw)
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
      // 클릭으로만 되는 행 — 목록에서 행을 고르는 것이 상세 패널로 가는 유일한 길이라, 키보드로 고를 수 없으면
      //  마우스 없이는 화면 절반이 닫힌다. 클릭 가능한 행은 초점을 받을 수 있어야 한다(tabindex).
      try {
        const rows = await page.$$eval('tr.clickable', (els) => els.filter((e) => !e.hasAttribute('tabindex')).length)
        if (rows > 0) notFocusable.push(`${label} → 초점 불가 행 ${rows}개`)
      } catch (e) { notFocusable.push(`${label} → 행 초점 확인 실패: ${e.message}`) }
      // 한 문서 안에서 같은 id 가 두 번 — 조용히 기능이 어긋나는 자리다. label[for] 는 첫 번째 요소에만 붙어
      //  두 번째 입력이 이름을 잃고(위의 '입력 이름' 검사는 querySelector 가 첫 번째를 찾아 주므로 통과한다),
      //  getElementById 는 첫 번째만 돌려주며(인쇄 문서의 인쇄·닫기 버튼이 이 방식이다), aria-describedby 도
      //  엉뚱한 곳을 가리킨다. 어느 것도 오류를 내지 않으므로 크래시 검사·이름 검사로는 보이지 않는다.
      //  화면을 이미 열어 두었으므로 같은 순회에서 함께 센다.
      try {
        const dups = await dupIdsOn(page)
        idScreens += 1
        for (const d of dups) dupIds.push(`${label} → ${d}`)
      } catch (e) { dupIds.push(`${label} → 중복 id 확인 실패: ${e.message}`) }
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
        // 필터 토글을 실제로 눌러 본다 — 이 스위트는 화면을 열고 첫 행만 눌러, 목록 위 필터 칩은 한 번도
        //  누르지 않았다. 칩은 클라이언트 상태(useState)라 렌더만으로는 핸들러가 실행되지 않는다 —
        //  누르는 순간 터지는 참조 오류는 여기서만 잡힌다.
        //  선택자는 이 프로젝트의 필터 칩 표기 규약을 쓴다: '…만 3' 또는 켜진 상태의 '✓ …'.
        //  목록을 여기 적지 않으므로 새 필터가 생기면 자동으로 이 검사에 들어온다.
        const toggles = page.locator('button').filter({ hasText: new RegExp(String.raw`(만|경과|미응답)\s+\d+$|^✓\s`) })
        const toggleCount = Math.min(await toggles.count(), 6)
        for (let t = 0; t < toggleCount; t += 1) {
          try {
            await toggles.nth(t).click({ timeout: 3000 })
            await page.waitForTimeout(250)
            if ((await page.content()).includes('client-side exception')) crashed = true
          } catch { /* 눌리지 않는 칩(비활성·가려짐)은 건너뛴다 */ }
        }
        if (toggleCount > 0) await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
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

    // 인쇄 문서를 브라우저로 연다 — 이 스위트의 사각이던 자리다. 화면(SSR)만 열고 문서는 상태 코드만
    //  봤기 때문에, CSP 를 세우면서 인쇄 문서 10곳의 인쇄·닫기 버튼이 전부 죽었을 때 게이트 2651건이
    //  모두 초록이었다. 화면은 그려지고 버튼도 보이는데 누르면 아무 일도 없는, 조용한 고장이다.
    //  대상은 화면이 스스로 내준 링크에서 모은다 — 여기에 id 목록을 적어 두면 시드가 바뀔 때 낡는다.
    //  각 문서에서 콘솔 오류(=CSP 위반 포함)가 없는지, 인쇄 버튼이 실제로 window.print 를 부르는지 본다.
    const docTargets = [...htmlDocLinks]
    const docBad = []
    for (const href of docTargets) {
      const dp = await ctx.newPage()
      const derr = []
      dp.on('pageerror', (e) => derr.push('PAGEERROR: ' + (e.message || e)))
      dp.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((re) => re.test(m.text()))) derr.push('CONSOLE: ' + m.text().slice(0, 100)) })
      try {
        const r = await dp.goto(`${BASE}${href}`, { waitUntil: 'networkidle', timeout: 20000 })
        if (!r || r.status() >= 400) { docBad.push(`${href} (HTTP ${r ? r.status() : 0})`); await dp.close(); continue }
        await dp.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1 } })
        const btn = dp.locator('#doc-print')
        if ((await btn.count()) === 0) { docBad.push(`${href} (인쇄 버튼 없음)`); await dp.close(); continue }
        await btn.click({ timeout: 5000 })
        await dp.waitForTimeout(250)
        if ((await dp.evaluate(() => window.__printed)) === 0) docBad.push(`${href} (인쇄 버튼이 동작하지 않음)`)
        for (const d of await dupIdsOn(dp)) docBad.push(`${href} (중복 id ${d})`)
        if (derr.length) docBad.push(`${href} — ${derr[0]}`)
      } catch (e) { docBad.push(`${href} — ${e.message.slice(0, 80)}`) }
      await dp.close()
    }
    // 대상이 0건이면 "문제 0건"으로 통과한다 — 수를 이름에 찍고, 걸러진 것이 있으면 드러낸다.
    const docOk = docBad.length === 0 && docTargets.length > 0
    docOk ? pass++ : fail++
    console.log(`${docOk ? '✓' : '✗'} [${tag}] 인쇄 문서 ${docTargets.length}종을 브라우저로 열어 인쇄 버튼까지 동작${docOk ? '' : ' — ' + (docTargets.length === 0 ? '대상 0건(수집 실패)' : docBad.slice(0, 4).join(', '))}`)
    // 역할당 한 건으로 집계 — 컨트롤마다 세면 화면 구성이 바뀔 때 검사 수가 흔들린다(링크 검사와 같은 규약).
    const nameOk = unnamed.length === 0
    nameOk ? pass++ : fail++
    console.log(`${nameOk ? '✓' : '✗'} [${tag}] 조작 컨트롤 이름 — 이름 없는 버튼·링크 없음${nameOk ? '' : ' — ' + [...new Set(unnamed)].slice(0, 4).join(', ')}`)
    const labelOk = unlabeled.length === 0
    labelOk ? pass++ : fail++
    console.log(`${labelOk ? '✓' : '✗'} [${tag}] 입력 이름 — 라벨 없는 입력·선택 없음${labelOk ? '' : ' (' + unlabeled.length + ') — ' + [...new Set(unlabeled)].slice(0, 12).join(' | ')}`)
    const focusOk = notFocusable.length === 0
    focusOk ? pass++ : fail++
    console.log(`${focusOk ? '✓' : '✗'} [${tag}] 행 선택 키보드 접근 — 클릭 전용 행 없음${focusOk ? '' : ' — ' + [...new Set(notFocusable)].slice(0, 6).join(', ')}`)
    // 0건은 '중복이 없다'로도, '아무 화면도 못 열었다'로도 나온다 — 센 DOM 수를 조건에 넣는다.
    //  라우트 수와 같지 않다 — 이 순회는 라우트 페이지 외에 상세 패널을 연 상태와 필터를 켠 상태도 훑기 때문에
    //  화면 수보다 많이 센다(ADMIN 30 라우트에 53 회). '라우트당 정확히 한 번'으로 조건을 걸었다가 실측에서
    //  53/30 으로 어긋난 자리다 — 재는 면을 코드가 아니라 실행으로 확인해야 했다. 하한만 건다.
    const dupOk = dupIds.length === 0 && idScreens >= routes.length
    dupOk ? pass++ : fail++
    console.log(`${dupOk ? '✓' : '✗'} [${tag}] 문서 내 중복 id 없음(DOM ${idScreens}회 · 라우트 ${routes.length}개 이상)${dupOk ? '' : ' — ' + ([...new Set(dupIds)].slice(0, 6).join(', ') || `센 DOM ${idScreens} < 라우트 ${routes.length}`)}`)
    // 양성 대조 — 0건이라는 결과는 판정이 아무것도 못 볼 때도 나온다. 중복 id 를 일부러 넣고 잡는지 본다.
    //  주입 전 0건 · 주입 후 정확히 그 id 만 잡히는지까지 봐야, 판정이 '항상 참'도 '항상 거짓'도 아님이 확인된다.
    if (acct.role === 'ADMIN') {
      const pp = await ctx.newPage()
      let before = ['확인 실패'], after = ['확인 실패']
      try {
        await pp.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        before = await dupIdsOn(pp)
        await pp.evaluate(() => { for (let i = 0; i < 2; i += 1) { const e = document.createElement('div'); e.id = 'probe-dup'; document.body.appendChild(e) } })
        after = await dupIdsOn(pp)
      } catch { /* 아래 판정에서 실패로 잡힌다 */ }
      await pp.close()
      const pcOk = before.length === 0 && after.length === 1 && after[0] === 'probe-dup ×2'
      pcOk ? pass++ : fail++
      console.log(`${pcOk ? '✓' : '✗'} [${tag}] 중복 id 양성 대조: 주입한 중복을 잡고 그 외는 잡지 않는다${pcOk ? '' : ` — 주입 전=${before.join(',') || '없음'} 주입 후=${after.join(',') || '없음'}`}`)
    }
    if (acct.role === 'ADMIN' || acct.role === 'ASSET_MGR') await checkQueueParity()
    await ctx.close()
  }

  console.log(`클라이언트 헬스 — ${REMOTE ? '원격' : '로컬'} ${BASE}\n`)
  await checkRoutes(ADMIN, routesFor('ADMIN'), 'ADMIN')
  await checkRoutes(ASSET_MGR, routesFor('ASSET_MGR'), 'ASSET_MGR')
  await checkRoutes(SEC_MGR, routesFor('SEC_MGR'), 'SEC_MGR')
  await checkRoutes(USER, routesFor('USER'), 'USER')
  // 숫자 표기가 보는 사람의 로케일에 흔들리지 않는가 — 인자 없는 toLocaleString() 은 브라우저의 기본
  //  로케일을 쓴다. 클라이언트 컴포넌트는 SSR 로 한 번 그려지고 브라우저에서 다시 그려지므로, 로케일이
  //  다르면 같은 금액이 화면에서 바뀐다 — 실측으로 de-DE 브라우저에서 취득가가 1,680,000원 대신
  //  1.680.000원 으로 찍혔다. 한국어 화면에서 마침표는 소수점으로 읽혀 168만 원이 1.68원이 된다.
  //  React 19 는 이 텍스트 차이를 조용히 덮어써 콘솔 오류로도 남지 않는다 — 이 스위트가 오류만 보고
  //  통과시킨 이유다. 그래서 오류가 아니라 화면에 찍힌 글자를 직접 읽는다.
  const ctxDe = await browser.newContext({ locale: "de-DE" })
  await ctxDe.addCookies([cookie(ASSET_MGR)])
  const pDe = await ctxDe.newPage()
  await pDe.goto(`${BASE}/assets/register`, { waitUntil: "networkidle", timeout: 20000 })
  await pDe.locator("tbody tr.clickable").first().click()
  await pDe.waitForTimeout(800)
  const deBody = (await pDe.textContent("body")) || ""
  const deMoney = deBody.match(/[0-9][0-9.,]{5,}원/g) || []
  const deDots = deMoney.filter((m) => /[0-9]\.[0-9]{3}/.test(m))
  const deOk = deMoney.length > 0 && deDots.length === 0
  deOk ? pass++ : fail++
  console.log(`${deOk ? "✓" : "✗"} [de-DE] 숫자 표기가 보는 사람의 로케일에 흔들리지 않는다(금액 ${deMoney.length}곳 · 독일식 구분 ${deDots.length}곳)${deOk ? "" : " — " + deDots.slice(0, 3).join(", ")}`)
  await ctxDe.close()
  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
