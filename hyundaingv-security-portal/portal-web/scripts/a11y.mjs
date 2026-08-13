/** 접근성(a11y) 정적 감사 — 웹접근성(KWCAG) 기본 점검.
 *  프로덕션 SSR HTML 을 받아 폼 컨트롤·버튼의 접근가능한 이름(accessible name)과
 *  문서 언어를 확인한다. 브라우저 없이 SSR 마크업만으로 결정 가능한 항목에 한정한다
 *  (색 대비·포커스 순서 등 런타임 항목은 범위 밖 — 별도 수동/도구 점검).
 *  사용: npm run build 후  node scripts/a11y.mjs */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3419
const BASE = `http://localhost:${PORT}`
const SECRET = process.env.SESSION_SECRET ?? 'ngv-portal-dev-secret'
const admin = { login: 'admin', name: '시스템관리자', dept: '정보기획팀', role: 'ADMIN' }
const sign = (a) => {
  const payload = Buffer.from(JSON.stringify({ ...a, exp: Date.now() + 3600000 }), 'utf8').toString('base64url')
  return `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`
}
const cookie = `ngv_portal_session=${sign(admin)}`

// 폼·컨트롤 밀도가 높은 대표 화면 (전 도메인 커버)
const ROUTES = [
  '/login', '/dashboard', '/sr/new', '/finance/expense', '/finance/invest',
  '/infra/incidents', '/infra/racks', '/infra/systems', '/infra/operations',
  '/compliance/inspection', '/awareness/remote', '/awareness/prints',
  '/pledge/my', '/board/qna', '/settings/codes', '/settings/users',
  '/settings/permissions', '/settings/forms', '/platform/integrations', '/work/approvals',
]

let pass = 0
const fails = []
const check = (ok, label) => { if (ok) pass++; else fails.push(label) }

/** 태그의 속성 값을 뽑는다 (단순 정규식 — SSR 자동생성 마크업 대상이라 안전) */
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return m ? m[1] : null
}

/** label[for] 로 참조되는 id 집합 */
function labeledIds(html) {
  const ids = new Set()
  for (const m of html.matchAll(/<label\b[^>]*\bfor="([^"]+)"/gi)) ids.add(m[1])
  return ids
}

function auditControls(route, html) {
  const forIds = labeledIds(html)
  // 폼 컨트롤 — hidden 제외. 접근가능한 이름: aria-label · title · 참조 label · aria-labelledby
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const tag = m[0]
    const attrs = m[2]
    const type = attr(tag, 'type')
    if (type === 'hidden' || type === 'submit' || type === 'button') continue
    const id = attr(tag, 'id')
    const named = attr(tag, 'aria-label') || attr(tag, 'title') || attr(tag, 'aria-labelledby') || (id && forIds.has(id))
    check(!!named, `${route}: <${m[1]}${type ? ` type=${type}` : ''}> 접근가능 이름 없음 [${attrs.trim().slice(0, 50)}]`)
  }
  // 버튼 — 텍스트 콘텐츠 또는 aria-label
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
    const inner = m[2].replace(/<[^>]+>/g, '').trim()
    const named = inner.length > 0 || attr(m[0], 'aria-label')
    check(!!named, `${route}: <button> 접근가능 이름 없음`)
  }
  // 이미지 — alt 속성 존재 (장식용은 alt="")
  for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
    check(attr(m[0], 'alt') !== null, `${route}: <img> alt 속성 없음`)
  }
  // 제목 계층 — 화면마다 정확히 하나의 h1 (WCAG 1.3.1 · 2.4.6)
  const h1n = (html.match(/<h1\b/gi) ?? []).length
  check(h1n === 1, `${route}: h1 개수 ${h1n} (정확히 1개여야)`)
  // 본문 바로가기 — 앱 셸 화면만 (로그인은 우회할 내비가 없어 제외, WCAG 2.4.1)
  if (route !== '/login') {
    check(/class="skip"/.test(html) && /id="main"/.test(html), `${route}: 본문 바로가기 링크·대상(#main) 없음`)
  }
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/login`, { redirect: 'manual' })).status === 200) return } catch { /* 기동 전 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 대기 시간 초과')
}

async function main() {
  if (!existsSync(path.join(ROOT, '.next'))) { console.error('✗ .next 빌드 없음 — npm run build 먼저'); process.exit(1) }
  const server = spawn(`npx next start -p ${PORT}`, { cwd: ROOT, shell: true, stdio: 'ignore' })
  try {
    await waitReady()
    // 문서 언어 (KWCAG 5.4.1) — 로그인 SSR 에서 확인
    const login = await (await fetch(`${BASE}/login`)).text()
    check(/<html\b[^>]*\blang="ko"/.test(login), '문서 언어 lang="ko" 선언')
    for (const route of ROUTES) {
      const r = await fetch(`${BASE}${route}`, { headers: { cookie }, redirect: 'manual' })
      if (r.status !== 200) { check(false, `${route}: 200 아님 (${r.status})`); continue }
      auditControls(route, await r.text())
    }
    console.log(`\n${fails.length === 0 ? '✓' : '✗'} a11y: ${pass} 통과, ${fails.length} 위반`)
    for (const f of fails.slice(0, 40)) console.error(`  ✗ ${f}`)
    process.exitCode = fails.length === 0 ? 0 : 1
  } finally {
    if (process.platform === 'win32') { try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { /* 종료됨 */ } }
    else server.kill()
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
