/** 스모크 테스트 — 프로덕션 서버를 띄우고 권한 매트릭스·리다이렉트를 검증한다.
 *  사용: npm run build && npm run smoke  (itam-web scripts/smoke.mjs 패턴) */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3418
const BASE = process.env.SMOKE_BASE || `http://localhost:${PORT}`
const REMOTE = Boolean(process.env.SMOKE_BASE)

if (!REMOTE && !existsSync(path.join(ROOT, '.next'))) {
  console.error('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
  process.exit(1)
}

const ACCOUNTS = {
  USER: { login: 'hw.kim', name: '김현우', dept: '개발1팀', role: 'USER' },
  DEPT_MGR: { login: 'sj.lee', name: '이수진', dept: '경영지원팀', role: 'DEPT_MGR' },
  BIZ_MGR: { login: 'jh.park', name: '박정호', dept: 'IT운영팀', role: 'BIZ_MGR' },
  ADMIN: { login: 'admin', name: '시스템관리자', dept: '정보기획팀', role: 'ADMIN' },
}
const cookie = (role) => `ngv_portal_session=${encodeURIComponent(JSON.stringify(ACCOUNTS[role]))}`

const ALL = ['USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN']
const DEPT = ['DEPT_MGR', 'BIZ_MGR', 'ADMIN']
const BIZ = ['BIZ_MGR', 'ADMIN']
const ADM = ['ADMIN']

/** 라우트 × 권한 — components/chrome/menus.ts 및 캐치올 가드와 동일해야 한다 */
const ROUTES = {
  '/dashboard': ALL,
  '/board/notices': ALL,
  '/board/qna': ALL,
  '/finance/invest': ALL,
  '/finance/expense': ALL,
  '/finance/asset-reg': BIZ,
  '/sr/new': ALL,
  '/sr/requests': ALL,
  '/sr/ci': BIZ,
  '/sr/manage': BIZ,
  '/sr/delayed': BIZ,
  '/infra/systems': BIZ,
  '/infra/operations': BIZ,
  '/infra/incidents': BIZ,
  '/infra/changes': BIZ,
  '/projects/status': BIZ,
  '/projects/schedule': BIZ,
  '/projects/reports': BIZ,
  '/pledge/my': ALL,
  '/pledge/dept': DEPT,
  '/pledge/manage': BIZ,
  '/awareness/remote': ALL,
  '/awareness/prints': ALL,
  '/awareness/violations': BIZ,
  '/compliance/education': ALL,
  '/compliance/inspection': BIZ,
  '/work/todo': ALL,
  '/work/approvals': ALL,
  '/settings/users': ADM,
  '/settings/menus': ADM,
  '/settings/permissions': ADM,
  '/settings/codes': ADM,
  '/settings/forms': ADM,
  '/platform/integrations': ADM,
}

let server = null
let pass = 0
let fail = 0

function check(ok, label) {
  if (ok) { pass++ } else { fail++; console.error(`  ✗ ${label}`) }
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: 'manual' })
      if (r.status === 200) return
    } catch { /* 아직 기동 전 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 대기 시간 초과')
}

async function get(pathname, role) {
  return fetch(`${BASE}${pathname}`, {
    redirect: 'manual',
    headers: role ? { cookie: cookie(role) } : {},
  })
}

async function main() {
  if (!REMOTE) {
    server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
      cwd: ROOT, shell: true, stdio: 'ignore',
    })
  }
  await waitReady()

  // 1) 미로그인 — 보호 화면은 /login 으로 리다이렉트
  for (const route of ['/dashboard', '/sr/new', '/settings/users']) {
    const r = await get(route)
    check(r.status === 307 && (r.headers.get('location') ?? '').includes('/login'), `미로그인 ${route} → /login`)
  }

  // 2) 라우트 × 권한 매트릭스
  for (const [route, allowed] of Object.entries(ROUTES)) {
    for (const role of ALL) {
      const r = await get(route, role)
      if (allowed.includes(role)) {
        const html = await r.text()
        check(r.status === 200, `${role} ${route} → 200 (got ${r.status})`)
        check(!html.includes('구현 예정 화면') || route !== '/dashboard', `${role} ${route} 본문 렌더`)
      } else {
        check(r.status === 307 && (r.headers.get('location') ?? '').includes('/dashboard'), `${role} ${route} → /dashboard 차단`)
      }
    }
  }

  // 3) 미정의 경로 — 404
  const nf = await get('/no-such-screen', 'ADMIN')
  check(nf.status === 404, `미정의 경로 → 404 (got ${nf.status})`)

  // 4) 루트 — 세션 유무에 따라 분기
  const rootAnon = await get('/')
  check(rootAnon.status === 307 && (rootAnon.headers.get('location') ?? '').includes('/login'), '루트(미로그인) → /login')
  const rootUser = await get('/', 'USER')
  check(rootUser.status === 307 && (rootUser.headers.get('location') ?? '').includes('/dashboard'), '루트(로그인) → /dashboard')

  console.log(`\n${fail === 0 ? '✓' : '✗'} smoke: ${pass} 통과, ${fail} 실패 (${BASE})`)
  process.exitCode = fail === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => { if (server) server.kill() })
