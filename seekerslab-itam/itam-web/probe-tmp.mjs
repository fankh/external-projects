import { chromium } from 'playwright'
const BASE = process.env.PROBE_BASE || 'http://localhost:3401'
const ADMIN = { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }
const cookie = (a) => ({ name: 'itam_session', value: encodeURIComponent(JSON.stringify(a)), url: BASE })
const b = await chromium.launch()
const ctx = await b.newContext(); await ctx.addCookies([cookie(ADMIN)])
const p = await ctx.newPage()

// 1) 매트릭스에서 '자산 대장 × 격리요청 · SEC_MGR' 칸의 현재 표시
await p.goto(`${BASE}/settings/permissions`, { waitUntil: 'networkidle' })
const cellSel = 'td[title*="격리요청"]'
const naCells = await p.$$eval('td[title*="기능이 없다"]', (ts) => ts.map((t) => ({ title: t.getAttribute('title'), glyph: t.textContent.trim(), opacity: t.style.opacity, cursor: t.style.cursor })))
console.log('NA 칸 수:', naCells.length)
console.log('NA 인데 글리프가 불가(✕/-)가 아닌 칸:')
for (const c of naCells) if (c.glyph && !/^[·\-✕xX]$/.test(c.glyph)) console.log('   ', JSON.stringify(c))

// 2) NA 칸을 클릭하면 값이 바뀌는가 (안내문은 '잠깁니다')
const before = naCells.map((c) => c.glyph).join('')
const first = await p.$('td[title*="기능이 없다"]')
await first.click()
await p.waitForTimeout(1200)
await p.reload({ waitUntil: 'networkidle' })
const after = (await p.$$eval('td[title*="기능이 없다"]', (ts) => ts.map((t) => t.textContent.trim()))).join('')
console.log('\nNA 칸 클릭 전 글리프:', before)
console.log('NA 칸 클릭 후 글리프:', after)
console.log('=> NA 칸이 클릭으로 바뀌는가:', before !== after ? '예 (잠기지 않음)' : '아니오')
await b.close()
