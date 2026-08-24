/** 스모크 테스트 — 프로덕션 서버를 띄우고 권한 매트릭스·데이터 스코핑·리다이렉트를 검증한다.
 *  사용: npm run build && npm run smoke  (edim-web-next scripts/smoke.mjs 패턴) */
import { spawn } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { assertFreshBuild } from './build-guard.mjs'
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

const get = (p, role) =>
  fetch(BASE + p, { redirect: 'manual', headers: role ? { cookie: cookie(role) } : {} })

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
  // 증적 사진 관리 — 완료 폐기 건에 사진 등록 토글 (제품안내서 §03 폐기: 증적(사진·확인서))
  check('폐기 처리: 완료 건에 증적 사진 관리 토글 노출', dispPage.includes('증적 사진'))
  // 자산 라벨 재발행 — 대장에서 손상·분실 라벨 재출력 (USER 제외, 자산 운영 권한)
  check('라벨 인쇄: 사용자 차단 (403)', (await get('/api/label/AST-2023-000112', 'USER')).status === 403)
  check('라벨 인쇄: 없는 자산 404', (await get('/api/label/NOPE', 'ADMIN')).status === 404)
  const label = await get('/api/label/AST-2023-000112', 'ASSET_MGR')
  const labelBody = await label.text()
  check('라벨 인쇄: 자산담당 발급 (200·QR·바코드)', label.status === 200 && labelBody.includes('AST-2023-000112') && labelBody.includes('SEEKERSLAB') && labelBody.includes('<svg'))
  // 바코드가 자산번호에 따라 실제로 인코딩되는지 — 상수·빈 바코드 회귀 방지 (Code128-B 모듈이 자산마다 다르고 다수의 바로 구성)
  const label2Body = await (await get('/api/label/AST-2023-000113', 'ASSET_MGR')).text()
  const barcodeOf = (h) => (h.match(/<svg[^>]*viewBox="0 0 300 52"[\s\S]*?<\/svg>/) || [''])[0]
  const bc1 = barcodeOf(labelBody), bc2 = barcodeOf(label2Body)
  check('라벨 인쇄: 바코드가 자산번호별로 인코딩됨(상수·빈값 아님)', bc1.length > 0 && bc1 !== bc2 && (bc1.match(/<rect/g) || []).length > 20)
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
  // 사용자별 보유 자산 수 — 계정 관리 시 자산 부담 가시성 + 해당 사용자 자산 대장 드릴다운
  check('사용자: 보유 자산 수 + 자산 대장 드릴 링크', usrHtml.includes('보유 자산') && usrHtml.includes('/assets/register?q='))
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
  check('연동 · 인프라: 자산담당엔 감사 로그 엑셀 링크 없음', !intAsset.includes('/api/audit-export'))

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
  const statusDupes = sourceFiles
    .filter((f) => readFileSync(f, 'utf8').includes(STATUS_LITERAL))
    .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter((rel) => rel !== 'lib/types.ts')
  check(`비운영 상태 목록: lib/types 한 곳만 정의(소스 ${sourceFiles.length}개 검사)`, statusDupes.length === 0, `중복 정의=${statusDupes.join(', ')}`)

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
  check('AI 로그 보존: 조회가 보존 정책(auditRetentionDays)을 적용',
    aiPolicySrc.includes('aiAuditLogs(s.auditLogs, s.aiPolicy.auditRetentionDays')
    && aiStatusSrc.includes('const cutoff = addDays(today, -Math.max(0, retentionDays))'),
    '화면이 보존 기간 없이 직접 필터하고 있음')
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
  const sampleClaims = [...claims(readme, /AI 리포트 샘플 (\d+)종/g), ...claims(summary, /AI 리포트 샘플 (\d+)종/g)]
  check(`문서: 리포트 샘플 ${sampleFiles}종 일치`, allSame(sampleClaims, sampleFiles), `주장=${sampleClaims.join(",")} 실제=${sampleFiles}`)

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
