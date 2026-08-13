/* 보안 findings 대응 + AI 제안 판정 인터랙티브 e2e — SSR 스모크가 못 잡는 클릭·상태 전환·역할 게이트를 실제 브라우저로 검증한다.
 * 대상: 크리덴셜 노출(45)·휴면 계정(46)·미인가 SW(47)·USB(48)·로컬 VM(49)·IOC 상관(50) 대응 + AI 제안 판정(11, 승인→조치·반려 사유 필수).
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
const ADMIN = { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }
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

/** AI 제안 판정(로11) — 승인은 조치로 연결, 반려는 사유 입력 전 확정이 막힌다(사유 필수).
 *  '전체' 필터로 전환해 판정해도 행이 사라지지 않게 한 뒤, 판정 컬럼의 '승인' 버튼 수(대기 프록시)로 상태 전환을 검증한다. */
async function aiInsightDecide(page) {
  await page.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: 'AI 제안 — 판정 대기' })
  ok('AI 제안(11): 판정 대기 목록 렌더', (await card.count()) > 0)
  await card.locator('.seg button', { hasText: /^전체$/ }).click()
  await page.waitForTimeout(300)
  // tbody 로 한정 — 필터 세그먼트의 '승인'/'반려' 버튼과 판정 컬럼 버튼이 섞이지 않게 한다
  const approveBtns = () => card.locator('tbody button', { hasText: /^승인$/ })
  const rejectBtns = () => card.locator('tbody button', { hasText: /^반려$/ })
  const before = await approveBtns().count()
  ok('AI 제안(11): 처리 대기 제안 존재', before > 0)

  // 승인 — 판정 컬럼의 첫 '승인' 클릭 → 그 행이 조치 연결로 바뀌어 승인 버튼 1개 감소
  await approveBtns().first().click()
  await page.waitForTimeout(900)
  ok('AI 제안(11): 승인 → 판정(승인 버튼) 감소', (await approveBtns().count()) === before - 1)
  ok('AI 제안(11): 승인 제안에 조치 연결(조치 —) 표기', (await card.locator('text=조치 —').count()) > 0)

  // 반려 — 사유 필수: 첫 '반려' 클릭 → 사유 입력 전 '반려 확정' 비활성
  if ((await rejectBtns().count()) > 0) {
    await rejectBtns().first().click()
    await page.waitForTimeout(300)
    const confirm = card.locator('button', { hasText: '반려 확정' }).first()
    ok('AI 제안(11): 반려 사유 입력 전 확정 비활성(사유 필수)', await confirm.isDisabled())
    await card.locator('input[placeholder*="반려 사유"]').first().fill('오탐 — 정상 업무 트래픽으로 확인')
    await page.waitForTimeout(200)
    ok('AI 제안(11): 사유 입력 후 반려 확정 활성', !(await confirm.isDisabled()))
    const beforeR = await approveBtns().count()
    await confirm.click()
    await page.waitForTimeout(900)
    ok('AI 제안(11): 반려 확정 → 판정(승인 버튼) 감소', (await approveBtns().count()) === beforeR - 1)
  }
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

/** AI 모델·프롬프트 버전 관리(§05 AI 거버넌스) — 인라인 편집·빈 값 검증·거버넌스 원장 반영. Admin 전용.
 *  AI 거버넌스·성능 리포트가 이 값을 근거로 산출하므로 배포 구성 변경은 감사에 남아야 한다. */
async function aiModelManage(page) {
  await page.goto(`${BASE}/settings/ai-policy`, { waitUntil: 'networkidle' })
  ok('AI 버전 관리: 컨트롤 렌더', (await page.locator('text=모델 · 프롬프트 버전 관리').count()) > 0)
  await page.locator('button', { hasText: /^버전 관리$/ }).click()
  await page.waitForTimeout(300)
  const modelIn = page.locator('input[placeholder*="claude-opus-5"]')
  const promptIn = page.locator('input[placeholder*="프롬프트 버전"]')
  ok('AI 버전 관리: 현재값 프리필', (await modelIn.inputValue()).length > 0 && (await promptIn.inputValue()).length > 0)
  // 빈 값 검증 차단
  await modelIn.fill('')
  await page.locator('button', { hasText: /^저장$/ }).click()
  await page.waitForTimeout(400)
  ok('AI 버전 관리: 빈 값 검증 차단', (await page.textContent('body')).includes('모델 ID·프롬프트 버전을 입력하세요'))
  // 정상 변경 → 원장 반영
  await modelIn.fill('claude-opus-5')
  await promptIn.fill('v3.3 (2026-08-13)')
  await page.locator('button', { hasText: /^저장$/ }).click()
  await page.waitForTimeout(700)
  const body = await page.textContent('body')
  ok('AI 버전 관리: 갱신 반영(모델·프롬프트)', body.includes('claude-opus-5') && body.includes('v3.3 (2026-08-13)'))
}

/** AI 어시스턴트 기간 스코프 질의(§05 예시 "내년 1분기 보증 만료…") — 기간 파싱·창 필터.
 *  실행 시점에 독립적이도록, 헤드라인이 제시한 창 범위를 그대로 뽑아 나열 만료일이 전부 그 안에 드는지 자기검증한다. */
async function aiPeriodQuery(page) {
  await page.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const ask = async (q) => {
    const before = await page.locator('.msg.assistant .bub').count()
    await page.locator('.chat-in input').fill(q)
    await page.locator('.chat-in input').press('Enter')
    await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, before, { timeout: 8000 })
    await page.waitForTimeout(150)
    return (await page.locator('.msg.assistant .bub').last().textContent()) || ''
  }
  const q1 = await ask('내년 1분기 보증 만료되는 자산 목록')
  const win = q1.match(/(\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})/)
  ok('AI 기간질의: 분기 창 범위 헤드라인', /보증 만료 예정/.test(q1) && !!win)
  const dates = [...q1.matchAll(/보증 만료 (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1])
  ok('AI 기간질의: 나열 만료일 전부 창 안', !!win && dates.length > 0 && dates.every((d) => d >= win[1] && d <= win[2]))
  const q2 = await ask('2099년 1분기 보증 만료 자산')
  ok('AI 기간질의: 먼 미래 → 해당 없음 메시지', q2.includes('2099년 1분기') && q2.includes('보증이 만료되는 자산이 없습니다'))
  const q3 = await ask('보증 만료되는 네트워크 장비 목록')
  ok('AI 기간질의: 기간 미지정 → 임박순 폴백', q3.includes('만료 임박순') && !/ ~ 20\d{2}-/.test(q3))
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

  // AI 제안 판정 루프(11) — 승인→조치·반려 사유 필수
  await aiInsightDecide(page)
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

  // ── Admin: AI 모델·프롬프트 버전 관리(§05 AI 거버넌스) + 감사 적재 ──
  const ctx3 = await browser.newContext()
  await ctx3.addCookies([cookie(ADMIN)])
  const p3 = await ctx3.newPage()
  p3.on('pageerror', (e) => { fail++; console.log('  ✗ PAGEERROR: ' + (e.message || e)) })
  await aiModelManage(p3)
  await p3.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const auditAi = await p3.textContent('body')
  ok('감사 로그: AI 모델·프롬프트 버전 관리 적재', auditAi.includes('AI 모델·프롬프트 버전 관리') && auditAi.includes('claude-opus-5'))
  await aiPeriodQuery(p3)
  await ctx3.close()

  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail ? 1 : 0)
