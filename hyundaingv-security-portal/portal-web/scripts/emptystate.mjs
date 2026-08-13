/** 데이터 파일 견고성 게이트 — 두 가지 배포 안전선을 검증한다:
 *   1) 빈 스토어(첫 기동) — 신규 고객사가 시드 없이 배포한 첫 로그인에서 전 화면이 깨지지 않는가
 *      (health 는 시드로 돌아 가드 없는 배열 접근·0 나눗셈 회귀를 못 잡는다).
 *   2) 손상 파일 — 수기편집·부분저장(저장 중 크래시)·잘못된 백업 복원으로 컬렉션 타입이 어긋나도
 *      서버가 죽지 않고 그 키만 시드 기본값으로 폴백하는가 (loadFromFile 타입 안전 머지).
 *  사용: npm run build 후  node scripts/emptystate.mjs */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3419
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

// 한 번의 서버 기동으로 전 라우트를 훑어 렌더 견고성을 본다. dataObj 로 PORTAL_DATA_FILE 을 심는다.
// extra(body) 를 주면 라우트별 추가 단언(예: 손상 파일에서도 정상 키가 머지됐는지)을 수행한다.
async function probe(label, dataObj, port, extra) {
  writeFileSync(DATA, JSON.stringify(dataObj), 'utf8')
  const server = spawn(`npx next start -p ${port}`, { cwd: ROOT, shell: true, stdio: 'ignore', env: { ...process.env, PORTAL_DATA_FILE: DATA } })
  let ok = 0
  const fails = []
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://localhost:${port}/login`, { redirect: 'manual' })).status === 200) break } catch { /* 기동 전 */ }
      await new Promise((r) => setTimeout(r, 500))
    }
    for (const r of ROUTES) {
      try {
        const res = await fetch(`http://localhost:${port}${r}`, { headers: { cookie }, redirect: 'manual' })
        if (res.status !== 200) { fails.push(`${r}: HTTP ${res.status}`); continue }
        const body = await res.text()
        if (body.includes('구현 예정 화면') && r !== '/dashboard') fails.push(`${r}: 스텁 폴백(라우트 누락)`)
        else if (/오류가 발생|문제가 발생|Application error|something went wrong/i.test(body)) fails.push(`${r}: 오류 바운더리`)
        else { const e = extra?.(r, body); if (e) fails.push(`${r}: ${e}`); else ok++ }
      } catch (e) { fails.push(`${r}: 예외 ${e instanceof Error ? e.message : e}`) }
    }
    console.log(`${fails.length === 0 ? '✓' : '✗'} ${label}: ${ok}/${ROUTES.length} 화면 렌더 정상`)
    for (const f of fails) console.error(`  ✗ ${f}`)
    return fails.length === 0
  } finally {
    if (process.platform === 'win32') { try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { /* 종료됨 */ } }
    else server.kill()
    try { unlinkSync(DATA) } catch { /* 이미 없음 */ }
  }
}

async function main() {
  if (!existsSync(path.join(ROOT, '.next'))) { console.error('✗ .next 빌드 없음 — npm run build 먼저'); process.exit(1) }

  // 1) 빈 스토어 — 시드 없이 첫 배포한 신규 고객사의 첫 로그인
  const emptyOk = await probe('emptystate(빈 스토어)', emptyStore, PORT)

  // 2) 손상 파일 — 컬렉션 타입 붕괴(문자열·숫자·객체 오염) + 정상 부분(people 배열)이 공존.
  //    서버가 죽지 않고 오염 키는 시드로 폴백, 정상 키는 머지돼야 한다 (loadFromFile 타입 안전 머지).
  const corrupt = { ...emptyStore, srRequests: 'corrupt', incidents: 42, notices: { bad: 1 }, todos: null,
    people: [{ login: 'probe1', name: '견고성검증', dept: '품질보증팀', role: 'USER' }] }
  const corruptOk = await probe('corruptfile(손상 파일)', corrupt, PORT + 1,
    (r, body) => (r === '/settings/users' && !body.includes('품질보증팀')) ? '정상 부분(people) 머지 누락' : null)

  process.exitCode = emptyOk && corruptOk ? 0 : 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
