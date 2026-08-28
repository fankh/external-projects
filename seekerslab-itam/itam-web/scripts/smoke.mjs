/** 스모크 테스트 — 프로덕션 서버를 띄우고 권한 매트릭스·데이터 스코핑·리다이렉트를 검증한다.
 *  사용: npm run build && npm run smoke  (edim-web-next scripts/smoke.mjs 패턴) */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { assertFreshBuild, assertPortFree } from './build-guard.mjs'
import { damagedRegexLiterals } from './regex-guard.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3378
/** SMOKE_BASE 를 주면 이미 떠 있는 서버(=배포본)를 그대로 검증한다.
 *  로컬에서 통과해도 배포본에서만 틀리는 결함이 실재한다 — 컨테이너 TZ 가 UTC 라
 *  KST 00~09시에 날짜가 하루 뒤처지던 건이 그랬다. 배포 후 같은 스위트를 한 번 더 돌린다.
 *  예: SMOKE_BASE=http://localhost:3390 node scripts/smoke.mjs */
const BASE = process.env.SMOKE_BASE || `http://localhost:${PORT}`
const REMOTE = Boolean(process.env.SMOKE_BASE)

// 빌드 신선도 — 소스가 .next 보다 새로우면 예전 빌드를 검증하게 되므로 시작하지 않는다(scripts/build-guard.mjs)
assertFreshBuild(ROOT, { remote: REMOTE })
// 포트 선점 — 앞 실행이 남긴 서버가 있으면 spawn 은 바인드에 실패하고 준비 확인만 그 서버에서 통과한다
//  (신선한 시드라는 전제가 깨진 채 남의 상태를 검사한다). 착각하느니 멈춘다(scripts/build-guard.mjs)
if (!REMOTE) await assertPortFree(PORT)

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
  '/discovery/scan': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/found': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/reconcile': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/saas': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/discovery/external': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/platform/integrations': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/ai/assistant': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/ai/insights': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/ai/reports': ['ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/workflow/approvals': ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'],
  '/settings/menus': ['ADMIN'],
  '/settings/permissions': ['ADMIN'],
  '/settings/users': ['ADMIN'],
  '/settings/codes': ['ADMIN'],
  '/settings/scan-policy': ['ADMIN'],
  '/settings/saas-catalog': ['SEC_MGR', 'ADMIN'],
  '/settings/ai-policy': ['ADMIN'],
}

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  ✓ ${name}`) }
  else { failed += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** 요청 한 번 — 연결 수준 실패는 한 번 다시 시도한다.
 *  스모크는 한 번에 900 회가 넘는 요청을 순차로 보내는데, 다른 스위트 직후에 돌리면 윈도우의 임시 포트가
 *  TIME_WAIT 로 잠깐 말라 ECONNRESET/ECONNREFUSED 가 난다. 그 한 번 때문에 전체가 '실행 오류'로 끝나면
 *  진짜 회귀와 구분이 안 된다 — 상태 코드가 돌아온 실패(4xx·5xx)는 그대로 두고, 연결 자체가 안 된 경우만 재시도한다. */
const get = async (p, role) => {
  const opts = { redirect: 'manual', headers: role ? { cookie: cookie(role) } : {} }
  try {
    return await fetch(BASE + p, opts)
  } catch (e) {
    await new Promise((r) => setTimeout(r, 300))
    return fetch(BASE + p, opts)
  }
}

/** React SSR 은 인접한 표현식 사이에 <!-- --> 를 넣는다 (`{n}일` → `7<!-- -->일`).
 *  텍스트를 그대로 검사하려면 주석을 걷어내야 한다. */
const text = (html) => html.replace(/<!--[\s\S]*?-->/g, '')

async function waitReady(proc) {
  for (let i = 0; i < 60; i += 1) {
    if (proc && proc.exitCode !== null) throw new Error(`서버 조기 종료 (exit ${proc.exitCode})`)
    try {
      const r = await fetch(`${BASE}/login`)
      if (r.status === 200) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('서버 기동 시간 초과')
}

// 원격 대상일 때는 서버를 띄우지 않는다 — 쓰지도 않을 프로세스가 3378 을 점유하면
// 나중에 도는 로컬 스모크가 그 서버(= 다른 빌드)에 붙어 엉뚱한 결과를 낸다.
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const server = REMOTE ? null : spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
  cwd: ROOT, stdio: 'ignore',
})

try {
  await waitReady(server)
  console.log(`${REMOTE ? '원격 대상 검증' : '서버 기동 완료'} — ${BASE}\n`)

  console.log('[인증 리다이렉트]')
  const root = await get('/')
  check('/ (미로그인) → /login 리다이렉트', root.status === 307 && (root.headers.get('location') ?? '').includes('/login'), `status=${root.status}`)
  const dash = await get('/dashboard')
  check('/dashboard (미로그인) → /login 리다이렉트', dash.status === 307 && (dash.headers.get('location') ?? '').includes('/login'), `status=${dash.status}`)
  const login = await get('/login')
  check('/login 200 + 브랜딩 렌더', login.status === 200 && (await login.text()).includes('SEEKERSLAB'))
  // 없는 주소 — Next 기본 화면은 영어 한 줄에 돌아갈 길도 없다. 오타·낡은 즐겨찾기·삭제된 레코드 딥링크로 흔히 닿는 자리다.
  const nf = await get('/이런화면은없습니다')
  const nfBody = await nf.text()
  check('없는 주소: 404 + 한국어 안내 + 돌아갈 링크', nf.status === 404 && nfBody.includes('요청하신 화면을 찾을 수 없습니다') && nfBody.includes('/dashboard'), `status=${nf.status}`)

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

  // 표기 무결성 — 계산이 깨지면 화면에 NaN·Infinity·[object Object] 가 그대로 찍힌다(빈 목록에 Math.max,
  //  0 으로 나눈 비율, 객체를 문자열로 이어붙인 자리). 담당자는 그 숫자를 보고 판단하므로 조용히 새는 게 가장 나쁘다.
  //  권한이 열어 주는 모든 화면을 한 번씩 훑어 흔적을 찾는다(라우트 × 권한그룹 매트릭스와 같은 집합).
  const renderBad = []
  for (const [route, allowed] of Object.entries(ROUTES)) {
    for (const role of allowed) {
      const html = await (await get(route, role)).text()
      for (const bad of ['NaN', 'Infinity', '[object Object]']) {
        if (html.includes(bad)) renderBad.push(`${role} ${route} → ${bad}`)
      }
    }
  }
  check('표기 무결성: 모든 화면에 NaN·Infinity·[object Object] 없음',
    renderBad.length === 0, renderBad.slice(0, 4).join(' / '))

  console.log('\n[데이터 스코핑 — 자산 대장]')
  const userHtml = await (await get('/assets/register', 'USER')).text()
  check('USER: 본인 자산(AST-2023-000112) 표시', userHtml.includes('AST-2023-000112'))
  check('USER: 타인·서버 자산(AST-2023-000561) 미표시', !userHtml.includes('AST-2023-000561'))
  check('USER: 권한 범위 콜아웃 표시', userHtml.includes('본인 보유 자산만'))
  // 자산 장애 신고 — 사용자 발화형 수리 진입점. 본인 명의 사용 중 자산 상세에 장애 신고 버튼(수리 대기 편성). 그동안 수리는 반납 점검에서만 시작됐다.
  const userSelHtml = await (await get('/assets/register?sel=AST-2024-000015', 'USER')).text()
  check('USER: 본인 사용중 자산에 장애 신고(수리 요청) 버튼 노출', userSelHtml.includes('장애 신고 (수리 요청)'))
  // 대여 반환 기한 연장 요청(사용자 셀프서비스) — 그동안 연장은 자산담당만 가능했다. 본인 대여중 자산(AST-2024-000230·김민준)에 연장 요청 접점.
  const userLoanHtml = await (await get('/assets/register?sel=AST-2024-000230', 'USER')).text()
  check('자산 대장(사용자): 본인 대여 자산에 반환 기한 연장 요청 버튼(셀프서비스)', userLoanHtml.includes('반환 기한 연장 요청'))
  // 자산 수령(인수) 확인 — 불출 배정 후 사용자 인수 확인(체인 오브 커스터디). 시드 AST-2024-000015 는 수령 대기.
  check('USER: 수령 대기 자산에 수령 확인(인수 확인) 버튼 노출', userSelHtml.includes('수령 확인 대기') && userSelHtml.includes('수령 확인 (인수 확인)'))
  const mgrHtml = await (await get('/assets/register', 'ASSET_MGR')).text()
  check('자산담당: 전체 자산 표시 (본인 외 포함)', mgrHtml.includes('AST-2023-000112') && mgrHtml.includes('AST-2023-000561'))
  // 수령 확인 독촉 — 수령 미확인(불출 후 인수 대기) 자산이 있으면 자산담당에게 독촉 발송 버튼 노출(시드 AST-2024-000015 수령 대기)
  check('자산 대장: 수령 확인 독촉 발송 버튼(자산담당·미확인 있을 때)', mgrHtml.includes('수령 확인 독촉 발송'))
  // 자산 회수(반납 처리) — 사용 중 자산을 자산담당이 직접 회수(오프보딩·재배정). 그동안 반납은 사용자 상신에서만 시작됐다.
  const mgrSelHtml = await (await get('/assets/register?sel=AST-2023-000221', 'ASSET_MGR')).text()
  check('자산 대장: 사용 중 자산에 자산 회수(반납 처리) 버튼(자산담당)', mgrSelHtml.includes('자산 회수 (반납 처리)'))
  // 정기 점검(예방 정비) — 반응형 수리와 별개의 사전 정비. 예정일 도래 자산(시드 AST-2022-000640/641)을 대장 필터·상세 액션에 노출.
  check('자산 대장: 정기 점검 필터 렌더(예방 정비 대상 있을 때)', mgrHtml.includes('정기 점검 '))
  const maintSelHtml = await (await get('/assets/register?sel=AST-2022-000640', 'ASSET_MGR')).text()
  check('자산 대장: 정기 점검 예정 자산 상세에 점검 완료 액션', maintSelHtml.includes('정기 점검 예정') && maintSelHtml.includes('정기 점검 완료'))
  // 정기 점검 일정 등록 — 예방 정비 예정이 없는 운영 자산을 정비 사이클에 편입하는 최초 등록 접점(완료 재예약과 별개). 자산담당만.
  const schedSelHtml = await (await get('/assets/register?sel=AST-2024-000618', 'ASSET_MGR')).text()
  check('자산 대장: 예방 정비 미편성 자산 상세에 정기 점검 일정 등록 액션', schedSelHtml.includes('정기 점검 일정 등록'))
  // 이미 예정이 잡힌 자산에는 등록 대신 완료 액션만 — 두 액션은 상호배타(중복 예정 방지)
  check('자산 대장: 이미 정기 점검 예정인 자산엔 일정 등록 액션 미노출(완료만)', !maintSelHtml.includes('정기 점검 일정 등록'))
  // 폐기 절차 자산의 대여 접점 차단 — loanAsset 가드(폐기 절차 중 대여 불가)와 화면을 맞춘다.
  //  시드 AST-2021-000432 는 유휴지만 폐기 대상 선정(DSP-02) 상태다. 상태만 보고 대여 버튼을 내주면 눌러야 거부되는 막다른 길이 된다.
  const dispSelHtml = await (await get('/assets/register?sel=AST-2021-000432', 'ASSET_MGR')).text()
  check('자산 대장: 폐기 절차 중 유휴 자산엔 대여 컨트롤 미노출 + 사유 안내(가드와 정합)', !dispSelHtml.includes('대여 처리 (반출)') && dispSelHtml.includes('폐기 절차(대상 선정~소거 대기) 중인 자산이라'))
  // 정기 점검 독촉 — 예정일 경과(미시행) 자산이 있으면 자산담당에게 독촉 발송 버튼 노출(시드 AST-2022-000640/641 경과). 수령·반환 독촉과 같은 컴플라이언스 독촉.
  check('자산 대장: 정기 점검 독촉 발송 버튼(자산담당·예정 경과 있을 때)', mgrHtml.includes('정기 점검 독촉 발송'))
  // 배정 라이선스 역조회 — 라이선스 좌석 배정(로56)을 자산 관점에서 상세에 노출(오프보딩·감사). 시드 AST-2022-000871 은 LIC-004 AutoCAD 배정.
  const seatSelHtml = await (await get('/assets/register?sel=AST-2022-000871', 'ASSET_MGR')).text()
  check('자산 대장: 상세에 배정 라이선스 역조회(좌석 배정 자산)', seatSelHtml.includes('배정 라이선스') && seatSelHtml.includes('AutoCAD LT') && seatSelHtml.includes('LIC-004'))
  // 사용자도 본인 자산의 배정 라이선스를 본다 — AST-2023-000112(김민준 보유)도 LIC-004 좌석. 권한 스코프 안에서 역조회.
  const userSeatHtml = await (await get('/assets/register?sel=AST-2023-000112', 'USER')).text()
  check('자산 대장(사용자): 본인 자산 배정 라이선스 역조회', userSeatHtml.includes('배정 라이선스') && userSeatHtml.includes('AutoCAD LT'))
  // 장기 미실측(유령 자산 후보) 필터 — 실측 이력이 없거나 오래된 자산이 시드에 있어 토글이 렌더된다
  check('자산 대장: 장기 미실측 필터 렌더 (실측 기반 유령 자산 식별)', mgrHtml.includes('장기 미실측'))
  // 상태 필터 — 유형·검색·장기미실측에 더해 자산 상태(대여중·수리중·분실 등)로도 슬라이스
  check('자산 대장: 상태 필터 렌더', mgrHtml.includes('상태 — 전체') && mgrHtml.includes('대여중'))
  // 상태 요약 스트립 — 상태별 보유 대수를 한눈에 보고 클릭 필터
  check('자산 대장: 상태 요약(구성) 스트립 렌더', mgrHtml.includes('상태 요약'))
  // 보증 임박 필터 — 보증 90일 이내 만료·경과 자산(시드에 다수)이 있어 토글이 렌더된다
  check('자산 대장: 보증 임박 필터 렌더', mgrHtml.includes('보증 임박'))
  // 보증 만료 경과 자산은 목록 보증 컬럼에 '경과' 칩으로 구분 표기(계약 '만료됨'·라이선스 '만료'와 정합). 시드 AST-2022-000512(보증 2025-05-17)
  check('자산 대장: 보증 만료 경과 자산 목록 표기(경과 칩)', mgrHtml.includes('AST-2022-000512') && mgrHtml.includes('>경과<'))
  // EOL OS 필터 — OS 지원 종료 경과 자산(시드 CentOS 7.9·Windows 10)이 있어 토글이 렌더된다 (미패치 취약점 노출·교체 대상)
  // (?os=eol 딥링크의 필터 활성화는 클라이언트 상태라 e2e 로 검증)
  check('자산 대장: EOL OS 필터 렌더', mgrHtml.includes('EOL OS'))
  // 업무 중요도 컬럼 — 그리드에 핵심·중요 칩 노출(시드 핵심 자산 AST-2020-000883 등). 일반은 뮤트 표기.
  check('자산 대장: 중요도 컬럼 렌더 (핵심·중요 칩)', mgrHtml.includes('>중요도<') && mgrHtml.includes('핵심'))
  // 핵심·중요 필터 — 업무 중요도 지정 자산(§05)만 필터. DR·패치 우선순위·감사 대상 식별. (?crit=1 딥링크 활성은 e2e)
  check('자산 대장: 핵심·중요 자산 필터 렌더', mgrHtml.includes('핵심·중요'))
  // 정합성 미흡 필터 — 소유자·시리얼·위치 누락 자산(시드 2건)이 있어 토글이 렌더된다 (CMDB 스튜어드십)
  check('자산 대장: 정합성 미흡 필터 렌더', mgrHtml.includes('정합성 미흡'))
  // 정합성 미흡 상세 배너 — AST-2022-000512(사용중·소유자/위치 미지정)에 누락 필드가 표시된다
  const regDq = await (await get('/assets/register?sel=AST-2022-000512', 'ASSET_MGR')).text()
  check('자산 대장: 정합성 미흡 상세 배너(소유자·위치 누락)', regDq.includes('대장 정합성 미흡') && regDq.includes('소유자 미지정') && regDq.includes('위치 누락'))
  // 정합성 보정 — 누락 필드 인라인 정정 컨트롤(자산담당). USER 는 조회 전용이라 미노출
  check('자산 대장: 정합성 보정 인라인 컨트롤(자산담당)', regDq.includes('보정할 소유자') && regDq.includes('보정할 위치'))
  const regDqUser = await (await get('/assets/register?sel=AST-2022-000512', 'USER')).text()
  check('자산 대장(사용자): 정합성 보정 컨트롤 미노출 (조회 전용)', !regDqUser.includes('보정할 소유자'))
  // SW 자산은 물리 위치·시리얼이 없어 정합성 미흡이 아니다 — 오탐 방지(AST-2023-000720 · Microsoft 365, 위치 '-')
  const regSw = await (await get('/assets/register?sel=AST-2023-000720', 'ASSET_MGR')).text()
  check('자산 대장: SW 자산 위치 누락은 정합성 미흡 아님 (오탐 방지)', !regSw.includes('대장 정합성 미흡'))
  // 업무 중요도(§05 자산 중요도 축) — 상세에 표시, 시드 핵심 자산(AST-2020-000883 · CentOS7 서버)에 '핵심' 노출
  const regCrit = await (await get('/assets/register?sel=AST-2020-000883', 'ASSET_MGR')).text()
  check('자산 대장: 업무 중요도 표시 (핵심 자산)', regCrit.includes('업무 중요도') && regCrit.includes('핵심'))
  check('자산 대장: 업무 중요도 변경 컨트롤(자산담당)', regCrit.includes('취약점 우선순위 스코어링에 반영'))
  const regCritUser = await (await get('/assets/register?sel=AST-2024-000015', 'USER')).text()
  check('자산 대장(사용자): 업무 중요도 표시하되 변경 미노출 (조회 전용)', regCritUser.includes('업무 중요도') && !regCritUser.includes('취약점 우선순위 스코어링에 반영'))
  // 계약–자산 연계(§03 구매 계약: 계약–자산 연결) — 상세에서 계약 연계·해제. 자산담당엔 계약 선택 컨트롤, 사용자엔 미노출.
  check('자산 대장: 계약 연계 관리 컨트롤(자산담당)', regCrit.includes('연계 계약') && regCrit.includes('계약 선택'))
  check('자산 대장(사용자): 계약 연계 컨트롤 미노출 (조회 전용)', regCritUser.includes('연계 계약') && !regCritUser.includes('계약 선택'))
  // 다중 선택(보증 일괄 연장·선택 내보내기 공용) — 자산담당에 전체 선택 체크박스 노출, 사용자엔 미노출(canEdit)
  check('자산 대장: 다중 선택 전체 선택 체크박스(자산담당)', mgrHtml.includes('현재 필터의 자산 전체 선택'))
  // CSV 일괄 등록 — 자산담당·Admin 에 온보딩 패널, 사용자엔 미노출
  check('자산 대장: CSV 일괄 등록 패널(자산담당)', mgrHtml.includes('일괄 등록 (CSV)') && mgrHtml.includes('기존 자산 대장 온보딩'))
  check('자산 대장: 사용자에겐 CSV 일괄 등록 미노출', !userHtml.includes('일괄 등록 (CSV)'))
  check('자산 대장: 사용자에겐 다중 선택 미노출(조회 전용)', !userHtml.includes('현재 필터의 자산 전체 선택'))
  // 자산 → 계약 딥링크 — 계약 연계 자산을 선택하면 상세의 연계 계약이 계약 화면 링크로 렌더
  const regContractDetail = await (await get('/assets/register?sel=AST-2023-000112', 'ASSET_MGR')).text()
  check('자산 대장: 상세 연계 계약이 계약 화면 딥링크', regContractDetail.includes('/inventory/contracts?sel=') && regContractDetail.includes('계약 상세로 이동'))
  // CMDB 의존 관계 인라인 — 자산 대장 상세(주 UX)에도 상위 의존·영향 범위(blast radius) 표기. 시드 스위치(640)는 상위=방화벽(641)·영향 3대. UI 라벨로 검사(count 는 SSR 주석마커로 분절).
  const regCmdb = await (await get('/assets/register?sel=AST-2022-000640', 'ASSET_MGR')).text()
  check('자산 대장 상세: CMDB 의존 관계·영향 범위(blast radius) 인라인 표기', regCmdb.includes('의존 관계 (CMDB)') && regCmdb.includes('영향 범위(blast radius)') && regCmdb.includes('상위 의존'))
  check('자산 대장 상세: 의존 토폴로지 다이어그램(SVG·화살표) 인라인 렌더', regCmdb.includes('의존 토폴로지') && regCmdb.includes('url(#ahi)'))
  // 변경 이력 타임라인 이벤트 종류별 색 구분(제품안내서 §03) — 등록·편입=진입(ok), 폐기·분실=위험(err), 점검·수리=정비(warn). 모든 자산은 등록 이벤트가 있어 ok 톤 마커가 렌더된다.
  check('자산 대장 상세: 변경 이력 타임라인 이벤트 종류별 색 마커(등록=ok)', regCmdb.includes('변경 이력 타임라인') && regCmdb.includes('data-tone="ok"'))
  // 단일 장애점(SPOF) 필터 — CMDB blast radius ≥2 자산(시드 방화벽 641·스위치 640)을 대장 필터 칩으로 노출. 대시보드 영향 집중 큐(?spof=1) 드릴다운과 공유.
  check('자산 대장: 단일 장애점(SPOF) 필터 칩 렌더(blast radius ≥2 자산 있을 때)', mgrHtml.includes('단일 장애점 '))
  const regSpof = await (await get('/assets/register?spof=1', 'ASSET_MGR')).text()
  check('자산 대장: ?spof=1 단일 장애점 필터 활성화(URL 파라미터→필터 배선)', regSpof.includes('단일 장애점 ') && regSpof.includes('✓ '))
  // 복합 위험(≥2 신호) 필터 — 정합성·EOL·보증·점검·SPOF·교체·미실측 주의 신호가 2개 이상 겹치는 자산을 한 필터로 트리아지(도시어 '위험 신호' 요약과 같은 7신호 단일 소스). AST-2021-000432(EOL+교체)가 복합 위험.
  const regRisk = await (await get('/assets/register?risk=1', 'ASSET_MGR')).text()
  check('자산 대장: ?risk=1 복합 위험(≥2 신호) 필터 활성화 · 다중 이슈 자산 노출(AST-2021-000432)', regRisk.includes('복합 위험 ') && regRisk.includes('✓ ') && regRisk.includes('AST-2021-000432'))
  // 교체 대상(수명예측 fn03) 필터 — 내용연수·보증 경과·장애 이력 자산을 AI 패널과 같은 replacementCandidates() 근거로 대장에서 브라우즈·반출(조달 계획). fn03 패널 링크로 드릴다운.
  check('자산 대장: 교체 대상(수명예측) 필터 칩 렌더(교체 대상 있을 때)', mgrHtml.includes('교체 대상 '))
  const regReplace = await (await get('/assets/register?replace=1', 'ASSET_MGR')).text()
  check('자산 대장: ?replace=1 교체 대상 필터 활성화(fn03 패널→대장 드릴다운)', regReplace.includes('교체 대상 ') && regReplace.includes('✓ '))
  // 장기 미실측 URL 필터(?stale=1) — 그동안 클라이언트 토글만 있고 링크 진입점이 없어 대시보드·어시스턴트 '미실측' 링크가 전체 대장으로 떨어졌다. initialStale 로 토글 활성.
  const regStale = await (await get('/assets/register?stale=1', 'ASSET_MGR')).text()
  check('자산 대장: ?stale=1 장기 미실측 필터 활성화(어시스턴트 운영리스크 드릴다운)', regStale.includes('장기 미실측 ') && regStale.includes('✓ '))
  // 수령 미확인 URL 필터(?receipt=1) — 대시보드 큐·어시스턴트 링크가 전체 대장으로 떨어지던 것을 인수 미확인 집합으로 드릴다운. receiptPending·사용중 판정 공유.
  const regReceipt = await (await get('/assets/register?receipt=1', 'ASSET_MGR')).text()
  check('자산 대장: ?receipt=1 수령 미확인 필터 활성화(대시보드·어시스턴트 드릴다운)', regReceipt.includes('수령 미확인 ') && regReceipt.includes('✓ '))
  // 연관 자산(영향도) — 같은 계약·위치·소유자·모델 공유 자산 수 + 드릴 링크
  check('자산 대장: 상세에 연관 자산(영향도) 섹션 + 드릴 링크', regContractDetail.includes('연관 자산') && regContractDetail.includes('같은 모델'))
  check('자산 대장: 상세에 자산 카드(dossier) 인쇄 링크', regContractDetail.includes('/api/asset-card/') && regContractDetail.includes('자산 카드'))
  // 자산 인수인계서 — 영구 불출(사용중) 자산의 서명 인계·인수 확인서(대여 확인서의 불출 대응 · 로54 체인 오브 커스터디 서면 증적). 시드 AST-2025-000512 사용중.
  const regInUseDetail = await (await get('/assets/register?sel=AST-2025-000512', 'ASSET_MGR')).text()
  check('자산 대장: 사용중 상세에 인수인계서 인쇄 링크', regInUseDetail.includes('/api/handover-sheet/') && regInUseDetail.includes('인수인계서'))
  const handover = await get('/api/handover-sheet/AST-2025-000512', 'ASSET_MGR')
  check('인수인계서: 사용중 자산 발급(인계·인수 확인서 렌더)', handover.status === 200 && (await handover.text()).includes('ASSET HANDOVER'))
  check('인수인계서: 미로그인 차단 (401)', (await get('/api/handover-sheet/AST-2025-000512')).status === 401)
  check('인수인계서: 사용자 차단 (403)', (await get('/api/handover-sheet/AST-2025-000512', 'USER')).status === 403)
  check('인수인계서: 사용중 아닌 자산 발급 불가 (400)', (await get('/api/handover-sheet/AST-2024-000512', 'ASSET_MGR')).status === 400)
  // 자산 재배정(직접 인계) — 사용 중 자산의 보유자를 반납·재불출 왕복 없이 직접 변경. 대장 상세(사용중·자산담당)에 재배정 컨트롤 노출.
  const regInUse113 = await (await get('/assets/register?sel=AST-2023-000113', 'ASSET_MGR')).text()
  check('자산 대장: 사용중 상세에 재배정(직접 인계) 컨트롤', regInUse113.includes('자산 재배정 (직접 인계)'))
  // 수명주기 처리 대기열 — 대여중·수리중·분실이 '다음 처리 -'로 막다른 행이던 것을 처리 안내 + 처리 화면 딥링크로 라우팅. 종결(폐기완료)은 대기열에서 제외.
  const lifeHtml = await (await get('/assets/lifecycle', 'ASSET_MGR')).text()
  check('수명주기 대기열: 대여중 처리 안내 + 반납 화면 딥링크', lifeHtml.includes('반환 기한 관리') && lifeHtml.includes('/assets/returns'))
  check('수명주기 대기열: 수리중 처리 안내(막다른 행 제거)', lifeHtml.includes('수리 진행 관리'))
  check('수명주기 대기열: 종결(폐기완료) 자산 제외 (처리 대상 아님)', !lifeHtml.includes('AST-2018-000090'))
  // 대기열에 오는 상태는 하나도 빠짐없이 어느 단계엔가 속해야 한다 — 그전엔 수리중·분실이 어느 단계에도 없어,
  //  전체에는 보이는데 단계를 다 눌러 봐도 나오지 않았다(전체 13 · 단계 합 10). 단계 칩의 수를 합쳐 전체와 맞춘다.
  const lifePlain = lifeHtml.replace(/<!-- -->/g, '')
  const lifeNums = [...lifePlain.matchAll(/class="n">([0-9]+)</g)].map((m) => Number(m[1]))
  const lifeTotal = lifeNums[0] ?? -1
  const lifePhaseSum = lifeNums.slice(1).reduce((n, v) => n + v, 0)
  check('수명주기 단계: 전체 건수 = 단계별 건수 합(어느 단계에도 없는 행 금지)',
    lifeTotal > 0 && lifeTotal === lifePhaseSum, `전체 ${lifeTotal} · 단계 합 ${lifePhaseSum}`)
  // 수리중은 이제 운영·이동 단계로 도달한다(양성 대조 — 단계를 눌러 실제로 그 행이 나오는지).
  const lifeOperate = (await (await get('/assets/lifecycle?phase=operate', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '')
  check('수명주기 단계: 수리중 자산이 운영·이동 단계에서 열린다', lifeOperate.includes('수리 진행 관리'))

  // 수리중 자산 상세 — 수리 의뢰(업체·예상반환·반환 지연) 블록. 대여 블록과 대칭. 시드 AST-2024-000512(중부IT서비스, 예상반환 경과)로 검증
  const regRepairDetail = await (await get('/assets/register?sel=AST-2024-000512', 'ASSET_MGR')).text()
  check('자산 대장: 수리중 상세에 수리 의뢰(업체·반환 지연) 블록', regRepairDetail.includes('수리 의뢰') && regRepairDetail.includes('중부IT서비스') && regRepairDetail.includes('반환 지연'))
  // 보증 상태 칩 — 보증 만료 행에 보증 내/임박/만료 상태를 한눈에. AST-2024-000512(보증 2027)는 '보증 내'
  check('자산 대장: 상세 보증 만료 행에 보증 상태 칩(보증 내)', regRepairDetail.includes('보증 내'))
  // 자산 단위 수리 비용 이력(누계) — 시드 AST-2023-000112(키보드 95,000 + 배터리 148,000 = 누계 243,000원)로 검증. 계약 비용 이력과 대칭
  const regRepairCost = await (await get('/assets/register?sel=AST-2023-000112', 'ASSET_MGR')).text()
  // 누계 243,000원 = 키보드 95,000 + 배터리 148,000. React SSR 이 정적텍스트↔{식} 사이에 주석마커를 넣어 '누계 243,000원'이 연속 문자열이 아니므로 금액만 검사
  check('자산 대장: 상세에 수리 비용 이력·누계(자산 TCO)', regRepairCost.includes('수리 비용 이력') && regRepairCost.includes('243,000') && regRepairCost.includes('배터리 교체'))
  // 취득가 + TCO(취득+수리) — AST-2023-000112 취득가 1,680,000 + 수리 243,000 = TCO 1,923,000
  check('자산 대장: 상세에 취득가·TCO 표시', regRepairCost.includes('취득가') && regRepairCost.includes('1,680,000') && regRepairCost.includes('TCO(취득+수리)') && regRepairCost.includes('1,923,000'))
  // 잔존가치(정액법 감가상각) — AST-2023-000112(도입 2023-03, 상각 진행 중)엔 잔존가치·정액법 표기
  check('자산 대장: 상세에 잔존가치(정액법 감가상각)', regRepairCost.includes('잔존가치(장부가)') && regRepairCost.includes('정액법'))
  // 내용연수(5년) 초과 자산은 상각 완료(잔존가치 0) — AST-2020-000883(도입 2020-02) 로 결정적 검증
  const regOldDep = await (await get('/assets/register?sel=AST-2020-000883', 'ASSET_MGR')).text()
  check('자산 대장: 내용연수 초과 자산 상각 완료', regOldDep.includes('잔존가치(장부가)') && regOldDep.includes('상각 완료'))

  console.log('\n[핵심 화면 콘텐츠]')
  const dashHtml = await (await get('/dashboard', 'ASSET_MGR')).text()
  // 대시보드의 '미등록 신규 발견'은 아직 손대지 않은 건만 보여주는 처리 대기열이므로,
  // 확인요청·격리요청이 걸린 자산(DSC-2607-0041 등)은 여기서 빠지는 것이 정상이다
  check('대시보드: KPI·발견 자산·내 결재 차례·운영 대기 렌더', dashHtml.includes('미등록 신규 발견') && dashHtml.includes('DSC-2607-0042') && dashHtml.includes('내 결재 차례') && dashHtml.includes('운영 대기'))
  // 자산담당은 두 상세 카드(발견·계약/라이선스) 모두 노출 — 카드 본문 스코핑이 소실이 아니라 권한 스코핑임을 대조(만료 임박 카드 kicker 로 검증).
  check('대시보드(자산담당): 발견·만료 임박 상세 카드 모두 노출(스코핑 양성 대조)', dashHtml.includes('DSC-2607-0042') && dashHtml.includes('Contracts · Licenses'))
  // 대시보드 최근 공지 스코핑(유출 방지) — 부서 지정 공지(NTC-09 마케팅팀 전용)가 대상 밖 사용자(김민준·플랫폼개발팀) 랜딩 최근 공지에 제목이 유출되면 안 된다(게시판·전역 검색과 동일 스코핑). Admin 은 노출(스코핑이지 소실 아님 · 양성 대조).
  const dashUserHtml = await (await get('/dashboard', 'USER')).text()
  check('대시보드 최근 공지: 부서 지정 공지가 대상 밖 사용자에게 미노출(유출 방지)', !dashUserHtml.includes('ZZMKTGSCOPE'))
  const dashAdminHtml = await (await get('/dashboard', 'ADMIN')).text()
  check('대시보드 최근 공지: 부서 지정 공지가 Admin 에겐 노출(스코핑이지 소실 아님 · 양성 대조)', dashAdminHtml.includes('ZZMKTGSCOPE'))
  // '내 결재 차례'·결재함 배지는 실제로 결재함에서 처리할 수 있는 건만 세야 한다 — 소유자 확인은 결재(decide)가 아니라
  //  요청받은 부서의 응답(answerOwnerConfirm)이라 서버가 거부하고 결재함도 승인 버튼을 내주지 않는다.
  //  Admin 은 역할 오버라이드로 전부 통과하므로 시드의 대기 소유자 확인 2건(APR-2607-114·109)이 그대로 큐에 섞여 13건으로 보였다(→ 11).
  check('대시보드: 결재 큐가 소유자 확인(결재 아님)을 세지 않음 — 들어가도 처리 못 하는 건 제외', dashAdminHtml.includes('결재함 <!-- -->11<!-- --> →'))
  // 운영 대기 우선순위 — 큐가 화면마다 흩어져 20여 개로 늘어, 긴급(err)을 주의(warn)보다 위로 정렬하고 헤더에 긴급·주의 집계를 노출.
  check('대시보드: 운영 대기 긴급·주의 요약 헤더', dashHtml.includes('긴급 ') && dashHtml.includes('주의 '))
  // 긴급 우선 정렬 검증 — err 큐(라이선스 초과 사용)가 warn 큐(입고 검수 대기)보다 앞. 삽입 순서(입고가 먼저)와 반대여야 정렬이 동작.
  check('대시보드: 운영 큐 긴급(err) 우선 정렬', dashHtml.indexOf('라이선스 초과 사용') > 0 && dashHtml.indexOf('입고 검수 대기') > 0 && dashHtml.indexOf('라이선스 초과 사용') < dashHtml.indexOf('입고 검수 대기'))
  // 도입 예정 입고 지연 큐(§06 ITSM) — 납기 경과 발주 로트를 담당자 운영 큐로. 시드 SR-2607-041 지연분.
  check('대시보드: 도입 예정 입고 지연 큐 (자산담당)', dashHtml.includes('도입 예정 입고 지연') && dashHtml.includes('SR·발주 독촉'))
  // 전역 통합 검색 — 키보드 단축키 힌트(크롬 타이틀바, 전 화면)
  check('크롬: 통합 검색 키보드 단축키 힌트(Ctrl+K)', dashHtml.includes('통합 검색') && dashHtml.includes('Ctrl+K'))
  check('대시보드: 처리 착수한 발견 자산은 대기열에서 제외', !dashHtml.includes('DSC-2607-0041'))
  // 대여 반환 연체 — 시드에 기한 경과 대여 자산이 있어 자산담당 운영 대기 큐에 노출된다
  check('대시보드: 대여 반환 연체 운영 큐 노출 (자산담당)', dashHtml.includes('대여 반환 연체'))
  // 장기 미실측 — 시드 유령 후보 2건이 있어 자산담당 운영 큐에 재물조사 편성 대상으로 노출된다
  check('대시보드: 장기 미실측 운영 큐 노출 (자산담당)', dashHtml.includes('장기 미실측'))
  check('대시보드: 수리 예상 반환 경과 운영 큐 노출 (자산담당)', dashHtml.includes('수리 예상 반환 경과'))
  // 보증 만료 임박 자산 — 개별 자산 보증 만료를 대시보드 운영 큐에 surфacing (?warranty=soon 드릴)
  check('대시보드: 보증 만료 임박 자산 큐 + 드릴 링크', dashHtml.includes('보증 만료 임박 자산') && dashHtml.includes('warranty=soon'))
  // EOL OS 자산 큐 — OS 지원 종료 경과(시드 CentOS 7.9·Windows 10)를 자산담당 운영 큐에 노출, ?os=eol 드릴
  check('대시보드: EOL OS 자산 큐 + 드릴 링크 (자산담당)', dashHtml.includes('EOL OS 자산') && dashHtml.includes('os=eol'))
  // 안전재고 미달 큐 — 불출형 유형 가용 재고가 안전재고 미만이면 자산담당 운영 큐에 노출(발주 검토), 재고 화면 드릴
  check('대시보드: 안전재고 미달 발주 검토 큐 (자산담당)', dashHtml.includes('안전재고 미달') && dashHtml.includes('발주 검토') && dashHtml.includes('/inventory/stock'))
  // 라이선스 초과 사용(SAM 감사 최우선 노출) — 시드 LIC-002(JetBrains 120보유/131사용, 11석 초과)로 자산담당 운영 큐에 노출·계약 화면 드릴
  check('대시보드: 라이선스 초과 사용 감사 노출 큐 (자산담당)', dashHtml.includes('라이선스 초과 사용') && dashHtml.includes('감사 노출') && dashHtml.includes('/inventory/contracts'))
  // 라이선스 배정 밖 설치 — STEP2 대사(#47)의 무단 사용(좌석 없는 설치)을 SAM 리스크로 담당자 대시보드에 노출. 시드 2건(LIC-004·LIC-001).
  check('대시보드: 라이선스 배정 밖 설치(무단 사용·SAM) 큐 (자산담당)', dashHtml.includes('라이선스 배정 밖 설치') && dashHtml.includes('SAM 리스크'))
  // 미설치 좌석 — 배정 밖 설치(위험)의 반대편 회수 대상 낭비 좌석(비용 절감). STEP2 대사의 unusedSeat 를 담당자 대시보드에 노출. 시드 1건(LIC-004 112).
  check('대시보드: 라이선스 미설치 좌석(좌석 회수 후보·비용 절감) 큐 (자산담당)', dashHtml.includes('라이선스 미설치 좌석') && dashHtml.includes('좌석 회수 후보'))
  // 유지보수 예산 초과·소진 임박 — 계약 집행률 판정(§03 유지보수 비용 관리)을 담당자 일과 시작점으로. 시드 CT-2022-007(누계 4,980만/계약 4,800만 → 예산 초과)로 큐 노출·계약 화면 드릴.
  check('대시보드: 유지보수 예산 초과·소진 임박 큐 (자산담당)', dashHtml.includes('유지보수 예산 초과·소진 임박') && dashHtml.includes('재협상·집행 점검'))
  // 구매 계약 발주 미이행 — 발주율 저조 + 만료 임박 계약을 담당자 일과 시작점으로. 시드 CT-2023-021(발주 7%·만료 임박)로 큐 노출.
  check('대시보드: 구매 계약 발주 미이행 큐 (자산담당)', dashHtml.includes('구매 계약 발주 미이행') && dashHtml.includes('이행 점검'))
  // 정례 리포트 배포 기한 경과(§05 리포트 자동화) — 가동 스케줄 예약 실행일 경과·미배포를 운영 큐로. 시드 스케줄러 밀림분.
  check('대시보드: 정례 리포트 배포 기한 경과 큐 (자산담당)', dashHtml.includes('정례 리포트 배포 기한 경과') && dashHtml.includes('자동 생성 밀림'))
  // 라이선스 만료 경과 — 시드 LIC-002(JetBrains, 만료 2026-05-31 · 기준일 2026-07-29 경과)가 미갱신 만료로 위반 노출. 만료 임박 창에서 이미 지난 건.
  check('대시보드: 라이선스 만료 경과 갱신 필요 큐 (자산담당)', dashHtml.includes('라이선스 만료 경과') && dashHtml.includes('갱신 필요'))
  // 미사용 라이선스 회수 후보 — 시드 LIC-003(Adobe 55%)·LIC-004(AutoCAD 40%) 사용률 60% 미만. 리스크(초과·만료)의 반대편 = 비용 절감 신호를 일과 시작점에 노출.
  check('대시보드: 미사용 라이선스 회수 후보 큐 (비용 절감 · 자산담당)', dashHtml.includes('미사용 라이선스 회수 후보') && dashHtml.includes('비용 절감'))
  // 교체 대상 자산 — 내용연수 초과·보증 경과·장애 이력. 보증 '임박'(미래)과 달리 이미 교체 시점이 도래한 계획 신호를 일과 시작점에 노출(수명예측 패널과 동일 근거).
  check('대시보드: 교체 대상 자산 큐 (내용연수·보증 경과·장애 이력 · 자산담당)', dashHtml.includes('교체 대상 자산') && dashHtml.includes('내용연수·보증 경과·장애 이력'))
  // 수령 미확인 — 불출 후 사용자 인수 확인이 안 된 자산(체인 오브 커스터디 공백)을 자산담당 일과 시작점에 노출
  check('대시보드: 수령 미확인 큐 (불출 후 인수 대기 · 자산담당)', dashHtml.includes('수령 미확인') && dashHtml.includes('불출 후 인수 대기'))
  // 정기 점검 대상 — 예방 정비 예정일 도래 자산을 자산담당 큐에 노출(반응형 수리와 별개의 사전 정비)
  check('대시보드: 정기 점검 대상 큐 (예방 정비 도래 · 자산담당)', dashHtml.includes('정기 점검 대상') && dashHtml.includes('예방 정비 도래'))
  // 영향 집중 자산(CMDB blast radius) 큐 — 장애 시 2대 이상 영향받는 단일 장애점(시드 스위치 640·방화벽 641). 이중화·우선 정비 근거.
  check('대시보드: 영향 집중 자산(blast radius ≥2 단일 장애점) 큐 (자산담당)', dashHtml.includes('영향 집중 자산') && dashHtml.includes('blast radius'))
  // 영향 집중 큐는 첫 자산(?sel=)만 열던 것을 전체 SPOF 목록(?spof=1)으로 드릴다운 — 큐 건수 N 과 목록이 일치.
  check('대시보드: 영향 집중 자산 큐가 단일 장애점 목록(?spof=1)으로 드릴다운', dashHtml.includes('/assets/register?spof=1'))
  // 복합 위험 자산 큐 — 정합성·EOL·보증·점검·SPOF·교체·미실측 중 2+ 겹치는 다중 이슈 자산을 사전에 드러내고 ?risk=1 로 드릴다운(개별 신호 큐가 놓치는 '한 자산에 문제 몰림'). 대장 필터·도시어 요약과 lib/risk 단일 소스.
  check('대시보드: 복합 위험 자산(≥2 신호) 큐 + ?risk=1 드릴다운 (자산담당)', dashHtml.includes('복합 위험 자산') && dashHtml.includes('/assets/register?risk=1'))
  // 다가오는 일정 아젠다(사전 계획) — 반응형 큐(카운트)와 별개로, 향후 14일 예정 작업을 날짜순 아젠다로. 정례 리포트 배포는 주간 주기라 항상 창 이내(D-day 표기).
  check('대시보드(자산담당): 다가오는 일정 아젠다 카드(정례 리포트 배포 예정 포함)', dashHtml.includes('다가오는 일정') && dashHtml.includes('리포트 배포') && dashHtml.includes('D-'))
  // 수령 미확인 큐도 전체 대장으로 떨어지던 것을 ?receipt=1 로 드릴다운 — 큐 건수=목록(체인 오브 커스터디 추적).
  check('대시보드: 수령 미확인 큐가 인수 미확인 목록(?receipt=1)으로 드릴다운', dashHtml.includes('/assets/register?receipt=1'))
  // 대장 정합성 미흡 운영 큐 — 시드 필드 누락 자산 2건으로 자산담당 대시보드에 CMDB 스튜어드십 신호가 뜬다
  check('대시보드: 대장 정합성 미흡 운영 큐 (자산담당) + dq 드릴', dashHtml.includes('대장 정합성 미흡') && dashHtml.includes('dq=1'))
  // 결재 지연 — SLA 초과 대기 결재가 결재 대기 KPI 델타에 노출된다(정체 신호)
  check('대시보드: 결재 지연(SLA 초과) KPI 신호', dashHtml.includes('SLA') && dashHtml.includes('초과'))
  // 대여자 관점 — 목업 사용자(김민준)가 대여 중인 자산(AST-2024-000230)의 반환 기한이 My Work 에 노출된다
  const dashUser = await (await get('/dashboard', 'USER')).text()
  check('대시보드(사용자): 내 대여 자산 반환 기한 노출', dashUser.includes('내 대여 자산') && dashUser.includes('AST-2024-000230') && dashUser.includes('까지'))
  // 운영 큐(라이선스 초과 사용 등)는 담당자 전용 — 사용자에겐 미노출
  check('대시보드(사용자): 라이선스 초과 사용 큐 미노출 (운영 큐 담당자 전용)', !dashUser.includes('라이선스 초과 사용'))
  // KPI 드릴다운 권한 게이트 — 만료 임박 KPI 는 계약·라이선스 화면(자산담당·Admin)으로 이어지므로 USER 엔 링크를 주지 않는다(접근 불가 화면 dead-end 링크 방지).
  check('대시보드(사용자): 계약·라이선스 화면 드릴다운 링크 없음 (접근 밖·dead-end 방지)', !dashUser.includes('/inventory/contracts'))
  // 대시보드 카드 본문 역할 스코핑(유출 방지 · #4107 5차 깊이감사) — tile href·action 은 게이트됐으나 카드 '본문'이 게이트를 빠뜨려
  //  USER 에 Shadow IT 발견 상세(호스트·위험도)·계약/라이선스 상세(명·만료일)가 유출되던 것을 닫음. USER 는 상단 요약 카운트만, 상세는 미노출(discovery/found·contracts requireRole 과 정합).
  check('대시보드(사용자): 미등록 발견(Shadow IT) 상세 카드 본문 미노출(DSC 유출 방지)', !dashUser.includes('DSC-2607-0042'))
  check('대시보드(사용자): 만료 임박(계약·라이선스) 상세 카드 본문 미노출', !dashUser.includes('Contracts · Licenses'))
  // 미확인 필독 공지 넛지 — 사용자가 로그인 시 미확인 필독 공지를 스스로 챙기게 한다(관리자 독촉·명단의 사용자 측 짝). NTC-01(필독, 0 acks)로 검증.
  check('대시보드(사용자): 미확인 필독 공지 넛지 + 특정 공지 딥링크', dashUser.includes('미확인 필독 공지') && dashUser.includes('2026 하반기 재물조사') && dashUser.includes('/board/notices?sel=NTC-01'))
  // 최근 공지 위젯(Main/Home 공지 요약) — 필독 넛지와 별개로, 발행된 공지를 최신순으로 상시 노출(전 권한). NTC-02(비고정) 등 일반 공지도 포함.
  check('대시보드: 최근 공지 위젯 + 게시판 연결', dashUser.includes('최근 공지') && dashUser.includes('미인가 SaaS') && dashUser.includes('href="/board/notices"'))
  // QnA 대시보드 카드 — 공지는 최근 공지 위젯이 담당하므로 이 카드는 QnA 만(중복 제거). 사용자는 본인 문의 답변 현황(로7 작성자 측), 담당자는 답변 대기.
  check('대시보드(사용자): 내 QnA 답변 현황 + 답변 딥링크(QNA-03)', dashUser.includes('내 문의') && dashUser.includes('답변 완료') && dashUser.includes('JetBrains') && dashUser.includes('/board/qna?sel=QNA-03'))
  check('대시보드(담당자): QnA 답변 대기 카드 노출 (사용자 문의)', dashHtml.includes('사용자 문의') && dashHtml.includes('답변 대기'))
  // QnA 미답변 SLA 경과 — 담당자 대시보드에 지연 미답변(답변 독촉) 신호. 결재 SLA 지연의 QnA 판.
  check('대시보드(담당자): QnA 미답변 SLA 경과 지연 신호', dashHtml.includes('SLA 경과') && dashHtml.includes('미답변 지연'))
  // 우리 부서 소유자 확인 요청 넛지 — 김민준(플랫폼개발팀) 앞으로 온 APR-2607-114 응답 대기. 결재 딥링크(v1.143)
  check('대시보드(사용자): 우리 부서 소유자 확인 요청 넛지 + 결재 딥링크', dashUser.includes('소유자 확인 요청 — 응답 필요') && dashUser.includes('DSC-2607-0041') && dashUser.includes('/workflow/approvals?sel=APR-2607-114'))
  // 반려된 내 신청 재상신 넛지 — 김민준의 반려 건(APR-2607-096, 아직 미재상신)이 사유와 함께 노출·딥링크
  check('대시보드(사용자): 반려된 내 신청 재상신 넛지 + 사유·딥링크', dashUser.includes('반려된 내 신청 — 재상신 검토') && dashUser.includes('/workflow/approvals?sel=APR-2607-096') && dashUser.includes('부서 예산 승인 후'))
  // 수령 확인 대기 넛지 — 불출 배정 후 인수 미확인 본인 자산(시드 AST-2024-000015)이 대시보드에 노출·상세 딥링크(로54 수령 확인 루프의 사용자 능동 접점)
  check('대시보드(사용자): 수령 확인 대기 넛지 + 상세 딥링크', dashUser.includes('수령 확인 대기 — 인수 확인 필요') && dashUser.includes('/assets/register?sel=AST-2024-000015'))
  // 다른 부서(자산관리팀=박자산)에는 해당 요청 넛지가 뜨지 않는다 (부서 스코프)
  check('대시보드: 타 부서엔 소유자 확인 넛지 미노출 (부서 스코프)', !dashHtml.includes('소유자 확인 요청 — 응답 필요'))
  // 최근 활동 위젯 — 감사 로그 접근 권한(비사용자)에만 노출
  check('대시보드: 최근 활동 위젯(자산담당) + 감사 로그 링크', dashHtml.includes('최근 활동') && dashHtml.includes('/platform/integrations'))
  check('대시보드: 사용자에겐 최근 활동 위젯 미노출', !dashUser.includes('최근 활동'))
  // 수집 커넥터 지연·오류 운영 큐 — 시드 프록시 커넥터(지연)로 보안담당 대시보드에 Discovery 저하 신호가 뜬다
  const dashSec = await (await get('/dashboard', 'SEC_MGR')).text()
  check('대시보드(보안담당): 수집 커넥터 지연·오류 운영 큐 노출', dashSec.includes('수집 커넥터 지연·오류') && dashSec.includes('Discovery 저하'))
  // 카드 본문 스코핑 양성/음성 대조 — 보안담당은 발견(미등록) 카드는 보되(Discovery 권한), 만료 임박(계약·라이선스) 상세는 미노출(계약 접근 밖 — 본문 게이트 누락 시 보안담당에도 유출됐음).
  check('대시보드(보안담당): 미등록 발견 카드는 노출(Discovery 권한) · 만료 임박 상세는 미노출(계약 접근 밖)', dashSec.includes('DSC-2607-0042') && !dashSec.includes('Contracts · Licenses'))
  // 외부 공격표면 재탐지 기한 경과(§04 재탐지 자동 반복) — 도메인 주기 경과·미실행이면 노출 관측 사각. 시드 3개 도메인 재탐지 기한 경과.
  check('대시보드(보안담당): 외부 공격표면 재탐지 기한 경과 큐 노출', dashSec.includes('외부 공격표면 재탐지 기한 경과') && dashSec.includes('Discovery 사각'))
  // 알림 전달 실패 큐(§06 발송 신뢰성) — 미도달 통지(시드 MSG-4004)를 대시보드에서 선제 노출, 클릭 시 발송 이력에서 재발송. 통합 화면 안 열어도 놓치지 않게.
  check('대시보드(보안담당): 알림 전달 실패 큐 → 발송 이력 드릴다운', dashSec.includes('알림 전달 실패') && dashSec.includes('/platform/integrations'))
  // 다가오는 일정 카드는 계약·라이선스 링크를 담아 자산담당·Admin 전용 — 보안담당엔 미노출(접근 밖 dead-end 방지)
  check('대시보드(보안담당): 다가오는 일정 카드 미노출 (계약·라이선스 접근 밖)', !dashSec.includes('다가오는 일정'))
  check('대시보드(자산담당): 재탐지 기한 경과 큐 미노출 (보안 운영 큐)', !dashHtml.includes('외부 공격표면 재탐지 기한 경과'))
  // 내부 수집 채널 재탐지 주기 경과 — EASM 재탐지 지연과 동형의 Discovery 사각 신호. 보안 운영 큐(자산담당 미노출).
  check('대시보드(보안담당): 탐지 채널 재탐지 주기 경과 큐 노출', dashSec.includes('탐지 채널 재탐지 주기 경과') && dashSec.includes('수집 지연'))
  check('대시보드(자산담당): 탐지 채널 재탐지 주기 경과 큐 미노출 (보안 운영 큐)', !dashHtml.includes('탐지 채널 재탐지 주기 경과'))
  check('대시보드(자산담당): 수집 커넥터 큐 미노출 (보안 운영 큐)', !dashHtml.includes('수집 커넥터 지연·오류'))
  // 크리덴셜 노출 미조치 — loop45. 유출·외부 노출과 나란히 보안담당 운영 큐에 노출된다(자산담당엔 미노출)
  check('대시보드(보안담당): 크리덴셜 노출 미조치 운영 큐 노출', dashSec.includes('크리덴셜 노출 미조치'))
  check('대시보드(자산담당): 크리덴셜 노출 큐 미노출 (보안 운영 큐)', !dashHtml.includes('크리덴셜 노출 미조치'))
  // IOC 상관 미조치 — loop50. 위협 인텔 IOC 침해 징후도 보안담당 운영 큐에 노출(자산담당엔 미노출)
  check('대시보드(보안담당): IOC 상관 미조치 운영 큐 노출', dashSec.includes('IOC 상관 미조치'))
  check('대시보드(자산담당): IOC 큐 미노출 (보안 운영 큐)', !dashHtml.includes('IOC 상관 미조치'))
  // 휴면 계정 미처리 — loop46. 계정 위생도 보안담당 운영 큐에 노출(자산담당엔 미노출)
  check('대시보드(보안담당): 휴면 계정 미처리 운영 큐 노출', dashSec.includes('휴면 계정 미처리'))
  check('대시보드(자산담당): 휴면 계정 큐 미노출 (보안 운영 큐)', !dashHtml.includes('휴면 계정 미처리'))
  // 소유자 확인 미응답 — 기한(7일) 경과 확인요청은 격리 에스컬레이션 대상(시드 DSC-2607-0038, 9일 경과). 보안 운영 큐
  check('대시보드(보안담당): 소유자 확인 미응답 격리 에스컬레이션 큐 노출', dashSec.includes('소유자 확인 미응답') && dashSec.includes('격리 에스컬레이션'))
  check('대시보드(자산담당): 소유자 확인 미응답 큐 미노출 (보안 운영 큐)', !dashHtml.includes('소유자 확인 미응답'))
  // 미인가 SW 미조치 — loop47. EDR 설치 SW 정책 위반도 보안담당 운영 큐에 노출(자산담당엔 미노출)
  check('대시보드(보안담당): 미인가 SW 미조치 운영 큐 노출', dashSec.includes('미인가 SW 미조치'))
  check('대시보드(자산담당): 미인가 SW 큐 미노출 (보안 운영 큐)', !dashHtml.includes('미인가 SW 미조치'))
  // 미판정 SaaS — 카탈로그 검토중(Notion·ChatGPT·Miro)은 보안담당 Shadow IT 판정 대기 백로그. 보안 운영 큐(자산담당엔 미노출)
  check('대시보드(보안담당): 미판정 SaaS 판정 대기 운영 큐 노출', dashSec.includes('미판정 SaaS') && dashSec.includes('카탈로그 검토중'))
  // 판정 기한 경과 에스컬레이션 — 검토중 SLA 초과분(소유자 확인 미응답과 동형)을 별도 err 큐로 노출. 방치 방지.
  check('대시보드(보안담당): 미판정 SaaS 판정 기한 경과 에스컬레이션 큐 노출', dashSec.includes('미판정 SaaS 판정 기한 경과') && dashSec.includes('에스컬레이션'))
  check('대시보드(자산담당): 미판정 SaaS 큐 미노출 (보안 운영 큐)', !dashHtml.includes('미판정 SaaS'))
  // 필독 공지 확인 미달(§07 정책 전파·확인) — Admin 전용 컴플라이언스 큐. 시드 NTC-01(필독, 미확인 6명)로 노출. 공지 등록·독촉은 Admin 책무.
  const dashAdmin = await (await get('/dashboard', 'ADMIN')).text()
  check('대시보드(Admin): 필독 공지 확인 미달 컴플라이언스 큐 노출', dashAdmin.includes('필독 공지 확인 미달') && dashAdmin.includes('정책 전파 증적'))
  check('대시보드(자산담당): 필독 공지 확인 미달 큐 미노출 (Admin 전용)', !dashHtml.includes('필독 공지 확인 미달'))
  // USB 정책 위반 미조치 — loop48. EDR 이동식 매체 DLP 도 보안담당 운영 큐에 노출(자산담당엔 미노출)
  check('대시보드(보안담당): USB 정책 위반 미조치 운영 큐 노출', dashSec.includes('USB 정책 위반 미조치'))
  check('대시보드(자산담당): USB 큐 미노출 (보안 운영 큐)', !dashHtml.includes('USB 정책 위반 미조치'))
  // 로컬 VM 위반 미조치 — loop49. EDR 로컬 가상머신도 보안담당 운영 큐에 노출(자산담당엔 미노출)
  check('대시보드(보안담당): 로컬 VM 위반 미조치 운영 큐 노출', dashSec.includes('로컬 VM 위반 미조치'))
  check('대시보드(자산담당): 로컬 VM 큐 미노출 (보안 운영 큐)', !dashHtml.includes('로컬 VM 위반 미조치'))
  // 유출·침해 미조치 — 시드 유출 4건(status 미설정=미조치)이 보안담당 운영 큐에 노출돼야 한다(과거 status==='미조치' 비교로 0 처리되던 회귀 방지)
  check('대시보드(보안담당): 유출·침해 미조치 운영 큐 노출', dashSec.includes('유출 · 침해 미조치'))
  // 취약점 우선순위 P1 — 스코어링(§05)의 즉시 조치 등급을 보안담당 운영 큐에 노출 (자산담당엔 미노출)
  check('대시보드(보안담당): 취약점 우선순위 P1 운영 큐 노출', dashSec.includes('취약점 우선순위 P1 (즉시 조치)'))
  check('대시보드(자산담당): 취약점 P1 큐 미노출 (보안 운영 큐)', !dashHtml.includes('취약점 우선순위 P1'))
  // 교체 대상·미사용 라이선스 회수는 자산관리 계획 큐(자산담당·Admin) — 보안담당 운영 큐에는 미노출(라이선스·교체 예산은 SAM/자산 소관)
  check('대시보드(보안담당): 교체 대상·미사용 라이선스 회수 큐 미노출 (자산관리 계획 큐)', !dashSec.includes('교체 대상 자산') && !dashSec.includes('미사용 라이선스 회수 후보'))
  const foundHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 6채널·대사 상태·일괄 편입 렌더', foundHtml.includes('네트워크 능동 스캔') && foundHtml.includes('등록·불일치') && foundHtml.includes('선택 일괄 편입 요청'))
  // 위험도 높은 순 정렬(제품안내서 §04 위험도 분류 → 우선 처리) — 시드는 위험도순이 아니라(낮음 DSC-2607-0027 이 높음 DSC-2607-0018 보다 앞), 정렬 후엔 높음이 먼저 렌더된다. 첫 등장(렌더 행)으로 순서 검증.
  check('발견 자산: 위험도 높은 순 정렬(높음이 낮음보다 먼저)', foundHtml.includes('DSC-2607-0018') && foundHtml.includes('DSC-2607-0027') && foundHtml.indexOf('DSC-2607-0018') < foundHtml.indexOf('DSC-2607-0027'))
  // 발견 자산 상세 딥링크(?sel=) — 전역 검색·CMDB 대사에서 특정 자산 상세로 바로 진입. 위치 불일치(DSC-2607-0029)는 실측값이 구조화돼 있어 대사 확인이 곧 대장 보정(자동 반영) — 실측값 안내·보정 버튼이 노출된다(로67).
  const foundSelHtml = await (await get('/discovery/found?sel=DSC-2607-0029', 'ASSET_MGR')).text()
  check('발견 자산: ?sel= 딥링크로 상세 오픈 + 등록·불일치 실측 보정 액션 노출', foundSelHtml.includes('위치 상이') && foundSelHtml.includes('대사 확인 — 실측 보정·종결') && foundSelHtml.includes('부산 지사 3F'))
  // 관리 제외 — 관리 대상이 아닌 알려진 비자산(협력사 장비·게스트 단말·비관리 어플라이언스)을 편입/격리 아닌 판정으로 미등록 갭에서 빼는 컨트롤(미등록·미처리 상세).
  const foundDismissHtml = await (await get('/discovery/found?sel=DSC-2607-0046', 'SEC_MGR')).text()
  check('발견 자산: 미등록 상세에 관리 제외(비자산 판정) 컨트롤', foundDismissHtml.includes('관리 제외') && foundDismissHtml.includes('비관리 어플라이언스'))
  // 서버·IDC망(10.10.x)에 나타난 미등록 단말 — 서버 VLAN 침입 의심 (어시스턴트 발견 인텐트가 세그먼트로 식별)
  check('발견 자산: 서버 대역 미등록 단말(DESKTOP-UNK09) 노출', foundHtml.includes('DESKTOP-UNK09') && foundHtml.includes('10.10.8.77'))
  // AI 자동분류 — 관측 유형을 표준 자산 유형으로 매핑하는 컬럼(§05 수기 분류 제거). 'OAuth 앱'→SW 는 관측 유형·노트 어디에도 'SW'가 없어 분류가 실제 동작함을 증명한다(기존 로직은 SW 미지원으로 단말로 오분류).
  check('발견 자산: AI 자동분류 컬럼 + OAuth 앱→SW 매핑 렌더', foundHtml.includes('자동분류') && foundHtml.includes('OAuth 앱') && foundHtml.includes('SW'))
  // 발견 자산 트리아지 필터 — 대사 상태·위험도·검색(채널 필터에 더해)
  check('발견 자산: 대사 상태·위험도·검색 필터 렌더', foundHtml.includes('대사 상태 — 전체') && foundHtml.includes('위험도 — 전체') && foundHtml.includes('호스트명·IP·MAC·발견ID 검색'))
  // 발견 자산 반출이 화면 필터(대사상태·위험도)를 반영 — 필터 없이는 전체, 미등록+높음이면 rogue 포함·등록불일치 제외
  check('발견 자산: 필터 반영 엑셀 버튼(FoundView 내부)', foundHtml.includes('/api/export/discovered') && foundHtml.includes('발견 자산 엑셀'))
  const discFilt = await (await get('/api/export/discovered?state=' + encodeURIComponent('미등록') + '&risk=' + encodeURIComponent('높음'), 'SEC_MGR'))
  const discFiltTxt = Buffer.from(await discFilt.arrayBuffer()).toString('utf8')
  check('발견 자산: 반출이 대사상태·위험도 필터 반영 (미등록·높음만)', discFilt.status === 200 && discFiltTxt.includes('DSC-2607-0046') && !discFiltTxt.includes('DSC-2607-0029'))
  // 발견 자산 엑셀은 CMDB 대사 표 하나만 담고 있었다 — 같은 화면에서 판정한 다섯 조치 표(계정 위생·미인가 SW·
  //  USB·로컬 VM·클라우드 거버넌스)가 감사 제출본에서 통째로 빠져, 화면에서 내린 판정이 문서로 남지 않았다.
  const discXlsx = Buffer.from(await (await get('/api/export/discovered', 'SEC_MGR')).arrayBuffer()).toString('utf8')
  const discSheets = ['계정 위생 — 휴면 계정', '미인가 SW', 'USB 정책 위반', '로컬 VM 위반', '미관리 클라우드 리소스']
  check('발견 자산 엑셀: 다섯 조치 표 시트 반출 (감사 제출본)',
    discSheets.every((n) => discXlsx.includes(n)), `누락=${discSheets.filter((n) => !discXlsx.includes(n)).join(', ')}`)
  // 시트 이름만이 아니라 판정 자체가 실려야 한다 — 검출 행과 조치 상태(미조치 포함)·정책 근거를 확인한다.
  check('발견 자산 엑셀: 조치 표의 검출 행·조치 상태 반출',
    discXlsx.includes('svc-legacy-batch') && discXlsx.includes('USB-01') && discXlsx.includes('LVM-02') && discXlsx.includes('CLD-2607-02') && discXlsx.includes('미조치'))
  check('발견 자산 엑셀: 유형별 정책 근거 반출 (판정 사유가 문서에 남는다)',
    discXlsx.includes('지원 종료·미패치 게스트 OS') && discXlsx.includes('개인 액세스키'))
  // 다섯 표는 화면에서도 대사상태·위험도 필터를 받지 않는다 — 필터를 걸어도 그대로 실려야 화면과 일치한다.
  check('발견 자산 엑셀: 대사 필터를 걸어도 조치 표는 전량 반출(화면과 같은 범위)',
    discFiltTxt.includes('USB-01') && discFiltTxt.includes('CLD-2607-04'))
  // 휴면 계정(loop46) — 채널 06(AD/IdP·SSO) 계정 위생. 검출에서 끝내지 않고 보안담당이 비활성화·소유자 확인으로 조치.
  check('발견 자산: 휴면 계정 계정 위생 카드 렌더', foundHtml.includes('휴면 계정') && foundHtml.includes('svc-legacy-batch') && foundHtml.includes('계정 위생'))
  check('발견 자산: 보안담당에 휴면 계정 조치(비활성화·소유자 확인) 노출', foundHtml.includes('비활성화') && foundHtml.includes('소유자 확인'))
  const foundAsset = await (await get('/discovery/found', 'ASSET_MGR')).text()
  check('발견 자산: 자산담당엔 휴면 계정 조치 버튼 미노출 (조회만)', foundAsset.includes('휴면 계정') && !foundAsset.includes('비활성화</button>'))
  // 미인가 SW(loop47) — 채널 04(EDR) 설치 SW 정책 위반. 설치 자산에 연결, 보안담당이 제거 요청·예외 승인으로 조치.
  check('발견 자산: 미인가 SW 정책 위반 카드 렌더', foundHtml.includes('미인가 SW') && foundHtml.includes('uTorrent') && foundHtml.includes('AST-2025-000512'))
  check('발견 자산: 보안담당에 미인가 SW 조치(제거 요청·예외 승인) 노출', foundHtml.includes('제거 요청') && foundHtml.includes('예외 승인'))
  check('발견 자산: 자산담당엔 미인가 SW 조치 버튼 미노출 (조회만)', foundAsset.includes('미인가 SW') && !foundAsset.includes('제거 요청</button>'))
  // SW 예외 승인 목록(화이트리스트) — 미인가 SW 정책의 허용 축(§01 보안담당: 미인가 SW 정책 관리). 시드 Zoom·TeamViewer 등재.
  check('발견 자산: SW 화이트리스트 렌더 (예외 승인 재사용 정책)', foundHtml.includes('SW 예외 승인 목록') && foundHtml.includes('Zoom') && foundHtml.includes('업무 허용'))
  check('발견 자산: 보안담당에 화이트리스트 해제 노출', foundHtml.includes('SW 예외 승인 목록') && foundHtml.includes('해제</button>'))
  check('발견 자산: 자산담당엔 화이트리스트 해제 미노출 (조회만)', foundAsset.includes('SW 예외 승인 목록') && !foundAsset.includes('해제</button>'))
  // USB 저장매체(loop48) — 채널 04(EDR) 이동식 매체 DLP. 검출에서 끝내지 않고 보안담당이 차단·예외 승인으로 조치.
  check('발견 자산: USB 저장매체 정책 위반 카드 렌더', foundHtml.includes('USB 저장매체') && foundHtml.includes('Samsung T7 SSD') && foundHtml.includes('이동식 매체'))
  check('발견 자산: 보안담당에 USB 조치(차단·예외 승인) 노출', foundHtml.includes('대용량 반출 의심') && foundHtml.includes('예외 승인'))
  check('발견 자산: 자산담당엔 USB 조치 버튼 미노출 (조회만)', foundAsset.includes('USB 저장매체') && !foundAsset.includes('차단</button>'))
  // 로컬 VM(loop49) — 채널 04(EDR) 로컬 가상머신. EDR 채널 3종 산출(설치SW·USB·로컬VM) 완결. 보안담당이 회수·예외 승인으로 조치.
  check('발견 자산: 로컬 가상머신 정책 위반 카드 렌더', foundHtml.includes('로컬 가상머신') && foundHtml.includes('VirtualBox · legacy-test') && foundHtml.includes('엔드포인트 VM'))
  check('발견 자산: 보안담당에 로컬 VM 조치(회수·예외 승인) 노출', foundHtml.includes('EOL·미패치 게스트') && foundHtml.includes('예외 승인'))
  check('발견 자산: 자산담당엔 로컬 VM 조치 버튼 미노출 (조회만)', foundAsset.includes('로컬 가상머신') && !foundAsset.includes('회수</button>'))
  // 엔드포인트·계정·클라우드 위생 요약 스탯 — 5종(휴면계정·SW·USB·VM·클라우드)을 한 지표로 합산 요약(스탯 로우 과밀 해소), 상세는 각 카드
  check('발견 자산: 엔드포인트·계정·클라우드 위생 요약 스탯 렌더', foundHtml.includes('엔드포인트·계정·클라우드 위생 — 미조치') && foundHtml.includes('병렬 수집 채널'))
  const contractsHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약·라이선스: 보유–사용 대사·등록(계약·라이선스) 렌더', contractsHtml.includes('JetBrains') && contractsHtml.includes('초과 사용') && contractsHtml.includes('라이선스 등록') && contractsHtml.includes('계약 등록'))
  // 라이선스 STEP2 사용 수집(§03) — EDR 설치 SW 인벤토리를 배정 좌석과 대사. 그동안 표시 전용이던 STEP2를 실동작으로.
  //  LIC-004: 좌석 2(871·112) vs 설치 2(871·432) → AST-2021-000432 배정 밖 설치, AST-2023-000112 미설치 좌석.
  check('라이선스 STEP2: 사용 수집(EDR 설치 SW 대사) 패널 렌더', contractsHtml.includes('사용 수집 — EDR 설치 SW 인벤토리 대사') && contractsHtml.includes('배정 밖 설치 — 무단 사용') && contractsHtml.includes('미설치 좌석 — 회수 후보'))
  check('라이선스 STEP2: 배정 밖 설치 대사 실측(무단 사용 자산)', contractsHtml.includes('AST-2021-000432') && contractsHtml.includes('배정 밖 설치 (무단 사용)'))
  // SAM 좌석 대사 인라인 처리 — STEP2 검출 좌석 불일치를 화면 이탈 없이 좌석 배정(무단 사용 합법화)/좌석 회수(여유석 확보)로 처리. '좌석 회수'는 이 셀 고유.
  check('라이선스 STEP2: 좌석 불일치 인라인 처리 액션(좌석 배정·회수)', contractsHtml.includes('좌석 배정') && contractsHtml.includes('좌석 회수'))
  // 유지보수 계약 관리(§03) — 비용 이력이 '누계'만 보이던 것을 계약액 대비 집행률·잔여·판정 + SLA 요약으로 완성.
  //  CT-2022-007: 계약액 4,800만 · 누계 지출 4,980만(1~3Q+긴급) → 예산 초과. CT-2024-011: 비용 이력 없음 → 미집행. SLA 요약 노출.
  check('유지보수 계약: 예산 집행 현황 패널 렌더(집행률·판정)', contractsHtml.includes('유지보수 계약 관리 — 예산 집행 · SLA') && contractsHtml.includes('전체 집행률') && contractsHtml.includes('누계 지출'))
  check('유지보수 계약: 예산 집행 실측(SLA 요약·미집행 판정)', contractsHtml.includes('장애 접수 후 4시간 내 온사이트 대응') && contractsHtml.includes('미집행'))
  // 유지보수 예산 통보 버튼 — 집행률 판정 신호에 조치 채널을 붙인다(재협상·집행 점검을 주관부서·공급사에 통보). 시드 CT-2022-007 예산 초과 → 배지 ≥1.
  check('유지보수 계약: 예산 재협상·집행 점검 통보 버튼(신호→조치 채널)', contractsHtml.includes('예산 재협상·집행 점검 통보'))
  // 구매 계약 발주·검수 이행(§03 구매 계약 검수 연계) — 입고 로트를 계약과 대사해 발주 소진률·검수 완료액·미이행 위험 산출.
  //  CT-2023-021(IDC 서버 384만): 발주 25.6M(7%)·만료 임박 → 발주 미이행 위험. CT-2026-009: 발주 95% → 정상.
  check('구매 계약: 발주·검수 이행 현황 패널 렌더', contractsHtml.includes('구매 계약 발주·검수 이행 현황') && contractsHtml.includes('전체 발주 소진률') && contractsHtml.includes('검수 완료액 (정산 근거)'))
  check('구매 계약: 발주 미이행 위험 판정(만료 임박·발주 저조)', contractsHtml.includes('IDC-A 서버 증설') && contractsHtml.includes('미이행 위험'))
  // 발주 이행 독촉 버튼 — 발주 미이행 위험 판정에 조치 채널을 붙인다(주관부서·공급사·구매팀에 만료 전 이행 요청). 시드 CT-2023-021 미이행 → 배지 ≥1.
  check('구매 계약: 발주 이행 독촉 버튼(신호→조치 채널)', contractsHtml.includes('발주 이행 독촉'))
  // 만료 경과 라이선스 판정 — LIC-002(JetBrains, 만료일 지남)는 초과 사용과 별개로 '만료' 칩으로 갱신 필요를 명시
  check('계약·라이선스: 만료 경과 라이선스 판정 칩(JetBrains)', contractsHtml.includes('>만료<') && contractsHtml.includes('2026-05-31'))
  // 계약 목록 필터 — 구분·상태·만료 임박·검색
  check('계약: 목록 필터(구분·상태·검색) 렌더', contractsHtml.includes('상태 — 전체') && contractsHtml.includes('계약번호·계약명·공급사·부서 검색') && contractsHtml.includes('유지보수'))
  // 부속서류 — 계약 근거 문서(계약서·견적서·세금계산서) 관리 (제품안내서 §03 구매 계약). 문서 상세는 토글 확장이라 SSR엔 컬럼·📎버튼만
  check('계약: 부속서류 컬럼 + 문서 토글 버튼 렌더', contractsHtml.includes('부속서류') && contractsHtml.includes('📎'))
  // 부속서류 미비 점검 — 계약서·세금계산서 없는 진행 중 계약(시드 다수)에 미비 표시 + 헤더 집계
  check('계약: 부속서류 미비 경고(행 미비칩 + 헤더 집계)', contractsHtml.includes('부속서류 미비') && contractsHtml.includes('미비 계약서'))
  // 라이선스 ↔ 근거 계약 연계 — LIC-001(Microsoft 365) 이 CT-2023-002 로 연결, 미연계 라이선스는 '미연계'
  check('라이선스: 근거 계약 컬럼 + 연계/미연계 표시', contractsHtml.includes('근거 계약') && contractsHtml.includes('/inventory/contracts?sel=CT-2023-002') && contractsHtml.includes('미연계'))
  // 연계 자산 수는 저장값(계약 수량)이 아니라 대장 실측 파생 — 표시 수 = 드릴다운(?q=) 결과 불변식 (스테일 assetCount 제거)
  check('계약: 연계 자산 컬럼(대장 실측 파생) 렌더', contractsHtml.includes('연계 자산') && contractsHtml.includes('이 계약에 연계된 대장 자산 보기 (실측)'))
  // 라이선스 갱신 — 구독 라이선스 만료일 연장(계약 갱신과 동형). '구독 기간 연장'은 라이선스 갱신 버튼 고유 title
  check('라이선스: 갱신(구독 기간 연장) 컨트롤 렌더 (자산담당)', contractsHtml.includes('구독 기간 연장'))
  check('라이선스: SEC_MGR 에겐 갱신 컨트롤 미노출 (조회)', !(await (await get('/inventory/contracts', 'SEC_MGR')).text()).includes('구독 기간 연장'))
  // 라이선스 해지 — 구독 중단·도구 이관 시 컴플라이언스에서 내린다(계약 해지와 동형). 해지 버튼 고유 title.
  check('라이선스: 해지 컨트롤 렌더 (자산담당)', contractsHtml.includes('라이선스 해지 (구독 중단·도구 이관)'))
  check('라이선스: SEC_MGR 에겐 해지 컨트롤 미노출', !(await (await get('/inventory/contracts', 'SEC_MGR')).text()).includes('라이선스 해지 (구독 중단·도구 이관)'))
  // 라이선스 좌석 배정 대장 — 누가 어느 석을 쓰는지 명명형 관리 + 탐지 사용량 대사(배정 밖 사용 식별). 시드 LIC-004 AutoCAD 배정 2/사용 6.
  check('라이선스: 좌석 배정 대장·미배정 사용 대사 표기(LIC-004)', contractsHtml.includes('배정 2/15석') && contractsHtml.includes('미배정 사용 4'))
  check('라이선스: 좌석 배정 컨트롤 렌더 (자산담당)', contractsHtml.includes('좌석 배정'))
  check('라이선스: SEC_MGR 에겐 좌석 배정 컨트롤 미노출 (조회)', !(await (await get('/inventory/contracts', 'SEC_MGR')).text()).includes('좌석 배정'))
  // SAM 감사 카드에 좌석 배정 대장 섹션(배정 자산·보유자·부서) — 인쇄 증빙에 배정 대장이 담긴다
  const licCard = await (await get('/api/license-card/LIC-004', 'ASSET_MGR')).text()
  check('라이선스 카드: 좌석 배정 대장 섹션(배정 자산·보유자)', licCard.includes('좌석 배정 대장') && licCard.includes('정하윤') && licCard.includes('AST-2022-000871'))
  // 계약 엑셀에 상태(유효/해지) 컬럼 — 해지 계약이 반출본에서 활성으로 오인되지 않도록(감사 반출 정합)
  const ctXlsx = Buffer.from(await (await get('/api/export/contracts', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('계약 엑셀: 상태 컬럼(유효/해지) 반출', ctXlsx.includes('상태') && ctXlsx.includes('유효'))
  // 부속서류 미비(계약)·근거 계약(라이선스) 컬럼 반출 — 감사 컴플라이언스 반영
  check('계약 엑셀: 부속서류 미비·근거 계약 컬럼 반출', ctXlsx.includes('부속서류 미비') && ctXlsx.includes('근거 계약') && ctXlsx.includes('CT-2023-002') && ctXlsx.includes('미연계'))
  // 라이선스 좌석 대사(STEP2) 시트 — EDR 설치 인벤토리 대사 결과(배정 밖 설치·미설치 좌석)를 계약·라이선스 엑셀에 담아 SAM 감사 증적으로 반출
  check('계약 엑셀: 라이선스 좌석 대사(STEP2) 시트 반출 (SAM 감사)', ctXlsx.includes('라이선스 좌석 대사') && ctXlsx.includes('배정 밖 설치') && ctXlsx.includes('미설치 좌석'))
  // 라이선스 판정 열 — 반출본은 SAM 감사에 그대로 나가는 문서인데, 판정 규칙을 여기서 따로 적으면서 만료를 빼 두어
  //  만료된 라이선스가 '적정'·'초과 사용'으로만 읽혔다(만료 사실이 문서에서 사라졌다). 시드 JetBrains 는 만료 경과이면서
  //  초과 사용이라, 화면·컴플라이언스 리포트는 '만료·초과 사용'이라 부른다 — 반출본도 같은 판정을 실어야 한다.
  check('계약 엑셀: 라이선스 판정이 만료를 함께 표기 (화면·리포트와 같은 판정)',
    ctXlsx.includes('만료·초과 사용'), '반출본 판정 열이 만료를 빠뜨림')
  // 유지보수 계약 — SLA·비용 이력 관리 (제품안내서 §03 유지보수 계약). 상세는 토글 확장이라 SSR엔 버튼 title 만
  check('계약: 유지보수 계약에 SLA·비용 이력 관리 토글 노출', contractsHtml.includes('SLA · 비용 이력'))
  // 계약 카드(dossier) — 요약·부속서류·SLA·비용·연계 자산 인쇄용
  check('계약: 목록에 계약 카드 인쇄 링크', contractsHtml.includes('/api/contract-card/'))
  check('계약 카드: 미로그인 차단 (401)', (await get('/api/contract-card/CT-2023-014')).status === 401)
  check('계약 카드: 사용자 차단 (403)', (await get('/api/contract-card/CT-2023-014', 'USER')).status === 403)
  check('계약 카드: 없는 계약 404', (await get('/api/contract-card/NOPE', 'ADMIN')).status === 404)
  const ctCard = await get('/api/contract-card/CT-2023-014', 'ASSET_MGR')
  const ctCardBody = await ctCard.text()
  check('계약 카드: 자산담당 발급 (200·요약·부속서류·연계 자산)', ctCard.status === 200 && ctCardBody.includes('CT-2023-014') && ctCardBody.includes('CONTRACT DOSSIER') && ctCardBody.includes('부속서류') && ctCardBody.includes('연계 자산') && ctCardBody.includes('계약서'))
  const maintCard = await (await get('/api/contract-card/CT-2022-007', 'ASSET_MGR')).text()
  check('계약 카드: 유지보수 계약에 SLA·비용 이력 포함', maintCard.includes('SLA') && maintCard.includes('비용 이력') && maintCard.includes('정기 유지보수료'))
  // 라이선스 컴플라이언스 카드(SAM 감사용) — 보유·사용 대사·판정·비용 노출
  check('계약: 라이선스 표에 컴플라이언스 카드 링크', contractsHtml.includes('/api/license-card/'))
  check('라이선스 카드: 미로그인 차단 (401)', (await get('/api/license-card/LIC-002')).status === 401)
  check('라이선스 카드: 사용자 차단 (403)', (await get('/api/license-card/LIC-002', 'USER')).status === 403)
  check('라이선스 카드: 없는 라이선스 404', (await get('/api/license-card/NOPE', 'ADMIN')).status === 404)
  const licOver = await (await get('/api/license-card/LIC-002', 'ASSET_MGR')).text()  // JetBrains 120/131 초과 + 만료 경과(2026-05-31)
  check('라이선스 카드: 초과 사용 판정·비용 노출·SAM', licOver.includes('LIC-002') && licOver.includes('LICENSE COMPLIANCE') && licOver.includes('초과 사용') && licOver.includes('노출액'))
  // SAM 감사 카드 판정에도 만료 경과 명시(화면·리포트·대시보드와 정합) — LIC-002 는 만료 경과 · 초과 사용
  check('라이선스 카드: 만료 경과 판정 명시 (SAM 정합)', licOver.includes('만료 경과 · 초과'))
  const licLow = await (await get('/api/license-card/LIC-003', 'ASSET_MGR')).text()  // Adobe 40/22 미사용
  check('라이선스 카드: 미사용 보유 판정·회수 절감액', licLow.includes('미사용 보유') && licLow.includes('회수 가능') && licLow.includes('절감액'))
  const aprHtml = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('결재함: 격리 요청 문서 렌더', aprHtml.includes('격리 요청') && aprHtml.includes('APR-2607-112'))
  // SaaS 인가 요청 — 공지 NTC-02 가 약속한 인가 요청 루프. 시드 대기 건이 결재함에 노출되고 보안담당이 결재한다.
  check('결재함: SaaS 인가 요청 문서 렌더 (보안담당 결재선)', aprHtml.includes('SaaS 인가') && aprHtml.includes('Linear'))
  check('결재함: 결재선 라우팅 표시 (단계 + 필수)', aprHtml.includes('결재선') && aprHtml.includes('IT기획팀장') && aprHtml.includes('보안담당'))
  // 결재함 필터 — 상태(대기·승인·반려·전체)·구분·검색·내 상신만 (결재 이력 추적)
  check('결재함: 상태·구분·검색·내 상신만 필터 렌더', aprHtml.includes('내 상신만') && aprHtml.includes('문서번호·제목·기안자 검색') && aprHtml.includes('구분 — 전체'))
  // 결재 이력 엑셀이 결재함 필터를 반영 — 버튼이 ApprovalList 안으로 이동, 반출이 상태 필터 반영
  const aprAdmin = await (await get('/workflow/approvals', 'ADMIN')).text()
  check('결재함: 결재 이력 엑셀 버튼(ApprovalList 내부·필터 반영)', aprAdmin.includes('/api/export/approvals') && aprAdmin.includes('결재 이력 엑셀'))
  // 일괄 승인 — 내 결재 차례가 2건 이상이면 선택 일괄 승인 바가 노출된다(ADMIN 은 다수 대기 결재 가능)
  check('결재함: 일괄 승인 바 렌더 (내 결재 차례 2건+ · ADMIN)', aprAdmin.includes('선택 일괄 승인') && aprAdmin.includes('내 결재 차례'))
  // 결재 지연(SLA 3일 초과) — 시드 대기 결재는 2주 전 상신이라 지연으로 표시된다
  check('결재함: 지연(SLA 초과) 대기 결재 표시', aprAdmin.includes('지연 '))
  // 결재 지연 → 결재 독촉 발송 — 지연 표시에서 끝내지 않고 현재 단계 결재자에게 처리 독촉(대여·수리 독촉의 결재판)
  check('결재함: 결재 독촉 발송 조치 노출 (SLA 초과 대기)', aprAdmin.includes('결재 독촉 발송'))
  const aprUser = await (await get('/workflow/approvals', 'USER')).text()
  check('결재함(사용자): 일괄 승인 바 미노출 (결재 권한 없음)', !aprUser.includes('선택 일괄 승인'))
  const aprAll = Buffer.from(await (await get('/api/export/approvals?status=' + encodeURIComponent('전체'), 'ADMIN')).arrayBuffer()).toString('utf8')
  const aprRej = Buffer.from(await (await get('/api/export/approvals?status=' + encodeURIComponent('반려'), 'ADMIN')).arrayBuffer()).toString('utf8')
  const aprCount = (t) => new Set([...t.matchAll(/APR-\d{4}-\d{3}/g)].map((m) => m[0])).size
  check('결재 이력 엑셀: 상태=반려 반출이 전체보다 작음(필터 반영)', aprCount(aprRej) < aprCount(aprAll) && aprCount(aprAll) >= 3, `전체=${aprCount(aprAll)} 반려=${aprCount(aprRej)}`)
  // 대기 경과일·지연 컬럼 반출 — 시드 대기 결재(2주 전 상신)는 '지연' 표기 (정체 결재 감사 반출)
  check('결재 이력 엑셀: 대기 경과일·지연 컬럼 반출', aprAll.includes('대기 경과일') && aprAll.includes('· 지연'))
  // 결재 이력이라면서 '무엇을 왜 요청했고 무엇을 근거로 결재했는지'가 빠져 있었다 — 화면이 결재자에게
  //  보여 주는 신청 사유·대상 상세·첨부 근거 문서가 반출본에 한 칸도 없었다.
  check('결재 이력 엑셀: 신청 사유·대상 상세·첨부 근거 문서 컬럼 반출',
    aprAll.includes('신청 사유') && aprAll.includes('대상 상세') && aprAll.includes('첨부 근거 문서'))
  // 현재단계만으로는 남은 단계도 필수 결재 여부도 읽을 수 없어 '왜 아직 대기인지'를 감사에서 판단할 수 없었다.
  check('결재 이력 엑셀: 결재선 정의(단계·필수 여부) 반출',
    aprAll.includes('결재선') && aprAll.includes('IT기획팀장') && aprAll.includes('필수 결재'))
  // 반려는 '왜 반려했고 다시 올렸는지'가 감사 근거다 — 반려 건에만 뜻이 있으므로 다른 상태의 빈 칸과 구분한다.
  check('결재 이력 엑셀: 반려 건의 재상신 여부 표기',
    aprRej.includes('재상신함') || aprRej.includes('미재상신'))
  check('결재함: 다단계 결재선 — 자산 신청에 부서장 단계 노출', aprHtml.includes('부서장'))
  const permHtml = await (await get('/settings/permissions', 'ADMIN')).text()
  check('권한 매트릭스: 파이프라인·매트릭스 렌더', permHtml.includes('메뉴권한관리') && permHtml.includes('클릭해 변경'))
  check('권한 매트릭스: 잠금 칸 표시 (Admin 자기 잠금 방지)', permHtml.includes('🔒'))
  const menuHtml = await (await get('/settings/menus', 'ADMIN')).text()
  check('메뉴 관리: STEP 1 기능 사전 렌더', menuHtml.includes('기능 정의') && menuHtml.includes('/api/export/[kind]'))
  check('메뉴 관리: STEP 2 메뉴 레지스트리 렌더', menuHtml.includes('화면번호') && menuHtml.includes('DSC-010') && menuHtml.includes('/discovery/found'))
  // STEP2 기능 부여/회수 편집(#GAP1) — 그동안 조회 전용이라 매트릭스 na→'메뉴 관리에서 부여 필요'가 dead-end 였다. Admin 에 편집 UI 노출.
  check('메뉴 관리(STEP2): 기능 부여·회수 편집 UI 노출 (Admin)', menuHtml.includes('클릭해 부여·회수'))
  // STEP 1 이 정의한 '엑셀' 기능을 이 화면 자체가 제공한다 — 메뉴·기능 정의(STEP 1·2)를 엑셀로 반출(감사·거버넌스 문서)
  check('메뉴 관리: 엑셀 내보내기 버튼 노출 (STEP 1 엑셀 기능 자기제공)', menuHtml.includes('/api/export/menus') && menuHtml.includes('엑셀 내보내기'))
  const menuXlsx = Buffer.from(await (await get('/api/export/menus', 'ADMIN')).arrayBuffer()).toString('utf8')
  check('메뉴·기능 정의 엑셀: STEP1·STEP2 시트 + 정의 반영', menuXlsx.includes('STEP1 기능정의') && menuXlsx.includes('STEP2 메뉴정의') && menuXlsx.includes('DSC-010') && menuXlsx.includes('/api/export/[kind]'))
  // 반출은 권한 매트릭스의 '권한·정책 × 엑셀'로 통제 — Admin 전용(직접 URL 호출도 서버가 차단)
  check('메뉴·기능 정의 엑셀: 비Admin 403 (권한·정책 엑셀은 Admin 전용)', (await get('/api/export/menus', 'SEC_MGR')).status === 403)
  // 매트릭스의 '강제' 표시는 이제 메뉴 정의에서 파생된다 — 두 화면이 어긋나면 안 된다
  check('메뉴 관리 ↔ 매트릭스 정합', menuHtml.includes('발견 자산 · CMDB 대사') && permHtml.includes('서버가 직접 강제하는 권한'))
  check('권한 매트릭스: 강제 구분 안내', permHtml.includes('서버가 직접 강제하는 권한') && permHtml.includes('필요조건'))

  // 매트릭스의 '본인(부분)' 칸 — 범위를 좁히는 구현이 있는 칸에서만 고를 수 있어야 한다.
  //  구현 없는 칸의 'p' 는 can() 이 'n' 이 아니라는 이유로 통과시켜 허용(y)과 똑같이 동작한다:
  //  관리자는 좁혔다고 믿는데 화면은 전사를 열고, 엑셀은 전사 데이터를 그대로 반출한다.
  //  구현 목록(lib/perm.ts PARTIAL_SCOPES)이 실제 스코핑 코드·시드 매트릭스와 어긋나지 않게 고정한다.
  const permSrc = readFileSync(path.join(ROOT, 'lib', 'perm.ts'), 'utf8')
  // PARTIAL_SCOPES 는 lib/types.ts 에 산다 — store.ts 도 로드 시 참조해야 하는데 perm.ts 는 store.ts 를 import 하므로
  //  perm.ts 에 두면 순환이 된다. perm.ts 는 다시 내보내기만 한다.
  const permTypesSrc = readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8')
  const permScopeBlock = permTypesSrc.split('export const PARTIAL_SCOPES')[1]?.split('}')[0] ?? ''
  const scopeKeys = [...permScopeBlock.matchAll(/'([^']+\|[^']+\|[^']+)':/g)].map((m) => m[1])
  check(`권한 매트릭스: '본인' 구현 목록 등록 (${scopeKeys.length}칸)`, scopeKeys.length >= 5,
    `PARTIAL_SCOPES 파싱 실패 또는 비어 있음 — ${scopeKeys.join(', ')}`)
  // 키가 실제 메뉴·기능·권한그룹이어야 한다 — 오타 한 글자면 그 칸은 조용히 '구현 없음'으로 떨어져 다시 막힌다
  const permMenusSrc = permSrc.split('export const PERM_MENUS = [')[1]?.split(']')[0] ?? ''
  const knownMenus = [...permMenusSrc.matchAll(/'([^']+)'/g)].map((m) => m[1])
  const knownActions = ['조회', '저장', '삭제', '엑셀', '편입', '격리요청', '결재']
  const knownRoles = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN']
  const badScopeKeys = scopeKeys.filter((k) => {
    const [menu, action, role] = k.split('|')
    return !knownMenus.includes(menu) || !knownActions.includes(action) || !knownRoles.includes(role)
  })
  check('권한 매트릭스: 본인 구현 키가 모두 실재하는 메뉴 × 기능 × 권한그룹', badScopeKeys.length === 0 && knownMenus.length === 10,
    `키 오타: ${badScopeKeys.join(', ')} (메뉴 ${knownMenus.length}종)`)
  // 시드 매트릭스에 이미 박혀 있는 'p' 도 같은 목록 안에 있어야 한다 — 시드가 목록 밖 칸에 'p' 를 두면
  //  화면은 그 칸을 '본인 불가'로 그리는데 저장된 값은 'p' 인 모순이 남는다.
  const permStoreSrc = readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf8')
  const seedMatrixSrc = permStoreSrc.split('function seedMenuPermissions()')[1]?.split('function seedEasmTargets')[0] ?? ''
  const seedPartials = []
  for (const m of seedMatrixSrc.matchAll(/menu: '([^']+)', cells: \{([^}]*)\}/g)) {
    const menu = m[1]
    for (const rm of m[2].matchAll(/(USER|ASSET_MGR|SEC_MGR|ADMIN): \[([^\]]*)\]/g)) {
      const cells = [...rm[2].matchAll(/'([ypn])'/g)].map((c) => c[1])
      cells.forEach((c, i) => { if (c === 'p') seedPartials.push(`${menu}|${knownActions[i]}|${rm[1]}`) })
    }
  }
  const seedPartialOrphans = seedPartials.filter((k) => !scopeKeys.includes(k))
  check(`권한 매트릭스: 시드의 '본인' 칸 ${seedPartials.length}개가 모두 구현 목록 안에 있다`,
    seedPartialOrphans.length === 0 && seedPartials.length >= 3, `구현 없는 시드 'p': ${seedPartialOrphans.join(', ')}`)
  // 서버가 최종 판정 — 화면이 순환에서 건너뛰어도 액션 직접 호출을 막는 가드가 있어야 한다
  const setPermSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'settings', 'permissions', 'actions.ts'), 'utf8')
  check('권한 변경: 구현 없는 칸의 본인 지정을 서버가 거부', /next === 'p' && !hasPartialScope\(/.test(setPermSrc))
  // 화면도 두 종류의 칸을 구분해 안내해야 한다 — 둘 다 실제로 렌더돼야 무증상 통과가 아니다
  const canPartialCells = permHtml.split('본인 범위 지정 가능').length - 1
  const noPartialCells = permHtml.split('본인을 건너뜁니다').length - 1
  check(`권한 매트릭스: 본인 가능 ${canPartialCells}칸 / 건너뜀 ${noPartialCells}칸 툴팁 구분`,
    canPartialCells === scopeKeys.length && noPartialCells > 0)
  check('권한 매트릭스: 본인 범위 안내 문구', permHtml.includes('전사 조회·전사 엑셀 반출'))
  // can() 이 최종 판정 — 구현 없는 칸에 남은 'p'(가드 이전 스냅샷)를 허용으로 읽으면 다시 전사가 열린다
  check('권한 판정: 구현 없는 칸의 잔존 본인은 불가로 읽는다', /cell === 'p' && !hasPartialScope\(/.test(permSrc))
  // 저장된 스냅샷도 로드 시 한 번 정리한다 — 화면이 그리는 값과 can() 의 판정이 갈리지 않게
  check('스토어 로드: 구현 없는 칸의 잔존 본인을 불가로 정리', permStoreSrc.includes('hasPartialScope(row.menu, PERM_ACTIONS[i], role)'))
  // 칸 순서(PERM_ACTIONS)는 정의가 하나여야 한다 — store 와 perm 이 각자 배열을 들면 i 번째 기능이 갈린다
  const permReexports = permSrc.slice(permSrc.indexOf('export {'), permSrc.indexOf('export {') + 120)
  check('권한 기능 순서: 정의는 lib/types.ts 한 곳', permTypesSrc.includes("export const PERM_ACTIONS = ['조회'") && permReexports.includes('PERM_ACTIONS') && permReexports.includes("from './types'"))
  // 엑셀 칸의 '본인'은 buildSheets 가 실제로 본인 범위를 거를 때만 뜻이 있다 — 등록된 엑셀 칸 수와
  //  exports.ts 의 USER 스코핑 지점 수가 같아야 한다(한쪽만 늘면 전사 반출이 조용히 열린다).
  const scopedExportCells = scopeKeys.filter((k) => k.split('|')[1] === '엑셀')
  const permExportsSrc = readFileSync(path.join(ROOT, 'lib', 'exports.ts'), 'utf8')
  const exportUserScopes = permExportsSrc.split("role === 'USER'").length - 1
  check(`엑셀 본인 범위: 매트릭스 ${scopedExportCells.length}칸 ↔ buildSheets USER 스코핑 ${exportUserScopes}곳`,
    scopedExportCells.length === exportUserScopes && scopedExportCells.length === 2,
    `${scopedExportCells.join(', ')} vs exports.ts ${exportUserScopes}`)
  const extHtml = await (await get('/discovery/external', 'SEC_MGR')).text()
  check('외부 공격표면: 수동·능동 기법 렌더', extHtml.includes('인증서 투명성') && extHtml.includes('존 트랜스퍼'))
  check('외부 공격표면: 노출 자산·CVE 렌더', extHtml.includes('legacy-vpn.seekerslab.co.kr') && extHtml.includes('CVE-2018-13379'))
  // 노출 위험 높은 순 정렬(제품안내서 §04 위험도 분류 → 우선 처리) — 시드는 CVSS순 아님(무CVE dev-api 가 CVSS 8.1 db-backup 보다 앞). 정렬 후 CVSS 높은 db-backup 이 먼저 렌더.
  check('외부 공격표면: CVSS 높은 순 정렬(고CVSS가 무CVE보다 먼저)', extHtml.includes('db-backup.seekerslab.co.kr') && extHtml.includes('dev-api.seekerslab.co.kr') && extHtml.indexOf('db-backup.seekerslab.co.kr') < extHtml.indexOf('dev-api.seekerslab.co.kr'))
  // CT(인증서 투명성) 채널 — 발급 CA·유효기간 수집 후 유효기간으로 생존 추정(§04). 유효=생존 유력, 만료=생존 불명.
  check('외부 공격표면: CT 인증서 발급 CA·유효기간 수집·생존 추정 렌더',
    extHtml.includes('인증서(CA·유효기간)') && extHtml.includes("Let's Encrypt") && extHtml.includes('생존 유력') && extHtml.includes('생존 불명'))
  // 위험 수용 — 편입/차단 외에 '인지된 노출' 공식 수용 처분(위험 관리 표준). 수용 시 활성 취약점 우선순위(미조치)에서 제외.
  check('외부 공격표면: 노출 자산에 위험 수용 처분 컨트롤(편입·차단 외)', extHtml.includes('위험 수용'))
  check('외부 공격표면: 위협 인텔·유출 수집 렌더', extHtml.includes('스틸러 로그'))
  // 인증 취약점 점검(§04) — 오픈 포트에 한해 기본·취약 크리덴셜 점검, 서비스별 노출. 유출 대응(loop28)과 동형의 조치 루프.
  check('외부 공격표면: 인증 취약점 점검(크리덴셜 노출) 렌더', extHtml.includes('인증 취약점 점검') && extHtml.includes('PostgreSQL') && extHtml.includes('db-backup.seekerslab.co.kr'))
  check('외부 공격표면: 크리덴셜 노출 미조치 집계', extHtml.includes('크리덴셜 노출 — 미조치'))
  // 위협 인텔 IOC 상관(loop50) — IOC 를 조직 자산·관측과 상관해 위협 행위자 귀속. 알려진 자산에 위협 맥락 부여, 보안담당이 차단·조사.
  check('외부 공격표면: IOC 상관·행위자 귀속 카드 렌더', extHtml.includes('IOC 상관·행위자 귀속') && extHtml.includes('RedLine') && extHtml.includes('LockBit'))
  check('외부 공격표면: IOC 상관 미조치 집계', extHtml.includes('IOC 상관 — 미조치'))
  check('외부 공격표면: 보안담당에 IOC 조치(차단·조사 착수) 노출', extHtml.includes('조사 착수') && extHtml.includes('위협 행위자 귀속'))
  check('외부 공격표면: 보안담당에 유출 대응 컨트롤 노출', extHtml.includes('검출에서 대응까지') && /class="[^"]*btn[^"]*danger/.test(extHtml))
  check('외부 공격표면: 보안담당에 노출 자산 조치(편입/차단 요청) 노출', extHtml.includes('편입 요청') && extHtml.includes('차단 요청'))
  check('외부 공격표면: 이미 차단요청된 노출 자산 상태 표기', extHtml.includes('차단요청'))
  const extAsset = await (await get('/discovery/external', 'ASSET_MGR')).text()
  check('외부 공격표면: 자산담당엔 유출 대응 버튼 미노출 (조회만)', !extAsset.includes('대응</button>'))
  check('외부 공격표면: 자산담당엔 노출 자산 조치 버튼 미노출', !extAsset.includes('편입 요청</button>'))
  check('외부 공격표면: 자산담당엔 IOC 조치 버튼 미노출 (조회만)', extAsset.includes('IOC 상관·행위자 귀속') && !extAsset.includes('조사 착수</button>'))
  const ntcHtml = await (await get('/board/notices', 'USER')).text()
  check('공지사항: 목록·본문 렌더', ntcHtml.includes('2026 하반기 재물조사') && ntcHtml.includes('필독'))
  // 버튼의 존재 여부는 렌더된 컨트롤로 본다 — 낱말만 찾으면 안내 문구(없는 주소 화면의 '삭제된 항목의 링크' 등)가
  //  RSC 페이로드로 모든 페이지에 실릴 때 오탐이 난다(실제로 404 화면을 넣자 이 검사가 깨졌다).
  check('공지사항: 사용자에게 등록·관리 버튼 미노출', !ntcHtml.includes('>공지 등록<') && !ntcHtml.includes('>삭제</button>'))
  // 필독 공지 읽음 확인 — 상단 고정 공지가 기본 선택돼 사용자에게 읽음 확인 UI·커버리지 집계가 보인다
  check('공지사항: 필독 공지 읽음 확인 UI·커버리지 렌더 (사용자)', ntcHtml.includes('읽음 확인') && ntcHtml.includes('필독 확인') && ntcHtml.includes('명'))
  // 공지 목록 필터 — 검색·필독만(전 권한그룹), 예약만(Admin 전용)
  check('공지사항: 목록 검색·필독만 필터 렌더', ntcHtml.includes('제목·내용·작성자 검색') && ntcHtml.includes('필독만'))
  check('공지사항: 예약만 필터는 사용자에게 미노출', !ntcHtml.includes('예약만'))
  // 공지 분류 — 목록 컬럼·필터(전 권한그룹). 시드 3건이 일반·정책·규정·교육·안내로 분산
  check('공지사항: 분류 컬럼·필터 렌더', ntcHtml.includes('분류 — 전체') && ntcHtml.includes('정책·규정') && ntcHtml.includes('교육·안내'))
  // 딥링크 — 상세 카드 kicker 'author (dept)' 는 열린 공지에만 렌더된다(목록 행은 이 포맷 미사용). NTC-02 는 유일한 보안운영팀 공지.
  // 기본 진입은 상단 고정(NTC-01)만 열리므로 NTC-02 상세는 없고, ?sel=NTC-02 면 NTC-02 상세가 열린다(알림 로그·대시보드 딥링크 정착지).
  check('공지사항: 기본 진입 시 비고정 공지(NTC-02) 상세 미노출', !ntcHtml.includes('윤보안 (보안운영팀)'))
  const ntcSel = await (await get('/board/notices?sel=NTC-02', 'USER')).text()
  check('공지사항: ?sel=NTC-02 딥링크로 해당 공지 상세 진입', ntcSel.includes('윤보안 (보안운영팀)') && ntcSel.includes('프록시 차단 정책이 시행됩니다'))
  // 상세 kicker 에 분류 노출 — NTC-02 는 정책·규정
  check('공지사항: 상세 kicker 에 분류 표기 (NTC-02 정책·규정)', ntcSel.includes('정책·규정 · 2026-07-18'))
  const ntcAdmin = await (await get('/board/notices', 'ADMIN')).text()
  check('공지사항: Admin 관리 컨트롤 노출 (등록·수정·고정 토글·삭제)', ntcAdmin.includes('공지 등록') && ntcAdmin.includes('수정') && ntcAdmin.includes('삭제') && (ntcAdmin.includes('고정 해제') || ntcAdmin.includes('상단 고정')))
  // 필독 미확인자 안내 발송 — 커버리지 미달 필독 공지에 Admin 독촉 버튼 노출 (기본 선택 필독 공지가 0/N 확인 상태)
  check('공지사항: 필독 미확인자 안내 발송 컨트롤 (Admin)', ntcAdmin.includes('안내 발송'))
  // 미확인자 명단 — Admin 이 개별 후속을 할 수 있게 실제 이름 노출(오세훈은 사용자라 명단에만 등장, 커버리지 숫자만으론 누구인지 모른다)
  check('공지사항: 필독 미확인자 명단 노출 (Admin)', ntcAdmin.includes('미확인자') && ntcAdmin.includes('오세훈'))
  check('공지사항: 미확인자 명단은 사용자에게 미노출', !ntcHtml.includes('미확인자'))
  check('공지사항: 예약만 필터는 Admin에 노출', ntcAdmin.includes('예약만'))
  const qnaHtml = await (await get('/board/qna', 'USER')).text()
  check('QnA: 문의 목록·답변 상태 렌더', qnaHtml.includes('질문하기') && qnaHtml.includes('답변 대기') && qnaHtml.includes('답변 완료'))
  // 목록 필터 — 검색·분류·답변 상태·내 문의 (다른 목록 화면과 동일한 필터 패턴)
  check('QnA: 목록 필터(검색·내 문의) 렌더', qnaHtml.includes('제목·내용·작성자 검색') && qnaHtml.includes('내 문의만'))
  const qnaMgr = await (await get('/board/qna', 'ASSET_MGR')).text()
  check('QnA: 담당자에게 답변 입력 노출', qnaMgr.includes('답변 등록'))
  // 미답변 SLA 경과 — 시드 QNA-01/QNA-02(2026-07-22·24 등록, 미답변)가 SLA(3일)를 넘겨 지연 표기 + 답변 독촉 버튼(담당자). 결재 지연의 QnA 판.
  check('QnA: 미답변 SLA 경과 지연 표기 + 답변 독촉 발송 버튼(담당자)', qnaMgr.includes('지연 ') && qnaMgr.includes('답변 독촉 발송'))
  check('QnA(사용자): 답변 독촉 발송 버튼 미노출 (담당자 전용)', !qnaHtml.includes('답변 독촉 발송'))
  const qnaAdmin = await (await get('/board/qna', 'ADMIN')).text()
  check('QnA: Admin 문의 수정·삭제(중재) 컨트롤 노출', qnaAdmin.includes('삭제') && qnaAdmin.includes('문의 수정'))
  const inHtml = await (await get('/assets/intake', 'ASSET_MGR')).text()
  check('도입·검수: 체크리스트·라벨 렌더', inHtml.includes('검수 체크리스트') && inHtml.includes('전원·부팅 정상 동작') && inHtml.includes('<svg'))
  // 유형별 검수 체크리스트 — 기본 선택된 단말 로트(IN-2607-01)에 단말 고유 항목(디스크 암호화)이 렌더된다
  check('도입·검수: 유형별 체크리스트(단말 — 디스크 암호화)', inHtml.includes('디스크 암호화(BitLocker/FileVault) 활성화'))
  // 발주 단가 — 로트 단가가 채번 자산 취득가로 반영됨을 안내(IN-2607-01 단가 1,650,000)
  check('도입·검수: 발주 단가 → 채번 취득가 반영 안내', inHtml.includes('발주 단가') && inHtml.includes('1,650,000') && inHtml.includes('취득가로 반영'))
  check('도입·검수: 발주 연계 입고 등록 진입점', inHtml.includes('입고 등록'))
  check('도입·검수: QR·바코드 SVG 발행', (inHtml.match(/<svg/g) ?? []).length >= 2 && inHtml.includes('AST-2025-000033'))
  // 도입 예정 — ITSM SR·발주 사전 등록 → 도착 전 자산 (제품안내서 §06 ITSM·구매 연동)
  check('도입·검수: 도입 예정(ITSM SR·발주) 섹션 + 시드 사전등록 + 도착 처리', inHtml.includes('도입 예정') && inHtml.includes('SR-2607-041') && inHtml.includes('입고 등록 (도착)'))
  // 도입 예정 입고 지연(§06 ITSM·구매 연동) — 도착 예정일 경과 미입고 로트를 납기 지연으로 표기(발주처 독촉). 시드 SR-2607-041(예정 2026-07-25 경과).
  check('도입·검수: 도입 예정 입고 지연(납기 경과) 표기·발주처 독촉', inHtml.includes('입고 지연') && inHtml.includes('납기') && inHtml.includes('발주처 독촉'))
  // 입고 지연 → 발주처 독촉(검출→조치) — 대여/수리 독촉과 같은 패턴. 납기 경과 로트의 공급사에 납기 확인 요청 발송 버튼(자산담당).
  check('도입·검수: 입고 지연 독촉 발송 버튼 노출 (발주처 납기 확인)', inHtml.includes('입고 지연 독촉 발송') && inHtml.includes('납기 확인'))
  // 검수 반려 로트 — 불량 반려 후 재검수·반품 확인 백로그. 목록에 반려 상태로 노출(선택 시 재검수 버튼)
  check('도입·검수: 검수 반려 로트 노출 (IN-2607-04 · Dell UltraSharp)', inHtml.includes('IN-2607-04') && inHtml.includes('Dell UltraSharp') && inHtml.includes('검수 반려'))
  // 검수 확인서 — 검수 이력이 있는 로트의 공급사·계약·체크리스트·채번 자산을 물품 인수 증적(대금 지급·감사)으로. 검수 전 로트는 대상 아님(400).
  check('도입·검수: 검수 확인서 인쇄 링크(검수 이력 로트)', inHtml.includes('/api/intake-cert/'))
  check('검수 확인서: 미로그인 차단 (401)', (await get('/api/intake-cert/IN-2607-01')).status === 401)
  check('검수 확인서: 사용자 차단 (403)', (await get('/api/intake-cert/IN-2607-01', 'USER')).status === 403)
  check('검수 확인서: 검수 전 로트는 대상 아님 (400 · IN-2607-02 입고 대기)', (await get('/api/intake-cert/IN-2607-02', 'ASSET_MGR')).status === 400)
  const intakeCert = await (await get('/api/intake-cert/IN-2607-01', 'ASSET_MGR')).text()  // 검수 중 · 채번 AST-2025-000033
  check('검수 확인서: 공급사·체크리스트·채번 자산 렌더', intakeCert.includes('GOODS ACCEPTANCE') && intakeCert.includes('검수 체크리스트') && intakeCert.includes('AST-2025-000033'))
  // 대시보드(자산담당): 검수 반려 후속 백로그를 운영 큐로 노출(방치 방지)
  check('대시보드(자산담당): 검수 반려 재검수·반품 확인 큐 노출', dashHtml.includes('검수 반려 (재검수 · 반품 확인)'))
  const mvHtml = await (await get('/assets/movement', 'ASSET_MGR')).text()
  check('불출·이동: 대기열·재배치 재고 렌더', mvHtml.includes('불출 대기') && mvHtml.includes('이동 대기') && mvHtml.includes('재배치 우선 원칙'))
  // 승인만 되고 집행되지 않은 이동이 대기열에 보여야 한다 (승인 ≠ 집행)
  check('불출·이동: 미집행 승인 이동이 대기열에 노출', mvHtml.includes('APR-2607-101') && mvHtml.includes('본사 9F'))
  // 재배치 우선 원칙 — 승인된 자산 신청(APR-2607-116, 희망 유형 단말)이 불출 대기에 노출되고 희망 유형이 표시된다
  check('불출: 승인 자산 신청 불출 대기 + 희망 유형 노출', mvHtml.includes('APR-2607-116') && mvHtml.includes('희망 유형') && mvHtml.includes('노트북 지급'))
  // 유형 매칭 추천 — 단말 신청에 일치하는 배정 가능 단말(AST-2025-000033 · 검수중 미배정분)이 ✓ 표기로 우선 추천된다
  check('불출: 희망 유형 일치 배정 가능 재고 우선 추천(✓)', mvHtml.includes('✓ AST-2025-000033') && mvHtml.includes('· 단말'))
  // 폐기 선정 자산 제외 — 배정 가능 재고는 불출 가드(dispatchAsset)와 같은 판정(lib/stock assignableAssets)이어야 한다.
  //  시드 AST-2021-000432(유휴 단말)는 폐기 대상 선정(DSP-02) 상태라 불출이 거부된다 — 화면이 추천하면 담당자가 막다른 길에 빠진다.
  check('불출: 폐기 선정된 유휴 자산은 배정 가능 재고에서 제외(불출 가드와 동일 판정)', !mvHtml.includes('AST-2021-000432'))
  // 배정 가능 재고에 유형 다양성(주변기기 유휴) — 유형 불일치 시연 근거
  check('불출: 배정 가능 재고에 주변기기 유휴(유형 다양성)', mvHtml.includes('AST-2023-000704') && mvHtml.includes('주변기기'))
  // 불출·이동 처리 시 신청자에게 자동 통보한다는 안내 (요청자 루프 폐쇄 · dispatch 자산 불출·자산 이동)
  check('불출·이동: 불출·이동 시 신청자 통보 안내 노출', mvHtml.includes('불출·이동 처리 시 신청자에게 자동 통보됩니다'))
  check('불출·이동: 이동 집행 시 신청자 위치 통보 안내 노출', mvHtml.includes('이동 처리 시에도 신청자에게 변경된 위치가'))
  const rtHtml = await (await get('/assets/returns', 'ASSET_MGR')).text()
  check('반납·유휴: 접수 대기·유휴 풀 렌더', rtHtml.includes('반납 접수 대기') && rtHtml.includes('유휴 자산 풀') && rtHtml.includes('상태 점검'))
  // 장기 유휴 → 폐기 검토 브리지 — 장기 유휴 자산을 폐기 후보로 바로 선정(검출→조치). 이미 폐기 절차 자산은 유휴 풀에서 제외
  check('반납·유휴: 장기 유휴 → 폐기 검토 조치 노출', rtHtml.includes('폐기 검토') && rtHtml.includes('재배치 우선'))
  // 수리 지연 → 업체 독촉 — 예상 반환 경과 수리 자산의 업체에 진행·반환 독촉 발송(대여 반환 독촉의 수리판)
  check('반납·유휴: 수리 지연 → 업체 독촉 발송 조치 노출', rtHtml.includes('업체 독촉 발송'))
  check('반납·유휴: 반납대기 자산이 접수 대기에 노출', rtHtml.includes('AST-2025-000513'))
  check('반납·유휴: 수리중 지표·수리 워크플로 노출', rtHtml.includes('수리중') && rtHtml.includes('수리 필요는 수리중을 거쳐'))
  check('반납·유휴: 수리 대기 카드에 수리중 자산 노출 (시드 시나리오)', rtHtml.includes('수리 대기') && rtHtml.includes('AST-2025-000377'))
  // 보증 내 수리 무상 안내 — 시드 수리중 자산은 보증 내라 무상 보증 수리 대상. 견적 있는 건은 무상 청구 권장.
  check('반납·유휴: 보증 내 수리 무상 안내(무상 보증 청구 권장)', rtHtml.includes('보증 수리 (무상)') && rtHtml.includes('무상 보증 청구 권장'))
  // 수리 업체 성과 스코어카드 — 자산 단위 수리 이력(repairCosts)을 업체별로 집계(비용·물량·지연). 시드 AST-2023-000112 의 중부IT서비스 2건(95,000+148,000=243,000).
  check('수리 업체 성과: 자산 단위 수리 이력 업체별 집계(중부IT서비스 자사 부담 누계)', rtHtml.includes('수리 업체 성과') && rtHtml.includes('중부IT서비스') && rtHtml.includes('243,000'))
  // 업체 정시 반환율(SLA) — 예상 반환일(eta) 이내 반환 비율. 시드 중부IT서비스 3건 중 2건 정시 → 66%(2/3, 이정표 정직 규약의 floor).
  check('수리 업체 성과: 업체 정시 반환율(SLA) 표기(중부IT서비스 66% · 2/3)', rtHtml.includes('정시 반환율') && rtHtml.includes('66%'))
  // 수리 의뢰 추적 — 업체·예상반환·견적·실비 (제품안내서 §03 유지보수). 그동안 수리는 상태 플립뿐이었다.
  check('반납·유휴: 수리 의뢰(업체·예상반환·견적) 컬럼 + 실비 입력 렌더', rtHtml.includes('수리 의뢰 (업체·예상반환·견적)') && rtHtml.includes('수리 업체') && rtHtml.includes('실 수리비'))
  // 수리 예상 반환 경과 — 시드 의뢰건(AST-2024-000512, 예상반환 경과)이 '반환 지연' 으로 표시된다(업체 독촉 신호)
  check('반납·유휴: 수리 예상 반환 경과(업체 지연) 표시', rtHtml.includes('중부IT서비스') && rtHtml.includes('반환 지연'))
  check('반납·유휴: 대여 현황 패널 + 대여중 자산·반환 접수 노출', rtHtml.includes('대여 현황') && rtHtml.includes('AST-2024-000230') && rtHtml.includes('반환 접수'))
  // 반납 접수 시 반납자에게 점검 결과 자동 통보 안내 (요청자 루프 폐쇄 · dispatch 반납 접수)
  check('반납·유휴: 반납 접수 시 반납자 통보 안내 노출', rtHtml.includes('반납 접수 시 반납자에게 점검 결과가 자동 통보됩니다'))
  check('반납·유휴: 대여 연체 자산이 연체로 표기 (AST-2023-000450, 기한 경과)', rtHtml.includes('AST-2023-000450') && rtHtml.includes('연체'))
  check('반납·유휴: 연체·임박 대여에 반환 독촉 발송 버튼 노출', rtHtml.includes('반환 독촉 발송'))
  check('반납·유휴: 대여 대장 엑셀 반출 버튼 노출 (감사 대응)', rtHtml.includes('/api/export/loans') && rtHtml.includes('대여 대장 엑셀'))
  const apUser = await (await get('/workflow/approvals', 'USER')).text()
  const apSec0 = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('신청 상신: 사용자에게 신청 UI 노출', apUser.includes('신청 상신') && apUser.includes('신청하기'))
  check('상신 취소: 본인 대기 신청에 취소 버튼 노출', apUser.includes('상신 취소') && apUser.includes('APR-2607-121'))
  // 소유자 확인은 결재가 아니라 부서 응답 — 요청받은 부서(플랫폼개발팀=김민준)에게만 응답 버튼이 뜬다
  check('소유자 확인: 해당 부서 사용자에게 응답 버튼', apUser.includes('APR-2607-114') && apUser.includes('본인 자산'))
  // 결재함 데이터 스코핑 — USER 는 본인 상신분(+부서 소유자확인)만 조회('신청·결재' 조회='p' own-scope). 타 부서 결재(APR-2607-112 격리·보안운영팀)는 미노출.
  check('결재함 스코핑(USER): 타 부서 결재 미노출(본인·부서 소유자확인만 · 조회 own-scope)', !apUser.includes('APR-2607-112'))
  // 목록만 스코핑하고 상단 KPI 가 전사 집계를 쓰면 같은 화면 머리에서 다시 새어 나간다 — 타일도 조회 스코프를 따라야 한다.
  //  격리 요청 건수는 보안 운영 지표라 USER 자리에는 본인 부서 소유자 확인 요청을 대신 노출한다(역할에 맞는 할 일).
  check('결재함 KPI 스코핑(USER): 전사 격리 요청 건수 미노출 · 소유자 확인 요청으로 대체', !apUser.includes('격리 요청 (보안담당)') && apUser.includes('소유자 확인 요청 (우리 부서)'))
  check('결재함 KPI(담당자): 격리 요청 타일은 그대로', apSec0.includes('격리 요청 (보안담당)'))
  const apSec = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('소유자 확인: 타 부서에는 응답 버튼 미노출', apSec.includes('APR-2607-114') && apSec.includes('부서 응답 대기'))
  const insHtml = await (await get('/ai/insights', 'SEC_MGR')).text()
  check('AI 제안: 판정 UI·환류 지표 렌더', insHtml.includes('판정 대기 제안') && insHtml.includes('채택률') && insHtml.includes('재학습 신호'))
  check('AI 제안: 기능별 판정 현황 5종', ['자동분류', '이상탐지', '수명예측', '취약점 우선순위', '라이선스 최적화'].every((k) => insHtml.includes(k)))
  // AI 제안 목록 필터 — 상태(제안/승인/반려)·기능·심각도
  check('AI 제안: 목록 상태·기능·심각도 필터 렌더', insHtml.includes('기능 — 전체') && insHtml.includes('심각도 — 전체'))
  // 자동분류(§05 AI 기능01) — 그동안 5대 기능 중 유일하게 전용 패널이 없던 자동분류를 제안 패널로 노출.
  //  발견 자산(미등록·미확인)의 관측 유형을 표준 유형으로 매핑하고 신뢰도·근거·편입 연결을 함께 제시(수기 분류 제거).
  check('AI 제안: 자동분류 제안 패널 렌더(관측→표준 유형)', insHtml.includes('자동분류 제안 — 관측 유형 → 표준 자산 유형') && insHtml.includes('LLM 분류 · 규칙 하이브리드') && insHtml.includes('분류 대상 (미등록·미확인)'))
  check('AI 제안: 자동분류 신뢰도·근거·편입 연결', insHtml.includes('평균 신뢰도') && insHtml.includes('수기 분류 제거') && insHtml.includes('/discovery/found?sel='))
  // 취약점 노출 우선순위(§05 기능04) — 자산 중요도 × 노출도 스코어링. 외부 CVE·EOL OS·미인가 SW·크리덴셜 노출 합성.
  check('AI 제안: 취약점 노출 우선순위 스코어링 렌더', insHtml.includes('취약점 노출 우선순위') && insHtml.includes('자산 중요도 × 노출도') && insHtml.includes('P1 — 즉시 조치'))
  // 라이선스 판정 — 만료 경과와 사용률 판정(초과·미사용)은 배타가 아니다. 시드 JetBrains 는 만료(2026-05-31)인데 120석 보유에 131석 사용이다.
  //  만료가 사용률 판정을 덮어쓰면 '초과 사용 1건' 스탯은 세는데 그렇게 라벨된 행이 표에 하나도 없고(실제로 그랬다),
  //  같은 행의 권고 조치만 '증설 — 11석 초과'라고 말해 두 컬럼이 서로 다른 판정을 보여준다. lib/reports licenseVerdict 단일 소스.
  check('AI 제안: 라이선스 판정이 만료·초과를 함께 표기(스탯과 행 라벨 정합)', insHtml.includes('만료·초과 사용') && insHtml.includes('만료 경과 — 갱신·해지 먼저 판단'))
  // EOL OS(CentOS 7)·외부 CVE 가 스코어링 대상에 포함됨을 확인 (시드 AST-2020-000883 CentOS 7.9)
  check('AI 제안: 취약점 우선순위에 EOL OS·외부 CVE 반영', insHtml.includes('EOL OS') && insHtml.includes('CentOS 7') && insHtml.includes('외부 노출 CVE'))
  // 미조치 외부 CVE(legacy-vpn·무action, CVE-2018-13379)는 포함, 이미 차단요청된 CVE(db-backup·action, CVE-2024-10977)는 제외 — 조치분은 '즉시 조치'가 아니다
  // (db-backup 호스트는 크리덴셜 노출로도 잡혀 화면에 남으므로, 외부 CVE 제외는 CVE 번호로 검증)
  check('AI 제안: 취약점 우선순위가 조치 요청된 외부 CVE 제외 (미조치만)', insHtml.includes('CVE-2018-13379') && !insHtml.includes('CVE-2024-10977'))
  // 이상 자산 행위 탐지(§05 AI 기능02) — 취약점 우선순위(정적 노출도)와 다른 '행위 이탈' 관점 컴퓨티드 뷰.
  //  §05 기능02가 명시한 세 행위(미인가 SW 설치·휴면 자산의 갑작스런 활동·서버의 비정상 외부 통신) + USB 대용량 반출을 집약.
  check('AI 제안: 이상 자산 행위 탐지 컴퓨티드 뷰 렌더(기능02 세 행위 + USB)', insHtml.includes('이상 자산 행위 탐지') && insHtml.includes('미인가 SW 설치') && insHtml.includes('유휴 자산 사용') && insHtml.includes('서버 비정상 외부 통신') && insHtml.includes('USB 대용량 반출'))
  check('AI 제안: 이상탐지 — 유휴 자산 사용(미승인 불출 DIF-04) 실측 이탈 반영', insHtml.includes('AST-2021-000432') && insHtml.includes('미승인 불출'))
  // 서버 비정상 외부 통신(§05 기능02 세 번째 행위) — AI 비지도 이상탐지 제안(INS-2608-08, 핵심 GPU 서버 AST-2024-000377 대용량 아웃바운드)을
  //  행위 뷰에 집약(그전엔 제안 목록에만 있고 이 컴퓨티드 뷰엔 누락). 'AST-2024-000377' 은 제안 목록에도 나오므로 뷰 전용 kind 라벨(의 없는 '서버 비정상 외부 통신')로 검증.
  check('AI 제안: 이상탐지 — 서버 비정상 외부 통신 행위 뷰 집약(GPU 서버 AST-2024-000377)', insHtml.includes('서버 비정상 외부 통신') && insHtml.includes('AST-2024-000377'))
  // 교체수요·수명 예측(§05 AI 기능03) — 연간 교체 계획 리포트와 같은 replacementCandidates() 근거를 화면에 직접 노출. 내용연수·보증·장애 이력 결합.
  check('AI 제안: 교체수요·수명 예측 컴퓨티드 뷰 렌더', insHtml.includes('교체수요·수명 예측') && insHtml.includes('추정 교체 예산') && insHtml.includes('잔여 장부가 — 폐기손실'))
  // 라이선스 최적화(§05 AI 기능05) — 라이선스 컴플라이언스 리포트와 같은 licenseOptimization() 근거를 화면에 직접 노출. 초과·미사용 회수·만료·중복 SaaS 통합.
  check('AI 제안: 라이선스 최적화 컴퓨티드 뷰 렌더', insHtml.includes('라이선스 최적화 — 회수·증설·통합 근거') && insHtml.includes('미사용 회수 후보') && insHtml.includes('회수 시 연간 절감'))
  // 라이선스 최적화 조치 드릴다운(검출→조치) — 다른 4개 AI 패널처럼 계약·라이선스 화면으로 연결. 보안담당은 접근 밖이라 링크 미노출(dead-end 방지).
  check('AI 제안(보안담당): 라이선스 최적화 조치 링크 미노출(접근 밖 dead-end 방지)', !insHtml.includes('/inventory/contracts?sel=') && !insHtml.includes('/inventory/contracts?lic='))
  // 위험도 기준 관리(제품안내서 §01 보안담당 책무) — P1/P2 컷오프를 보안담당이 설정. 기본 P1≥67·P2≥34.
  check('AI 제안: 위험도 기준 패널 렌더 (기본 P1≥67·P2≥34)', insHtml.includes('위험도 기준 — 취약점 우선순위 판정 컷오프') && insHtml.includes('67') && insHtml.includes('34~66'))
  check('AI 제안: 보안담당에 위험도 기준 변경 노출', insHtml.includes('기준 변경'))
  // 자산담당은 위험도 기준을 조회만 — 변경 버튼 미노출(보안담당·Admin 관리)
  const insAsset = await (await get('/ai/insights', 'ASSET_MGR')).text()
  check('AI 제안(자산담당): 위험도 기준 조회 전용 (변경 미노출)', insAsset.includes('위험도 기준 — 취약점 우선순위 판정 컷오프') && insAsset.includes('보안담당·Admin 이 관리') && !insAsset.includes('기준 변경'))
  // 수명예측(fn03) 교체 검토 통보 — 교체 대상 자산의 소유 부서에 발송하는 조치 접점(EOL 업그레이드 통보의 수명예측 판). 그동안 패널이 읽기 전용 표로 dead-end 였다.
  check('AI 제안(자산담당): 교체 검토 통보 조치 버튼 노출(교체 대상 있을 때)', insAsset.includes('교체 검토 통보'))
  // 라이선스 최적화 패널 조치 드릴다운 — 자산담당은 계약·라이선스 화면으로 회수·증설·갱신 조치(초과·미사용·만료 판정별). fn02/04 조치 링크와 동형.
  check('AI 제안(자산담당): 라이선스 최적화 조치 드릴다운(계약·라이선스)', insAsset.includes('/inventory/contracts?sel=') || insAsset.includes('/inventory/contracts?lic='))
  // 교체 검토 통보는 자산담당·Admin 조치 — 보안담당은 위험도 기준만 관할, 통보 버튼 미노출(page canNotify 게이트)
  check('AI 제안(보안담당): 교체 검토 통보 버튼 미노출(자산담당·Admin 조치)', !insHtml.includes('교체 검토 통보'))
  // 수명예측 패널 → 대장 교체 대상 필터(?replace=1) 조회·반출 링크 — 분석(패널)과 관리·조달(대장 브라우즈)을 잇는다.
  check('AI 제안: 수명예측 패널→대장 교체 대상 조회 링크(?replace=1)', insHtml.includes('/assets/register?replace=1'))
  const fndHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 소유자 확인·에스컬레이션 진입점', fndHtml.includes('미확인 소유자 정책') && fndHtml.includes('미응답 에스컬레이션') && fndHtml.includes('응답 대기'))
  // 지문 병합 — 화면이 '지문 병합 후'라고 주장하려면 원시 관측과 병합 근거가 있어야 한다
  check('발견 자산: 원시 관측 대비 병합 결과 표시', fndHtml.includes('원시 관측') && fndHtml.includes('중복'))
  check('발견 자산: 다채널 병합 표기', fndHtml.includes('채널 병합'))
  check('발견 자산: 병합 후보 카드', fndHtml.includes('병합 후보') && fndHtml.includes('DSC-2607-0045') && fndHtml.includes('호스트명 동일'))
  const intHtml2 = await (await get('/platform/integrations', 'ADMIN')).text()
  check('연동: 알림 발송 이력(검색·필터) 렌더', intHtml2.includes('알림 발송 이력') && intHtml2.includes('MSG-4001') && intHtml2.includes('만료 임박') && intHtml2.includes('수신·제목·연결 문서 검색'))
  // 전달 상태·재발송(§06 발송 신뢰성) — 전달 실패(시드 MSG-4004 긴급 격리 문자 미도달) 상태 표기 + 보안담당·Admin 재발송 버튼. 그동안 발송 이력은 상태·재시도가 없었다.
  check('연동: 전달 실패 알림 상태 표기 + 재발송 버튼 (보안담당·Admin)', intHtml2.includes('전달 실패') && intHtml2.includes('재발송') && intHtml2.includes('MSG-4004'))
  // 긴급 보안 에스컬레이션 문자(SMS) 병행 정책 안내 (제품안내서 §06 이메일·문자 발송)
  check('연동: 긴급 보안 에스컬레이션 문자(SMS) 병행 정책 안내', intHtml2.includes('긴급 보안 에스컬레이션은 문자(SMS) 병행') && intHtml2.includes('이중 발송'))
  // 연결 문서(ref) 딥링크 — 시드 발송 이력의 계약·결재 ref 가 대상 화면 링크로 렌더된다
  check('연동: 발송 이력 연결 문서 딥링크 렌더', intHtml2.includes('연결 문서 열기') && intHtml2.includes('/inventory/contracts'))
  // 정밀 딥링크(?sel=) — 결재·계약·라이선스 ref 가 목록이 아니라 해당 항목으로 정착한다(시드 APR-2607-114·CT-2023-014·LIC-03)
  check('연동: 발송 이력 딥링크가 특정 항목(?sel=)으로 정착', intHtml2.includes(`/workflow/approvals?sel=${encodeURIComponent('APR-2607-114')}`) && intHtml2.includes(`/inventory/contracts?sel=${encodeURIComponent('CT-2023-014')}`) && intHtml2.includes(`/inventory/contracts?sel=${encodeURIComponent('LIC-002')}`))
  const ctHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약: 만료 임박 알림 발송 진입점', ctHtml.includes('만료 임박 알림 발송'))
  check('계약: 라이선스 조치(4단계) 진입점', ctHtml.includes('추가 구매') && ctHtml.includes('회수') && ctHtml.includes('검출에서 조치까지'))
  check('계약: 계약 갱신 컨트롤 렌더 (자산담당)', ctHtml.includes('>갱신<'))
  // 계약 → 자산 드릴다운 — 계약의 자산 수가 그 계약의 자산 대장(?q=계약번호)으로 연결
  check('계약: 자산 수가 계약 연계 자산 대장으로 드릴다운', ctHtml.includes('/assets/register?q=CT') && ctHtml.includes('이 계약에 연계된 대장 자산 보기 (실측)'))
  // AI 가동 표시 — 키 존재가 아니라 실제 호출 결과를 말해야 한다.
  // 스모크는 키 없이 도므로 '키 미설정' 이 정확한 상태이며, 근거 없이 '가동' 이라 주장하면 안 된다.
  const aiRep = await (await get('/ai/reports', 'ASSET_MGR')).text()
  const aiAsst = await (await get('/ai/assistant', 'USER')).text()
  const claimsLive = (h) => h.includes('AI 서술 생성 — 최근 성공') || h.includes('온프레미스 LLM 연결됨')
  check('AI 상태: 키 미설정 시 가동을 주장하지 않음', !claimsLive(aiRep) && !claimsLive(aiAsst))
  // 어시스턴트 프리셋 질의에 운영 리스크(분실·대여 연체·장기 미실측) 인텐트가 노출된다
  check('AI 어시스턴트: 운영 리스크 자산 질의 프리셋 렌더', aiAsst.includes('장기 미실측') && aiAsst.includes('대여 연체') && aiAsst.includes('수리 지연'))
  // 정기 점검(예방 정비) 대상 질의 프리셋 — 대장 필터·대시보드 큐와 같은 판정을 어시스턴트에서 자연어로 조회(v1.314 정기 점검 루프의 조회 접점)
  check('AI 어시스턴트: 정기 점검(예방 정비) 대상 질의 프리셋 렌더', aiAsst.includes('정기 점검(예방 정비) 대상 자산'))
  // 안전재고 부족 질의 프리셋 — 재고 화면·대시보드와 같은 lib/stock 판정을 어시스턴트에서 조회(루프 57 조회 접점)
  check('AI 어시스턴트: 안전재고 부족(발주 검토) 질의 프리셋 렌더', aiAsst.includes('안전재고 부족 (발주 검토) 유형'))
  // 수령 미확인 질의 프리셋 — 불출 후 인수 미확인 사용 중 자산(로54)을 어시스턴트에서 조회. status 게이트로 스테일 제외.
  check('AI 어시스턴트: 수령(인수) 미확인 질의 프리셋 렌더', aiAsst.includes('수령(인수) 미확인 자산'))
  // 자산 현황·대여 현황 질의 프리셋 — 상태 분포·전체 대여 현황을 자연어로 묻는 인텐트
  check('AI 어시스턴트: 자산 상태 분포·대여 현황 질의 프리셋 렌더', aiAsst.includes('자산 상태 분포와 대여 현황'))
  // 내 수리 현황 — 장애 신고한 본인 자산의 진행 상태를 사용자가 자연어로 추적(장애 신고 루프의 사용자 접점)
  check('AI 어시스턴트: 내 수리 현황 질의 프리셋 렌더', aiAsst.includes('내 수리 현황'))
  // 발견 자산 AI 요약 브리핑 프리셋 (제품안내서 §05 AI 어시스턴트)
  check('AI 어시스턴트: 발견 자산 요약 브리핑 프리셋 렌더', aiAsst.includes('발견 자산 요약 브리핑'))
  // 자산 보증 만료(유형+기간 스코프) 프리셋 — 안내서 §05 예시 질의 "내년 1분기 보증 만료되는 네트워크 장비 목록"
  //  (기간 파싱: 분기·반기·월·연도 창으로 만료 대상을 좁힌다 — lib/dates parsePeriodWindow)
  check('AI 어시스턴트: 자산 보증 만료(유형) 질의 프리셋 렌더', aiAsst.includes('보증 만료되는 네트워크 장비 목록'))
  check('AI 어시스턴트: 보증 만료 기간 스코프(내년 1분기) 질의 프리셋 렌더', aiAsst.includes('내년 1분기 보증 만료되는 네트워크 장비 목록'))
  // 자산 가치·감가상각 질의 프리셋 — 취득가·잔존가치(장부가) 원가 체인 질의
  check('AI 어시스턴트: 자산 가치·감가상각 질의 프리셋 렌더', aiAsst.includes('자산 가치 현황 (취득가·잔존가치·감가상각)'))
  // 부서별 자산 보유 질의 프리셋 — 비용 배분·차지백 근거(상태별 분포 인텐트와 별개로 부서 집계)
  check('AI 어시스턴트: 부서별 자산 보유 질의 프리셋 렌더', aiAsst.includes('부서별 자산 보유 현황'))
  // 취약점 우선순위·이상 탐지 질의 프리셋 — 컴퓨티드 AI 기능(04·02)을 자연어로 조회
  check('AI 어시스턴트: 취약점 우선순위·이상 탐지 질의 프리셋 렌더', aiAsst.includes('취약점 조치 우선순위 (P1/P2/P3)') && aiAsst.includes('이상 자산 행위 탐지 (프로파일 이탈)'))
  // 교체 대상·수명 예측 질의 프리셋 — AI 기능 03(수명주기·교체 예측) 인라인 질의 (리포트 생성과 별개)
  check('AI 어시스턴트: 교체 대상·수명 예측 질의 프리셋 렌더', aiAsst.includes('교체 대상 자산과 교체 예산 (내용연수·보증·EOL OS)'))
  // 사용자 본인 자산 질의 프리셋 — 사용자도 자연어 질의(본인 자산 보증 만료)를 권한 필터로 답받는다(§01 사용자 본인 자산 조회)
  check('AI 어시스턴트: 사용자 본인 자산 보증 질의 프리셋 렌더', aiAsst.includes('내 자산 보증 만료 현황'))
  check('AI 어시스턴트: 사용자 본인 대여 반환 기한 질의 프리셋 렌더', aiAsst.includes('내 대여 자산 반환 기한'))
  check('AI 어시스턴트: 사용자 본인 QnA 답변 현황 질의 프리셋 렌더', aiAsst.includes('내 문의 답변 현황'))
  // 리포트 생성 프리셋 — 담당자·관리자 전용(생성 권한 게이트). 사용자에겐 미노출, 담당자에겐 노출 (제품안내서 §05 리포트 자동화)
  check('AI 어시스턴트: 리포트 생성 프리셋은 사용자에게 미노출', !aiAsst.includes('월간 자산 현황 리포트 생성'))
  const aiAsstMgr = await (await get('/ai/assistant', 'ASSET_MGR')).text()
  check('AI 어시스턴트: 리포트 생성 프리셋 노출 (담당자)', aiAsstMgr.includes('월간 자산 현황 리포트 생성') && aiAsstMgr.includes('주간 Shadow IT 브리핑 생성'))
  // 상태 문구는 환경에 따라 달라진다(키 유무·호출 성공 여부). 특정 환경을 가정하지 말고
  // '알려진 4상태 중 하나를 근거와 함께 표시하는가'를 본다 — 로컬·배포본 양쪽에서 유효해야 한다.
  const AI_STATES = ['API 키 미설정', '아직 호출 전(미검증)', 'AI 서술 생성 — 최근 성공', 'AI 호출 실패', '온프레미스 LLM 연결됨']
  const showsState = (h) => AI_STATES.some((x) => h.includes(x))
  check('AI 상태: 알려진 상태를 근거와 함께 표시', showsState(aiRep) && showsState(aiAsst))
  const scanHtml2 = await (await get('/discovery/scan', 'SEC_MGR')).text()
  check('스캔 실행: 채널별 수집 현황·이력 렌더', scanHtml2.includes('채널별 수집 현황') && scanHtml2.includes('스캔 이력') && scanHtml2.includes('SCN-RUN-2607-28'))
  check('스캔 실행: 안전장치 문구·실행 UI', scanHtml2.includes('스캔 안전장치') && scanHtml2.includes('스캔 실행') && scanHtml2.includes('허용 시간대'))
  check('스캔 실행: 관측 저장소가 채널별 집계의 원천', scanHtml2.includes('누적 관측'))
  // 재탐지 주기 경과 — 활성 채널인데 마지막 수집이 주기를 넘긴 정체 수집기(Discovery 사각). EASM 재탐지 지연과 동형. 시드 관측이 기준일보다 오래돼 활성 채널이 지연으로 잡힌다.
  check('스캔 실행: 재탐지 주기 경과 채널에 재탐지 지연 칩(정체 수집기 · Discovery 사각)', scanHtml2.includes('재탐지 지연'))
  // 상태바의 마지막 스캔은 하드코딩이 아니라 스캔 이력에서 와야 한다
  check('상태바: 마지막 스캔이 이력에서 파생', scanHtml2.includes('마지막 스캔 2026-07-28 23:00') && scanHtml2.includes('스케줄러 (야간 정책)'))
  // 중단 사유와 시간대 밖 실행 사유는 뜻이 다르다 — override 는 안전장치(허용 시간대) 우회 근거이고,
  //  abortReason 은 회차를 멈춘 근거다. 한 필드에 섞으면 화면이 '시간대 밖'으로 표기해, 창 안에서 멈춘
  //  회차까지 우회한 것으로 읽힌다(감사관 앞의 거짓 지적). 시드의 23:00 중단 회차가 실제로 그랬다 — 창은 23:00~05:00.
  // RSC 는 동적 조각 사이에 <!-- --> 를 넣는다 — 문구를 그대로 찾으려면 먼저 걷어낸다
  const scanText = text(scanHtml2)
  check('스캔 이력: 중단 사유를 중단으로 표기(시간대 밖 우회로 오기하지 않음)',
    scanText.includes('중단 — 민원 대응') && !scanText.includes('시간대 밖 — 민원 대응'))
  // 중단 회차는 대상 범위를 다 돌지 못했다 — 상태 칩만 두면 '끝난 회차'로 읽혀 그 대역이 이번 주기에 통째로 빠진다
  check('스캔 이력: 중단 회차에 범위 미완·재실행 안내', scanHtml2.includes('범위 미완 — 재실행 필요'))
  // 시간대 밖 실행 표기도 실제 회차로 증명한다 — 안전장치를 우회한 근거는 §07 의 증적 그 자체다
  check('스캔 이력: 시간대 밖 실행 사유 표기(안전장치 우회 증적)',
    scanText.includes('시간대 밖 — 침해 의심 단말 긴급 확인'))
  // 카드 제목이 표와 같은 수를 말해야 한다 — 몇 회차를 다시 돌려야 하는지 화면에 적힌 곳이 필요하다(재탐지 지연 지표와 같은 규약)
  // 카드 제목이 표와 같은 수를 말하는가 — 표 셀만 센다(제목 문구와 RSC 플라이트 페이로드가 같은 문자열을
  //  또 담고 있어, HTML 전체로 세면 실제 행 수의 몇 배가 나온다).
  const abortedRows = scanText.split('>범위 미완 — 재실행 필요<').length - 1
  const abortedTitle = /중단 ([0-9]+)회차\(범위 미완/.exec(scanText)
  check(`스캔 이력: 중단 회차 수 = 표의 미완 행 수 (${abortedRows}회차)`,
    abortedRows > 0 && abortedTitle !== null && Number(abortedTitle[1]) === abortedRows,
    `제목=${abortedTitle && abortedTitle[1]} 표=${abortedRows}`)
  // override 가 붙은 회차는 실제로 허용 시간대 밖이어야 한다 — 시드가 안전장치 우회 증적을 잘못 만들면
  //  화면이 그대로 '우회했다'고 감사에 내민다. 회차의 시작 시각을 그 채널의 창과 대조한다.
  const scanStoreSrc = readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf8')
  const winOf = {}
  for (const m of scanStoreSrc.matchAll(/channel: '([^']+)', enabled: \w+, kind: '([^']+)', targets: '[^']*', window: '([^']+)'/g)) winOf[m[1]] = { kind: m[2], window: m[3] }
  const inWin = (win, hhmm) => {
    if (win === '상시') return true
    const [a1, b1] = win.split('~').map((x) => x.trim())
    return a1 <= b1 ? hhmm >= a1 && hhmm <= b1 : hhmm >= a1 || hhmm <= b1
  }
  const overrideRuns = [...scanStoreSrc.matchAll(/startedAt: '([^']+)', [^\n]*?channels: \[([^\]]*)\][^\n]*?override: '([^']*)'/g)]
  const falseOverrides = overrideRuns.filter((m) => {
    const hhmm = m[1].slice(11, 16)
    const chans = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
    return chans.every((c) => { const p = winOf[c]; return !p || p.kind !== '능동' || inWin(p.window, hhmm) })
  })
  check(`스캔 이력: override 는 실제 시간대 밖 회차에만 (${overrideRuns.length}건 검사)`, falseOverrides.length === 0 && overrideRuns.length > 0,
    `창 안인데 override: ${falseOverrides.map((m) => m[1]).join(', ')}`)

  check('외부 공격표면: 재탐지 실행·스케줄 렌더', extHtml.includes('재탐지 실행') && extHtml.includes('능동 협의') && extHtml.includes('재탐지 이력'))
  check('외부 공격표면: 능동 미협의 도메인 표기', extHtml.includes('skl-dev.io') && extHtml.includes('미협의'))
  const extText = text(extHtml)
  // 기한은 실제 날짜에 따라 D-(임박) 또는 기한 경과(지연)로 표시된다 — 둘 중 하나면 정상 (날짜 비의존 검증)
  check('외부 공격표면: 도메인별 주기·기한 표시', extText.includes('7일') && extText.includes('30일') && (extText.includes('D-') || extText.includes('기한 경과')))

  console.log('\n[엑셀 내보내기 — 기능 단위 권한]')
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  for (const kind of ['assets', 'stock', 'discovered', 'contracts', 'approvals', 'disposals', 'loans']) {
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
  for (const kind of ['assets', 'stock', 'discovered', 'contracts', 'approvals', 'disposals', 'loans']) {
    const r = await get(`/api/export/${kind}`, 'USER')
    check(`엑셀 ${kind}: USER 차단 (403)`, r.status === 403, `status=${r.status}`)
  }
  check('엑셀: 미로그인 차단 (401)', (await get('/api/export/assets')).status === 401)
  check('엑셀: 알 수 없는 종류 404', (await get('/api/export/nope', 'ADMIN')).status === 404)
  // 소거 확인서 다운로드 — 권한/상태 가드 (DSP-01 은 결재 대기라 아직 미발급)
  check('소거 확인서: 사용자 차단 (403)', (await get('/api/wipe-cert/DSP-01', 'USER')).status === 403)
  check('소거 확인서: 보안담당 차단 (403)', (await get('/api/wipe-cert/DSP-01', 'SEC_MGR')).status === 403)
  check('소거 확인서: 미완료 건은 미발급 (409)', (await get('/api/wipe-cert/DSP-01', 'ASSET_MGR')).status === 409)
  check('소거 확인서: 없는 건 404', (await get('/api/wipe-cert/NOPE', 'ADMIN')).status === 404)
  const wipeCert = await get('/api/wipe-cert/DSP-00', 'ASSET_MGR')
  const wipeCertBody = await wipeCert.text()
  check('소거 확인서: 완료 폐기 건 발급 (200·문서·확인서번호)', wipeCert.status === 200 && wipeCertBody.includes('데이터 소거 확인서') && wipeCertBody.includes('WIPE-20260722-050'))
  // 증적 사진 — 확인서가 실제 등록된 사진 기록을 나열한다(지어낸 문자열 아님, 감사 무결성)
  check('소거 확인서: 증적 사진 기록 나열 (처리 전·후)', wipeCertBody.includes('증적 사진') && wipeCertBody.includes('처리 전') && wipeCertBody.includes('처리 후'))
  // 폐기 물리 처분 방식 — 완료 건(DSP-00 매각·대금) 표시 + 소거 대기 건(DSP-03) 처분 선택 렌더 + 확인서 기재
  const dispHtml = await (await get('/assets/disposal', 'ASSET_MGR')).text()
  check('폐기: 완료 건에 물리 처분(매각·대금) 표시', dispHtml.includes('매각') && dispHtml.includes('85,000'))
  check('폐기: 소거 대기 건에 처분 방식 선택(기증·반납 옵션)', dispHtml.includes('물리 처분(불용 처리) 방식') && dispHtml.includes('기증') && dispHtml.includes('반납(리스)'))
  check('소거 확인서: 물리 처분(매각·대금) 기재', wipeCertBody.includes('물리 처분') && wipeCertBody.includes('매각') && wipeCertBody.includes('85,000'))
  // 폐기 증적 대장 엑셀 반출 — 감사 대응용 전체 폐기 레코드 (개별 확인서와 별개)
  const dispPage = await (await get('/assets/disposal', 'ASSET_MGR')).text()
  check('폐기 처리: 폐기 증적 대장 엑셀 버튼 노출', dispPage.includes('/api/export/disposals'))
  // 폐기 처리 현황 상태·검색 필터 — 완료분이 쌓여도 진행 중 건을 훑을 수 있게(다른 목록 화면과 동일한 필터 패턴)
  check('폐기 처리 현황: 상태 필터(진행중·완료)·검색 노출', dispPage.includes('진행중') && dispPage.includes('폐기번호·자산번호·모델·사유 검색'))
  // 폐기 증적 대장 엑셀에 처분 방식·매각 대금 컬럼 반출 — DSP-00(매각 85,000) 이 평문으로 들어간다
  const dispBuf = Buffer.from(await (await get('/api/export/disposals', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('폐기 증적 엑셀: 처분 방식·매각 대금 컬럼 반출', dispBuf.includes('처분 방식') && dispBuf.includes('매각') && dispBuf.includes('85000'))
  // 대장 이름이 걸고 있는 '증적' 자체가 반출본엔 건수로만 있었다 — 어떤 장면을 누가 언제 남겼는지가
  //  감사에서 실제로 확인하는 값이다(화면은 구분·설명·등록자·등록일을 모두 보여 준다).
  check('폐기 증적 엑셀: 증적 사진 메타데이터 시트 반출 (구분·설명·등록자·등록일)',
    dispBuf.includes('폐기 증적 사진') && dispBuf.includes('PHO-0001') && dispBuf.includes('디가우징 전 자산 라벨') && dispBuf.includes('처리 후'))
  // 아직 소거 전인 건과 완료인데 값이 비어 있는 건은 감사에서 다른 뜻이다 — 빈 칸으로 뭉뚱그리지 않는다.
  check('폐기 증적 엑셀: 미기재 칸에 사유 표기(소거 전 ≠ 미기재)', dispBuf.includes('소거 전'))
  // 결재번호는 폐기가 승인을 거쳤다는 근거다 — 대장에 없으면 반출본만으로 결재 이력을 대사할 수 없다.
  check('폐기 증적 엑셀: 결재번호 컬럼 반출(승인 근거 대사)', dispBuf.includes('결재번호') && dispBuf.includes('APR-2606-088'))
  // 증적 사진 관리 — 완료 폐기 건에 사진 등록 토글 (제품안내서 §03 폐기: 증적(사진·확인서))
  check('폐기 처리: 완료 건에 증적 사진 관리 토글 노출', dispPage.includes('증적 사진'))
  // 자산 라벨 재발행 — 대장에서 손상·분실 라벨 재출력 (USER 제외, 자산 운영 권한)
  check('라벨 인쇄: 사용자 차단 (403)', (await get('/api/label/AST-2023-000112', 'USER')).status === 403)
  check('라벨 인쇄: 없는 자산 404', (await get('/api/label/NOPE', 'ADMIN')).status === 404)
  // 리포트 열람 API 는 문서 API 중 유일하게 스모크 검사가 하나도 없었다 — 감사 대응 자료·부서별 비용·
  //  취약점 우선순위 같은 전문이 고정 URL 로 나가는 자리인데 가드가 검증되지 않은 채였다.
  check('리포트 열람: 미로그인 차단 (401)', (await get('/api/reports/RPT-NOPE')).status === 401)
  check('리포트 열람: 사용자 차단 (403)', (await get('/api/reports/RPT-NOPE', 'USER')).status === 403)
  check('리포트 열람: 없는 리포트 404 (권한 통과 후)', (await get('/api/reports/RPT-NOPE', 'ADMIN')).status === 404)
  // 인증 안 됨(401)과 권한 없음(403)을 가른다 — 형제 문서 API 는 이미 나누는데 셋만 미로그인을 403 으로
  //  뭉뚱그려, 호출자가 '로그인하라'와 '너는 안 된다'를 구분할 수 없었다.
  check('라벨 인쇄: 미로그인 차단 (401 · 403 과 구분)', (await get('/api/label/AST-2023-000112')).status === 401)
  check('소거 확인서: 미로그인 차단 (401 · 403 과 구분)', (await get('/api/wipe-cert/DSP-00')).status === 401)
  const label = await get('/api/label/AST-2023-000112', 'ASSET_MGR')
  const labelBody = await label.text()
  check('라벨 인쇄: 자산담당 발급 (200·QR·바코드)', label.status === 200 && labelBody.includes('AST-2023-000112') && labelBody.includes('SEEKERSLAB') && labelBody.includes('<svg'))
  // 바코드가 자산번호에 따라 실제로 인코딩되는지 — 상수·빈 바코드 회귀 방지 (Code128-B 모듈이 자산마다 다르고 다수의 바로 구성)
  const label2Body = await (await get('/api/label/AST-2023-000113', 'ASSET_MGR')).text()
  const barcodeOf = (h) => (h.match(/<svg[^>]*viewBox="0 0 300 52"[\s\S]*?<\/svg>/) || [''])[0]
  const bc1 = barcodeOf(labelBody), bc2 = barcodeOf(label2Body)
  check('라벨 인쇄: 바코드가 자산번호별로 인코딩됨(상수·빈값 아님)', bc1.length > 0 && bc1 !== bc2 && (bc1.match(/<rect/g) || []).length > 20)
  // 바코드가 '자산번호로 되읽히는가' — 위 검사는 바코드가 상수가 아니고 바가 여럿이라는 것만 본다.
  //  패턴표 오타·체크섬 계산 오류·START/STOP 누락은 자산마다 다른 바코드를 그대로 만들어 내므로 통과한다.
  //  그런데 재물조사 실사는 이 라벨을 스캔해 자산을 식별한다 — 스캐너가 다른 값을 읽으면 실사 결과가
  //  통째로 어긋나고, 화면상으로는 아무 이상이 없다. 그려진 SVG 를 모듈 열로 되돌려 실제로 디코드한다.
  //  (1) 패턴표 자체를 Code128 의 독립 성질로 검증한다 — 표를 그대로 써서 디코드하면 표 오타는
  //      되읽기만으로 못 잡기 때문이다: 107개 · 11모듈 · 전부 상이 · '1'로 시작 · 런 6개(바3·공백3).
  //  (2) 라벨 SVG 를 디코드해 자산번호와 같은지, 체크섬을 스모크가 직접 계산해 맞는지 본다.
  const labelSrc = readFileSync(path.join(ROOT, 'lib', 'label.ts'), 'utf8')
  const pat = [...(/const CODE128_PATTERNS = \[([\s\S]*?)\]/.exec(labelSrc)?.[1] ?? '').matchAll(/'(\d+)'/g)].map((m) => m[1])
  const stopPat = /const STOP = '(\d+)'/.exec(labelSrc)?.[1] ?? ''
  const runsOf = (x) => x.replace(/(.)\1*/g, 'x').length
  const tableOk = pat.length === 107 && new Set(pat).size === 107
    && pat.every((p) => p.length === 11 && p.startsWith('1') && runsOf(p) === 6)
  check(`라벨 바코드: Code128 패턴표가 규격 성질을 만족(${pat.length}개 · 11모듈 · 상이 · 런 6)`, tableOk && stopPat.length === 13)

  const decodeBarcode = (svg) => {
    const vb = /viewBox="0 0 (\d+) \d+"/.exec(svg)
    if (!vb) return { err: 'viewBox 없음' }
    const rects = [...svg.matchAll(/<rect x="([\d.]+)"[^>]*width="([\d.]+)"/g)].map((m) => ({ x: Number(m[1]), w: Number(m[2]) }))
    if (!rects.length) return { err: '바 없음' }
    const mw = rects[0].w
    const mods = new Array(Math.round(Number(vb[1]) / mw)).fill('0')
    for (const r of rects) mods[Math.round(r.x / mw)] = '1'
    let str = mods.join('')
    if (!str.endsWith(stopPat)) return { err: 'STOP 없음' }
    str = str.slice(0, -stopPat.length)
    const codes = []
    for (let i = 0; i + 11 <= str.length; i += 11) {
      const idx = pat.indexOf(str.slice(i, i + 11))
      if (idx < 0) return { err: '표에 없는 패턴' }
      codes.push(idx)
    }
    if (codes.length < 3) return { err: '코드 부족' }
    const chk = codes.pop()
    const calc = codes.reduce((sum, c, i) => sum + (i === 0 ? c : c * i), 0) % 103
    if (chk !== calc) return { err: `체크섬 ${chk} ≠ ${calc}` }
    if (codes[0] !== 104) return { err: 'START-B 아님' }
    return { text: codes.slice(1).map((c) => String.fromCharCode(c + 32)).join('') }
  }
  const decNos = ['AST-2023-000112', 'AST-2023-000113']
  const decBad = []
  for (const no of decNos) {
    const body = no === 'AST-2023-000112' ? labelBody : label2Body
    const d = decodeBarcode(barcodeOf(body))
    if (d.text !== no) decBad.push(`${no}→${d.err ?? d.text}`)
  }
  check(`라벨 바코드: SVG 를 디코드하면 자산번호가 그대로 나온다(${decNos.length}건 · 체크섬 재계산 포함)`,
    decBad.length === 0, `불일치=${decBad.join(', ')}`)

  // QR 도 자산번호별로 인코딩된다 — QR SVG(모듈 <path>)가 자산마다 다름(상수 QR 회귀 방지)
  const qrOf = (h) => ((h.match(/<svg[\s\S]*?<\/svg>/g) || []).find((s) => s.includes('<path')) || '')
  const qr1 = qrOf(labelBody), qr2 = qrOf(label2Body)
  check('라벨 인쇄: QR 이 자산번호별로 인코딩됨(상수 아님)', qr1.length > 0 && qr1 !== qr2)
  // 라벨 일괄 인쇄 — 다중 선택 자산 라벨을 한 장에 (선택 내보내기와 같은 nos 방식)
  check('라벨 일괄: 사용자 차단 (403)', (await get('/api/labels?nos=AST-2023-000112', 'USER')).status === 403)
  check('라벨 일괄: 빈 선택 400', (await get('/api/labels', 'ASSET_MGR')).status === 400)
  const labels = await get('/api/labels?nos=' + encodeURIComponent('AST-2023-000112,AST-2023-000113'), 'ASSET_MGR')
  const labelsBody = await labels.text()
  check('라벨 일괄: 선택 2건 라벨 발급 (200·둘 다·QR/바코드)', labels.status === 200 && labelsBody.includes('AST-2023-000112') && labelsBody.includes('AST-2023-000113') && (labelsBody.match(/<svg/g) ?? []).length >= 4)
  // 자산 카드 — 전체 프로필·이력 인쇄용 dossier
  check('자산 카드: 미로그인 차단 (401)', (await get('/api/asset-card/AST-2023-000112')).status === 401)
  check('자산 카드: 없는 자산 404', (await get('/api/asset-card/NOPE', 'ADMIN')).status === 404)
  const cardMgr = await get('/api/asset-card/AST-2023-000112', 'ASSET_MGR')
  const cardBody = await cardMgr.text()
  check('자산 카드: 자산담당 발급 (200·프로필·이력·QR)', cardMgr.status === 200 && cardBody.includes('AST-2023-000112') && cardBody.includes('변경 이력') && cardBody.includes('DOSSIER') && cardBody.includes('<svg'))
  // 배정 라이선스 좌석 섹션 — 이 자산이 물고 있는 SW 라이선스(로56·57)를 dossier 에 남긴다(인수인계·감사·회수 대상). 시드 AST-2023-000112 는 LIC-004 AutoCAD 좌석.
  check('자산 카드: 배정 라이선스 좌석 섹션(인수인계·감사 dossier)', cardBody.includes('배정 라이선스 좌석') && cardBody.includes('AutoCAD LT'))
  // 폐기 절차 표기 — 상태는 유휴·사용중 그대로인데 파기 예정으로 잡힌 자산이다(가용 재고·불출 가드는 이미 제외).
  //  화면 상세는 재불출·대여를 막으며 사유를 밝히지만 인쇄 카드·엑셀에는 흔적이 없어, 반출본만 보면 평범한 재고로
  //  읽혀 현장에서 다시 배정될 수 있다(격리 표기 전파와 같은 규약). 시드 DSP-02(AST-2021-000432 · 대상 선정).
  const cardDisp = await (await get('/api/asset-card/AST-2021-000432', 'ASSET_MGR')).text()
  check('자산 카드: 폐기 절차 진행 자산에 단계 표기(재불출·대여 대상 아님)', cardDisp.includes('폐기 절차') && cardDisp.includes('대상 선정'))
  check('자산 카드: 폐기 절차 아닌 자산에는 미표기(양성 대조)', !cardBody.includes('폐기 절차'))
  const assetsXlsx = Buffer.from(await (await get('/api/export/assets', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('자산 대장 엑셀: 폐기 절차 열 + 진행 단계 반출', assetsXlsx.includes('폐기 절차') && assetsXlsx.includes('대상 선정'))
  // 반환 기한 표기 — 날짜만 찍으면 인쇄물에서 연체인지 알 수 없다. 화면·대여 대장 엑셀·대여 확인서가 모두
  //  연체·D-day 를 함께 밝히는데 카드만 맨 날짜였다(시드 AST-2023-000450 은 기한 경과분).
  const cardLoanOver = await (await get('/api/asset-card/AST-2023-000450', 'ASSET_MGR')).text()
  check('자산 카드: 연체 대여 자산의 반환 기한에 연체 표기', cardLoanOver.includes('반환 기한') && cardLoanOver.includes('연체'))
  const cardLoanOk = await (await get('/api/asset-card/AST-2024-000995', 'ASSET_MGR')).text()
  check('자산 카드: 기한 내 대여 자산은 D-day 표기(연체 아님)', cardLoanOk.includes('D-') && !cardLoanOk.includes('연체'))
  // 최근 실측도 같은 문제였다 — 화면은 '장기 미실측' 칩·필터로 세는데 카드는 맨 날짜만 찍어, 인쇄물만으로는
  //  이 자산이 실사 대상인지 알 수 없었다(시드 AST-2020-000883 은 실측 9개월 경과).
  const cardStale = await (await get('/api/asset-card/AST-2020-000883', 'ASSET_MGR')).text()
  check('자산 카드: 장기 미실측 자산의 최근 실측에 미실측 표기', cardStale.includes('최근 실측') && cardStale.includes('장기 미실측'))
  check('자산 카드: 최근 실측이 최신인 자산에는 미표기(양성 대조)', !cardBody.includes('장기 미실측'))
  // 데이터 스코핑 — USER 는 본인 자산 카드만
  check('자산 카드: USER 본인 자산은 발급 (200)', (await get('/api/asset-card/AST-2023-000112', 'USER')).status === 200)
  check('자산 카드: USER 타인 자산은 차단 (403)', (await get('/api/asset-card/AST-2023-000561', 'USER')).status === 403)
  // 분실·도난 신고서 — 분실 상태 자산의 사건 개요·정황·자산 가액을 인쇄용 문서로(보험·보안·감사). 분실 아님 자산은 400(신고서 대상 아님). 실제 분실 자산 내용 검증은 e2e.
  check('분실·도난 신고서: 미로그인 차단 (401)', (await get('/api/loss-report/AST-2023-000112')).status === 401)
  check('분실·도난 신고서: 사용자 차단 (403)', (await get('/api/loss-report/AST-2023-000112', 'USER')).status === 403)
  check('분실·도난 신고서: 분실 상태 아님 자산은 대상 아님 (400)', (await get('/api/loss-report/AST-2023-000112', 'ASSET_MGR')).status === 400)
  check('분실·도난 신고서: 없는 자산 404', (await get('/api/loss-report/NOPE', 'ASSET_MGR')).status === 404)
  // 대여 확인서 — 대여 중 자산의 반출 책임·반환 의무 서면 증적. 대여 중 아닌 자산은 대상 아님(400). 시드 AST-2024-000230(김민준 대여, 반환 2026-08-20).
  check('대여 확인서: 미로그인 차단 (401)', (await get('/api/loan-agreement/AST-2024-000230')).status === 401)
  check('대여 확인서: 사용자 차단 (403)', (await get('/api/loan-agreement/AST-2024-000230', 'USER')).status === 403)
  check('대여 확인서: 대여 중 아닌 자산은 대상 아님 (400)', (await get('/api/loan-agreement/AST-2023-000112', 'ASSET_MGR')).status === 400)
  const loanAgr = await (await get('/api/loan-agreement/AST-2024-000230', 'ASSET_MGR')).text()
  check('대여 확인서: 대여자·반환 기한·대여 조건 렌더', loanAgr.includes('LOAN AGREEMENT') && loanAgr.includes('김민준') && loanAgr.includes('2026-08-20') && loanAgr.includes('대여 조건'))
  // 대여일 회귀 — 연장 승인·반려·취소도 kind '대여'라 reverse().find('대여')만 쓰면 대여일이 최신 연장 조치일로 흐른다. AST-2024-000230: 최초 대여 2026-07-28 + 연장 반려 2026-08-12 → 대여일은 2026-07-28.
  check('대여 확인서: 대여일은 최초 대여일(연장 조치일로 흐르지 않음)', loanAgr.includes('2026-07-28') && !loanAgr.includes('2026-08-12'))
  // 대여 대장(엑셀) 대여일 회귀 — 확인서와 동일 규약. AST-2023-000450 은 결재 경유 대여('대여 신청 승인 —', '대여 —' 표기 없음) + 연장 반려(2026-07-13)라,
  //  '대여 —' 양성매칭만 쓰면 대여일이 최신 연장 조치일(2026-07-13)로 흐른다 → '연장' 제외 매칭으로 최초 대여(2026-07-08)를 잡아야 한다.
  const loansTxt = Buffer.from(await (await get('/api/export/loans', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('대여 대장 반출: 결재 경유 대여의 대여일이 최초 대여일(2026-07-08 · 연장 조치일 아님)', loansTxt.includes('AST-2023-000450') && loansTxt.includes('2026-07-08') && !loansTxt.includes('2026-07-13'))
  const loanSel = await (await get('/assets/register?sel=AST-2024-000230', 'ASSET_MGR')).text()
  check('자산 대장: 대여 중 자산 상세에 대여 확인서 인쇄 링크', loanSel.includes('/api/loan-agreement/AST-2024-000230'))
  // 수리중 자산 카드에 수리 의뢰(업체·예상반환) 행 — 상세·엑셀과 일관. 시드 AST-2024-000512(중부IT서비스)로 검증
  const cardRepair = await (await get('/api/asset-card/AST-2024-000512', 'ASSET_MGR')).text()
  check('자산 카드: 수리중 자산에 수리 의뢰 행(업체·예상반환)', cardRepair.includes('수리 의뢰') && cardRepair.includes('중부IT서비스') && cardRepair.includes('예상반환 2026-07-28'))
  // CMDB 의존 관계·영향 범위(blast radius) — 시드 그래프 스위치(640)→서버(221·561)→VM(618). 스위치 장애 시 영향 3대. 자산 카드 dossier 에 상위 의존·blast radius 표기.
  const cardSwitch = await (await get('/api/asset-card/AST-2022-000640', 'ASSET_MGR')).text()
  check('자산 카드: CMDB 의존 관계·영향 범위(스위치 640 장애 시 3대 영향)', cardSwitch.includes('상위 의존') && cardSwitch.includes('영향 범위') && cardSwitch.includes('3대'))
  // 의존 토폴로지 다이어그램 — 인라인 SVG(상위 641 → 640 → 하위 221·561). 인쇄용 카드라 외부 라이브러리 없이 자체 렌더.
  check('자산 카드: 의존 토폴로지 SVG 다이어그램(상위 641·하위 561 노드)', cardSwitch.includes('의존 토폴로지') && cardSwitch.includes('<svg') && cardSwitch.includes('AST-2022-000641') && cardSwitch.includes('AST-2023-000561'))
  // 변경 이력 이벤트 종류별 색(화면 타임라인과 동일 언어) — 모든 자산은 등록 이벤트가 있어 진입(녹 #12805c) 색이 인쇄 카드에도 적용된다.
  check('자산 카드: 변경 이력 이벤트 종류별 색(등록=진입 녹)', cardSwitch.includes('변경 이력') && cardSwitch.includes('color:#12805c'))
  // 상태 배지 톤(대장 상태 칩과 동일) — AST-2022-000640 은 사용중이라 정상(녹) 배지. 인쇄 카드에서도 상태가 색으로 도드라진다.
  check('자산 카드: 상태 배지 종류별 색(사용중=정상 녹 배지)', cardSwitch.includes('background:#e4f5ee;color:#12805c'))
  // 정기 점검 예정 행 — 예방 정비 일정(로55)이 잡힌 자산 dossier 에 다음 점검 예정일을 남긴다(인수인계·유지보수 참고). 시드 AST-2022-000640(예정 2026-06-15).
  const cardMaint = await (await get('/api/asset-card/AST-2022-000640', 'ASSET_MGR')).text()
  check('자산 카드: 정기 점검 예정 행(예방 정비 일정)', cardMaint.includes('정기 점검 예정') && cardMaint.includes('2026-06-15'))
  // 날짜만으로는 이 자산이 점검을 넘겼는지 알 수 없다 — 화면·대시보드 큐는 점검 도래·경과(미시행)를 세는데
  //  카드·엑셀만 맨 날짜였다(대여 반환 기한이 연체를 함께 밝히는 규약과 같은 자리). 시드 640 은 예정일 경과분.
  check('자산 카드: 정기 점검 경과 자산에 미시행 표기', cardMaint.includes('점검 경과'))
  const maintXlsx = Buffer.from(await (await get('/api/export/assets', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('자산 대장 엑셀: 정기 점검 예정에 경과 표기', maintXlsx.includes('점검 경과'))
  // 자산 카드 누적 수리비 행 — 수리 비용 이력이 있는 자산(AST-2023-000112, 누계 243,000원 2건)에 노출
  const cardCost = await (await get('/api/asset-card/AST-2023-000112', 'ASSET_MGR')).text()
  check('자산 카드: 수리 이력 자산에 누적 수리비 행(자사 부담 TCO · 무상 보증 청구 제외)', cardCost.includes('누적 수리비') && cardCost.includes('243,000원') && cardCost.includes('2건 · 자사 부담'))
  check('자산 카드: 취득가·TCO 행(취득 1,680,000 + 수리 = 1,923,000)', cardCost.includes('취득가') && cardCost.includes('1,680,000원') && cardCost.includes('TCO(취득+수리)') && cardCost.includes('1,923,000원'))
  check('자산 카드: 잔존가치(장부가·정액법) 행', cardCost.includes('잔존가치(장부가)') && cardCost.includes('정액법 상각'))
  // 보증 상태 — AST-2023-000112(보증 2026-03 경과)는 카드 보증 만료 행에 '· 보증 만료' 표기
  check('자산 카드: 보증 만료 행에 보증 상태(만료)', cardCost.includes('· 보증 만료'))
  // CSV 일괄 등록 템플릿 — 형식 안내용 다운로드
  check('CSV 템플릿: 미로그인 차단 (401)', (await get('/api/asset-template.csv')).status === 401)
  check('CSV 템플릿: 사용자 차단 (403)', (await get('/api/asset-template.csv', 'USER')).status === 403)
  const tmpl = await get('/api/asset-template.csv', 'ASSET_MGR')
  const tmplBody = await tmpl.text()
  check('CSV 템플릿: 자산담당 발급 (200·CSV·헤더·예시)', tmpl.status === 200 && (tmpl.headers.get('content-type') ?? '').includes('text/csv') && tmplBody.includes('유형,모델,시리얼') && tmplBody.includes('ThinkPad'))
  // 전역 통합 검색 — 자산·계약·발견·사용자·결재 교차 검색, 화면 권한대로 스코핑
  check('통합 검색: 미로그인 차단 (401)', (await get('/api/search?q=CT-2023')).status === 401)
  check('통합 검색: 2자 미만은 빈 결과', (await (await get('/api/search?q=C', 'ADMIN')).json()).groups.length === 0)
  const srchAdmin = await (await get('/api/search?q=' + encodeURIComponent('CT-2023-014'), 'ADMIN')).json()
  check('통합 검색: Admin이 계약을 교차 검색', srchAdmin.groups.some((g) => g.kind === '계약·라이선스' && g.items.some((i) => i.href.includes('/inventory/contracts'))))
  const srchDisc = await (await get('/api/search?q=DESKTOP-UNK09', 'SEC_MGR')).json()
  // 발견 자산 검색 결과는 특정 자산 상세로 딥링크(?sel=) — 자산·계약·게시판 딥링크와 동형(그동안 발견은 화면으로만 이동)
  check('통합 검색: 보안담당이 발견 자산을 교차 검색(상세 딥링크 ?sel=)', srchDisc.groups.some((g) => g.kind === '발견 자산' && g.items.some((i) => i.href.includes('/discovery/found?sel=DSC-'))))
  // Shadow SaaS 교차 검색 — 서비스명(Notion)으로 Shadow SaaS 현황 점프. 다른 목록 엔티티와 동일하게 전역 검색 포함.
  const srchSaas = await (await get('/api/search?q=Notion', 'SEC_MGR')).json()
  check('통합 검색: 보안담당이 Shadow SaaS를 교차 검색(Notion)', srchSaas.groups.some((g) => g.kind === 'Shadow SaaS' && g.items.some((i) => i.href.includes('/discovery/saas'))))
  const srchSaasUser = await (await get('/api/search?q=Notion', 'USER')).json()
  check('통합 검색: 사용자에겐 Shadow SaaS 그룹 미노출(권한 스코핑)', !srchSaasUser.groups.some((g) => g.kind === 'Shadow SaaS'))
  // 위협·노출 교차 검색 — 외부 공격표면·IOC·크리덴셜·다크웹을 IOC IP(시드 IOC-02 185.220.101.44)로 찾아 외부 위협 화면으로. 발견·Shadow SaaS 는 검색되는데 위협만 누락됐던 부분 커버리지 보완.
  const srchThreat = await (await get('/api/search?q=' + encodeURIComponent('185.220.101.44'), 'SEC_MGR')).json()
  check('통합 검색: 보안담당이 위협·노출(IOC 상관)을 교차 검색(외부 위협 화면)', srchThreat.groups.some((g) => g.kind === '위협·노출' && g.items.some((i) => i.href.includes('/discovery/external'))))
  const srchThreatUser = await (await get('/api/search?q=' + encodeURIComponent('185.220.101.44'), 'USER')).json()
  check('통합 검색: 사용자에겐 위협·노출 그룹 미노출(권한 스코핑 · 위협 도메인 밖)', !srchThreatUser.groups.some((g) => g.kind === '위협·노출'))
  const srchUser = await (await get('/api/search?q=' + encodeURIComponent('CT-2023-014'), 'USER')).json()
  check('통합 검색: 사용자에겐 계약 그룹 미노출(권한 스코핑)', !srchUser.groups.some((g) => g.kind === '계약·라이선스'))
  const srchAsset = await (await get('/api/search?q=AST-2023-000112', 'ASSET_MGR')).json()
  check('통합 검색: 자산 매칭이 sel 딥링크로 점프', srchAsset.groups.some((g) => g.kind === '자산' && g.items.some((i) => i.href.includes('sel=AST-2023-000112'))))
  // 폐기·입고 교차 검색 — 입고 SR 번호(SR-2607-041)·폐기 자산으로 찾는다
  const srchLot = await (await get('/api/search?q=' + encodeURIComponent('SR-2607-041'), 'ASSET_MGR')).json()
  check('통합 검색: 입고 로트를 SR·발주 번호로 검색', srchLot.groups.some((g) => g.kind === '폐기·입고' && g.items.some((i) => i.href.includes('/assets/intake'))))
  const srchUserLot = await (await get('/api/search?q=' + encodeURIComponent('SR-2607-041'), 'USER')).json()
  check('통합 검색: 사용자에겐 폐기·입고 그룹 미노출(권한 스코핑)', !srchUserLot.groups.some((g) => g.kind === '폐기·입고'))
  // 게시판 교차 검색 — 공지·QnA 도 검색되어 해당 게시글로 딥링크(?sel=). '프록시'는 NTC-02 본문에만 있어 게시판 매칭을 명확히 검증
  const srchBoard = await (await get('/api/search?q=' + encodeURIComponent('프록시'), 'USER')).json()
  check('통합 검색: 게시판(공지·QnA) 교차 검색 + sel 딥링크', srchBoard.groups.some((g) => g.kind === '게시판' && g.items.some((i) => i.href.includes('/board/notices?sel=NTC-02'))))
  // 선택 내보내기 — nos= 자산번호로 선택분만 반출(무압축 inlineStr라 버퍼에 평문)
  const selXlsx = await get('/api/export/assets?nos=' + encodeURIComponent('AST-2023-000112,AST-2023-000113'), 'ASSET_MGR')
  const selBuf = Buffer.from(await selXlsx.arrayBuffer())
  const selTxt = selBuf.toString('utf8')
  check('선택 내보내기: 선택 자산만 포함(112·113 포함, 561 미포함)', selXlsx.status === 200 && selTxt.includes('AST-2023-000112') && selTxt.includes('AST-2023-000113') && !selTxt.includes('AST-2023-000561'))
  // 상태 필터 반출 — 화면 필터(상태)를 그대로 반영(대여중만: 대여 자산 포함, 사용중 자산 제외)
  const statusXlsx = await get('/api/export/assets?status=' + encodeURIComponent('대여중'), 'ASSET_MGR')
  const statusTxt = Buffer.from(await statusXlsx.arrayBuffer()).toString('utf8')
  check('자산 내보내기: 상태 필터(대여중) 반영 — 대여 자산만', statusXlsx.status === 200 && statusTxt.includes('AST-2024-000230') && statusTxt.includes('AST-2023-000450') && !statusTxt.includes('AST-2023-000112'))
  check('선택 내보내기: 감사 로그에 남는지는 감사 화면 검증 — 여기선 xlsx 시그니처', selBuf.slice(0, 2).toString('binary') === 'PK')
  // 반출은 화면에 보이는 그 집합 — 계약·폐기·SaaS 는 화면에 필터가 있는데도 버튼이 전체를 내보냈고,
  //  그 사실을 파일 어디에도 적지 않았다(감사 로그·발송 이력 반출은 이미 범위를 감사 기록에 적는 규약).
  //  화면이 보여 준 행 ID(ids)와 사람이 읽는 필터 설명(scope)을 받아 좁히고, 첫 시트에 범위를 밝힌다.
  const xlsxText = async (url, role) => Buffer.from(await (await get(url, role)).arrayBuffer()).toString('utf8')
  //  반출본에 id 열이 있는 종류는 id 로, 없는 종류(SaaS)는 서비스명으로 대조한다.
  //  out 값은 필터 밖의 행 — 부분 반출에 그 행이 남아 있으면 필터가 먹지 않은 것이다.
  //  CT-2024-011 은 어느 라이선스도 근거로 삼지 않는 계약이라, 라이선스 시트에 이름이 새어 들어오지 않는다.
  const idFilteredKinds = [
    { kind: 'contracts', role: 'ASSET_MGR', ids: 'CT-2023-002', keep: 'CT-2023-002', out: 'CT-2024-011', scope: '계약 구분=유지보수' },
    { kind: 'disposals', role: 'ASSET_MGR', ids: 'DSP-01', keep: 'DSP-01', out: 'DSP-03', scope: '상태=결재 대기' },
    { kind: 'saasCatalog', role: 'SEC_MGR', ids: 'CAT-04', keep: 'Miro', out: 'Notion', scope: '검토 대기만' },
    { kind: 'saas', role: 'SEC_MGR', ids: 'SAS-04', keep: 'Miro', out: 'Notion', scope: '부서=플랫폼개발팀' },
  ]
  for (const t of idFilteredKinds) {
    const full = await xlsxText(`/api/export/${t.kind}`, t.role)
    const part = await xlsxText(`/api/export/${t.kind}?ids=${encodeURIComponent(t.ids)}&scope=${encodeURIComponent(t.scope)}`, t.role)
    check(`반출 필터(${t.kind}): 화면이 보여 준 행만 담긴다`,
      full.includes(t.keep) && full.includes(t.out) && part.includes(t.keep) && !part.includes(t.out),
      `전체에 out=${full.includes(t.out)} / 부분에 out=${part.includes(t.out)} / 부분에 keep=${part.includes(t.keep)}`)
    check(`반출 필터(${t.kind}): 부분 반출임을 파일이 밝힌다(반출 범위 시트)`,
      part.includes('반출 범위') && part.includes(t.scope) && part.includes('전체 대장이 아닙니다') && !full.includes('반출 범위'))
  }
  // 반출 기록도 범위를 남긴다 — 감사 로그 반출이 이미 지키는 규약(누가 무엇을 어떤 범위로 받았는가)
  await get(`/api/export/disposals?ids=DSP-01&scope=${encodeURIComponent('상태=결재 대기')}`, 'ASSET_MGR')
  const expAudit = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('반출 필터: 부분 반출이 감사 기록에 범위와 함께 남는다', expAudit.includes('상태=결재 대기'))
  // 감사 로그 엑셀 내보내기 — 보안담당·Admin 만 (컴플라이언스 반출)
  check('감사 로그 엑셀: 미로그인 차단 (401)', (await get('/api/audit-export')).status === 401)
  check('감사 로그 엑셀: 사용자 차단 (403)', (await get('/api/audit-export', 'USER')).status === 403)
  check('감사 로그 엑셀: 자산담당 차단 (403)', (await get('/api/audit-export', 'ASSET_MGR')).status === 403)
  const auditXlsx = await get('/api/audit-export', 'SEC_MGR')
  check('감사 로그 엑셀: 보안담당 발급 (200·xlsx)', auditXlsx.status === 200 && (auditXlsx.headers.get('content-type') ?? '').includes('spreadsheet'))
  const fullLen = Number(auditXlsx.headers.get('content-length') ?? 0)
  // 감사 증적(export) 열 순서 = 화면 감사 뷰(AuditLog)와 일치 — 접근 IP · 결과 순. 어긋나면 감사 대사 신뢰성 저하(§07). 무압축 inlineStr라 버퍼 평문에서 헤더 순서를 검증(그전엔 결과·접근 IP 로 화면과 뒤바뀜).
  const auditBuf = Buffer.from(await auditXlsx.arrayBuffer()).toString('utf8')
  check('감사 로그 엑셀: 열 순서가 화면(AuditLog)과 일치 — 접근 IP · 결과 순', auditBuf.indexOf('접근 IP') > 0 && auditBuf.indexOf('접근 IP') < auditBuf.indexOf('결과'))
  const auditFiltered = await get('/api/audit-export?result=' + encodeURIComponent('실패'), 'SEC_MGR')
  const filtLen = Number(auditFiltered.headers.get('content-length') ?? 0)
  check('감사 로그 엑셀: 화면 필터 반영 반출 (결과=실패는 전체보다 작음)', auditFiltered.status === 200 && filtLen > 0 && filtLen < fullLen, `full=${fullLen} filtered=${filtLen}`)
  // 기간(감사 대응) 필터 — 범위 밖(미래) 기간은 0건이라 전체보다 작다
  const auditDated = await get('/api/audit-export?from=2099-01-01', 'SEC_MGR')
  const datedLen = Number(auditDated.headers.get('content-length') ?? 0)
  check('감사 로그 엑셀: 기간(from/to) 필터 반영 반출', auditDated.status === 200 && datedLen > 0 && datedLen < fullLen, `full=${fullLen} dated=${datedLen}`)
  // 알림 발송 이력 엑셀 — 발송 증적 반출 (보안담당·Admin, 화면 필터 반영)
  check('발송 이력 엑셀: 미로그인 차단 (401)', (await get('/api/dispatch-export')).status === 401)
  check('발송 이력 엑셀: 사용자 차단 (403)', (await get('/api/dispatch-export', 'USER')).status === 403)
  const dispXlsx = await get('/api/dispatch-export', 'SEC_MGR')
  check('발송 이력 엑셀: 보안담당 발급 (200·xlsx)', dispXlsx.status === 200 && (dispXlsx.headers.get('content-type') ?? '').includes('spreadsheet'))
  const dFull = Number(dispXlsx.headers.get('content-length') ?? 0)
  // 전달 상태 열 정합 — 화면 발송 이력에 추가된 전달 상태(발송/실패)가 반출 엑셀에도 실린다(시드 MSG-4004 전달 실패). screen↔export 정합.
  const dispText = Buffer.from(await (await get('/api/dispatch-export', 'ADMIN')).arrayBuffer()).toString('utf8')
  check('발송 이력 엑셀: 전달 상태 열 반영(전달 실패 MSG-4004 포함)', dispText.includes('전달 상태') && dispText.includes('MSG-4004') && dispText.includes('실패'))
  const dispFiltered = await get('/api/dispatch-export?channel=' + encodeURIComponent('문자'), 'SEC_MGR')
  const dFilt = Number(dispFiltered.headers.get('content-length') ?? 0)
  check('발송 이력 엑셀: 화면 필터 반영 반출 (채널=문자는 전체보다 작음)', dispFiltered.status === 200 && dFilt > 0 && dFilt < dFull, `full=${dFull} filtered=${dFilt}`)
  // 기간(발송 증적) 필터 — 범위 밖(미래) 기간은 0건이라 전체보다 작다
  const dispDated = await get('/api/dispatch-export?from=2099-01-01', 'SEC_MGR')
  const dDated = Number(dispDated.headers.get('content-length') ?? 0)
  check('발송 이력 엑셀: 기간(from/to) 필터 반영 반출', dispDated.status === 200 && dDated > 0 && dDated < dFull, `full=${dFull} dated=${dDated}`)
  const stockXlsx = await get('/api/export/stock', 'SEC_MGR')
  check('엑셀 stock: 보안담당은 권한 밖 (403)', stockXlsx.status === 403, `status=${stockXlsx.status}`)
  const regHtml2 = await (await get('/assets/register', 'ASSET_MGR')).text()
  check('자산 대장: 엑셀 버튼 노출 (자산담당)', regHtml2.includes('/api/export/assets'))
  const asFull = await get('/api/export/assets', 'ASSET_MGR')
  const asFullLen = Number(asFull.headers.get('content-length') ?? 0)
  const asFilt = await get('/api/export/assets?cat=' + encodeURIComponent('단말'), 'ASSET_MGR')
  const asFiltLen = Number(asFilt.headers.get('content-length') ?? 0)
  check('자산 대장 엑셀: 화면 필터 반영 반출 (유형=단말은 전체보다 작음)', asFilt.status === 200 && asFiltLen > 0 && asFiltLen < asFullLen, `full=${asFullLen} filtered=${asFiltLen}`)
  // 감사 완결 컬럼 — 최근 실측(장기 미실측 근거일)·수리 의뢰(업체·예상반환). 시드 수리중 자산의 업체명이 반출본에 평문으로 들어간다.
  const asBuf = Buffer.from(await (await get('/api/export/assets', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('자산 대장 엑셀: 최근 실측·수리 의뢰 컬럼 반출(감사 완결)', asBuf.includes('최근 실측') && asBuf.includes('수리 의뢰') && asBuf.includes('중부IT서비스'))
  // 취득가·TCO 컬럼 반출 — AST-2023-000112 취득가 1680000 · TCO 1923000 이 숫자셀 평문으로 들어간다
  check('자산 대장 엑셀: 취득가·TCO 컬럼 반출', asBuf.includes('취득가') && asBuf.includes('TCO') && asBuf.includes('1680000') && asBuf.includes('1923000'))
  check('자산 대장 엑셀: 잔존가치 컬럼 반출', asBuf.includes('잔존가치'))
  // 보증상태 컬럼 반출 — 보증 내/임박/만료 상태를 감사 반출에 반영(v1.194 스윕)
  check('자산 대장 엑셀: 보증상태 컬럼 반출', asBuf.includes('보증상태') && asBuf.includes('보증 내'))
  // 대여 반환 기한 — 수리 의뢰 열은 있는데 대여는 없어, 반출본만으로는 대여중 자산이 언제 돌아오는지·연체인지 알 수 없었다.
  check('자산 대장 엑셀: 대여 반환 기한 컬럼 반출(정상 기한)',
    asBuf.includes('대여 반환 기한') && asBuf.includes('2026-12-01'))
  check('자산 대장 엑셀: 연체 대여는 연체 표기(화면 큐와 같은 판정)', asBuf.includes('(연체)'))
  // 누적 수리비 컬럼 — 자산 TCO 반출. 시드 AST-2023-000112 누계 243000 이 평문으로 들어간다.
  check('자산 대장 엑셀: 누적 수리비 컬럼 반출(자산 TCO)', asBuf.includes('누적 수리비') && asBuf.includes('243000'))
  // ?sel= 딥링크로 상세 패널을 서버 렌더 → 상세 패널의 구성변경 컨트롤을 검증한다
  const regSel = await (await get('/assets/register?sel=AST-2023-000112', 'ASSET_MGR')).text()
  check('자산 대장: ?sel 딥링크로 상세 패널 서버 렌더', regSel.includes('변경 이력 타임라인') && regSel.includes('AST-2023-000112'))
  check('자산 대장: 구성변경 기록 컨트롤 노출 (자산담당)', regSel.includes('구성변경 기록'))
  check('자산 대장: 보증 연장 컨트롤 노출 (보증 있는 자산)', regSel.includes('보증 연장'))
  const regUser2 = await (await get('/assets/register', 'USER')).text()
  check('자산 대장: 사용자에겐 엑셀 버튼 미노출', !regUser2.includes('/api/export/assets'))
  // 사용자는 본인 자산이라 상세는 보되(김민준 소유), 구성변경 기록 권한은 없다
  const regUserSel = await (await get('/assets/register?sel=AST-2023-000112', 'USER')).text()
  check('자산 대장: 사용자에겐 구성변경 기록 미노출', regUserSel.includes('변경 이력 타임라인') && !regUserSel.includes('구성변경 기록'))

  const aiPol = await (await get('/settings/ai-policy', 'ADMIN')).text()
  check('AI 거버넌스: 감사 로그가 질의·판정까지 포괄', aiPol.includes('AI 관련 감사 로그') && aiPol.includes('AI 정책'))
  // 운영 정책에 안전재고 기준 — 코드 상수가 아니라 Admin 이 설정하는 임계값(대수 단위). 재고 경보가 참조.
  check('운영 정책: 안전재고 기준 편집 필드 렌더(대수 단위)', aiPol.includes('안전재고 기준') && aiPol.includes('재고 부족(발주 검토)'))
  const dspHtml = await (await get('/assets/disposal', 'ASSET_MGR')).text()
  check('폐기: 후보·소거 방식·증적·일괄 선정 렌더', dspHtml.includes('데이터 소거') && dspHtml.includes('증적') && dspHtml.includes('AST-2019-000218') && dspHtml.includes('선택 일괄 대상 선정'))
  const svyHtml = await (await get('/inventory/survey', 'ASSET_MGR')).text()
  check('재물조사 수행: 스캔 실사·차이 항목 렌더', svyHtml.includes('스캔하거나 자산번호 입력') && svyHtml.includes('위치 불일치') && svyHtml.includes('조정 결재 상신'))
  check('재물조사 수행: 진행중 회차에 조사 완료(마감) 컨트롤 노출', svyHtml.includes('조사 완료'))
  const planHtml = await (await get('/inventory/survey-plan', 'ASSET_MGR')).text()
  check('재물조사 계획: 회차 목록·유형·담당자·계획 취소 렌더', planHtml.includes('2026 하반기 정기 재물조사') && planHtml.includes('연간') && planHtml.includes('수시') && planHtml.includes('계획 수립') && planHtml.includes('계획 취소'))
  // 범위 select 는 '계획 수립' 을 눌러야 펼쳐지므로 초기 HTML 에는 없다. 대신 클라이언트로
  // 전달된 후보 목록을 검증한다 — 아래 값들은 공통코드 LOCATION 그룹에만 존재한다.
  const scopeOnlyInCodes = ['IDC-A Rack 12', '본사 8F 통신실', '본사 3F 검수실']
  check('재물조사 계획: 대상 범위 후보가 공통코드 LOCATION 에서 옴',
    scopeOnlyInCodes.every((l) => planHtml.includes(l)), scopeOnlyInCodes.filter((l) => !planHtml.includes(l)).join(', '))
  check('재물조사 계획: 미확인 자산 자동 편성 진입점', planHtml.includes('미확인(유령) 자산 자동 편성') && planHtml.includes('자동 편성'))
  // 장기 미실측(실사 기반) 자동 편성 — 대장 최근 실측일에 근거한 유령 후보를 수시 조사로 편성
  check('재물조사 계획: 장기 미실측 자산 자동 편성 진입점', planHtml.includes('장기 미실측') && planHtml.includes('실사 기반 유령'))
  // '대장에서 보기'는 이 카드가 센 집합을 열어야 한다 — 필터 없이 전체 대장으로 보내면 담당자가 미실측 자산을
  //  수백 건 중에서 눈으로 찾아야 한다(대장에 ?stale=1 필터가 이미 있는데 쓰지 않았다).
  check('재물조사 계획: 장기 미실측 카드가 대장 미실측 필터(?stale=1)로 드릴다운', planHtml.includes('/assets/register?stale=1'))
  // 완료 회차 이력 — 지난 재물조사 실적(대상·실사·차이)이 감사 추적용으로 보존된다. 그동안 완료 회차는 어디에도 안 보였다.
  check('재물조사 계획: 완료 회차 이력 렌더 (감사 추적)', planHtml.includes('완료 회차 이력') && planHtml.includes('INV-2026-H1') && planHtml.includes('2026 상반기 정기 재물조사'))
  const recHtml2 = await (await get('/discovery/reconcile', 'ASSET_MGR')).text()
  check('CMDB 대사: 미확인 → 조사 편성 연결', recHtml2.includes('/inventory/survey-plan'))
  // 대사 결과별 처리 드릴다운 — 미등록·불일치 카운트가 발견 처리 화면(상태 필터)로 연결 (report → act)
  check('CMDB 대사: 미등록·불일치 → 발견 처리 상태 드릴다운', recHtml2.includes(`/discovery/found?state=${encodeURIComponent('미등록')}`) && recHtml2.includes(`/discovery/found?state=${encodeURIComponent('등록·불일치')}`))
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
  check('리포트: 14종 유형·생성 UI 렌더', repHtml.includes('주간 Shadow IT 브리핑') && repHtml.includes('감사 대응 자료') && repHtml.includes('연간 교체 계획') && repHtml.includes('취약점 조치 우선순위') && repHtml.includes('AI 거버넌스·성능') && repHtml.includes('부서별 IT 비용 배분') && repHtml.includes('계약 관리 현황') && repHtml.includes('정보보호 컴플라이언스 증적') && repHtml.includes('라이선스 갱신·트루업 계획') && repHtml.includes('단일 장애점·영향 분석') && repHtml.includes('자산 운영 리스크') && repHtml.includes('결재 첨부용'))
  // 자산 운영 리스크 리포트 — 분실·미실측·연체·수리 지연·수령 미확인을 한 문서로 집약(어시스턴트 운영 리스크 답변의 export판). 생성 시 buildSections 가 5개 섹션 산출.
  check('리포트: 자산 운영 리스크 리포트 유형 렌더', repHtml.includes('자산 운영 리스크') && repHtml.includes('유령 자산 후보'))
  // 단일 장애점·영향 분석 리포트(CMDB blast radius) — 의존 그래프에서 영향 범위 2대 이상 SPOF·저하 상위를 산출(화면 CMDB 와 lib/cmdb 단일 소스). 생성 시 buildSections 가 섹션 산출.
  check('리포트: 단일 장애점·영향 분석(CMDB blast radius) 리포트 유형 렌더', repHtml.includes('단일 장애점·영향 분석') && repHtml.includes('영향 범위(blast radius)'))
  // 계약 관리 현황(§03 계약 이행 보고) — 만료·유지보수 예산 집행·구매 발주 이행·SLA·부속서류 거버넌스를 한 리포트로 집약(결재 첨부).
  check('리포트: 계약 관리 현황 리포트 유형 렌더', repHtml.includes('계약 관리 현황') && repHtml.includes('발주 이행'))
  // 재물조사 결과 요약에 차이 유형별 대장 대조·조정 결과(resolution) 추가 — 감사 추적 강화(유형 설명에 반영, 생성 시 buildSections 가 섹션 산출)
  check('리포트: 재물조사 결과 요약 — 차이 유형·조정 결과 반영', repHtml.includes('재물조사 결과 요약') && repHtml.includes('조정 결과'))
  // 부서별 IT 비용 배분(차지백) 리포트 — 자산 원가·라이선스 좌석 비용을 부서로 귀속(§05 FinOps·예산 근거)
  check('리포트: 부서별 IT 비용 배분(차지백) 리포트 유형 렌더', repHtml.includes('부서별 IT 비용 배분') && repHtml.includes('차지백'))
  // 결재 첨부용 산출물은 네이티브 엑셀(xlsx, 섹션별 시트)·문서 — 다른 대장·로그 반출과 동일 형식 (제품안내서 §05 "결재 첨부용 엑셀·문서")
  check('리포트: 결재 첨부 산출물 엑셀(xlsx)·문서 안내', repHtml.includes('결재 첨부용 엑셀(xlsx)') && repHtml.includes('섹션별 시트'))
  // 취약점 조치 우선순위 리포트(§05 스코어링) — 자산 중요도 × 노출도로 P1/P2/P3 순위화, 결재 첨부·감사 증적
  check('리포트: 취약점 조치 우선순위 리포트 유형 렌더', repHtml.includes('취약점 조치 우선순위') && repHtml.includes('자산 중요도 × 노출도'))
  // AI 거버넌스·성능 리포트(§05 AI 거버넌스: 모델·프롬프트 버전·분류 정확도·채택률) — 성능 정기 리포트
  check('리포트: AI 거버넌스·성능 리포트 유형 렌더', repHtml.includes('AI 거버넌스·성능') && repHtml.includes('제안 채택률'))
  // 월간 자산 현황 리포트에 유지보수(수리) 비용 현황이 포함됨을 유형 설명에서 확인(생성 시 buildSections 가 TCO 섹션 산출)
  check('리포트: 월간 자산 현황에 유지보수(수리) 비용 반영', repHtml.includes('유지보수(수리) 비용'))
  // 월간 자산 현황에 자산 처분 실적(매각 대금 회수) 반영 — 생성 시 buildSections 가 처분 실적 섹션 산출
  check('리포트: 월간 자산 현황에 자산 처분 실적 반영', repHtml.includes('자산 처분 실적'))
  // 처분 실적(완료)의 짝 — 완료 전 폐기 파이프라인(대상 선정·결재 대기·소거 대기) 진행 현황
  check('리포트: 월간 자산 현황에 폐기 진행 현황 반영', repHtml.includes('폐기 진행 현황'))
  // 감사 대응 자료 리포트에 대장 정합성(CMDB 정확도) 반영 — 생성 시 buildSections 가 정합성 섹션 산출
  check('리포트: 감사 대응 자료에 대장 정합성(CMDB 정확도) 반영', repHtml.includes('대장 정합성(CMDB 정확도)'))
  // 주간 Shadow IT 브리핑에 인증·계정·엔드포인트 정책 위반(loops 45-49) 반영 — 생성 시 buildSections 가 해당 섹션 산출
  check('리포트: 주간 Shadow IT 브리핑에 인증·계정·엔드포인트 정책 위반 반영', repHtml.includes('인증·계정·엔드포인트 정책 위반'))
  // 감사 대응 자료에 위협 대응 현황(검출→조치 증적) 반영
  check('리포트: 감사 대응 자료에 위협 대응 현황 반영', repHtml.includes('위협 대응 현황'))
  // 감사 대응 자료에 이상 자산 행위 탐지(§05 기능02) 반영 — fn02가 유일하게 리포트 미커버였던 공백 해소(생성 시 buildSections 가 buildAnomalies 섹션 산출)
  check('리포트: 감사 대응 자료에 이상 자산 행위 탐지 반영', repHtml.includes('이상 자산 행위 탐지'))
  // 연간 교체 계획에 잔존가치(장부가) 반영 — 유형 설명·생성 리포트에 반영
  check('리포트: 연간 교체 계획에 잔존가치 반영', repHtml.includes('내용연수·보증 경과·OS 지원 종료(EOL)·장애 이력(잦은 수리) 기준 교체 대상·잔존가치'))
  // 연간 교체 계획에 OS 지원 종료(EOL) 자산이 하드웨어 노후와 별개 교체 드라이버로 반영 (생성 시 buildSections 가 EOL 섹션 산출)
  check('리포트: 연간 교체 계획에 EOL OS 교체 드라이버 반영', repHtml.includes('OS 지원 종료(EOL)'))
  const repText = text(repHtml)
  check('리포트: 자동 생성 스케줄 렌더 (수정·예약 실행)', repText.includes('자동 생성 스케줄') && repText.includes('예약 실행') && repText.includes('매주 월요일') && repText.includes('수정'))
  // 예약 실행 대상 = 기한 도래 가동 스케줄 — 버튼 수·대시보드 큐·runDueSchedules 실행 대상이 isScheduleOverdue 단일 소스로 일치. 시드상 가동 6개 모두 기한 도래.
  check('리포트: 예약 실행 대상이 기한 도래 스케줄과 일치 (6건 단일 소스)', repText.includes('예약 실행 (6)'))
  check('리포트: 밀린 스케줄이 기한 도래로 표시', repText.includes('기한 도래'))
  check('리포트: 수시 유형은 스케줄 없음 표기', repText.includes('수시') && repText.includes('사유 발생 시 수동 생성'))
  check('리포트: 중지된 스케줄 표기', repText.includes('라이선스 컴플라이언스') && repText.includes('중지'))
  // 보안 정례 리포트 스케줄 편입 — 주간 취약점 조치 우선순위·월간 AI 거버넌스·성능 자동 생성·배포(로17). 스케줄 5건·가동 4건.
  check('리포트: 정례 스케줄 편입 (자동 7·가동 6 — FinOps·계약 월간 포함)', repText.includes('자동 7(가동 6)'))
  const scanHtml = await (await get('/settings/scan-policy', 'ADMIN')).text()
  check('탐지 채널 정책: 6채널·강도 통제 렌더', scanHtml.includes('네트워크 능동 스캔') && scanHtml.includes('스캔 안전장치') && scanHtml.includes('23:00 ~ 05:00'))
  // 현재 발견 자산 KPI 드릴다운(탐지 채널의 산출을 발견 처리 화면으로) — 그전엔 dead-end 지표였다(shows-but-no-action).
  check('탐지 채널 정책: 현재 발견 자산 KPI → 발견 자산 드릴다운', scanHtml.includes('href="/discovery/found"') && scanHtml.includes('현재 발견 자산'))
  // 대역·시간대 정책 편집(§07 스캔 안전장치) — 능동 스캔 채널에 정책 편집 컨트롤. 시간대는 로15(시간대 밖 사유 필요)의 통제 원천.
  check('탐지 채널 정책: 능동 스캔 대역·시간대 정책 편집 노출', scanHtml.includes('정책 편집') && scanHtml.includes('비고 · 정책 편집'))
  // 재탐지 주기 편집(§04 스케줄러) — 강도·대역·시간대뿐 아니라 재탐지 주기도 전 채널에서 조정 가능(표시 전용 공백 보완)
  check('탐지 채널 정책: 재탐지 주기(스케줄러) 편집 노출', scanHtml.includes('재탐지 주기 변경 (스케줄러)'))
  const catHtml = await (await get('/settings/saas-catalog', 'ADMIN')).text()
  check('SaaS 카탈로그: 판정 상태 렌더', catHtml.includes('Dropbox') && catHtml.includes('검토중'))
  // 판정 기한(SLA) 경과(§01 Shadow IT 적시 판정) — 검토중이 접수 후 7일을 넘기면 기한 경과·에스컬레이션. 시드 ChatGPT(기밀)·Notion(민감) 등 방치분.
  check('SaaS 카탈로그: 판정 기한 경과(SLA) 에스컬레이션 표기', catHtml.includes('판정 기한 경과') && catHtml.includes('ChatGPT(기밀)') && catHtml.includes('기한 경과'))
  // 판정 기한 경과 에스컬레이션 버튼 — 표시뿐이던 기한 경과 신호에 조치 채널(보안담당 판정 요청 통보)을 붙인다. 시드 검토중 방치분으로 활성.
  check('SaaS 카탈로그: 판정 기한 경과 에스컬레이션 버튼(신호→조치 채널)', catHtml.includes('판정 기한 경과 에스컬레이션'))
  // 차단 판정 → 집행 통보 — 차단이 정책 표시로 끝나지 않고 보안운영팀 차단 집행 요청으로 이어짐을 명시
  check('SaaS 카탈로그: 차단 집행 통보 안내 렌더', catHtml.includes('차단은 집행으로 이어집니다') && catHtml.includes('프록시·DNS 차단 집행 요청'))
  // 데이터 등급 분류 편집 — 표시 전용이던 데이터 민감도(일반/민감/기밀)를 보안담당·Admin 이 분류(차단 우선순위·기밀 취급 집계 근거)
  check('SaaS 카탈로그: 데이터 등급 분류 편집 노출', catHtml.includes('데이터 민감도 등급 분류'))
  // SaaS 정책 관리는 보안담당 책무(제품안내서 §01 — Admin 명시 목록엔 SaaS 카탈로그가 없다) — 보안담당도 접근·판정 가능
  const catSec = await (await get('/settings/saas-catalog', 'SEC_MGR')).text()
  check('SaaS 카탈로그: 보안담당 접근·판정 가능 (§01 SaaS 정책 관리)', catSec.includes('Dropbox') && catSec.includes('데이터 민감도 등급 분류') && catSec.includes('인가'))
  // 자산담당·사용자는 SaaS 정책 관리 대상 아님 — 라우트 매트릭스가 리다이렉트로 차단(위 접근 매트릭스에서 검증)
  const saasSec = await (await get('/discovery/saas', 'SEC_MGR')).text()
  check('Shadow SaaS: 보안담당에 판정(인가·차단) 버튼 노출', saasSec.includes('판정') && saasSec.includes('차단'))
  const saasAsset = await (await get('/discovery/saas', 'ASSET_MGR')).text()
  check('Shadow SaaS: 자산담당은 판정 버튼 미노출 (조회만)', !saasAsset.includes('>차단<'))
  // 차단 판정 완료분은 '판정 대기' 갭이 아니다 — sanctioned 는 인가/미인가 두 값뿐이라 차단을 담지 못해,
  //  시드 Dropbox(카탈로그 차단 · 프록시·DNS 차단 집행 요청 발송)가 화면에서도 그냥 '미인가'로 보이고 KPI·부서별 요약에 갭으로 잡혔다.
  //  주간 브리핑·통합 후보 산정이 쓰는 기준(카탈로그 차단 목록)과 같게 맞춘다. 표에는 남기되 '차단 판정'으로 구분한다.
  check('Shadow SaaS: 차단 판정 서비스는 인가 여부 칸에 구분 표기', saasSec.includes('차단 판정'))

  // 부서별 미인가 SaaS 노출 요약 — 어느 부서가 Shadow SaaS 위험이 큰지 우선순위화(제품안내서 부서별). '최고 위험도'는 요약 표에만 있는 헤더.
  check('Shadow SaaS: 부서별 미인가 노출 요약 렌더', saasSec.includes('부서별 미인가 SaaS 노출') && saasSec.includes('최고 위험도') && saasSec.includes('전사'))
  // 목록 필터 — 부서·인가 여부·검색 (다른 목록 화면과 동일 패턴, 그동안 SaaS 표만 무필터였다)
  check('Shadow SaaS: 목록 필터(부서·인가여부·검색) 렌더', saasSec.includes('부서 — 전체') && saasSec.includes('서비스·분류·부서 검색'))
  // 중복 기능 SaaS 통합 후보(라이선스 최적화) — 같은 분류에 2종 이상 서비스가 관측되면 통합 대상. 시드 '협업'=Notion+Miro(둘 다 미인가).
  check('Shadow SaaS: 중복 기능 통합 후보 렌더 (협업=Notion+Miro)', saasSec.includes('중복 기능 SaaS 통합 후보') && saasSec.includes('통합 후보 (중복 기능)') && /협업[\s\S]{0,400}Notion[\s\S]{0,400}Miro|협업[\s\S]{0,400}Miro[\s\S]{0,400}Notion/.test(saasSec) && saasSec.includes('통합 권고'))
  // Shadow SaaS 엑셀 반출 — 매트릭스에 '엑셀'이 선언(DSC-030)됐으나 엔드포인트가 없던 공백. 미인가 SaaS 부서별은 감사 증적.
  check('Shadow SaaS: 엑셀 반출 버튼 노출(감사 증적)', saasSec.includes('/api/export/saas') && saasSec.includes('Shadow SaaS 엑셀'))
  const saasXlsx = Buffer.from(await (await get('/api/export/saas', 'SEC_MGR')).arrayBuffer()).toString('utf8')
  check('Shadow SaaS 엑셀: 사용 현황·부서별 미인가 시트 + 데이터', saasXlsx.includes('SaaS 사용 현황') && saasXlsx.includes('부서별 미인가 노출') && saasXlsx.includes('Notion') && saasXlsx.includes('미인가'))
  // 반출본도 화면과 같은 기준 — 차단 판정 완료분은 부서별 미인가 노출(판정 대기 갭)에서 빠지고,
  //  사용 현황 시트에는 남되 인가 여부 칸이 '차단 판정'으로 구분된다(판정 이력이 반출본에서 사라지면 안 된다).
  check('Shadow SaaS 엑셀: 차단 판정 구분 표기(판정 이력 보존)', saasXlsx.includes('차단 판정'))

  check('Shadow SaaS 엑셀: 사용자 403 (권한 매트릭스 엑셀 통제)', (await get('/api/export/saas', 'USER')).status === 403)
  // SaaS 정책 대장 엑셀 — 인가/차단/검토중 판정·데이터 등급·결정자를 거버넌스 감사 증적으로(사용 현황 반출과 구분). 정책 화면(saas-catalog)에 export 부재였던 공백 해소.
  const catCatalog = await (await get('/settings/saas-catalog', 'SEC_MGR')).text()
  check('SaaS 카탈로그: 정책 대장 엑셀 반출 버튼 노출', catCatalog.includes('/api/export/saasCatalog') && catCatalog.includes('SaaS 정책 대장 엑셀'))
  const catXlsx = Buffer.from(await (await get('/api/export/saasCatalog', 'SEC_MGR')).arrayBuffer()).toString('utf8')
  check('SaaS 정책 대장 엑셀: 판정·데이터 등급·결정자 시트 + 데이터', catXlsx.includes('SaaS 정책 대장') && catXlsx.includes('데이터 등급') && (catXlsx.includes('검토중') || catXlsx.includes('인가')))
  check('SaaS 정책 대장 엑셀: 사용자 403 (권한 매트릭스 엑셀 통제)', (await get('/api/export/saasCatalog', 'USER')).status === 403)
  const stockHtml = await (await get('/inventory/stock', 'ASSET_MGR')).text()
  check('재고 현황: 조사 계획 등록이 재물조사 계획으로 연결', stockHtml.includes('/inventory/survey-plan'))
  // 유형별 보유 집계 → 자산 대장 드릴다운 (?cat= 필터 링크)
  check('재고 현황: 유형별 집계가 필터된 자산 대장으로 드릴다운', stockHtml.includes('/assets/register?cat='))
  // 유형·부서·위치별 세그먼트 (제품안내서 §03 "유형·부서·위치별 보유 현황")
  check('재고 현황: 유형·부서·위치별 세그먼트 렌더', stockHtml.includes('보유 현황 — 유형·부서·위치별') && stockHtml.includes('부서별') && stockHtml.includes('위치별'))
  // 자산 가치 현황 — 유형별 취득가·잔존가치(정액법 감가상각) + 장부가 총액 KPI
  check('재고 현황: 유형별 자산 가치(취득가·잔존가치·감가상각률)', stockHtml.includes('유형별 자산 가치') && stockHtml.includes('총 취득가') && stockHtml.includes('총 잔존가치(장부가)') && stockHtml.includes('감가상각률'))
  check('재고 현황: 자산 잔존가치(장부가 총액) KPI', stockHtml.includes('자산 잔존가치 (장부가 총액)'))
  // 가용 재고 KPI ↔ 안전재고 경보 정합 — 타일이 상태 '유휴' 를 그대로 세면 폐기 선정된 유휴 자산까지 '가용'으로 잡혀
  //  같은 화면 아래 경보(가용 제외)·어시스턴트 '재배치 가능' 답변과 어긋난다. lib/stock availableAssets 단일 소스.
  check('재고 현황: 가용 재고 KPI 가 폐기 선정 유휴를 제외(경보·어시스턴트와 동일 판정)', stockHtml.includes('가용 재고 (재배치 가능)') && stockHtml.includes('폐기 선정'))
  // 경보 드릴다운은 경보가 센 집합으로 열어야 한다 — status=유휴 로 열면 폐기 절차·NAC 격리된 유휴 자산이 목록에
  //  남아 '가용 0(재고 소진)' 이라고 말한 유형을 눌렀는데 자산이 보인다(화면 수 ≠ 목록 수). 대장의 avail=1 은
  //  같은 lib/stock 판정을 쓴다.
  check('재고 현황: 안전재고 경보 드릴다운이 가용 필터(avail=1)로 열린다',
    !stockHtml.includes('안전재고 경보') || stockHtml.includes('avail=1'))
  const availHtml = await (await get('/assets/register?avail=1', 'ASSET_MGR')).text()
  check('자산 대장: 가용 재고 필터 칩 렌더(재고 경보 드릴다운 대상)', availHtml.includes('가용 재고'))
  // 안전재고 경보 — 불출형 유형(단말·주변기기) 가용 재고가 안전재고(2대) 미만이면 경보. 시드: 단말 유휴 1대(AST-2021-000432)는 폐기 선정(대상 선정)이라 가용 제외 → 가용 0(재고 소진), 주변기기 가용 1.
  check('재고 현황: 안전재고 경보 카드(가용 부족 발주 검토)', stockHtml.includes('안전재고 경보') && stockHtml.includes('발주 검토'))
  check('재고 현황: 폐기 선정 유휴는 가용 제외 → 단말 재고 소진(가용 0)', stockHtml.includes('단말') && stockHtml.includes('재고 소진'))
  check('재고 현황: 주변기기 안전재고 부족 표기', stockHtml.includes('주변기기') && stockHtml.includes('부족'))
  // 발주 요청 — 재고 경보(검출)를 조치로 잇는다. 부족 유형에 대해 구매·IT기획팀에 보충 발주 요청 발송(자산담당·Admin).
  check('재고 현황: 안전재고 부족 시 발주 요청 발송 버튼', stockHtml.includes('발주 요청 발송'))
  // 재고 엑셀에 유형별 가치 시트 반출 — 취득가·잔존가치 컬럼
  const stockBuf = Buffer.from(await (await get('/api/export/stock', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('재고 엑셀: 유형별 가치 시트(취득가·잔존가치) 반출', stockBuf.includes('총 취득가') && stockBuf.includes('총 잔존가치') && stockBuf.includes('감가상각률'))
  // 재고 엑셀 대수 집계 ↔ 화면 정합 — 화면 aggBy 는 전 자산(폐기완료 포함)을 세어 합계=총 보유 불변식을 지킨다. 반출본도 동일해야 한다(폐기완료 자산 위치 '폐기 처리 완료' 행 포함). 폐기완료를 빼면 반출본이 화면과 어긋난다.
  check('재고 엑셀: 대수 집계가 화면과 동일(위치별에 폐기완료 행 포함 · 합계=총 보유)', stockBuf.includes('폐기 처리 완료'))
  // 재고 엑셀 열 구성 ↔ 화면 정합 — 화면(StockBreakdown)에 있는 '기타'(검수중·대여중·수리중·분실·폐기 등 나머지 상태) 열이 반출본에 없으면
  //  보유 ≠ 사용중 + 유휴·반납대기 가 되어 결재 첨부·감사 대응 자료만으로는 차이가 어디로 갔는지 대사할 수 없다.
  check('재고 엑셀: 화면과 동일한 열 구성(기타 열 포함 · 보유 대사 가능)', stockBuf.includes('유휴·반납대기') && stockBuf.includes('기타') && stockBuf.includes('유휴율(%)'))
  // 합계 행 — 화면 tfoot 과 동형. 회계·감사가 엑셀 안에서 바로 검산한다(리포트 금액 표 합계 행과 동일 규약)
  check('재고 엑셀: 집계 시트·유형별 가치에 합계 행(엑셀 내 검산)', stockBuf.includes('합계'))
  // 이 반출은 '재고 · 재물조사' 메뉴에 걸리는데 재물조사 실적이 한 장도 없었다 — 계획 화면이 '완료 회차의
  //  대상·실사·차이 실적을 보존합니다(감사 추적)'라 말해 놓고 그 실적을 반출할 경로가 없었다.
  check('재고 엑셀: 재물조사 회차 실적 시트 반출 (감사 추적)',
    stockBuf.includes('재물조사 회차') && stockBuf.includes('INV-2026-H2') && stockBuf.includes('진행률(%)'))
  // 차이는 '무엇이 어긋났고 어떻게 조정했는지'가 감사 근거다 — 미조치도 값으로 적는다.
  check('재고 엑셀: 재물조사 차이·조정 내역 시트 반출',
    stockBuf.includes('재물조사 차이') && stockBuf.includes('DIF-02') && stockBuf.includes('대장 미등록') && stockBuf.includes('미적용'))
  // 안전재고 미달은 화면이 경보로 띄우고 대시보드가 큐로 세는 판정인데 반출본엔 없었다(같은 lib/stock 소스를 쓴다).
  check('재고 엑셀: 안전재고 미달 판정 시트 반출', stockBuf.includes('안전재고 미달') && stockBuf.includes('부족'))
  // 필터 딥링크가 자산 대장에서 실제로 유효 (cat 파라미터 수용)
  const drillHtml = await (await get('/assets/register?cat=%EC%84%9C%EB%B2%84', 'ASSET_MGR')).text()
  check('자산 대장: ?cat= 딥링크 진입 정상 렌더', drillHtml.includes('상태 — 전체') && drillHtml.includes('AST-2023-000561'))
  const codeHtml = await (await get('/settings/codes', 'ADMIN')).text()
  check('공통코드: 그룹·값 렌더', codeHtml.includes('ASSET_CATEGORY') && codeHtml.includes('미사용 처리'))
  check('공통코드: 신규 등록 폼 렌더', codeHtml.includes('새 코드 추가') && codeHtml.includes('전 화면 드롭다운'))
  check('공통코드: 명칭 수정 · 미사용 관리 컨트롤 렌더', codeHtml.includes('수정') && /class="[^"]*btn[^"]*sm/.test(codeHtml))
  // 참조 무결성 — 코드별 참조 수(사용 중 N건)를 표기해 미사용 전환 가드의 근거를 드러낸다. 기본 그룹 ASSET_CATEGORY 의 단말은 다수 자산이 참조.
  check('공통코드: 참조 수 표기(사용 중 N건 · 미사용 전환 가드 근거)', codeHtml.includes('건 사용 중') && codeHtml.includes('참조'))
  // 참조 집계 커버리지 — 화면은 '사용 중 N건'을 이관 기준으로 제시하므로, 참조 필드를 하나라도 빠뜨리면
  //  그 N건만 옮겨도 가드가 열리고 세지 않은 레코드가 사라진 코드를 붙든 채 남는다(드롭다운 재선택 불가 사각지대).
  //  자산 유형은 대장 말고도 도입 로트(채번 전)·AI 자동분류 확정/제안 유형·자산 신청 희망 유형이 참조한다 —
  //  시드 단말 28건(대장 21 + 로트·분류·희망 유형 7), 주변기기 6건(대장 3 + 3). 대장만 세면 21·3 이었다.
  const usedCount = (n) => codeHtml.includes(`>${n}<!-- -->건 사용 중`) // React SSR 은 {used}건 사용 중 을 텍스트 노드 둘로 쪼갠다
  check('공통코드: 유형 참조 수에 대장 밖 참조(도입 로트·AI 분류·신청 희망 유형) 포함', usedCount(28) && usedCount(6))
  const aiHtml = await (await get('/settings/ai-policy', 'ADMIN')).text()
  check('AI 정책: 실행 환경·거버넌스 렌더', aiHtml.includes('온프레미스 LLM') && aiHtml.includes('권한 범위 필터'))
  // 권한 범위 필터는 정책값이 아니라 코드가 항상 적용하는 최소권한 안전장치다(buildContext 가 역할로 스코핑) —
  //  토글로 내려도 동작은 그대로인데 AI 거버넌스·감사 대응 리포트만 '미적용'으로 나가면 감사에 허위 진술이 된다.
  //  권한 매트릭스 잠금 칸과 같은 규약으로 잠가 ON 고정임을 화면에도 드러낸다.
  check('AI 정책: 권한 범위 필터는 변경 불가 잠금(ON 고정 · 리포트 진술과 동작 일치)', aiHtml.includes('ON 🔒') && aiHtml.includes('코드가 항상 적용(변경 불가)'))
  // 자동 승인도 같은 부류의 죽은 토글이었다 — 읽는 코드가 없어 ON 으로 올려도 AI 제안은 여전히 담당자 판정을 거치는데,
  //  컴플라이언스 서술은 '제안 자동승인 허용'이라고 감사에 진술했다(실제보다 약한 통제를 주장 — 더 나쁜 방향).
  check('AI 정책: 제안 자동 승인은 변경 불가 잠금(OFF 고정 · 자동 승인 경로 없음)', aiHtml.includes('OFF 🔒') && aiHtml.includes('자동 승인 경로 없음(변경 불가)'))
  // 외부 반출 통제(§05 실행 환경) — 온프레미스는 외부 반출 차단, 외부 API 연계는 비식별 처리 후 반출. 표시가 아니라 강제.
  //  시드 기본값(온프레미스 LLM)에서 '외부 반출 차단'이 적용 중이고, 비식별·강제 문구가 정책 표와 함께 렌더돼야 한다.
  check('AI 정책: 외부 반출 통제 — 온프레미스 차단·비식별·강제 명시', aiHtml.includes('외부 반출 통제') && aiHtml.includes('표시가 아니라') && aiHtml.includes('비식별') && aiHtml.includes('외부 반출 없음'))
  // 분류 정확도 환류(§05 그림4 재학습) — 시드 고정값(92.4)이 아니라 판정 결과 환류로 재산출된다.
  //  신선한 시드는 자동분류 승인 1건이 반영돼 기준 92.4% → 93.2%(축약추정). '판정 1건 환류' 표기로 정적값이 아님을 명시.
  check('AI 정책: 분류 정확도 판정 환류 반영(정적값 아님)', aiHtml.includes('판정 1건 환류') && aiHtml.includes('기준 92.4%') && aiHtml.includes('93.2'))
  // 모델·프롬프트 버전 관리(§05 AI 거버넌스) — 배포 모델·프롬프트 버전 변경 관리 원장. AI 거버넌스·성능 리포트 근거.
  check('AI 정책: 모델·프롬프트 버전 관리 컨트롤', aiHtml.includes('모델 · 프롬프트 버전 관리') && aiHtml.includes('버전 관리'))
  // 감사 로그 보존 기간 관리 — 규제·컴플라이언스 정책값(표시 전용이던 것을 Admin 이 30~3650일로 설정)
  check('AI 정책: 감사 로그 보존 기간 관리 컨트롤', aiHtml.includes('감사 로그 보존 기간') && aiHtml.includes('보존 기간 관리'))
  // 운영 정책(임계값) — 코드 상수로 고정돼 표시만 되던 기한·SLA·판정 기준을 스토어로 승격해 Admin 이 설정(화면·리포트·스케줄러 공용)
  check('AI 정책: 운영 정책(기한·SLA·판정 기준) 관리 컨트롤', aiHtml.includes('운영 정책 — 기한 · SLA · 판정 기준') && aiHtml.includes('소유자 확인 기한') && aiHtml.includes('장기 미실측 기준'))
  // 정기 점검 창(신규 임계값) — isMaintenanceDue 하드코딩 30 을 opsPolicy 로 승격해 Admin 이 예방 정비 도래 창을 설정(대시보드 큐·대장 필터·어시스턴트 공용). 기존 5개 임계값과 동일 규약 완성.
  check('AI 정책: 운영 정책에 정기 점검 창(예방 정비 도래) 편집 필드 렌더', aiHtml.includes('정기 점검 창') && aiHtml.includes('예방 정비 예정일 도래'))
  const usrHtml = await (await get('/settings/users', 'ADMIN')).text()
  check('사용자 · 결재선: 결재선·필수 결재·단계 편집 렌더', usrHtml.includes('IT기획팀장') && usrHtml.includes('필수 결재') && usrHtml.includes('편집'))
  check('사용자 · 결재선: STEP 4 권한그룹 배정 컨트롤 렌더', usrHtml.includes('사용자 · 권한그룹 배정') && usrHtml.includes('select'))
  // 대여 결재선(AL-09) — 유일하게 매트릭스에서 누락돼 레거시 폴백으로 우회하던 상신 종류(대여=자산 반출)를 거버넌스 매트릭스에 편입. 화면·리포트 노출.
  check('사용자 · 결재선: 대여 결재선이 거버넌스 매트릭스에 노출(레거시 폴백 제거)', usrHtml.includes('수명주기 · 대여'))

  //  위 검사는 대여 한 종류만 본다 — 그 한 건이 실제로 빠져 있었기 때문에 생긴 검사다. 같은 누락이 다른 종류에서
  //  또 나면 아무도 모른다: 결재선이 없는 종류는 매트릭스 화면에 행이 없어 관리자가 단계를 볼 수도 고칠 수도 없고,
  //  상신은 레거시 폴백(역할 한 명의 단독 승인)으로 새어 나간다 — 결재선 변경이 통제가 아니라 구멍이 되는 자리다
  //  (approvalStepIndex 주석이 경고하는 바로 그 증상). 상신 종류 전량이 결재선을 갖는지 본다.
  const aprTypes = readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8')
  const aprStore = readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf8')
  const aprKinds = [...(new RegExp('export type ApprovalKind =([^' + String.fromCharCode(92) + 'n]+)').exec(aprTypes)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  const seedBlk = aprStore.slice(aprStore.indexOf('function seedApprovalLines'), aprStore.indexOf('function seed('))
  const linedKinds = [...seedBlk.matchAll(/kind: '([^']+)'/g)].map((m) => m[1])
  const kindNoLine = aprKinds.filter((k) => !linedKinds.includes(k))
  const lineNoKind = linedKinds.filter((k) => !aprKinds.includes(k))
  //  화면에도 그 종류가 실제로 렌더되는지 함께 본다(시드에만 있고 매트릭스에 안 뜨면 편집할 길이 없다)
  const kindNotShown = aprKinds.filter((k) => !usrHtml.includes(k))
  check(`결재선 완전성: 상신 종류 ${aprKinds.length}종이 모두 결재선을 갖고 매트릭스에 뜬다`,
    aprKinds.length >= 9 && kindNoLine.length === 0 && lineNoKind.length === 0 && kindNotShown.length === 0,
    `결재선 없음=${kindNoLine.join(', ') || '없음'} 유령 결재선=${lineNoKind.join(', ') || '없음'} 화면 미노출=${kindNotShown.join(', ') || '없음'}`)
  // 사용자별 보유 자산 수 — 계정 관리 시 자산 부담 가시성 + 해당 사용자 자산 대장 드릴다운
  check('사용자: 보유 자산 수 + 자산 대장 드릴 링크', usrHtml.includes('보유 자산') && usrHtml.includes('/assets/register?q='))

  // 오프보딩이 세는 보유 — 사용중·대여중만 세면 이름이 아직 붙어 있는 나머지 상태가 통째로 빠진다.
  //  장애 신고로 수리에 들어간 자산은 소유자를 유지한 채 수리중이고(반납 접수분과 달리 보유자를 비우지 않는다),
  //  회수 지시가 나간 자산은 실물이 돌아올 때까지 반납대기로 이름이 남는다. 시드에도 그런 자산이 둘 있다 —
  //  AST-2021-000556(수리중 · 한지원)과 AST-2025-000513(반납대기 · 한도윤). 그 둘만 가진 사람은 오프보딩 패널이
  //  아예 뜨지 않아, 수리에서 돌아온 장비가 퇴사자 앞으로 배정된 채 남는다. 화면과 명세서가 같은 기준을 쓰는지 본다.
  const obSheet = await (await get(`/api/offboard-sheet/${encodeURIComponent(String.fromCharCode(54620, 51648, 50896))}`, 'ADMIN')).text()
  check('오프보딩 명세서: 수리중 보유(이름이 남은 자산)가 실린다',
    obSheet.includes('AST-2021-000556') && obSheet.includes('이름이 남아 있는 자산'),
    '수리중 보유가 명세서에서 빠짐')
  //  반납대기도 같다 — 회수 지시가 나갔지만 실물이 돌아오기 전이라 이름이 남아 있다(한도윤 · AST-2025-000513).
  const obSheet2 = await (await get(`/api/offboard-sheet/${encodeURIComponent(String.fromCharCode(54620,46020,50984))}`, 'ADMIN')).text()
  check('오프보딩 명세서: 반납대기 보유(회수 진행 중)가 실린다',
    obSheet2.includes('AST-2025-000513'), '반납대기 보유가 명세서에서 빠짐')
  // 오프보딩 요약 — 퇴직·부서이동 시 회수·재배정 대상(사용중 보유·대여·라이선스 좌석·상신 결재)을 한 사람 기준으로 모은다. 자산·좌석 있는 사용자에 요약 토글 노출.
  check('사용자: 오프보딩 요약 컬럼 + 요약 토글 렌더', usrHtml.includes('오프보딩') && usrHtml.includes('요약'))
  // 오프보딩 명세서(인수인계 체크리스트) 인쇄 — 요약의 회수·재배정 대상을 한 장 인쇄 산출물로. 자산 운영이므로 자산담당·Admin. (인쇄 링크는 확장 상세에 있어 e2e 로 검증)
  check('오프보딩 명세서: 미로그인 차단 (401)', (await get('/api/offboard-sheet/%EA%B9%80%EB%AF%BC%EC%A4%80')).status === 401)
  check('오프보딩 명세서: 사용자 차단 (403)', (await get('/api/offboard-sheet/%EA%B9%80%EB%AF%BC%EC%A4%80', 'USER')).status === 403)
  // 실재하지 않는 이름 — 빈 명세서를 내주면 '그 사람은 보유 자산이 없다'로 읽히고, 감사 로그에는 반출 기록만 남는다.
  check('오프보딩 명세서: 없는 사용자 404 (빈 명세서·잡음 감사 방지)', (await get('/api/offboard-sheet/%EC%97%86%EB%8A%94%EC%82%AC%EB%9E%8C', 'ASSET_MGR')).status === 404)
  const offSheet = await (await get('/api/offboard-sheet/%EA%B9%80%EB%AF%BC%EC%A4%80', 'ASSET_MGR')).text()  // 김민준: 사용중 000112·000015 + LIC-004 좌석
  check('오프보딩 명세서: 회수 대상(보유 자산·라이선스 좌석) 렌더', offSheet.includes('ASSET OFFBOARDING') && offSheet.includes('AST-2023-000112') && offSheet.includes('AutoCAD') && offSheet.includes('인수인계'))
  // MFA 등록 요구 — 미적용 사용자(시드 2명)가 있어 일괄 요구 버튼 + 행별 요구 버튼 노출(보안 정책 집행)
  check('사용자: MFA 미등록자 등록 요구 버튼(보안 정책)', usrHtml.includes('MFA 미등록자 등록 요구') && usrHtml.includes('미적용'))
  check('사용자 · 결재선: 필수 결재선 잠금 표시(🔒)', usrHtml.includes('🔒') && usrHtml.includes('해제할 수 없'))
  check('사용자 · 결재선: 선택 결재선 토글 버튼 렌더', /class="[^"]*btn[^"]*sm/.test(usrHtml))
  // 오프보딩 명세서 반출도 감사 대상 — 대장·감사 로그·발송 이력 반출은 "누가 무엇을 몇 건 받았는지"를 남기는데
  //  개인 단위 오프보딩 명세서는 고정 URL 로 받아도 흔적이 없었다(리포트 반출은 생성이 필요해 e2e 에서 확인).
  const offDl = await get('/api/offboard-sheet/%EA%B9%80%EB%AF%BC%EC%A4%80', 'ASSET_MGR')
  const auditAfterDl = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('감사: 오프보딩 명세서 반출이 감사 로그에 기록', offDl.status === 200 && auditAfterDl.includes('오프보딩 명세서 반출'))

  // 접근 거부가 감사에 남는가 — 감사 로그 화면·반출 엑셀에는 '결과=실패' 필터가 있고 시드에도 「권한 밖 화면
  //  접근 시도」가 한 줄 있는데, 정작 그 행을 만드는 코드가 없어 운영 중에는 실패 건이 늘지 않았다.
  //  화면 가드(리다이렉트)와 문서·반출 API(403) 둘 다 남겨야 '누가 권한 밖을 두드렸는가'에 답할 수 있다.
  const denyBefore = await (await get('/platform/integrations', 'SEC_MGR')).text()
  const denyCount = (html) => html.split('권한 밖').length - 1
  const beforeN = denyCount(denyBefore)
  // 사용자가 권한 밖 화면(수명주기)을 직접 두드린다 — 대시보드로 리다이렉트되고 거부가 남아야 한다
  await get('/assets/lifecycle', 'USER')
  // 자산담당이 권한 밖 반출(감사 로그 엑셀)을 URL 로 호출한다 — 403 과 함께 거부가 남아야 한다
  const denyExport = await get('/api/audit-export', 'ASSET_MGR')
  const denyAfter = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('감사: 권한 밖 화면 진입이 실패 기록으로 남는다', denyAfter.includes('권한 밖 화면 접근 시도') && denyAfter.includes('/assets/lifecycle'),
    '리다이렉트만 하고 감사에 남지 않음')
  check('감사: 권한 밖 반출 시도가 실패 기록으로 남는다(403 과 함께)',
    denyExport.status === 403 && denyAfter.includes('권한 밖 반출 시도 — 감사 로그'))
  // 시드 한 줄(「권한 밖 화면 접근 시도」 → /settings/permissions)을 넘어 실제로 쌓였는가 —
  //  증가분으로 재지 않는 이유는 같은 대상의 반복이 하루 한 건으로 접히기 때문이다(위 스윕이 이미 두드렸다).
  //  화면 진입과 반출, 두 경로 모두에서 나와야 한 쪽만 남기고 끝난 게 아니다.
  check(`감사: 거부 기록이 시드 한 줄을 넘어 쌓인다 (${beforeN}건)`,
    beforeN > 1 && denyAfter.includes('권한 밖 화면 접근 시도') && denyAfter.includes('권한 밖 반출 시도'))
  // 같은 사람이 같은 대상을 같은 날 다시 두드려도 한 건 — 리다이렉트는 새로고침으로 쉽게 반복되고,
  //  그대로 쌓으면 정작 봐야 할 변경 이력이 거부 로그에 덮인다(독촉·통지의 '오늘 이미 보냈다'와 같은 규약).
  const dupN = denyCount(denyAfter)
  await get('/assets/lifecycle', 'USER')
  await get('/api/audit-export', 'ASSET_MGR')
  const denyDup = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('감사: 같은 사람·같은 대상의 반복 시도는 하루 한 건', denyCount(denyDup) === dupN, `${dupN} → ${denyCount(denyDup)}`)
  // 반출 엑셀의 '결과=실패' 필터가 실제 거부 건을 담는다 — 시드 한 줄만 잡히던 필터다
  const denyXlsx = Buffer.from(await (await get('/api/audit-export?result=%EC%8B%A4%ED%8C%A8', 'SEC_MGR')).arrayBuffer()).toString('utf8')
  check('감사 로그 엑셀: 실패 필터에 실제 거부 기록이 담긴다', denyXlsx.includes('권한 밖 반출 시도 — 감사 로그') && denyXlsx.includes('/assets/lifecycle'))
  // 문서·반출 API 의 403 은 한 곳(lib/audit forbidden)을 거쳐야 한다 — 라우트마다 손으로 적으면 어느 하나가 빠진다
  const apiDir = path.join(ROOT, 'app', 'api')
  const routeFiles = []
  const walkApi = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walkApi(p); else if (e.name === 'route.ts') routeFiles.push(p) } }
  walkApi(apiDir)
  const rawForbidden = routeFiles.filter((p) => readFileSync(p, 'utf8').includes('status: 403'))
  const auditedForbidden = routeFiles.filter((p) => readFileSync(p, 'utf8').includes('forbidden(session.name'))
  // 서버 액션의 변경 거부도 남는다 — 액션은 화면에서 버튼을 숨겨도 액션 id 로 직접 호출할 수 있어,
  //  '권한 밖에서 무엇을 바꾸려 했는가'가 감사 질문이 된다. 공용 guard() 를 쓰는 다섯 화면이 이를 기록한다.
  const guardFiles = []
  const walkActs = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walkActs(p); else if (e.name === 'actions.ts') guardFiles.push(p) } }
  walkActs(path.join(ROOT, 'app'))
  const withGuard = guardFiles.filter((p) => readFileSync(p, 'utf8').includes('async function guard()'))
  const guardAudits = withGuard.filter((p) => readFileSync(p, 'utf8').includes('권한 밖 변경 시도'))
  check(`감사: 공용 guard() 를 쓰는 액션 파일이 모두 거부를 기록한다 (${guardAudits.length}/${withGuard.length})`,
    withGuard.length >= 5 && guardAudits.length === withGuard.length,
    `미기록: ${withGuard.filter((p) => !guardAudits.includes(p)).map((p) => p.replace(ROOT, '')).join(', ')}`)
  // 아직 남은 범위를 드러낸다 — 조용히 덮지 않는다. 다만 수를 정직하게 센다:
  //  '!session' 거부는 미로그인이라 남길 수행자가 없어 애초에 감사 대상이 아니다(그 70곳을 세면 남은 일을 과장한다).
  //  기록된 곳(denied·guard) 대비 아직 손으로 적힌 곳을 함께 출력한다.
  let inlineAudited = 0
  let inlineLeft = 0
  for (const p of guardFiles) {
    for (const ln of readFileSync(p, 'utf8').split(new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n'))) {
      // 기록된 거부는 메시지 문구와 무관하게 denied() 를 거친다 — 문구로 세면 '권한이 없습니다'가 아닌 거부를 놓친다
      if (ln.includes('denied(session.name')) { inlineAudited += 1; continue }
      if (!ln.includes('권한이 없습니다')) continue
      if (ln.includes('if (!session) return')) continue  // 미로그인 — 신원이 없어 감사 대상이 아니다
      inlineLeft += 1
    }
  }
  // 거부 기록의 '대상'은 실재하는 화면 경로여야 한다 — 감사 로그 표가 그 경로를 링크로 내주므로,
  //  오타 하나면 감사관이 누르는 순간 없는 화면으로 간다. 액션 파일마다 자기 화면 하나만 쓴다.
  const pageRoutes = new Set()
  const walkPages = (dir, base) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) { if (e.name === 'page.tsx') pageRoutes.add(base || '/'); continue }
      const seg = e.name.startsWith('(') && e.name.endsWith(')') ? '' : `/${e.name}`
      walkPages(path.join(dir, e.name), base + seg)
    }
  }
  walkPages(path.join(ROOT, 'app'), '')
  const denyTargets = []
  for (const p of guardFiles) {
    // 줄 단위로 읽는다 — 거부 메시지에 괄호가 들어 있어(예: '(자산담당·Admin).') 첫 ')' 로 끊으면 대상이 잘린다.
    //  호출은 모두 한 줄이므로, 줄 끝의 "')" 앞 따옴표 쌍이 대상 경로다.
    const set = new Set()
    for (const ln of readFileSync(p, 'utf8').split(new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n'))) {
      if (!ln.includes('denied(session.name,')) continue
      const close = ln.lastIndexOf("')")
      if (close < 0) continue
      const open = ln.lastIndexOf("'", close - 1)
      if (open > 0) set.add(ln.slice(open + 1, close))
    }
    if (set.size) denyTargets.push({ file: p.replace(ROOT, ''), targets: [...set] })
  }
  const badTargets = denyTargets.filter((x) => x.targets.length !== 1 || !pageRoutes.has(x.targets[0]))
  check(`감사: 거부 기록의 대상이 실재하는 화면 (${denyTargets.length}개 액션 파일)`,
    denyTargets.length >= 15 && badTargets.length === 0,
    badTargets.map((x) => `${x.file} → ${x.targets.join(', ')}`).join(' / '))
  // 대상 경로는 링크로 내준다 — 열 수 있는 사람에게만(감사 로그 표가 openableRoutes 로 이미 거른다)
  const auditHtml = await (await get('/platform/integrations', 'ADMIN')).text()
  check('감사 로그: 화면 경로 대상이 딥링크로 렌더(권한 있는 역할)',
    auditHtml.includes('대상으로 이동') && auditHtml.includes('href="/settings/permissions"'))
  check(`감사: 액션 권한 거부 기록 ${inlineAudited}곳 (미기록 ${inlineLeft}곳)`, inlineAudited >= 55 && inlineAudited > inlineLeft / 2,
    `기록된 거부가 너무 적다 — denied() 이관이 되돌려졌는지 확인`)
  console.log(`    · 아직 손으로 적힌 권한 거부 ${inlineLeft}곳 — denied() 이관 대상(미로그인 거부는 제외)`)
  const denyActBefore = await (await get('/platform/integrations', 'SEC_MGR')).text()
  // 자산담당이 커넥터 관리(보안담당 전용) 액션을 두드린 것과 같은 상황을 만든다 — 화면에는 버튼이 없다.
  //  여기서는 시드에 이미 남은 기록 대신, 기록 경로가 소스에 있는지로 확인한다(액션 직접 호출은 스모크 범위 밖).
  check('감사: 변경 거부 기록이 화면·반출 거부와 같은 결과 축을 쓴다',
    readFileSync(path.join(ROOT, 'lib', 'audit.ts'), 'utf8').includes("result: '실패'") && denyActBefore.includes('권한 밖'))
  check(`감사: 문서·반출 API 의 권한 거부가 모두 감사를 거친다 (${auditedForbidden.length}개 라우트)`,
    rawForbidden.length === 0 && auditedForbidden.length >= 15, `직접 403: ${rawForbidden.map((p) => p.replace(ROOT, '')).join(', ')}`)
  const intHtml = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('연동 · 인프라: 커넥터·감사 로그(검색·필터) 렌더', intHtml.includes('EDR · 백신 콘솔') && intHtml.includes('감사 로그') && intHtml.includes('수행자·동작·대상 검색') && intHtml.includes('권한 밖 화면 접근 시도'))
  // 감사 로그 대상(target) 딥링크 — 시드 로그의 DSC- 대상이 발견 자산 화면 링크로 렌더된다
  check('연동: 감사 로그 대상 딥링크 렌더', intHtml.includes('대상으로 이동') && intHtml.includes('/discovery/found'))
  check('연동 · 인프라: 양방향 조치 채널 렌더', intHtml.includes('양방향') && intHtml.includes('SAML'))
  check('연동 · 인프라: 보안담당에 커넥터 연결 테스트 노출', intHtml.includes('연결 테스트') && intHtml.includes('연동'))
  check('연동 · 인프라: 보안담당에 감사 로그 엑셀 링크 노출', intHtml.includes('/api/audit-export'))
  check('연동 · 인프라: 감사 로그 기간(from/to) 필터 렌더', intHtml.includes('감사 대응 기간 시작일') && intHtml.includes('감사 대응 기간 종료일'))
  check('연동 · 인프라: 알림 발송 이력 기간(from/to) 필터 렌더', intHtml.includes('발송 증적 기간 시작일') && intHtml.includes('발송 증적 기간 종료일'))
  const intAsset = await (await get('/platform/integrations', 'ASSET_MGR')).text()
  check('연동 · 인프라: 자산담당은 커넥터 관리 미노출 (조회만)', !intAsset.includes('연결 테스트'))
  // 링크(href)가 없는지를 본다 — 감사 로그 표에는 '권한 밖 반출 시도 — 감사 로그'의 대상으로 그 경로가
  //  텍스트로 찍힐 수 있다(거부 기록의 증적 값). 텍스트까지 막으면 감사 로그가 자기 사건을 못 적는다.
  check('연동 · 인프라: 자산담당엔 감사 로그 엑셀 링크 없음', !intAsset.includes('href="/api/audit-export'))

  // ── 문서 정합성 ─────────────────────────────────────────────────────
  // 문서의 수치는 기능을 추가할 때마다 손으로 고쳐 왔고, 그 과정에서 세 번 낡았다
  // (화면 25→28, 스모크 131→165, 폐쇄 루프 15→18). 사람이 기억할 일이 아니라 테스트가 잡을 일이다.
  // 원격(배포본) 검증에서는 건너뛴다 — 로컬 소스 파일을 기준으로 하는 검사라
  // 배포본과 소스가 다른 커밋일 수 있는 상황에서는 의미가 없다.
  if (REMOTE) {
    console.log('\n[문서 정합성] 원격 대상 — 건너뜀 (로컬 소스 기준 검사)')
  } else {
  console.log('\n[문서 정합성 — 문서가 주장하는 수치 vs 실제]')
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  const summary = readFileSync(path.join(ROOT, '..', 'docs', '구축_요약.md'), 'utf8')

  // 실제 화면 수 — app/(app) 하위의 page.tsx
  const countPages = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return n + countPages(full)
    return n + (e.name === 'page.tsx' ? 1 : 0)
  }, 0)
  const screens = countPages(path.join(ROOT, 'app', '(app)'))
  const routes = Object.keys(ROUTES).length

  // 문서가 주장하는 값 (같은 수치를 여러 곳에서 반복하므로 전부 모아 비교한다)
  const claims = (text, re) => [...text.matchAll(re)].map((m) => Number(m[1]))
  const allSame = (nums, actual) => nums.length > 0 && nums.every((n) => n === actual)

  const screenClaims = [...claims(readme, /명시 화면 (\d+)종/g), ...claims(readme, /매핑 \((\d+)종\)/g),
                        ...claims(summary, /명시 화면 (\d+)종/g), ...claims(summary, /도메인 (\d+)화면/g)]
  check(`문서: 화면 수 ${screens}종 일치`, allSame(screenClaims, screens), `주장=${screenClaims.join(',')} 실제=${screens}`)

  // 리포트 종류 — REPORT_KINDS 항목마다 buildSections 분기가 있어야 한다. 분기를 빠뜨리면 제목만 그 종류이고
  //  내용은 마지막 구간(감사 대응 자료)인 리포트가 만들어져 결재 근거 문서로 첨부되고 xlsx·md 로 반출된다.
  // 시드 참조 무결성 — 자산번호를 참조하는 값이 실제 대장 자산을 가리키는지 본다. 이 배포 모델에서 시드는
  //  유일한 데이터 원천이라, 자산 하나를 지우거나 번호를 고치면 좌석·SW 설치·폐기·CMDB 의존·재물조사 차이가
  //  존재하지 않는 자산을 가리킨 채 남는다 — 화면에는 소유자·부서 없는 유령 행으로 나오고 집계만 늘어난다.
  //  (런타임에서 같은 유령 참조를 만들지 않도록 폐기 시 좌석·SW 설치·의존 참조를 정리한다 — 그 정적 짝이다.)
  //  '대장 미등록' 재물조사 차이는 정의상 대장에 없는 코드를 가리키므로 제외한다.
  const storeSrc = readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf8')
  const seedAssetsSrc = storeSrc.slice(storeSrc.indexOf('function seedAssets'), storeSrc.indexOf('\nfunction ', storeSrc.indexOf('function seedAssets') + 10))
  const seededAssets = new Set([...seedAssetsSrc.matchAll(/assetNo: '([^']+)'/g)].map((m) => m[1]))
  const danglingRefs = []
  storeSrc.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/assetNo: '([^']+)'/g)) {
      if (seededAssets.has(m[1]) || line.includes('대장 미등록')) continue
      danglingRefs.push(`${i + 1}행 ${m[1]}`)
    }
  })
  for (const m of storeSrc.matchAll(/dependsOn: \[([^\]]*)\]/g)) {
    for (const d of m[1].matchAll(/'([^']+)'/g)) if (!seededAssets.has(d[1])) danglingRefs.push(`dependsOn ${d[1]}`)
  }
  check(`시드 참조 무결성: 자산 ${seededAssets.size}건 · 참조가 모두 실재 자산을 가리킴`, danglingRefs.length === 0, danglingRefs.slice(0, 5).join(', '))

  // 시드 ID 유일성 — 레코드 조회는 전부 find(x => x.id === id) 라 같은 ID 가 둘이면 뒤엣것은 영원히 손이 닿지 않는다.
  //  실제로 결재 APR-2607-118 이 '자산 신청'과 '반납' 두 건에 함께 붙어 있었다: 결재함에서 반납 행의 승인을 눌러도
  //  서버는 앞의 자산 신청을 찾아 처리했고, 반납은 대기에 남아 자산이 회수되지 않았다(화면·감사 로그는 성공으로 보인다).
  //  e2e 의 스테일 반납 회귀조차 이 때문에 엉뚱한 레코드를 눌러 왔다. 접두어가 종류를 가르므로 전체를 한 이름공간으로 본다.
  const seededIdCounts = new Map()
  for (const m of storeSrc.matchAll(/id: '([A-Z][A-Z0-9-]*-[0-9A-Za-z-]+)'/g)) {
    seededIdCounts.set(m[1], (seededIdCounts.get(m[1]) ?? 0) + 1)
  }
  const dupIds = [...seededIdCounts.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`)
  check(`시드 ID 유일성: ${seededIdCounts.size}개 ID 중복 없음(가려진 레코드 방지)`, dupIds.length === 0, dupIds.slice(0, 5).join(', '))
  // 자산 외 참조도 같은 방식으로 — 계약·라이선스·조사 회차는 화면이 실제로 조회에 쓴다(자산 상세의 연계 계약 링크,
  //  좌석 대사, 회차별 실사 집계). 끊기면 조회가 빈손이 되거나 집계에서 조용히 빠진다.
  //  폐기 레코드의 approvalId 는 제외한다 — 시드는 최근 결재만 담고 과거 폐기 건은 당시 결재번호를 증적으로 적어 둔다
  //  (APR-2606-088·090). 링크가 아니라 참조 번호 표기라 끊긴 것이 아니다.
  const idSet = (re) => new Set([...storeSrc.matchAll(re)].map((m) => m[1]))
  const seededContracts = idSet(/id: '(CT-[^']+)'/g)
  const seededLicenses = idSet(/id: '(LIC-[^']+)'/g)
  const seededRounds = idSet(/id: '(INV-[^']+)'/g)
  const refCheck = (label, re, set) => [...storeSrc.matchAll(re)].map((m) => m[1]).filter((v) => !set.has(v)).map((v) => `${label} ${v}`)
  const danglingIds = [
    ...refCheck('contractId', /contractId: '([^']+)'/g, seededContracts),
    ...refCheck('licenseId', /licenseId: '([^']+)'/g, seededLicenses),
    ...refCheck('roundId', /roundId: '([^']+)'/g, seededRounds),
  ]
  check(`시드 참조 무결성: 계약 ${seededContracts.size}·라이선스 ${seededLicenses.size}·조사 회차 ${seededRounds.size} 참조가 모두 실재`,
    danglingIds.length === 0, [...new Set(danglingIds)].slice(0, 5).join(', '))

  const reportsSrc = readFileSync(path.join(ROOT, 'lib', 'reports.ts'), 'utf8')
  const reportKinds = [...reportsSrc.matchAll(/\{ kind: '([^']+)', period:/g)].map((m) => m[1])
  const sectionBranches = new Set([...reportsSrc.matchAll(/kind (?:===|!==) '([^']+)'/g)].map((m) => m[1])) // '감사 대응 자료' 는 마지막 구간이라 !== 로 분기한다
  const kindsNoBranch = reportKinds.filter((k) => !sectionBranches.has(k))
  check(`리포트: 종류 ${reportKinds.length}종 모두 섹션 분기 보유(제목·내용 불일치 방지)`, kindsNoBranch.length === 0, `분기 없음=${kindsNoBranch.join(',')}`)
  const reportClaims = [...claims(readme, /리포트 (\d+)종/g), ...claims(summary, /리포트 (\d+)종/g)]
  check(`문서: 리포트 ${reportKinds.length}종 일치`, allSame(reportClaims, reportKinds.length), `주장=${reportClaims.join(',')} 실제=${reportKinds.length}`)

  // 반출 종류 — EXPORT_KINDS 항목마다 buildSheets 분기가 있어야 한다. 분기를 빠뜨리면 마지막 구간(결재 이력)이
  //  그 종류의 라벨·파일명으로 반출되고, 권한도 그 종류의 메뉴 '엑셀' 칸으로 판정돼 결재를 볼 수 없어야 할 역할에게 나간다.
  const exportsSrc = readFileSync(path.join(ROOT, 'lib', 'exports.ts'), 'utf8')
  const exportKinds = [...((exportsSrc.match(/EXPORT_KINDS = \[([^\]]*)\]/) || [])[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  const sheetBranches = new Set([...exportsSrc.matchAll(/kind (?:===|!==) '([^']+)'/g)].map((m) => m[1]))
  const exportsNoBranch = exportKinds.filter((k) => !sheetBranches.has(k))
  check(`반출: 종류 ${exportKinds.length}종 모두 시트 분기 보유(라벨·내용 불일치 방지)`, exportsNoBranch.length === 0, `분기 없음=${exportsNoBranch.join(',')}`)

  // 반려 사유가 그 판단이 필요한 화면에 있는가 — 반려는 사유를 필수로 받는데, 입고 검수 반려는 그 사유를
  //  감사로그와 공급사 통지 제목에만 남기고 로트에는 붙이지 않았다. 반려 로트 앞에는 '재검수(교체품 도착)'와
  //  '반품 완료(교체 없음)'가 나란히 놓이는데 둘 중 무엇을 고를지는 왜 반려됐는지에 달려 있다 — 판단 근거를
  //  보려고 화면을 떠나 전역 감사로그를 뒤져야 했다. 결재 반려(rejectReason)와 같은 규약으로 맞춘다.
  const rejectActSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'assets', 'intake', 'actions.ts'), 'utf8')
  const rejectViewSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'assets', 'intake', 'IntakeView.tsx'), 'utf8')
  check('입고 검수 반려: 사유를 로트에 남기고 화면이 보여 준다',
    /lot\.rejectReason = /.test(rejectActSrc) && rejectViewSrc.includes('sel.rejectReason'),
    `저장=${/lot\.rejectReason = /.test(rejectActSrc)} 표시=${rejectViewSrc.includes('sel.rejectReason')}`)
  //  실제 렌더는 e2e 가 확인한다 — 이 화면의 상세 패널은 기본 선택이 첫 로트라 SSR 로는 반려 로트가 안 열리고,
  //  RSC 페이로드 문자열을 뒤지면 렌더 여부와 무관하게 통과하는 위양성이 된다(대장 조작 게이트에서 실제로 겪었다).

  // 자산 카드(인쇄용 dossier)의 완전성 — 카드는 '전체 프로필·이력'을 표방하고 감사·인수인계 때 종이로 나가는
  //  산출물이다. 대장 상세에 필드를 하나 더 붙이면서 카드를 잊으면, 화면으로 보는 사람과 종이로 보는 사람이
  //  다른 자산을 보게 된다 — 종이 쪽은 무엇이 빠졌는지 알 길이 없어 '없는 정보'가 아니라 '없는 사실'로 읽힌다.
  //  지금은 31개 필드가 양쪽에 다 있다. Asset 필드 중 상세 화면이 쓰는 것은 카드도 써야 한다는 관계로 고정한다.
  const assetTypeSrc = readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8')
  const assetIfStart = assetTypeSrc.indexOf('export interface Asset {')
  const assetIfEnd = assetTypeSrc.indexOf('\n}', assetIfStart)
  const assetFields = [...assetTypeSrc.slice(assetIfStart, assetIfEnd).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
  const dossierSrc = readFileSync(path.join(ROOT, 'app', 'api', 'asset-card', '[assetNo]', 'route.ts'), 'utf8')
  const registerViewSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'assets', 'register', 'RegisterView.tsx'), 'utf8')
  //  필드를 직접 읽지 않고 lib/types 의 공유 판정(isReceiptPending 등)을 거치는 것은 더 나은 코드다 —
  //  그 판정이 참조하는 필드도 '담고 있다'로 센다. 그러지 않으면 이 가드가 단일 출처 사용을 벌주게 된다.
  const typesPreds = new Map()
  for (const m of assetTypeSrc.matchAll(/export function (\w+)\([^)]*\)[^{]*\{([^}]*)\}/g)) typesPreds.set(m[1], m[2])
  const coveredByPred = (fl) => [...typesPreds].some(([name, body]) =>
    dossierSrc.includes(name + '(') && new RegExp('\\b' + fl + '\\b').test(body))
  const cardMissing = assetFields
    .filter((fl) => new RegExp('\\bsel\\.' + fl + '\\b').test(registerViewSrc))
    .filter((fl) => !new RegExp('\\ba\\.' + fl + '\\b').test(dossierSrc) && !coveredByPred(fl))
  check(`자산 카드: 상세 화면이 쓰는 Asset 필드를 카드도 모두 담는다(필드 ${assetFields.length}개 검사)`,
    assetFields.length >= 25 && cardMissing.length === 0, `카드 누락=${cardMissing.join(', ')}`)

  // 반출 시트의 열 정렬 — 헤더 칸수와 데이터 행의 칸수가 어긋나면 엑셀에서 그 행부터 모든 값이 옆 칸으로
  //  밀린다. 소거일 칸에 처리자가, 처리자 칸에 확인서 번호가 들어가는 식이라 파일을 열기 전에는 드러나지
  //  않는다 — 반출물은 감사·정산 증적이라 조용히 밀린 열이 가장 나쁘다. header 배열과 rows 의 길이를 맞추는
  //  일은 사람이 손으로 지켜 왔고(시트 18개), 열을 하나 추가할 때 한쪽만 고치기 쉽다.
  //  실제 산출물(.xlsx 는 무압축 ZIP + inlineStr)을 받아 <row> 마다 <c> 수를 세어 전수 대조한다.
  let arityBad = []
  let aritySheets = 0
  for (const k of exportKinds) {
    const res = await get(`/api/export/${k}`, 'ADMIN')
    if (res.status !== 200) { arityBad.push(`${k}:HTTP${res.status}`); continue }
    const xml = Buffer.from(await res.arrayBuffer()).toString('latin1')
    for (const sm of xml.matchAll(/<sheetData>([\s\S]*?)<\/sheetData>/g)) {
      aritySheets += 1
      const cells = [...sm[1].matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)]
        .map((r) => (r[1].match(/<c[ >]/g) || []).length)
      if (!cells.length) continue
      const head = cells[0]
      const off = cells.map((n, i) => ({ n, i })).filter((x) => x.i > 0 && x.n !== head)
      if (off.length) arityBad.push(`${k}: 헤더 ${head}칸 ≠ 행 ${off[0].i + 1} ${off[0].n}칸 (${off.length}행)`)
    }
  }
  check(`반출 열 정렬: ${exportKinds.length}종 · 시트 ${aritySheets}개의 모든 행이 헤더와 같은 칸수`,
    arityBad.length === 0 && aritySheets >= 10, `어긋남=${arityBad.join(' | ')}`)

  // 라우트 권한 3중 정합 — README 가 "라우트 권한을 바꿀 때는 세 곳(lib/authz requireRole · components/chrome/menus.ts ·
  //  스모크 ROUTES)을 함께 갱신하라"고 적어 둔 수작업 규칙이다. requireRole 은 위 접근 매트릭스(라우트 × 권한 HTTP 호출)가
  //  검증하지만 menus.ts 는 아무도 검증하지 않았다 — 어긋나면 내비에 보이는데 서버가 막거나(막다른 길),
  //  접근은 되는데 내비에 없어(화면 도달 불가) 조용히 갈린다. 역할 상수는 파일에서 그대로 읽어 새 상수가 생겨도 따라간다.
  const navSrc = readFileSync(path.join(ROOT, 'components', 'chrome', 'menus.ts'), 'utf8')
  const navConst = {}
  for (const m of navSrc.matchAll(/const ([A-Z_]+): Role\[\] = \[([^\]]*)\]/g)) {
    navConst[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  const navRoles = {}
  for (const m of navSrc.matchAll(/href: '([^']+)'[^}]*roles: ([A-Z_]+|\[[^\]]*\])/g)) {
    navRoles[m[1]] = navConst[m[2]] ?? [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  const roleKey = (a) => [...a].sort().join(',')
  const navDiff = []
  for (const [href, roles] of Object.entries(navRoles)) {
    if (!ROUTES[href]) navDiff.push(`${href}(내비에만 있음)`)
    else if (roleKey(roles) !== roleKey(ROUTES[href])) navDiff.push(`${href}(내비=${roles.join('·')} 가드=${ROUTES[href].join('·')})`)
  }
  for (const href of Object.keys(ROUTES)) if (!navRoles[href]) navDiff.push(`${href}(가드에만 있음)`)
  check(`라우트 권한: 내비(menus.ts) ${Object.keys(navRoles).length}개와 화면 가드 매트릭스 일치`, navDiff.length === 0, navDiff.join(', '))

  // 화면 파일 ↔ 내비 정합 — 라우트 권한 3중 정합의 마지막 한 변이다. app/(app) 아래 page.tsx 가 내비에 없으면
  //  메뉴로 도달할 수 없고 스모크 접근 매트릭스·헬스 대상에서도 빠져 아무 스위트가 열어보지 않는 화면이 된다.
  //  반대로 내비에만 있으면 메뉴를 눌러 404 가 난다. (헬스는 내비에서 대상을 읽으므로 이 검사가 그 전제를 지킨다.)
  const pageDirs = []
  const walkPages = (dir, rel) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walkPages(path.join(dir, ent.name), `${rel}/${ent.name}`)
      else if (ent.name === 'page.tsx' && rel) pageDirs.push(rel)
    }
  }
  walkPages(path.join(ROOT, 'app', '(app)'), '')
  const navHrefs = new Set(Object.keys(navRoles))
  const orphanPages = pageDirs.filter((r) => !navHrefs.has(r))
  const deadNav = [...navHrefs].filter((r) => !pageDirs.includes(r))
  check(`라우트 권한: 화면 파일 ${pageDirs.length}개와 내비 항목 일치(고아 화면·죽은 메뉴 없음)`,
    orphanPages.length === 0 && deadNav.length === 0,
    `내비에 없는 화면=${orphanPages.join(',')} · 화면 없는 내비=${deadNav.join(',')}`)

  // 스냅샷 스키마 형태 가드 — 파일 영속화(ITAM_DATA_FILE)는 마이그레이션 없이 SCHEMA_VERSION 이 다르면 낡은 파일을
  //  버리고 시드로 시작한다. 그래서 형태(Store 키·엔티티 필드)를 바꾸면서 버전을 그대로 두면, 재기동 뒤 새 필드가
  //  없는 스냅샷이 그대로 로드돼 화면이 undefined 를 읽는다(볼륨을 쓰는 배포에서만 드러나 되돌리기 늦다).
  //  형태에서 지문을 계산해 lib/store.ts 의 SCHEMA_SHAPE 와 대조한다 — 형태를 바꾸면 이 검사가 먼저 걸린다.
  const fnv1a = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k += 1) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0") }
  const blockOf = (src, header) => {
    const ls = src.split(/\r?\n/)
    const at = ls.findIndex((x) => x.startsWith(header))
    if (at < 0) return null
    let e = at + 1
    while (e < ls.length && ls[e].trim() !== "}") e += 1
    return ls.slice(at + 1, e)
  }
  const typesSrc = readFileSync(path.join(ROOT, "lib", "types.ts"), "utf8")
  const storeFieldLines = blockOf(storeSrc, "export interface Store {") ?? []
  const shapeParts = []
  for (const line of storeFieldLines) {
    const fm = /^\s*([A-Za-z0-9_]+)\??:\s*([A-Za-z0-9_]+)/.exec(line)
    if (!fm) continue
    const entity = blockOf(typesSrc, "export interface " + fm[2] + " {")
    const names = entity ? entity.map((l) => (/^\s*([A-Za-z0-9_]+)\??:/.exec(l) || [])[1]).filter(Boolean).sort() : ["<primitive>"]
    shapeParts.push(fm[1] + ":" + fm[2] + "(" + names.join(",") + ")")
  }
  shapeParts.sort()
  const shapeDigest = fnv1a(shapeParts.join("|"))
  const declaredShape = (/SCHEMA_SHAPE = '([0-9a-f]+)'/.exec(storeSrc) || [])[1]
  const schemaVersion = (/SCHEMA_VERSION = (\d+)/.exec(storeSrc) || [])[1]
  check(`스냅샷 스키마: 형태 지문 ${shapeDigest} = 선언값(SCHEMA_VERSION ${schemaVersion} · 엔티티 ${shapeParts.length}종)`,
    declaredShape === shapeDigest,
    `선언=${declaredShape} 실제=${shapeDigest} — 형태를 바꿨다면 SCHEMA_VERSION 을 올리고 SCHEMA_SHAPE 를 ${shapeDigest} 로 갱신하세요`)

  // 헬스 로드 횟수 ↔ 문서 — 헬스는 대상 화면을 내비에서 읽으므로(scripts/client-health.mjs) 화면·권한이 바뀌면
  //  로드 횟수가 저절로 바뀐다. README 가 그 수를 적어 두고 있어 놔두면 조용히 어긋난다(다른 수치 주장과 같은 규약).
  //  대상 권한그룹은 헬스가 여는 4종 — 여기 목록이 스크립트와 어긋나면 이 검사 자체가 헛돈다(스크립트도 4종 고정).
  const healthRoles = ['ADMIN', 'ASSET_MGR', 'SEC_MGR', 'USER']
  const healthLoads = healthRoles.reduce((n, r) => n + Object.values(navRoles).filter((rs) => rs.includes(r)).length, 0)
  const healthClaims = claims(readme, /접근 화면 (\d+)회 로드/g)
  check(`문서: 헬스 화면 로드 ${healthLoads}회 일치(권한그룹 4종 × 접근 화면)`,
    allSame(healthClaims, healthLoads), `주장=${healthClaims.join(",")} 실제=${healthLoads}`)

  // 레이아웃 스윕 규모 ↔ 문서 — 대상 화면은 스윕이 내비에서 읽으므로(ADMIN 접근 화면) 화면이 늘면 저절로 늘어난다.
  //  스윕이 목록을 자체 보유하면 새 화면이 조용히 빠지므로, 내비에서 읽는지도 함께 못박는다.
  const layoutSrc = readFileSync(path.join(ROOT, 'scripts', 'layout-sweep.mjs'), 'utf8')
  const layoutRoutes = Object.values(navRoles).filter((rs) => rs.includes('ADMIN')).length
  const layoutWidths = (/const WIDTHS = \[([^\]]*)\]/.exec(layoutSrc)?.[1] ?? '').split(',').filter((x) => x.trim()).length
  const layoutClaims = claims(readme, /화면 (\d+)종 × 폭 \d+종/g)
  const widthClaims = claims(readme, /화면 \d+종 × 폭 (\d+)종/g)
  const layoutDerives = layoutSrc.includes("'components', 'chrome', 'menus.ts'") && !/const ROUTES = \[\s*'/.test(layoutSrc)
  check('레이아웃 스윕: 대상 화면을 내비(menus.ts)에서 읽는다(자체 목록 없음)', layoutDerives,
    `menus.ts 사용=${layoutSrc.includes("menus.ts")} · 하드코딩 목록=${/const ROUTES = \[\s*'/.test(layoutSrc)}`)
  check(`문서: 레이아웃 스윕 화면 ${layoutRoutes}종 × 폭 ${layoutWidths}종 일치`,
    allSame(layoutClaims, layoutRoutes) && allSame(widthClaims, layoutWidths),
    `화면 주장=${layoutClaims.join(",")} 실제=${layoutRoutes} · 폭 주장=${widthClaims.join(",")} 실제=${layoutWidths}`)
  const routeClaims = [...claims(readme, /\((\d+) 라우트 × 4/g), ...claims(summary, /(\d+) 라우트 × 4/g)]
  check(`문서: 라우트 수 ${routes}개 일치`, allSame(routeClaims, routes), `주장=${routeClaims.join(',')} 실제=${routes}`)

  // 날짜 입력 검증 — 서버 액션이 날짜를 형식(YYYY-MM-DD)만 보고 받으면 2026-02-31·평년 2/29 같은
  //  실재하지 않는 날이 그대로 저장된다. 화면·엑셀은 입력값을 그대로 찍는데 daysUntil 은 Date 파싱으로
  //  3/3·3/1 로 굴러가(V8 rollover) 표시일과 잔여일이 어긋나고, 같은 함수 안의 문자열 비교(due <= today())는
  //  굴러가기 전 리터럴을 보므로 한 판정의 두 축이 다른 날을 가리킨다. 2026-13-45 처럼 파싱 자체가 실패하면
  //  daysUntil 이 null → '?? 999' 폴백이라 정기 점검·연체 경보가 영영 뜨지 않는다(경보가 조용히 꺼진다).
  //  달력 규칙은 lib/dates 의 isValidDate 한 곳에 두고, 액션이 형식 정규식으로 되돌아가지 않는지 본다.
  const BS = String.fromCharCode(92)
  const FORMAT_ONLY = '/^' + BS + 'd{4}-' + BS + 'd{2}-' + BS + 'd{2}$/.test('
  const actionFiles = []
  const walkActions = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walkActions(path.join(dir, ent.name))
      else if (ent.name === 'actions.ts') actionFiles.push(path.join(dir, ent.name))
    }
  }
  walkActions(path.join(ROOT, 'app'))
  const fileLabel = (f) => path.basename(path.dirname(f))
  const formatOnly = actionFiles.filter((f) => readFileSync(f, 'utf8').includes(FORMAT_ONLY))
  const calendarChecked = actionFiles.filter((f) => readFileSync(f, 'utf8').includes('isValidDate('))
  check(`날짜 입력: 액션 ${calendarChecked.length}개 파일이 달력 검증(isValidDate) 사용 · 형식만 보는 검사 0개`,
    formatOnly.length === 0 && calendarChecked.length >= 7,
    `형식만=${formatOnly.map(fileLabel).join(',')} · 달력검증=${calendarChecked.map(fileLabel).join(',')}`)

  // 수집 시간대 단일 소스 — 창 문자열('HH:MM ~ HH:MM')을 읽는 규칙이 액션마다 따로 있으면 쓰는 쪽(설정 저장)과
  //  판정하는 쪽(능동 스캔 실행)이 갈린다. 실제로 저장은 앵커·범위를 보는데 판정은 부분 일치로 읽고 파싱 실패 시
  //  참을 돌려줘(fail open), 깨진 시간대가 §07 안전장치를 조용히 껐다. 규칙은 lib/scan-policy 한 곳에 둔다.
  const WINDOW_RE_FRAGMENT = BS + 's*~' + BS + 's*'
  const localWindowParsers = actionFiles.filter((f) => readFileSync(f, 'utf8').includes(WINDOW_RE_FRAGMENT))
  const scanPolicySrc = readFileSync(path.join(ROOT, 'lib', 'scan-policy.ts'), 'utf8')
  const failsClosed = scanPolicySrc.includes('const w = parseScanWindow(window)') && scanPolicySrc.includes('if (!w) return false')
  check('수집 시간대: 창 파싱이 lib/scan-policy 한 곳 · 읽을 수 없는 창은 창 밖으로 판정(fail closed)',
    localWindowParsers.length === 0 && failsClosed,
    `액션 내 파싱=${localWindowParsers.map(fileLabel).join(',')} · fail-closed=${failsClosed}`)

  // 감사 누락 가드 — 상태를 바꾸는 서버 액션(revalidatePath 로 화면을 갱신하는 액션)은 §07 추적성에 따라 감사 기록을 남긴다.
  //  지금은 195개 중 3개만 예외이고 그 셋도 위임(생성·상신 헬퍼가 대신 남김)이거나 감사 대상이 아니다. 새 액션이 감사 없이
  //  들어오면 화면·데이터는 바뀌는데 누가 바꿨는지가 감사 로그에 없다 — 사람이 기억할 일이 아니라 테스트가 잡을 일이다.
  const AUDIT_DELEGATED = {
    generateReport: 'lib/reports createReport 가 남긴다',
    actOnLicense: 'lib/license raiseLicenseApproval 이 남긴다',
    recordPostView: '조회수 카운터 — 감사 대상 아님',
  }
  const auditMissing = []
  let mutatingActions = 0
  for (const f of actionFiles) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/)
    for (let li = 0; li < lines.length; li += 1) {
      const m = /^export async function ([A-Za-z0-9_]+)/.exec(lines[li])
      if (!m) continue
      let e = li + 1
      while (e < lines.length && lines[e] !== '}') e += 1
      const body = lines.slice(li, e + 1).join('\n')
      if (!body.includes('revalidatePath')) continue
      mutatingActions += 1
      if (/appendAudit|appendAdminAudit|\baudit\(/.test(body)) continue
      if (m[1] in AUDIT_DELEGATED) continue
      auditMissing.push(`${fileLabel(f)}:${m[1]}`)
    }
  }
  check(`감사 누락 가드: 상태 변경 액션 ${mutatingActions}개가 모두 감사 기록(예외 ${Object.keys(AUDIT_DELEGATED).length}건은 위임·대상 외)`,
    auditMissing.length === 0 && mutatingActions >= 190,
    `감사 없음=${auditMissing.join(',')} · 대상=${mutatingActions}`)

  // 화면 갱신 누락 가드 — 스토어를 바꿔 놓고 revalidatePath 를 부르지 않으면 화면이 예전 데이터를 계속 보여 준다.
  //  조작자는 아무 일도 안 일어난 줄 알고 같은 버튼을 다시 누르고, 그 사이 중복 발송·중복 상신이 생긴다.
  //  판정은 감사 가드와 같은 훑기를 쓰되, 이쪽은 "상태를 바꾸는 코드"를 형태로 찾는다(배열 변경·주요 필드 대입).
  const MUTATION_SHAPES = [
    /\bs\.[a-zA-Z]+\.(push|unshift|splice)\(/,
    /\.status = /, /\.action = /, /\.owner = /, /\.dept = /, /\.enabled = /,
  ]
  const staleScreens = []
  for (const f of actionFiles) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/)
    for (let li = 0; li < lines.length; li += 1) {
      const m = /^export async function ([A-Za-z0-9_]+)/.exec(lines[li])
      if (!m) continue
      let e = li + 1
      while (e < lines.length && lines[e] !== '}') e += 1
      const body = lines.slice(li, e + 1).join('\n')
      if (!MUTATION_SHAPES.some((re) => re.test(body))) continue
      if (body.includes('revalidatePath')) continue
      staleScreens.push(`${fileLabel(f)}:${m[1]}`)
    }
  }
  check(`화면 갱신 가드: 스토어를 바꾸는 액션이 모두 revalidatePath 호출(액션 파일 ${actionFiles.length}개 검사)`,
    staleScreens.length === 0, `갱신 없음=${staleScreens.join(',')}`)

  // 통지 수신자 가드 — 보유자 자리에 자리표시자가 그대로 실리면 "- (자산관리팀)"·"미지정 (부서)" 앞으로 발송된다.
  //  발송 이력에는 남지만 아무도 읽지 않는 통지가 되고, 조치는 아무도 하지 않은 채 큐만 비어 보인다.
  //  수신자 표기는 lib/notify 의 recipientOf 한 곳에서 만든다(보유자 없으면 관리 부서로).
  const rawRecipients = []
  for (const f of actionFiles) {
    const lines = readFileSync(f, 'utf8').split(/\r?\n/)
    lines.forEach((line, li) => {
      if (line.includes('recipientOf') || line.includes('ownerDept')) return
      if (!/to:\s*`[^`]*\$\{[^}]*(owner|holder)/.test(line)) return
      rawRecipients.push(`${fileLabel(f)}:${li + 1}`)
    })
  }
  check(`통지 수신자: 보유자 표기가 lib/notify recipientOf 한 곳(액션 파일 ${actionFiles.length}개 검사)`,
    rawRecipients.length === 0, `직접 표기=${rawRecipients.join(',')}`)


  // CMDB 의존 그래프 형태 — 자기 참조·순환이 없어야 한다. 탐색(assetDependenciesFrom)은 방문 집합으로 순환에
  //  빠지지 않지만, 순환이 있으면 그 자산이 자기 영향 범위(blast radius)에 포함돼 단일 장애점 수가 부풀고
  //  '이 자산 장애 시 영향받는 하위'에 자기 자신이 나열된다. dependsOn 은 시드에서만 정의되고 편집 경로가
  //  없으므로(폐기 시 정리만 한다) 시드 형태를 정적으로 못박아 둔다. 없는 상위 참조는 위 시드 참조 무결성이 본다.
  const depGraph = {}
  for (const line of storeSrc.split(/\r?\n/)) {
    const no = /assetNo: '(AST-[^']+)'/.exec(line)
    const dp = /dependsOn: \[([^\]]*)\]/.exec(line)
    if (no && dp) depGraph[no[1]] = [...dp[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  const selfDeps = Object.entries(depGraph).filter(([k, v]) => v.includes(k)).map(([k]) => k)
  const depCycles = []
  const walkDep = (node, stack, seen) => {
    if (stack.includes(node)) { depCycles.push([...stack.slice(stack.indexOf(node)), node].join('→')); return }
    if (seen.has(node)) return
    seen.add(node)
    for (const up of depGraph[node] ?? []) walkDep(up, [...stack, node], seen)
  }
  for (const node of Object.keys(depGraph)) walkDep(node, [], new Set())
  check(`CMDB 의존 그래프: 자기 참조·순환 없음(의존 정의 ${Object.keys(depGraph).length}건)`,
    Object.keys(depGraph).length > 0 && selfDeps.length === 0 && depCycles.length === 0,
    `자기참조=${selfDeps.join(',')} 순환=${[...new Set(depCycles)].join(' | ')}`)
  // SaaS 판정 SLA 의 전제 — 검토중 항목에는 검토 접수일(reviewSince)이 있어야 경과일을 셀 수 있다. 없으면
  //  판정 기한 경과를 계산할 수 없어(지금은 fail safe 로 경과 처리한다) 큐가 '경과일 미상' 항목으로 채워진다.
  //  등재 경로(수동 등재·상태 전이)는 모두 접수일을 남기므로, 시드가 그 전제를 지키는지 정적으로 못박아 둔다.
  const catPending = [...storeSrc.matchAll(/\{ id: '(CAT-[^']+)'[^}]*\}/g)]
    .map((m) => m[0])
    .filter((row) => row.includes("status: '검토중'"))
  const catNoSince = catPending
    .filter((row) => !row.includes('reviewSince:'))
    .map((row) => (/id: '(CAT-[^']+)'/.exec(row) || [])[1])
  check(`SaaS 카탈로그: 검토중 ${catPending.length}건 모두 검토 접수일 보유(판정 SLA 계산 전제)`,
    catPending.length > 0 && catNoSince.length === 0, `접수일 없음=${catNoSince.join(', ')}`)
  // 재물조사 차이 카운터 정합 — round.mismatched 는 결재 처리(decide)가 '조정 완료가 아닌 차이 건수'로 다시 계산하고,
  //  실사 스캔(scanAsset)은 차이가 새로 생길 때마다 +1 한다. 즉 진행 중 회차에서 이 숫자는 '미조치 차이 건수'다.
  //  시드가 그 정의와 어긋나면 화면은 조정할 것이 6건이라고 하는데 조정 콘솔에는 11건이 뜨는 식으로 갈리고,
  //  첫 조정 결재가 승인되는 순간 숫자가 갑자기 뛴다(재계산이 실제 값을 덮어쓰므로). 완료 회차는 당시 발견 건수를
  //  남기는 이력이라 대상에서 뺀다 — 차이 행을 보관하지 않는다(시드 INV-2026-H1: 14건, 행 없음).
  const roundDecl = {}
  for (const m of storeSrc.matchAll(/id: '(INV-[^']+)'[^}]*?status: '([^']*)'[^}]*?mismatched: ([0-9_]+)|id: '(INV-[^']+)'[^}]*?mismatched: ([0-9_]+)[^}]*?status: '([^']*)'/g)) {
    const id = m[1] ?? m[4]
    const status = m[2] ?? m[6]
    const n = Number((m[3] ?? m[5]).replace(/_/g, ''))
    roundDecl[id] = { status, declared: n, open: 0 }
  }
  const DIFF_KINDS = ['위치 불일치', '상태 불일치', '미확인 (실사 없음)', '대장 미등록']
  for (const line of storeSrc.split(/\r?\n/)) {
    const r = /roundId: '(INV-[^']+)'/.exec(line)
    if (!r || !DIFF_KINDS.some((k) => line.includes(`kind: '${k}'`))) continue
    const st = /status: '([^']*)'/.exec(line)
    if (roundDecl[r[1]] && st && st[1] !== '조정 완료') roundDecl[r[1]].open += 1
  }
  const roundDrift = Object.entries(roundDecl)
    .filter(([, v]) => v.status !== '완료' && v.declared !== v.open)
    .map(([id, v]) => `${id}(표시 ${v.declared} · 미조치 ${v.open})`)
  check(`재물조사 차이 카운터: 진행 중 회차 ${Object.values(roundDecl).filter((v) => v.status !== '완료').length}건이 미조치 차이 수와 일치`,
    roundDrift.length === 0, roundDrift.join(', '))
  // 비운영 상태 목록 단일 소스 — '운영 중이 아닌 자산'(폐기 경로·분실·수리중·반납대기)은 예방 정비 큐(lib/dates)와
  //  EOL 교체 대상 판정(lib/eol)이 함께 쓰는 하나의 개념인데, 두 모듈이 각자 같은 배열을 적어 두고 주석으로 서로를
  //  '동일하게'라고 가리켰다. 상태가 하나 늘면 한쪽만 고쳐도 통과해, 같은 자산이 점검 대상인데 교체 대상은 아니게 된다.
  //  목록은 lib/types 의 NON_OPERATIONAL_STATUSES 하나만 두고, 다른 파일이 다시 적지 않는지 본다.
  const STATUS_LITERAL = "'분실', '수리중', '반납대기'"
  const sourceFiles = []
  const walkSrc = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walkSrc(p)
      else if (/\.tsx?$/.test(ent.name)) sourceFiles.push(p)
    }
  }
  for (const d of ['app', 'lib', 'components']) walkSrc(path.join(ROOT, d))
  // 권한 스윕 대상(ROUTES)이 실제 화면 전부인가 — ROUTES 는 '30 라우트 × 4 권한그룹'을 훑는 근거이자 문서가 세는 수다.
  //  새 화면을 만들고 여기에 안 적으면 그 화면만 권한 검사를 한 번도 받지 않은 채 통과하고(무증상), 문서의 라우트 수도
  //  조용히 실제보다 적게 말한다. 파일 시스템의 page.tsx 와 정확히 같은 집합인지 본다.
  //  로그인·루트는 인증 진입점이라 권한 매트릭스 대상이 아니다(그 예외를 여기 명시해 둔다).
  const AUTH_ENTRY = ['/login', '/']
  const pageRoutes = sourceFiles
    .filter((f) => path.basename(f) === 'page.tsx')
    .map((f) => '/' + path.relative(path.join(ROOT, 'app'), path.dirname(f)).split(path.sep).filter((seg) => !seg.startsWith('(')).join('/'))
    .filter((r) => !AUTH_ENTRY.includes(r))
  const listed = Object.keys(ROUTES)
  const missing = pageRoutes.filter((r) => !listed.includes(r))
  const stale = listed.filter((r) => !pageRoutes.includes(r))
  check(`권한 스윕 대상: ROUTES 가 실제 화면 전부(화면 ${pageRoutes.length}개 · 등재 ${listed.length}개)`,
    missing.length === 0 && stale.length === 0, `누락=${missing.join(', ') || '없음'} 유령=${stale.join(', ') || '없음'}`)

  // 재탐지 주기 ↔ 임계값 짝 — 정책 편집기가 고를 수 있는 주기(SCAN_INTERVALS)에 임계값(INTERVAL_MS)이 없으면
  //  isScanOverdue 가 그냥 false 를 돌려준다. 그 주기를 고른 채널은 아무리 오래 멈춰 있어도 '재탐지 지연'으로
  //  잡히지 않는다 — 관리자가 주기를 고르는 행위가 정체 경보를 조용히 끄는 셈이다(같은 모듈의 수집 시간대
  //  파싱이 '§07 시간대 안전장치가 조용히 꺼진다'고 경고하는 것과 같은 계열). 두 목록이 정확히 같은지 본다.
  const scanTypes = readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8')
  const scanPol = readFileSync(path.join(ROOT, 'lib', 'scan-policy.ts'), 'utf8')
  const intervals = [...(/SCAN_INTERVALS[^=]*=\s*\[([^\]]+)\]/.exec(scanTypes)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  const thresholds = [...(/INTERVAL_MS[^=]*=\s*\{([^}]+)}/.exec(scanPol)?.[1] ?? '').matchAll(/'([^']+)':/g)].map((m) => m[1])
  const noThreshold = intervals.filter((x) => !thresholds.includes(x))
  const orphanThreshold = thresholds.filter((x) => !intervals.includes(x))
  check(`재탐지 주기: 고를 수 있는 주기마다 지연 임계값이 있다(주기 ${intervals.length}종)`,
    intervals.length >= 8 && noThreshold.length === 0 && orphanThreshold.length === 0,
    `임계값 없음=${noThreshold.join(', ') || '없음'} 유령 임계값=${orphanThreshold.join(', ') || '없음'}`)

  // 채널별 '마지막 수집' 산출의 단일 소스 — 스캔 화면은 같은 행에 마지막 수집 시각과 '재탐지 지연' 배지를 나란히 세운다.
  //  배지는 lib/scan-policy 판정인데 시각을 화면이 따로 구하면, 한쪽만 바뀔 때 '방금 수집했는데 지연'이라고 말하게 된다.
  const seenAtDupes = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/scan-policy.ts')
    .filter(([, src]) => src.split(/\r?\n/).some((ln) => !ln.trim().startsWith('//') && /o\.seenAt >/.test(ln)))
    .map(([rel]) => rel)
  check(`마지막 수집 산출: lib/scan-policy 밖에 사본 없음(소스 ${sourceFiles.length}개 검사)`,
    seenAtDupes.length === 0, `사본=${seenAtDupes.join(', ') || '없음'}`)

  // 드릴다운 링크가 실제로 거르는가 — 큐·카드가 '/assets/register?maint=1' 처럼 파라미터를 붙여 목록으로 보내는데,
  //  대상 페이지가 그 파라미터를 읽지 않으면 필터 없는 전체 목록이 뜬다. 화면은 '이 큐의 N건'으로 보냈는데 사용자는
  //  전량을 받는 셈이라, 건수와 목록이 어긋나는 것을 넘어 어느 행이 그 큐인지 알 수 없다(조용히 넓어지는 드릴다운).
  //  링크에 쓰인 (경로, 파라미터) 조합마다 대상 페이지 소스가 그 이름을 실제로 다루는지 본다.
  const linkParams = new Map()
  for (const f of sourceFiles) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/')
    for (const m of readFileSync(f, 'utf8').matchAll(/['`"](\/[a-z0-9\-\/]+)\?([a-zA-Z0-9=&${}._\-]+)['`"]/g)) {
      for (const pair of m[2].split('&')) {
        const key = pair.split('=')[0]
        if (!key || key.includes('$')) continue // 변수 보간 파라미터는 이름을 알 수 없어 제외
        const id = m[1] + '?' + key
        if (!linkParams.has(id)) linkParams.set(id, new Set())
        linkParams.get(id).add(rel)
      }
    }
  }
  const routeSrc = (route) => {
    for (const cand of [path.join(ROOT, 'app', '(app)', ...route.slice(1).split('/')), path.join(ROOT, 'app', ...route.slice(1).split('/'))]) {
      if (!existsSync(cand)) continue
      return readdirSync(cand).filter((e) => /\.tsx?$/.test(e)).map((e) => readFileSync(path.join(cand, e), 'utf8')).join('\n')
    }
    return null
  }
  const deadLinks = [...linkParams].flatMap(([id, from]) => {
    const [route, key] = id.split('?')
    const src = routeSrc(route)
    if (src === null) return [id + '(대상 화면 없음)']
    return src.includes(key) ? [] : [id + '(' + [...from].join(',') + ')']
  })
  check(`드릴다운 링크: 대상 화면이 파라미터를 실제로 다룸(링크 ${linkParams.size}종 검사)`,
    linkParams.size >= 30 && deadLinks.length === 0, `미처리=${deadLinks.join(', ') || '없음'}`)

  const statusDupes = sourceFiles
    .filter((f) => readFileSync(f, 'utf8').includes(STATUS_LITERAL))
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter((rel) => rel !== 'lib/types.ts')
  check(`비운영 상태 목록: lib/types 한 곳만 정의(소스 ${sourceFiles.length}개 검사)`, statusDupes.length === 0, `중복 정의=${statusDupes.join(', ')}`)

  // 비율 표기 단일 규약 가드 — 백분율을 화면·리포트가 각자 Math.round 로 계산하면 이정표(0%·100%)를 넘겨 짚어
  //  표기와 판정이 어긋난다(89.6%→90% 인데 상태는 정상, 0.05%→0% 인데 상태는 정상). 규약은 lib/dates ratioPct 한 곳.
  //  신뢰도(0~1 점수)·내용연수 경과율·위험 점수처럼 부분/전체 비율이 아닌 계산은 예외로 이름과 이유를 적어 둔다.
  const PCT_EXEMPT = {
    'lib/auto-classify.ts': '분류 신뢰도 평균 — 0~1 점수의 평균이지 부분/전체 비율이 아니다',
    'lib/cost.ts': '감가상각률 — 내용연수 경과 비율(시간축)이라 상한만 두고 floor 로 계산한다',
    'lib/vuln-priority.ts': '취약점 점수 — 심각도×중요도 가중치의 정규화 점수(비율 아님)',
    'lib/dates.ts': 'ratioPct 자신의 구현',
  }
  const pctOffenders = []
  for (const f of [...actionFiles, ...sourceFiles]) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/")
    if (rel in PCT_EXEMPT) continue
    const src = readFileSync(f, "utf8")
    // 줄 단위 휴리스틱 — 중첩 괄호(예: (1 - book / acq) * 100)를 정규식 하나로 잡기 어렵다. JSX 태그(</td>)의 슬래시는 걷어내고 나눗셈만 본다.
    const bad = src.split(/\r?\n/).map((line) => line.replace(/<[^>]*>/g, "")).some((line) => /Math\.(round|floor|ceil)\(/.test(line) && line.includes("* 100") && line.includes("/") && !line.includes("ratioPct"))
    if (bad) pctOffenders.push(rel)
  }
  check(`비율 표기: 백분율 계산이 lib/dates ratioPct 한 곳(소스 ${sourceFiles.length + actionFiles.length}개 검사 · 예외 ${Object.keys(PCT_EXEMPT).length}건)`,
    pctOffenders.length === 0, `직접 계산=${pctOffenders.join(",")}`)

  // 보증 임박 판정 단일 소스 — 만료 알림 창(opsPolicy.expiryWindowDays)은 설정 화면이 '계약·보증·라이선스' 기준이라고
  //  안내하는데, 보증만 여러 곳에 90 이 박혀 있었다(대장 필터·대시보드 큐·어시스턴트·반출·복합 위험 신호).
  //  통지(lib/expiry)는 정책을 따랐으므로, 관리자가 창을 바꾸면 '보증 만료 임박 자산 N건' 통지와 화면 집합이 갈렸다.
  //  판정은 lib/dates 의 isWarrantyExpiring 하나만 두고, 다른 파일이 보증 만료일에 직접 임계값을 대지 않는지 본다.
  const warrantyHardcoded = sourceFiles
    .filter((f) => {
      const src = readFileSync(f, 'utf8')
      return src.split(/\r?\n/).some((ln) => ln.includes('warrantyEnd') && /daysUntil\([a-zA-Z]+\.warrantyEnd\)[^]*<=/.test(ln))
    })
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter((rel) => rel !== 'lib/dates.ts')
  check(`보증 임박 판정: lib/dates 한 곳만 임계 비교(소스 ${sourceFiles.length}개 검사)`, warrantyHardcoded.length === 0, `직접 비교=${warrantyHardcoded.join(', ')}`)

  // 보증 '만료 임박' 칩·열의 창 — 위 가드는 daysUntil(...warrantyEnd) <= 형태만 봤고, warrantyState 는 Date.parse 차이를
  //  직접 비교해 90 을 박은 채 빠져나갔다. 그래서 같은 대장 화면에서 '보증 임박' 필터 설명은 정책 일수를 말하는데 행의
  //  칩은 90일로 서고, 같은 반출본이 정책 창으로 거른 행 목록 옆에 90일로 매긴 '보증 상태' 열을 나란히 실었다.
  //  창은 운영 정책 하나만 따르게 하고(기본값 상수만 허용), 렌더하는 호출부가 정책값을 넘기는지 본다.
  const wsSrc = readFileSync(path.join(ROOT, 'lib/dates.ts'), 'utf8')
  const wsBody = (wsSrc.split('export function warrantyState')[1] ?? '').split('\n}')[0]
  const wsLiteral = /<=\s*\d/.test(wsBody)
  const wsParam = /windowDays: number = EXPIRY_WINDOW_DAYS/.test(wsBody)
  check('보증 상태: 임박 창을 상수로 박지 않고 인자로 받는다(기본값=운영 정책 기본)', !wsLiteral && wsParam, `리터럴 비교=${wsLiteral} 인자=${wsParam}`)

  // 렌더하는 호출부는 정책값을 넘긴다 — 기본값이 있어 두 인자로 불러도 컴파일은 되지만, 그러면 관리자가 창을 줄여도
  //  그 화면만 기본 90일로 남는다(정확히 이번에 고친 증상). 인자 개수만 세면 되므로 넘긴 값까지는 보지 않는다.
  //  인자에 today()·getStore().opsPolicy 처럼 괄호가 중첩되므로 정규식이 아니라 괄호 균형으로 최상위 콤마를 센다
  //  (정규식으로 세면 today() 를 인자 끝으로 읽어 정상 호출을 '창 미전달'로 잘못 잡는다).
  const topLevelArgs = (src, from) => {
    let depth = 0, args = 1
    for (let i = from; i < src.length; i++) {
      const c = src[i]
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return args; depth-- }
      else if (c === ',' && depth === 0) args++
    }
    return args
  }
  const wsCallers = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/dates.ts')
    .flatMap(([rel, src]) => src.split(/\r?\n/).flatMap((ln, i) => {
      if (ln.trim().startsWith('*') || ln.trim().startsWith('//')) return []
      const at = ln.indexOf('warrantyState(')
      return at < 0 ? [] : [[rel, i + 1, topLevelArgs(ln, at + 'warrantyState('.length)]]
    }))
  const wsBare = wsCallers.filter(([, , n]) => n < 3)
  check(`보증 상태 호출부 ${wsCallers.length}곳: 모두 운영 정책 만료창을 넘긴다`, wsCallers.length >= 3 && wsBare.length === 0,
    `창 미전달=${wsBare.map(([r, i]) => r + ':' + i).join(', ') || '없음'}`)

  // 자산 상태 전량의 런타임 짝 — ASSET_STATUSES 는 AssetStatus 타입과 정확히 같은 아홉 개여야 한다.
  //  타입에 상태를 하나 더해도 이 배열을 안 고치면 대장 필터에서 안 보이고, 어시스턴트는 '총 보유 N대'라
  //  말하면서 상태별 분포의 합은 N 이 안 되는 조용한 잘림이 난다(부분의 합이 전체와 다른 답).
  const statusTypesSrc = readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8')
  const declared = [...(/export type AssetStatus = ([^\n]+)/.exec(statusTypesSrc)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  const runtime = [...(/export const ASSET_STATUSES: AssetStatus\[\] = \[([^\]]+)\]/.exec(statusTypesSrc)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  check(`자산 상태 상수: 타입 선언과 같은 집합(${declared.length}종)`,
    declared.length >= 9 && runtime.length === declared.length && declared.every((x) => runtime.includes(x)),
    `타입=${declared.join('/')} 상수=${runtime.join('/')}`)

  //  그리고 다른 파일이 이 목록을 또 적지 않는지 본다 — 사본이 생기는 순간 위 검사는 사본을 못 본다.
  const relisted = sourceFiles
    //  시드의 공통코드 대장(lib/store 의 ASSET_STATUS 코드 그룹)은 판정 사본이 아니라 운영자가 관리하는
    //  코드 레지스트리라 여기서 제외한다. 다만 그 그룹이 실제 상태 전량과 맞는지는 아래에서 따로 본다.
    .filter((f) => !['lib/types.ts', 'lib/store.ts'].includes(path.relative(ROOT, f).split(path.sep).join('/')))
    .filter((f) => readFileSync(f, 'utf8').split(/\r?\n/).some((ln) => {
      const lits = [...ln.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((x) => declared.includes(x))
      return new Set(lits).size >= 6
    }))
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  check(`자산 상태 목록: lib/types 밖에 사본 없음(소스 ${sourceFiles.length}개 검사)`, relisted.length === 0, `사본=${relisted.join(', ')}`)

  // 변경 이력 강조 분류의 단일 소스 — 화면 타임라인과 인쇄 카드가 여섯 종류를 각자 나열하고 있었고,
  //  카드 주석은 '화면 변경 이력 타임라인과 동일 언어'라고 적어 두었다. 종류를 하나 더하거나 옮길 때 한쪽만
  //  고치면 그 주석이 거짓이 되고, 같은 자산의 같은 이력이 화면에서는 강조되는데 인쇄물에서는 평범하게 나간다
  //  (인수인계·감사에 종이로 나가는 산출물이다). 분류는 lib/types 하나만 두고 표현(톤·hex)만 각자 정한다.
  //  판정에 쓰이는 이력 종류 여섯 개를 한 줄에 나열한 곳이 types 밖에 있는지 본다.
  const EMPH_KINDS = ['폐기', '분실', '점검', '수리', '등록', '편입']
  const emphDupes = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/types.ts')
    .filter(([, src]) => src.split(/\r?\n/).some((ln) => {
      if (ln.trim().startsWith('//') || ln.trim().startsWith('*')) return false
      return EMPH_KINDS.every((k) => ln.includes(k + String.fromCharCode(58)))
    }))
    .map(([rel]) => rel)
  check(`변경 이력 강조: 분류가 lib/types 밖에 없음(소스 ${sourceFiles.length}개 검사)`,
    emphDupes.length === 0, `사본=${emphDupes.join(', ') || '없음'}`)

  // '운영 자산'이라는 말이 두 수를 가리키지 않는가 — 대장의 '운영 자산만' 필터와 계약 커버리지는 GONE_STATUSES
  //  (분실·폐기예정·폐기완료)를 빼는데, 어시스턴트의 부서별·위치별·가치 집계는 폐기완료만 빼면서 같은 말을 썼다.
  //  시드에서도 폐기완료만 뺀 수는 36대, 대장 '운영 자산만'은 34대다 — 같은 낱말로 두 수를 말하면 어느 쪽이
  //  틀렸는지 사람이 가릴 수 없다. 폐기완료만 빼는 집계는 '보유 자산'이라 부른다(수는 그대로, 표기만 구분).
  const asstSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'ai', 'assistant', 'actions.ts'), 'utf8')
  const miscalled = asstSrc.split(/\r?\n/)
    .map((ln, i) => ({ ln, i }))
    .filter(({ ln }) => !ln.trim().startsWith('//') && !ln.trim().startsWith('*'))
    .filter(({ ln }) => ln.includes('운영 자산') && ln.includes('폐기완료 제외'))
    .map(({ i }) => 'ai/assistant/actions.ts:' + (i + 1))
  check('어시스턴트 표기: 폐기완료만 뺀 집계를 "운영 자산"이라 부르지 않음', miscalled.length === 0, `충돌=${miscalled.join(', ')}`)

  // 운영 정책 기본값이 화면 문구에 리터럴로 박혀 있는가 — 운영자가 '정기 점검 창'·'만료 알림 창' 같은 값을
  //  바꾸면 판정은 따라가지만 안내 문구가 옛 숫자로 남아, 날짜를 고르는 바로 그 자리에서 틀린 규칙을 알려 준다.
  //  실제로 대장 상세의 점검 예약 안내가 '30일 내·경과'로 고정돼 있었다(판정은 opsPolicy.maintenanceWindowDays).
  //  정책 기본값과 같은 수가 '<숫자>일' 형태로 사용자 문구에 그대로 있으면 잡는다(변수 보간은 통과).
  //  범위는 DEFAULT_OPS_POLICY 에 숫자 리터럴로 적힌 항목까지다(상수 참조분은 제외) — 그 수를 검사명에 밝힌다.
  //  상수 참조분(만료 90·확인기한 7·미실측 180)까지 넓히면 개념이 다른데 수만 같은 문구('90일 이상 장기 유휴')를
  //  잡아 버린다. 넓은 대신 시끄러운 가드보다 좁고 정확한 가드를 둔다.
  const policyDefaults = [...(/export const DEFAULT_OPS_POLICY: OpsPolicy = \{([^}]+)\}/.exec(statusTypesSrc)?.[1] ?? '')
    .matchAll(/(\w+): (\d+)/g)].map((m) => ({ key: m[1], n: Number(m[2]) }))
    .filter((x) => /Days$/.test(x.key))
  const policyLiterals = []
  //  대상은 화면(tsx)과 app 의 서버 액션·라우트(ts) — 어시스턴트 답변 문구가 여기 있는데 그동안 tsx 만 봤다.
  const policyScanned = sourceFiles.filter((f) => f.endsWith('.tsx')
    || (f.endsWith('.ts') && path.relative(ROOT, f).split(path.sep)[0] === 'app'))
  for (const file of policyScanned) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/')
    if (rel.includes('/settings/')) continue // 정책 설정 화면 자체는 기본값을 안내해도 된다
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((ln, i) => {
      if (/^\s*(\/\/|\*)/.test(ln)) return
      //  보간 구간(${...})만 지우고 본다 — 줄에 ${ 가 하나라도 있으면 통째로 건너뛰던 예외 때문에,
      //  값은 보간하면서 창 일수만 리터럴로 적은 긴 답변 문구가 그대로 빠져나갔다(정확히 이번에 고친 증상).
      const stripped = ln.replace(/\$\{[^}]*}/g, '~')
      for (const m of stripped.matchAll(/[>"'`]([^<>"'`]*?(\d{1,4})\s*일[^<>"'`]*?)[<"'`]/g)) {
        const hit = policyDefaults.find((d) => d.n === Number(m[2]))
        if (hit) policyLiterals.push(`${rel}:${i + 1}(${hit.key}=${hit.n})`)
      }
    })
  }
  check(`운영 정책 문구: 화면·답변이 정책 기본값을 리터럴로 적지 않음(정책 ${policyDefaults.length}종 · 소스 ${policyScanned.length}개)`,
    policyDefaults.length >= 2 && policyLiterals.length === 0, `리터럴=${policyLiterals.join(', ')}`)

  // 실사 위치 레지스트리의 실물 커버리지 — 공통코드 LOCATION 은 재물조사 계획의 대상 범위이자 실사 스캔의
  //  위치 선택지다(survey-plan · survey). 대장에 실물이 놓인 위치가 여기 없으면 그 자산은 회차에 편성될 수도
  //  그 위치로 스캔될 수도 없어, 실물이 있는데 실사에서 구조적으로 빠진다 — 재물조사가 잡으려는 '유령 자산'
  //  상태를 재물조사 자신이 만드는 셈이다. 실제로 본사 7F·6F·12F·2F 대회의실·5F 수리대기·IDC-A Rack 15 의
  //  자산 8대가 그랬다. 물리 자산(가상자원·SW 제외, 폐기완료 제외, 위치 미지정 '-' 제외)만 따진다.
  const locSrc = readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10))
  const locGi = locSrc.indexOf("id: 'LOCATION'")
  const locBlock = locSrc.slice(locGi, locSrc.indexOf(')', locSrc.indexOf('values: v(', locGi)) + 1)
  const registered = [...locBlock.matchAll(/, '([^']+)'\]/g)].map((m) => m[1])
  const seedStart = locSrc.indexOf('function seedAssets')
  const seedEnd = locSrc.indexOf(String.fromCharCode(10) + 'function ', seedStart + 10)
  const assetBlocks = locSrc.slice(seedStart, seedEnd > 0 ? seedEnd : undefined).split('mk({').slice(1)
  const NON_PHYSICAL = ['가상자원', 'SW']
  const unregistered = assetBlocks
    .map((b) => ({
      no: /assetNo: '([^']+)'/.exec(b)?.[1] ?? '?',
      cat: /category: '([^']+)'/.exec(b)?.[1] ?? '',
      st: /status: '([^']+)'/.exec(b)?.[1] ?? '',
      loc: /location: '([^']+)'/.exec(b)?.[1] ?? '',
    }))
    .filter((x) => x.loc && x.loc !== '-' && !NON_PHYSICAL.includes(x.cat) && x.st !== '폐기완료')
    .filter((x) => !registered.includes(x.loc))
    .map((x) => `${x.no}@${x.loc}`)
  check(`실사 위치 레지스트리: 실물 자산의 위치가 모두 등록됨(위치 ${registered.length}종 · 자산 ${assetBlocks.length}건 검사)`,
    registered.length >= 10 && assetBlocks.length >= 20 && unregistered.length === 0, `미등록=${unregistered.join(', ')}`)

  // 위 검사는 시드를 본다 — 운영 중 들어오는 위치는 막지 못한다. 화면은 공통코드 드롭다운으로만 위치를 내주지만
  //  서버 액션은 화면을 거치지 않고도 호출된다(권한 가드가 '버튼을 숨겨도 액션 id 로 직접 호출할 수 있다'고
  //  적어 둔 것과 같은 이유). 레지스트리 밖 위치가 대장에 실리면 그 자산은 재물조사 회차에 편성될 수도
  //  그 위치로 스캔될 수도 없어, 실물이 있는데 실사에서 구조적으로 빠진다. asset.location 을 쓰는 액션 파일이
  //  모두 레지스트리 판정(isKnownLocation)을 거치는지 본다.
  //  '위치를 인자로 받아 대장에 쓰는' 액션만 본다 — 상수 위치('본사 3F 검수실')를 쓰는 자리까지 잡으면
  //  외부 입력이 없는 코드에 검사를 요구하는 시끄러운 가드가 된다.
  const locWriters = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel.endsWith('actions.ts'))
    .filter(([, src]) => /(location|targetLocation)\??: string/.test(src)
      && src.split(/\r?\n/).some((ln) => !ln.trim().startsWith('//') && /\.location\s*=|^\s*location:/.test(ln)))
  const locUnchecked = locWriters.filter(([, src]) => !src.includes('isKnownLocation')).map(([rel]) => rel)
  check(`대장 위치: 위치를 인자로 받아 대장에 쓰는 액션 ${locWriters.length}곳이 모두 공통코드 레지스트리로 검사`,
    locWriters.length >= 4 && locUnchecked.length === 0, `미검사=${locUnchecked.join(', ') || '없음'}`)

  //  선택지 목록도 같은 원천이어야 한다 — 화면이 목록을 따로 만들면 서버가 받는 값 집합과 갈릴 수 있다
  //  (미사용 처리한 코드를 한쪽만 걸러 내는 식). 목록 생성은 lib/codes 의 activeLocations 하나로 모은다.
  const locListCopies = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/codes.ts')
    .filter(([, src]) => src.includes("g.id === 'LOCATION'"))
    .map(([rel]) => rel)
  check(`위치 목록: lib/codes 밖에 사본 없음(소스 ${sourceFiles.length}개 검사)`, locListCopies.length === 0, `사본=${locListCopies.join(', ') || '없음'}`)

  //  그리고 공통코드 대장의 '자산 상태' 그룹이 실제 상태 전량과 같은지 본다 — 공통코드 화면은 코드값마다
  //  '사용 N건'을 세는데(lib/codes codeUsage: status === label), 값이 빠지면 그 상태의 자산이 어느 코드값에도
  //  잡히지 않아 사용 건수의 합이 보유 대수에 못 미친다. 빠진 값은 미사용화·명칭 변경 관리도 불가능하다.
  const statusStoreSrc = readFileSync(path.join(ROOT, 'lib', 'store.ts'), 'utf8')
  const statusGroup = /\{ id: 'ASSET_STATUS'[^\n]*values: v\((.+?)\) \},/.exec(statusStoreSrc)?.[1] ?? ''
  const groupLabels = [...statusGroup.matchAll(/, '([^']+)'\]/g)].map((m) => m[1])
  const missingCode = declared.filter((x) => !groupLabels.includes(x))
  check(`공통코드 자산 상태: 상태 전량이 코드값으로 등록(${declared.length}종)`,
    missingCode.length === 0 && groupLabels.length === declared.length, `누락=${missingCode.join(', ')} 등록=${groupLabels.length}`)

  // 폐기 절차 편입·해제의 자산 이력 — 자산 타임라인(대장 상세)은 그 자산에 무슨 일이 있었는지 읽는 곳이다.
  //  폐기 반려 복원은 이력을 남기는데 정작 '폐기 대상 선정'은 남기지 않아, 타임라인에 되돌림만 뜨고 그 앞에
  //  선정된 적이 있다는 기록이 없었다(원인 없는 결과). 반납·대여 반환 점검 경로는 이미 남기므로 직접 선정
  //  경로(단건·일괄·AI 제안 승인)와 선정 취소만 비어 있었다. 상태를 폐기예정으로 바꾸는 곳이 전부 이력을
  //  함께 남기는지 구조로 못박는다 — 경로가 늘어도 한쪽만 조용히 비지 않게.
  //  대상은 폐기예정에 그치지 않는다 — 자산 상태 전환 전부가 같은 규약이라야 타임라인이 생애주기를 온전히 담는다.
  // 단건 ↔ 일괄의 폐기 경로 제외 — '폐기 절차 자산은 조치 대상에서 뺀다'는 이 코드베이스의 공통 규약인데,
  //  일괄 경로에만 걸려 있고 단건 경로가 비어 있으면 같은 자산이 일괄로는 거절되고 단건으로는 통과한다.
  //  실제로 보증 연장이 그랬다 — 일괄은 빼면서 결과에 '폐기 자산 제외'라고 밝히는데 단건은 그대로 받았다.
  //  일괄(...Many)이 DISPOSAL_STATUSES 를 보면 짝이 되는 단건도 봐야 한다.
  //  비교 대상 묶음도 lib/types 에서 읽는다(여기 또 적으면 묶음이 늘 때 이 가드만 옛 목록을 본다)
  const STATUS_SETS = [...readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8')
    .matchAll(/export const (\w*STATUSES)\s*:/g)].map((m) => m[1])
  check(`상태 묶음 상수: lib/types 에서 읽어 온다(${STATUS_SETS.length}종)`, STATUS_SETS.length >= 5, `읽은 묶음=${STATUS_SETS.join(', ')}`)
  const actionSrcs = sourceFiles.filter((f) => f.endsWith(path.sep + 'actions.ts'))
  const pairGap = []
  for (const file of actionSrcs) {
    const src = readFileSync(file, 'utf8')
    const marks = [...src.matchAll(/export async function (\w+)\(/g)]
    const bodyOf = (i) => src.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : src.length)
    const bodies = new Map(marks.map((m, i) => [m[1], bodyOf(i)]))
    for (const [name, body] of bodies) {
      const mm = /^(\w+?)(Many|Bulk|All)$/.exec(name)
      if (!mm) continue
      const single = bodies.get(mm[1])
      if (!single) continue
      // 위임형(일괄이 단건을 그대로 호출)은 가드를 자동 승계하므로 대상에서 뺀다
      if (body.includes('await ' + mm[1] + '(')) continue
      // 한쪽에만 있는 것뿐 아니라 '서로 다른 묶음을 쓰는' 것도 갈림이다 — 계약 연계가 실제로 그랬다:
      //  단건은 GONE_STATUSES(분실·폐기예정·폐기완료), 일괄은 TERMINAL_STATUSES(분실·폐기완료)를 써서
      //  폐기예정 자산이 단건으로는 거절되고 일괄로는 조용히 통과했다(일괄 주석은 '단건 가드와 동형'이었다).
      // 주석은 걷어내고 비교한다 — 설명문에 적힌 상수 이름까지 세면 '무엇을 쓰는가'가 아니라
      //  '무엇을 언급하는가'를 재게 되어, 왜 그 묶음을 안 쓰는지 적어 둔 주석이 곧 위양성이 된다.
      const codeOf = (t) => t.split(/\r?\n/).filter((ln) => !ln.trim().startsWith('//') && !ln.trim().startsWith('*') && !ln.trim().startsWith('/*')).join('\n')
      const setsIn = (t) => STATUS_SETS.filter((n) => codeOf(t).includes(n)).join('+')
      const gb = setsIn(body), gs = setsIn(single)
      if (gb !== gs) pairGap.push(path.relative(ROOT, file).split(path.sep).join('/') + ':' + mm[1] + `(단건 ${gs || '없음'} ≠ 일괄 ${gb || '없음'})`)
    }
  }
  check(`단건·일괄 상태 가드 일치: 같은 조작은 같은 상태 묶음으로 거른다(actions ${actionSrcs.length}개 검사)`,
    pairGap.length === 0, `불일치=${pairGap.join(', ')}`)

  //  상태 목록은 lib/types 의 AssetStatus 선언에서 읽는다 — 여기 또 적으면 상태가 늘 때 이 가드만 옛 목록을
  //  보고 새 상태의 전환을 검사에서 빠뜨린다(이 가드가 잡으려는 '같은 개념 두 정의' 를 가드가 저지르는 꼴).
  const ASSET_STATES = [...(/export type AssetStatus = ([^\n]+)/.exec(readFileSync(path.join(ROOT, 'lib', 'types.ts'), 'utf8'))?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map((m) => m[1])
  check('자산 상태 목록: AssetStatus 선언에서 읽어 온다(가드 자체가 공허해지지 않게)', ASSET_STATES.length >= 9, `읽은 상태=${ASSET_STATES.length}`)
  const disposalEntry = []
  for (const file of sourceFiles) {
    const src = readFileSync(file, 'utf8')
    const lines = src.split(/\r?\n/)
    lines.forEach((ln, i) => {
      const mv = /(\w+)\.status = '([^']+)'/.exec(ln)
      if (!mv || !ASSET_STATES.includes(mv[2]) || !/^(asset|a|x|target|item)$/.test(mv[1])) return
      const near = lines.slice(Math.max(0, i - 20), i + 24).join('\n')
      if (near.includes('history.push')) return
      disposalEntry.push(path.relative(ROOT, file).split(path.sep).join('/') + ':' + (i + 1))
    })
  }
  check(`자산 상태 전환: ${ASSET_STATES.length}개 상태 전환마다 자산 이력을 남긴다(소스 ${sourceFiles.length}개 검사)`,
    disposalEntry.length === 0, `이력 없음=${disposalEntry.join(', ')}`)

  // 스위트 포트 선점 가드 — 스위트는 저마다 전용 포트에 next start 를 띄우고 /login 이 200 이면 기동으로 본다.
  //  포트가 이미 물려 있으면 spawn 은 조용히 죽고 준비 확인만 남의 서버에서 통과해, '신선한 시드'라는 전제가
  //  깨진 채 앞 실행이 더럽혀 놓은 상태를 검사한다. 끝나며 죽은 spawn 만 kill 하니 다음 실행은 더 더러운 상태를
  //  본다 — 중단된 e2e 가 남긴 서버 때문에 실제로 첫 검사부터 엉뚱하게 실패했다. 서버를 띄우는 스위트가
  //  하나도 빠짐없이 가드를 부르는지 본다(스위트가 늘어도 반쪽으로 남지 않게).
  const suiteFiles = readdirSync(path.join(ROOT, 'scripts')).filter((n) => n.endsWith('.mjs'))
  const spawners = suiteFiles.filter((n) => readFileSync(path.join(ROOT, 'scripts', n), 'utf8').includes("'start', '-p'"))
  const portUnguarded = spawners.filter((n) => !readFileSync(path.join(ROOT, 'scripts', n), 'utf8').includes('assertPortFree(PORT)'))
  check(`스위트 포트 가드: next start 를 띄우는 ${spawners.length}개 스위트 전부 선점 확인`,
    spawners.length >= 6 && portUnguarded.length === 0, `누락=${portUnguarded.join(', ')}`)

  // 만료 임박 창의 두 번째 정의 — 보증(warrantyEnd)만 단속하던 위 가드의 사각지대였다. 구매 계약 이행 판정
  //  (lib/procurement)은 RISK_EXPIRY_DAYS = 90 을 따로 두고 dday 와 비교해, 운영자가 '만료 알림 창'을 30 으로
  //  줄여도 이 판정만 90 을 유지했다 — 계약·라이선스·대시보드·리포트가 임박으로 안 보는 계약을 구매 화면만
  //  '발주 미이행 · 만료 임박'으로 올리고 이행 독촉까지 발송한다(설정 화면은 계약에도 적용된다고 안내한다).
  //  잔여 기간(dday/daysUntil)을 숫자 리터럴과 직접 비교하는 곳이 정책 밖에 없는지 본다.
  //  세 가지를 본다. (1) 잔여 기간을 그 자리에서 숫자와 비교(dday <= 90), (2) daysUntil 을 지역 변수로 받아
  //  다음 줄에서 비교(const d = daysUntil(c.end) / return d <= 90) — 리포트가 정확히 이 모양으로 빠져나갔다,
  //  (3) 사용자에게 나가는 'D-90' 라벨 — 판정을 고쳐도 표 제목·열 이름이 옛 수를 말하면 문서가 거짓이 된다.
  //  기준값은 lib/types 의 EXPIRY_WINDOW_DAYS 에서 읽는다(가드가 90 을 다시 적지 않는다).
  const expWin = Number(/export const EXPIRY_WINDOW_DAYS = (\d+)/.exec(statusTypesSrc)?.[1])
  const labelRe = new RegExp('(^|[^A-Za-z])D-' + expWin + '\\b') // CRED-2607 같은 ID 는 제외
  const winRe = new RegExp('<=\\s*' + expWin + '\\b')
  const ddayHardcoded = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/dates.ts' && rel !== 'lib/types.ts')
    .flatMap(([rel, src]) => {
      const lines = src.split(/\r?\n/)
      return lines.flatMap((ln, i) => {
        if (ln.trim().startsWith('//') || ln.trim().startsWith('*')) return []
        const inline = /\b(dday|daysUntil\([^)]*\))\s*<=?\s*\d{2,}/.test(ln)
        //  별칭 바인딩 — 바로 앞 두 줄 안에서 daysUntil 로 받은 값을 만료창과 비교하는 경우
        const aliased = winRe.test(ln) && lines.slice(Math.max(0, i - 2), i + 1).join(' ').includes('daysUntil(')
        const labeled = labelRe.test(ln)
        return inline || aliased || labeled ? [rel + ':' + (i + 1)] : []
      })
    })
  check(`만료 임박 창: 잔여 기간 비교·D-day 라벨에 만료창 값(${expWin})을 박지 않음 — 운영 정책 단일 출처(소스 ${sourceFiles.length}개 검사)`,
    Number.isFinite(expWin) && ddayHardcoded.length === 0, `직접 비교·라벨=${ddayHardcoded.join(', ') || '없음'}`)

  // 보유자를 자유 입력으로 받아 대장에 쓰는 액션은 자리표시자를 거른다 — 대여 두 경로(단건·일괄)가 그랬다.
  //  '미지정'·'-' 를 그대로 통과시키면 상태는 '대여중'인데 보유자가 없는 행이 남아, 정합성 큐(assetDataIssues)가
  //  방금 만든 그 행을 곧바로 '소유자 미지정'으로 세고 대여 통보는 '미지정 (부서)' 앞으로 나간다 —
  //  lib/notify 가 recipientOf 로 막으려던 바로 그 '아무에게도 아닌 발송'이다. 두 경로 모두 막혀야 한다
  //  (한쪽만 막으면 단건은 거부되는데 일괄로는 들어가는 비대칭이 남는다).
  const lendSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'assets', 'register', 'actions.ts'), 'utf8').split(/\r?\n/)
  const lendEmpty = lendSrc.map((ln, i) => (ln.includes('대여자와 부서를 입력해 주세요') ? i : -1)).filter((i) => i >= 0)
  //  빈 값 검사 바로 다음 세 줄 안에 자리표시자 검사가 있는지 본다(주석은 건너뛴다)
  const lendGuarded = lendEmpty.filter((i) => lendSrc.slice(i + 1, i + 8).some((ln) => /isPlaceholder\(/.test(ln) && !ln.trim().startsWith('//')))
  //  정합성 보정도 같은 자리다 — 새 값 검사만 "=== '-'" 사본을 써서, 소유자를 '미지정'으로 '보정'하는 것이 통과했다.
  //  (바로 다음 줄의 기존 값 판정은 isPlaceholder 를 쓴다 — 한 함수 안에서 판정이 갈렸다.) 보정은 성공·감사되는데
  //  자산은 같은 사유로 정합성 큐에 남아, 눌러도 아무것도 낫지 않는 조치를 반복하게 된다.
  const fixOk = lendSrc.some((ln) => ln.includes('isPlaceholder(value)')) && !lendSrc.some((ln) => !ln.trim().startsWith('//') && ln.includes("value === '-'"))
  check(`대장 입력: 대여 두 경로·정합성 보정이 자리표시자를 거부(대여 입력 검사 ${lendEmpty.length}곳)`,
    lendEmpty.length === 2 && lendGuarded.length === 2 && fixOk, `대여=${lendGuarded.length}/${lendEmpty.length} 보정=${fixOk}`)

  // 발송 이력의 시간 순서 — 화면(NotificationLog)도 반출(dispatch-export)도 정렬하지 않고 배열 순서를 그대로
  //  쓴다. 그 순서는 dispatch() 의 unshift 로 유지되는 '최신 먼저'다. 그래서 기존 행의 at 을 고치는 코드는
  //  자리도 함께 옮겨야 한다 — 재발송이 at 만 오늘로 바꾸고 자리를 두면 오늘 나간 통지가 옛 행 사이에 묻힌다.
  //  at 을 대입하는 곳이 배열 재배치도 하는지 본다.
  const dispActSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'platform', 'integrations', 'actions.ts'), 'utf8')
  const touchesAt = /msg\.at = /.test(dispActSrc)
  const reorders = /s\.dispatches = \[msg, /.test(dispActSrc)
  check('발송 이력 순서: at 을 고치는 곳이 행 위치도 최신으로 옮긴다', !touchesAt || reorders,
    `at 수정=${touchesAt} 재배치=${reorders}`)

  // 재물조사 마감의 커버리지 근거 — 완료 가드는 회차의 '대상 자산번호 목록'(targets)에 대해서만 미실사를 센다.
  //  앱이 만든 회차(planRound·자동 편성)는 목록을 저장하지만 손으로 쓴 시드 회차에는 없고, 그 범위 문자열은
  //  위치와 매칭되지 않는 서술형이라(예: '본사 전층 + IDC-A') 범위로 되짚을 수도 없다. 그런 회차에서는 가드가
  //  검사할 대상이 없어 그냥 통과한다 — 312/1240 짜리 회차도 닫히고 결과 요약 리포트가 배포된다.
  //  목록 없는 회차를 막을 수는 없지만(정당한 회차일 수 있다), 검증하지 않은 것을 검증한 것처럼 말해서는 안 된다.
  //  완료 문구·감사·배포 통지가 커버리지 근거를 밝히는지 본다.
  const roundSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'inventory', 'survey', 'actions.ts'), 'utf8')
  const covBits = ['hasTargetList', '전 대상 계상 확인', '전 대상 계상 미검증']
  const covMissing = covBits.filter((b) => !roundSrc.includes(b))
  check('재물조사 마감: 커버리지 근거(전 대상 계상 확인·미검증)를 문구·감사·통지에 밝힌다',
    covMissing.length === 0, `누락=${covMissing.join(', ')}`)

  // 안전재고 경보의 드릴다운 — 큐 스윕은 대시보드 큐만, KPI 스윕은 네 화면의 stat 타일만 훑는다. 재고 화면의
  //  경보 링크는 둘 다에 안 잡히는데(대시보드가 아니고 stat 타일도 아니다), '가용 N' 이라는 수를 말하고 그 수의
  //  목록을 연다는 점에서 같은 계약이다. 이 링크는 한 번 잘못 열린 적이 있다 — status=유휴 로 열어 폐기 절차·
  //  NAC 격리된 유휴 자산까지 보여 주는 바람에 '가용 0' 경보를 눌렀는데 한 대가 보였다(화면 수 ≠ 목록 수).
  //  지금은 ?avail=1 로 고쳐져 있고, 그 일치를 검사로 고정한다.
  const stockHtml = text(await (await get('/inventory/stock', 'ASSET_MGR')).text())
  const stockPairs = [...stockHtml.matchAll(/href="(\/assets\/register\?cat=[^"]*avail=1)"[\s\S]{0,400}?가용 ([0-9]+)/g)]
    .map((m) => ({ href: m[1].replace(/&amp;/g, '&'), n: Number(m[2]) }))
  const stockBad = []
  for (const p of stockPairs) {
    const page = text(await (await get(p.href, 'ASSET_MGR')).text())
    const m = /([0-9]+)건 \/ 전체 [0-9]+건/.exec(page)
    const shown = m ? Number(m[1]) : null
    if (shown !== p.n) stockBad.push(`${decodeURIComponent(p.href)}: 화면 ${p.n} ≠ 목록 ${shown}`)
  }
  check(`안전재고 경보 드릴다운: 화면이 말한 가용 수 = 링크가 여는 목록 건수(${stockPairs.length}종)`,
    stockPairs.length > 0 && stockBad.length === 0, `불일치=${stockBad.join(', ')}`)

  // 복합 위험 캐시의 사용 규약 — lib/risk 는 SPOF·교체 대상을 모듈 수준에 캐시하고, 그 캐시를 비우는 곳은
  //  compositeRiskAssetNos 하나뿐이다. 스토어는 제자리 수정 싱글턴이라 객체 정체성으로 변경을 감지할 수 없고
  //  모듈 상태는 요청 사이에 살아남으므로, riskSignals 만 따로 부르는 소비자가 생기면 지난 요청의 집합으로
  //  '위험 신호'를 붙인다 — 대장 필터·대시보드 큐·리포트가 조용히 어긋난다(눈에 띄는 오류 없이 값만 틀린다).
  //  살아 있는 결함은 없다(현 소비자 셋은 모두 먼저 부른다). 규약이 주석에만 있어 검사로 고정한다.
  const riskUsers = sourceFiles.filter((f) => {
    const rel = path.relative(ROOT, f).split(path.sep).join('/')
    if (rel === 'lib/risk.ts') return false
    return /\briskSignals\b|\briskSignalCount\b/.test(readFileSync(f, 'utf8'))
  }).map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
  const riskUnbatched = riskUsers.filter((rel) => !readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8').includes('compositeRiskAssetNos'))
  check(`복합 위험 캐시: riskSignals 소비자는 compositeRiskAssetNos 로 캐시를 비운 뒤 쓴다(소비자 ${riskUsers.length}곳)`,
    riskUsers.length > 0 && riskUnbatched.length === 0, `배치 호출 없음=${riskUnbatched.join(', ')}`)

  // 아젠다 창의 문구와 실제 창이 같은가 — 대시보드 '다가오는 일정' 카드는 제목과 빈 상태 문구에서 창 일수를
  //  말하고, 같은 수를 upcomingSchedule 에 넘긴다. 세 곳에 14 를 각자 적어 두면 창을 바꿀 때 문구만 옛 수로
  //  남아 화면이 거짓을 말한다(정기 점검 창 문구가 실제로 그렇게 굳어 있었다 — #695).
  //  대시보드가 창 일수를 리터럴로 적지 않고 상수를 쓰는지 본다.
  const upSrc = readFileSync(path.join(ROOT, 'lib', 'upcoming.ts'), 'utf8')
  const dashUpSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'dashboard', 'page.tsx'), 'utf8')
  const upConst = /export const UPCOMING_WINDOW_DAYS = (\d+)/.exec(upSrc)
  //  주석은 걷어내고 본다 — 설명문이 창 일수를 언급하는 것은 문제가 아니다(화면에 나가는 문구만 대상).
  const dashUpCode = dashUpSrc.split(/\r?\n/).filter((ln) => !ln.trim().startsWith('//') && !ln.trim().startsWith('*')).join('\n')
  const upLiteral = upConst ? new RegExp('향후 ' + upConst[1] + '일').test(dashUpCode) : false
  check(`아젠다 창: 화면 문구가 창 일수를 상수에서 읽는다(리터럴 재기술 없음${upConst ? ` · ${upConst[1]}일` : ''})`,
    !!upConst && dashUpSrc.includes('UPCOMING_WINDOW_DAYS') && !upLiteral,
    `상수=${!!upConst} 사용=${dashUpSrc.includes('UPCOMING_WINDOW_DAYS')} 리터럴=${upLiteral}`)

  // CMDB 정확도의 분모와 판정 범위가 같은가 — 정확도는 '정합성 미흡이 아닌 비율'이므로 분모(모수)와
  //  판정(hasDataIssue)이 같은 집합을 봐야 한다. 판정은 폐기 경로(폐기완료·폐기예정)를 빼는데 분모만
  //  폐기완료를 뺐던 적이 있다 — 그러면 폐기예정 자산이 '무조건 정합'으로 분모·분자에 함께 들어가
  //  정확도를 올린다(시드 2대가 그랬다). 감사 대응 자료·컴플라이언스 증적이 쓰는 수치라 부풀면 안 된다.
  //  두 곳이 같은 상태 묶음(DISPOSAL_STATUSES)을 쓰는지 본다.
  const qualSrc = readFileSync(path.join(ROOT, 'lib', 'quality.ts'), 'utf8')
  const predScope = /hasDataIssue[\s\S]{0,300}?DISPOSAL_STATUSES/.test(qualSrc)
  const denomScope = /cmdbAccuracyPct[\s\S]{0,600}?DISPOSAL_STATUSES/.test(qualSrc)
  const literalScope = /status !== '폐기완료'|status === '폐기예정'/.test(qualSrc)
  check('CMDB 정확도: 판정과 분모가 같은 폐기 경로 묶음을 쓴다(상태 리터럴 재기술 없음)',
    predScope && denomScope && !literalScope, `판정=${predScope} 분모=${denomScope} 리터럴=${literalScope}`)

  // 종결된 건이 조작한 화면에 남는가 — 집행 불가로 닫은 이동 신청은 대기 큐에서 빼야 하지만(#709), 완료
  //  목록에도 없으면 담당자가 '이동 처리'를 눌러 종결한 그 건이 화면에서 통째로 사라진다. 결재함에는
  //  '집행 불가'로 남아도, 조작을 한 화면에 흔적이 없으면 처리했는지조차 확인할 수 없다(대기에서 뺀 것과
  //  완료에 넣는 것은 한 벌이다 — 한쪽만 하면 조용한 소멸이 된다).
  const mvPageSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'assets', 'movement', 'page.tsx'), 'utf8')
  const excludesFromQueue = /!a\.unfulfilledReason/.test(mvPageSrc)
  const showsInDone = /a\.fulfilled \|\| a\.unfulfilledReason/.test(mvPageSrc)
  check('이동 화면: 대기에서 뺀 집행 불가 종결분을 완료 목록에 남긴다(조용한 소멸 방지)',
    !excludesFromQueue || showsInDone, `대기 제외=${excludesFromQueue} 완료 표시=${showsInDone}`)

  // 집행 대기 큐에 빠져나갈 문이 있는가 — '승인 && !fulfilled' 로 세는 큐는 집행이 영원히 불가능한 건까지
  //  담는다. 이동 신청이 그랬다: 대상 자산이 결재에 고정돼 있어(refId) 그 자산이 분실·폐기로 떠나면 다른
  //  자산으로 바꿀 수 없는데, 서버는 '반려·취소로 정리하세요'라고 안내했다 — 반려도 상신 취소도 '대기' 건만
  //  받으므로 이미 승인된 그 건에는 두 길이 다 막혀 있었다. 따를 수 없는 안내였고 큐는 영원히 안 줄었다.
  //  집행 불가로 종결한 건(unfulfilledReason)은 큐에서 빠져야 큐가 '남은 할 일'을 뜻한다.
  const dueQueueFiles = ['app/(app)/dashboard/page.tsx', 'app/(app)/assets/movement/page.tsx', 'app/(app)/assets/returns/page.tsx']
  const dueGaps = []
  for (const rel of dueQueueFiles) {
    const src = readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8')
    for (const line of src.split(/\r?\n/)) {
      if (!/!a\.fulfilled/.test(line)) continue
      if (!line.includes('unfulfilledReason')) dueGaps.push(rel + ': ' + line.trim().slice(0, 60))
    }
  }
  check(`집행 대기 큐: 집행 불가 종결분을 제외한다(${dueQueueFiles.length}개 화면)`, dueGaps.length === 0, `누락=${dueGaps.join(' | ')}`)

  // 승인했으나 집행할 수 없는 건 — 요청~승인 사이에 자산이 대여·불출로 빠지거나 폐기 절차·NAC 격리에 들어가면
  //  대여 결재는 승인 상태로 남고 fulfilled 가 서지 않는다. 그러면 결재 이력 반출이 그 건을 영원히 '집행 대기'로
  //  내보낸다 — 이미 신청자에게 통보하고 닫은 일을 미결 의무로 주장하는 셈이고, 대여는 미집행 대기열도 없어
  //  화면에서도 드러나지 않는다. 집행되지 않았으니 fulfilled 로 덮을 수도 없다(그건 거짓이다).
  //  제3의 상태(unfulfilledReason)를 남기고, 반출·화면이 그 상태를 '집행 불가'로 구분해 말하는지 본다.
  const aprActSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'workflow', 'approvals', 'actions.ts'), 'utf8')
  const aprListSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'workflow', 'approvals', 'ApprovalList.tsx'), 'utf8')
  const expUnfSrc = readFileSync(path.join(ROOT, 'lib', 'exports.ts'), 'utf8')
  check('집행 불가 결재: 사유를 결재 건에 남기고 반출·화면이 집행 대기와 구분한다',
    /a\.unfulfilledReason = /.test(aprActSrc)
    && expUnfSrc.includes('집행 불가') && aprListSrc.includes('a.unfulfilledReason'),
    `기록=${/a\.unfulfilledReason = /.test(aprActSrc)} 반출=${expUnfSrc.includes('집행 불가')} 화면=${aprListSrc.includes('a.unfulfilledReason')}`)

  // e2e 카드 로케이터와 감사 문구의 충돌 — e2e 는 화면의 카드를 제목 문구로 찾는 곳이 있는데(.card + text=),
  //  같은 화면에는 감사 로그 카드도 있고 그 행에는 서버가 남긴 '동작' 문구가 그대로 실린다. 어떤 감사 문구가
  //  카드 제목 문구를 포함하면 감사 카드가 먼저 매칭돼(.first()) 검사는 엉뚱한 카드의 텍스트를 읽는다.
  //  실제로 '알림 발송 이력' 로케이터가 '알림 발송 이력 내보내기' 감사 문구와 충돌해, 발송 이력 반출을
  //  한 번 호출하는 것만으로 이웃 검사가 깨졌다(원인을 좁히는 데 e2e 를 네 번 돌렸다).
  //  로케이터가 아니라 감사 문구가 나중에 추가돼도 같은 일이 나므로, 양쪽을 함께 대조해 둔다.
  const cardE2eSrc = readFileSync(path.join(ROOT, 'scripts', 'e2e-findings.mjs'), 'utf8')
  const cardPhrases = [...cardE2eSrc.matchAll(/locator\('\.card', \{ has: [^}]*text=([^'"}]{2,40})/g)]
    .map((m) => m[1].trim()).filter((x) => x.length >= 2)
  const auditPhrases = []
  for (const file of sourceFiles) {
    for (const m of readFileSync(file, 'utf8').matchAll(/action: [`'"]([^`'"]{4,120})/g)) auditPhrases.push(m[1])
  }
  const cardClashes = []
  for (const ph of [...new Set(cardPhrases)]) {
    const clash = auditPhrases.find((x) => x.includes(ph))
    if (clash) cardClashes.push(`${ph} ⊂ ${clash.slice(0, 40)}`)
  }
  check(`e2e 카드 로케이터: 감사 동작 문구와 충돌 없음(로케이터 ${new Set(cardPhrases).size}종 · 감사 문구 ${auditPhrases.length}개)`,
    cardPhrases.length > 0 && cardClashes.length === 0, `충돌=${cardClashes.join(', ')}`)

  // 종결 전이의 증적 세 요소 — 되돌릴 수 없는 판정을 담는 레코드는 누가·언제(·왜)를 그 레코드에 남긴다.
  //  결재는 decidedBy/decidedAt, 폐기 소거는 wipedBy/wipedAt, 입고 검수는 inspector 를 이미 남긴다.
  //  계약·라이선스 해지는 날짜만, 입고 반품 종결은 아무것도 남기지 않아 '언제·누가 끝냈나'를 전역
  //  감사로그에서만 알 수 있었다. 각각을 따로 검사하면 '무엇이 한 벌인지'가 코드에 남지 않으므로
  //  종결 전이를 한 표로 모아 본다 — 전이가 늘면 여기에 한 줄 더 적는 것이 규약이 된다.
  const CLOSURE_EVIDENCE = [
    { file: ['app', '(app)', 'inventory', 'contracts', 'actions.ts'], fn: 'terminateContract', fields: ['terminatedAt', 'terminateReason', 'terminatedBy'] },
    { file: ['app', '(app)', 'inventory', 'contracts', 'actions.ts'], fn: 'retireLicense', fields: ['terminatedAt', 'terminateReason', 'terminatedBy'] },
    { file: ['app', '(app)', 'assets', 'intake', 'actions.ts'], fn: 'rejectIntakeLot', fields: ['rejectReason', 'inspector'] },
    { file: ['app', '(app)', 'assets', 'intake', 'actions.ts'], fn: 'closeReturnedLot', fields: ['closedAt', 'closedBy'] },
    { file: ['app', '(app)', 'assets', 'disposal', 'actions.ts'], fn: 'recordWipe', fields: ['wipedAt', 'wipedBy', 'certNo'] },
  ]
  const closureGaps = []
  for (const c of CLOSURE_EVIDENCE) {
    const src = readFileSync(path.join(ROOT, ...c.file), 'utf8')
    const at = src.indexOf('export async function ' + c.fn)
    if (at < 0) { closureGaps.push(`${c.fn}: 없음`); continue }
    const body = src.slice(at, at + 3000)
    const miss = c.fields.filter((fl) => !new RegExp('\\.\\s*' + fl + '\\s*=').test(body))
    if (miss.length) closureGaps.push(`${c.fn}: ${miss.join('/')}`)
  }
  check(`종결 증적: 종결 전이 ${CLOSURE_EVIDENCE.length}개가 누가·언제(·왜)를 레코드에 남긴다`,
    closureGaps.length === 0, `누락=${closureGaps.join(', ')}`)
  // 사유를 필수로 받는 조작은 그 사유를 레코드에도 남기는가 — 사유를 통지 제목·감사로그에만 적으면,
  //  나중에 그 레코드를 보는 사람은 '왜 이렇게 됐는지'를 전역 로그에서 뒤져야 한다. 반려·해지처럼 되돌릴 수
  //  없는 판정일수록 근거는 판정 옆에 있어야 한다(입고 검수 반려·계약 해지·라이선스 해지가 실제로 그랬다).
  //  사유를 필수 검증하는 서버 액션이 그 값을 레코드 필드에 대입하거나 이력에 push 하는지 본다.
  const reasonGaps = []
  for (const file of sourceFiles.filter((x) => x.endsWith(path.sep + 'actions.ts'))) {
    const src = readFileSync(file, 'utf8')
    const marks = [...src.matchAll(/export async function (\w+)\(([^)]*)\)/g)]
    for (let i = 0; i < marks.length; i += 1) {
      if (!/\b(reason|rawReason|note|rawNote)\b/.test(marks[i][2])) continue
      const body = src.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : src.length)
      const required = /return \{ ok: false[^\n]*(사유|내용|입력)/.test(body)
      if (!required) continue
      // 저장으로 인정: 레코드 필드 대입 · 이력 push · 다른 액션에 사유를 넘겨 위임
      const stored = /\.(\w*[Rr]eason|\w*[Nn]ote|detail)\w* = /.test(body)
        || /history\.push/.test(body) || /reason:/.test(body) || /note:/.test(body)
        || /await \w+\([^)]*reason/.test(body)
        // 객체 축약 저장도 인정한다: `x.y = { newDueDate, reason, ... }` — 다만 감사로그 템플릿의
        //  `${reason}` 을 저장으로 오인하지 않게 대입식의 객체 리터럴 안으로 한정한다.
        || /= \{[^}]*\breason\b[^}]*\}/.test(body)
      if (!stored) reasonGaps.push(path.relative(ROOT, file).split(path.sep).join('/') + ':' + marks[i][1])
    }
  }
  check(`사유 필수 조작: 사유를 레코드에도 남긴다(actions ${sourceFiles.filter((x) => x.endsWith(path.sep + 'actions.ts')).length}개 검사)`,
    reasonGaps.length === 0, `저장 없음=${reasonGaps.join(', ')}`)

  // 정규식 리터럴의 역슬래시 유실 — 편집 중 문자 클래스의 역슬래시가 떨어지면 정규식은 문법 오류 없이 살아남고
  //  타입 검사·빌드도 통과하지만 아무것도 매칭하지 않는다. lib/dates 의 addDays 가 실제로 그렇게 깨져 있었고,
  //  날짜 파싱이 늘 실패해 입력을 그대로 반환하는 바람에 재물조사 기한(+14일)·리포트 다음 실행일(+7일)·
  //  EASM 재스캔 주기·AI 로그 보존 컷오프가 전부 더해지지 않은 날짜로 계산됐다(항상 기한 도래).
  const reDamaged = damagedRegexLiterals(sourceFiles, (f) => path.relative(ROOT, f).split(path.sep).join('/'))
  check(`정규식 리터럴: 역슬래시 유실된 문자 클래스 없음(소스 ${sourceFiles.length}개 검사)`, reDamaged.length === 0, `손상=${reDamaged.join(', ')}`)

  // 이상행위 네 축의 '폐기 경로 자산 제외' 규칙 — 모듈이 규칙을 선언해 두고 두 축(미인가 SW·USB)에만 걸어 둬,
  //  같은 자산이 축에 따라 사라졌다 남았다 했다(조치할 대상이 없는 건이 심각도 집계를 차지해 실재 이탈을 밀어낸다).
  //  네 축이 모두 같은 집합(disposedAsset)을 참조하는지 구조로 못박는다 — 축이 늘어도 규칙이 반쪽으로 남지 않게.
  const anomalySrc = readFileSync(path.join(ROOT, 'lib', 'anomaly.ts'), 'utf8')
  const anomalyAxes = (anomalySrc.match(/disposedAsset\.has\(/g) || []).length
  check(`이상행위: 네 축 모두 폐기 경로 자산 제외(참조 ${anomalyAxes}곳)`, anomalyAxes === 4, `참조=${anomalyAxes}`)

  // AI 로그 보존 정책의 강제 — auditRetentionDays 는 화면·리포트에 숫자로만 찍히고 조회에는 쓰이지 않아,
  //  '90일 보존'이라 말하면서 그보다 오래된 로그를 그대로 보여줄 수 있었다(표시와 강제가 갈리는 계열).
  //  AI 감사 로그 조회가 보존 기간을 적용하는지 구조로 못박는다 — 화면이 직접 필터를 짜면 다시 갈린다.
  //  시드 AI 로그는 25일 전이고 최소 보존이 30일이라 런타임으로는 차이를 만들 수 없어(데이터를 늙힐 수 없다)
  //  구조 검사로 둔다.
  const aiPolicySrc = readFileSync(path.join(ROOT, 'app', '(app)', 'settings', 'ai-policy', 'page.tsx'), 'utf8')
  const aiStatusSrc = readFileSync(path.join(ROOT, 'lib', 'ai-status.ts'), 'utf8')
  //  리포트도 같은 자리다 — 감사 대응 리포트가 'AI 제안·질의·응답은 N일 감사 보존'이라고 진술해 놓고
  //  같은 문서의 감사 로그 표에는 창 밖 AI 로그를 그대로 실어, 통제 진술과 증거가 서로를 부정했다.
  //  (AI 감사 화면은 이미 창을 적용해 그 항목을 뺀다 — 같은 물음에 두 문서가 다르게 답하던 자리다.)
  const repAuditSrc = readFileSync(path.join(ROOT, 'lib', 'reports.ts'), 'utf8')
  //  그리고 'AI 로그인가' 판정이 ai-status 밖에 사본으로 있으면 두 문서가 다시 갈린다.
  const aiPredCopies = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/ai-status.ts')
    .filter(([, src]) => src.includes("actor === 'AI 서비스'") && src.includes("target === 'AI 정책'"))
    .map(([rel]) => rel)
  check('AI 로그 보존: 화면·리포트 조회가 모두 보존 정책(auditRetentionDays)을 적용',
    aiPolicySrc.includes('aiAuditLogs(s.auditLogs, s.aiPolicy.auditRetentionDays')
    && aiStatusSrc.includes('const cutoff = addDays(today, -Math.max(0, retentionDays))')
    && repAuditSrc.includes('auditLogsWithinAiRetention(s.auditLogs, s.aiPolicy.auditRetentionDays')
    && !repAuditSrc.includes('rows: s.auditLogs.slice(0, AUDIT_TOP)')
    && aiPredCopies.length === 0,
    `화면·리포트가 보존 기간 없이 직접 필터하고 있음(판정 사본=${aiPredCopies.join(', ') || '없음'})`)

  // 라이선스 판정(초과 사용·미사용 보유·만료 경과)의 단일 소스 — 대시보드 큐 건수는 licenseOptimization 이 세고,
  //  그 큐의 드릴다운(?lic=over|under|expired)은 계약·라이선스 화면 표가 거른다. 두 쪽이 규칙을 각자 적고 있었다
  //  (표·라이선스 카드가 사용률 0.6·초과·만료를 따로 계산). 지금은 값이 같지만 한쪽만 고치는 순간
  //  '건수는 N인데 목록은 M'이 되는 자리다 — 이 저장소가 반복해서 닫아 온 큐 건수 ↔ 드릴다운 계열.
  //  판정은 lib/reports 하나만 두고, 사용률 임계값을 다른 파일이 다시 적지 않는지 본다.
  const licRuleCopies = sourceFiles
    .map((f) => [path.relative(ROOT, f).split(path.sep).join('/'), readFileSync(f, 'utf8')])
    .filter(([rel]) => rel !== 'lib/reports.ts')
    .flatMap(([rel, src]) => src.split(/\r?\n/)
      .map((ln, i) => [rel, i + 1, ln])
      .filter(([, , ln]) => !ln.trim().startsWith('//') && !ln.trim().startsWith('*')
        && /used \/ [a-z.]*purchased \s*<\s*0\./.test(ln))  // 표시용 사용률 막대는 규칙이 아니라 제외
      .map(([rel2, i]) => rel2 + ':' + i))
  check(`라이선스 판정: 사용률 규칙이 lib/reports 밖에 없음(소스 ${sourceFiles.length}개 검사)`,
    licRuleCopies.length === 0, `사본=${licRuleCopies.join(', ') || '없음'}`)

  // 정책 기준 증빙 완전성 — 감사 대응 자료의 「운영 · 거버넌스 정책 기준」 표는 "화면·리포트·스케줄러가 공유·강제하는
  //  임계값"을 증빙한다고 적어 두고도, 관리자가 설정 화면에서 바꾸는 운영 정책 항목 일부(정기 점검 창·안전재고)가
  //  표에서 빠져 있었다. 빠진 항목은 바꿔도 증빙에 흔적이 없어 감사가 보는 기준선이 실제 운영값과 갈린다.
  //  정책 필드가 늘 때 표가 따라오지 않는 재발을 막으려고, OpsPolicy 기본값의 키 전부가 표 블록에서 읽히는지 본다.
  const polTypesSrc = readFileSync(path.join(ROOT, "lib", "types.ts"), "utf8")
  const polReportsSrc = readFileSync(path.join(ROOT, "lib", "reports.ts"), "utf8")
  const opsBlock = polTypesSrc.slice(polTypesSrc.indexOf("export const DEFAULT_OPS_POLICY"))
  const opsKeys = [...opsBlock.slice(0, opsBlock.indexOf("}")).matchAll(/^ *([a-zA-Z]+):/gm)].map((m) => m[1])
  const polStart = polReportsSrc.indexOf("title: '운영 · 거버넌스 정책 기준'")
  // 표 끝 = 다음 섹션 제목 직전(행 하나하나가 배열이라 첫 "]," 로 끊으면 첫 행만 본다)
  const polEnd = polReportsSrc.indexOf("title: '", polStart + 10)
  const polBlock = polStart === -1 ? "" : polReportsSrc.slice(polStart, polEnd === -1 ? polStart + 4000 : polEnd)
  const missingPol = opsKeys.filter((k) => !polBlock.includes("s.opsPolicy." + k))
  check(`정책 증빙: 운영 정책 ${opsKeys.length}개 항목이 모두 감사 대응 자료 기준표에 등장`,
    opsKeys.length >= 6 && missingPol.length === 0, `누락=${missingPol.join(", ")}`)

  // 가용·배정 재고와 운영 가드가 같은 집합을 봐야 한다 — NAC 격리 자산은 서버가 대여·불출·재배정을 거절하는데
  //  재고 집계(lib/stock)는 그대로 세고 있었다. 그러면 재고 화면은 "가용"이라 말하고 불출 화면은 목록에 올리는데
  //  서버는 거절하는 막다른 길이 생기고, 안전재고 경보도 실제보다 넉넉하게 판정해 발주가 늦는다.
  //  격리된 유휴 자산은 시드에 없고 결재 흐름으로 만들 수도 없어(격리는 사용중 자산 대상) 구조 검사로 둔다.
  const stockSrc = readFileSync(path.join(ROOT, "lib", "stock.ts"), "utf8")
  const poolFns = ["availableAssets", "assignableAssets"].filter((fn) => {
    const at = stockSrc.indexOf("export function " + fn)
    return at !== -1 && stockSrc.slice(at, stockSrc.indexOf("\n}", at)).includes("!a.quarantinedAt")
  })
  check("재고 판정: 가용·배정 풀이 NAC 격리 자산을 제외(불출·대여 가드와 같은 집합)",
    poolFns.length === 2, `격리 제외 누락=${["availableAssets", "assignableAssets"].filter((f) => !poolFns.includes(f)).join(", ")}`)

  // 반출 집합 ↔ 화면 필터 — 엑셀 링크는 서버 빌더가 아는 필터(검색·유형·상태·미실측·보증)만 질의로 넘기고,
  //  나머지 필터가 켜져 있으면 보이는 행 번호(nos)를 넘겨 "버튼이 약속한 건수 = 파일 행수"를 지킨다.
  //  대장에 필터를 새로 붙이면서 이 조건에 넣는 걸 빠뜨리면 파일만 조용히 더 넓어진다(실제로 live 필터에서 그랬다).
  //  화면의 …Only 필터 상태를 전부 뽑아 서버 지원분이거나 nos 조건에 들어 있는지 본다.
  const regViewSrc = readFileSync(path.join(ROOT, "app", "(app)", "assets", "register", "RegisterView.tsx"), "utf8")
  const onlyStates = [...regViewSrc.matchAll(/const \[(\w+Only), set\w+\] = useState/g)].map((m) => m[1])
  const nosAt = regViewSrc.indexOf("? { nos: rows.map((a) => a.assetNo).join(',') }")
  const nosCond = nosAt === -1 ? "" : regViewSrc.slice(Math.max(0, nosAt - 700), nosAt)
  const serverSideFilters = ["staleOnly", "warrantyOnly"] // 질의(stale·warranty)로 서버 빌더가 직접 거른다
  const exportMissing = onlyStates.filter((f) => !serverSideFilters.includes(f) && !nosCond.includes(f))
  check(`반출 정합: 화면 필터 ${onlyStates.length}개가 모두 반출 경로에 반영(서버 지원 또는 nos 전달)`,
    onlyStates.length >= 10 && exportMissing.length === 0, `누락=${exportMissing.join(", ")}`)

  // 필터 ↔ 목록 재계산 — 대장의 행 목록은 useMemo 로 만든다. 필터 상태를 의존성 배열에 넣지 않으면
  //  칩은 ✓ 로 켜지는데 목록·건수는 그대로다(복합 위험 필터가 실제로 그랬다 — 눌러도 아무 일이 없었다).
  //  린트 경고로만 남던 것을 검사로 고정한다: …Only 필터 전부가 목록 메모의 의존성에 있어야 한다.
  const memoAt = regViewSrc.indexOf("const rows = useMemo(")
  const memoDeps = memoAt === -1 ? "" : regViewSrc.slice(regViewSrc.lastIndexOf("}, [", regViewSrc.indexOf("const sel =", memoAt)), regViewSrc.indexOf("const sel =", memoAt))
  const depMissing = onlyStates.filter((f) => !memoDeps.includes(f))
  check(`필터 재계산: 화면 필터 ${onlyStates.length}개가 모두 목록 메모 의존성에 포함`,
    memoDeps.length > 0 && depMissing.length === 0, `누락=${depMissing.join(", ")}`)

  // 저장된 뷰 ↔ 화면 필터 — 뷰는 "그때 좁혀 본 집합"을 이름으로 되살리는 기능이다. 필터가 늘 때 뷰 저장·적용에
  //  넣지 않으면 조건이 저장되지 않고, 적용해도 켜져 있던 다른 필터가 남아 같은 이름이 매번 다른 목록을 연다.
  const viewTypeAt = regViewSrc.indexOf("type SavedView = {")
  const viewTypeBlock = viewTypeAt === -1 ? "" : regViewSrc.slice(viewTypeAt, regViewSrc.indexOf("}", regViewSrc.indexOf("liveOnly", viewTypeAt)) + 1)
  const applyAt = regViewSrc.indexOf("const applyView = (v: SavedView)")
  const applyBlock = applyAt === -1 ? "" : regViewSrc.slice(applyAt, regViewSrc.indexOf("const saveCurrentView", applyAt))
  const saveAt = regViewSrc.indexOf("const v: SavedView = {")
  const saveBlock = saveAt === -1 ? "" : regViewSrc.slice(saveAt, saveAt + 400)
  const viewMissing = onlyStates.filter((f) => !viewTypeBlock.includes(f) || !applyBlock.includes(f) || !saveBlock.includes(f))
  check(`저장된 뷰: 화면 필터 ${onlyStates.length}개가 모두 뷰 저장·적용에 포함`,
    viewTypeBlock.length > 0 && applyBlock.length > 0 && viewMissing.length === 0, `누락=${viewMissing.join(", ")}`)

  // 데이터 API 도 권한 매트릭스를 본다 — 화면 가드(requireView)는 매트릭스 조회 칸을 보는데 인쇄 문서·리포트 API 가
  //  역할만 보면, 조회를 회수한 뒤에도 같은 데이터가 문서로 그대로 나간다(실제로 12곳이 그랬다).
  //  스토어를 읽는 API 라우트는 매트릭스 판정(can·canExport·canViewMenu) 중 하나를 반드시 거쳐야 한다.
  //  면제는 화면 매핑 자체가 없는 두 곳뿐이다(연동 화면은 ROUTE_MENU 에 없어 매트릭스 조회 칸이 존재하지 않는다).
  const apiExempt = ["audit-export", "dispatch-export"]
  const apiRoutes = []
  const walkApi = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walkApi(p)
      else if (ent.name === "route.ts") apiRoutes.push(p)
    }
  }
  walkApi(path.join(ROOT, "app", "api"))
  const apiUngated = apiRoutes
    .map((p) => ({ rel: path.relative(ROOT, p).split(path.sep).join("/"), src: readFileSync(p, "utf8") }))
    .filter((r) => r.src.includes("getStore") || r.src.includes("buildSheets"))
    .filter((r) => !apiExempt.some((e) => r.rel.includes(e)))
    .filter((r) => !new RegExp("\\b(can|canExport|canViewMenu)\\(").test(r.src))
    .map((r) => r.rel)
  check(`API 매트릭스 게이트: 스토어를 읽는 라우트 ${apiRoutes.length}개가 모두 매트릭스 판정을 거친다`,
    apiUngated.length === 0, `미적용=${apiUngated.join(", ")}`)

  // 독촉·통보는 당일 발송분을 뺀다 — 같은 사람에게 하루에 여러 통이 가면 알림이 무력해진다.
  //  실제로 MFA 등록 요구·공지 미확인자 안내가 이 규약에서 빠져 누를 때마다 다시 나갔다.
  //  종류가 하나 늘 때 같은 누락이 반복되지 않게, 독촉·통보·요구 계열 발송 종류마다
  //  같은 날 발송분을 거르는 참조(sentTodayRefs 또는 kind 비교 + at.startsWith)가 있는지 본다.
  //  면제는 집행 1회성 이벤트 통지뿐이다(격리 통보 — 차단 집행 시 한 번 나가고 반복 발송 개념이 없다).
  const remindExempt = ["격리 통보"]
  const dispatchKinds = [...new Set(sourceFiles
    .filter((f) => f.endsWith(".ts"))
    .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/kind: '([^']*(?:독촉|통보|요구))'/g)].map((m) => m[1])))]
  const dedupeMissing = dispatchKinds.filter((k) => {
    if (remindExempt.includes(k)) return false
    return !sourceFiles.some((f) => readFileSync(f, "utf8").split(/\r?\n/).some((line) =>
      line.includes(k) && (line.includes("sentTodayRefs") || line.includes("at.startsWith"))))
  })
  check(`통지 중복 억제: 독촉·통보 ${dispatchKinds.length}종이 모두 당일 발송분을 거른다`,
    dispatchKinds.length >= 15 && dedupeMissing.length === 0, `누락=${dedupeMissing.join(", ")}`)

  // 자리표시자 판정 단일 정의 — 보유자 미지정·위치 실사 확인 필요·- 는 "값이 아니다"라는 한 규약을 쓴다.
  //  액션마다 `x !== '미지정' && x !== '-'` 를 따로 적으면 자리표시자가 하나 늘 때 일부만 고쳐지고,
  //  통지가 아무에게도 아닌 이름으로 나가거나 정합성 큐에서 자산이 빠진다(lib/quality 의 isPlaceholder·hasHolder).
  const holderInline = sourceFiles
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.endsWith(["lib", "quality.ts"].join(path.sep)))
    .filter((f) => new RegExp("!== '미지정' && ").test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check(`자리표시자 판정: 보유자 검사를 액션이 따로 적지 않는다(lib/quality 단일 정의)`,
    holderInline.length === 0, `직접 판정=${holderInline.join(", ")}`)

  // 손 떠난 자산 판정 단일화 — 계약 커버리지(contractAssetCount)·재배치 풀(availableAssets)·예정 일정(upcomingSchedule)은
  //  모두 "분실·폐기예정·폐기완료는 뺀다"는 같은 규칙을 쓴다. 한 곳만 상태 목록을 직접 적으면(예전 아젠다가 폐기 두 상태만 뺐다)
  //  같은 자산이 한 화면에선 살아 있고 다른 화면에선 빠지는 갈림이 생긴다. 세 모듈이 GONE_STATUSES 를 참조하는지 본다.
  // 업무 중요도 선택지도 같은 규약 — 화면의 지정 버튼과 서버 검증이 각자 목록을 들면, 화면이 내준 값을 서버가
  //  "올바르지 않은 값"으로 거절하는 막다른 컨트롤이 된다.
  const critLiteral = sourceFiles
    .filter((f) => path.relative(ROOT, f).split(path.sep).join("/") !== "lib/types.ts")
    .filter((f) => readFileSync(f, "utf8").includes("['핵심', '중요', '일반']"))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("업무 중요도 선택지: 코드에 직접 적은 곳이 없다(CRITICALITY_LEVELS 단일 정의)",
    critLiteral.length === 0, `직접 목록=${critLiteral.join(", ")}`)

  // 종료(터미널) 상태(분실·폐기완료)도 같은 규약 — 계약 일괄 연계·좌석 배정 가드와 그 화면 컨트롤이 함께 쓰는
  //  판정이라, 각자 적으면 서버는 거절하는데 화면은 버튼을 내주는(또는 그 반대) 갈림이 생긴다.
  const terminalLiteral = sourceFiles
    .filter((f) => path.relative(ROOT, f).split(path.sep).join("/") !== "lib/types.ts")
    .filter((f) => readFileSync(f, "utf8").includes("['분실', '폐기완료'].includes("))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("종료 상태 판정: 상태 묶음을 코드에 직접 적은 곳이 없다(TERMINAL_STATUSES 단일 정의)",
    terminalLiteral.length === 0, `직접 목록=${terminalLiteral.join(", ")}`)

  // 사용자 상신 종류(자산 신청·반납·이동·대여·SaaS 인가)도 같은 규약 — 재상신·상신 취소·결과 통보가 함께 쓰는
  //  묶음이라 각자 적으면 종류가 늘 때 어떤 경로에선 취소되고 어떤 경로에선 조용히 막히는 갈림이 생긴다.
  const kindLiteral = sourceFiles
    .filter((f) => path.relative(ROOT, f).split(path.sep).join("/") !== "lib/types.ts")
    .filter((f) => readFileSync(f, "utf8").includes("['자산 신청', '반납', '이동', '대여', 'SaaS 인가']"))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("사용자 상신 종류: 코드에 직접 적은 곳이 없다(USER_REQUEST_KINDS 단일 정의)",
    kindLiteral.length === 0, `직접 목록=${kindLiteral.join(", ")}`)

  // 자산 유형 목록도 마찬가지 — 입고 등록 드롭다운·대량 등록 검증이 각자 목록을 들고 있으면 유형이 하나 늘 때
  //  대장 필터·집계는 새 유형을 아는데 등록 경로만 옛 목록이라 그 유형 자산을 아예 넣을 수 없다.
  const catLiteral = sourceFiles
    .filter((f) => path.relative(ROOT, f).split(path.sep).join("/") !== "lib/types.ts")
    .filter((f) => readFileSync(f, "utf8").includes("['단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']"))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("자산 유형 목록: 코드에 직접 적은 곳이 없다(ASSET_CATEGORIES 단일 정의)",
    catLiteral.length === 0, `직접 목록=${catLiteral.join(", ")}`)

  // 폐기 경로 상태(폐기예정·폐기완료)도 같은 규약 — 보증·EOL·취약점·이상행위 판정이 모두 "폐기로 간 자산은 대상이
  //  아니다"라는 한 규칙을 쓰는데 열두 곳이 각자 배열을 적고 있었다. 수명주기 단계표는 화면 구성이라 제외한다.
  const disposalLiteral = sourceFiles
    .filter((f) => {
      const rel = path.relative(ROOT, f).split(path.sep).join("/")
      return rel !== "lib/types.ts" && rel !== "app/(app)/assets/lifecycle/page.tsx"
    })
    .filter((f) => {
      const src = readFileSync(f, "utf8")
      return src.includes("['폐기완료', '폐기예정'].includes(") || src.includes("['폐기예정', '폐기완료'].includes(")
    })
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("폐기 경로 판정: 상태 묶음을 코드에 직접 적은 곳이 없다(DISPOSAL_STATUSES 단일 정의)",
    disposalLiteral.length === 0, `직접 목록=${disposalLiteral.join(", ")}`)

  // 재배치 대기 풀(유휴·반납대기)도 같은 규약 — 재고 집계 칸·리포트 서술·실사 위치 판정이 함께 쓰는 한 묶음이라
  //  각자 배열을 적으면 상태가 늘 때 한쪽만 세는 갈림이 생긴다. 수명주기 단계표는 화면 구성(단계 그룹)이라 제외한다.
  const idleLiteral = sourceFiles
    .filter((f) => {
      const rel = path.relative(ROOT, f).split(path.sep).join("/")
      return rel !== "lib/types.ts" && rel !== "app/(app)/assets/lifecycle/page.tsx"
    })
    .filter((f) => readFileSync(f, "utf8").includes("['유휴', '반납대기'].includes("))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("재배치 대기 풀 판정: 상태 묶음을 코드에 직접 적은 곳이 없다(IDLE_POOL_STATUSES 단일 정의)",
    idleLiteral.length === 0, `직접 목록=${idleLiteral.join(", ")}`)

  // 저하 커넥터(지연·오류)도 같은 규약 — 대시보드 큐는 둘을 함께 세는데 연동 화면 KPI 는 지연만 세어
  //  같은 개념이 두 곳에서 다른 수로 보였다. 각자 조건을 적으면 상태가 하나 늘 때 또 갈린다.
  const connLiteral = sourceFiles
    .filter((f) => path.relative(ROOT, f).split(path.sep).join("/") !== "lib/types.ts")
    .filter((f) => {
      const src = readFileSync(f, "utf8")
      return src.includes("=== '지연' || i.status === '오류'") || src.includes("['지연', '오류']")
    })
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("저하 커넥터 판정: 상태 묶음을 코드에 직접 적은 곳이 없다(DEGRADED_CONNECTOR_STATUSES 단일 정의)",
    connLiteral.length === 0, `직접 목록=${connLiteral.join(", ")}`)

  // 목록을 직접 적은 곳이 새로 생기는지도 훑는다 — 참조 파일 목록만 검사하면 새 파일이 조용히 자기 목록을 갖는다
  //  (재물조사 마감 가드가 그렇게 상태 셋을 직접 적고 있었다). 배열 리터럴 형태로만 잡아 상태 드롭다운 전체 목록은 건드리지 않는다.
  const goneLiteral = sourceFiles
    .filter((f) => path.relative(ROOT, f).split(path.sep).join("/") !== "lib/types.ts")
    .filter((f) => {
      const src = readFileSync(f, "utf8")
      return src.includes("['분실', '폐기예정', '폐기완료']") || src.includes("['폐기예정', '폐기완료', '분실']")
    })
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("손 떠난 자산 판정: 상태 목록을 코드에 직접 적은 곳이 없다(GONE_STATUSES 단일 정의)",
    goneLiteral.length === 0, `직접 목록=${goneLiteral.join(", ")}`)

  const goneUsers = [
    ["lib/upcoming.ts", "upcoming"],
    ["lib/store.ts", "store"],
  ]
  // 주석에 이름만 적힌 건 사용이 아니다 — 실제 호출(GONE_STATUSES.includes)을 본다.
  const goneMissing = goneUsers.filter(([rel]) => !readFileSync(path.join(ROOT, ...rel.split("/")), "utf8").includes("GONE_STATUSES.includes("))
  check("손 떠난 자산 판정: 예정 일정·계약 커버리지가 GONE_STATUSES 단일 정의를 쓴다",
    goneMissing.length === 0, `직접 정의=${goneMissing.map((g) => g[0]).join(", ")}`)

  // 상위 이탈 판정과 NAC 격리 — 격리는 상태를 바꾸지 않고(사용중 그대로) 망만 끊는 보안 조치라, 상태만 보던
  //  isDegraded 로는 하위 자산이 상위가 끊긴 줄 몰랐다("저하된 상위" 경고·영향 통지 큐·SPOF 즉시 리스크 모두 침묵).
  //  통지 사유도 상태 문자열을 그대로 써서 격리 상위는 "사용중 — 운영 이탈"이라는 앞뒤 안 맞는 통지가 됐다.
  //  격리된 상위 자산은 시드에 없고 격리 결재 대상 자산에 하위가 없어 런타임 재현이 안 되므로 구조 검사로 둔다.
  const graphSrc = readFileSync(path.join(ROOT, "lib", "cmdb-graph.ts"), "utf8")
  const regSrc = readFileSync(path.join(ROOT, "app", "(app)", "assets", "register", "actions.ts"), "utf8")
  const degAt = graphSrc.indexOf("export function isDegraded")
  const degBody = degAt === -1 ? "" : graphSrc.slice(degAt, graphSrc.indexOf("\n}", degAt))
  const notifyAt = regSrc.indexOf("export async function notifyDependencyImpact")
  const notifyBody = notifyAt === -1 ? "" : regSrc.slice(notifyAt, notifyAt + 1200)
  check("상위 이탈 판정: NAC 격리 상위도 저하로 보고 통지 사유에 격리를 밝힌다",
    degBody.includes("a.quarantinedAt") && notifyBody.includes("asset.quarantinedAt") && notifyBody.includes("NAC 격리"),
    `isDegraded 격리 반영=${degBody.includes("a.quarantinedAt")} 통지 사유 격리 표기=${notifyBody.includes("NAC 격리")}`)
  // 격리 표시의 반출·문서 전파 — 화면(대장 목록·상세)은 상태 칩 옆에 격리 칩을 세우는데 자산 대장 엑셀과
  //  인쇄 자산 카드에는 그 열·항목이 없어, 결재 첨부본·현장 실사 인쇄물만 보면 망이 끊긴 자산이 '사용중'
  //  정상 장비로 읽혔다(판정은 이미 격리를 반영하는데 표기만 빠진 반만 적용된 규칙).
  //  시드에 격리 자산이 없어 스모크(SSR)에서는 런타임 재현이 안 되므로 구조 검사로 두고, 실제 표기는 e2e 가 본다.
  const expSrc = readFileSync(path.join(ROOT, "lib", "exports.ts"), "utf8")
  const cardSrc = readFileSync(path.join(ROOT, "app", "api", "asset-card", "[assetNo]", "route.ts"), "utf8")
  check("격리 표기 전파: 자산 대장 엑셀 열 · 인쇄 자산 카드가 quarantinedAt 을 반영",
    expSrc.includes("'NAC 격리'") && expSrc.includes("a.quarantinedAt") && cardSrc.includes("a.quarantinedAt"),
    `엑셀 열=${expSrc.includes("'NAC 격리'")} 카드=${cardSrc.includes("a.quarantinedAt")}`)

  // 테스트 하네스의 날짜 만들기 단일화 — e2e 가 UTC 로 날짜를 만들면 서버 기준일(KST)과 자정~09시에 하루 어긋난다
  //  (실제로 00:19 실행에서 '격리 반출 정합'이 그렇게 깨졌다). 날짜는 dPlus() 하나로만 만든다 —
  //  헬퍼 본문의 한 번을 빼면 스크립트 어디에도 toISOString 으로 날짜를 자르는 곳이 없어야 한다.
  const e2eSrc = readFileSync(path.join(ROOT, "scripts", "e2e-findings.mjs"), "utf8")
  const isoDateUses = e2eSrc.split("toISOString().slice(0, 10)").length - 1
  check("e2e 날짜 하네스: 기준일 파생을 dPlus() 하나로 모은다(UTC 직접 사용 없음)",
    isoDateUses === 1 && e2eSrc.includes("timeZone: TZ"), `toISOString 날짜 절단 ${isoDateUses}회(헬퍼 1회만 허용)`)

  // 공통코드도 같은 규약 — 참조가 있는 사용 중 코드는 서버가 미사용 전환·명칭 변경을 모두 거절한다.
  //  화면이 그 판정을 모르면 눌러야 막히는 버튼을 계속 내준다(참조 수는 이미 화면이 알고 있다).
  const codesViewSrc = readFileSync(path.join(ROOT, "app", "(app)", "settings", "codes", "CodeGroups.tsx"), "utf8")
  const codesActionsSrc = readFileSync(path.join(ROOT, "app", "(app)", "settings", "actions.ts"), "utf8")
  check("공통코드: 참조 있는 코드의 컨트롤을 화면이 잠근다(서버 가드와 같은 판정)",
    codesViewSrc.includes("disabled={pending || (v.active && used > 0)}")
    && codesActionsSrc.includes("사용 중인 코드는 미사용 전환할 수 없습니다")
    && codesActionsSrc.includes("사용 중인 코드는 명칭을 바꿀 수 없습니다"),
    `화면 잠금=${codesViewSrc.includes("disabled={pending || (v.active && used > 0)}")}`)

  // 조용한 거절 금지(전역) — 서버 액션이 값 없이 거절하면(bare return) 화면은 거절 사실을 알 수 없어,
  //  눌러도 아무 일이 없는 컨트롤이 된다. 입고 검수·공통코드·스캔 정책에서 같은 자리를 닫았으므로
  //  이제 어떤 액션 파일에도 값 없는 return 이 남지 않아야 한다(새로 생기면 여기서 걸린다).
  const serverActionFiles = sourceFiles.filter((f) => path.basename(f) === "actions.ts")
  const silentActions = serverActionFiles.filter((f) => readFileSync(f, "utf8").split(new RegExp("\\r?\\n"))
    .some((line) => line.trimEnd().endsWith(" return") && !line.includes("//")))
    .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  check("서버 액션: 값 없이 거절하는 곳이 없다(조용한 거절 금지)",
    silentActions.length === 0, `값 없는 거절=${silentActions.join(", ")}`)

  // 조용한 거절 금지(입고 검수) — 서버가 값 없이 거절하면 화면은 거절 사실을 알 수 없어, 눌러도 아무 일이
  //  없는 체크박스를 계속 내준다. 검수 토글은 사유가 있는 응답을 돌려주고, 화면은 같은 판정으로 잠근다.
  const intakeSrc = readFileSync(path.join(ROOT, "app", "(app)", "assets", "intake", "actions.ts"), "utf8")
  const intakeViewSrc = readFileSync(path.join(ROOT, "app", "(app)", "assets", "intake", "IntakeView.tsx"), "utf8")
  const toggleAt = intakeSrc.indexOf("export async function toggleCheck")
  const toggleEnd = toggleAt === -1 ? -1 : intakeSrc.indexOf("\n}", toggleAt)
  const toggleBody = toggleAt === -1 ? "" : intakeSrc.slice(toggleAt, toggleEnd)
  const silentReturn = toggleBody.split("\n").some((line) => line.trimEnd().endsWith("return"))
  check("입고 검수 토글: 거절이 사유로 돌아오고 화면이 같은 판정으로 잠근다(조용한 거절 금지)",
    !silentReturn && toggleBody.includes("ok: false") && intakeViewSrc.includes("checkLock"),
    `값 없는 거절=${silentReturn} 사유 응답=${toggleBody.includes("ok: false")} 화면 잠금=${intakeViewSrc.includes("checkLock")}`)

  // 사용자별 보유 자산 수 ↔ 드릴다운 — 집계는 손 떠난 자산을 빼는데 링크가 전체를 열면 "보유 3" 을 눌렀는데
  //  목록이 4건이 된다(재고 경보 드릴다운과 같은 계열). 집계는 GONE_STATUSES 단일 정의를, 링크는 같은 판정의
  //  live=1 을 쓴다 — 시드에는 분실·폐기예정 보유자가 없어 SSR 로는 재현되지 않으므로 구조로 고정한다.
  const usersPageSrc = readFileSync(path.join(ROOT, "app", "(app)", "settings", "users", "page.tsx"), "utf8")
  const usersViewSrc = readFileSync(path.join(ROOT, "app", "(app)", "settings", "users", "UsersView.tsx"), "utf8")
  check("사용자 보유 자산 수: 집계(GONE_STATUSES) 와 드릴다운(live=1) 이 같은 집합",
    usersPageSrc.includes("GONE_STATUSES.includes(") && usersViewSrc.includes("&live=1"),
    `집계 단일 정의=${usersPageSrc.includes("GONE_STATUSES.includes(")} 링크 live=1=${usersViewSrc.includes("&live=1")}`)

  // 유지보수·좌석 큐의 드릴다운 정합 — 대시보드가 "SLA 위반 1건"이라 말하면 링크가 여는 화면도 그 1건만 보여야 한다.
  //  그동안 이 네 큐만 필터 없이 계약 화면 맨 위로 보내, 담당자가 긴 표에서 눈으로 찾아야 했다(라이선스 큐는 ?lic= 로 이미 좁혔다).
  //  화면이 "N건 표시 (전체 M건)"을 스스로 적으므로 큐 숫자와 그 N 을 맞대어 본다.
  const dashMgr = await (await get('/dashboard', 'ASSET_MGR')).text()
  const queueCount = (label) => {
    const at = dashMgr.indexOf(label)
    if (at === -1) return -1
    const chip = /<span class="chip[^"]*">(?:<!-- -->)*([0-9]+)/.exec(dashMgr.slice(at, at + 900))
    return chip ? Number(chip[1]) : -1
  }
  const drillCount = async (qs) => {
    const html = await (await get(`/inventory/contracts${qs}`, 'ASSET_MGR')).text()
    // 큐 건수에는 data-queue 표식이 붙어 태그가 사이에 낀다 — 태그를 걷어낸 뒤 문구를 읽는다
    const m = /([0-9]+)건 표시/.exec(html.replace(/<!-- -->/g, "").replace(/<[^>]*>/g, ""))
    return m ? Number(m[1]) : -1
  }
  const drillPairs = [
    ['유지보수 SLA 위반 (대응 시한 초과 · 이행 독촉)', '?maint=sla'],
    ['유지보수 미집행 (이행 확인·독촉)', '?maint=exec'],
    ['유지보수 예산 초과·소진 임박 (재협상·집행 점검)', '?maint=budget'],
    // 발주 미이행 큐도 같은 규약으로 — 그전엔 필터 없이 계약 화면 맨 위로만 보냈다.
    ['구매 계약 발주 미이행 · 만료 임박 (이행 점검)', '?proc=risk'],
  ]
  const drillBad = []
  for (const [label, qs] of drillPairs) {
    const want = queueCount(label)
    const got = await drillCount(qs)
    if (want < 0 || want !== got) drillBad.push(`${label}: 큐 ${want} ≠ 표시 ${got}`)
  }
  check("계약 화면 드릴다운: 유지보수 큐 건수 = 필터 화면 표시 건수", drillBad.length === 0, drillBad.join(" / "))

  // 알림 전달 실패 큐 — 재발송 대상 건만 열어야 한다. 그동안 이력 화면 맨 위로만 보내, 긴 발송 이력에서
  //  실패 건을 눈으로 찾아야 했다(전달 상태 필터 자체가 없었다). 반출본도 같은 필터를 받는다.
  const dispFailHtml = await (await get('/platform/integrations?dispatch=failed', 'SEC_MGR')).text()
  // 감사 로그 카드도 같은 형태의 "N / M건"을 적으므로 알림 발송 이력 카드 이후 구간에서 찾는다.
  const dispPlain = dispFailHtml.replace(/<!-- -->/g, "")
  const dispCardAt = dispPlain.indexOf("알림 발송 이력")
  const dispShown = Number((new RegExp("([0-9]+) \/ ([0-9]+)건").exec(dispCardAt === -1 ? "" : dispPlain.slice(dispCardAt)) || [])[1] ?? -1)
  // 이 큐는 보안 운영 큐라 자산담당 대시보드에는 없다 — 보안담당 대시보드에서 읽는다.
  const dashSec = await (await get('/dashboard', 'SEC_MGR')).text()
  const secQueueCount = (label) => {
    const at = dashSec.indexOf(label)
    if (at === -1) return -1
    const chip = /<span class="chip[^"]*">(?:<!-- -->)*([0-9]+)/.exec(dashSec.slice(at, at + 900))
    return chip ? Number(chip[1]) : -1
  }
  const dispQueue = secQueueCount('알림 전달 실패 (재발송 필요)')
  check("알림 전달 실패 큐: 건수 = 필터 화면 표시 건수", dispQueue > 0 && dispQueue === dispShown, `큐 ${dispQueue} · 표시 ${dispShown}`)
  check("알림 발송 이력: 전달 실패 필터 컨트롤 렌더(재발송 대상 좁히기)", dispFailHtml.includes('전달 실패'))
  const dispXlsx = Buffer.from(await (await get('/api/dispatch-export?delivery=' + encodeURIComponent('실패'), 'SEC_MGR')).arrayBuffer()).toString('utf8')
  check("알림 발송 이력 반출: 전달 상태 필터 반영(화면과 같은 집합)", dispXlsx.includes('전달 상태') && !dispXlsx.includes('발송 완료'))
  // 발견 화면의 조치 표(휴면 계정·로컬 VM)는 조치가 끝난 건까지 함께 쌓인다 — 큐가 말한 '미조치 N건'을
  //  화면에서 다시 세어야 했다. 큐 링크가 미조치만 보기를 켠 채 열고, 표가 그 집합의 건수를 스스로 적는다.
  const cardShown = (html, cardTitle) => {
    const plain = html.replace(/<!-- -->/g, "")
    const at = plain.indexOf(cardTitle)
    return Number((new RegExp("([0-9]+) \/ ([0-9]+)건").exec(at === -1 ? "" : plain.slice(at)) || [])[1] ?? -1)
  }
  const acctHtml = await (await get('/discovery/found?open=accounts', 'SEC_MGR')).text()
  const vmHtml = await (await get('/discovery/found?open=localvm', 'SEC_MGR')).text()
  const acctQueue = secQueueCount('휴면 계정 미처리 (AD/IdP 계정 위생)')
  const vmQueue = secQueueCount('로컬 VM 위반 미조치 (엔드포인트 가상머신)')
  const acctShown = cardShown(acctHtml, '휴면 계정 — AD/IdP')
  const vmShown = cardShown(vmHtml, '로컬 가상머신 — 엔드포인트 VM')
  check("휴면 계정 큐: 건수 = 미조치만 보기 표시 건수", acctQueue > 0 && acctQueue === acctShown, `큐 ${acctQueue} · 표시 ${acctShown}`)
  check("로컬 VM 큐: 건수 = 미조치만 보기 표시 건수", vmQueue > 0 && vmQueue === vmShown, `큐 ${vmQueue} · 표시 ${vmShown}`)
  // 필터 없이 열면 조치 완료분까지 포함한다 — 시드는 전건 미조치라 두 수가 같고, 조치가 쌓이면 전체가 커진다.
  //  (필터가 실제로 걸러 내는지는 e2e 가 조치 후 두 수를 비교해 확인한다.)
  const acctAll = cardShown(await (await get('/discovery/found', 'SEC_MGR')).text(), '휴면 계정 — AD/IdP')
  check("발견 조치 표: 필터 없는 화면은 미조치 이상을 표시(집합 포함 관계)", acctAll >= acctShown && acctShown > 0, `전체 ${acctAll} · 미조치 ${acctShown}`)
  // 미판정 SaaS 큐 — 판정이 끝난 인가·차단 항목까지 함께 쌓이는 대장이라, 큐가 말한 '검토 대기 N건'을
  //  화면에서 다시 세어야 했다. 큐 링크가 검토 대기만 보기를 켠 채 연다.
  const saasHtml = await (await get('/settings/saas-catalog?status=review', 'SEC_MGR')).text()
  const saasShown = cardShown(saasHtml, '서비스 목록 · 판정')
  const saasQueue = secQueueCount('미판정 SaaS (카탈로그 검토중 · 판정 대기)')
  check("미판정 SaaS 큐: 건수 = 검토 대기만 보기 표시 건수", saasQueue > 0 && saasQueue === saasShown, `큐 ${saasQueue} · 표시 ${saasShown}`)
  const saasAll = cardShown(await (await get('/settings/saas-catalog', 'SEC_MGR')).text(), '서비스 목록 · 판정')
  check("SaaS 카탈로그: 필터 없이 열면 판정 완료분까지 표시(필터 실효 확인)", saasAll > saasShown, `전체 ${saasAll} · 검토중 ${saasShown}`)
  // 판정 기한 경과 큐 — 검토 대기(?status=review)보다 좁은 집합인데 필터가 없어 대장 전체로 떨어졌다.
  //  경과 판정은 lib/saas-review 가 낸다: 접수일이 없는 항목도 fail safe 로 경과로 보는데, 표는 그 경우 배지를
  //  아예 안 그려 큐와 갈릴 수 있었다 — 이제 표도 같은 집합을 받아 쓴다.
  const saasOverHtml = (await (await get('/settings/saas-catalog?status=overdue', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const saasOverShown = cardShown(saasOverHtml, '서비스 목록 · 판정')
  const saasOverQueue = secQueueCount('미판정 SaaS 판정 기한 경과 (')
  check("SaaS 판정 기한 경과 큐: 건수 = 기한 경과만 보기 표시 건수",
    saasOverQueue > 0 && saasOverQueue === saasOverShown, `큐 ${saasOverQueue} · 표시 ${saasOverShown}`)
  check("SaaS 판정 기한 경과 큐: 링크가 그 필터를 켠 채 연다", dashSec.includes('/settings/saas-catalog?status=overdue'))
  // 기한 경과는 검토 대기의 부분집합이어야 한다 — 두 필터가 각자 판정하면 이 관계가 깨진다.
  check("SaaS 필터: 기한 경과는 검토 대기의 부분집합", saasOverShown <= saasShown, `경과 ${saasOverShown} · 검토중 ${saasShown}`)
  // 정례 리포트 배포 기한 경과 큐 — 스케줄 표는 정상 주기 항목까지 함께 보여 주므로, 큐가 말한 '기한 도래 N건'을
  //  화면에서 다시 세어야 했다. 큐 링크가 기한 도래만 보기를 켠 채 연다.
  const repDueHtml = await (await get('/ai/reports?due=1', 'ASSET_MGR')).text()
  const repDueShown = cardShown(repDueHtml, '자동 생성 스케줄')
  const repDueQueue = queueCount('정례 리포트 배포 기한 경과 (자동 생성 밀림)')
  check("정례 리포트 기한 경과 큐: 건수 = 기한 도래만 보기 표시 건수", repDueQueue > 0 && repDueQueue === repDueShown, `큐 ${repDueQueue} · 표시 ${repDueShown}`)
  const repAll = cardShown(await (await get('/ai/reports', 'ASSET_MGR')).text(), '자동 생성 스케줄')
  check("리포트 스케줄: 필터 없이 열면 정상 주기 항목까지 표시(필터 실효 확인)", repAll > repDueShown, `전체 ${repAll} · 기한 도래 ${repDueShown}`)
  // 미인가 SW·USB 큐도 같은 계열 — 조치 완료분까지 쌓이는 표를 통째로 열던 것을 미조치만 보기로 연다.
  const swHtml = await (await get('/discovery/found?open=sw', 'SEC_MGR')).text()
  const usbHtml = await (await get('/discovery/found?open=usb', 'SEC_MGR')).text()
  const swShown = cardShown(swHtml, '미인가 SW — 설치 SW 정책 위반')
  const usbShown = cardShown(usbHtml, 'USB 저장매체 — 이동식 매체 정책 위반')
  const swQueue = secQueueCount('미인가 SW 미조치 (EDR 정책 위반)')
  const usbQueue = secQueueCount('USB 정책 위반 미조치 (이동식 매체 DLP)')
  check("미인가 SW 큐: 건수 = 미조치만 보기 표시 건수", swQueue > 0 && swQueue === swShown, `큐 ${swQueue} · 표시 ${swShown}`)
  check("USB 위반 큐: 건수 = 미조치만 보기 표시 건수", usbQueue > 0 && usbQueue === usbShown, `큐 ${usbQueue} · 표시 ${usbShown}`)
  // 미관리 클라우드 리소스 표만 이 필터가 없었다 — 같은 화면의 네 조치 표는 이미 미조치만 보기를 갖고 있는데,
  //  이 표는 조치 완료분이 섞인 전체를 통째로 열어 큐가 말한 건수를 눈으로 세어야 했다.
  const cloudHtml = await (await get('/discovery/found?open=cloud', 'SEC_MGR')).text()
  const cloudShown = cardShown(cloudHtml, '미관리 클라우드 리소스 — 태그·소유·통제 위반')
  const cloudQueue = secQueueCount('미관리 클라우드 리소스 미조치 (태그·소유·회수 · SAM/거버넌스)')
  check("미관리 클라우드 큐: 건수 = 미조치만 보기 표시 건수", cloudQueue > 0 && cloudQueue === cloudShown, `큐 ${cloudQueue} · 표시 ${cloudShown}`)
  check("미관리 클라우드 큐: 링크가 미조치만 보기를 켠 채 연다", dashSec.includes('/discovery/found?open=cloud'))
  // 취약점 우선순위 표는 점수 상위 12건에서 끊기고 남은 건수만 '… 외 N건'으로 알려 줬다 — 대시보드 P1 큐가
  //  12건보다 많으면 그 뒤 P1 항목은 화면 어디에서도 볼 수 없었다. 이제 등급을 고르면 그 등급 전량이 나온다.
  const vulnP1Html = (await (await get('/ai/insights?tier=p1', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const vulnP1Queue = secQueueCount('취약점 우선순위 P1 (즉시 조치)')
  const vulnAt = vulnP1Html.indexOf('자산 중요도 × 노출도 · ')
  const vulnShown = Number((new RegExp("노출도 · ([0-9]+) \/ ([0-9]+)건").exec(vulnAt === -1 ? "" : vulnP1Html.slice(vulnAt, vulnAt + 200)) || [])[1] ?? -1)
  check("취약점 P1 큐: 건수 = 등급 필터 표시 건수", vulnP1Queue > 0 && vulnP1Queue === vulnShown, `큐 ${vulnP1Queue} · 표시 ${vulnShown}`)
  check("취약점 P1 큐: 링크가 등급 필터를 켠 채 연다", dashSec.includes('/ai/insights?tier=p1'))
  // 필터 없이 열면 상위 12건에서 끊긴다 — 그 제한이 있다는 사실과 넘어가는 길을 화면이 밝혀야 한다(조용한 잘림 금지).
  //  이 화면에는 '… 외 N건'을 쓰는 패널이 여럿이라 취약점 카드 구간부터 본다.
  const vulnPlain = (await (await get('/ai/insights', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const vulnCardAt = vulnPlain.indexOf('취약점 노출 우선순위 — 조치 우선순위 스코어링')
  const vulnCard = vulnCardAt === -1 ? '' : vulnPlain.slice(vulnCardAt, vulnCardAt + 20000)
  check('취약점 우선순위: 상위 N건 제한을 화면이 밝힌다(조용한 잘림 금지)',
    vulnCardAt !== -1 && (!vulnCard.includes('점수 내림차순') || vulnCard.includes('등급을 고르면 그 등급 전량을 볼 수 있습니다')))
  // 등급 칩은 큐가 세는 세 등급을 모두 내준다 — 필터가 P1 만 있으면 P2·P3 는 여전히 12건에서 잘린다.
  check('취약점 우선순위: P1·P2·P3 등급 필터 진입점 노출',
    vulnCard.includes('/ai/insights?tier=p1') && vulnCard.includes('/ai/insights?tier=p2') && vulnCard.includes('/ai/insights?tier=p3'))
  // 대시보드 카드도 상위 몇 건만 보여 주고 나머지는 '외 N건'으로만 알렸다 — 다가오는 일정은 여러 화면에서
  //  모아 만든 목록이라 대신 열 화면이 없고, 내게 온 알림은 발송 이력 화면이 운영 권한이라 사용자에겐 닫혀 있다.
  // 자산담당 대시보드에는 시드상 잘림이 없다 — 그 화면만 보면 '0건 검사'로 조용히 통과한다.
  //  실제로 잘리는 화면(Admin 결재 대기 '외 N건')까지 함께 봐야 이 규약이 검증된다.
  const dashPlain = (dashMgr + dashAdminHtml).replace(/<!-- -->/g, '')
  const dashCuts = [...dashPlain.matchAll(/외 [0-9]+건/g)].map((m) => m.index ?? -1)
  const dashCutBad = dashCuts.filter((i) => !dashPlain.slice(i, i + 200).includes('전체 보기') && !dashPlain.slice(i, i + 200).includes('결재함에서 전체 처리'))
  check(`대시보드: 잘림 안내 ${dashCuts.length}건 모두 남은 항목으로 가는 길이 있다(조용한 잘림 금지)`,
    dashCutBad.length === 0 && dashCuts.length > 0, `길 없는 잘림 안내=${dashCutBad.length}/${dashCuts.length}`)
  // 펼침은 URL 로 받는다 — 딥링크·새로고침이 같은 목록을 연다. 시드에서 잘림이 실제로 일어나는 카드에만
  //  접기 링크를 요구한다(잘리지 않으면 펼칠 것도 없다 — 그 경우는 파라미터가 화면을 깨지 않는지만 본다).
  const dashUpAll = await get('/dashboard?upcoming=all', 'ASSET_MGR')
  const dashUpAllText = (await dashUpAll.text()).replace(/<!-- -->/g, '')
  const upcomingTruncated = dashPlain.includes('(날짜순) — 전체 보기')
  check('대시보드: ?upcoming=all 가 화면을 깨지 않는다', dashUpAll.status === 200 && dashUpAllText.includes('다가오는 일정'))
  check('대시보드: 잘린 일정 카드는 펼친 뒤 접기 링크를 낸다',
    !upcomingTruncated || dashUpAllText.includes('가까운 8건만 보기'), `잘림=${upcomingTruncated}`)
  // 리포트는 결재 첨부·감사 제출 문서다 — 표를 상위 N건으로 자르는 것 자체는 괜찮지만, 그 옆 문구가
  //  '자른 뒤의 배열 길이'를 총계처럼 말하면 문서에 틀린 수가 실린다(갱신 전망이 40건 중 15건을 싣고
  //  '만료 예정 15건'이라 적고 있었다 — 예산 계획이 그 수를 근거로 잡힌다).
  const reportRowCaps = [...reportsSrc.matchAll(/.slice(0, ([0-9]+))/g)].map((m) => m[1])
  check('리포트: 표를 자르는 수를 숫자로 박아 두지 않는다(문구와 갈리지 않게 상수로)',
    reportRowCaps.length === 0, `숫자 리터럴 잘림=${reportRowCaps.join(', ')}`)
  // 잘린 표의 문구는 전체 건수를 말해야 한다 — 자른 배열의 length 를 그대로 적는 형태를 막는다.
  check('리포트: 잘림 문구가 자른 뒤 건수를 총계처럼 적지 않는다',
    !reportsSrc.includes('(최대 ') && reportsSrc.includes('soonAll.length'))
  // 외부 위협 조치는 역할만 보고 권한 매트릭스를 보지 않았다 — 같은 메뉴('발견 자산 · CMDB 대사')의 편입·격리는
  //  이미 매트릭스를 보고 있어, 한 메뉴의 절반만 정책이 먹는 상태였다. 권한 · 정책에서 격리요청을 꺼도 조치가 나갔다.
  const extActionsSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'discovery', 'external', 'actions.ts'), 'utf8')
  const extRoleGates = extActionsSrc.split("['SEC_MGR', 'ADMIN'].includes(session.role)").length - 1
  const extMatrixGates = extActionsSrc.split("can('발견 자산 · CMDB 대사', '격리요청', session.role)").length - 1
  check('외부 위협 조치: 역할 가드마다 권한 매트릭스 가드가 함께 있다',
    extRoleGates > 0 && extMatrixGates >= extRoleGates, `역할 가드 ${extRoleGates} · 매트릭스 가드 ${extMatrixGates}`)
  // 화면도 같은 판정을 써야 한다 — 매트릭스에서 꺼진 역할에 조치 버튼을 내주면 눌러야 거절되는 막다른 길이 된다.
  const extPageSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'discovery', 'external', 'page.tsx'), 'utf8')
  check('외부 위협 화면: 조치 노출 판정이 서버 가드와 같은 매트릭스를 본다',
    extPageSrc.includes("can('발견 자산 · CMDB 대사', '격리요청', session.role)"))
  // 발견 자산 화면의 다섯 조치 표(계정·미인가 SW·USB·로컬 VM·클라우드)도 같은 자리였다 — 같은 파일의
  //  편입·격리는 매트릭스를 보는데 이 열넷은 역할만 봤다.
  const fndActionsSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'discovery', 'actions.ts'), 'utf8')
  const fndRoleGates = fndActionsSrc.split("['SEC_MGR', 'ADMIN'].includes(session.role)").length - 1
  const fndMatrixGates = fndActionsSrc.split("can('발견 자산 · CMDB 대사', '격리요청', session.role)").length - 1
  check('발견 자산 조치: 역할 가드마다 권한 매트릭스 가드가 함께 있다',
    fndRoleGates > 0 && fndMatrixGates >= fndRoleGates, `역할 가드 ${fndRoleGates} · 매트릭스 가드 ${fndMatrixGates}`)
  const fndPageSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'discovery', 'found', 'page.tsx'), 'utf8')
  check('발견 자산 화면: 조치 표 노출 판정이 서버 가드와 같은 매트릭스를 본다',
    fndPageSrc.includes('&& canQuarantine'))

  // 반납·유휴 화면은 표가 셋인데 '반납 접수 대기' 카드만 건수를 적지 않았다 — 형제 두 카드(수리 대기 N건 ·
  //  대여 현황 N건)는 적는다. 대시보드 큐가 세는 집합이 바로 그 표라, 큐가 말한 수를 화면에서 맞대 볼 자리가 없었다.
  // 큐 건수에는 data-queue 표식이 붙어 태그가 사이에 낀다 — 태그를 걷어낸 뒤 문구를 읽는다
  const retHtmlP = (await (await get('/assets/returns', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')
  const retPendingShown = Number((/반납 접수 대기 ([0-9]+)건/.exec(retHtmlP) || [])[1] ?? -1)
  const retPendingQueue = queueCount('반납 접수 대기')
  check("반납 접수 대기 큐: 건수 = 카드가 적는 건수",
    retPendingQueue > 0 && retPendingQueue === retPendingShown, `큐 ${retPendingQueue} · 표시 ${retPendingShown}`)
  // 표가 여럿인 화면이라 큐 링크가 자기 표로 바로 내려가야 한다(앵커).
  check('반납·유휴 큐: 링크가 해당 표 앵커로 내려간다',
    dashMgr.includes('/assets/returns#receive') && dashMgr.includes('/assets/returns#repair'))
  // 불출·이동 화면도 같은 자리였다 — 사이 카드(배정 가능 재고 N건)는 건수를 적는데 처리 대기 두 카드만
  //  안 적었다. 큐는 둘의 합을 세므로, 두 카드 건수를 더해 큐와 맞댄다.
  const movHtml = (await (await get('/assets/movement', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')
  const movIssue = Number((/불출 대기 ([0-9]+)건/.exec(movHtml) || [])[1] ?? -1)
  const movMove = Number((/이동 대기 ([0-9]+)건/.exec(movHtml) || [])[1] ?? -1)
  const movQueue = queueCount('불출 · 이동 집행 대기')
  check("불출·이동 큐: 건수 = 두 처리 대기 카드 건수의 합",
    movQueue > 0 && movIssue >= 0 && movMove >= 0 && movQueue === movIssue + movMove,
    `큐 ${movQueue} · 불출 ${movIssue} + 이동 ${movMove}`)
  check('불출·이동 큐: 링크가 처리 대기 표 앵커로 내려간다', dashMgr.includes('/assets/movement#issue'))
  // 안전재고 큐는 유형(종) 단위로 센다 — 경보 카드가 적는 종 수와 맞댄다. 이 큐는 파라미터 없는 링크라
  //  전수 스윕(파라미터 붙은 링크만 대상)에는 들어오지 않으므로 여기서 따로 고정한다.
  const stockAlertHtml = (await (await get('/inventory/stock', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')
  const stockAlertShown = Number((/가용 재고 부족 ([0-9]+)종/.exec(stockAlertHtml) || [])[1] ?? -1)
  const stockQueue = queueCount('안전재고 미달')
  check("안전재고 큐: 건수 = 경보 카드가 적는 유형 수",
    stockQueue > 0 && stockQueue === stockAlertShown, `큐 ${stockQueue} · 표시 ${stockAlertShown}`)
  check('안전재고 큐: 링크가 경보 카드 앵커로 내려간다', dashMgr.includes('/inventory/stock#alert'))
  // 재물조사 계획 화면으로도 큐가 둘 들어온다(기한 경과 · 장기 미실측 편성 대기) — 카드가 셋이라 앵커가 없으면
  //  어느 표를 보라는 것인지 화면이 말해 주지 않는다. 기한 경과는 회차 표, 편성 대기는 자동 편성 카드다.
  check('재물조사 두 큐: 링크가 각자 자기 카드 앵커로 내려간다',
    dashMgr.includes('/inventory/survey-plan#rounds') && dashMgr.includes('/inventory/survey-plan#stale'))
  // 회차 표도 자기 건수를 적는다 — 기한 경과 큐가 세는 회차가 이 표에 있다(형제 카드와 같은 규약).
  const planPlain2 = planHtml.replace(/<!-- -->/g, '')
  const roundsShown = Number((/조사 회차 ([0-9]+)건/.exec(planPlain2) || [])[1] ?? -1)
  check("재물조사 회차 표: 자기 건수를 적는다(기한 경과 큐를 맞대 볼 자리)",
    roundsShown > 0, `표시 ${roundsShown}`)
  // 대시보드 KPI '미등록 신규 발견'은 미등록 중 '미조치'만 센다(편입 요청·관리 제외된 건은 빠진다).
  //  그런데 화면엔 그 축의 필터가 없어 KPI 를 눌러도 조치가 끝난 건까지 섞인 목록이 열렸다 —
  //  큐에서 닫은 것과 같은 결함이 KPI 타일에 남아 있었다.
  const kpiHtml = (await (await get(`/discovery/found?state=${encodeURIComponent('미등록')}&act=open`, 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const kpiShown = Number((new RegExp("([0-9]+)건 \/ 전체 ([0-9]+)건").exec(kpiHtml) || [])[1] ?? -1)
  const dashPlainK = dashMgr.replace(/<!-- -->/g, '')
  const kpiAt = dashPlainK.indexOf('미등록 신규 발견')
  const kpiNum = Number(([...dashPlainK.slice(Math.max(0, kpiAt - 400), kpiAt).matchAll(/>([0-9]+)</g)].pop() || [])[1] ?? -1)
  check("미등록 신규 발견 KPI: 수 = 링크가 여는 목록의 표시 건수",
    kpiNum > 0 && kpiNum === kpiShown, `KPI ${kpiNum} · 표시 ${kpiShown}`)
  check('미등록 신규 발견 KPI: 링크가 미등록·미조치 필터를 켠 채 연다', dashMgr.includes('act=open'))
  // 결재 대기 타일은 결재함 화면과 같은 조회 스코프를 써야 한다 — USER 는 본인 상신분만 본다.
  //  결재함은 목록도 타일도 그 스코프를 지키는데 대시보드 타일만 전사 집계를 써, 같은 누출이 한 화면 앞에 남아 있었다.
  const aprUserDash = (await (await get('/dashboard', 'USER')).text()).replace(/<!-- -->/g, '')
  const aprScreenUser = (await (await get('/workflow/approvals', 'USER')).text()).replace(/<!-- -->/g, '')
  const tileNum = (html, label) => {
    const at = html.indexOf(label)
    if (at === -1) return -1
    const before = html.slice(Math.max(0, at - 400), at)
    const m = [...before.matchAll(/>([0-9]+)</g)].pop()
    return m ? Number(m[1]) : -1
  }
  const aprDashUser = tileNum(aprUserDash, '결재 대기')
  const aprScreenNum = tileNum(aprScreenUser, '결재 대기')
  check("결재 대기 타일(사용자): 대시보드 수 = 결재함 화면 수(같은 조회 스코프)",
    aprDashUser >= 0 && aprDashUser === aprScreenNum, `대시보드 ${aprDashUser} · 결재함 ${aprScreenNum}`)
  // 양성 대조 — 담당자는 전사를 보므로 사용자보다 크거나 같다(스코핑이 실제로 걸린다는 확인).
  const aprDashMgr = tileNum(dashMgr.replace(/<!-- -->/g, ''), '결재 대기')
  check("결재 대기 타일: 담당자 수 ≥ 사용자 수(스코핑 실효 확인)",
    aprDashMgr >= aprDashUser && aprDashMgr > 0, `담당자 ${aprDashMgr} · 사용자 ${aprDashUser}`)
  // 화면 접근 판정(canViewMenu)은 매핑이 없는 경로를 '제한 없음'으로 통과시킨다(fail open). 그 기본값 자체는
  //  의도한 것이지만, 어느 화면이 그 위에 서 있는지가 코드 어디에도 적혀 있지 않아 새 화면을 내비에 붙이면서
  //  ROUTE_MENU 를 빠뜨리면 매트릭스를 조용히 우회한다(액션 가드에서 닫은 것과 같은 구멍).
  //  내비 화면은 하나도 빠짐없이 '매핑 ∪ 명시적 예외' 안에 있어야 한다.
  const permSrc = readFileSync(path.join(ROOT, 'lib', 'perm.ts'), 'utf8')
  const navSrcPerm = readFileSync(path.join(ROOT, 'components', 'chrome', 'menus.ts'), 'utf8')
  const navRoutes = [...new Set([...navSrcPerm.matchAll(/href: '([^']+)'/g)].map((m) => m[1]))]
  const routeMenuAt = permSrc.indexOf('export const ROUTE_MENU')
  const routeMenuBody = permSrc.slice(routeMenuAt, permSrc.indexOf('}', routeMenuAt))
  const exemptAt = permSrc.indexOf('export const MATRIX_EXEMPT_ROUTES')
  const exemptBody = exemptAt === -1 ? '' : permSrc.slice(exemptAt, permSrc.indexOf('}', exemptAt))
  const mapped = new Set([...routeMenuBody.matchAll(new RegExp(String.raw`'([/][^']+)':`, 'g'))].map((m) => m[1]))
  const exempt = new Set([...exemptBody.matchAll(new RegExp(String.raw`'([/][^']+)':`, 'g'))].map((m) => m[1]))
  const unguarded = navRoutes.filter((r) => !mapped.has(r) && !exempt.has(r))
  // 내비 화면 수집이 망가지면 대상이 0건이 되어 '어디에도 없음 없음'으로 조용히 통과한다 —
  //  수집량을 함께 요구해 그 무증상 실패를 막는다(헬스 스위트에서 이스케이프가 깨진 선택자가
  //  아무것도 매칭하지 않은 채 초록으로 통과한 적이 있다).
  check(`화면 접근 판정: 내비 화면 ${navRoutes.length}종이 모두 매트릭스 매핑 또는 명시적 예외에 있다(조용한 fail open 금지)`,
    unguarded.length === 0 && navRoutes.length >= 20, `매핑·예외 어디에도 없음=${unguarded.join(', ')} · 수집 화면 ${navRoutes.length}종`)
  // 예외 목록이 비어 있으면 위 검사가 '매핑만 확인'으로 조용히 약해진다 — 실제로 쓰이는지 함께 본다.
  check('화면 접근 판정: 예외 목록이 이유와 함께 명시돼 있다', exempt.size > 0)
  // 만료 임박 KPI 는 계약과 라이선스를 한 수로 합쳐 세는데 화면엔 그 합집합을 여는 필터가 없었다 —
  //  KPI 를 눌러도 전체 두 표가 열려, 수와 목록이 갈렸다. 이제 두 표를 같은 창으로 함께 좁히고 합계를 적는다.
  // 합계 숫자에 data-queue 표식이 붙어 태그가 사이에 낀다 — 태그를 걷어낸 뒤 문구를 읽는다
  const expHtml = (await (await get('/inventory/contracts?expiry=soon', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')
  const expSum = Number((/합계 ([0-9]+)건/.exec(expHtml) || [])[1] ?? -1)
  const dashPlainE = dashMgr.replace(/<!-- -->/g, '')
  const expAt = dashPlainE.indexOf('만료 임박 (계약·라이선스')
  const expKpi = Number(([...dashPlainE.slice(Math.max(0, expAt - 400), expAt).matchAll(/>([0-9]+)</g)].pop() || [])[1] ?? -1)
  check("만료 임박 KPI: 수 = 필터 화면이 적는 계약·라이선스 합계",
    expKpi > 0 && expKpi === expSum, `KPI ${expKpi} · 합계 ${expSum}`)
  check('만료 임박 KPI: 링크가 두 표를 함께 좁히는 필터로 연다', dashMgr.includes('/inventory/contracts?expiry=soon'))

  // 큐 건수 ↔ 드릴다운 목록 일치 — 전수 스윕.
  //  이 세션에 큐마다 손으로 짝을 적어 대조를 걸었는데, 그 방식은 새 큐가 생기면 조용히 빠진다.
  //  대시보드가 실제로 렌더한 큐 칩(라벨 + 숫자 + 링크)을 전부 읽어, 링크가 여는 화면이 스스로 적는
  //  'N / M건' 과 칩 숫자를 비교한다. 판정 기준을 여기 두지 않으므로(양쪽 화면이 각자 세고 우리는 맞대 볼 뿐)
  //  드릴다운을 새로 붙이면 자동으로 이 대조에 들어온다.
  //  대상은 파라미터가 붙은 링크로 한정한다 — 필터 없는 링크는 애초에 큐가 센 집합을 여는 약속을 하지 않는다.
  //  화면이 'N / M건' 을 한 번만 적는 경우에만 비교한다(여러 표가 같은 표기를 쓰면 어느 것과 맞대야 할지 알 수 없다).
  const sweepQueues = (html, role) => {
    const plain = html.replace(/<!-- -->/g, '')
    const out = []
    for (const m of plain.matchAll(new RegExp('href="(/[^"?]+\?[^"]+)"[^>]*>(.{0,400}?)</a>', 'gs'))) {
      const inner = m[2]
      const chip = /class="chip[^"]*">([0-9]+)</.exec(inner)
      if (!chip) continue
      const label = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/ [0-9]+$/, '')
      out.push({ href: m[1].replace(/&amp;/g, '&'), n: Number(chip[1]), label, role })
    }
    return out
  }
  // 전수의 범위 — 큐는 역할마다 다르게 뜬다. 자산담당 30개 · 보안담당 17개(합집합 47개)에 더해 Admin 은
  //  두 관리자 화면 어디에도 없는 큐를 갖는다(필독 공지 확인 미달 — 공지 관리가 Admin 전용이라). 그 한 개가
  //  스윕 밖에 있었는데도 검사 이름은 '전수'였다 — 이름이 범위를 과장하면 통과가 곧 보증으로 읽힌다.
  //  Admin 대시보드까지 넣어 이름과 범위를 맞춘다. 사용자(USER) 대시보드에는 운영 큐가 없어(0개) 대상이 없다.
  const dashAdminSweep = await (await get('/dashboard', 'ADMIN')).text()
  const sweepSeen = new Set()
  const sweepTargets = [...sweepQueues(dashMgr, 'ASSET_MGR'), ...sweepQueues(dashSec, 'SEC_MGR'), ...sweepQueues(dashAdminSweep, 'ADMIN')]
    .filter((q) => { const k = `${q.role} ${q.href}`; if (sweepSeen.has(k)) return false; sweepSeen.add(k); return true })
  // '전수'가 참인지 검사 자신이 확인한다 — 역할이 늘거나 그 역할에만 뜨는 큐가 생기면 위 목록에
  //  한 줄을 더해야 하는데, 안 더해도 검사는 조용히 통과하고 이름만 '전수'로 남는다(실제로 Admin 전용
  //  큐 하나가 그렇게 빠져 있었다). 네 역할 대시보드의 큐가 모두 스윕 대상에 들어 있는지 대조한다.
  const sweepRoleHtml = { ASSET_MGR: dashMgr, SEC_MGR: dashSec, ADMIN: dashAdminSweep, USER: await (await get('/dashboard', 'USER')).text() }
  const sweepUncovered = []
  for (const [role, html] of Object.entries(sweepRoleHtml)) {
    for (const q of sweepQueues(html, role)) {
      if (!sweepSeen.has(`${role} ${q.href}`)) sweepUncovered.push(`${role} ${q.href}`)
    }
  }
  check(`큐 스윕 범위: 네 역할 대시보드의 큐가 모두 스윕 대상(${sweepTargets.length}종)`,
    sweepUncovered.length === 0, `누락=${sweepUncovered.join(', ')}`)

  const sweepBad = []
  const sweepSkipped = []
  let sweepChecked = 0
  for (const q of sweepTargets) {
    const target = (await (await get(q.href, q.role)).text()).replace(/<!-- -->/g, '')
    // 화면마다 표기 형태가 다르다 — 세 가지를 받는다: 'N / M건'(조치 표) · 'N건 / 전체 M건'(발견 목록) ·
    //  'N건 표시'(필터 안내 배너). 한 화면에서 딱 한 번만 나올 때만 비교한다 — 여러 표가 같은 표기를 쓰면
    //  어느 것과 맞대야 할지 정할 수 없고, 억지로 첫 번째를 고르면 엉뚱한 표를 세게 된다(실제로 그렇게 틀린 적이 있다).
    const forms = [
      new RegExp('([0-9]+)건 / 전체 [0-9]+건', 'g'),
      new RegExp('([0-9]+) / [0-9]+건', 'g'),
      new RegExp('([0-9]+)건 표시', 'g'),
    ]
    // 표가 여럿인 화면은 어느 표와 맞대야 할지 형태만으로는 정할 수 없다 — 큐가 여는 표는 자기를 여는
    //  쿼리를 data-queue 로 달아 둔다(화면·검사가 같은 표식을 쓴다). 표식이 있으면 그 표의 건수를 바로 읽는다.
    // 표식 키 — 그 큐가 화면을 여는 방식 그대로다: 쿼리(?open=sw) · 앵커(#repair) · 없으면 경로(/discovery/scan).
    //  세 형태를 다 받아야 앵커·무인자 링크로 여는 큐도 표를 특정할 수 있다.
    const qs = decodeURIComponent(q.href.includes('?') ? q.href.split('?')[1]
      : q.href.includes('#') ? `#${q.href.split('#')[1]}`
      : q.href)
    // 표식은 공백으로 구분한 목록이다 — 한 표가 여러 큐를 받는다(라이선스 표는 초과·만료·미사용 세 큐가 연다).
    //  정규식 대신 문자열 탐색으로 찾는다: 쿼리에 정규식 특수문자가 섞여도 그대로 맞는다.
    //  표식이 붙은 요소의 첫 숫자가 곧 그 큐의 건수다 — 화면이 '무엇을 세어 보여 주는지'를 표식이 못박는다
    //  (좌석·설치처럼 라이선스 건수가 아니라 다른 단위를 세는 큐도 그 숫자에 표식을 단다).
    let markedText = ''
    if (qs) {
      for (const m of target.matchAll(new RegExp('data-queue="([^"]*)"[^>]*>([^<]*)', 'g'))) {
        if (m[1].replace(/&amp;/g, '&').split(' ').includes(qs)) { markedText = m[2]; break }
      }
    }
    const firstNum = /([0-9]+)/.exec(markedText)
    const hits = markedText
      ? (firstNum ? [Number(firstNum[1])] : [])
      : forms.flatMap((re) => [...target.matchAll(re)].map((m) => Number(m[1])))
    if (hits.length !== 1) { sweepSkipped.push(`${q.label} → ${q.href} (표기 ${hits.length}개)`); continue }
    sweepChecked++
    if (hits[0] !== q.n) sweepBad.push(`${q.label} → ${q.href}: 큐 ${q.n} ≠ 표시 ${hits[0]}`)
  }
  // '전수'라는 이름값을 한다 — 한 종이라도 대조하지 못하면 실패다. 그전에는 형태가 애매한 큐를 조용히
  //  건너뛰어 47종 중 12종만 보면서 초록으로 통과했다(이름이 실제 범위를 4배 과장했다).
  //  새 큐를 붙이면서 그 화면에 표식(data-queue)을 빠뜨리면 여기서 먼저 걸린다.
  check(`큐 드릴다운 전수: 큐 건수 = 링크가 여는 목록의 표시 건수(${sweepChecked}/${sweepTargets.length}종)`,
    sweepBad.length === 0 && sweepSkipped.length === 0 && sweepChecked >= 40,
    [...sweepBad, ...sweepSkipped.map((x) => `대조 불가: ${x}`)].join(' / ') || `대조한 큐 ${sweepChecked}종`)

  // KPI 타일 드릴다운 전수 — 큐와 같은 계약의 거울면이다. 큐는 '할 일 N건'을 세고 KPI 는 '현황 N건'을
  //  세는데, 둘 다 누르면 목록이 열린다. 열린 목록이 다른 수를 보여 주면 담당자는 어느 쪽을 믿을지 알 수 없다.
  //  큐 스윕이 쓰는 표식(data-queue)을 그대로 재사용한다 — 화면은 한 번만 표시하면 두 검사가 함께 쓴다.
  const sweepStats = (html, role) => {
    const plain = html.replace(/<!-- -->/g, '')
    const out = []
    for (const m of plain.matchAll(new RegExp('<a[^>]*class="stat[^"]*"[^>]*href="([^"]+)"[^>]*>(.{0,400}?)</a>', 'gs'))) {
      const v = /class="v">([0-9,]+)</.exec(m[2])
      const l = /class="l">([^<]*)</.exec(m[2])
      if (!v) continue  // 금액·비율 타일은 목록 건수와 축이 다르다
      out.push({ href: m[1].replace(/&amp;/g, '&'), n: Number(v[1].replace(/,/g, '')), label: l ? l[1] : '', role })
    }
    return out
  }
  //  범위는 큐 스윕과 같이 Admin 대시보드까지 넣는다 — 타일도 역할마다 다르게 뜨고, 두 관리자 화면에만
  //  기대면 Admin 전용 타일이 '전수'라는 이름 뒤에서 빠진다(큐에서 실제로 그랬다).
  const statSeen = new Set()
  const statTargets = [
    ...sweepStats(dashMgr, 'ASSET_MGR'),
    ...sweepStats(dashSec, 'SEC_MGR'),
    ...sweepStats(dashAdminSweep, 'ADMIN'),
    ...sweepStats(await (await get('/ai/insights', 'ASSET_MGR')).text(), 'ASSET_MGR'),
    ...sweepStats(await (await get('/settings/scan-policy', 'SEC_MGR')).text(), 'SEC_MGR'),
  ]
    .filter((t) => { const k = `${t.role} ${t.href}`; if (statSeen.has(k)) return false; statSeen.add(k); return true })
  const statBad = []
  const statSkipped = []
  for (const t of statTargets) {
    const target = (await (await get(t.href, t.role)).text()).replace(/<!-- -->/g, '')
    // 링크의 쿼리는 URL 인코딩돼 있다 — 표식은 화면이 읽는 원문이므로 디코딩해 맞댄다
    const rawKey = t.href.includes('?') ? t.href.split('?')[1] : t.href.includes('#') ? `#${t.href.split('#')[1]}` : t.href
    const key = decodeURIComponent(rawKey)
    let markedText = ''
    for (const m of target.matchAll(new RegExp('data-queue="([^"]*)"[^>]*>([^<]*)', 'g'))) {
      if (m[1].replace(/&amp;/g, '&').split(' ').includes(key)) { markedText = m[2]; break }
    }
    const num = /([0-9]+)/.exec(markedText)
    if (!num) { statSkipped.push(`${t.label} → ${t.href}`); continue }
    if (Number(num[1]) !== t.n) statBad.push(`${t.label} → ${t.href}: KPI ${t.n} ≠ 표시 ${num[1]}`)
  }
  // 큐와 같은 규약 — 표식이 없어 대조하지 못한 타일도 실패로 본다(이름이 실제 범위를 넘지 않게)
  check(`KPI 드릴다운 전수: 타일 수 = 링크가 여는 목록의 표시 건수(${statTargets.length - statSkipped.length}/${statTargets.length}종)`,
    statBad.length === 0 && statSkipped.length === 0 && statTargets.length >= 5,
    [...statBad, ...statSkipped.map((x) => `대조 불가: ${x}`)].join(' / ') || `대조한 타일 ${statTargets.length}종`)
  // 분석 화면의 네 패널이 모두 상위 12건에서 끊긴다 — 잘렸다고 적기만 하고 넘어갈 길이 없으면 그 뒤 항목은
  //  화면 어디에서도 볼 수 없다. 잘림 안내마다 등급 필터든 전체 목록 링크든 경로가 붙어 있어야 한다.
  const cutNotes = [...vulnPlain.matchAll(/… 외 [0-9]+[건대]/g)].map((m) => m.index ?? -1)
  const cutBad = cutNotes.filter((i) => {
    const after = vulnPlain.slice(i, i + 300)
    return !(after.includes('전량을 볼 수 있습니다') || after.includes('전체 보기'))
  })
  check(`분석 패널: 잘림 안내 ${cutNotes.length}건 모두 남은 항목으로 가는 길이 있다(조용한 잘림 금지)`,
    cutBad.length === 0, `길 없는 잘림 안내=${cutBad.length}/${cutNotes.length}`)
  // 이상 탐지도 심각도 필터로 그 등급 전량을 연다(취약점 우선순위와 같은 규약).
  const anomHtml = (await (await get('/ai/insights?anom=' + encodeURIComponent('높음'), 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const anomAt = anomHtml.indexOf('이상 자산 행위 탐지 — 평시 프로파일 대비 이탈')
  const anomCard = anomAt === -1 ? '' : anomHtml.slice(anomAt, anomAt + 20000)
  const anomShown = Number((new RegExp("이상탐지 · ([0-9]+) \/ ([0-9]+)건").exec(anomCard) || [])[1] ?? -1)
  check('이상 탐지: 심각도 필터 진입점 노출', anomCard.includes('/ai/insights?anom='))
  check('이상 탐지: 심각도 필터가 그 등급만 연다(전체보다 작거나 같음)',
    anomShown >= 0 && anomShown <= (Number((new RegExp("이상탐지 · [0-9]+ \/ ([0-9]+)건").exec(anomCard) || [])[1] ?? -1)),
    `표시 ${anomShown}`)
  // 재탐지 지연 두 큐 — 화면에는 행마다 배지가 붙지만 몇 건이 밀렸는지 적힌 곳이 없어 큐가 말한 수를
  //  화면에서 대조할 수가 없었다. 이제 두 화면이 같은 판정(lib/scan-policy · lib/easm)으로 지표를 낸다.
  //  Stat 은 값이 라벨보다 먼저 렌더되므로 라벨 앞 구간에서 숫자를 읽는다.
  const statBefore = (html, label) => {
    const plain = html.replace(/<!-- -->/g, '')
    const at = plain.indexOf(label)
    if (at === -1) return -1
    const before = plain.slice(Math.max(0, at - 400), at)
    const m = [...before.matchAll(/>([0-9]+)</g)]
    return m.length ? Number(m[m.length - 1][1]) : -1
  }
  const scanKpiHtml = await (await get('/discovery/scan', 'SEC_MGR')).text()
  const scanOverdueQueue = secQueueCount('탐지 채널 재탐지 주기 경과 (수집 지연 · Discovery 사각)')
  const scanOverdueShown = statBefore(scanKpiHtml, '재탐지 주기 경과 채널')
  check("탐지 채널 재탐지 경과 큐: 건수 = 화면 지표", scanOverdueQueue > 0 && scanOverdueQueue === scanOverdueShown, `큐 ${scanOverdueQueue} · 화면 ${scanOverdueShown}`)
  const extKpiHtml = await (await get('/discovery/external', 'SEC_MGR')).text()
  const easmOverdueQueue = secQueueCount('외부 공격표면 재탐지 기한 경과 (재탐지 지연 · Discovery 사각)')
  const easmOverdueShown = statBefore(extKpiHtml, '재탐지 기한 경과 대상')
  check("외부 공격표면 재탐지 경과 큐: 건수 = 화면 지표", easmOverdueQueue > 0 && easmOverdueQueue === easmOverdueShown, `큐 ${easmOverdueQueue} · 화면 ${easmOverdueShown}`)
  // 소유자 확인 미응답 큐 — 에스컬레이션 바가 '기한 경과 N건'을 세지만 그 아래 발견 목록에는 그 집합을 여는
  //  필터가 없어, 큐가 말한 건을 전체 발견 목록에서 눈으로 찾아야 했다. 판정(운영 정책 기한)은 서버가 준다.
  const awaitHtml = (await (await get('/discovery/found?await=overdue', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  // 라벨에 운영 정책 일수가 박혀 있어 접두어로 찾는다(정책이 바뀌어도 검사가 따라간다).
  const awaitQueue = secQueueCount('소유자 확인 미응답 (')
  const awaitShown = Number((new RegExp("([0-9]+)건 \/ 전체 ([0-9]+)건").exec(awaitHtml) || [])[1] ?? -1)
  check("소유자 확인 미응답 큐: 건수 = 확인 미응답만 보기 표시 건수",
    awaitQueue > 0 && awaitQueue === awaitShown, `큐 ${awaitQueue} · 표시 ${awaitShown}`)
  check("소유자 확인 미응답 큐: 링크가 그 필터를 켠 채 연다", dashSec.includes('/discovery/found?await=overdue'))
  // 필터 없이 열면 응답 대기·처리 완료 건까지 보인다(필터 실효 확인).
  const foundPlain = (await (await get('/discovery/found', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const foundPlainShown = Number((new RegExp("([0-9]+)건 \/ 전체 ([0-9]+)건").exec(foundPlain) || [])[1] ?? -1)
  check("발견 목록: 필터 없이 열면 미응답 밖의 발견까지 표시(필터 실효 확인)",
    foundPlainShown > awaitShown, `전체 ${foundPlainShown} · 미응답 ${awaitShown}`)
  // 수집 커넥터 저하 큐 — 정상 커넥터까지 함께 쌓이는 표라 큐가 말한 건수를 화면에서 다시 세어야 했다.
  //  KPI 도 지연만 세어 큐(지연+오류)와 갈렸다 — 이제 같은 묶음을 쓰고 링크가 저하만 보기를 켠 채 연다.
  const connHtml = (await (await get('/platform/integrations?conn=degraded', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  const connQueue = secQueueCount('수집 커넥터 지연·오류 (Discovery 저하 · 재연동)')
  const connAt = connHtml.indexOf('연동 대상 상세')
  const connShown = Number((new RegExp("([0-9]+) / ([0-9]+)건").exec(connAt === -1 ? "" : connHtml.slice(connAt)) || [])[1] ?? -1)
  check("수집 커넥터 저하 큐: 건수 = 저하만 보기 표시 건수", connQueue > 0 && connQueue === connShown, `큐 ${connQueue} · 표시 ${connShown}`)
  check("수집 커넥터 저하 큐: 링크가 저하만 보기를 켠 채 연다", dashSec.includes('/platform/integrations?conn=degraded'))
  // KPI 도 큐와 같은 묶음을 센다 — 그전엔 지연만 세어 오류 커넥터가 KPI 에서 빠졌다.
  check("연동 화면 KPI: 저하 커넥터가 지연·오류를 함께 센다", connHtml.includes('저하 커넥터 — 지연 · 오류'))
  // 통지·감사 로그의 참조 ID 딥링크(lib/reflink)도 같은 필터를 켠 채 연다 — 표를 다섯·네 개씩 쌓은 화면으로
  //  그냥 보내면 통지가 가리킨 그 건을 스크롤해 찾아야 한다. 여기서는 reflink 가 적어 둔 ?open= 값이 화면이
  //  실제로 알아듣는 값인지 확인한다(한쪽만 이름을 바꾸면 링크가 조용히 필터 없는 화면으로 떨어진다).
  const reflinkSrc = readFileSync(path.join(ROOT, 'lib', 'reflink.ts'), 'utf8')
  const opensOf = (constName) => {
    const at = reflinkSrc.indexOf(constName)
    if (at === -1) return []
    const line = reflinkSrc.slice(at, reflinkSrc.indexOf(String.fromCharCode(10), at))
    return [...line.matchAll(/: '([a-z]+)'/g)].map((m) => m[1])
  }
  const openBad = []
  for (const [screen, constName] of [['/discovery/found', 'FOUND_TABLE'], ['/discovery/external', 'EXTERNAL_TABLE']]) {
    const opens = opensOf(constName)
    if (opens.length === 0) { openBad.push(`${constName} 매핑 없음`); continue }
    for (const v of opens) {
      const html = (await (await get(`${screen}?open=${v}`, 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
      if (!html.includes('✓ 미조치만')) openBad.push(`${screen}?open=${v}`)
    }
  }
  check('통지 딥링크: reflink 의 ?open= 값이 모두 화면이 아는 값(미조치 필터가 켜진다)', openBad.length === 0, `안 먹는 값=${openBad.join(', ')}`)
  // 양성 대조 — 알 수 없는 값이면 어떤 표도 필터되지 않는다(위 검사가 무조건 통과하는 게 아님을 보인다).
  const bogusOpen = (await (await get('/discovery/found?open=nope', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  check('통지 딥링크: 알 수 없는 ?open= 값은 어떤 표도 필터하지 않는다(대조)', !bogusOpen.includes('✓ 미조치만'))
  // CMDB 대사 화면의 상태별 건수 ↔ 발견 처리 화면 드릴다운 — 대사 표가 "미등록 8건"이라 말하면 그 링크가 여는
  //  목록도 8건이어야 한다. 두 화면이 각자 집계하므로(대사는 s.discovered 직접, 발견 화면은 필터 상태) 조용히 갈릴 수 있다.
  const recPlain = (await (await get('/discovery/reconcile', 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
  // 상단 파이프라인 설명에도 '미등록' 같은 낱말이 있으므로 결과 표 구간부터 찾는다.
  const recTable = recPlain.slice(recPlain.indexOf('대사 결과별 처리'))
  const recCount = (state) => {
    const at = recTable.indexOf(`>${state}</span>`)
    if (at === -1) return -1
    const m = new RegExp('class="num tnum"[^>]*>([0-9]+)<').exec(recTable.slice(at, at + 300))
    return m ? Number(m[1]) : -1
  }
  const foundShown = async (state) => {
    const html = (await (await get('/discovery/found?state=' + encodeURIComponent(state), 'SEC_MGR')).text()).replace(/<!-- -->/g, '')
    const m = new RegExp("([0-9]+)건 \/ 전체 ([0-9]+)건").exec(html)
    return m ? Number(m[1]) : -1
  }
  const recBad = []
  for (const st of ['미등록', '등록·불일치', '미확인']) {
    const want = recCount(st)
    const got = await foundShown(st)
    if (want < 0 || want !== got) recBad.push(`${st}: 대사 ${want} ≠ 목록 ${got}`)
  }
  check("CMDB 대사: 상태별 건수 = 발견 처리 화면 드릴다운 목록 건수", recBad.length === 0, recBad.join(" / "))

  // 분석 패널로만 보내던 두 큐 — 교체 대상·미사용 라이선스는 대장(?replace=1)·계약 화면(?lic=under)에 같은 판정의
  //  필터가 이미 있는데도 /ai/insights 로만 보내, 큐가 말한 14건·2건을 화면에서 다시 찾아야 했다(패널은 상위 N만 보여 준다).
  const licUnderHtml = await (await get('/inventory/contracts?lic=under', 'ASSET_MGR')).text()
  // 계약 표·라이선스 표가 각각 "N건 / 전체 M건"을 적으므로 라이선스 카드 이후 구간에서 찾는다(첫 매칭은 계약 표다).
  const licPlain = licUnderHtml.replace(/<!-- -->/g, "")
  const licCardAt = licPlain.indexOf("SW 라이선스 보유 – 사용 대사")
  const licUnderShown = Number((new RegExp("([0-9]+)건 \\/ 전체").exec(licCardAt === -1 ? "" : licPlain.slice(licCardAt)) || [])[1] ?? -1)
  const licUnderQueue = queueCount('미사용 라이선스 회수 후보 (비용 절감)')
  check("분석 큐 드릴다운: 미사용 라이선스 큐 건수 = 계약 화면 필터 표시 건수",
    licUnderQueue > 0 && licUnderQueue === licUnderShown, `큐 ${licUnderQueue} · 표시 ${licUnderShown}`)
  check("분석 큐 드릴다운: 교체 대상 큐가 대장 교체 필터(?replace=1)로 연결",
    dashMgr.includes('/assets/register?replace=1'))

  // 배정 밖 설치(무단 사용) 큐 — 큐는 '설치 건수'를 세므로 화면 필터 문구도 같은 축(설치 N건)을 적어야 한다
  //  (라이선스 건수와 다르다: 한 라이선스에 배정 밖 설치가 여럿 붙는다).
  const offSeatHtml = (await (await get('/inventory/contracts?seat=off', 'ASSET_MGR')).text()).replace(/<!-- -->/g, "").replace(/<[^>]*>/g, "")
  const offSeatQueue = queueCount('라이선스 배정 밖 설치 (무단 사용 · SAM 리스크)')
  const offSeatAt = offSeatHtml.indexOf('배정 밖 설치(무단 사용) 필터')
  const offSeatShown = Number((/· 설치 ([0-9]+)건/.exec(offSeatAt === -1 ? '' : offSeatHtml.slice(offSeatAt, offSeatAt + 600)) || [])[1] ?? -1)
  check("계약 화면 드릴다운: 배정 밖 설치 큐가 무단 사용 필터로 연결",
    dashMgr.includes('/inventory/contracts?seat=off') && offSeatHtml.includes('배정 밖 설치(무단 사용) 필터'))
  check("계약 화면 드릴다운: 배정 밖 설치 큐 건수 = 필터 화면 표시 설치 건수",
    offSeatQueue > 0 && offSeatQueue === offSeatShown, `큐 ${offSeatQueue} · 표시 ${offSeatShown}`)
  check("계약 화면 드릴다운: 발주 미이행 큐가 이행 위험 필터(?proc=risk)로 연결",
    dashMgr.includes('/inventory/contracts?proc=risk'))
  const seatHtml = await (await get('/inventory/contracts?seat=unused', 'ASSET_MGR')).text()
  check("계약 화면 드릴다운: 미설치 좌석 큐가 회수 후보만 여는 필터로 연결",
    dashMgr.includes('/inventory/contracts?seat=unused') && seatHtml.includes('미설치 좌석(회수 후보) 필터'))
  // 필터가 걸린 빈 표는 이유를 말해야 한다 — 큐를 눌러 들어왔는데 아무것도 없으면 사용자는 화면이 고장난 줄 안다.
  //  '원래 없음'과 '필터로 가려짐'을 가른다(시드에는 반환 임박 대여가 없어 ?loan=임박 이 그 상황을 만든다).
  const emptyFilterHtml = (await (await get('/assets/returns?loan=' + encodeURIComponent('임박'), 'ASSET_MGR')).text()).replace(/<!-- -->/g, '')
  const loanCardAt = emptyFilterHtml.indexOf('대여 현황')
  check("필터 빈 표: 걸러진 결과가 없으면 사유를 밝힌다(대여 임박 필터)",
    loanCardAt !== -1 && emptyFilterHtml.slice(loanCardAt, loanCardAt + 4000).includes('필터에 맞는 항목이 없습니다'))
  // 필터 없는 화면에서는 원래 문구가 그대로여야 한다(양성 대조 — 필터 문구가 모든 빈 표를 덮어쓰지 않는다).
  const plainReturns = (await (await get('/assets/returns', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '')
  check("필터 빈 표(양성 대조): 필터 없는 화면은 원래 안내 문구를 쓴다",
    !plainReturns.includes('필터에 맞는 항목이 없습니다'))

  // 입고 화면의 두 큐(검수 대기·검수 반려)도 검수 완료·반품까지 함께 쌓이는 목록을 통째로 열던 것을 필터로 연다.
  const intakePairs = [
    ['입고 검수 대기', 'inspect'],
    ['검수 반려 (재검수 · 반품 확인)', 'rejected'],
  ]
  const intakeBad = []
  for (const [label, key] of intakePairs) {
    const want = queueCount(label)
    if (want < 0) continue
    const html = await (await get(`/assets/intake?lot=${key}`, 'ASSET_MGR')).text()
    const shown = cardShown(html, '입고 목록')
    if (want !== shown) intakeBad.push(`${label}: 큐 ${want} ≠ 표시 ${shown}`)
  }
  check("입고 큐: 건수 = 필터 화면 표시 건수", intakeBad.length === 0, intakeBad.join(" / "))
  // 대시보드 '장기 미실측' 큐는 미실측 전량을 세고 화면·자동 편성 액션은 '편성 대기'(아직 회차에 안 묶인 건)를
  //  써서, 편성을 눌러 대상을 모두 회차로 묶어도 큐 건수가 그대로 남았다 — 처리해도 줄지 않는 큐였다.
  //  이제 셋 다 lib/survey 의 같은 집합을 본다.
  const planPlain = planHtml.replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '')
  const staleQueue = queueCount('장기 미실측 (재물조사 편성 대기)')
  // 이 화면에는 '편성 대기 N건' 칩이 둘이다(대사 미확인 카드가 먼저 온다) — 장기 미실측 카드 구간부터 찾는다.
  const staleCardAt = planPlain.indexOf('장기 미실측(실사 기반 유령) 자산 자동 편성')
  const staleCard = staleCardAt === -1 ? '' : planPlain.slice(staleCardAt, staleCardAt + 2500)
  const stalePendingShown = Number((/편성 대기 ([0-9]+)건/.exec(staleCard) || [])[1] ?? (staleCard.includes('편성 완료') ? 0 : -1))
  check("장기 미실측 큐: 건수 = 계획 화면의 편성 대기 건수",
    staleQueue >= 0 && staleQueue === stalePendingShown, `큐 ${staleQueue} · 화면 ${stalePendingShown}`)
  // 편성 대기는 미실측 전량의 부분집합이어야 한다(카드가 두 수를 나란히 적는다).
  const staleTotalShown = Number((/장기 미실측 ([0-9]+)건/.exec(staleCard) || [])[1] ?? -1)
  check("장기 미실측: 편성 대기는 전량의 부분집합", staleTotalShown >= stalePendingShown && staleTotalShown > 0,
    `전량 ${staleTotalShown} · 편성 대기 ${stalePendingShown}`)
  // 데이터 소거 대기 큐 — 결재를 받고 집행만 남은 건이다. 화면 상태 필터에는 '진행중'(완료가 아닌 전부)까지만
  //  있어 대상 선정 단계가 섞였고, 큐 링크도 필터 없이 떨어져 큐가 말한 건수를 화면에서 다시 세어야 했다.
  const wipeHtml = (await (await get('/assets/disposal?status=wipe', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '')
  const wipeQueue = queueCount('데이터 소거 대기')
  const wipeShown = cardShown(wipeHtml, '폐기 처리 현황')
  check("데이터 소거 대기 큐: 건수 = 소거 대기 필터 표시 건수",
    wipeQueue > 0 && wipeQueue === wipeShown, `큐 ${wipeQueue} · 표시 ${wipeShown}`)
  check("데이터 소거 대기 큐: 링크가 소거 대기 필터를 켠 채 연다", dashMgr.includes('/assets/disposal?status=wipe'))
  // 필터 없이 열면 대상 선정·완료까지 보인다(필터 실효 확인).
  const dispPlainShown = cardShown(await (await get('/assets/disposal', 'ASSET_MGR')).text(), '폐기 처리 현황')
  check("폐기 처리 현황: 필터 없이 열면 다른 단계까지 표시(필터 실효 확인)",
    dispPlainShown > wipeShown, `전체 ${dispPlainShown} · 소거 대기 ${wipeShown}`)
  // 세 번째 입고 큐(도입 예정 입고 지연)는 검수 표가 아니라 그 위 '도입 예정' 표에 산다 — 아직 도착 전이라
  //  검수 대상이 아니기 때문이다. 그래서 ?lot=inspect·rejected 로는 좁혀지지 않았고, 링크가 필터 없이 떨어져
  //  도착 예정일이 남은 로트까지 섞인 표에서 지연 건을 눈으로 세어야 했다.
  const intakeOverdueHtml = (await (await get('/assets/intake?lot=overdue', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '')
  const intakeOverdueQueue = queueCount('도입 예정 입고 지연 (SR·발주 독촉)')
  const intakeOverdueShown = cardShown(intakeOverdueHtml, '도입 예정 — ITSM SR·발주 연계')
  check("도입 예정 입고 지연 큐: 건수 = 지연만 보기 표시 건수",
    intakeOverdueQueue > 0 && intakeOverdueQueue === intakeOverdueShown, `큐 ${intakeOverdueQueue} · 표시 ${intakeOverdueShown}`)
  check("도입 예정 입고 지연 큐: 링크가 지연만 보기를 켠 채 연다", dashMgr.includes('/assets/intake?lot=overdue'))
  // 필터 없이 열면 도입 예정 전량이 보인다 — 표가 스스로 적는 '표시 / 전체'의 전체가 카드 제목의 건수와 같아야 한다.
  //  (시드에는 도입 예정 로트가 지연 1건뿐이라 '전체 > 지연'으로는 필터 실효를 못 가른다 — 정상 납기 로트가
  //   생기면 위 큐 대조가 곧바로 그 차이를 잡는다.)
  const intakePlain = (await (await get('/assets/intake', 'ASSET_MGR')).text()).replace(/<!-- -->/g, '')
  const intakePlainShown = cardShown(intakePlain, '도입 예정 — ITSM SR·발주 연계')
  const intakePlannedAt = intakePlain.indexOf('도입 예정 — ITSM SR·발주 연계')
  const intakePlannedTotal = Number((/(([0-9]+))/.exec(intakePlain.slice(intakePlannedAt, intakePlannedAt + 200)) || [])[1] ?? -1)
  check("도입 예정 표: 필터 없이 열면 도입 예정 전량 표시",
    intakePlannedTotal > 0 && intakePlainShown === intakePlannedTotal && intakePlannedTotal >= intakeOverdueShown,
    `표시 ${intakePlainShown} · 카드 ${intakePlannedTotal} · 지연 ${intakeOverdueShown}`)

  // 반납·수리 화면의 세 큐(대여 연체·반환 임박·수리 예상 반환 경과)도 정상 건까지 함께 보여 주는 표를 통째로
  //  열던 것을 해당 필터를 켠 채 연다. 판정은 큐·독촉과 같은 lib/dates 에서 온다.
  const retPairs = [
    ['대여 반환 연체 (반환 독촉)', 'loan=' + encodeURIComponent('연체'), '대여 현황'],
    ['대여 반환 임박 (D-7 · 사전 안내)', 'loan=' + encodeURIComponent('임박'), '대여 현황'],
    ['수리 예상 반환 경과 (업체 독촉)', 'repair=overdue', '수리 대기'],
  ]
  const retBad = []
  let retChecked = 0
  for (const [label, qs, cardTitle] of retPairs) {
    const want = queueCount(label)
    // 대상이 0 이면 대시보드가 큐 자체를 내지 않는다(시드에 반환 임박 대여가 없다) — 검사 대상에서 제외한다.
    if (want < 0) continue
    retChecked++
    const html = await (await get(`/assets/returns?${qs}`, 'ASSET_MGR')).text()
    const shown = cardShown(html, cardTitle)
    if (want !== shown) retBad.push(`${label}: 큐 ${want} ≠ 표시 ${shown}`)
  }
  check(`반납·수리 큐: 건수 = 필터 화면 표시 건수(${retChecked}종)`, retBad.length === 0 && retChecked >= 2, retBad.join(" / ") || `검사한 큐 ${retChecked}종`)

  // 외부 위협 네 큐(유출·크리덴셜·IOC·외부 노출)도 조치 완료분까지 쌓이는 표를 통째로 열던 것을 미조치만 보기로 연다.
  const extPairs = [
    ['유출 · 침해 미조치', 'leaks', '위협 인텔리전스 · 유출 수집'],
    ['크리덴셜 노출 미조치 (인증 취약점)', 'creds', '인증 취약점 점검'],
    ['IOC 상관 미조치 (위협 인텔·침해 징후)', 'ioc', '위협 인텔리전스 — IOC 상관'],
    ['외부 노출 미조치', 'exposure', '외부 노출 자산'],
  ]
  const extBad = []
  for (const [label, key, cardTitle] of extPairs) {
    const html = await (await get(`/discovery/external?open=${key}`, 'SEC_MGR')).text()
    const shown = cardShown(html, cardTitle)
    const want = secQueueCount(label)
    if (want < 0 || want !== shown) extBad.push(`${label}: 큐 ${want} ≠ 표시 ${shown}`)
  }
  check("외부 위협 큐: 건수 = 미조치만 보기 표시 건수(4종)", extBad.length === 0, extBad.join(" / "))

  // 필독 공지 확인 미달 큐 — 공지 목록은 확인이 끝난 공지·일반 공지까지 함께 쌓이므로, 큐가 말한 건수를
  //  화면에서 다시 세어야 했다. 큐 링크가 확인 미달만 보기를 켠 채 연다(판정은 큐와 같다).
  const noticeGapHtml = await (await get('/board/notices?gap=1', 'ADMIN')).text()
  const noticeAllHtml = await (await get('/board/notices', 'ADMIN')).text()
  const noticeShown = (html) => { const plain = html.replace(/<!-- -->/g, ''); const at = plain.indexOf('공지 목록'); return Number((new RegExp('([0-9]+)건 \/ 전체').exec(at === -1 ? plain : plain.slice(at)) || [])[1] ?? -1) }
  const dashAdmin = (await (await get('/dashboard', 'ADMIN')).text()).replace(/<!-- -->/g, '')
  const noticeQueueAt = dashAdmin.indexOf('필독 공지 확인 미달')
  const noticeQueue = Number((new RegExp('<span class="chip[^"]*">([0-9]+)').exec(noticeQueueAt === -1 ? "" : dashAdmin.slice(noticeQueueAt, noticeQueueAt + 900)) || [])[1] ?? -1)
  check("필독 공지 확인 미달 큐: 건수 = 확인 미달만 보기 표시 건수",
    noticeQueue > 0 && noticeQueue === noticeShown(noticeGapHtml), `큐 ${noticeQueue} · 표시 ${noticeShown(noticeGapHtml)}`)
  check("공지 목록: 필터 없이 열면 확인 완료·일반 공지까지 표시(필터 실효 확인)",
    noticeShown(noticeAllHtml) > noticeShown(noticeGapHtml), `전체 ${noticeShown(noticeAllHtml)} · 미달 ${noticeShown(noticeGapHtml)}`)

  // QnA 큐 드릴다운 — 대시보드가 '답변 대기 N건'·'SLA 경과 M건'이라 말하면서 링크는 문의 목록 전체를 열었다.
  //  목록은 답변 완료분까지 쌓이므로 담당자가 답변할 건을 눈으로 골라야 했다. 이제 큐가 센 집합으로 연다.
  const qnaWaitHtml = await (await get('/board/qna?status=' + encodeURIComponent('대기'), 'ASSET_MGR')).text()
  const qnaOverHtml = await (await get('/board/qna?overdue=1', 'ASSET_MGR')).text()
  const qnaAllHtml = await (await get('/board/qna', 'ASSET_MGR')).text()
  // QnA 목록은 "N건 / 전체 M건" 형태로 적는다(발송 이력의 "N / M건" 과 형식이 달라 따로 읽는다).
  const qnaShown = (html) => { const plain = html.replace(/<!-- -->/g, ""); const at = plain.indexOf("문의 목록"); return Number((new RegExp("([0-9]+)건 \\/ 전체").exec(at === -1 ? plain : plain.slice(at)) || [])[1] ?? -1) }
  const qnaPlain = dashMgr.replace(/<!-- -->/g, "")
  const qnaWaitAt = qnaPlain.indexOf("답변 대기")
  const qnaWaitQueue = Number((new RegExp("<b>([0-9]+)").exec(qnaWaitAt === -1 ? "" : qnaPlain.slice(qnaWaitAt, qnaWaitAt + 400)) || [])[1] ?? -1)
  check("QnA 큐: 답변 대기 건수 = 대기 필터 목록 건수",
    qnaWaitQueue > 0 && qnaWaitQueue === qnaShown(qnaWaitHtml), `큐 ${qnaWaitQueue} · 표시 ${qnaShown(qnaWaitHtml)}`)
  check("QnA 큐: SLA 경과 필터가 미답변 지연분만 연다(전체보다 작음)",
    qnaShown(qnaOverHtml) > 0 && qnaShown(qnaOverHtml) <= qnaShown(qnaWaitHtml) && qnaShown(qnaWaitHtml) < qnaShown(qnaAllHtml),
    `경과 ${qnaShown(qnaOverHtml)} · 대기 ${qnaShown(qnaWaitHtml)} · 전체 ${qnaShown(qnaAllHtml)}`)

  // 폐쇄 루프 — README 의 번호 매긴 항목 수가 기준
  // 다음 '## ' 제목 전까지만 — 끝까지 자르면 '데모 시나리오'의 번호 목록까지 세어 버린다
  const loopStart = readme.indexOf('## 동작하는 폐쇄 루프')
  const loopEnd = readme.indexOf('\n## ', loopStart + 1)
  const loopSection = readme.slice(loopStart, loopEnd === -1 ? undefined : loopEnd)
  const loops = [...loopSection.matchAll(/^(\d+)\. \*\*/gm)].length
  const loopClaims = [...claims(readme, /폐쇄 루프 (\d+)종/g), ...claims(summary, /폐쇄 루프 (\d+)종/g)]
  check(`문서: 폐쇄 루프 ${loops}종 일치`, allSame(loopClaims, loops), `주장=${loopClaims.join(',')} 실제=${loops}`)

  // 샘플 산출물 수 — 문서가 '샘플 N종'이라고 적는데 실제 파일 수와 갈리면(실제로 8종이라 적힌 채 10종이 있었다)
  //  받아 보는 쪽은 두 개가 빠진 줄 안다. 파일(샘플_*.csv — 설명 문서와 구분된다)과 주장을 맞춘다.
  const sampleFiles = readdirSync(path.join(ROOT, '..', 'docs')).filter((f) => f.startsWith('샘플_') && f.endsWith('.csv')).length
  // 공통코드 그룹 수 — 화면이 '공통코드 N종'을 관리한다고 문서가 적는데, 시드 그룹 수와 갈리면
  //  받아 보는 쪽은 관리 대상이 더/덜 있다고 읽는다(다른 열 개 수치 주장과 같은 규약).
  const cgStart = permStoreSrc.indexOf('function seedCodeGroups')
  const codeBlock = permStoreSrc.slice(cgStart, permStoreSrc.indexOf(String.fromCharCode(10) + 'function ', cgStart + 10))
  const codeGroups = [...codeBlock.matchAll(new RegExp("^\\s*(?:\\{ )?id: '([A-Z_]+)',", 'gm'))].length
  const codeClaims = claims(readme, /공통코드 (\d+)종/g)
  check(`문서: 공통코드 ${codeGroups}종 일치`, codeGroups >= 5 && allSame(codeClaims, codeGroups), `주장=${codeClaims.join(',')} 실제=${codeGroups}`)
  // 헬스가 내는 링크 권한 검사 건수 — 역할 4종 × 검사 종류에서 나오므로, 검사를 늘리면 문서가 조용히 어긋난다
  const healthSrc2 = readFileSync(path.join(ROOT, 'scripts', 'client-health.mjs'), 'utf8')
  const linkKinds = healthSrc2.split('링크 권한 정합').length - 1
  const linkClaims = claims(readme, /API 링크 권한 (\d+)건/g)
  check(`문서: 링크·API 링크 권한 검사 ${linkKinds * 4}건 일치(권한그룹 4종 × 검사 ${linkKinds}종)`,
    linkKinds >= 1 && allSame(linkClaims, linkKinds * 4), `주장=${linkClaims.join(',')} 실제=${linkKinds * 4}`)
  const sampleClaims = [...claims(readme, /AI 리포트 샘플 (\d+)종/g), ...claims(summary, /AI 리포트 샘플 (\d+)종/g)]
  check(`문서: 리포트 샘플 ${sampleFiles}종 일치`, allSame(sampleClaims, sampleFiles), `주장=${sampleClaims.join(",")} 실제=${sampleFiles}`)
  // 샘플이 리포트 종류 전체를 덮는가 — 위 검사는 '파일 수 = 문서 주장'만 봤다. 종류가 17 인데 샘플이 10 이면
  //  일곱 리포트는 생성 결과를 아무도 고정하지 않은 채 나간다(드리프트 검사가 닿지 않는다). 실제로 그랬다.
  const kindNames = [...reportsSrc.matchAll(new RegExp("  \\{ kind: '([^']+)'", 'g'))].map((m) => m[1])
  const genSrc = readFileSync(path.join(ROOT, 'scripts', 'gen-samples.mjs'), 'utf8')
  const genBlock = genSrc.split('const REPORTS = [')[1]?.split(String.fromCharCode(10) + ']')[0] ?? ''
  const sampledKinds = [...genBlock.matchAll(new RegExp("\\['([^']+)',", 'g'))].map((m) => m[1])
  const unsampled = kindNames.filter((k) => !sampledKinds.includes(k))
  // 감가상각 명세는 두 기준을 함께 쓴다 — 연간 상각액은 회계 관행대로 연초(전년말) 기준이고, 잔여 상각액은
  //  오늘 기준이다. 한 문장에 섞어 '향후 총 상각액'으로 연초 합계를 적으면 올해 이미 계상된 몫만큼 예산이
  //  부풀었다(4,007만 vs 실제 잔여 3,173만 — 26% 과대). 커밋된 샘플에서 두 식이 맞아떨어지는지 본다.
  const depSample = readFileSync(path.join(ROOT, '..', 'docs', '샘플_감가상각명세.md'), 'utf8')
  const num = (re) => { const m = re.exec(depSample); return m ? Number(m[1].replace(/,/g, '')) : -1 }
  const depNowBook = num(/현재 잔존가\(장부가\)는 ([0-9,]+)원/)
  const depRemain = num(/오늘 기준 잔여 상각액 총계는 ([0-9,]+)원/)
  const depAnnual = num(/년 연간 상각액은 ([0-9,]+)원/)
  const depYtd = num(/이 중 오늘까지 ([0-9,]+)원 계상/)
  const depRest = num(/연말까지 ([0-9,]+)원 잔여/)
  // 0건인데 조치를 요구하지 않는다 — 리포트가 '…는 0건으로, 우선 조치가 필요합니다'라고 적으면
  //  읽는 사람은 목록을 찾다가 빈손이 된다(SPOF 리포트가 실제로 그랬다). 커밋된 샘플 전체를 훑는다.
  // 설명 문서(샘플_리포트_설명.md)는 산출물이 아니다 — csv 짝이 있는 것만 리포트 샘플이다
  const docsDir = path.join(ROOT, '..', 'docs')
  const sampleMd = readdirSync(docsDir).filter((x) => x.startsWith('샘플_') && x.endsWith('.md') && existsSync(path.join(docsDir, x.replace(/[.]md$/, '.csv'))))
  const zeroDemands = []
  for (const name of sampleMd) {
    const body = readFileSync(path.join(ROOT, '..', 'docs', name), 'utf8')
    for (const ln of body.split(new RegExp(String.fromCharCode(92) + 'r?' + String.fromCharCode(92) + 'n'))) {
      // '0건' 바로 뒤에 조치를 요구하는 맺음이 오는 문장만 — 다른 항목이 0인 나열은 대상이 아니다
      if (/0건(으로|이며|이고)[^.]{0,40}(필요합니다|대상입니다|해야 합니다)/.test(ln)) zeroDemands.push(`${name}: ${ln.trim().slice(0, 70)}`)
    }
  }
  // 대장 정합성(CMDB 정확도)은 세 리포트가 같은 수를 적어야 하는데, 각자 같은 식을 복사해 두고 있었다 —
  //  hasDataIssue 의 범위를 한 곳에서 바꾸면 셋이 갈린다. 정의는 lib/quality 하나뿐이어야 한다.
  // '아직 분류 안 된 미등록 발견'은 대시보드 KPI·상단바 배지·발견 화면·AI 어시스턴트가 함께 쓰는 판정인데,
  //  이름 없이 여섯 곳에 그대로 복사돼 있었다(리포트의 onboardTargets 는 다른 질문에 답하는 별개 정의다).
  //  한쪽만 바꾸면 화면들이 조용히 갈리므로, 날 술어가 남아 있지 않은지 본다.
  // USER 결재 조회 스코프는 보안 경계다 — 결재함·대시보드·전역 검색 API 세 곳이 같은 규칙을 각자 복사해
  //  두고 있었다. 한쪽만 바뀌면 화면에서 가린 결재가 검색 결과로 새어 나간다(조용한 불일치 = 유출).
  const rawScope = []
  const rawUntriaged = []
  const uiFiles = []
  const walkUi = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walkUi(p); else if (/[.]tsx?$/.test(e.name)) uiFiles.push(p) } }
  walkUi(path.join(ROOT, 'app'))
  walkUi(path.join(ROOT, 'lib'))
  for (const p of uiFiles) {
    const body = readFileSync(p, 'utf8')
    // 정의 파일 자신은 대상이 아니다 — 판정이 사는 곳이다
    if (p.endsWith('types.ts') || p.endsWith('saas.ts')) continue
    // 발견 자산의 '미분류 미등록'
    // onboardTargets 는 '편입 대상'이라는 다른 질문에 답하는 별개 정의다(관리 제외·격리요청까지 본다) — 대상이 아니다
    if (body.includes("discovered.filter((d) => d.state === '미등록' && !d.action")) rawUntriaged.push(p.replace(ROOT, '') + ' (발견)')
    // 외부 노출의 '미조치' — 브리핑 리포트만 '미등록'으로 좁혀 세면서 같은 기준이라 적었다(7건 → 4건 과소 보고)
    if (body.includes("e.state !== '등록·일치'") || body.includes("x.state !== '등록·일치'")) rawUntriaged.push(p.replace(ROOT, '') + ' (외부 노출)')
    // USER 결재 스코프·수령 미확인
    if (body.includes("a.kind === '소유자 확인' && a.dept === session.dept")) rawScope.push(p.replace(ROOT, '') + ' (결재 스코프)')
    if (body.includes("receiptPending && a.status === '사용중'")) rawScope.push(p.replace(ROOT, '') + ' (수령 미확인)')
    // SaaS 차단 판정 집합 — 브리핑·엑셀 반출·화면·어시스턴트가 각자 같은 Set 을 만들고 있었다(lib/saas 로 모았다)
    if (body.includes("saasCatalog.filter((c) => c.status === '차단')")) rawScope.push(p.replace(ROOT, '') + ' (차단 SaaS)')
  }
  const untriagedUses = uiFiles.filter((p) => { const b = readFileSync(p, 'utf8'); return b.includes('isUntriagedDiscovery') || b.includes('isOpenExposure') }).length
  const scopeUses = uiFiles.filter((p) => { const b2 = readFileSync(p, 'utf8'); return b2.includes('isApprovalVisibleToUser') || b2.includes('isReceiptPending') || b2.includes('blockedSaasServices') }).length
  check(`결재 스코프·수령 미확인·차단 SaaS: 판정이 각각 한 정의 (사용 ${scopeUses}곳)`,
    scopeUses >= 11 && rawScope.length === 0, `날 술어가 남음: ${rawScope.join(', ')}`)
  check(`발견·노출: '미조치' 판정이 각각 한 정의 (사용 ${untriagedUses}곳)`,
    untriagedUses >= 8 && rawUntriaged.length === 0, `날 술어가 남음: ${rawUntriaged.join(', ')}`)
  // 필수 고정 결재(폐기·격리 요청·소유자 확인·차이 조정)는 저장된 플래그가 아니라 상수가 정한다 —
  //  낡은 스냅샷이나 결재선 누락 한 번에 '직접 실행' 경로가 열리면 안 되는 종류다(토글도 해제를 거부한다).
  // 잠긴 AI 정책 토글도 같은 규약 — 저장된 플래그가 아니라 고정값이 답이다.
  //  화면이 저장값을 그리면 낡은 스냅샷 하나로 '권한 범위 필터 OFF'(빨강)가 떠, 감사관은 스코핑이
  //  꺼졌다고 읽는다(코드는 늘 적용한다). 필수 결재·권한 매트릭스 잔존 'p' 와 같은 자리다.
  // 잠금 칸(Admin × 권한·정책 × 조회·저장)도 같은 규약 — 셋 중 가장 무겁다.
  //  저장된 'n' 하나로 Admin 이 권한 화면 밖으로 밀려나는데, 되돌릴 화면이 바로 그 화면이라
  //  앱 안에 복구 경로가 없다. 쓰기는 setPermission 이 막으므로 읽기도 같은 불변식을 봐야 한다.
  // 관리자 0명 스냅샷은 운영할 수 없다 — 권한그룹 변경은 Admin 만 할 수 있어 앱 안에 복구 경로가 없다.
  //  setUserRole 의 '마지막 관리자 강등 불가'는 쓰기 시점뿐이라, 로드에도 같은 불변식이 필요하다.
  //  아무나 승격시키면 조용한 권한 부여가 되므로 깨진 파일과 같은 규약(시드 폴백)으로 처리한다.
  // 결재자 단계 목록은 화면(체크박스)과 서버(검증)가 같아야 한다 — 갈리면 화면이 내주는 단계를 서버가
  //  거부하거나(조용한 거절) 서버가 받는 단계를 화면이 감춘다. 정의는 APPROVAL_STEP_ROLE 의 키 하나뿐이다.
  const usersViewSrc2 = readFileSync(path.join(ROOT, 'app', '(app)', 'settings', 'users', 'UsersView.tsx'), 'utf8')
  const usersActSrc = readFileSync(path.join(ROOT, 'app', '(app)', 'settings', 'users', 'actions.ts'), 'utf8')
  const hardcodedSteps = [usersViewSrc2, usersActSrc].filter((b) => b.includes("['부서장', '자산담당'")).length
  check('결재선: 결재자 단계 목록이 한 정의(화면·서버 공용)',
    permTypesSrc.includes('export const APPROVER_STEPS: string[] =')
    && usersViewSrc2.includes('APPROVER_STEPS') && usersActSrc.includes('APPROVER_STEPS') && hardcodedSteps === 0,
    `하드코딩 남은 파일 ${hardcodedSteps}개`)
  // 화면이 실제로 그 네 단계를 체크박스로 내주는지 — 상수만 맞고 렌더가 비면 편집 자체가 안 된다
  const usersHtmlSteps = text(await (await get('/settings/users', 'ADMIN')).text())
  const stepNames = ['부서장', '자산담당', '보안담당', 'IT기획팀장']
  const missingSteps = stepNames.filter((x) => !usersHtmlSteps.includes(x))
  check(`결재선: 네 결재자 단계가 편집 UI 에 렌더 (${stepNames.length}종)`, missingSteps.length === 0, `누락: ${missingSteps.join(', ')}`)
  // 순서는 결재 진행 순서라 파생할 수 없다 — 대신 멤버십이 APPROVAL_STEP_ROLE 과 어긋나지 않는지 본다
  //  (역할 매핑이 없는 단계를 넣으면 결재 라우팅이 그 단계에서 멈춘다).
  const roleMapStart = permTypesSrc.indexOf('APPROVAL_STEP_ROLE: Record<string, Role> = {')
  const roleMapBlock = roleMapStart < 0 ? '' : permTypesSrc.slice(roleMapStart, permTypesSrc.indexOf('}', roleMapStart))
  const mappedSteps = [...roleMapBlock.matchAll(new RegExp("'([^']+)':", 'g'))].map((m) => m[1])
  const unmappedSteps = stepNames.filter((x) => !mappedSteps.includes(x))
  check(`결재선: 결재자 단계가 모두 역할에 매핑돼 있다 (${mappedSteps.length}종 매핑)`,
    mappedSteps.length >= 4 && unmappedSteps.length === 0, `매핑 없음: ${unmappedSteps.join(', ')}`)
  // 시드 참조 무결성 — 끊긴 참조는 화면·반출에서 '조회되지 않는 번호'로 나간다.
  //  폐기 증적 대장(ISMS A.8.3)의 결재번호가 대표 사례다: 대장에 없는 번호를 적으면 '결재를 받았다'고
  //  주장하면서 근거를 댈 수 없고, 감사 로그의 대상 딥링크도 없는 문서로 향한다(실제로 두 건이 그랬다).
  const idsOf = (re) => new Set([...permStoreSrc.matchAll(re)].map((m) => m[1]))
  const seedAssets = idsOf(new RegExp("assetNo: '(AST-[0-9-]+)'", 'g'))
  const seedContracts = idsOf(new RegExp("id: '(CT-[0-9-]+)'", 'g'))
  const seedLicenses = idsOf(new RegExp("id: '(LIC-[0-9]+)'", 'g'))
  const seedApprovals = idsOf(new RegExp("id: '(APR-[0-9-]+)'", 'g'))
  const seedDisposals = idsOf(new RegExp("id: '(DSP-[0-9]+)'", 'g'))
  const seedDiscovered = idsOf(new RegExp("id: '(DSC-[0-9-]+)'", 'g'))
  const seedRounds = idsOf(new RegExp("id: '(INV-[0-9A-Za-z-]+)'", 'g'))
  const refChecks = [
    ['contractId', new RegExp("contractId: '([^']+)'", 'g'), seedContracts],
    ['matchedAssetNo', new RegExp("matchedAssetNo: '([^']+)'", 'g'), seedAssets],
    ['licenseId', new RegExp("licenseId: '([^']+)'", 'g'), seedLicenses],
    ['approvalId', new RegExp("approvalId: '([^']+)'", 'g'), seedApprovals],
    // 결재의 refId 는 대상 종류가 여럿이다(자산·라이선스·계약·폐기·발견·재물조사 회차)
    ['refId', new RegExp("refId: '([^']+)'", 'g'), new Set([...seedAssets, ...seedLicenses, ...seedContracts, ...seedDisposals, ...seedDiscovered, ...seedRounds])],
    // 실사 스캔·차이가 붙는 회차, IOC·크리덴셜이 가리키는 외부 노출 — 끊기면 리포트가 어느 회차에도 안 잡힌다
    ['roundId', new RegExp("roundId: '([^']+)'", 'g'), seedRounds],
    ['extId', new RegExp("extId: '([^']+)'", 'g'), idsOf(new RegExp("id: '(EXT-[0-9-]+)'", 'g'))],
  ]
  const dangling = []
  let refTotal = 0
  for (const [field, re, pool] of refChecks) {
    const used = [...new Set([...permStoreSrc.matchAll(re)].map((m) => m[1]))]
    refTotal += used.length
    for (const v of used) if (!pool.has(v)) dangling.push(`${field}=${v}`)
  }
  // 관측(ChannelObservation)은 시드가 위치 인자 헬퍼 o(id, discoveredId, …) 로 만들어, 위 필드 기반 검사가
  //  보지 못한다 — 'discoveredId:' 문자열이 아예 없다. 따로 훑는다.
  const obsRefs = [...permStoreSrc.matchAll(new RegExp("o\\('(OBS-[0-9]+)', '(DSC-[0-9-]+)'", 'g'))].map((m) => ({ obs: m[1], dsc: m[2] }))
  const obsDangling = obsRefs.filter((x) => !seedDiscovered.has(x.dsc)).map((x) => `${x.obs}→${x.dsc}`)
  // 수리중인데 수리 의뢰(업체·의뢰일) 기록이 없는 자산 — 두 판정(예상 반환 경과·일정 미기재) 어디에도 안 걸리고,
  //  독촉은 a.repair.vendor 로 보내므로 보낼 곳도 없다. '수리중 N건'으로만 보이고 빠져나갈 길이 없던 상태다.
  //  업체가 아니라 담당자가 할 일(의뢰 정보 등록)이라, 독촉 0건과 구분해 화면이 건수를 적어야 한다.
  const retHtmlR = text(await (await get('/assets/returns', 'ASSET_MGR')).text())
  const unrecMatch = /의뢰 정보 미기재 ([0-9]+)건/.exec(retHtmlR)
  // mk({…}) 항목은 줄바꿈될 수 있다 — 줄 단위로 세면 다음 줄의 repair 를 놓쳐 없는 결함을 만든다(실제로 그랬다).
  //  자산 시드를 mk( 단위 블록으로 잘라 블록 안에서 본다.
  const assetSeed = permStoreSrc.slice(permStoreSrc.indexOf('function seedAssets'), permStoreSrc.indexOf('function seedReportSchedules'))
  const seedUnrecorded = assetSeed.split('mk({').filter((b) => b.includes("status: '수리중'") && !b.includes('repair:')).length
  check(`수리 대기: 의뢰 정보 미기재 건수를 화면이 적는다 (${unrecMatch ? unrecMatch[1] : '?'}건)`,
    seedUnrecorded > 0 && unrecMatch !== null && Number(unrecMatch[1]) === seedUnrecorded,
    `시드 ${seedUnrecorded}건 · 화면 ${unrecMatch ? unrecMatch[1] : '없음'}`)
  check('수리 대기: 미기재 건은 독촉이 아니라 등록이 필요하다고 밝힌다',
    retHtmlR.includes('업체·일정 등록 필요 — 독촉 불가'))
  check('수리 판정: 의뢰 기록 자체가 없는 경우를 별도 판정으로 둔다',
    readFileSync(path.join(ROOT, 'lib', 'dates.ts'), 'utf8').includes('export function isRepairUnrecorded('))
  check(`관측 근거: 관측 ${obsRefs.length}건이 모두 실재 발견 자산을 가리킴`,
    obsRefs.length >= 15 && obsDangling.length === 0, obsDangling.join(', '))
  // 반대 방향 — 발견 자산에는 '어떻게 발견했는가'가 있어야 한다. 근거가 0건이면 화면의 채널별 관측이
  //  비어 행의 설명·lastSeen 과 모순되고, 중복 병합의 대표 선정(관측 많은 쪽)도 0으로 계산된다.
  const observed = new Set(obsRefs.map((x) => x.dsc))
  const noEvidence = [...seedDiscovered].filter((d) => !observed.has(d))
  check(`관측 근거: 발견 자산 ${seedDiscovered.size}종이 모두 관측 근거를 가진다`,
    seedDiscovered.size >= 10 && noEvidence.length === 0, `근거 없음: ${noEvidence.join(', ')}`)
  check(`시드 참조 무결성: 끊긴 참조 없음 (${refTotal}종 참조 검사)`,
    refTotal >= 25 && dangling.length === 0, dangling.join(', '))
  check('스토어 로드: 관리자 0명 스냅샷은 시드로 폴백',
    permStoreSrc.includes("!store.users.some((u: UserAccount) => u.role === 'ADMIN')"))
  // 시드가 그 불변식을 실제로 만족하는지도 본다 — 소스 가드만 맞고 데이터가 어기면 첫 기동부터 폴백 루프다
  const usersHtmlAdm = text(await (await get('/settings/users', 'ADMIN')).text())
  const adminNum = /시스템 관리자 ([0-9]+)명/.exec(usersHtmlAdm)
  check(`사용자·그룹: 시스템 관리자 수를 화면이 적고 최소 1명 (${adminNum ? adminNum[1] : '?'}명)`,
    adminNum !== null && Number(adminNum[1]) >= 1 && usersHtmlAdm.includes('마지막 1명은 강등 불가'))
  check('권한 판정: 잠긴 칸은 저장값과 무관하게 허용',
    permSrc.includes('if (isLocked(menu, action, role)) return true'))
  check('권한 매트릭스: 저장된 스냅샷의 잠긴 칸도 로드 시 허용으로 되돌린다',
    permStoreSrc.includes('isLocked(row.menu, PERM_ACTIONS[i], role)) row.cells[role][i] = ') && permStoreSrc.includes("'y'"))
  check('AI 정책: 잠긴 토글은 고정값으로 판정한다',
    permTypesSrc.includes('export function effectiveAiToggle(') && permTypesSrc.includes('lock ? lock.pinned : policy[field]'))
  check('AI 정책: 저장된 스냅샷도 로드 시 고정값으로 되돌린다',
    permStoreSrc.includes('LOCKED_AI_POLICY_TOGGLES') && permStoreSrc.includes('lock.pinned'))
  const aiPolHtml = text(await (await get('/settings/ai-policy', 'ADMIN')).text())
  check('AI 정책 화면: 권한 범위 필터 ON · 자동 승인 OFF 를 고정값으로 표시',
    aiPolHtml.includes('코드가 항상 적용 — 정책값으로 끌 수 없음') && aiPolHtml.includes('자동 승인 경로 없음'))
  const approvalSrc = readFileSync(path.join(ROOT, 'lib', 'approval.ts'), 'utf8')
  // 'ApprovalKind[]' 의 ']' 에 걸리지 않게 '=' 뒤의 여는 대괄호부터 자른다
  const mandStart = permTypesSrc.indexOf('MANDATORY_APPROVAL_KINDS')
  const mandOpen = mandStart < 0 ? -1 : permTypesSrc.indexOf('[', permTypesSrc.indexOf('=', mandStart))
  const mandatoryKinds = mandOpen < 0 ? '' : permTypesSrc.slice(mandOpen, permTypesSrc.indexOf(']', mandOpen))
  const mandatoryList = [...mandatoryKinds.matchAll(new RegExp("'([^']+)'", 'g'))].map((m) => m[1])
  check(`필수 결재: 판정이 상수를 먼저 본다 (${mandatoryList.length}종)`,
    mandatoryList.length === 4 && approvalSrc.includes('MANDATORY_APPROVAL_KINDS.includes(kind)) return true'),
    `상수 ${mandatoryList.join(', ')}`)
  check('필수 결재: 저장된 스냅샷도 로드 시 필수로 되돌린다',
    permStoreSrc.includes('MANDATORY_APPROVAL_KINDS.includes(line.kind)) line.required = true'))
  // 화면이 그 네 종을 실제로 '필수'로 그린다 — 상수만 맞고 화면이 '선택'이면 관리자가 해제 가능하다고 읽는다
  const usersHtml = await (await get('/settings/users', 'ADMIN')).text()
  const usersPlain = text(usersHtml)
  const missingMandatory = mandatoryList.filter((k) => !usersPlain.includes(k))
  check(`필수 결재: 결재선 화면에 네 종이 모두 있다 (${mandatoryList.length}종)`,
    mandatoryList.length === 4 && missingMandatory.length === 0 && usersPlain.includes('필수'), `누락: ${missingMandatory.join(', ')}`)
  const qualitySrc = readFileSync(path.join(ROOT, 'lib', 'quality.ts'), 'utf8')
  const accuracyUses = reportsSrc.split('cmdbAccuracyPct(').length - 1
  const inlineAccuracy = reportsSrc.split('ratioPct(live').length - 1
  check(`대장 정합성: 정확도 정의는 lib/quality 한 곳 (리포트 ${accuracyUses - 0}곳이 사용)`,
    qualitySrc.includes('export function cmdbAccuracyPct(') && accuracyUses >= 3 && inlineAccuracy === 0,
    `직접 계산 ${inlineAccuracy}곳 · 헬퍼 사용 ${accuracyUses}곳`)
  check(`리포트: 0건인데 조치를 요구하는 문장이 없다 (샘플 ${sampleMd.length}종)`,
    sampleMd.length >= 15 && zeroDemands.length === 0, zeroDemands.join(' / '))
  check(`감가상각 명세: 오늘 기준 잔여 상각액 = 현재 잔존가 (${depRemain.toLocaleString()}원)`,
    depNowBook > 0 && depRemain === depNowBook, `잔존가 ${depNowBook} · 잔여 ${depRemain}`)
  check(`감가상각 명세: 올해 계상 + 잔여 = 연간 상각액 (${depAnnual.toLocaleString()}원)`,
    depAnnual > 0 && depYtd >= 0 && depRest >= 0 && depYtd + depRest === depAnnual,
    `${depYtd} + ${depRest} ≠ ${depAnnual}`)
  check(`리포트 샘플: 종류 ${kindNames.length}종을 모두 덮는다 (샘플 ${sampledKinds.length}종)`,
    kindNames.length >= 15 && unsampled.length === 0,
    `샘플 없는 종류: ${unsampled.join(', ')}`)

  // 커넥터·탐지 채널 수 — 문서가 '커넥터 7종'·'6채널'이라고 적는 값이다. 시드가 늘거나 줄면 문서만 남는다
  //  (샘플 8종/10종처럼 실제로 갈렸던 계열). 시드 정의에서 세어 주장과 맞춘다.
  const seedCount = (fn, re) => {
    const start = storeSrc.indexOf('function ' + fn)
    if (start < 0) return -1
    const end = storeSrc.indexOf(String.fromCharCode(10) + 'function ', start + 1)
    return (storeSrc.slice(start, end === -1 ? undefined : end).match(re) || []).length
  }
  const BS_ = String.fromCharCode(92)
  const connectors = seedCount('seedIntegrations', /id: 'INT-/g)
  const connectorClaims = [...claims(readme, new RegExp('커넥터 (' + BS_ + 'd+)종', 'g')), ...claims(summary, new RegExp('커넥터 (' + BS_ + 'd+)종', 'g'))]
  check(`문서: 연동 커넥터 ${connectors}종 일치`, allSame(connectorClaims, connectors), `주장=${connectorClaims.join()} 실제=${connectors}`)
  const channels = seedCount('seedScanPolicies', /channel: /g)
  // '3채널 자산'(한 자산이 세 채널에서 관측)처럼 같은 글자를 쓰는 다른 뜻이 있어, 채널 수를 말하는 표현만 읽는다.
  const chRes = ['(' + BS_ + 'd+)채널 병렬', '(' + BS_ + 'd+)채널 발견', '발견 자산' + BS_ + '((' + BS_ + 'd+)채널' + BS_ + ')']
  const channelClaims = chRes.flatMap((r) => [...claims(readme, new RegExp(r, 'g')), ...claims(summary, new RegExp(r, 'g'))])
  check(`문서: 탐지 채널 ${channels}채널 일치`, allSame(channelClaims, channels), `주장=${channelClaims.join()} 실제=${channels}`)

  // 스모크 건수는 자기참조 — 이 블록까지 포함한 최종 합계와 비교한다
  const smokeClaims = [...claims(readme, /→ (\d+)개 검증/g), ...claims(summary, /스모크 (\d+)건/g)]
  const finalTotal = passed + failed + 1   // +1 = 지금 실행할 이 검사
  check(`문서: 스모크 ${finalTotal}건 일치`, allSame(smokeClaims, finalTotal), `주장=${smokeClaims.join(',')} 실제=${finalTotal}`)
  }
} catch (err) {
  failed += 1
  console.error(`✗ 실행 오류: ${err instanceof Error ? err.message : err}`)
} finally {
  server?.kill()
}

console.log(`\n결과: ${passed} passed / ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
