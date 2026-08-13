/** 첫 기동(빈 스토어) 견고성 게이트 — 신규 고객사가 시드 없이 배포했을 때 첫 로그인에서
 *  화면이 깨지지 않는지 검증한다. health 는 시드 데이터로 돌기 때문에, 가드 없는 배열 접근
 *  (s.arr[0].x)·0 나눗셈 같은 회귀는 이 게이트만 잡는다 — 재사용 프레임워크의 배포 안전선.
 *  전 컬렉션을 비운 임시 데이터 파일로 서버를 띄우고, 전 화면 SSR 이 200·오류바운더리 없음인지 본다.
 *  사용: npm run build 후  node scripts/emptystate.mjs */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3419
const BASE = `http://localhost:${PORT}`
const DATA = path.join(ROOT, 'scripts', '.emptystate-data.json')
const SECRET = process.env.SESSION_SECRET ?? 'ngv-portal-dev-secret'
const admin = { login: 'admin', name: '시스템관리자', dept: '정보기획팀', role: 'ADMIN' }
const cookie = (() => {
  const p = Buffer.from(JSON.stringify({ ...admin, exp: Date.now() + 3600000 }), 'utf8').toString('base64url')
  return `ngv_portal_session=${p}.${createHmac('sha256', SECRET).update(p).digest('base64url')}`
})()

// lib/store.ts Store 인터페이스의 전 컬렉션 (배열 + 객체) — 시드와 동기 유지
const ARRAYS = 'approvalLines approvals attachments auditLogs batchJobs batchRuns changes ciSrs codeGroups companyPledges deliverables educationCourses educationRecords excelTemplates expenseFlashes hardware incidents inspectionItems inspectionPlans interfaces investContracts investPlans notices people pledgeForms pledges printouts projectIssues projectNotes projects qna racks remoteChecks remoteTargets sendLog servers settlements srRequests systems todos violations securityOfficers assetAcquisitions'.split(' ')
const emptyStore = Object.fromEntries(ARRAYS.map((k) => [k, []]))
emptyStore.menuOverrides = {}
emptyStore.channelStates = {}

const ROUTES = [
  '/dashboard', '/board/notices', '/board/qna', '/finance/invest', '/finance/expense', '/finance/asset-reg',
  '/sr/new', '/sr/requests', '/sr/ci', '/sr/manage', '/sr/delayed',
  '/infra/systems', '/infra/racks', '/infra/operations', '/infra/incidents', '/infra/changes',
  '/projects/status', '/projects/schedule', '/projects/reports',
  '/pledge/my', '/pledge/dept', '/pledge/manage', '/awareness/remote', '/awareness/prints', '/awareness/violations',
  '/compliance/education', '/compliance/inspection', '/work/todo', '/work/approvals',
  '/settings/users', '/settings/menus', '/settings/permissions', '/settings/codes', '/settings/forms', '/settings/audit',
  '/platform/integrations', '/search',
]

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/login`, { redirect: 'manual' })).status === 200) return } catch { /* 기동 전 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 대기 시간 초과')
}

async function main() {
  if (!existsSync(path.join(ROOT, '.next'))) { console.error('✗ .next 빌드 없음 — npm run build 먼저'); process.exit(1) }
  writeFileSync(DATA, JSON.stringify(emptyStore), 'utf8')
  const server = spawn(`npx next start -p ${PORT}`, { cwd: ROOT, shell: true, stdio: 'ignore', env: { ...process.env, PORTAL_DATA_FILE: DATA } })
  let ok = 0
  const fails = []
  try {
    await waitReady()
    for (const r of ROUTES) {
      try {
        const res = await fetch(`${BASE}${r}`, { headers: { cookie }, redirect: 'manual' })
        if (res.status !== 200) { fails.push(`${r}: HTTP ${res.status}`); continue }
        const body = await res.text()
        if (body.includes('구현 예정 화면') && r !== '/dashboard') fails.push(`${r}: 스텁 폴백(라우트 누락)`)
        else if (/오류가 발생|문제가 발생|Application error|something went wrong/i.test(body)) fails.push(`${r}: 오류 바운더리`)
        else ok++
      } catch (e) { fails.push(`${r}: 예외 ${e instanceof Error ? e.message : e}`) }
    }
    console.log(`\n${fails.length === 0 ? '✓' : '✗'} emptystate: ${ok}/${ROUTES.length} 화면 첫 기동 렌더 정상`)
    for (const f of fails) console.error(`  ✗ ${f}`)
    process.exitCode = fails.length === 0 ? 0 : 1
  } finally {
    if (process.platform === 'win32') { try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { /* 종료됨 */ } }
    else server.kill()
    try { unlinkSync(DATA) } catch { /* 이미 없음 */ }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
