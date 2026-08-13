/* 보안 findings 대응 루프 e2e — SSR 스모크가 못 잡는 클릭·상태 전환·역할 게이트를 실제 브라우저로 검증한다.
 * 대상: 크리덴셜 노출(45)·휴면 계정(46)·미인가 SW(47)·USB(48)·로컬 VM(49)·IOC 상관(50) 대응 루프.
 * 실행: npm run e2e   (원격 배포본: E2E_BASE=http://localhost:3390 npm run e2e)
 * 신선한 인메모리 시드에서 시작(ITAM_DATA_FILE 미설정)하므로 결정적. */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3396
const BASE = process.env.E2E_BASE || `http://localhost:${PORT}`
const REMOTE = !!process.env.E2E_BASE

// playwright 는 전역 설치 (client-health.mjs 와 동일 관례)
const pw = await import('file:///C:/Users/seekers/AppData/Roaming/npm/node_modules/playwright/index.js')
const { chromium } = pw.default ?? pw
const EXE = 'C:/Users/seekers/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'

const SEC = { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR' }
const ASSET = { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' }
const cookie = (acct) => ({ name: 'itam_session', value: encodeURIComponent(JSON.stringify(acct)), url: BASE })

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name) } }

let server = null
if (!REMOTE) {
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore' })
  const start = Date.now()
  let up = false
  while (Date.now() - start < 60000) {
    try { const r = await fetch(`${BASE}/login`); if (r.status === 200) { up = true; break } } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!up) { console.error('서버 기동 실패'); server.kill(); process.exit(1) }
}

/** 2-선택 직접 조치(계정·SW·USB·VM·IOC) — 행의 첫 조치 버튼 클릭 후 버튼이 사라지고 상태 칩으로 바뀌는지 확인.
 *  각 조치는 revalidatePath 로 화면을 재렌더하므로, 행을 매번 재조회하고 버튼 소거를 폴링해 재렌더 타이밍을 흡수한다. */
async function twoChoice(page, { name, navTo, cardText, rowText, btnRe }) {
  // 매 조치 전 해당 화면을 새로 연다 — 직전 조치의 revalidate 재렌더 누적을 피해 안정적으로 검증(스토어 상태는 유지된다)
  await page.goto(`${BASE}${navTo}`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: cardText })
  ok(`${name}: 카드 렌더`, (await card.count()) > 0)
  const row = () => card.locator('tr', { hasText: rowText })
  const before = await row().locator('button').count()
  ok(`${name}: 보안담당에 조치 버튼 노출`, before >= 1 && (await row().locator('button', { hasText: btnRe }).count()) > 0)
  await row().locator('button', { hasText: btnRe }).first().click()
  let after = -1
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200)
    after = await row().locator('button').count()
    if (after === 0) break
  }
  ok(`${name}: 조치 클릭 → 상태 전환(버튼 소거·칩 노출)`, after === 0)
}

/** 2-단계 대응(크리덴셜·유출) — '대응' → 입력 프리필 → '대응 확정' → '조치 완료' 칩. */
async function twoStep(page, { name, navTo, cardText, rowText }) {
  await page.goto(`${BASE}${navTo}`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: cardText })
  const row = card.locator('tr', { hasText: rowText })
  ok(`${name}: 보안담당에 대응 버튼`, (await row.locator('button', { hasText: /^대응$/ }).count()) > 0)
  await row.locator('button', { hasText: /^대응$/ }).click()
  await page.waitForTimeout(300)
  await card.locator('button', { hasText: '대응 확정' }).first().click()
  await page.waitForTimeout(700)
  ok(`${name}: 대응 확정 → 조치 완료`, (await card.locator('text=조치 완료').count()) > 0)
}

try {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  console.log(`보안 findings 대응 루프 e2e — ${REMOTE ? '원격' : '로컬'} ${BASE}\n`)

  // ── 보안담당: 각 finding 대응 루프 ──────────────────────────────
  const ctx = await browser.newContext()
  await ctx.addCookies([cookie(SEC)])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => { fail++; console.log('  ✗ PAGEERROR: ' + (e.message || e)) })

  // 발견 자산 화면 — 휴면 계정(46)·미인가 SW(47)·USB(48)·로컬 VM(49)
  const FOUND = '/discovery/found'
  await twoChoice(page, { name: '휴면 계정(46)', navTo: FOUND, cardText: '계정 위생', rowText: 'admin.tmp', btnRe: /^비활성화$/ })
  await twoChoice(page, { name: '미인가 SW(47)', navTo: FOUND, cardText: '설치 SW 정책 위반', rowText: 'uTorrent', btnRe: /^제거 요청$/ })
  await twoChoice(page, { name: 'USB(48)', navTo: FOUND, cardText: '이동식 매체 정책 위반', rowText: 'Samsung T7 SSD', btnRe: /^차단$/ })
  await twoChoice(page, { name: '로컬 VM(49)', navTo: FOUND, cardText: '엔드포인트 VM 정책 위반', rowText: 'legacy-test', btnRe: /^회수$/ })

  // 외부 공격표면 화면 — 크리덴셜(45)·IOC(50)·유출(28)
  const EXT = '/discovery/external'
  await twoStep(page, { name: '크리덴셜 노출(45)', navTo: EXT, cardText: '인증 취약점 점검', rowText: 'PostgreSQL' })
  await twoChoice(page, { name: 'IOC 상관(50)', navTo: EXT, cardText: 'IOC 상관·행위자 귀속', rowText: 'RedLine', btnRe: /^차단$/ })
  await twoStep(page, { name: '다크웹 유출(28)', navTo: EXT, cardText: '유출 수집', rowText: '유출 계정' })

  // 감사 로그 적재 확인 — 조치가 감사에 남는지
  await page.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const audit = await page.textContent('body')
  ok('감사 로그: findings 대응 6종 적재', ['휴면 계정 비활성화', '미인가 SW 제거', 'USB 저장매체 차단', '로컬 VM 회수', 'IOC 차단', '크리덴셜 노출 대응'].every((s) => audit.includes(s)))
  await ctx.close()

  // ── 자산담당: 역할 게이트(조치 버튼 미노출) ────────────────────
  const ctx2 = await browser.newContext()
  await ctx2.addCookies([cookie(ASSET)])
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  const foundCards = ['계정 위생', '설치 SW 정책 위반', '이동식 매체 정책 위반', '엔드포인트 VM 정책 위반']
  let gated = true
  for (const c of foundCards) gated = gated && (await p2.locator('.card', { hasText: c }).locator('button', { hasText: /비활성화|제거 요청|차단|회수/ }).count()) === 0
  ok('자산담당: 발견 자산 findings 조치 버튼 전부 미노출 (조회만)', gated)
  await p2.goto(`${BASE}/discovery/external`, { waitUntil: 'networkidle' })
  ok('자산담당: 외부 공격표면 findings 조치 버튼 미노출 (조회만)', (await p2.locator('button', { hasText: /^대응$|^차단$|^조사 착수$/ }).count()) === 0)
  await ctx2.close()

  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail ? 1 : 0)
