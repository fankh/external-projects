/** 스모크 테스트 — 프로덕션 서버를 띄우고 권한 매트릭스·데이터 스코핑·리다이렉트를 검증한다.
 *  사용: npm run build && npm run smoke  (edim-web-next scripts/smoke.mjs 패턴) */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3378
const BASE = `http://localhost:${PORT}`

if (!existsSync(path.join(ROOT, '.next'))) {
  console.error('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
  process.exit(1)
}

const ACCOUNTS = {
  USER: { login: 'mj.kim', name: '김민준', dept: '플랫폼개발팀', role: 'USER' },
  ASSET_MGR: { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' },
  SEC_MGR: { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR' },
  ADMIN: { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' },
}
const cookie = (role) => `itam_session=${encodeURIComponent(JSON.stringify(ACCOUNTS[role]))}`

/** 라우트 × 권한 — components/chrome/menus.ts 및 페이지 가드와 동일해야 한다 */
const ROUTES = {
  '/dashboard': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/assets/register': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/assets/lifecycle': ['ASSET_MGR', 'ADMIN'],
  '/inventory/stock': ['ASSET_MGR', 'ADMIN'],
  '/inventory/contracts': ['ASSET_MGR', 'ADMIN'],
  '/discovery/found': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/reconcile': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/saas': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/external': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/platform/integrations': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/ai/assistant': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/ai/insights': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/ai/reports': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/workflow/approvals': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/settings/permissions': ['ADMIN'],
  '/settings/users': ['ADMIN'],
  '/settings/codes': ['ADMIN'],
  '/settings/scan-policy': ['ADMIN'],
  '/settings/saas-catalog': ['ADMIN'],
  '/settings/ai-policy': ['ADMIN'],
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`) }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const get = (p, role) =>
  fetch(BASE + p, { redirect: 'manual', headers: role ? { cookie: cookie(role) } : {} })

async function waitReady(proc) {
  for (let i = 0; i < 60; i += 1) {
    if (proc.exitCode !== null) throw new Error(`서버 조기 종료 (exit ${proc.exitCode})`)
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.status === 200) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 시간 초과')
}

const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
  cwd: ROOT, stdio: 'ignore',
})

try {
  await waitReady(server)
  console.log(`서버 기동 완료 — ${BASE}\n`)

  console.log('[인증 리다이렉트]')
  const root = await get('/')
  check('/ (미로그인) → /login 리다이렉트', root.status === 307 && (root.headers.get('location') ?? '').includes('/login'), `status=${root.status}`)
  const dash = await get('/dashboard')
  check('/dashboard (미로그인) → /login 리다이렉트', dash.status === 307 && (dash.headers.get('location') ?? '').includes('/login'), `status=${dash.status}`)
  const login = await get('/login')
  check('/login 200 + 브랜딩 렌더', login.status === 200 && (await login.text()).includes('SEEKERSLAB'))

  console.log('\n[권한 매트릭스 — 라우트 × 권한그룹]')
  for (const [route, allowed] of Object.entries(ROUTES)) {
    for (const role of Object.keys(ACCOUNTS)) {
      const r = await get(route, role)
      if (allowed.includes(role)) {
        check(`${role} → ${route} 접근 허용`, r.status === 200, `status=${r.status}`)
      } else {
        const loc = r.headers.get('location') ?? ''
        check(`${role} → ${route} 차단 (/dashboard 리다이렉트)`, r.status === 307 && loc.includes('/dashboard'), `status=${r.status} loc=${loc}`)
      }
    }
  }

  console.log('\n[데이터 스코핑 — 자산 대장]')
  const userHtml = await (await get('/assets/register', 'USER')).text()
  check('USER: 본인 자산(AST-2023-000112) 표시', userHtml.includes('AST-2023-000112'))
  check('USER: 타인·서버 자산(AST-2023-000561) 미표시', !userHtml.includes('AST-2023-000561'))
  check('USER: 권한 범위 콜아웃 표시', userHtml.includes('본인 보유 자산만'))
  const mgrHtml = await (await get('/assets/register', 'ASSET_MGR')).text()
  check('자산담당: 전체 자산 표시 (본인 외 포함)', mgrHtml.includes('AST-2023-000112') && mgrHtml.includes('AST-2023-000561'))

  console.log('\n[핵심 화면 콘텐츠]')
  const dashHtml = await (await get('/dashboard', 'ASSET_MGR')).text()
  check('대시보드: KPI·발견 자산 렌더', dashHtml.includes('미등록 신규 발견') && dashHtml.includes('DSC-2607-0041'))
  const foundHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 6채널·대사 상태 렌더', foundHtml.includes('네트워크 능동 스캔') && foundHtml.includes('등록·불일치'))
  const contractsHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약·라이선스: 보유–사용 대사 렌더', contractsHtml.includes('JetBrains') && contractsHtml.includes('초과 사용'))
  const aprHtml = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('결재함: 격리 요청 문서 렌더', aprHtml.includes('격리 요청') && aprHtml.includes('APR-2607-112'))
  const permHtml = await (await get('/settings/permissions', 'ADMIN')).text()
  check('권한 매트릭스: 파이프라인·매트릭스 렌더', permHtml.includes('메뉴권한관리') && permHtml.includes('최소권한'))
  const extHtml = await (await get('/discovery/external', 'SEC_MGR')).text()
  check('외부 공격표면: 수동·능동 기법 렌더', extHtml.includes('인증서 투명성') && extHtml.includes('존 트랜스퍼'))
  check('외부 공격표면: 노출 자산·CVE 렌더', extHtml.includes('legacy-vpn.seekerslab.co.kr') && extHtml.includes('CVE-2018-13379'))
  check('외부 공격표면: 위협 인텔·유출 수집 렌더', extHtml.includes('스틸러 로그'))
  const repHtml = await (await get('/ai/reports', 'ASSET_MGR')).text()
  check('리포트: 5종 유형·생성 UI 렌더', repHtml.includes('주간 Shadow IT 브리핑') && repHtml.includes('감사 대응 자료') && repHtml.includes('결재 첨부용'))
  const scanHtml = await (await get('/settings/scan-policy', 'ADMIN')).text()
  check('탐지 채널 정책: 6채널·강도 통제 렌더', scanHtml.includes('네트워크 능동 스캔') && scanHtml.includes('스캔 안전장치') && scanHtml.includes('23:00 ~ 05:00'))
  const catHtml = await (await get('/settings/saas-catalog', 'ADMIN')).text()
  check('SaaS 카탈로그: 판정 상태 렌더', catHtml.includes('Dropbox') && catHtml.includes('검토중'))
  const codeHtml = await (await get('/settings/codes', 'ADMIN')).text()
  check('공통코드: 그룹·값 렌더', codeHtml.includes('ASSET_CATEGORY') && codeHtml.includes('미사용 처리'))
  const aiHtml = await (await get('/settings/ai-policy', 'ADMIN')).text()
  check('AI 정책: 실행 환경·거버넌스 렌더', aiHtml.includes('온프레미스 LLM') && aiHtml.includes('권한 범위 필터'))
  const usrHtml = await (await get('/settings/users', 'ADMIN')).text()
  check('사용자 · 결재선: 결재선·필수 결재 렌더', usrHtml.includes('IT기획팀장') && usrHtml.includes('필수 결재'))
  const intHtml = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('연동 · 인프라: 커넥터·감사 로그 렌더', intHtml.includes('EDR · 백신 콘솔') && intHtml.includes('감사 로그') && intHtml.includes('권한 밖 화면 접근 시도'))
  check('연동 · 인프라: 양방향 조치 채널 렌더', intHtml.includes('양방향') && intHtml.includes('SAML'))
} catch (err) {
  failed += 1
  console.error(`✗ 실행 오류: ${err instanceof Error ? err.message : err}`)
} finally {
  server.kill()
}

console.log(`\n결과: ${passed} passed / ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
