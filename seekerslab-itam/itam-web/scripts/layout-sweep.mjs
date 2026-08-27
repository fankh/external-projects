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
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFreshBuild, assertPortFree } from './build-guard.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3391 // client-health(3388) 와 겹치지 않는 대역
const BASE = process.env.LAYOUT_BASE || `http://localhost:${PORT}`
const REMOTE = !!process.env.LAYOUT_BASE

// playwright 는 전역 설치 — file:// 로 로드 (client-health.mjs 와 동일)
const pw = await import('file:///C:/Users/seekers/AppData/Roaming/npm/node_modules/playwright/index.js')
const { chromium } = pw.default ?? pw
const EXE = 'C:/Users/seekers/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'

// 빌드 신선도 — 예전 빌드로 레이아웃을 훑으면 고친 이탈이 그대로인 채 초록으로 통과한다(다른 스위트와 같은 가드).
assertFreshBuild(ROOT, { remote: REMOTE })
// 포트 선점 — 앞 실행이 남긴 서버가 있으면 spawn 은 바인드에 실패하고 준비 확인만 그 서버에서 통과한다
//  (신선한 시드라는 전제가 깨진 채 남의 상태를 검사한다). 착각하느니 멈춘다(scripts/build-guard.mjs)
if (!REMOTE) await assertPortFree(PORT)

const ADMIN = { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }

// 대상 화면은 내비 정의(components/chrome/menus.ts)에서 읽는다 — 목록을 여기 또 두면 화면이 늘 때 손질 지점이
//  하나 더 생기고, 새 화면이 이 스윕에서만 조용히 빠진다(헬스가 같은 원천을 쓰는 이유와 같다).
const navSrc = readFileSync(path.join(ROOT, 'components', 'chrome', 'menus.ts'), 'utf8')
const NAV_CONST = {}
for (const m of navSrc.matchAll(/const ([A-Z_]+): Role\[\] = \[([^\]]*)\]/g)) {
  NAV_CONST[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const ROUTES = []
for (const m of navSrc.matchAll(/href: '([^']+)'[^}]*roles: ([A-Z_]+|\[[^\]]*\])/g)) {
  const roles = NAV_CONST[m[2]] ?? [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
  if (roles.includes('ADMIN')) ROUTES.push(m[1])
}

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
/** 필터·드릴다운 경로 — 화면이 실제로 렌더한 링크에서 모은다. 필터를 걸면 안내 배너·해제 링크·칩줄이
 *  추가로 붙어 컨트롤 밀도가 올라가므로, 기본 경로만 재면 그 줄들이 통째로 사각으로 남는다.
 *  목록을 여기 적어 두면 새 필터가 이 스윕에서만 조용히 빠진다(화면 목록을 내비에서 읽는 것과 같은 규약). */
let FILTER_LINKS = []

try {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addCookies([cookie(ADMIN)])
    const page = await ctx.newPage()
    // 좁은 폭에서 한 번만 필터 경로를 수집·검사한다 — 이탈은 좁은 폭에서 나므로 넓은 폭까지 늘리면 시간만 배로 든다.
    if (width === WIDTHS[0]) {
      const seen = new Map()
      for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
        const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href') || '')
          .filter((h) => h.startsWith('/') && h.includes('?') && !h.startsWith('/api/')))
        for (const link of links) {
          const [p, q] = link.split('?')
          const shape = p + '?' + [...new URLSearchParams(q).keys()].sort().join(',')
          if (!seen.has(shape)) seen.set(shape, link)
        }
      }
      FILTER_LINKS = [...seen.values()]
      if (FILTER_LINKS.length === 0) failures.push('필터 링크를 하나도 수집하지 못했습니다(수집 로직 확인)')
      for (const link of FILTER_LINKS) {
        await page.goto(`${BASE}${link}`, { waitUntil: 'networkidle', timeout: 20000 })
        await page.waitForTimeout(120)
        checks++
        for (const hit of await page.evaluate(PROBE)) {
          failures.push(`w=${width} ${link}(필터): ${hit.t} 이 카드 밖 ${hit.by}px (스크롤 조상 없음)`)
        }
      }
    }
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(120)
      checks++
      for (const hit of await page.evaluate(PROBE)) {
        failures.push(`w=${width} ${route}: ${hit.t} 이 카드 밖 ${hit.by}px (스크롤 조상 없음)`)
      }
      // 상세 패널까지 훑는다 — 목록 화면의 문서 발급·처리 버튼줄은 행을 선택해야 나타나므로,
      //  로드 직후만 재면 컨트롤이 가장 빽빽한 영역이 통째로 사각으로 남는다(헬스 스위트가 같은 이유로
      //  행 선택 후 링크를 다시 훑는다). 이탈이 실제로 나는 좁은 폭에서만 본다 — 넓은 폭까지 늘리면
      //  스윕 시간만 배로 들고 새로 잡히는 것은 없다.
      if (width > 1024) continue
      const firstRow = page.locator('tbody tr.clickable').first()
      if ((await firstRow.count()) === 0) continue
      try {
        await firstRow.click()
        await page.waitForTimeout(400)
      } catch { continue } // 선택이 없는 표(읽기 전용)는 건너뛴다
      checks++
      for (const hit of await page.evaluate(PROBE)) {
        failures.push(`w=${width} ${route}(상세): ${hit.t} 이 카드 밖 ${hit.by}px (스크롤 조상 없음)`)
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
  console.log(`✓ layout: ${ROUTES.length}화면 x ${WIDTHS.length}폭 + 좁은 폭 상세 패널·필터 경로 ${FILTER_LINKS.length}종 (${checks}건) 카드 이탈 컨트롤 없음`)
} else {
  console.log(`✗ layout: ${checks}건 중 ${failures.length}건 도달 불가 이탈`)
}
// 러너(scripts/verify.mjs)가 다른 스위트와 같은 형식으로 결과를 읽는다 — 형식이 다르면 요약이 "? passed" 로 남는다.
console.log('')
console.log(`결과: ${checks - failures.length} passed / ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
