/** 데이터 파일 견고성 게이트 — 두 가지 배포 안전선을 검증한다:
 *   1) 빈 스토어(첫 기동) — 신규 고객사가 시드 없이 배포한 첫 로그인에서 전 화면이 깨지지 않는가
 *      (health 는 시드로 돌아 가드 없는 배열 접근·0 나눗셈 회귀를 못 잡는다).
 *   2) 손상 파일 — 수기편집·부분저장(저장 중 크래시)·잘못된 백업 복원으로 컬렉션 타입이 어긋나도
 *      서버가 죽지 않고 그 키만 시드 기본값으로 폴백하는가 (loadFromFile 타입 안전 머지).
 *  사용: npm run build 후  node scripts/emptystate.mjs */
import { execSync, spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
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

// 파싱 불가(손상) 파일 격리 — 원본이 seed 저장으로 덮어써져 손실되지 않고 .corrupt 로 보존돼야 한다.
async function quarantineProbe(port) {
  const garbage = '{ truncated / not valid json ][ 손상'
  writeFileSync(DATA, garbage, 'utf8')
  const server = spawn(`npx next start -p ${port}`, { cwd: ROOT, shell: true, stdio: 'ignore', env: { ...process.env, PORTAL_DATA_FILE: DATA } })
  const dir = path.dirname(DATA), base = path.basename(DATA)
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`http://localhost:${port}/login`, { redirect: 'manual' })).status === 200) break } catch { /* 기동 전 */ }
      await new Promise((r) => setTimeout(r, 500))
    }
    // getStore(→scheduleSave) 트리거 후 저장(300ms) 대기 — 손상 원본이 seed 로 덮어써지는 창
    await fetch(`http://localhost:${port}/dashboard`, { headers: { cookie }, redirect: 'manual' })
    await new Promise((r) => setTimeout(r, 900))
    const corruptFiles = readdirSync(dir).filter((f) => f.startsWith(base + '.corrupt.'))
    const quarantined = corruptFiles.length > 0
    let freshValid = false, preserved = false
    try { JSON.parse(readFileSync(DATA, 'utf8')); freshValid = true } catch { /* 재작성 안 됨 */ }
    if (quarantined) { try { preserved = readFileSync(path.join(dir, corruptFiles[0]), 'utf8') === garbage } catch { /* */ } }
    const ok = quarantined && freshValid && preserved
    console.log(`${ok ? '✓' : '✗'} quarantine(손상 파일 격리): 격리=${quarantined} 시드재작성=${freshValid} 원본보존=${preserved}`)
    for (const f of corruptFiles) { try { unlinkSync(path.join(dir, f)) } catch { /* */ } }
    return ok
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

  // 2) 손상 파일 — 컬렉션 타입 붕괴(문자열·숫자·객체 오염) + 요소 수준 오염(객체 배열에 원시값 혼입)
  //    + 정상 부분(people 배열)이 공존. 서버가 죽지 않고 오염 키/요소는 걸러지고 정상은 머지돼야 한다.
  //    codeGroups 요소 오염: /settings/codes 가 g.values.length 를 원시 요소에서 접근하면 500 —
  //    요소 수준 방어(loadFromFile)가 원시값을 걸러 정상 그룹만 남겨야 한다.
  const corrupt = { ...emptyStore, srRequests: 'corrupt',
    // 출력물 폐기확인 할일의 title 누락 → /awareness/prints 의 title.includes('취합') 가 500 나면 안 된다(호출부 String 방어)
    todos: [{ id: 'TD-9', owner: '시스템관리자', kind: '출력물 폐기확인', done: false }],
    // 요소의 필수 문자열 필드 '누락'(undefined) — 머지 strFields 는 옵셔널 보존 위해 undefined 는 안 건드리므로
    // 소비처 호출부가 String(?? '')로 방어해야 한다. notice.postedAt 누락(정렬 localeCompare)·incident.occurredAt
    // 누락(.slice/.startsWith)이라도 /board/notices·/infra/incidents 가 500 나면 안 된다.
    notices: [{ id: 'NT-9', title: '공지t', category: '공지', author: '시스템관리자' },
      { id: 'NT-10', title: '공지t2', category: '보안', author: '시스템관리자', postedAt: '2026-08-01' }],
    // 요소 수준 문자열 오염 — 컬렉션은 정상 배열이나 요소의 문자열 필드가 숫자/누락(수기편집·부분저장).
    // incidents.occurredAt 숫자(present-wrong-type→머지 strFields 가 문자열 강제)·systems.name 누락
    // (undefined→incidentsOf 호출부 String 방어)이라도 /infra/incidents·/infra/systems 가 500 나면 안 된다.
    incidents: [{ id: 'FL-9', system: 'ERP', title: 't', grade: '2등급', occurredAt: 20260718, status: '조치완료', reportStatus: '미상신' },
      { id: 'FL-10', system: 'ERP', title: 't2', grade: '2등급', status: '조치중', reportStatus: '미상신' }],
    systems: [{ id: 'SYS-9', url: 'https://x.internal', env: '운영계', serverIds: [], owner: '김현우' }],
    // auditLogs.action 누락 → /settings/audit 의 l.action.includes 가 500 나면 안 된다(호출부 String 방어).
    auditLogs: [{ at: '2026-08-14 10:00:00', actor: '시스템관리자', detail: 'x' }],
    // 요소 오염: 원시값(걸러짐) + 객체지만 values 누락(정규화로 []) + 정상 그룹. 셋 다 /settings/codes
    // 의 g.values.length·activeCodes 소비처를 500 내지 않아야 한다(요소 필터 + 중첩 필드 정규화).
    // values[] 안의 null 원소 — 상위 요소 필터는 못 거르므로 중첩 원소 필터가 없으면 isCodeActive(null) 이
      // .enabled 접근으로 500(장애·SR·공통코드 화면 전역). 중첩 원소 방어로 null 제거 → 무크래시.
    codeGroups: ['garbage', 42, null, { id: 'SR_KIND', name: 'SR유형(값누락)' },
      { id: 'FAULT_GRADE', name: '장애등급', values: [null, { code: '1등급', enabled: true }] }],
    // 결재의 옵셔널 문자열 필드(decidedAt·rejectReason, 시드 첫 행에 없어 strFields 합집합이 없으면 누락)가
    // 객체로 오염 → {a.decidedAt ?? '-'} 가 React child 로 렌더돼 /work/approvals 가 500. 합집합 strFields 로 방어.
    approvals: [{ id: 'AP-9', docType: '비용 정산품의', title: 't', drafter: '시스템관리자', dept: '정보기획팀',
      approver: '박정호', status: '반려', draftedAt: '2026-08-01', decidedAt: {}, rejectReason: {} }],
    // 옵셔널 배열 필드(expenseFlash.history)가 시드 어느 행에도 없어 스토어 정규화가 못 잡는다 — 비배열
    // 원시값('x')·원소 오염(null·비숫자 expected)이라도 /finance/expense 의 .length/.map/toLocaleString 가 500 나면 안 된다.
    expenseFlashes: [{ id: 'EF-9', month: '2026-08', vendor: '씨클라우드', expected: 100, history: 'x' },
      { id: 'EF-10', month: '2026-07', vendor: '씨넷', expected: 200, history: [null, { at: '2026-07-01', by: 'admin', expected: 'oops' }] }],
    // 대상별 이수 과정(개발자)이 있으면 eligibleForCourse 가 p.dept.includes 를 부른다 — 아래 dept 누락 인원과
    // 결합해 /compliance/education 렌더 크래시를 재현한다(머지 reqStrFields 가 누락 필수 문자열을 ''로 채워 방어).
    educationCourses: [{ id: 'ED-9', title: '개발보안', target: '개발자', plannedMonth: '2026-08', status: '계획' }],
    // 빈 시드 컬렉션(printouts)의 null 원소 — 형판이 없어 요소 형태검증은 못 하나 null 은 어느 컬렉션에도
    // 무효라 제거돼야 한다(/awareness/prints·엑셀 익스포트의 p.name/p.id 접근이 null 에서 500 나면 안 된다).
    printouts: [null, { id: 'PR-9', name: '홍길동', dept: '개발1팀', document: 't.pdf', printedAt: '2026-08-01 09:00', pages: 1, personalInfo: false, status: '미등록' }],
    // 시드 어느 행에도 없는 스칼라 필드(ChangeWork.srNo)가 손상 파일에서 '객체 담은 배열'([{}])이면 {c.srNo}
    // 직접 렌더가 React child 500. arrFields 로 못 잡는(시드무존재) 배열-객체 필드는 머지가 제거해야 한다
    // (/infra/changes·/sr/manage completedAt 동일 클래스). 정상 srNo(문자열) 행은 보존.
    changes: [{ id: 'CW-9', kind: '인프라', title: '변경t', status: '작업등록', registeredAt: '2026-08-01', srNo: [{}] },
      { id: 'CW-10', kind: '시스템개발', title: '변경t2', status: '작업등록', registeredAt: '2026-08-01', srNo: 'SR-2026-0001' }],
    // 빈 시드 컬렉션(assetAcquisitions)은 형판 기반 필드 정규화를 못 돌린다 — 객체값 필드(at={} 등, 예: Mongo/ISO
    // 날짜 export)가 {a.at} 직접 렌더에서 React child 500(/finance/asset-reg). 빈시드 분기서 객체값 필드 제거 필요.
    assetAcquisitions: [{ serial: 'S1', model: 'R750', assetNo: 'AST-1', by: '관리자', at: {} }],
    // 필수 문자열 필드 '누락'(키 부재) — dept 없는 인원. eligibleForCourse('개발자') 의 p.dept.includes 가 500 나면 안 된다.
    people: [{ login: 'probe1', name: '견고성검증', dept: '품질보증팀', role: 'USER' },
      { login: 'probe2', name: '부서누락', role: 'USER' }] }
  const corruptOk = await probe('corruptfile(손상 파일)', corrupt, PORT + 1,
    (r, body) => (r === '/settings/users' && !body.includes('품질보증팀')) ? '정상 부분(people) 머지 누락' : null)

  // 3) 파싱 불가 파일 격리 — seed 저장이 손상 원본을 덮어쓰지 않고 .corrupt 로 보존 (데이터 손실 방어)
  const quarantineOk = await quarantineProbe(PORT + 2)

  process.exitCode = emptyOk && corruptOk && quarantineOk ? 0 : 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
