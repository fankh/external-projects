#!/usr/bin/env node
/**
 * EDIM Next.js SSR 스모크 테스트 (P6 컷오버 검증).
 *
 * 검증: 미인증 가드(→/login) · 로그인 토큰 · 쿠키 기반 SSR 렌더(서버 HTML 에 데이터 포함) ·
 *       핵심 화면(그리드·대시보드·CAD 에디터·Run·권한화면) · 알림/권한 시드.
 *
 * 사용:
 *   BASE=http://127.0.0.1:3000 \
 *   EDIM_API_BASE=https://edim.seekerslab.com/api/v1 \
 *   EDIM_USER=edim EDIM_PASS=edim \
 *   node scripts/smoke.mjs
 *
 * 종료코드: 실패 시 1 (CI/컷오버 게이트용). Node 20+ (내장 fetch).
 */

const BASE = (process.env.BASE ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const API_BASE = (process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1').replace(/\/$/, '')
const USER = process.env.EDIM_USER ?? 'edim'
const PASS = process.env.EDIM_PASS ?? 'edim'
const SESSION_COOKIE = 'edim_session'

let pass = 0, fail = 0
const results = []
function ok(name) { pass++; results.push(`  \x1b[32m✓\x1b[0m ${name}`) }
function bad(name, detail) { fail++; results.push(`  \x1b[31m✗\x1b[0m ${name}\n      → ${detail}`) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 로그인 — 백엔드 rate-limit(30/60s) 대비 재시도. */
async function login() {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER, password: PASS }),
      })
      if (res.status === 429) { await sleep(6000); continue }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      if (!body.token) throw new Error('응답에 token 없음')
      return body.token
    } catch (e) {
      if (attempt === 5) throw e
      await sleep(3000)
    }
  }
}

/** 쿠키 없이 GET — 리다이렉트 따라가지 않음(가드 확인용). */
async function rawGet(path, cookie) {
  return fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { Cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  })
}

async function assertGuardRedirect(path) {
  try {
    const res = await rawGet(path)
    const loc = res.headers.get('location') ?? ''
    if ((res.status === 307 || res.status === 302 || res.status === 308) && loc.includes('/login')) ok(`가드: ${path} (미인증) → /login`)
    else bad(`가드: ${path} (미인증) → /login`, `status ${res.status}, location "${loc}"`)
  } catch (e) { bad(`가드: ${path}`, e.message) }
}

async function assertRenders(path, markers, cookie) {
  try {
    const res = await rawGet(path, cookie)
    if (res.status !== 200) { bad(`SSR: ${path}`, `status ${res.status}`); return }
    const html = await res.text()
    const missing = markers.filter((m) => !html.includes(m))
    if (missing.length === 0) ok(`SSR: ${path} (마커 ${markers.length}개)`)
    else bad(`SSR: ${path}`, `HTML 에 없음: ${missing.map((m) => JSON.stringify(m)).join(', ')}`)
  } catch (e) { bad(`SSR: ${path}`, e.message) }
}

