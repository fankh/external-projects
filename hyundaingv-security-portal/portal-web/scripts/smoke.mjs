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
  '/awareness/violations': ALL,
  '/compliance/education': ALL,
  '/compliance/inspection': BIZ,
  '/work/todo': ALL,
  '/work/approvals': ALL,
  '/settings/users': ADM,
  '/settings/menus': ADM,
  '/settings/permissions': ADM,
  '/settings/codes': ADM,
  '/settings/forms': ADM,
  '/settings/audit': ADM,
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
    ['/dashboard', 'USER', ['개인별현황', '2026년 일반 보안서약서 제출', '재택 체크리스트', '보안교육 미이수', '계획수립 작성중']],
    ['/dashboard', 'BIZ_MGR', ['전사 운영 스냅샷', '조치중 장애', '미서약 인원']],
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
    // 자산등록 — 자산관리 어댑터 조회·미등록 식별
    ['/finance/asset-reg', 'BIZ_MGR', ['SN-NB-88121', 'AST-2025-0112', '미등록', '등록번호 취득']],
    // 투자 루프 — 계획 스코핑(USER=본인), 실적 집계, 확정 버튼(담당만)
    ['/finance/invest', 'USER', ['ERP 리포트 모듈 고도화', 'IP-2026-03', '계획대비실적', '정산품의 상신']],
    ['/finance/invest', 'BIZ_MGR', ['보안관제 시스템 증설', '계획 확정']],
    // 장애 루프 — 등록·조치·통계 상신·향후대책
    ['/infra/incidents', 'BIZ_MGR', ['FL-2026-11', 'DB 커넥션 풀 고갈로 응답 지연', '장애보고 상신', '향후대책', '커넥션 사용량 임계 알림 구축', 'FL-2026-13']],
    // 변경 루프 — 2단 상신, SR 적용요청 편입
    ['/infra/changes', 'BIZ_MGR', ['CW-2026-05', 'WAS 보안패치 적용', '결과 상신', 'SR-2026-0132', '변경 작업 편입']],
    // 보안점검(ISMS) — 현황판·기준관리·결과 결재상신
    ['/compliance/inspection', 'BIZ_MGR', ['IS-2026-22', '퇴직·전보자 계정 회수 점검', '결과 결재상신', '기준관리', 'CK-05', '결과미등록']],
    // 비용 루프 — 속보 기준금액(정산>계약>계획), 투자·비용 분리
    ['/finance/expense', 'DEPT_MGR', ['클라우드 인프라 이용료', '씨클라우드', '속보', '기준금액', 'ST-2026-02', '월정산']],
    ['/finance/expense', 'USER', ['속보 등록']],
    // 보안교육 — 연간계획·명단 등록(담당)·내 이수현황(사용자)
    ['/compliance/education', 'BIZ_MGR', ['상반기 정보보호 교육', '명단 등록', '이수현황 — 전 임직원', '김현우', '미이수']],
    ['/compliance/education', 'USER', ['내 이수현황', '미이수', 'ED-2026-01']],
    // 출력물 — secdata 채널 기본 중지 → 이관 불가 안내, 담당에게 이관 버튼
    ['/awareness/prints', 'BIZ_MGR', ['보안·출력물 시스템 채널이 중지 상태', '전일자 이관 실행', '이관된 출력물 자료가 없습니다']],
    // 재택 체크리스트 — 제출 폼(사용자)·현황(담당)
    ['/awareness/remote', 'USER', ['자가점검 제출', '동의하고 제출', 'VPN']],
    ['/awareness/remote', 'BIZ_MGR', ['전사 제출 현황', '한지원', '미제출']],
    // 보안위반 — 담당 등록·위반자 본인 확인서
    ['/awareness/violations', 'BIZ_MGR', ['VL-2026-07', '강도윤', '출력물 방치', '등록 · 안내메일 발송', '위반자 본인 작성 대기']],
    ['/awareness/violations', 'USER', ['내 위반 내역']],
    // 환경설정 — 사용자·결재선 관리
    ['/settings/users', 'ADMIN', ['사용자 목록', '결재선 관리', 'SR 신청', '자기 결재 방지', '인사정보 연동']],
    // 프로젝트 — 계약 연동·진척·산출물·이슈·주간보고
    ['/projects/status', 'BIZ_MGR', ['PJ-2026-01', 'ERP 리포트 모듈 구축', '에이원정보', '프로젝트 등록', '평균 진척']],
    ['/projects/schedule', 'BIZ_MGR', ['통합테스트 결과서', '레거시 리포트 데이터 정합성 오류', '해결 처리', '완료 처리']],
    ['/projects/reports', 'BIZ_MGR', ['킥오프 회의', '7월 4주차', '주간보고']],
    // 인프라 현황 — 시스템·서버·장애 연계, 배치·인터페이스·디스크
    ['/infra/systems', 'BIZ_MGR', ['ngv-db-01', 'ERP', '운영계', '디스크 경고', '장애 이력']],
    ['/infra/operations', 'BIZ_MGR', ['인사정보 동기화', '영업 실적 집계', '즉시 실행', '출력물 자료 수신', '오류']],
    // 서약 관리 — 양식 개정·스캔본·보안담당자·협력업체
    ['/pledge/manage', 'BIZ_MGR', ['양식관리', '개정일자', '스캔본 업로드', '보안담당자 관리', '서약률', 'CP-2026-02', '비솔루션', '선택 건 결재상신']],
    // 특별서약 — 보안담당자(박정호)에게만 카드 노출
    ['/pledge/my', 'BIZ_MGR', ['특별서약서 — 보안담당자']],
    // QnA — 질문·답변
    ['/board/qna', 'USER', ['QA-2026-12', '재택근무 체크리스트 제출 주기', '답변 대기', '질문 등록']],
    ['/board/qna', 'BIZ_MGR', ['답변 내용']],
    // 공통 첨부 — SR·계약 시드 첨부 뱃지
    ['/sr/requests', 'USER', ['📎']],
    ['/finance/invest', 'USER', ['📎']],
    // 환경설정 잔여 4종 — 공통코드·메뉴·권한 매트릭스·엑셀양식
    ['/settings/codes', 'ADMIN', ['FAULT_GRADE', '장애등급', '코드 중심 운영', '2등급']],
    ['/settings/menus', 'ADMIN', ['LV1 도메인', '메뉴 체계', '/sr/new', '구현']],
    ['/settings/permissions', 'ADMIN', ['권한 매트릭스', '최소권한 모델', '개인별현황']],
    ['/settings/forms', 'ADMIN', ['장애보고 취합 양식', '새 버전 업로드', 'XT-01']],
    // 감사 이력 — append-only 통제 기록
    ['/settings/audit', 'ADMIN', ['감사 이력', 'AP-2026-0701', '결재 승인', '추적성']],
    // 알림 배치 버튼 (Admin) · 결재 문서 상세 (참조 스냅샷·첨부 목록)
    ['/platform/integrations', 'ADMIN', ['알림 배치 실행']],
    ['/work/approvals?sel=AP-2026-0712', 'BIZ_MGR', ['문서 상세 — AP-2026-0712', 'SR 유형', '월별 정산 데이터 추출', '요청 내용']],
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
    // 경영계획 카드는 개인 스코핑, 계획대비실적·계약내역은 전사 조회(요구사항 조회 ●) —
    // 사용자에게 숨겨야 하는 것은 '계획 확정' 관리 기능뿐이다
    const r = await get('/finance/invest', 'USER')
    const html = await r.text()
    check(!html.includes('계획 확정'), 'USER /finance/invest 에 확정 버튼 미노출')
    check(!html.includes('CT-2026-03'), '투자 화면에 비용 계약(CT-2026-03) 미노출')
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
  {
    // 전사 운영 스냅샷은 담당·Admin 전용
    const r = await get('/dashboard', 'USER')
    const html = await r.text()
    check(!html.includes('전사 운영 스냅샷'), 'USER /dashboard 에 운영 스냅샷 미노출')
  }
  {
    // 특별서약 카드는 보안담당자에게만 — 김현우(USER)는 미노출
    const r = await get('/pledge/my', 'USER')
    const html = await r.text()
    check(!html.includes('특별서약서 — 보안담당자'), 'USER /pledge/my 에 특별서약 카드 미노출')
  }
  {
    // 엑셀 다운로드 — CSV(BOM) 응답과 권한 가드
    const r = await get('/api/export?type=invest-actual', 'USER')
    const text = await r.text()
    check(r.status === 200 && text.includes('계획대비') === false && text.includes('과제번호'), 'export: invest-actual CSV 헤더')
    check((r.headers.get('content-type') ?? '').includes('text/csv'), 'export: CSV 콘텐츠 타입')
    const denied = await get('/api/export?type=education-records', 'USER')
    check(denied.status === 403, 'export: USER 이수현황 차단(403)')
    const anon = await fetch(`${BASE}/api/export?type=invest-actual`, { redirect: 'manual' })
    check(anon.status === 401, 'export: 미로그인 차단(401)')
  }
  {
    // 위반자 본인 건만 — 김현우(USER)에게 강도윤 위반 미노출, 등록 폼 미노출
    const r = await get('/awareness/violations', 'USER')
    const html = await r.text()
    check(!html.includes('VL-2026-07'), 'USER /awareness/violations 에 타인 위반 미노출')
    check(!html.includes('위반 등록'), 'USER /awareness/violations 에 등록 폼 미노출')
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
