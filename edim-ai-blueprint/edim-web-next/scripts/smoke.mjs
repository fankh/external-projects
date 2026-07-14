#!/usr/bin/env node
/**
 * EDIM Next.js SSR 스모크 테스트 (P6 컷오버 검증).
 *
 * 검증: 미인증 가드(→/login) · 로그인 토큰 · 쿠키 기반 SSR 렌더(서버 HTML 에 데이터 포함) ·
 *       핵심 화면(그리드·대시보드·CAD 에디터·Run·권한화면) · 알림/권한 시드.
 *
 * 사용:
 *   BASE=http://127.0.0.1:3000 \
 *   EDIM_API_BASE=https://edim.seekerslab.com/api/v1 \
 *   EDIM_USER=edim EDIM_PASS=edim \
 *   node scripts/smoke.mjs
 *
 * 종료코드: 실패 시 1 (CI/컷오버 게이트용). Node 20+ (내장 fetch).
 */

const BASE = (process.env.BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const API_BASE = (process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1').replace(/\/$/, '')
const USER = process.env.EDIM_USER ?? 'edim'
const PASS = process.env.EDIM_PASS ?? 'edim'
const SESSION_COOKIE = 'edim_session'

let pass = 0, fail = 0
const results = []
function ok(name) { pass++; results.push(`  \x1b[32m✓\x1b[0m ${name}`) }
function bad(name, detail) { fail++; results.push(`  \x1b[31m✗\x1b[0m ${name}\n      → ${detail}`) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 로그인 — 백엔드 rate-limit(30/60s) 대비 재시도. */
async function login() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER, password: PASS }),
      })
      if (res.status === 429) { await sleep(6000); continue }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!body.token) throw new Error('응답에 token 없음')
      return body.token
    } catch (e) {
      if (attempt === 5) throw e
      await sleep(3000)
    }
  }
}

/** 쿠키 없이 GET — 리다이렉트 따라가지 않음(가드 확인용). */
async function rawGet(path, cookie) {
  return fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  })
}

async function assertGuardRedirect(path) {
  try {
    const res = await rawGet(path)
    const loc = res.headers.get('location') ?? ''
    if ((res.status === 307 || res.status === 302 || res.status === 308) && loc.includes('/login')) ok(`가드: ${path} (미인증) → /login`)
    else bad(`가드: ${path} (미인증) → /login`, `status ${res.status}, location "${loc}"`)
  } catch (e) { bad(`가드: ${path}`, e.message) }
}

async function assertRenders(path, markers, cookie) {
  try {
    const res = await rawGet(path, cookie)
    if (res.status !== 200) { bad(`SSR: ${path}`, `status ${res.status}`); return }
    const html = await res.text()
    const missing = markers.filter((m) => !html.includes(m))
    if (missing.length === 0) ok(`SSR: ${path} (마커 ${markers.length}개)`)
    else bad(`SSR: ${path}`, `HTML 에 없음: ${missing.map((m) => JSON.stringify(m)).join(', ')}`)
  } catch (e) { bad(`SSR: ${path}`, e.message) }
}

async function main() {
  console.log(`\nEDIM SSR 스모크 — BASE=${BASE}  API=${API_BASE}\n`)

  // 1) 미인증 가드
  await assertGuardRedirect('/erp/eco-ledger')
  await assertGuardRedirect('/plm/design')

  // 2) 로그인 페이지 자체는 미인증 접근 가능
  await assertRenders('/login', ['사번', 'password'])

  // 3) 로그인 → 토큰
  let token
  try { token = await login(); ok('로그인 — 토큰 발급') }
  catch (e) { bad('로그인 — 토큰 발급', e.message); return }

  // 4) 쿠키 기반 SSR — 서버 HTML 에 데이터/마커 포함(진성 SSR)
  await assertRenders('/erp/eco-ledger', ['SSR ·', '변경 이력'], token)
  await assertRenders('/erp/dashboard', ['SSR ·'], token)
  await assertRenders('/plm/parts', ['SSR ·'], token)
  await assertRenders('/plm/design', ['Design Editor', 'Design Rule'], token)
  await assertRenders('/cpq/run', ['Run 파이프라인'], token)
  await assertRenders('/cpq/selection', ['제품 선정'], token)
  await assertRenders('/code/datatable', ['데이터 Table'], token)
  await assertRenders('/toolbox/ui-designer', ['UI Designer', 'Widget'], token)

  // 5) 권한/알림 시드 (레이아웃) — 사용자 표기 + 알림 벨
  await assertRenders('/erp/eco-ledger', ['🔔'], token)

  // 결과
  console.log(results.join('\n'))
  console.log(`\n합계: \x1b[32m${pass} 통과\x1b[0m · ${fail ? `\x1b[31m${fail} 실패\x1b[0m` : '0 실패'}\n`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('스모크 실행 오류:', e); process.exit(1) })