async function main() {
  console.log(`\nEDIM SSR 스모크 — BASE=${BASE}  API=${API_BASE}\n`)

  // 1) 미인증 가드
  await assertGuardRedirect('/erp/eco-ledger')
  await assertGuardRedirect('/plm/design')

  // 1b) 모듈 루트 URL → 대표 화면 리다이렉트 (레거시 SPA 경로 호환, 404 방지)
  for (const [src, dest] of [
    ['/erp', '/erp/dashboard'], ['/cpq', '/cpq/selection'], ['/plm', '/plm/parts'],
    ['/code', '/code/subcode'], ['/toolbox', '/toolbox/macros'], ['/common', '/common/approval'],
  ]) {
    try {
      const res = await rawGet(src)
      const loc = res.headers.get('location') ?? ''
      if ([307, 308, 302].includes(res.status) && loc.includes(dest)) ok(`모듈 루트: ${src} → ${dest}`)
      else bad(`모듈 루트: ${src} → ${dest}`, `status ${res.status}, location "${loc}"`)
    } catch (e) { bad(`모듈 루트: ${src}`, e.message) }
  }

  // 2) 로그인 페이지 자체는 미인증 접근 가능
  await assertRenders('/login', ['사번', 'password'])

  // 3) 로그인 → 토큰
  let token
  try { token = await login(); ok('로그인 — 토큰 발급') }
  catch (e) { bad('로그인 — 토큰 발급', e.message); return }

  // 4) 쿠키 기반 SSR — 서버 HTML 에 데이터/마커 포함(진성 SSR)
  await assertRenders('/erp/eco-ledger', ['SSR ·', '변경 이력'], token)
  await assertRenders('/erp/dashboard', ['SSR ·', '월별 매출·기여마진'], token)
  await assertRenders('/plm/parts', ['SSR ·'], token)
  await assertRenders('/plm/design', ['Design Editor', 'Design Rule'], token)
  await assertRenders('/cpq/run', ['Run 파이프라인'], token)
  await assertRenders('/cpq/selection', ['제품 선정'], token)
  await assertRenders('/code/datatable', ['데이터 Table'], token)
  await assertRenders('/toolbox/ui-designer', ['UI Designer', 'Widget'], token)

  // 4b) N1 결재 복구 — 결재/처리 액션 UI 렌더 (서버액션 아일랜드)
  await assertRenders('/common/approval', ['결재 의견'], token)
  await assertRenders('/cpq/x-review', ['검토 의견'], token)
  await assertRenders('/erp/tasks', ['완료 처리'], token)
  await assertRenders('/detail/event', ['이벤트 처리'], token)

  // 4c) N2 PLM 대장 CRUD 복구 — 등록 폼/패널 렌더
  await assertRenders('/plm/drawings', ['도면 등록'], token)
  await assertRenders('/plm/parts', ['부품 등록'], token)
  await assertRenders('/plm/eco-change', ['ECR 등록'], token)
  await assertRenders('/plm/arrangement', ['구성 등록'], token)
  await assertRenders('/plm/quality', ['규칙 등록'], token)

  // 4d) N3a ERP 대장 CRUD 복구 — 등록/전이 액션 UI 렌더
  await assertRenders('/erp/projects', ['프로젝트 등록'], token)
  await assertRenders('/erp/sales-order', ['수주 전환'], token)
  await assertRenders('/erp/milestones', ['납기 등록'], token)
  await assertRenders('/erp/finance', ['세액 계산기'], token)
  await assertRenders('/erp/warehouses', ['위치 등록'], token)
  await assertRenders('/erp/work-order', ['발행'], token)
  await assertRenders('/erp/anomaly', ['이상 스캔'], token)

  // 4e) N3b ERP 공급망 복구 — 발주/입고/예약/검사/단가 액션 UI 렌더
  await assertRenders('/erp/purchase', ['PO 발주 확정'], token)
  await assertRenders('/erp/po', ['발주 생성'], token)
  await assertRenders('/erp/inventory', ['가용재고 ATP'], token)
  await assertRenders('/erp/quality', ['검사 등록'], token)
  await assertRenders('/erp/prices', ['단가 등록'], token)

  // 4f) N4 관리자·Code Set-up 복구 — 사용자/매트릭스/코드 CRUD UI 렌더
  await assertRenders('/erp/roles', ['사용자 등록', '권한 매트릭스'], token)
  await assertRenders('/code/product-codes', ['코드 등록'], token)
  await assertRenders('/code/variant', ['값 등록'], token)
  await assertRenders('/code/materials', ['재질 등록'], token)

  // 4g) N4b Code Set-up 마감 — subcode/datatable/Hierarchy 액션 UI 렌더
  await assertRenders('/code/subcode', ['중복검토', '승인 요청'], token)
  await assertRenders('/code/datatable', ['행 추가'], token)
  await assertRenders('/code/groups', ['Hierarchy 주소'], token)

  // 4h) N5a 문서 파이프라인 복구 — 문서 등록/미리보기·PCR PDF·폴더 업로드/ZIP
  await assertRenders('/cpq/documents', ['문서 등록', 'PDF 미리보기'], token)
  await assertRenders('/cpq/reports', ['PCR 수익성 보고서'], token)
  await assertRenders('/common/folder', ['업로드', 'ZIP'], token)

  // 4i) N5b 스튜디오·PDF 복구 — Macro/Templet 편집·Run 정리·성능표 PDF·사양 Excel
  await assertRenders('/toolbox/macros', ['Test Run'], token)
  await assertRenders('/toolbox/templets', ['Templet 편집'], token)
  await assertRenders('/toolbox/runs', ['보관 정리'], token)
  await assertRenders('/cpq/tech-data', ['Fan 성능표 PDF'], token)
  await assertRenders('/cpq/selection', ['사양 Excel', '견적 미리보기'], token)

  // 4j) N6 셸 전역 — ⌘K 통합검색 입력 렌더
  await assertRenders('/erp/dashboard', ['Ctrl+K'], token)

  // 4l) MRP (U4·M-8-5)
  await assertRenders('/erp/mrp', ['MRP 자재 소요 계획', '리드타임'], token)

  // 4k) 네비 개편 — 헤더 카테고리 드롭다운(data-nav-cat) + 좌측 메뉴 편집(✎)
  await assertRenders('/erp/projects', ['data-nav-cat="erp-purchasing"', 'data-nav-cat="erp-company"', 'data-lnav-edit'], token)
  await assertRenders('/cpq/selection', ['data-nav-cat="cpq-doc"'], token)

  // 4m) U16~U27 신규 기능 (v25~v28) — 위젯 Set-up·Hierarchy 검색/점검·Relationship 소품·헤더 편집·
  //     채번·함수 마법사·차트·SWP Child·분할통합·파라메트릭 SYNC·Block 패널·설계 파라미터
  await assertRenders('/toolbox/ui-designer', ['Set-up (동작·바인딩)'], token)
  await assertRenders('/code/groups', ['data-h-search', 'data-h-validate'], token)
  await assertRenders('/code/relationship', ['data-child-links', 'EBOM Run'], token)
  await assertRenders('/erp/dashboard', ['data-hnav-edit'], token)
  await assertRenders('/cpq/documents', ['채번 규칙', 'data-doc-rule'], token)
  await assertRenders('/toolbox/macros', ['data-fn-wizard'], token)
  await assertRenders('/code/datatable', ['data-chart-wizard'], token)
  await assertRenders('/code/subcode', ['data-panel-mother', 'Child Component'], token)
  await assertRenders('/cpq/selection', ['분할', '통합'], token)
  await assertRenders('/plm/design', ['SYNC', 'data-blk-name'], token)
  await assertRenders('/plm/work-process', ['data-design-priority'], token)

  // 4n) U8 덕트 수동 조정 · U29 3D 뷰어 (v29.4~v28.9)
  await assertRenders('/plm/duct', ['data-duct-edit', '수동 조정'], token)
  await assertRenders('/detail/model3d', ['data-3d-viewer', '제품 3D 뷰어'], token)

  // 4p) U32 Approval 스트립 · U33 테넌트 메뉴 관리 (v30.6~v31.0)
  await assertRenders('/code/groups', ['data-approval-strip'], token)
  await assertRenders('/code/product-codes', ['data-approval-strip'], token)
  await assertRenders('/erp/tenant-menus', ['data-tmenu-scope', '테넌트 메뉴 관리'], token)

  // 4q) U7 AI 생성 버튼 · U28 내부 Q&A (v31.7~v31.9)
  await assertRenders('/toolbox/macros', ['AI 생성'], token)
  await assertRenders('/toolbox/assistant', ['data-assist-q', 'AI-08'], token)

  // 4o) API 계약 — U30 테넌트 메뉴 · U27 공학 함수 카탈로그
  async function assertApi(name, path, check) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      if (res.ok && check(body)) ok(`API: ${name}`)
      else bad(`API: ${name}`, `status ${res.status}`)
    } catch (e) { bad(`API: ${name}`, e.message) }
  }
  await assertApi('/tenant/leftnav (U30)', '/tenant/leftnav', (j) => j && typeof j.value === 'object')
  await assertApi('/tenant/headnav (U30)', '/tenant/headnav', (j) => j && typeof j.value === 'object')
  await assertApi('/macros/functions 보간→INTERP (U27)', `/macros/functions?q=${encodeURIComponent('보간')}`,
    (j) => Array.isArray(j) && j.some((f) => f.name === 'INTERP'))
  await assertApi('/cad/view/8/related-codes (U10)', '/cad/view/8/related-codes',
    (j) => j && Array.isArray(j.codes))

  // 4r) U10 도면-코드 칩 SSR (v32.6)
  await assertRenders('/detail/cad-viewer?fileId=8', ['data-related-code'], token)

  // 5) 권한/알림 시드 (레이아웃) — 사용자 표기 + 알림 벨
  await assertRenders('/erp/eco-ledger', ['🔔'], token)

  // 결과
  console.log(results.join('\n'))
  console.log(`\n합계: \x1b[32m${pass} 통과\x1b[0m · ${fail ? `\x1b[31m${fail} 실패\x1b[0m` : '0 실패'}\n`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('스모크 실행 오류:', e); process.exit(1) })
