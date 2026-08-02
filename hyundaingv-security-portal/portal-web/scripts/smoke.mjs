/** 스모크 테스트 — 프로덕션 서버를 띄우고 권한 매트릭스·리다이렉트를 검증한다.
 *  사용: npm run build && npm run smoke  (itam-web scripts/smoke.mjs 패턴) */
import { execSync, spawn } from 'node:child_process'
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
    // 이전 실행의 고아 서버가 포트를 잡고 있으면 구버전을 검증하게 된다 — 기동 전에 확인한다
    try {
      await fetch(`${BASE}/login`)
      throw new Error(`포트 ${PORT} 에 이미 서버가 떠 있습니다 — 이전 스모크의 고아 프로세스를 종료하세요.`)
    } catch (e) {
      if (e instanceof Error && e.message.includes('이미 서버가')) throw e
      // 연결 실패 = 포트 비어 있음 (정상)
    }
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

  // 3) 구현 화면 — SSR 본문 내용 검증
  const CONTENT = [
    ['/work/approvals', 'BIZ_MGR', ['수신함 — 결재 대기', 'AP-2026-0712', '상신함']],
    ['/work/approvals', 'USER', ['월별 정산 데이터 추출 요청']], // 김현우 상신함
    ['/work/todo', 'USER', ['보안서약서', '서약서 제출', '상반기 정보보호 교육 이수']],
    ['/work/todo', 'BIZ_MGR', ['SR-2026-0146 CI 배정', '결재함 이동']],
    ['/dashboard', 'USER', ['개인별현황', '2026년 일반 보안서약서 제출']],
    // SR 루프 — 데이터 스코핑: USER 는 본인 건만 (SR-2026-0132 는 박정호 건이라 보이면 안 된다)
    ['/sr/requests', 'USER', ['SR-2026-0141', 'SR-2026-0145', '본인 신청 건']],
    ['/sr/requests', 'DEPT_MGR', ['SR-2026-0146', '경영지원팀 신청 건']],
    ['/sr/requests', 'BIZ_MGR', ['SR-2026-0132', '전사 신청 건']],
    ['/sr/new', 'USER', ['신청서 작성', '결재 상신']],
    ['/sr/ci', 'BIZ_MGR', ['SR-2026-0146', '배정 · 착수', 'BA 반려']],
    ['/sr/manage', 'BIZ_MGR', ['전사 SR 목록', 'SR-2026-0141', '진행 처리']],
    ['/sr/delayed', 'BIZ_MGR', ['SR-2026-0132', '완료일 변경']],
    // 서약 루프 — 김현우 미제출 / 박정호 제출 완료, 부서담당은 소속 부서만
    ['/pledge/my', 'USER', ['미제출', '서약서 제출', '온라인 동의']],
    ['/pledge/my', 'BIZ_MGR', ['제출 완료', '2026-07-10']],
    ['/pledge/dept', 'DEPT_MGR', ['경영지원팀', '정민서', '전원 완료']],
    ['/pledge/dept', 'BIZ_MGR', ['개발1팀', '미서약 안내메일', '서약률']],
    // 공지 — 등록 폼은 업무담당·Admin 에게만
    ['/board/notices', 'USER', ['8월 정기 서버 점검 안내']],
    ['/board/notices', 'ADMIN', ['공지 등록']],
    // 연동 프레임워크 — 채널 레지스트리·어댑터 바인딩·상태 제어
    ['/platform/integrations', 'ADMIN', ['연동 채널', '그룹웨어 메일', '자산관리시스템', 'mock-asset', '인사정보 즉시 동기화', 'portal.config.ts']],
  ]
  for (const [route, role, needles] of CONTENT) {
    const r = await get(route, role)
    const html = await r.text()
    for (const needle of needles) {
      check(r.status === 200 && html.includes(needle), `${role} ${route} 본문에 "${needle}"`)
    }
  }

  // 3-1) 데이터 스코핑 부정 검증 — 남의 건이 보이면 안 된다
  {
    const r = await get('/sr/requests', 'USER')
    const html = await r.text()
    check(!html.includes('SR-2026-0132'), 'USER /sr/requests 에 타인 건(SR-2026-0132) 미노출')
    check(!html.includes('SR-2026-0146'), 'USER /sr/requests 에 타부서 건(SR-2026-0146) 미노출')
  }
  {
    const r = await get('/pledge/dept', 'DEPT_MGR')
    const html = await r.text()
    check(!html.includes('개발1팀'), 'DEPT_MGR /pledge/dept 에 타부서(개발1팀) 미노출')
  }
  {
    const r = await get('/board/notices', 'USER')
    const html = await r.text()
    check(!html.includes('공지 등록'), 'USER /board/notices 에 등록 폼 미노출')
  }

  // 4) 미정의 경로 — 404
  const nf = await get('/no-such-screen', 'ADMIN')
  check(nf.status === 404, `미정의 경로 → 404 (got ${nf.status})`)

  // 5) 루트 — 세션 유무에 따라 분기
  const rootAnon = await get('/')
  check(rootAnon.status === 307 && (rootAnon.headers.get('location') ?? '').includes('/login'), '루트(미로그인) → /login')
  const rootUser = await get('/', 'USER')
  check(rootUser.status === 307 && (rootUser.headers.get('location') ?? '').includes('/dashboard'), '루트(로그인) → /dashboard')

  console.log(`\n${fail === 0 ? '✓' : '✗'} smoke: ${pass} 통과, ${fail} 실패 (${BASE})`)
  process.exitCode = fail === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => {
    if (!server) return
    // Windows 에서 shell:true 로 띄운 자식은 kill() 이 cmd 만 죽이고 서버가 고아로 남는다 — 트리째 종료한다
    if (process.platform === 'win32') {
      try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' }) } catch { /* 이미 종료 */ }
    } else {
      server.kill()
    }
  })
