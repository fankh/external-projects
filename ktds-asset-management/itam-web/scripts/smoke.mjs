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
  '/board/notices': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/board/qna': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/assets/register': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/assets/lifecycle': ['ASSET_MGR', 'ADMIN'],
  '/assets/intake': ['ASSET_MGR', 'ADMIN'],
  '/assets/movement': ['ASSET_MGR', 'ADMIN'],
  '/assets/returns': ['ASSET_MGR', 'ADMIN'],
  '/assets/disposal': ['ASSET_MGR', 'ADMIN'],
  '/inventory/stock': ['ASSET_MGR', 'ADMIN'],
  '/inventory/contracts': ['ASSET_MGR', 'ADMIN'],
  '/inventory/survey': ['ASSET_MGR', 'ADMIN'],
  '/inventory/survey-plan': ['ASSET_MGR', 'ADMIN'],
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
  // 대시보드의 '미등록 신규 발견'은 아직 손대지 않은 건만 보여주는 처리 대기열이므로,
  // 확인요청·격리요청이 걸린 자산(DSC-2607-0041 등)은 여기서 빠지는 것이 정상이다
  check('대시보드: KPI·발견 자산 렌더', dashHtml.includes('미등록 신규 발견') && dashHtml.includes('DSC-2607-0042'))
  check('대시보드: 처리 착수한 발견 자산은 대기열에서 제외', !dashHtml.includes('DSC-2607-0041'))
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
  const ntcHtml = await (await get('/board/notices', 'USER')).text()
  check('공지사항: 목록·본문 렌더', ntcHtml.includes('2026 하반기 재물조사') && ntcHtml.includes('필독'))
  check('공지사항: 사용자에게 등록 버튼 미노출', !ntcHtml.includes('공지 등록'))
  const qnaHtml = await (await get('/board/qna', 'USER')).text()
  check('QnA: 문의 목록·답변 상태 렌더', qnaHtml.includes('질문하기') && qnaHtml.includes('답변 대기') && qnaHtml.includes('답변 완료'))
  const qnaMgr = await (await get('/board/qna', 'ASSET_MGR')).text()
  check('QnA: 담당자에게 답변 입력 노출', qnaMgr.includes('답변 등록'))
  const inHtml = await (await get('/assets/intake', 'ASSET_MGR')).text()
  check('도입·검수: 체크리스트·라벨 렌더', inHtml.includes('검수 체크리스트') && inHtml.includes('전원·부팅 정상 동작') && inHtml.includes('<svg'))
  check('도입·검수: QR·바코드 SVG 발행', (inHtml.match(/<svg/g) ?? []).length >= 2 && inHtml.includes('AST-2025-000033'))
  const mvHtml = await (await get('/assets/movement', 'ASSET_MGR')).text()
  check('불출·이동: 대기열·재배치 재고 렌더', mvHtml.includes('불출 대기') && mvHtml.includes('이동 대기') && mvHtml.includes('재배치 우선 원칙'))
  // 승인만 되고 집행되지 않은 이동이 대기열에 보여야 한다 (승인 ≠ 집행)
  check('불출·이동: 미집행 승인 이동이 대기열에 노출', mvHtml.includes('APR-2607-101') && mvHtml.includes('본사 9F'))
  const rtHtml = await (await get('/assets/returns', 'ASSET_MGR')).text()
  check('반납·유휴: 접수 대기·유휴 풀 렌더', rtHtml.includes('반납 접수 대기') && rtHtml.includes('유휴 자산 풀') && rtHtml.includes('상태 점검'))
  check('반납·유휴: 반납대기 자산이 접수 대기에 노출', rtHtml.includes('AST-2025-000513'))
  const apUser = await (await get('/workflow/approvals', 'USER')).text()
  check('신청 상신: 사용자에게 신청 UI 노출', apUser.includes('신청 상신') && apUser.includes('신청하기'))
  // 소유자 확인은 결재가 아니라 부서 응답 — 요청받은 부서(플랫폼개발팀=김민준)에게만 응답 버튼이 뜬다
  check('소유자 확인: 해당 부서 사용자에게 응답 버튼', apUser.includes('APR-2607-114') && apUser.includes('본인 자산'))
  const apSec = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('소유자 확인: 타 부서에는 응답 버튼 미노출', apSec.includes('APR-2607-114') && apSec.includes('부서 응답 대기'))
  const insHtml = await (await get('/ai/insights', 'SEC_MGR')).text()
  check('AI 제안: 판정 UI·환류 지표 렌더', insHtml.includes('판정 대기 제안') && insHtml.includes('채택률') && insHtml.includes('재학습 신호'))
  check('AI 제안: 기능별 판정 현황 5종', ['자동분류', '이상탐지', '수명예측', '취약점 우선순위', '라이선스 최적화'].every((k) => insHtml.includes(k)))
  const fndHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 소유자 확인·에스컬레이션 진입점', fndHtml.includes('미확인 소유자 정책') && fndHtml.includes('미응답 에스컬레이션') && fndHtml.includes('응답 대기'))
  // 지문 병합 — 화면이 '지문 병합 후'라고 주장하려면 원시 관측과 병합 근거가 있어야 한다
  check('발견 자산: 원시 관측 대비 병합 결과 표시', fndHtml.includes('원시 관측') && fndHtml.includes('중복'))
  check('발견 자산: 다채널 병합 표기', fndHtml.includes('채널 병합'))
  check('발견 자산: 병합 후보 카드', fndHtml.includes('병합 후보') && fndHtml.includes('DSC-2607-0045') && fndHtml.includes('호스트명 동일'))
  const intHtml2 = await (await get('/platform/integrations', 'ADMIN')).text()
  check('연동: 알림 발송 이력 렌더', intHtml2.includes('알림 발송 이력') && intHtml2.includes('MSG-4001') && intHtml2.includes('만료 임박'))
  const ctHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약: 만료 임박 알림 발송 진입점', ctHtml.includes('만료 임박 알림 발송'))
  check('계약: 라이선스 조치(4단계) 진입점', ctHtml.includes('추가 구매') && ctHtml.includes('회수') && ctHtml.includes('검출에서 조치까지'))
  console.log('\n[엑셀 내보내기 — 기능 단위 권한]')
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  for (const kind of ['assets', 'stock', 'discovered', 'contracts', 'approvals']) {
    const r = await get(`/api/export/${kind}`, 'ADMIN')
    const buf = Buffer.from(await r.arrayBuffer())
    // PK\x03\x04 = ZIP 시그니처. 엑셀이 열 수 있는 형식인지 최소한 확인한다.
    check(`엑셀 ${kind}: 200 · xlsx MIME · ZIP 시그니처`,
      r.status === 200 && (r.headers.get('content-type') ?? '').includes(XLSX_MIME)
      && buf.subarray(0, 4).toString('binary') === 'PK\x03\x04' && buf.length > 500,
      `status=${r.status} len=${buf.length}`)
    // 중앙 디렉터리 끝 시그니처가 있어야 온전한 zip 이다
    check(`엑셀 ${kind}: EOCD 존재 (온전한 ZIP)`, buf.includes(Buffer.from('PK\x05\x06', 'binary')))
  }
  // 권한 매트릭스에 '엑셀'이 없는 사용자 권한그룹은 URL 직접 호출도 차단되어야 한다
  for (const kind of ['assets', 'stock', 'discovered', 'contracts', 'approvals']) {
    const r = await get(`/api/export/${kind}`, 'USER')
    check(`엑셀 ${kind}: USER 차단 (403)`, r.status === 403, `status=${r.status}`)
  }
  check('엑셀: 미로그인 차단 (401)', (await get('/api/export/assets')).status === 401)
  check('엑셀: 알 수 없는 종류 404', (await get('/api/export/nope', 'ADMIN')).status === 404)
  const stockXlsx = await get('/api/export/stock', 'SEC_MGR')
  check('엑셀 stock: 보안담당은 권한 밖 (403)', stockXlsx.status === 403, `status=${stockXlsx.status}`)
  const regHtml2 = await (await get('/assets/register', 'ASSET_MGR')).text()
  check('자산 대장: 엑셀 버튼 노출 (자산담당)', regHtml2.includes('/api/export/assets'))
  const regUser2 = await (await get('/assets/register', 'USER')).text()
  check('자산 대장: 사용자에겐 엑셀 버튼 미노출', !regUser2.includes('/api/export/assets'))

  const aiPol = await (await get('/settings/ai-policy', 'ADMIN')).text()
  check('AI 거버넌스: 감사 로그가 질의·판정까지 포괄', aiPol.includes('AI 관련 감사 로그') && aiPol.includes('AI 정책'))
  const dspHtml = await (await get('/assets/disposal', 'ASSET_MGR')).text()
  check('폐기: 후보·소거 방식·증적 렌더', dspHtml.includes('데이터 소거') && dspHtml.includes('증적') && dspHtml.includes('AST-2019-000218'))
  const svyHtml = await (await get('/inventory/survey', 'ASSET_MGR')).text()
  check('재물조사 수행: 스캔 실사·차이 항목 렌더', svyHtml.includes('스캔하거나 자산번호 입력') && svyHtml.includes('위치 불일치') && svyHtml.includes('조정 결재 상신'))
  const planHtml = await (await get('/inventory/survey-plan', 'ASSET_MGR')).text()
  check('재물조사 계획: 회차 목록·유형·담당자 렌더', planHtml.includes('2026 하반기 정기 재물조사') && planHtml.includes('연간') && planHtml.includes('수시') && planHtml.includes('계획 수립'))
  // 범위 select 는 '계획 수립' 을 눌러야 펼쳐지므로 초기 HTML 에는 없다. 대신 클라이언트로
  // 전달된 후보 목록을 검증한다 — 아래 값들은 공통코드 LOCATION 그룹에만 존재한다.
  const scopeOnlyInCodes = ['IDC-A Rack 12', '본사 8F 통신실', '본사 3F 검수실']
  check('재물조사 계획: 대상 범위 후보가 공통코드 LOCATION 에서 옴',
    scopeOnlyInCodes.every((l) => planHtml.includes(l)), scopeOnlyInCodes.filter((l) => !planHtml.includes(l)).join(', '))
  check('재물조사 계획: 미확인 자산 자동 편성 진입점', planHtml.includes('미확인(유령) 자산 자동 편성') && planHtml.includes('자동 편성'))
  const recHtml2 = await (await get('/discovery/reconcile', 'ASSET_MGR')).text()
  check('CMDB 대사: 미확인 → 조사 편성 연결', recHtml2.includes('/inventory/survey-plan'))
  const recSec = await (await get('/discovery/reconcile', 'SEC_MGR')).text()
  check('CMDB 대사: 보안담당에겐 계획 링크 미노출 (권한 밖 이동 방지)', !recSec.includes('/inventory/survey-plan'))
  // 실사 위치 드롭다운은 공통코드 LOCATION 그룹에서 오며, 대장의 랙 단위 위치를 모두 포함해야
  // 허위 위치 불일치(오탐)가 생기지 않는다
  const codeHtml2 = await (await get('/settings/codes', 'ADMIN')).text()
  const regHtml = await (await get('/assets/register', 'ASSET_MGR')).text()
  const rackLocations = ['IDC-A Rack 12', 'IDC-A Rack 20', 'IDC-B Rack 3', '본사 8F 통신실', '본사 3F 검수실', 'IDC-A vCluster1']
  check('공통코드: 위치 코드가 랙 단위까지 정의', rackLocations.every((l) => codeHtml2.includes(l)), rackLocations.filter((l) => !codeHtml2.includes(l)).join(', '))
  check('재물조사: 실사 위치 목록이 대장 위치와 정합', rackLocations.filter((l) => regHtml.includes(l)).every((l) => svyHtml.includes(l)), rackLocations.filter((l) => regHtml.includes(l) && !svyHtml.includes(l)).join(', '))
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
