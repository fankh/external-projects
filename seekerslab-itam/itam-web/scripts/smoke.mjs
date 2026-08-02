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
  // 다중 선택(보증 일괄 연장·선택 내보내기 공용) — 자산담당에 전체 선택 체크박스 노출, 사용자엔 미노출(canEdit)
  check('자산 대장: 다중 선택 전체 선택 체크박스(자산담당)', mgrHtml.includes('현재 필터의 자산 전체 선택'))
  check('자산 대장: 사용자에겐 다중 선택 미노출(조회 전용)', !userHtml.includes('현재 필터의 자산 전체 선택'))
  // 자산 → 계약 딥링크 — 계약 연계 자산을 선택하면 상세의 연계 계약이 계약 화면 링크로 렌더
  const regContractDetail = await (await get('/assets/register?sel=AST-2023-000112', 'ASSET_MGR')).text()
  check('자산 대장: 상세 연계 계약이 계약 화면 딥링크', regContractDetail.includes('/inventory/contracts?sel=') && regContractDetail.includes('계약 상세로 이동'))
  // 연관 자산(영향도) — 같은 계약·위치·소유자·모델 공유 자산 수 + 드릴 링크
  check('자산 대장: 상세에 연관 자산(영향도) 섹션 + 드릴 링크', regContractDetail.includes('연관 자산') && regContractDetail.includes('같은 모델'))

  console.log('\n[핵심 화면 콘텐츠]')
  const dashHtml = await (await get('/dashboard', 'ASSET_MGR')).text()
  // 대시보드의 '미등록 신규 발견'은 아직 손대지 않은 건만 보여주는 처리 대기열이므로,
  // 확인요청·격리요청이 걸린 자산(DSC-2607-0041 등)은 여기서 빠지는 것이 정상이다
  check('대시보드: KPI·발견 자산·내 결재 차례·운영 대기 렌더', dashHtml.includes('미등록 신규 발견') && dashHtml.includes('DSC-2607-0042') && dashHtml.includes('내 결재 차례') && dashHtml.includes('운영 대기'))
  check('대시보드: 처리 착수한 발견 자산은 대기열에서 제외', !dashHtml.includes('DSC-2607-0041'))
  // 대여 반환 연체 — 시드에 기한 경과 대여 자산이 있어 자산담당 운영 대기 큐에 노출된다
  check('대시보드: 대여 반환 연체 운영 큐 노출 (자산담당)', dashHtml.includes('대여 반환 연체'))
  // 장기 미실측 — 시드 유령 후보 2건이 있어 자산담당 운영 큐에 재물조사 편성 대상으로 노출된다
  check('대시보드: 장기 미실측 운영 큐 노출 (자산담당)', dashHtml.includes('장기 미실측'))
  // 보증 만료 임박 자산 — 개별 자산 보증 만료를 대시보드 운영 큐에 surфacing (?warranty=soon 드릴)
  check('대시보드: 보증 만료 임박 자산 큐 + 드릴 링크', dashHtml.includes('보증 만료 임박 자산') && dashHtml.includes('warranty=soon'))
  // 대여자 관점 — 목업 사용자(김민준)가 대여 중인 자산(AST-2024-000230)의 반환 기한이 My Work 에 노출된다
  const dashUser = await (await get('/dashboard', 'USER')).text()
  check('대시보드(사용자): 내 대여 자산 반환 기한 노출', dashUser.includes('내 대여 자산') && dashUser.includes('AST-2024-000230') && dashUser.includes('까지'))
  const foundHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 6채널·대사 상태·일괄 편입 렌더', foundHtml.includes('네트워크 능동 스캔') && foundHtml.includes('등록·불일치') && foundHtml.includes('선택 일괄 편입 요청'))
  // 서버·IDC망(10.10.x)에 나타난 미등록 단말 — 서버 VLAN 침입 의심 (어시스턴트 발견 인텐트가 세그먼트로 식별)
  check('발견 자산: 서버 대역 미등록 단말(DESKTOP-UNK09) 노출', foundHtml.includes('DESKTOP-UNK09') && foundHtml.includes('10.10.8.77'))
  const contractsHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약·라이선스: 보유–사용 대사·등록(계약·라이선스) 렌더', contractsHtml.includes('JetBrains') && contractsHtml.includes('초과 사용') && contractsHtml.includes('라이선스 등록') && contractsHtml.includes('계약 등록'))
  // 부속서류 — 계약 근거 문서(계약서·견적서·세금계산서) 관리 (제품안내서 §03 구매 계약). 문서 상세는 토글 확장이라 SSR엔 컬럼·📎버튼만
  check('계약: 부속서류 컬럼 + 문서 토글 버튼 렌더', contractsHtml.includes('부속서류') && contractsHtml.includes('📎'))
  // 유지보수 계약 — SLA·비용 이력 관리 (제품안내서 §03 유지보수 계약). 상세는 토글 확장이라 SSR엔 버튼 title 만
  check('계약: 유지보수 계약에 SLA·비용 이력 관리 토글 노출', contractsHtml.includes('SLA · 비용 이력'))
  const aprHtml = await (await get('/workflow/approvals', 'SEC_MGR')).text()
  check('결재함: 격리 요청 문서 렌더', aprHtml.includes('격리 요청') && aprHtml.includes('APR-2607-112'))
  check('결재함: 결재선 라우팅 표시 (단계 + 필수)', aprHtml.includes('결재선') && aprHtml.includes('IT기획팀장') && aprHtml.includes('보안담당'))
  check('결재함: 다단계 결재선 — 자산 신청에 부서장 단계 노출', aprHtml.includes('부서장'))
  const permHtml = await (await get('/settings/permissions', 'ADMIN')).text()
  check('권한 매트릭스: 파이프라인·매트릭스 렌더', permHtml.includes('메뉴권한관리') && permHtml.includes('클릭해 변경'))
  check('권한 매트릭스: 잠금 칸 표시 (Admin 자기 잠금 방지)', permHtml.includes('🔒'))
  const menuHtml = await (await get('/settings/menus', 'ADMIN')).text()
  check('메뉴 관리: STEP 1 기능 사전 렌더', menuHtml.includes('기능 정의') && menuHtml.includes('/api/export/[kind]'))
  check('메뉴 관리: STEP 2 메뉴 레지스트리 렌더', menuHtml.includes('화면번호') && menuHtml.includes('DSC-010') && menuHtml.includes('/discovery/found'))
  // 매트릭스의 '강제' 표시는 이제 메뉴 정의에서 파생된다 — 두 화면이 어긋나면 안 된다
  check('메뉴 관리 ↔ 매트릭스 정합', menuHtml.includes('발견 자산 · CMDB 대사') && permHtml.includes('서버가 직접 강제하는 권한'))
  check('권한 매트릭스: 강제 구분 안내', permHtml.includes('서버가 직접 강제하는 권한') && permHtml.includes('필요조건'))
  const extHtml = await (await get('/discovery/external', 'SEC_MGR')).text()
  check('외부 공격표면: 수동·능동 기법 렌더', extHtml.includes('인증서 투명성') && extHtml.includes('존 트랜스퍼'))
  check('외부 공격표면: 노출 자산·CVE 렌더', extHtml.includes('legacy-vpn.seekerslab.co.kr') && extHtml.includes('CVE-2018-13379'))
  check('외부 공격표면: 위협 인텔·유출 수집 렌더', extHtml.includes('스틸러 로그'))
  check('외부 공격표면: 보안담당에 유출 대응 컨트롤 노출', extHtml.includes('검출에서 대응까지') && /class="[^"]*btn[^"]*danger/.test(extHtml))
  check('외부 공격표면: 보안담당에 노출 자산 조치(편입/차단 요청) 노출', extHtml.includes('편입 요청') && extHtml.includes('차단 요청'))
  check('외부 공격표면: 이미 차단요청된 노출 자산 상태 표기', extHtml.includes('차단요청'))
  const extAsset = await (await get('/discovery/external', 'ASSET_MGR')).text()
  check('외부 공격표면: 자산담당엔 유출 대응 버튼 미노출 (조회만)', !extAsset.includes('대응</button>'))
  check('외부 공격표면: 자산담당엔 노출 자산 조치 버튼 미노출', !extAsset.includes('편입 요청</button>'))
  const ntcHtml = await (await get('/board/notices', 'USER')).text()
  check('공지사항: 목록·본문 렌더', ntcHtml.includes('2026 하반기 재물조사') && ntcHtml.includes('필독'))
  check('공지사항: 사용자에게 등록·관리 버튼 미노출', !ntcHtml.includes('공지 등록') && !ntcHtml.includes('삭제'))
  // 필독 공지 읽음 확인 — 상단 고정 공지가 기본 선택돼 사용자에게 읽음 확인 UI·커버리지 집계가 보인다
  check('공지사항: 필독 공지 읽음 확인 UI·커버리지 렌더 (사용자)', ntcHtml.includes('읽음 확인') && ntcHtml.includes('필독 확인') && ntcHtml.includes('명'))
  const ntcAdmin = await (await get('/board/notices', 'ADMIN')).text()
  check('공지사항: Admin 관리 컨트롤 노출 (등록·수정·고정 토글·삭제)', ntcAdmin.includes('공지 등록') && ntcAdmin.includes('수정') && ntcAdmin.includes('삭제') && (ntcAdmin.includes('고정 해제') || ntcAdmin.includes('상단 고정')))
  // 필독 미확인자 안내 발송 — 커버리지 미달 필독 공지에 Admin 독촉 버튼 노출 (기본 선택 필독 공지가 0/N 확인 상태)
  check('공지사항: 필독 미확인자 안내 발송 컨트롤 (Admin)', ntcAdmin.includes('안내 발송'))
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
  check('도입·검수: 발주 연계 입고 등록 진입점', inHtml.includes('입고 등록'))
  check('도입·검수: QR·바코드 SVG 발행', (inHtml.match(/<svg/g) ?? []).length >= 2 && inHtml.includes('AST-2025-000033'))
  // 도입 예정 — ITSM SR·발주 사전 등록 → 도착 전 자산 (제품안내서 §06 ITSM·구매 연동)
  check('도입·검수: 도입 예정(ITSM SR·발주) 섹션 + 시드 사전등록 + 도착 처리', inHtml.includes('도입 예정') && inHtml.includes('SR-2607-041') && inHtml.includes('입고 등록 (도착)'))
  const mvHtml = await (await get('/assets/movement', 'ASSET_MGR')).text()
  check('불출·이동: 대기열·재배치 재고 렌더', mvHtml.includes('불출 대기') && mvHtml.includes('이동 대기') && mvHtml.includes('재배치 우선 원칙'))
  // 승인만 되고 집행되지 않은 이동이 대기열에 보여야 한다 (승인 ≠ 집행)
  check('불출·이동: 미집행 승인 이동이 대기열에 노출', mvHtml.includes('APR-2607-101') && mvHtml.includes('본사 9F'))
  const rtHtml = await (await get('/assets/returns', 'ASSET_MGR')).text()
  check('반납·유휴: 접수 대기·유휴 풀 렌더', rtHtml.includes('반납 접수 대기') && rtHtml.includes('유휴 자산 풀') && rtHtml.includes('상태 점검'))
  check('반납·유휴: 반납대기 자산이 접수 대기에 노출', rtHtml.includes('AST-2025-000513'))
  check('반납·유휴: 수리중 지표·수리 워크플로 노출', rtHtml.includes('수리중') && rtHtml.includes('수리 필요는 수리중을 거쳐'))
  check('반납·유휴: 수리 대기 카드에 수리중 자산 노출 (시드 시나리오)', rtHtml.includes('수리 대기') && rtHtml.includes('AST-2025-000377'))
  check('반납·유휴: 대여 현황 패널 + 대여중 자산·반환 접수 노출', rtHtml.includes('대여 현황') && rtHtml.includes('AST-2024-000230') && rtHtml.includes('반환 접수'))
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
  const fndHtml = await (await get('/discovery/found', 'SEC_MGR')).text()
  check('발견 자산: 소유자 확인·에스컬레이션 진입점', fndHtml.includes('미확인 소유자 정책') && fndHtml.includes('미응답 에스컬레이션') && fndHtml.includes('응답 대기'))
  // 지문 병합 — 화면이 '지문 병합 후'라고 주장하려면 원시 관측과 병합 근거가 있어야 한다
  check('발견 자산: 원시 관측 대비 병합 결과 표시', fndHtml.includes('원시 관측') && fndHtml.includes('중복'))
  check('발견 자산: 다채널 병합 표기', fndHtml.includes('채널 병합'))
  check('발견 자산: 병합 후보 카드', fndHtml.includes('병합 후보') && fndHtml.includes('DSC-2607-0045') && fndHtml.includes('호스트명 동일'))
  const intHtml2 = await (await get('/platform/integrations', 'ADMIN')).text()
  check('연동: 알림 발송 이력(검색·필터) 렌더', intHtml2.includes('알림 발송 이력') && intHtml2.includes('MSG-4001') && intHtml2.includes('만료 임박') && intHtml2.includes('수신·제목·연결 문서 검색'))
  // 연결 문서(ref) 딥링크 — 시드 발송 이력의 계약·결재 ref 가 대상 화면 링크로 렌더된다
  check('연동: 발송 이력 연결 문서 딥링크 렌더', intHtml2.includes('연결 문서 열기') && intHtml2.includes('/inventory/contracts'))
  const ctHtml = await (await get('/inventory/contracts', 'ASSET_MGR')).text()
  check('계약: 만료 임박 알림 발송 진입점', ctHtml.includes('만료 임박 알림 발송'))
  check('계약: 라이선스 조치(4단계) 진입점', ctHtml.includes('추가 구매') && ctHtml.includes('회수') && ctHtml.includes('검출에서 조치까지'))
  check('계약: 계약 갱신 컨트롤 렌더 (자산담당)', ctHtml.includes('>갱신<'))
  // 계약 → 자산 드릴다운 — 계약의 자산 수가 그 계약의 자산 대장(?q=계약번호)으로 연결
  check('계약: 자산 수가 계약 연계 자산 대장으로 드릴다운', ctHtml.includes('/assets/register?q=CT') && ctHtml.includes('이 계약의 자산 대장 보기'))
  // AI 가동 표시 — 키 존재가 아니라 실제 호출 결과를 말해야 한다.
  // 스모크는 키 없이 도므로 '키 미설정' 이 정확한 상태이며, 근거 없이 '가동' 이라 주장하면 안 된다.
  const aiRep = await (await get('/ai/reports', 'ASSET_MGR')).text()
  const aiAsst = await (await get('/ai/assistant', 'USER')).text()
  const claimsLive = (h) => h.includes('AI 서술 생성 — 최근 성공') || h.includes('온프레미스 LLM 연결됨')
  check('AI 상태: 키 미설정 시 가동을 주장하지 않음', !claimsLive(aiRep) && !claimsLive(aiAsst))
  // 어시스턴트 프리셋 질의에 운영 리스크(분실·대여 연체·장기 미실측) 인텐트가 노출된다
  check('AI 어시스턴트: 운영 리스크 자산 질의 프리셋 렌더', aiAsst.includes('장기 미실측') && aiAsst.includes('대여 연체'))
  // 자산 현황·대여 현황 질의 프리셋 — 상태 분포·전체 대여 현황을 자연어로 묻는 인텐트
  check('AI 어시스턴트: 자산 상태 분포·대여 현황 질의 프리셋 렌더', aiAsst.includes('자산 상태 분포와 대여 현황'))
  // 발견 자산 AI 요약 브리핑 프리셋 (제품안내서 §05 AI 어시스턴트)
  check('AI 어시스턴트: 발견 자산 요약 브리핑 프리셋 렌더', aiAsst.includes('발견 자산 요약 브리핑'))
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
  // 폐기 증적 대장 엑셀 반출 — 감사 대응용 전체 폐기 레코드 (개별 확인서와 별개)
  const dispPage = await (await get('/assets/disposal', 'ASSET_MGR')).text()
  check('폐기 처리: 폐기 증적 대장 엑셀 버튼 노출', dispPage.includes('/api/export/disposals'))
  // 증적 사진 관리 — 완료 폐기 건에 사진 등록 토글 (제품안내서 §03 폐기: 증적(사진·확인서))
  check('폐기 처리: 완료 건에 증적 사진 관리 토글 노출', dispPage.includes('증적 사진'))
  // 자산 라벨 재발행 — 대장에서 손상·분실 라벨 재출력 (USER 제외, 자산 운영 권한)
  check('라벨 인쇄: 사용자 차단 (403)', (await get('/api/label/AST-2023-000112', 'USER')).status === 403)
  check('라벨 인쇄: 없는 자산 404', (await get('/api/label/NOPE', 'ADMIN')).status === 404)
  const label = await get('/api/label/AST-2023-000112', 'ASSET_MGR')
  const labelBody = await label.text()
  check('라벨 인쇄: 자산담당 발급 (200·QR·바코드)', label.status === 200 && labelBody.includes('AST-2023-000112') && labelBody.includes('SEEKERSLAB') && labelBody.includes('<svg'))
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
  // 선택 내보내기 — nos= 자산번호로 선택분만 반출(무압축 inlineStr라 버퍼에 평문)
  const selXlsx = await get('/api/export/assets?nos=' + encodeURIComponent('AST-2023-000112,AST-2023-000113'), 'ASSET_MGR')
  const selBuf = Buffer.from(await selXlsx.arrayBuffer())
  const selTxt = selBuf.toString('utf8')
  check('선택 내보내기: 선택 자산만 포함(112·113 포함, 561 미포함)', selXlsx.status === 200 && selTxt.includes('AST-2023-000112') && selTxt.includes('AST-2023-000113') && !selTxt.includes('AST-2023-000561'))
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
  // 알림 발송 이력 엑셀 — 발송 증적 반출 (보안담당·Admin, 화면 필터 반영)
  check('발송 이력 엑셀: 미로그인 차단 (401)', (await get('/api/dispatch-export')).status === 401)
  check('발송 이력 엑셀: 사용자 차단 (403)', (await get('/api/dispatch-export', 'USER')).status === 403)
  const dispXlsx = await get('/api/dispatch-export', 'SEC_MGR')
  check('발송 이력 엑셀: 보안담당 발급 (200·xlsx)', dispXlsx.status === 200 && (dispXlsx.headers.get('content-type') ?? '').includes('spreadsheet'))
  const dFull = Number(dispXlsx.headers.get('content-length') ?? 0)
  const dispFiltered = await get('/api/dispatch-export?channel=' + encodeURIComponent('문자'), 'SEC_MGR')
  const dFilt = Number(dispFiltered.headers.get('content-length') ?? 0)
  check('발송 이력 엑셀: 화면 필터 반영 반출 (채널=문자는 전체보다 작음)', dispFiltered.status === 200 && dFilt > 0 && dFilt < dFull, `full=${dFull} filtered=${dFilt}`)
  const stockXlsx = await get('/api/export/stock', 'SEC_MGR')
  check('엑셀 stock: 보안담당은 권한 밖 (403)', stockXlsx.status === 403, `status=${stockXlsx.status}`)
  const regHtml2 = await (await get('/assets/register', 'ASSET_MGR')).text()
  check('자산 대장: 엑셀 버튼 노출 (자산담당)', regHtml2.includes('/api/export/assets'))
  const asFull = await get('/api/export/assets', 'ASSET_MGR')
  const asFullLen = Number(asFull.headers.get('content-length') ?? 0)
  const asFilt = await get('/api/export/assets?cat=' + encodeURIComponent('단말'), 'ASSET_MGR')
  const asFiltLen = Number(asFilt.headers.get('content-length') ?? 0)
  check('자산 대장 엑셀: 화면 필터 반영 반출 (유형=단말은 전체보다 작음)', asFilt.status === 200 && asFiltLen > 0 && asFiltLen < asFullLen, `full=${asFullLen} filtered=${asFiltLen}`)
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
  check('리포트: 6종 유형·생성 UI 렌더', repHtml.includes('주간 Shadow IT 브리핑') && repHtml.includes('감사 대응 자료') && repHtml.includes('연간 교체 계획') && repHtml.includes('결재 첨부용'))
  const repText = text(repHtml)
  check('리포트: 자동 생성 스케줄 렌더 (수정·예약 실행)', repText.includes('자동 생성 스케줄') && repText.includes('예약 실행') && repText.includes('매주 월요일') && repText.includes('수정'))
  check('리포트: 밀린 스케줄이 기한 도래로 표시', repText.includes('기한 도래'))
  check('리포트: 수시 유형은 스케줄 없음 표기', repText.includes('수시') && repText.includes('사유 발생 시 수동 생성'))
  check('리포트: 중지된 스케줄 표기', repText.includes('라이선스 컴플라이언스') && repText.includes('중지'))
  const scanHtml = await (await get('/settings/scan-policy', 'ADMIN')).text()
  check('탐지 채널 정책: 6채널·강도 통제 렌더', scanHtml.includes('네트워크 능동 스캔') && scanHtml.includes('스캔 안전장치') && scanHtml.includes('23:00 ~ 05:00'))
  const catHtml = await (await get('/settings/saas-catalog', 'ADMIN')).text()
  check('SaaS 카탈로그: 판정 상태 렌더', catHtml.includes('Dropbox') && catHtml.includes('검토중'))
  // 차단 판정 → 집행 통보 — 차단이 정책 표시로 끝나지 않고 보안운영팀 차단 집행 요청으로 이어짐을 명시
  check('SaaS 카탈로그: 차단 집행 통보 안내 렌더', catHtml.includes('차단은 집행으로 이어집니다') && catHtml.includes('프록시·DNS 차단 집행 요청'))
  const saasSec = await (await get('/discovery/saas', 'SEC_MGR')).text()
  check('Shadow SaaS: 보안담당에 판정(인가·차단) 버튼 노출', saasSec.includes('판정') && saasSec.includes('차단'))
  const saasAsset = await (await get('/discovery/saas', 'ASSET_MGR')).text()
  check('Shadow SaaS: 자산담당은 판정 버튼 미노출 (조회만)', !saasAsset.includes('>차단<'))
  const stockHtml = await (await get('/inventory/stock', 'ASSET_MGR')).text()
  check('재고 현황: 조사 계획 등록이 재물조사 계획으로 연결', stockHtml.includes('/inventory/survey-plan'))
  // 유형별 보유 집계 → 자산 대장 드릴다운 (?cat= 필터 링크)
  check('재고 현황: 유형별 집계가 필터된 자산 대장으로 드릴다운', stockHtml.includes('/assets/register?cat='))
  // 유형·부서·위치별 세그먼트 (제품안내서 §03 "유형·부서·위치별 보유 현황")
  check('재고 현황: 유형·부서·위치별 세그먼트 렌더', stockHtml.includes('보유 현황 — 유형·부서·위치별') && stockHtml.includes('부서별') && stockHtml.includes('위치별'))
  // 필터 딥링크가 자산 대장에서 실제로 유효 (cat 파라미터 수용)
  const drillHtml = await (await get('/assets/register?cat=%EC%84%9C%EB%B2%84', 'ASSET_MGR')).text()
  check('자산 대장: ?cat= 딥링크 진입 정상 렌더', drillHtml.includes('상태 — 전체') && drillHtml.includes('AST-2023-000561'))
  const codeHtml = await (await get('/settings/codes', 'ADMIN')).text()
  check('공통코드: 그룹·값 렌더', codeHtml.includes('ASSET_CATEGORY') && codeHtml.includes('미사용 처리'))
  check('공통코드: 신규 등록 폼 렌더', codeHtml.includes('새 코드 추가') && codeHtml.includes('전 화면 드롭다운'))
  check('공통코드: 명칭 수정 · 미사용 관리 컨트롤 렌더', codeHtml.includes('수정') && /class="[^"]*btn[^"]*sm/.test(codeHtml))
  const aiHtml = await (await get('/settings/ai-policy', 'ADMIN')).text()
  check('AI 정책: 실행 환경·거버넌스 렌더', aiHtml.includes('온프레미스 LLM') && aiHtml.includes('권한 범위 필터'))
  const usrHtml = await (await get('/settings/users', 'ADMIN')).text()
  check('사용자 · 결재선: 결재선·필수 결재·단계 편집 렌더', usrHtml.includes('IT기획팀장') && usrHtml.includes('필수 결재') && usrHtml.includes('편집'))
  check('사용자 · 결재선: STEP 4 권한그룹 배정 컨트롤 렌더', usrHtml.includes('사용자 · 권한그룹 배정') && usrHtml.includes('select'))
  // 사용자별 보유 자산 수 — 계정 관리 시 자산 부담 가시성 + 해당 사용자 자산 대장 드릴다운
  check('사용자: 보유 자산 수 + 자산 대장 드릴 링크', usrHtml.includes('보유 자산') && usrHtml.includes('/assets/register?q='))
  check('사용자 · 결재선: 필수 결재선 잠금 표시(🔒)', usrHtml.includes('🔒') && usrHtml.includes('해제할 수 없'))
  check('사용자 · 결재선: 선택 결재선 토글 버튼 렌더', /class="[^"]*btn[^"]*sm/.test(usrHtml))
  const intHtml = await (await get('/platform/integrations', 'SEC_MGR')).text()
  check('연동 · 인프라: 커넥터·감사 로그(검색·필터) 렌더', intHtml.includes('EDR · 백신 콘솔') && intHtml.includes('감사 로그') && intHtml.includes('수행자·동작·대상 검색') && intHtml.includes('권한 밖 화면 접근 시도'))
  // 감사 로그 대상(target) 딥링크 — 시드 로그의 DSC- 대상이 발견 자산 화면 링크로 렌더된다
  check('연동: 감사 로그 대상 딥링크 렌더', intHtml.includes('대상으로 이동') && intHtml.includes('/discovery/found'))
  check('연동 · 인프라: 양방향 조치 채널 렌더', intHtml.includes('양방향') && intHtml.includes('SAML'))
  check('연동 · 인프라: 보안담당에 커넥터 연결 테스트 노출', intHtml.includes('연결 테스트') && intHtml.includes('연동'))
  check('연동 · 인프라: 보안담당에 감사 로그 엑셀 링크 노출', intHtml.includes('/api/audit-export'))
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
