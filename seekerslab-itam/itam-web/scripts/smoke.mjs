/** 스모크 테스트 — 프로덕션 서버를 띄우고 권한 매트릭스·데이터 스코핑·리다이렉트를 검증한다.
 *  사용: npm run build && npm run smoke  (edim-web-next scripts/smoke.mjs 패턴) */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const PORT = 3378
/** SMOKE_BASE 를 주면 이미 떠 있는 서버(=배포본)를 그대로 검증한다.
 *  로컬에서 통과해도 배포본에서만 틀리는 결함이 실재한다 — 컨테이너 TZ 가 UTC 라
 *  KST 00~09시에 날짜가 하루 뒤처지던 건이 그랬다. 배포 후 같은 스위트를 한 번 더 돌린다.
 *  예: SMOKE_BASE=http://localhost:3390 node scripts/smoke.mjs */
const BASE = process.env.SMOKE_BASE || `http://localhost:${PORT}`
const REMOTE = Boolean(process.env.SMOKE_BASE)

if (!REMOTE && !existsSync(path.join(ROOT, '.next'))) {
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
  // 장기 미실측(유령 자산 후보) 필터 — 실측 이력이 없거나 오래된 자산이 시드에 있어 토글이 렌더된다
  check('자산 대장: 장기 미실측 필터 렌더 (실측 기반 유령 자산 식별)', mgrHtml.includes('장기 미실측'))
  // 상태 필터 — 유형·검색·장기미실측에 더해 자산 상태(대여중·수리중·분실 등)로도 슬라이스
  check('자산 대장: 상태 필터 렌더', mgrHtml.includes('상태 — 전체') && mgrHtml.includes('대여중'))
  // 상태 요약 스트립 — 상태별 보유 대수를 한눈에 보고 클릭 필터
  check('자산 대장: 상태 요약(구성) 스트립 렌더', mgrHtml.includes('상태 요약'))
  // 보증 임박 필터 — 보증 90일 이내 만료·경과 자산(시드에 다수)이 있어 토글이 렌더된다
  check('자산 대장: 보증 임박 필터 렌더', mgrHtml.includes('보증 임박'))
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
  // SW 자산은 물리 위치·시리얼이 없어 정합성 이슈가 아니다 — 오탐 방지(AST-2023-000720 · Microsoft 365, 위치 '-')
  const regSw = await (await get('/assets/register?sel=AST-2023-000720', 'ASSET_MGR')).text()
  check('자산 대장: SW 자산 위치 누락은 정합성 이슈 아님 (오탐 방지)', !regSw.includes('대장 정합성 미흡'))
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
  // 연관 자산(영향도) — 같은 계약·위치·소유자·모델 공유 자산 수 + 드릴 링크
  check('자산 대장: 상세에 연관 자산(영향도) 섹션 + 드릴 링크', regContractDetail.includes('연관 자산') && regContractDetail.includes('같은 모델'))
  check('자산 대장: 상세에 자산 카드(dossier) 인쇄 링크', regContractDetail.includes('/api/asset-card/') && regContractDetail.includes('자산 카드'))
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
  // 라이선스 초과 사용(SAM 감사 최우선 노출) — 시드 LIC-002(JetBrains 120보유/131사용, 11석 초과)로 자산담당 운영 큐에 노출·계약 화면 드릴
  check('대시보드: 라이선스 초과 사용 감사 노출 큐 (자산담당)', dashHtml.includes('라이선스 초과 사용') && dashHtml.includes('감사 노출') && dashHtml.includes('/inventory/contracts'))
  // 대장 정합성 미흡 운영 큐 — 시드 필드 누락 자산 2건으로 자산담당 대시보드에 CMDB 스튜어드십 신호가 뜬다
  check('대시보드: 대장 정합성 미흡 운영 큐 (자산담당) + dq 드릴', dashHtml.includes('대장 정합성 미흡') && dashHtml.includes('dq=1'))
  // 결재 지연 — SLA 초과 대기 결재가 결재 대기 KPI 델타에 노출된다(정체 신호)
  check('대시보드: 결재 지연(SLA 초과) KPI 신호', dashHtml.includes('SLA') && dashHtml.includes('초과'))
  // 대여자 관점 — 목업 사용자(김민준)가 대여 중인 자산(AST-2024-000230)의 반환 기한이 My Work 에 노출된다
  const dashUser = await (await get('/dashboard', 'USER')).text()
  check('대시보드(사용자): 내 대여 자산 반환 기한 노출', dashUser.includes('내 대여 자산') && dashUser.includes('AST-2024-000230') && dashUser.includes('까지'))
  // 운영 큐(라이선스 초과 사용 등)는 담당자 전용 — 사용자에겐 미노출
  check('대시보드(사용자): 라이선스 초과 사용 큐 미노출 (운영 큐 담당자 전용)', !dashUser.includes('라이선스 초과 사용'))
  // 미확인 필독 공지 넛지 — 사용자가 로그인 시 미확인 필독 공지를 스스로 챙기게 한다(관리자 독촉·명단의 사용자 측 짝). NTC-01(필독, 0 acks)로 검증.
  check('대시보드(사용자): 미확인 필독 공지 넛지 + 특정 공지 딥링크', dashUser.includes('미확인 필독 공지') && dashUser.includes('2026 하반기 재물조사') && dashUser.includes('/board/notices?sel=NTC-01'))
  // 최근 공지 위젯(Main/Home 공지 요약) — 필독 넛지와 별개로, 발행된 공지를 최신순으로 상시 노출(전 권한). NTC-02(비고정) 등 일반 공지도 포함.
  check('대시보드: 최근 공지 위젯 + 게시판 연결', dashUser.includes('최근 공지') && dashUser.includes('미인가 SaaS') && dashUser.includes('href="/board/notices"'))
  // 우리 부서 소유자 확인 요청 넛지 — 김민준(플랫폼개발팀) 앞으로 온 APR-2607-114 응답 대기. 결재 딥링크(v1.143)
  check('대시보드(사용자): 우리 부서 소유자 확인 요청 넛지 + 결재 딥링크', dashUser.includes('소유자 확인 요청 — 응답 필요') && dashUser.includes('DSC-2607-0041') && dashUser.includes('/workflow/approvals?sel=APR-2607-114'))
  // 반려된 내 신청 재상신 넛지 — 김민준의 반려 건(APR-2607-096, 아직 미재상신)이 사유와 함께 노출·딥링크
  check('대시보드(사용자): 반려된 내 신청 재상신 넛지 + 사유·딥링크', dashUser.includes('반려된 내 신청 — 재상신 검토') && dashUser.includes('/workflow/approvals?sel=APR-2607-096') && dashUser.includes('부서 예산 승인 후'))
  // 다른 부서(자산관리팀=박자산)에는 해당 요청 넛지가 뜨지 않는다 (부서 스코프)
  check('대시보드: 타 부서엔 소유자 확인 넛지 미노출 (부서 스코프)', !dashHtml.includes('소유자 확인 요청 — 응답 필요'))
  // 최근 활동 위젯 — 감사 로그 접근 권한(비사용자)에만 노출
  check('대시보드: 최근 활동 위젯(자산담당) + 감사 로그 링크', dashHtml.includes('최근 활동') && dashHtml.includes('/platform/integrations'))
  check('대시보드: 사용자에겐 최근 활동 위젯 미노출', !dashUser.includes('최근 활동'))
  // 수집 커넥터 지연·오류 운영 큐 — 시드 프록시 커넥터(지연)로 보안담당 대시보드에 Discovery 저하 신호가 뜬다
  const dashSec = await (await get('/dashboard', 'SEC_MGR')).text()
  check('대시보드(보안담당): 수집 커넥터 지연·오류 운영 큐 노출', dashSec.includes('수집 커넥터 지연·오류') && dashSec.includes('Discovery 저하'))
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
  // 미인가 SW 미조치 — loop47. EDR 설치 SW 정책 위반도 보안담당 운영 큐에 노출(자산담당엔 미노출)
  check('대시보드(보안담당): 미인가 SW 미조치 운영 큐 노출', dashSec.includes('미인가 SW 미조치'))
  check('대시보드(자산담당): 미인가 SW 큐 미노출 (보안 운영 큐)', !dashHtml.includes('미인가 SW 미조치'))
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
  const foundHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 6채널·대사 상태·일괄 편입 렌더', foundHtml.includes('네트워크 능동 스캔') && foundHtml.includes('등록·불일치') && foundHtml.includes('선택 일괄 편입 요청'))
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
  // USB 저장매체(loop48) — 채널 04(EDR) 이동식 매체 DLP. 검출에서 끝내지 않고 보안담당이 차단·예외 승인으로 조치.
  check('발견 자산: USB 저장매체 정책 위반 카드 렌더', foundHtml.includes('USB 저장매체') && foundHtml.includes('Samsung T7 SSD') && foundHtml.includes('이동식 매체'))
  check('발견 자산: 보안담당에 USB 조치(차단·예외 승인) 노출', foundHtml.includes('대용량 반출 의심') && foundHtml.includes('예외 승인'))
  check('발견 자산: 자산담당엔 USB 조치 버튼 미노출 (조회만)', foundAsset.includes('USB 저장매체') && !foundAsset.includes('차단</button>'))
  // 로컬 VM(loop49) — 채널 04(EDR) 로컬 가상머신. EDR 채널 3종 산출(설치SW·USB·로컬VM) 완결. 보안담당이 회수·예외 승인으로 조치.
  check('발견 자산: 로컬 가상머신 정책 위반 카드 렌더', foundHtml.includes('로컬 가상머신') && foundHtml.includes('VirtualBox · legacy-test') && foundHtml.includes('엔드포인트 VM'))
  check('발견 자산: 보안담당에 로컬 VM 조치(회수·예외 승인) 노출', foundHtml.includes('EOL·미패치 게스트') && foundHtml.includes('예외 승인'))
  check('발견 자산: 자산담당엔 로컬 VM 조치 버튼 미노출 (조회만)', foundAsset.includes('로컬 가상머신') && !foundAsset.includes('회수</button>'))
  // 엔드포인트·계정 위생 요약 스탯 — 4종(휴면계정·SW·USB·VM)을 한 지표로 합산 요약(스탯 로우 과밀 해소), 상세는 각 카드
  check('발견 자산: 엔드포인트·계정 위생 요약 스탯 렌더', foundHtml.includes('엔드포인트·계정 위생 — 미조치') && foundHtml.includes('병렬 수집 채널'))
  const contractsHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약·라이선스: 보유–사용 대사·등록(계약·라이선스) 렌더', contractsHtml.includes('JetBrains') && contractsHtml.includes('초과 사용') && contractsHtml.includes('라이선스 등록') && contractsHtml.includes('계약 등록'))
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
  // 계약 엑셀에 상태(유효/해지) 컬럼 — 해지 계약이 반출본에서 활성으로 오인되지 않도록(감사 반출 정합)
  const ctXlsx = Buffer.from(await (await get('/api/export/contracts', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('계약 엑셀: 상태 컬럼(유효/해지) 반출', ctXlsx.includes('상태') && ctXlsx.includes('유효'))
  // 부속서류 미비(계약)·근거 계약(라이선스) 컬럼 반출 — 감사 컴플라이언스 반영
  check('계약 엑셀: 부속서류 미비·근거 계약 컬럼 반출', ctXlsx.includes('부속서류 미비') && ctXlsx.includes('근거 계약') && ctXlsx.includes('CT-2023-002') && ctXlsx.includes('미연계'))
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
  const licOver = await (await get('/api/license-card/LIC-002', 'ASSET_MGR')).text()  // JetBrains 120/131 초과
  check('라이선스 카드: 초과 사용 판정·비용 노출·SAM', licOver.includes('LIC-002') && licOver.includes('LICENSE COMPLIANCE') && licOver.includes('초과 사용') && licOver.includes('노출액'))
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
  check('공지사항: 사용자에게 등록·관리 버튼 미노출', !ntcHtml.includes('공지 등록') && !ntcHtml.includes('삭제'))
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
  const mvHtml = await (await get('/assets/movement', 'ASSET_MGR')).text()
  check('불출·이동: 대기열·재배치 재고 렌더', mvHtml.includes('불출 대기') && mvHtml.includes('이동 대기') && mvHtml.includes('재배치 우선 원칙'))
  // 승인만 되고 집행되지 않은 이동이 대기열에 보여야 한다 (승인 ≠ 집행)
  check('불출·이동: 미집행 승인 이동이 대기열에 노출', mvHtml.includes('APR-2607-101') && mvHtml.includes('본사 9F'))
  // 재배치 우선 원칙 — 승인된 자산 신청(APR-2607-116, 희망 유형 단말)이 불출 대기에 노출되고 희망 유형이 표시된다
  check('불출: 승인 자산 신청 불출 대기 + 희망 유형 노출', mvHtml.includes('APR-2607-116') && mvHtml.includes('희망 유형') && mvHtml.includes('노트북 지급'))
  // 유형 매칭 추천 — 단말 신청에 일치하는 유휴 단말(AST-2021-000432)이 ✓ 표기로 우선 추천된다
  check('불출: 희망 유형 일치 유휴 재고 우선 추천(✓)', mvHtml.includes('✓ AST-2021-000432') && mvHtml.includes('· 단말'))
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
  check('신청 상신: 사용자에게 신청 UI 노출', apUser.includes('신청 상신') && apUser.includes('신청하기'))
  check('상신 취소: 본인 대기 신청에 취소 버튼 노출', apUser.includes('상신 취소') && apUser.includes('APR-2607-121'))
  // 소유자 확인은 결재가 아니라 부서 응답 — 요청받은 부서(플랫폼개발팀=김민준)에게만 응답 버튼이 뜬다
  check('소유자 확인: 해당 부서 사용자에게 응답 버튼', apUser.includes('APR-2607-114') && apUser.includes('본인 자산'))
  const apSec = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('소유자 확인: 타 부서에는 응답 버튼 미노출', apSec.includes('APR-2607-114') && apSec.includes('부서 응답 대기'))
  const insHtml = await (await get('/ai/insights', 'SEC_MGR')).text()
  check('AI 제안: 판정 UI·환류 지표 렌더', insHtml.includes('판정 대기 제안') && insHtml.includes('채택률') && insHtml.includes('재학습 신호'))
  check('AI 제안: 기능별 판정 현황 5종', ['자동분류', '이상탐지', '수명예측', '취약점 우선순위', '라이선스 최적화'].every((k) => insHtml.includes(k)))
  // AI 제안 목록 필터 — 상태(제안/승인/반려)·기능·심각도
  check('AI 제안: 목록 상태·기능·심각도 필터 렌더', insHtml.includes('기능 — 전체') && insHtml.includes('심각도 — 전체'))
  // 취약점 노출 우선순위(§05 기능04) — 자산 중요도 × 노출도 스코어링. 외부 CVE·EOL OS·미인가 SW·크리덴셜 노출 합성.
  check('AI 제안: 취약점 노출 우선순위 스코어링 렌더', insHtml.includes('취약점 노출 우선순위') && insHtml.includes('자산 중요도 × 노출도') && insHtml.includes('P1 — 즉시 조치'))
  // EOL OS(CentOS 7)·외부 CVE 가 스코어링 대상에 포함됨을 확인 (시드 AST-2020-000883 CentOS 7.9)
  check('AI 제안: 취약점 우선순위에 EOL OS·외부 CVE 반영', insHtml.includes('EOL OS') && insHtml.includes('CentOS 7') && insHtml.includes('외부 노출 CVE'))
  // 미조치 외부 CVE(legacy-vpn·무action, CVE-2018-13379)는 포함, 이미 차단요청된 CVE(db-backup·action, CVE-2024-10977)는 제외 — 조치분은 '즉시 조치'가 아니다
  // (db-backup 호스트는 크리덴셜 노출로도 잡혀 화면에 남으므로, 외부 CVE 제외는 CVE 번호로 검증)
  check('AI 제안: 취약점 우선순위가 조치 요청된 외부 CVE 제외 (미조치만)', insHtml.includes('CVE-2018-13379') && !insHtml.includes('CVE-2024-10977'))
  const fndHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 소유자 확인·에스컬레이션 진입점', fndHtml.includes('미확인 소유자 정책') && fndHtml.includes('미응답 에스컬레이션') && fndHtml.includes('응답 대기'))
  // 지문 병합 — 화면이 '지문 병합 후'라고 주장하려면 원시 관측과 병합 근거가 있어야 한다
  check('발견 자산: 원시 관측 대비 병합 결과 표시', fndHtml.includes('원시 관측') && fndHtml.includes('중복'))
  check('발견 자산: 다채널 병합 표기', fndHtml.includes('채널 병합'))
  check('발견 자산: 병합 후보 카드', fndHtml.includes('병합 후보') && fndHtml.includes('DSC-2607-0045') && fndHtml.includes('호스트명 동일'))
  const intHtml2 = await (await get('/platform/integrations', 'ADMIN')).text()
  check('연동: 알림 발송 이력(검색·필터) 렌더', intHtml2.includes('알림 발송 이력') && intHtml2.includes('MSG-4001') && intHtml2.includes('만료 임박') && intHtml2.includes('수신·제목·연결 문서 검색'))
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
  // 자산 현황·대여 현황 질의 프리셋 — 상태 분포·전체 대여 현황을 자연어로 묻는 인텐트
  check('AI 어시스턴트: 자산 상태 분포·대여 현황 질의 프리셋 렌더', aiAsst.includes('자산 상태 분포와 대여 현황'))
  // 발견 자산 AI 요약 브리핑 프리셋 (제품안내서 §05 AI 어시스턴트)
  check('AI 어시스턴트: 발견 자산 요약 브리핑 프리셋 렌더', aiAsst.includes('발견 자산 요약 브리핑'))
  // 자산 보증 만료(유형+기간 스코프) 프리셋 — 안내서 §05 예시 질의 "내년 1분기 보증 만료되는 네트워크 장비 목록"
  //  (기간 파싱: 분기·반기·월·연도 창으로 만료 대상을 좁힌다 — lib/dates parsePeriodWindow)
  check('AI 어시스턴트: 자산 보증 만료(유형) 질의 프리셋 렌더', aiAsst.includes('보증 만료되는 네트워크 장비 목록'))
  check('AI 어시스턴트: 보증 만료 기간 스코프(내년 1분기) 질의 프리셋 렌더', aiAsst.includes('내년 1분기 보증 만료되는 네트워크 장비 목록'))
  // 자산 가치·감가상각 질의 프리셋 — 취득가·잔존가치(장부가) 원가 체인 질의
  check('AI 어시스턴트: 자산 가치·감가상각 질의 프리셋 렌더', aiAsst.includes('자산 가치 현황 (취득가·잔존가치·감가상각)'))
  // 교체 대상·수명 예측 질의 프리셋 — AI 기능 03(수명주기·교체 예측) 인라인 질의 (리포트 생성과 별개)
  check('AI 어시스턴트: 교체 대상·수명 예측 질의 프리셋 렌더', aiAsst.includes('교체 대상 자산과 교체 예산 (내용연수·보증·EOL OS)'))
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
  // 데이터 스코핑 — USER 는 본인 자산 카드만
  check('자산 카드: USER 본인 자산은 발급 (200)', (await get('/api/asset-card/AST-2023-000112', 'USER')).status === 200)
  check('자산 카드: USER 타인 자산은 차단 (403)', (await get('/api/asset-card/AST-2023-000561', 'USER')).status === 403)
  // 수리중 자산 카드에 수리 의뢰(업체·예상반환) 행 — 상세·엑셀과 일관. 시드 AST-2024-000512(중부IT서비스)로 검증
  const cardRepair = await (await get('/api/asset-card/AST-2024-000512', 'ASSET_MGR')).text()
  check('자산 카드: 수리중 자산에 수리 의뢰 행(업체·예상반환)', cardRepair.includes('수리 의뢰') && cardRepair.includes('중부IT서비스') && cardRepair.includes('예상반환 2026-07-28'))
  // 자산 카드 누적 수리비 행 — 수리 비용 이력이 있는 자산(AST-2023-000112, 누계 243,000원 2건)에 노출
  const cardCost = await (await get('/api/asset-card/AST-2023-000112', 'ASSET_MGR')).text()
  check('자산 카드: 수리 이력 자산에 누적 수리비 행(TCO)', cardCost.includes('누적 수리비') && cardCost.includes('243,000원') && cardCost.includes('(2건)'))
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
  check('통합 검색: 보안담당이 발견 자산을 교차 검색', srchDisc.groups.some((g) => g.kind === '발견 자산' && g.items.some((i) => i.href.includes('/discovery/found'))))
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
  check('리포트: 8종 유형·생성 UI 렌더', repHtml.includes('주간 Shadow IT 브리핑') && repHtml.includes('감사 대응 자료') && repHtml.includes('연간 교체 계획') && repHtml.includes('취약점 조치 우선순위') && repHtml.includes('AI 거버넌스·성능') && repHtml.includes('결재 첨부용'))
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
  // 연간 교체 계획에 잔존가치(장부가) 반영 — 유형 설명·생성 리포트에 반영
  check('리포트: 연간 교체 계획에 잔존가치 반영', repHtml.includes('내용연수·보증 경과·OS 지원 종료(EOL) 기준 교체 대상·잔존가치'))
  // 연간 교체 계획에 OS 지원 종료(EOL) 자산이 하드웨어 노후와 별개 교체 드라이버로 반영 (생성 시 buildSections 가 EOL 섹션 산출)
  check('리포트: 연간 교체 계획에 EOL OS 교체 드라이버 반영', repHtml.includes('OS 지원 종료(EOL)'))
  const repText = text(repHtml)
  check('리포트: 자동 생성 스케줄 렌더 (수정·예약 실행)', repText.includes('자동 생성 스케줄') && repText.includes('예약 실행') && repText.includes('매주 월요일') && repText.includes('수정'))
  check('리포트: 밀린 스케줄이 기한 도래로 표시', repText.includes('기한 도래'))
  check('리포트: 수시 유형은 스케줄 없음 표기', repText.includes('수시') && repText.includes('사유 발생 시 수동 생성'))
  check('리포트: 중지된 스케줄 표기', repText.includes('라이선스 컴플라이언스') && repText.includes('중지'))
  // 보안 정례 리포트 스케줄 편입 — 주간 취약점 조치 우선순위·월간 AI 거버넌스·성능 자동 생성·배포(로17). 스케줄 5건·가동 4건.
  check('리포트: 보안 정례 스케줄 편입 (자동 5·가동 4)', repText.includes('자동 5(가동 4)'))
  const scanHtml = await (await get('/settings/scan-policy', 'ADMIN')).text()
  check('탐지 채널 정책: 6채널·강도 통제 렌더', scanHtml.includes('네트워크 능동 스캔') && scanHtml.includes('스캔 안전장치') && scanHtml.includes('23:00 ~ 05:00'))
  // 대역·시간대 정책 편집(§07 스캔 안전장치) — 능동 스캔 채널에 정책 편집 컨트롤. 시간대는 로15(시간대 밖 사유 필요)의 통제 원천.
  check('탐지 채널 정책: 능동 스캔 대역·시간대 정책 편집 노출', scanHtml.includes('정책 편집') && scanHtml.includes('비고 · 정책 편집'))
  // 재탐지 주기 편집(§04 스케줄러) — 강도·대역·시간대뿐 아니라 재탐지 주기도 전 채널에서 조정 가능(표시 전용 공백 보완)
  check('탐지 채널 정책: 재탐지 주기(스케줄러) 편집 노출', scanHtml.includes('재탐지 주기 변경 (스케줄러)'))
  const catHtml = await (await get('/settings/saas-catalog', 'ADMIN')).text()
  check('SaaS 카탈로그: 판정 상태 렌더', catHtml.includes('Dropbox') && catHtml.includes('검토중'))
  // 차단 판정 → 집행 통보 — 차단이 정책 표시로 끝나지 않고 보안운영팀 차단 집행 요청으로 이어짐을 명시
  check('SaaS 카탈로그: 차단 집행 통보 안내 렌더', catHtml.includes('차단은 집행으로 이어집니다') && catHtml.includes('프록시·DNS 차단 집행 요청'))
  // 데이터 등급 분류 편집 — 표시 전용이던 데이터 민감도(일반/민감/기밀)를 Admin 이 분류(차단 우선순위·기밀 취급 집계 근거)
  check('SaaS 카탈로그: 데이터 등급 분류 편집 노출', catHtml.includes('데이터 민감도 등급 분류'))
  const saasSec = await (await get('/discovery/saas', 'SEC_MGR')).text()
  check('Shadow SaaS: 보안담당에 판정(인가·차단) 버튼 노출', saasSec.includes('판정') && saasSec.includes('차단'))
  const saasAsset = await (await get('/discovery/saas', 'ASSET_MGR')).text()
  check('Shadow SaaS: 자산담당은 판정 버튼 미노출 (조회만)', !saasAsset.includes('>차단<'))
  // 부서별 미인가 SaaS 노출 요약 — 어느 부서가 Shadow SaaS 위험이 큰지 우선순위화(제품안내서 부서별). '최고 위험도'는 요약 표에만 있는 헤더.
  check('Shadow SaaS: 부서별 미인가 노출 요약 렌더', saasSec.includes('부서별 미인가 SaaS 노출') && saasSec.includes('최고 위험도') && saasSec.includes('전사'))
  // 목록 필터 — 부서·인가 여부·검색 (다른 목록 화면과 동일 패턴, 그동안 SaaS 표만 무필터였다)
  check('Shadow SaaS: 목록 필터(부서·인가여부·검색) 렌더', saasSec.includes('부서 — 전체') && saasSec.includes('서비스·분류·부서 검색'))
  // 중복 기능 SaaS 통합 후보(라이선스 최적화) — 같은 분류에 2종 이상 서비스가 관측되면 통합 대상. 시드 '협업'=Notion+Miro(둘 다 미인가).
  check('Shadow SaaS: 중복 기능 통합 후보 렌더 (협업=Notion+Miro)', saasSec.includes('중복 기능 SaaS 통합 후보') && saasSec.includes('통합 후보 (중복 기능)') && /협업[\s\S]{0,400}Notion[\s\S]{0,400}Miro|협업[\s\S]{0,400}Miro[\s\S]{0,400}Notion/.test(saasSec) && saasSec.includes('통합 권고'))
  const stockHtml = await (await get('/inventory/stock', 'ASSET_MGR')).text()
  check('재고 현황: 조사 계획 등록이 재물조사 계획으로 연결', stockHtml.includes('/inventory/survey-plan'))
  // 유형별 보유 집계 → 자산 대장 드릴다운 (?cat= 필터 링크)
  check('재고 현황: 유형별 집계가 필터된 자산 대장으로 드릴다운', stockHtml.includes('/assets/register?cat='))
  // 유형·부서·위치별 세그먼트 (제품안내서 §03 "유형·부서·위치별 보유 현황")
  check('재고 현황: 유형·부서·위치별 세그먼트 렌더', stockHtml.includes('보유 현황 — 유형·부서·위치별') && stockHtml.includes('부서별') && stockHtml.includes('위치별'))
  // 자산 가치 현황 — 유형별 취득가·잔존가치(정액법 감가상각) + 장부가 총액 KPI
  check('재고 현황: 유형별 자산 가치(취득가·잔존가치·감가상각률)', stockHtml.includes('유형별 자산 가치') && stockHtml.includes('총 취득가') && stockHtml.includes('총 잔존가치(장부가)') && stockHtml.includes('감가상각률'))
  check('재고 현황: 자산 잔존가치(장부가 총액) KPI', stockHtml.includes('자산 잔존가치 (장부가 총액)'))
  // 재고 엑셀에 유형별 가치 시트 반출 — 취득가·잔존가치 컬럼
  const stockBuf = Buffer.from(await (await get('/api/export/stock', 'ASSET_MGR')).arrayBuffer()).toString('utf8')
  check('재고 엑셀: 유형별 가치 시트(취득가·잔존가치) 반출', stockBuf.includes('총 취득가') && stockBuf.includes('총 잔존가치') && stockBuf.includes('감가상각률'))
  // 필터 딥링크가 자산 대장에서 실제로 유효 (cat 파라미터 수용)
  const drillHtml = await (await get('/assets/register?cat=%EC%84%9C%EB%B2%84', 'ASSET_MGR')).text()
  check('자산 대장: ?cat= 딥링크 진입 정상 렌더', drillHtml.includes('상태 — 전체') && drillHtml.includes('AST-2023-000561'))
  const codeHtml = await (await get('/settings/codes', 'ADMIN')).text()
  check('공통코드: 그룹·값 렌더', codeHtml.includes('ASSET_CATEGORY') && codeHtml.includes('미사용 처리'))
  check('공통코드: 신규 등록 폼 렌더', codeHtml.includes('새 코드 추가') && codeHtml.includes('전 화면 드롭다운'))
  check('공통코드: 명칭 수정 · 미사용 관리 컨트롤 렌더', codeHtml.includes('수정') && /class="[^"]*btn[^"]*sm/.test(codeHtml))
  const aiHtml = await (await get('/settings/ai-policy', 'ADMIN')).text()
  check('AI 정책: 실행 환경·거버넌스 렌더', aiHtml.includes('온프레미스 LLM') && aiHtml.includes('권한 범위 필터'))
  // 모델·프롬프트 버전 관리(§05 AI 거버넌스) — 배포 모델·프롬프트 버전 변경 관리 원장. AI 거버넌스·성능 리포트 근거.
  check('AI 정책: 모델·프롬프트 버전 관리 컨트롤', aiHtml.includes('모델 · 프롬프트 버전 관리') && aiHtml.includes('버전 관리'))
  // 감사 로그 보존 기간 관리 — 규제·컴플라이언스 정책값(표시 전용이던 것을 Admin 이 30~3650일로 설정)
  check('AI 정책: 감사 로그 보존 기간 관리 컨트롤', aiHtml.includes('감사 로그 보존 기간') && aiHtml.includes('보존 기간 관리'))
  // 운영 정책(임계값) — 코드 상수로 고정돼 표시만 되던 기한·SLA·판정 기준을 스토어로 승격해 Admin 이 설정(화면·리포트·스케줄러 공용)
  check('AI 정책: 운영 정책(기한·SLA·판정 기준) 관리 컨트롤', aiHtml.includes('운영 정책 — 기한 · SLA · 판정 기준') && aiHtml.includes('소유자 확인 기한') && aiHtml.includes('장기 미실측 기준'))
  const usrHtml = await (await get('/settings/users', 'ADMIN')).text()
  check('사용자 · 결재선: 결재선·필수 결재·단계 편집 렌더', usrHtml.includes('IT기획팀장') && usrHtml.includes('필수 결재') && usrHtml.includes('편집'))
  check('사용자 · 결재선: STEP 4 권한그룹 배정 컨트롤 렌더', usrHtml.includes('사용자 · 권한그룹 배정') && usrHtml.includes('select'))
  // 사용자별 보유 자산 수 — 계정 관리 시 자산 부담 가시성 + 해당 사용자 자산 대장 드릴다운
  check('사용자: 보유 자산 수 + 자산 대장 드릴 링크', usrHtml.includes('보유 자산') && usrHtml.includes('/assets/register?q='))
  // MFA 등록 요구 — 미적용 사용자(시드 2명)가 있어 일괄 요구 버튼 + 행별 요구 버튼 노출(보안 정책 집행)
  check('사용자: MFA 미등록자 등록 요구 버튼(보안 정책)', usrHtml.includes('MFA 미등록자 등록 요구') && usrHtml.includes('미적용'))
  check('사용자 · 결재선: 필수 결재선 잠금 표시(🔒)', usrHtml.includes('🔒') && usrHtml.includes('해제할 수 없'))
  check('사용자 · 결재선: 선택 결재선 토글 버튼 렌더', /class="[^"]*btn[^"]*sm/.test(usrHtml))
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

  const routeClaims = [...claims(readme, /\((\d+) 라우트 × 4/g), ...claims(summary, /(\d+) 라우트 × 4/g)]
  check(`문서: 라우트 수 ${routes}개 일치`, allSame(routeClaims, routes), `주장=${routeClaims.join(',')} 실제=${routes}`)

  // 폐쇄 루프 — README 의 번호 매긴 항목 수가 기준
  // 다음 '## ' 제목 전까지만 — 끝까지 자르면 '데모 시나리오'의 번호 목록까지 세어 버린다
  const loopStart = readme.indexOf('## 동작하는 폐쇄 루프')
  const loopEnd = readme.indexOf('\n## ', loopStart + 1)
  const loopSection = readme.slice(loopStart, loopEnd === -1 ? undefined : loopEnd)
  const loops = [...loopSection.matchAll(/^(\d+)\. \*\*/gm)].length
  const loopClaims = [...claims(readme, /폐쇄 루프 (\d+)종/g), ...claims(summary, /폐쇄 루프 (\d+)종/g)]
  check(`문서: 폐쇄 루프 ${loops}종 일치`, allSame(loopClaims, loops), `주장=${loopClaims.join(',')} 실제=${loops}`)

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
