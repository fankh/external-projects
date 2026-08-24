/* 보안 findings 대응 + AI 제안 판정 인터랙티브 e2e — SSR 스모크가 못 잡는 클릭·상태 전환·역할 게이트를 실제 브라우저로 검증한다.
 * 대상: 크리덴셜 노출(45)·휴면 계정(46)·미인가 SW(47)·USB(48)·로컬 VM(49)·IOC 상관(50) 대응 + AI 제안 판정(11, 승인→조치·반려 사유 필수).
 * 실행: npm run e2e   (원격 배포본: E2E_BASE=http://localhost:3390 npm run e2e)
 * 신선한 인메모리 시드에서 시작(ITAM_DATA_FILE 미설정)하므로 결정적. */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFreshBuild } from './build-guard.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3396
const BASE = process.env.E2E_BASE || `http://localhost:${PORT}`
const REMOTE = !!process.env.E2E_BASE

// playwright 는 전역 설치 (client-health.mjs 와 동일 관례)
const pw = await import('file:///C:/Users/seekers/AppData/Roaming/npm/node_modules/playwright/index.js')
const { chromium } = pw.default ?? pw
const EXE = 'C:/Users/seekers/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'

const SEC = { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR' }
const ASSET = { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' }
const ADMIN = { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }
const USER = { login: 'mj.kim', name: '김민준', dept: '플랫폼개발팀', role: 'USER' }
const cookie = (acct) => ({ name: 'itam_session', value: encodeURIComponent(JSON.stringify(acct)), url: BASE })

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name) } else { fail++; console.log('  ✗ ' + name) } }

// 빌드 신선도 — 예전 빌드로 회귀를 돌리면 고친 결함이 그대로인 채 초록으로 통과한다(scripts/build-guard.mjs)
assertFreshBuild(ROOT, { remote: REMOTE })

let server = null
if (!REMOTE) {
  const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
  server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore' })
  const start = Date.now()
  let up = false
  while (Date.now() - start < 60000) {
    try { const r = await fetch(`${BASE}/login`); if (r.status === 200) { up = true; break } } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  if (!up) { console.error('서버 기동 실패'); server.kill(); process.exit(1) }
}

/** 2-선택 직접 조치(계정·SW·USB·VM·IOC) — 행의 첫 조치 버튼 클릭 후 버튼이 사라지고 상태 칩으로 바뀌는지 확인.
 *  각 조치는 revalidatePath 로 화면을 재렌더하므로, 행을 매번 재조회하고 버튼 소거를 폴링해 재렌더 타이밍을 흡수한다. */
async function twoChoice(page, { name, navTo, cardText, rowText, btnRe }) {
  // 매 조치 전 해당 화면을 새로 연다 — 직전 조치의 revalidate 재렌더 누적을 피해 안정적으로 검증(스토어 상태는 유지된다)
  await page.goto(`${BASE}${navTo}`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: cardText })
  ok(`${name}: 카드 렌더`, (await card.count()) > 0)
  const row = () => card.locator('tr', { hasText: rowText })
  const before = await row().locator('button').count()
  ok(`${name}: 보안담당에 조치 버튼 노출`, before >= 1 && (await row().locator('button', { hasText: btnRe }).count()) > 0)
  await row().locator('button', { hasText: btnRe }).first().click()
  // 조치 버튼(btnRe)이 사라지고 상태 칩으로 바뀌는지 확인 — 조치 후 취소(재개) 버튼이 남는 표(IOC 등)도 있으므로
  //  '모든 버튼 소거'가 아니라 '해당 조치 버튼 소거'로 상태 전환을 판정한다.
  let gone = false
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200)
    if ((await row().locator('button', { hasText: btnRe }).count()) === 0) { gone = true; break }
  }
  ok(`${name}: 조치 클릭 → 상태 전환(조치 버튼 소거·칩 노출)`, gone)
}

/** AI 제안 판정(로11) — 승인은 조치로 연결, 반려는 사유 입력 전 확정이 막힌다(사유 필수).
 *  '전체' 필터로 전환해 판정해도 행이 사라지지 않게 한 뒤, 판정 컬럼의 '승인' 버튼 수(대기 프록시)로 상태 전환을 검증한다. */
async function aiInsightDecide(page) {
  await page.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: 'AI 제안 — 판정 대기' })
  ok('AI 제안(11): 판정 대기 목록 렌더', (await card.count()) > 0)
  await card.locator('.seg button', { hasText: /^전체$/ }).click()
  await page.waitForTimeout(300)
  // tbody 로 한정 — 필터 세그먼트의 '승인'/'반려' 버튼과 판정 컬럼 버튼이 섞이지 않게 한다
  const approveBtns = () => card.locator('tbody button', { hasText: /^승인$/ })
  const rejectBtns = () => card.locator('tbody button', { hasText: /^반려$/ })
  const before = await approveBtns().count()
  ok('AI 제안(11): 처리 대기 제안 존재', before > 0)

  // 승인 — 판정 컬럼의 첫 '승인' 클릭 → 그 행이 조치 연결로 바뀌어 승인 버튼 1개 감소
  await approveBtns().first().click()
  await page.waitForTimeout(900)
  ok('AI 제안(11): 승인 → 판정(승인 버튼) 감소', (await approveBtns().count()) === before - 1)
  ok('AI 제안(11): 승인 제안에 조치 연결(조치 —) 표기', (await card.locator('text=조치 —').count()) > 0)

  // 반려 — 사유 필수: 첫 '반려' 클릭 → 사유 입력 전 '반려 확정' 비활성
  if ((await rejectBtns().count()) > 0) {
    await rejectBtns().first().click()
    await page.waitForTimeout(300)
    const confirm = card.locator('button', { hasText: '반려 확정' }).first()
    ok('AI 제안(11): 반려 사유 입력 전 확정 비활성(사유 필수)', await confirm.isDisabled())
    await card.locator('input[placeholder*="반려 사유"]').first().fill('오탐 — 정상 업무 트래픽으로 확인')
    await page.waitForTimeout(200)
    ok('AI 제안(11): 사유 입력 후 반려 확정 활성', !(await confirm.isDisabled()))
    const beforeR = await approveBtns().count()
    await confirm.click()
    await page.waitForTimeout(900)
    ok('AI 제안(11): 반려 확정 → 판정(승인 버튼) 감소', (await approveBtns().count()) === beforeR - 1)
  }
}

/** 2-단계 대응(크리덴셜·유출) — '대응' → 입력 프리필 → '대응 확정' → '조치 완료' 칩. */
async function twoStep(page, { name, navTo, cardText, rowText }) {
  await page.goto(`${BASE}${navTo}`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: cardText })
  const row = card.locator('tr', { hasText: rowText })
  ok(`${name}: 보안담당에 대응 버튼`, (await row.locator('button', { hasText: /^대응$/ }).count()) > 0)
  await row.locator('button', { hasText: /^대응$/ }).click()
  await page.waitForTimeout(300)
  await card.locator('button', { hasText: '대응 확정' }).first().click()
  await page.waitForTimeout(700)
  ok(`${name}: 대응 확정 → 조치 완료`, (await card.locator('text=조치 완료').count()) > 0)
}

/** AI 모델·프롬프트 버전 관리(§05 AI 거버넌스) — 인라인 편집·빈 값 검증·거버넌스 원장 반영. Admin 전용.
 *  AI 거버넌스·성능 리포트가 이 값을 근거로 산출하므로 배포 구성 변경은 감사에 남아야 한다. */
async function aiModelManage(page) {
  await page.goto(`${BASE}/settings/ai-policy`, { waitUntil: 'networkidle' })
  ok('AI 버전 관리: 컨트롤 렌더', (await page.locator('text=모델 · 프롬프트 버전 관리').count()) > 0)
  await page.locator('button', { hasText: /^버전 관리$/ }).click()
  await page.waitForTimeout(300)
  const modelIn = page.locator('input[placeholder*="claude-opus-5"]')
  const promptIn = page.locator('input[placeholder*="프롬프트 버전"]')
  ok('AI 버전 관리: 현재값 프리필', (await modelIn.inputValue()).length > 0 && (await promptIn.inputValue()).length > 0)
  // 빈 값 검증 차단
  await modelIn.fill('')
  await page.locator('button', { hasText: /^저장$/ }).click()
  await page.waitForTimeout(400)
  ok('AI 버전 관리: 빈 값 검증 차단', (await page.textContent('body')).includes('모델 ID·프롬프트 버전을 입력하세요'))
  // 정상 변경 → 원장 반영
  await modelIn.fill('claude-opus-5')
  await promptIn.fill('v3.3 (2026-08-13)')
  await page.locator('button', { hasText: /^저장$/ }).click()
  await page.waitForTimeout(700)
  const body = await page.textContent('body')
  ok('AI 버전 관리: 갱신 반영(모델·프롬프트)', body.includes('claude-opus-5') && body.includes('v3.3 (2026-08-13)'))

  // 외부 반출 통제(§05 실행 환경) — 실행 환경 선택이 표시가 아니라 강제임을 검증한다.
  //  시드 기본 온프레미스에선 '외부 반출 차단', '외부 API 연계'로 바꾸면 '허용 + 비식별 적용'으로 강제 상태가 바뀐다.
  ok('AI 외부반출: 온프레미스 기본 — 외부 반출 차단·강제 명시', body.includes('외부 반출 통제') && body.includes('외부 반출 없음') && body.includes('표시가 아니라'))
  await page.locator('.seg button', { hasText: '외부 API 연계' }).click()
  await page.waitForTimeout(700)
  const extBody = await page.textContent('body')
  ok('AI 외부반출: 외부 API 연계 전환 시 반출 허용·비식별 처리 강제', extBody.includes('외부 반출 허용') && extBody.includes('비식별 처리 후 반출'))
  // 원상복구 — 이후 테스트가 시드 기본(온프레미스)을 전제로 하므로 되돌린다(인메모리 스토어 오염 방지)
  await page.locator('.seg button', { hasText: '온프레미스 LLM' }).click()
  await page.waitForTimeout(700)
  ok('AI 외부반출: 온프레미스 복원 — 외부 반출 재차단', (await page.textContent('body')).includes('외부 반출 없음'))
}

/** 분류 정확도 환류(§05 그림4 "판정 결과 환류 — 재학습·정확도 개선") — 정확도가 시드 고정값이 아니라
 *  승인/반려 판정에 따라 재산출됨을 검증한다. ai-policy 는 ADMIN 전용. 반려는 부작용이 없어 안전하다. */
async function aiFeedbackAccuracy(page) {
  const read = async () => {
    await page.goto(`${BASE}/settings/ai-policy`, { waitUntil: 'networkidle' })
    const body = await page.textContent('body')
    return { body, n: Number((body.match(/판정 (\d+)건 환류/) || [])[1] ?? -1) }
  }
  const r0 = await read()
  ok('AI 정확도 환류: 정적값 아님 — 기준값·환류 판정 건수 표기', r0.body.includes('환류') && r0.body.includes('기준 92.4%') && r0.n >= 1)
  // 제안 1건 반려(부작용 없음) → 환류 판정 건수 증가로 정확도 재산출 확인.
  //  다른 테스트가 승인하는 INS-2607-15는 건드리지 않도록, 반려 버튼이 있는 제안 행 중 그 외 첫 행을 고른다.
  await page.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const card = page.locator('.card', { hasText: 'AI 제안 — 판정 대기' })
  await card.locator('.seg button', { hasText: /^전체$/ }).click()
  await page.waitForTimeout(300)
  const allRows = card.locator('tbody tr')
  const rowN = await allRows.count()
  let target = null
  for (let i = 0; i < rowN; i++) {
    const r = allRows.nth(i)
    const t = (await r.textContent()) || ''
    if (t.includes('INS-2607-15')) continue
    if ((await r.locator('button', { hasText: /^반려$/ }).count()) > 0) { target = r; break }
  }
  ok('AI 정확도 환류: 반려 가능 미판정 제안 존재(INS-2607-15 제외)', target !== null)
  await target.locator('button', { hasText: /^반려$/ }).first().click()
  await page.waitForTimeout(300)
  await card.locator('input[placeholder*="반려 사유"]').first().fill('오탐 — 정확도 환류 검증')
  await page.waitForTimeout(200)
  await card.locator('button', { hasText: '반려 확정' }).first().click()
  await page.waitForTimeout(900)
  const r1 = await read()
  ok('AI 정확도 환류: 판정 추가 시 환류 건수 증가(재학습 반영)', r1.n === r0.n + 1)
}

/** AI 어시스턴트 기간 스코프 질의(§05 예시 "내년 1분기 보증 만료…") — 기간 파싱·창 필터.
 *  실행 시점에 독립적이도록, 헤드라인이 제시한 창 범위를 그대로 뽑아 나열 만료일이 전부 그 안에 드는지 자기검증한다. */
async function aiPeriodQuery(page) {
  await page.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const ask = async (q) => {
    const before = await page.locator('.msg.assistant .bub').count()
    await page.locator('.chat-in input').fill(q)
    await page.locator('.chat-in input').press('Enter')
    await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, before, { timeout: 8000 })
    await page.waitForTimeout(150)
    return (await page.locator('.msg.assistant .bub').last().textContent()) || ''
  }
  const q1 = await ask('내년 1분기 보증 만료되는 자산 목록')
  const win = q1.match(/(\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})/)
  ok('AI 기간질의: 분기 창 범위 헤드라인', /보증 만료 예정/.test(q1) && !!win)
  const dates = [...q1.matchAll(/보증 만료 (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1])
  ok('AI 기간질의: 나열 만료일 전부 창 안', !!win && dates.length > 0 && dates.every((d) => d >= win[1] && d <= win[2]))
  // count↔destination — 임의 기간 창은 '보증 임박(≤90일)' 필터와 집합이 어긋나므로 그 링크로 오연결되지 않아야 한다(전체/유형 대장으로).
  ok('AI 기간질의: 무관한 보증 임박 필터(?warranty=soon)로 오연결 안 됨', (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?warranty=soon"]').count()) === 0)
  const q2 = await ask('2099년 1분기 보증 만료 자산')
  ok('AI 기간질의: 먼 미래 → 해당 없음 메시지', q2.includes('2099년 1분기') && q2.includes('보증이 만료되는 자산이 없습니다'))
  const q3 = await ask('보증 만료되는 네트워크 장비 목록')
  ok('AI 기간질의: 기간 미지정 → 임박순 폴백', q3.includes('만료 임박순') && !/ ~ 20\d{2}-/.test(q3))
  // 기간 미지정(임박순)일 때는 보증 임박 필터 링크가 답의 액션 대상과 일치 — 유지(회귀 가드).
  ok('AI 보증질의(기간 미지정): 보증 임박 필터(?warranty=soon) 링크 제공', (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?warranty=soon"]').count()) > 0)
  // 상대연도 동의어 '전년' 은 '작년'·'지난해'와 같은 창(전년도 1~12월)을 내야 한다 — 연도전용 폴백에서 누락되면
  //  기간 파싱이 null 로 떨어져 근시안 '임박' 답으로 오라우팅된다(코드-의도 불일치 회귀 방지).
  const qPrevYr = await ask('전년 만료 계약')
  const qLastYr = await ask('작년 만료 계약')
  const winRe = /20\d{2}년 만료 예정 계약은 \d+건입니다 \((20\d{2})-01-01 ~ \1-12-31\)/
  ok("AI 기간질의: '전년' → 전년도 연 창(임박 폴백 아님)", winRe.test(qPrevYr))
  const mPrev = qPrevYr.match(winRe), mLast = qLastYr.match(winRe)
  ok("AI 기간질의: '전년'='작년' 동일 창 정합", !!mPrev && !!mLast && mPrev[1] === mLast[1])
  // 과거상대 달·분기 — '다음/이번'과 대칭으로 '지난 달'·'지난 분기'(최근 만료분 후속 점검)를 단월/분기 창으로 답한다.
  //  미구현 시 파싱이 null 로 떨어져 근시안 '임박' 답으로 오라우팅된다(실행일 무관하게 창 헤드라인 구조로 검증).
  const qPrevMon = await ask('지난 달 만료 계약')
  ok("AI 기간질의: '지난 달' → 단월 창(임박 폴백 아님)", /20\d{2}년 \d{1,2}월 만료 예정 계약은 \d+건입니다 \(20\d{2}-\d{2}-01 ~ 20\d{2}-\d{2}-\d{2}\)/.test(qPrevMon))
  const qPrevQ = await ask('지난 분기 만료 계약')
  ok("AI 기간질의: '지난 분기' → 분기 창(임박 폴백 아님)", /20\d{2}년 [1-4]분기 만료 예정 계약은 \d+건입니다 \(20\d{2}-\d{2}-01 ~ 20\d{2}-\d{2}-\d{2}\)/.test(qPrevQ))

  // 발견 인텐트 기간 스코프 — firstSeen 기준. 시드 미등록 자산은 2026-07 이므로 명시 월로 결정적 검증.
  const g1 = await ask('2026년 7월에 새로 발견된 미등록 자산 목록')
  const seen = [...g1.matchAll(/최초 발견 (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1])
  ok('AI 발견 기간질의: 7월 창 라벨·전부 창 안', g1.includes('2026년 7월') && seen.length > 0 && seen.every((d) => d >= '2026-07-01' && d <= '2026-07-31'))
  const g2 = await ask('2026년 6월에 새로 발견된 미등록 자산')
  ok('AI 발견 기간질의: 대상 없는 월 → 해당 없음', g2.includes('새로 발견된 미등록 자산이 없습니다'))
  const g3 = await ask('미등록 발견 자산 목록 보여줘')
  ok('AI 발견 기간질의: 기간 미지정 → 처리 대기 라벨(이번 달 하드코딩 제거)', g3.includes('처리 대기 중인 미등록 발견 자산') && !g3.includes('이번 달 새로 발견'))

  // 교체 대상·수명 예측 인라인 질의(AI 기능 03) — 리포트 생성과 분리, 유형 스코프
  const r1 = await ask('교체 대상 자산과 교체 예산 알려줘')
  ok('AI 교체질의: 교체 대상·예산 인라인 답변(리포트 생성 아님)', /교체 대상 자산은 \d+건/.test(r1) && r1.includes('교체 예산 추정') && !r1.includes('리포트를 생성했습니다'))
  // 하드웨어 교체 계획은 실물 자산만 — SW·가상자원은 교체 대상에서 제외(라이선스·클라우드는 별도 관리)
  ok('AI 교체질의: SW·가상자원 교체 대상 제외', !r1.includes('SW, 도입') && !r1.includes('가상자원, 도입'))
  // 장애 이력 드라이버(§05 기능03) — 반복 수리(2회 이상) 자산이 내용연수·보증과 별개로 교체 대상에 편입(AST-2023-000112: 키보드·배터리 2회)
  ok('AI 교체질의: 장애 이력(잦은 수리) 드라이버 반영(AST-2023-000112)', r1.includes('AST-2023-000112') && r1.includes('잦은 장애'))
  // 답변↔링크 정합 — 교체 대상 답변이 대장 교체 필터(?replace=1)로 연결돼, 센 그 집합을 대장에서 그대로 브라우즈·반출. 리포트·EOL 링크와 별개 진입점.
  ok('AI 교체질의: 답변이 대장 교체 대상 필터(?replace=1)로 연결', (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?replace=1"]').count()) > 0)
  // 운영 리스크 답변↔링크 정합 — '장기 미실측 필터' 링크가 실제 ?stale=1 로 연결(그전엔 bare /assets/register 로 전체 대장). 분실 링크도 ?status=분실.
  const rRisk = await ask('운영 리스크 자산 알려줘')
  ok('AI 운영리스크질의: 분실·미실측·연체·수리 요약', rRisk.includes('운영 리스크 자산 현황') && rRisk.includes('장기 미실측'))
  // 인라인 답변 ↔ 자산 운영 리스크 리포트 정합 — 리포트에 있는 수령 미확인(체인 오브 커스터디)이 인라인 답변에도 포함돼야 한다(단일 소스·같은 집합).
  ok('AI 운영리스크질의: 수령 미확인 포함(리포트와 같은 집합)', rRisk.includes('수령 미확인'))
  ok('AI 운영리스크질의: 장기 미실측 링크가 ?stale=1 로 연결(전체 대장 아님)', (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?stale=1"]').count()) > 0)
  // 취약점 우선순위·이상 탐지 인라인 질의(AI 기능 04·02) — 컴퓨티드 산출을 자연어로 조회(리포트 생성과 별개)
  const rv = await ask('취약점 조치 우선순위 알려줘')
  ok('AI 취약점질의: P1/P2/P3 인라인 요약(리포트 생성 아님)', /취약점 조치 우선순위 — 총 \d+건/.test(rv) && rv.includes('P1 즉시') && !rv.includes('리포트를 생성했습니다'))
  const ra = await ask('이상 탐지 현황 알려줘')
  ok('AI 이상탐지질의: 프로파일 이탈 인라인 요약(유휴 자산 사용 AST-2021-000432)', /이상 자산 행위 탐지 — 총 \d+건/.test(ra) && ra.includes('평시 프로파일') && ra.includes('AST-2021-000432'))
  // §05 기능02 세 번째 행위 '서버의 비정상 외부 통신' — buildAnomalies 가 AI 이상탐지 제안을 행위 뷰에 집약하므로 어시스턴트 종류별 요약에도 '서버 비정상 외부 통신'이 뜬다(그전엔 부재 kind).
  ok('AI 이상탐지질의: 서버 비정상 외부 통신 종류 집약(기능02 세 행위 완비)', ra.includes('서버 비정상 외부 통신'))
  // 부서별 자산 보유 질의 — '분포'가 상태별 인텐트에도 걸리므로, '부서' 질의가 부서 집계로 정확히 라우팅되는지 확인
  const rd = await ask('부서별 자산 보유 현황 알려줘')
  ok('AI 부서질의: 부서별 자산 보유 집계(상태별 분포 인텐트와 분리)', rd.includes('부서별 자산 보유 현황') && /대 \(사용중 \d+\)/.test(rd) && !rd.includes('상태별 분포'))
  // 부서별 '비용' 질의는 '대수'가 아니라 '비용'(취득가·잔존가) 답변 — 그동안 '부서별 비용'이 부서 보유(대수) 인텐트에 걸려 대수로 오답했다(비용 인텐트를 앞에 배치).
  const rdc = await ask('부서별 IT 비용 알려줘')
  ok('AI 부서비용질의: 비용 질의는 부서별 취득가·잔존가로 답(대수 오답 아님)', rdc.includes('부서별 IT 자산 비용') && rdc.includes('취득가') && !/대 \(사용중 \d+\)/.test(rdc))
  // 위치(사업장)별 질의 — 물리 실사·데이터센터 랙 조회. 그동안 어느 인텐트에도 안 걸려 폴백(분포→상태별)으로 빠지던 공백.
  const rloc1 = await ask('위치별 자산 분포 알려줘')
  ok('AI 위치질의: 위치(사업장)별 자산 분포로 답(상태별 분포 폴백 아님)', rloc1.includes('위치(사업장)별 자산 분포') && /대 \(사용중 \d+\)/.test(rloc1) && !rloc1.includes('상태별'))
  const rloc2 = await ask('IDC-A 자산 알려줘')
  ok('AI 위치질의: 특정 사이트(IDC-A) 지목 시 해당 위치 자산 목록', rloc2.includes('IDC-A 소재 자산 현황') && rloc2.includes('· '))
  // 유휴(재배치 가능) 자산 목록 — 재불출/재배치 풀. 상태 분포(대수)·저재고(유형)와 달리 개별 자산 목록이 공백이던 것을 채움. lib/stock.availableAssets 단일 판정.
  const ridle = await ask('유휴 자산 목록 보여줘')
  ok('AI 유휴질의: 재배치 가능(유휴·폐기 미진입) 자산 목록으로 답(상태 분포 폴백 아님)', ridle.includes('재배치 가능한 유휴 자산') && !ridle.includes('상태별 분포'))
  // 고가(최고가) 자산 질의 — 유형 집계만 있고 "어느 자산이 가장 비싼가"(개별 TOP)가 공백이라 '비싼/고가' 키워드가 폴백으로 빠지던 것을 값 인텐트로 흡수.
  const rtop = await ask('가장 비싼 자산 알려줘')
  ok('AI 고가질의: 개별 고가 자산 TOP 목록으로 답(폴백 아님)', rtop.includes('고가 자산 TOP 5') && /취득가 [\d,]+원/.test(rtop))
  // 미인식 질의 폴백은 지원 질의를 안내(discoverability) — 신규 축(위치·유휴 등)이 목록에 빠져 있으면 사용자가 기능을 못 찾는다.
  const rfb = await ask('안녕 무슨 기능이 있어')
  ok('AI 폴백 안내: 신규 질의 축(위치·유휴)이 지원 질의 목록에 포함', rfb.includes('위치(사업장)별') && rfb.includes('유휴(재배치'))
  // 담당자 QnA 답변 대기 — 사용자 본인 QnA(isUser) 인텐트의 담당자 짝이 없어 스태프 '답변 대기 문의'가 폴백으로 빠지던 공백. 인텐트 전용 문구로 폴백과 구분.
  const rqna = await ask('답변 대기 문의 알려줘')
  ok('AI QnA대기: 담당자 미답변 QnA 목록으로 답(폴백 아님)', /답변 대기 QnA 문의 \d+건입니다|답변 대기 중인 QnA 문의가 없습니다/.test(rqna))
  // 공급사(벤더) 집중도 질의 — 기존 벤더 집계 뷰가 없어 '계약' 포괄 인텐트(만료 답)로 떨어지던 공백. 공급사별 계약 수·계약액 집계로 라우팅되는지 확인.
  const rvend = await ask('공급사별 계약 현황 알려줘')
  ok('AI 공급사질의: 공급사별 계약 집계(계약 수·계약액, 만료 답 아님)', rvend.includes('공급사별 계약 현황') && /계약 \d+건 · 계약액 .+원/.test(rvend) && !rvend.includes('만료 예정 계약은'))
  // 정기 점검(예방 정비) 대상 질의 — 대장 필터·대시보드 큐와 같은 lib/dates 판정으로 경과·임박을 나눠 답한다(시드 AST-2022-000640/641 경과)
  const rm = await ask('정기 점검(예방 정비) 대상 자산 알려줘')
  ok('AI 정기점검질의: 예방 정비 대상 경과·임박 분류 답변', rm.includes('정기 점검(예방 정비) 대상') && rm.includes('예정일 경과(미시행)') && rm.includes('AST-2022-000641'))
  // 복합 위험 자산 질의(신규 역량) — 정합성·EOL·보증·점검·SPOF·교체·미실측 중 2+ 겹치는 다중 이슈 자산을 어시스턴트가 답한다. 대장 필터·도시어·대시보드 큐와 lib/risk 단일 소스. 답변이 ?risk=1 필터로 연결(count↔destination 정합).
  const rcr = await ask('복합 위험 자산 알려줘')
  ok('AI 복합위험질의: 다중 이슈(≥2 신호) 자산 요약 + ?risk=1 대장 필터 링크', /복합 위험 자산은 \d+건/.test(rcr) && (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?risk=1"]').count()) > 0)
  // 단일 장애점(SPOF) 인라인 질의(신규) — 생성 동사 없는 "단일 장애점 알려줘"는 리포트 생성이 아니라 인라인 요약. 자산별 CMDB 조회의 전사 판. 그동안 SPOF 는 리포트 생성만 있고 인라인 인텐트가 없었다.
  const rspof = await ask('단일 장애점 자산 알려줘')
  ok('AI 단일장애점질의: SPOF 자산 인라인 요약(영향 범위·순위) + ?spof=1 링크(리포트 생성 아님)', /단일 장애점\(SPOF\) 자산은 \d+건/.test(rspof) && rspof.includes('장애 시 영향') && !rspof.includes('리포트를 생성했습니다') && (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?spof=1"]').count()) > 0)
  // 특정 사용자 보유 자산 조회(신규 역량) — 오프보딩·후임 승계 준비 시 "OOO 보유 자산"을 한 번에. 대장 소유자 검색(?q=이름)으로 연결돼 일괄 회수/재배정 접점.
  //  실제 사용자 이름이 질의에 있을 때만 발동(다른 인텐트 미가림). 김민준(플랫폼개발팀) 보유분 조회.
  const rown = await ask('김민준 보유 자산 알려줘')
  ok('AI 보유자질의: 특정 사용자(김민준) 보유 자산 + 대장 소유자 검색(?q=) 링크(오프보딩·승계 접점)', rown.includes('김민준') && rown.includes('보유') && (await page.locator('.msg.assistant').last().locator('.refs a[href*="/assets/register?q="]').count()) > 0)
  // 보유자 인텐트 오탈취 방지 — 자산담당 이름 '박자산'이 '자산'을 부분 포함하지만, 소유 동사(보유·가진·소유) 없는 "박자산 결재 대기"는
  //  보유 자산 조회가 아니라 결재 인텐트로 가야 한다(트리거를 소유 동사로 좁힌 뒤 검증 — 광범위 '자산' 트리거였다면 박자산 보유 목록을 반환했다).
  const rmisroute = await ask('박자산 결재 대기 알려줘')
  ok('AI 인텐트 스코핑: "박자산 결재"는 보유 조회 아닌 결재 인텐트(이름의 자산 부분열 오탈취 방지)', rmisroute.includes('결재 대기') && !rmisroute.includes('보유'))
  // 소유 동사 없는 자연 조회 커버 — 이름을 뺀 나머지에 '자산' 맥락이 있으면 발동(이름 제거 판정). "김민준 자산 목록"도 보유 조회로 정확히 라우팅(박자산 오탈취는 유지).
  const rownNoun = await ask('김민준 자산 목록 알려줘')
  ok('AI 보유자질의: 소유 동사 없는 "이름 자산 목록"도 보유 조회 발동(이름 제거 후 맥락 판정)', rownNoun.includes('김민준') && rownNoun.includes('보유 자산'))
  // 다가오는 일정(사전 계획) 질의 — 대시보드 '다가오는 일정' 카드와 같은 upcomingSchedule() 단일 소스. 향후 30일 예정분을 날짜순 아젠다로.
  //  전용 인텐트가 없으면 '일정' 질의가 폴백 답으로 떨어진다. 나열 날짜가 오름차순·창(≤30일) 이내인지 실행일 무관하게 자기검증.
  const rup = await ask('다가오는 일정 알려줘')
  ok('AI 다가오는일정질의: 향후 30일 예정 아젠다·유형별 집계(리포트 배포 포함)', /향후 30일 다가오는 일정은 \d+건입니다/.test(rup) && rup.includes('유형별:') && rup.includes('리포트 배포'))
  const upDates = [...rup.matchAll(/· (\d{4}-\d{2}-\d{2}) \(D-(\d+)\)/g)]
  ok('AI 다가오는일정질의: 나열 항목 날짜 오름차순·창(≤30일) 이내', upDates.length > 0 && upDates.every((m) => Number(m[2]) <= 30) && upDates.map((m) => m[1]).every((d, i, a) => i === 0 || a[i - 1] <= d))
  ok('AI 다가오는일정질의: 답변이 대시보드 다가오는 일정 카드로 연결', (await page.locator('.msg.assistant').last().locator('.refs a[href="/dashboard"]').count()) > 0)
  // 안전재고 부족 질의 — 재고 화면·대시보드와 같은 lib/stock 판정. 주변기기(유휴 1대)는 안전재고 2 미만이라 항상 부족(단말은 폐기 반려 복원 타이밍에 따라 가변이라 주변기기로 검증).
  const rs = await ask('안전재고 부족한 유형 알려줘')
  ok('AI 안전재고질의: 발주 검토 대상 유형·부족 수량 답변', rs.includes('안전재고 미달(발주 검토)') && rs.includes('주변기기') && rs.includes('부족'))
  // 수령 미확인 질의 — 인수 미확인 사용 중 자산(receiptPending·사용중). 이 시점엔 시드 2건(000015·000221)이 각각 확인·회수로 해제돼 '모두 확인' 응답(status 게이트가 스테일 제외).
  const rr = await ask('수령 미확인 자산 알려줘')
  ok('AI 수령미확인질의: 인수 확인 완료 시 모두 확인 응답(스테일 제외)', rr.includes('수령(인수) 확인이 안 된 자산이 없습니다') || rr.includes('수령(인수) 미확인 자산 현황'))
  // 답변↔링크 정합 — '자산 대장 (수령 미확인)' 링크가 실제 ?receipt=1 로 연결(그전엔 bare /assets/register 로 전체 대장). 빈 상태에서도 링크는 제공.
  ok('AI 수령미확인질의: 링크가 대장 수령 미확인 필터(?receipt=1)로 연결', (await page.locator('.msg.assistant').last().locator('.refs a[href="/assets/register?receipt=1"]').count()) > 0)
  const r2 = await ask('연간 교체 계획 리포트 생성해줘')
  ok('AI 교체질의: 생성 동사 → 리포트 생성 분기', r2.includes('리포트를 생성했습니다'))
  // 결재 첨부용 리포트는 네이티브 엑셀(xlsx) 로 반출된다(다른 대장·로그 반출과 동일 buildXlsx)
  const xlsxLink = await page.locator('.msg.assistant').last().locator('.refs a', { hasText: '엑셀 내려받기' }).getAttribute('href')
  ok('AI 리포트 생성: 엑셀(xlsx) 내려받기 링크 제공', !!xlsxLink && xlsxLink.includes('format=xlsx'))
  const rHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const rid = decodeURIComponent((rHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const rx = await page.request.get(`${BASE}/api/reports/${encodeURIComponent(rid)}?format=xlsx`)
  const xbuf = Buffer.from(await rx.body())
  ok('리포트 반출: 네이티브 xlsx(PK ZIP·스프레드시트 타입)', (rx.headers()['content-type'] || '').includes('spreadsheetml.sheet') && xbuf[0] === 0x50 && xbuf[1] === 0x4b)
  // 무압축 저장 ZIP 이라 셀 XML(inlineStr)이 평문 — 실제 리포트 데이터(제목·섹션)가 셀에 담겼는지 확인(빈 시트·오源 회귀 방지)
  const xtext = xbuf.toString('utf8')
  ok('리포트 반출: xlsx 셀에 실제 리포트 데이터(제목·섹션)', xtext.includes('연간 교체 계획') && xtext.includes('교체 대상 자산'))
  // 잦은 장애 누계 정합(회귀) — 교체 계획의 '잦은 장애 누계'는 자사 부담만(무상 보증 청구 제외)이어야 월간 리포트·TCO 와 어긋나지 않는다. 시드 AST-2023-000112: 자사 부담 243,000 + 무상 보증 청구 200,000 → 누계는 243,000.
  ok('교체 계획 리포트: 잦은 장애 누계는 자사 부담만(무상 보증 청구 제외 · 월간 리포트 정합)', xtext.includes('누계 243,000') && !xtext.includes('누계 443,000'))
  // 감사 대응 자료 리포트에 이상 자산 행위 탐지(fn02) 섹션이 실제 생성됨 — fn02가 유일하게 리포트 미커버였던 공백 해소.
  // 유휴 자산 사용(미승인 불출 AST-2021-000432)은 위협 대응 카운트 섹션엔 없는 행위 이상이라, 이 섹션이 없으면 감사 증적에서 누락된다.
  const r3 = await ask('감사 대응 자료 리포트 생성해줘')
  ok('AI 감사질의: 감사 대응 자료 생성 분기', r3.includes('리포트를 생성했습니다'))
  const aHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const aid = decodeURIComponent((aHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const ax = await page.request.get(`${BASE}/api/reports/${encodeURIComponent(aid)}?format=xlsx`)
  const atext = Buffer.from(await ax.body()).toString('utf8')
  ok('리포트 반출: 감사 대응 자료 xlsx 에 이상 자산 행위 탐지 섹션(fn02·유휴 자산 사용) 실린다', atext.includes('이상 자산 행위 탐지') && atext.includes('유휴 자산 사용') && atext.includes('AST-2021-000432'))
  // 정보보호 컴플라이언스 증적 리포트(신규) — ISMS/ISO 27001 통제별 증적을 기존 데이터로 집약. 자연어 생성 인텐트가 신규 종류 매칭(라이선스 컴플라이언스보다 우선), buildSections 가 5개 통제 섹션 산출.
  const rComp = await ask('정보보호 컴플라이언스 증적 리포트 생성해줘')
  ok('AI 컴플라이언스질의: 정보보호 컴플라이언스 증적 생성 분기(라이선스 컴플라이언스와 구분)', rComp.includes('리포트를 생성했습니다'))
  const compHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const compId = decodeURIComponent((compHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const compText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(compId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 정보보호 컴플라이언스 증적 xlsx 에 ISMS 통제 5섹션(자산 인벤토리·접근통제·매체 폐기·운영보안·로깅) 실린다', compText.includes('A.8.1 자산 인벤토리 통제') && compText.includes('A.9 접근 통제') && compText.includes('A.8.3 매체 폐기') && compText.includes('A.12 운영 보안') && compText.includes('A.12.4 로깅'))
  // 라이선스 갱신·트루업 계획 리포트(신규) — 전방 갱신 예측. 자연어 인텐트가 '갱신'으로 신규 종류 매칭(라이선스 컴플라이언스보다 우선), buildSections 가 갱신 예정·트루업 권고·예산 요약 산출.
  const rRen = await ask('라이선스 갱신 계획 리포트 생성해줘')
  ok('AI 갱신질의: 라이선스 갱신·트루업 계획 생성 분기(라이선스 컴플라이언스와 구분)', rRen.includes('리포트를 생성했습니다'))
  const renHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const renId = decodeURIComponent((renHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const renText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(renId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 라이선스 갱신·트루업 계획 xlsx 에 갱신 예정·트루업 권고·예산 요약 섹션 실린다', renText.includes('갱신 예정') && renText.includes('트루업 권고') && renText.includes('갱신 예산'))
  // 단일 장애점·영향 분석 리포트(신규·CMDB) — 자연어 인텐트가 '단일 장애점'으로 신규 종류 매칭, buildSections 가 CMDB 의존 그래프에서
  // 영향 범위 2대 이상 SPOF(시드: 방화벽 641 blast 4·스위치 640 blast 3)를 산출. 화면 대시보드 큐·자산 카드 토폴로지와 lib/cmdb 단일 소스.
  const rSpof = await ask('단일 장애점 영향 분석 리포트 생성해줘')
  ok('AI 장애점질의: 단일 장애점·영향 분석 생성 분기', rSpof.includes('리포트를 생성했습니다'))
  const spofHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const spofId = decodeURIComponent((spofHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const spofText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(spofId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 단일 장애점·영향 분석 xlsx 에 SPOF·이중화 섹션(방화벽 641·스위치 640) 실린다', spofText.includes('단일 장애점') && spofText.includes('AST-2022-000641') && spofText.includes('AST-2022-000640') && spofText.includes('이중화'))
  // 자산 운영 리스크 리포트(신규) — 자연어 인텐트 '운영 리스크' 매칭, buildSections 가 분실·미실측·연체·수리 지연·수령 미확인 5개 섹션을 대시보드 운영 큐와 같은 판정으로 산출.
  const rOpsRep = await ask('자산 운영 리스크 리포트 생성해줘')
  ok('AI 운영리스크질의: 자산 운영 리스크 생성 분기', rOpsRep.includes('리포트를 생성했습니다'))
  const riskHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const riskId = decodeURIComponent((riskHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const riskText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(riskId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 자산 운영 리스크 xlsx 에 5개 리스크 섹션 실린다', riskText.includes('분실·도난 자산') && riskText.includes('장기 미실측') && riskText.includes('대여 반환 연체') && riskText.includes('수리 지연') && riskText.includes('수령 미확인'))
  // 복합 위험 자산 리포트(신규 역량) — 정합성·EOL·보증·정기점검·SPOF·교체·미실측 중 2+ 신호가 겹치는 자산을 결재·감사 첨부용으로 반출.
  //  lib/risk 단일 소스(대장 ?risk=1 필터·대시보드 복합 위험 큐와 같은 판정). 생성 인텐트가 '복합 위험'으로 신규 종류를 매칭(운영 리스크와 구분).
  const rCompRisk = await ask('복합 위험 자산 리포트 생성해줘')
  ok('AI 복합위험질의: 복합 위험 자산 리포트 생성 분기(운영 리스크와 구분)', rCompRisk.includes('리포트를 생성했습니다') && rCompRisk.includes('복합 위험 자산'))
  const crHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const crId = decodeURIComponent((crHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const crText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(crId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 복합 위험 자산 xlsx 에 중첩 신호·신호별 빈도·부서별 분포 섹션 실린다', crText.includes('복합 위험 자산 (주의 신호 2개 이상 중첩)') && crText.includes('신호별 출현 빈도') && crText.includes('부서별 분포') && crText.includes('중첩 신호'))
  // 감가상각 명세 리포트(신규 역량) — 정액법 연도별 상각 전개(고정자산 회계·재취득 예산 근거). bookValueOf 단일 소스를 연말 날짜로 호출해 상각 곡선 산출.
  //  생성 인텐트가 '감가상각'으로 신규 종류 매칭. 부서별 비용 배분(현재 잔존가 스냅샷)과 달리 전방 연도별 전개.
  const rDep = await ask('감가상각 명세 리포트 생성해줘')
  ok('AI 감가상각질의: 감가상각 명세 리포트 생성 분기', rDep.includes('리포트를 생성했습니다') && rDep.includes('감가상각 명세'))
  const depHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const depId = decodeURIComponent((depHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const depText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(depId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 감가상각 명세 xlsx 에 연도별 상각 전개·유형별 상각 현황 섹션(연간 상각액·연말 장부가)', depText.includes('연도별 감가상각 명세') && depText.includes('연간 상각액') && depText.includes('연말 장부가') && depText.includes('유형별 상각 현황'))
  // 네이티브 숫자 셀 반출(신규) — 금액을 텍스트("3,000,000")가 아니라 네이티브 숫자 셀(<v>3000000</v>)로 반출해 회계가 엑셀에서 합산·수식·피벗 가능.
  //  toSheets 가 천단위 구분 금액 문자열을 숫자로 변환(#,##0 서식). 변환 전에는 금액이 inlineStr 텍스트라 <v>대형숫자 셀이 없었다(fails-without-fix).
  ok('리포트 반출: 감가상각 명세 xlsx 는 금액을 네이티브 숫자 셀(<v>)로 반출 — 회계 합산·수식 가능(텍스트 아님)', /<v>\d{6,}<\/v>/.test(depText))
  // 계약 갱신 전망 리포트(신규 역량) — 계약 만료(=갱신)를 분기 버킷으로 전방 전개(갱신 예산·현금흐름). 계약 관리 현황(D-90 스냅샷)과 달리 다분기 전망.
  //  생성 인텐트 '계약 갱신'이 라이선스 갱신·트루업보다 우선 매칭돼야 함(둘 다 '갱신' 포함 → 순서 검증). 응답이 '계약 갱신 전망'이어야 fails-without-fix.
  const rRenC = await ask('계약 갱신 전망 리포트 생성해줘')
  ok('AI 계약갱신질의: 계약 갱신 전망 생성 분기(라이선스 갱신·트루업과 구분·우선 매칭)', rRenC.includes('리포트를 생성했습니다') && rRenC.includes('계약 갱신 전망'))
  const rncHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const rncId = decodeURIComponent((rncHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const rncText = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(rncId)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 계약 갱신 전망 xlsx 에 분기별 갱신 전망·갱신 임박 상세 섹션(예상 갱신액)', rncText.includes('분기별 갱신 전망') && rncText.includes('예상 갱신액') && rncText.includes('갱신 임박 계약 상세'))
  // 분기별 갱신 전망 표에 합계 행 — 지평 총 갱신 예산을 표 안에서 바로 확인(예산 계획). 합계 금액은 네이티브 숫자 셀.
  ok('리포트 반출: 계약 갱신 전망 분기별 표에 합계 행(지평 총 갱신액)', rncText.includes('합계'))
  // 부서별 IT 비용 배분(차지백) 리포트 — 자연어 생성 인텐트가 신규 종류를 매칭하고, buildSections 가 부서별 원가·좌석 비용 섹션을 실제 산출.
  const r4 = await ask('부서별 IT 비용 배분 리포트 생성해줘')
  ok('AI 차지백질의: 부서별 IT 비용 배분 생성 분기', r4.includes('리포트를 생성했습니다'))
  const cHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const cid = decodeURIComponent((cHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const cx = await page.request.get(`${BASE}/api/reports/${encodeURIComponent(cid)}?format=xlsx`)
  const ctext = Buffer.from(await cx.body()).toString('utf8')
  ok('리포트 반출: 부서별 IT 비용 배분 xlsx 에 원가·좌석·유지보수 계약 섹션 실린다', ctext.includes('부서별 IT 자산 원가') && ctext.includes('부서별 라이선스 좌석 비용') && ctext.includes('부서별 유지보수 계약 비용') && ctext.includes('배분 요약'))
  // 부서별 3개 표에 합계 행 — 전사 총액을 표 안에서 바로 확인. '합계' 가 독립 셀(합계</t>)로 존재(요약 불릿의 문장 중 '합계'는 셀 종료가 아니라 구분됨).
  ok('리포트 반출: 부서별 IT 비용 배분 표에 합계 행(독립 셀)', ctext.includes('합계</t>'))
  // 계약 관리 현황 리포트(§03 계약 이행 보고) — 자연어 생성 인텐트 매칭 + 계약 포트폴리오·발주 이행·거버넌스 섹션 반출.
  const r5 = await ask('계약 관리 현황 리포트 생성해줘')
  ok('AI 계약질의: 계약 관리 현황 생성 분기', r5.includes('리포트를 생성했습니다'))
  const kHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const kid = decodeURIComponent((kHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const ktext = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(kid)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 계약 관리 현황 xlsx 에 포트폴리오·발주 이행·거버넌스 섹션 실린다', ktext.includes('계약 포트폴리오 요약') && ktext.includes('유지보수 예산 집행') && ktext.includes('구매 발주 이행') && ktext.includes('계약 거버넌스 점검'))
  // 재물조사 결과 요약 리포트 — 차이 상세·조정 결과 섹션(유형별 대장 대조·resolution). 감사 추적 강화.
  const r6 = await ask('재물조사 결과 요약 리포트 생성해줘')
  ok('AI 재물조사질의: 결과 요약 생성 분기', r6.includes('리포트를 생성했습니다'))
  const vHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const vid = decodeURIComponent((vHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const vtext = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(vid)}?format=xlsx`)).body()).toString('utf8')
  ok('리포트 반출: 재물조사 결과 요약 xlsx 에 차이 상세·조정 결과 섹션(유형별 대장 대조)', vtext.includes('차이 상세 · 조정 결과') && vtext.includes('위치 불일치') && vtext.includes('대장 미등록') && vtext.includes('AST-2025-000512'))

  // 계약 이행 인라인 질의(§05) — 유지보수 예산 초과·구매 발주 미이행 신호를 리포트 생성 없이 인라인으로 답한다(만료 질의로 오라우팅 금지).
  const cq = await ask('유지보수 예산 초과·발주 이행 계약 알려줘')
  ok('AI 계약이행질의: 예산 초과·발주 미이행 인라인 답변(리포트 생성 아님)', cq.includes('예산 초과') && cq.includes('네트워크 장비 통합 유지보수') && cq.includes('발주 미이행') && cq.includes('IDC-A 서버 증설') && !cq.includes('리포트를 생성했습니다'))
  // 만료 임박 계약 질의 — 목록·가장 임박 계약을 스토어에서 도출한다(하드코딩 금지). 시드상 CT-2024-011(2026-08-20 만료)이 창(90일) 내에 항상 포함돼 날짜에 견고.
  const eq = await ask('만료 임박 계약 알려줘')
  ok('AI 만료질의: 계약 목록 스토어 도출(하드코딩 아님·창 내 계약 나열)', eq.includes('만료 예정 계약은') && eq.includes('CT-2024-011'))

  // 특정 자산 조회(자산번호) — 상세·이력·레코드 딥링크
  const a1 = await ask('AST-2023-000112 자산의 상태와 변경 이력 알려줘')
  ok('AI 자산조회: 자산번호 상세+이력', a1.includes('AST-2023-000112') && a1.includes('변경 이력') && a1.includes('사용자'))
  const lastCard = page.locator('.msg.assistant').last()
  const href = await lastCard.locator('.refs a').first().getAttribute('href')
  ok('AI 자산조회: 레코드 단위 딥링크(?sel=)', href === '/assets/register?sel=AST-2023-000112')
  const a2 = await ask('AST-9999-000000 상태')
  ok('AI 자산조회: 미존재 자산 → 찾을 수 없음', a2.includes('찾을 수 없습니다'))
  // 자산 조회에 CMDB 의존/영향(blast radius) 노출(신규) — 변경·정비·장애 계획 시 "이 자산 장애나면 뭐 영향받나"를 대화형으로. 단일 장애점(방화벽 AST-2022-000641)은 하위 전이 영향 보유.
  const a3 = await ask('AST-2022-000641 자산 상태 알려줘')
  ok('AI 자산조회: CMDB 의존/영향(blast radius) 노출 — 단일 장애점의 전이 영향·상위 의존(변경·정비 사전 통지)', a3.includes('AST-2022-000641') && a3.includes('CMDB 의존') && a3.includes('blast radius'))

  // 결재 질의 역할 인지 — 전체 대기 중 '내가 결재할 수 있는 건'을 대시보드와 동일 게이트로 함께 제시.
  //  ADMIN 은 전 단계 오버라이드라 대기 건 전부를 결재할 수 있다 — 단 소유자 확인(APR-2607-114·109)은 결재(decide)가 아니라
  //  요청받은 부서의 응답(answerOwnerConfirm)이라 제외된다. 세면 '결재할 수 있는 건'이 결재함에서 처리 못 하는 건까지 세게 된다.
  const ap = await ask('결재 대기 현황 알려줘')
  const apTotal = Number((ap.match(/현재 결재 대기 (\d+)건/) || [])[1] ?? -1)
  const apMine = Number((ap.match(/지금 결재할 수 있는 건 (\d+)건/) || [])[1] ?? -2)
  ok('AI 결재질의: 역할 인지(내 결재 가능 수 표기)', ap.includes('지금 결재할 수 있는 건') && apMine >= 0 && apMine <= apTotal)
  ok('AI 결재질의: ADMIN 은 소유자 확인 제외 전 단계 결재 가능(내 결재 = 전체 − 소유자 확인 2건)', apTotal > 0 && apMine === apTotal - 2)

  // 미인가 SaaS 부서 스코프 — 대장엔 있으나 SaaS 기록 없는 부서는 '해당 없음'으로 정확히(전체로 미확장)
  const sInfra = await ask('인프라운영팀에서 쓰는 미인가 SaaS 알려줘')
  ok('AI SaaS질의: SaaS 없는 부서 → 해당 없음(전체 미확장)', sInfra.includes('인프라운영팀에서 사용하는 미인가(Shadow) SaaS는 없습니다'))
  const sDev = await ask('플랫폼개발팀에서 쓰는 미인가 SaaS')
  ok('AI SaaS질의: SaaS 있는 부서 → 부서 스코프', sDev.includes('플랫폼개발팀의 미인가') || sDev.includes('플랫폼개발팀에서 사용하는'))
  // 차단 판정 완료분은 '판정 대기' 미인가가 아니다 — 답변이 '인가·차단 판정은 …에서 처리합니다'로 맺으므로,
  //  이미 차단한 서비스를 세면 처리 끝난 건을 다시 판정하라고 안내하게 된다. 시드 Dropbox(카탈로그 차단·차단 집행 요청 발송)로 확인.
  const sAll = await ask('미인가 SaaS 알려줘')
  ok('AI SaaS질의: 차단 판정 완료 서비스는 미인가 목록에서 제외(Dropbox)', !sAll.includes('Dropbox'))
  ok('AI SaaS질의: 판정 대기 미인가는 그대로 노출(ChatGPT)', sAll.includes('ChatGPT'))
}

try {
  const browser = await chromium.launch({ executablePath: EXE, headless: true })
  console.log(`보안 findings 대응 루프 e2e — ${REMOTE ? '원격' : '로컬'} ${BASE}\n`)

  // ── 보안담당: 각 finding 대응 루프 ──────────────────────────────
  const ctx = await browser.newContext()
  await ctx.addCookies([cookie(SEC)])
  const page = await ctx.newPage()
  page.on('pageerror', (e) => { fail++; console.log('  ✗ PAGEERROR: ' + (e.message || e)) })

  // 발견 자산 화면 — 휴면 계정(46)·미인가 SW(47)·USB(48)·로컬 VM(49)
  const FOUND = '/discovery/found'
  await twoChoice(page, { name: '휴면 계정(46)', navTo: FOUND, cardText: '계정 위생', rowText: 'admin.tmp', btnRe: /^비활성화$/ })
  // 휴면 계정 일괄 비활성화 — 분기 접근 재인증 스윕(ISO 27001 A.9/SOX)에서 미로그인 계정을 체크박스로 선택해 한 번에 비활성화(단건 반복 방지). 미조치분 sh.oh 선택.
  {
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const acctCard = page.locator('.card', { hasText: '계정 위생' })
    await acctCard.locator('tr', { hasText: 'sh.oh' }).locator('input[type="checkbox"]').check()
    await acctCard.locator('button', { hasText: /^비활성화 \(1\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const rowTxt = (await page.locator('.card', { hasText: '계정 위생' }).locator('tr', { hasText: 'sh.oh' }).first().textContent()) || ''
    ok('휴면 계정 일괄 비활성화: 선택 계정 일괄 처리(비활성화 요청 반영)', rowTxt.includes('비활성화 요청'))
  }
  await twoChoice(page, { name: '미인가 SW(47)', navTo: FOUND, cardText: '설치 SW 정책 위반', rowText: 'uTorrent', btnRe: /^제거 요청$/ })
  await twoChoice(page, { name: 'USB(48)', navTo: FOUND, cardText: '이동식 매체 정책 위반', rowText: 'Samsung T7 SSD', btnRe: /^차단$/ })
  await twoChoice(page, { name: '로컬 VM(49)', navTo: FOUND, cardText: '엔드포인트 VM 정책 위반', rowText: 'legacy-test', btnRe: /^회수$/ })
  // 미관리 클라우드 리소스(60) — 채널 05 CSP API 산출을 편입/격리가 아니라 거버넌스 조치로 닫는다. 태그 미부착 리소스에 태그·소유 지정 요청.
  await twoChoice(page, { name: '클라우드 리소스(60)', navTo: FOUND, cardText: '태그·소유·통제 위반', rowText: 'i-0f3a91c2d8', btnRe: /^태그·소유 지정$/ })
  // 개인 구독 리소스는 회수(종료) 집행 대상 — 태그 요청과 다른 강경 조치가 같은 표에서 선택된다
  await twoChoice(page, { name: '클라우드 리소스 회수(60)', navTo: FOUND, cardText: '태그·소유·통제 위반', rowText: 'ip-10-31-4-70', btnRe: /^회수$/ })
  // USB 저장매체 일괄 차단 — 매체통제 정책·EDR 스윕에서 미조치 매체를 체크박스로 선택해 일괄 차단(단건 반복 방지). 미조치분 Kingston 선택(SanDisk·Samsung 은 아래 예외·차단 단건 테스트가 소비).
  {
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const usbCard = page.locator('.card', { hasText: '이동식 매체 정책 위반' })
    await usbCard.locator('tr', { hasText: 'Kingston' }).locator('input[type="checkbox"]').check()
    await usbCard.locator('button', { hasText: /^차단 \(1\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const kt = (await page.locator('.card', { hasText: '이동식 매체 정책 위반' }).locator('tr', { hasText: 'Kingston' }).first().textContent()) || ''
    ok('USB 저장매체 일괄 차단: 선택 매체 일괄 처리(차단 요청 반영)', kt.includes('차단 요청'))
  }
  // 로컬 VM 일괄 회수 — 하이퍼바이저 금지 정책 스윕에서 미조치 VM을 체크박스로 선택해 일괄 회수. 미조치분 unregistered-guest 선택(dev-sandbox·legacy-test 는 아래 단건 테스트가 소비).
  {
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const vmCard = page.locator('.card', { hasText: '엔드포인트 VM 정책 위반' })
    await vmCard.locator('tr', { hasText: 'unregistered-guest' }).locator('input[type="checkbox"]').check()
    await vmCard.locator('button', { hasText: /^회수 \(1\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const ug = (await page.locator('.card', { hasText: '엔드포인트 VM 정책 위반' }).locator('tr', { hasText: 'unregistered-guest' }).first().textContent()) || ''
    ok('로컬 VM 일괄 회수: 선택 VM 일괄 처리(회수 요청 반영)', ug.includes('회수 요청'))
  }

  // 미인가 SW 일괄 제거 요청 — 새로 금지된 SW·EDR 스윕처럼 같은 위반이 여러 대에 잡히면 체크박스로 선택해 한 번에 제거 요청(단건 반복 방지).
  //  미조치분 AnyDesk·Adobe Photoshop(크랙) 2건을 선택해 일괄 처리한다(uTorrent 는 위 단건 처리됨, Notion 은 아래 예외 승인용).
  await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
  const swBulkCard = page.locator('.card', { hasText: '설치 SW 정책 위반' })
  await swBulkCard.locator('tr', { hasText: 'AnyDesk' }).locator('input[type="checkbox"]').check()
  await swBulkCard.locator('tr', { hasText: 'Adobe Photoshop' }).locator('input[type="checkbox"]').check()
  await swBulkCard.locator('button', { hasText: /^제거 요청 \(2\)$/ }).click()
  await page.waitForTimeout(700)
  await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
  const swAfter = page.locator('.card', { hasText: '설치 SW 정책 위반' })
  const anyDeskTxt = (await swAfter.locator('tr', { hasText: 'AnyDesk' }).first().textContent()) || ''
  const adobeTxt = (await swAfter.locator('tr', { hasText: 'Adobe Photoshop' }).first().textContent()) || ''
  ok('미인가 SW 일괄 제거 요청: 선택 2건 한 번에 처리(제거 요청 반영)', anyDeskTxt.includes('제거 요청') && adobeTxt.includes('제거 요청'))

  // USB·로컬 VM 예외 승인 해제 — 잘못 승인한(또는 정책 변경) 예외를 되돌려 다시 정책 대상으로. SW 화이트리스트 해제와 같은 규약(그동안 USB·VM 예외는 비가역).
  await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
  const usbRow = () => page.locator('tr', { has: page.locator('td', { hasText: 'SanDisk Ultra' }) }).first()
  await usbRow().locator('button', { hasText: /^예외 승인$/ }).click()
  await page.waitForTimeout(600)
  ok('USB 예외 승인 → 예외 해제 컨트롤 노출(가역)', (await usbRow().locator('button', { hasText: /^예외 해제$/ }).count()) > 0)
  await usbRow().locator('button', { hasText: /^예외 해제$/ }).click()
  await page.waitForTimeout(600)
  ok('USB 예외 해제 → 다시 정책 대상(차단·예외 승인 복귀)', (await usbRow().locator('button', { hasText: /^차단$/ }).count()) > 0)
  const vmRow = () => page.locator('tr', { has: page.locator('td', { hasText: 'dev-sandbox' }) }).first()
  await vmRow().locator('button', { hasText: /^예외 승인$/ }).click()
  await page.waitForTimeout(600)
  ok('로컬 VM 예외 승인 → 예외 해제 컨트롤 노출(가역)', (await vmRow().locator('button', { hasText: /^예외 해제$/ }).count()) > 0)
  await vmRow().locator('button', { hasText: /^예외 해제$/ }).click()
  await page.waitForTimeout(600)
  ok('로컬 VM 예외 해제 → 다시 정책 대상(회수·예외 승인 복귀)', (await vmRow().locator('button', { hasText: /^회수$/ }).count()) > 0)

  // 휴면 계정 소유자 확인 결과 처리 — '소유자 확인 요청'이 그동안 부서 메일만 나가고 결과 반영 경로가 없어 방치됐다. 확인 결과를 사용 확인(정리)/비활성화로 닫는다.
  await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
  const svcRow = () => page.locator('tr', { has: page.locator('td', { hasText: 'svc-legacy-batch' }) }).first()
  await svcRow().locator('button', { hasText: /^소유자 확인$/ }).click()
  await page.waitForTimeout(600)
  ok('휴면 계정 소유자 확인 요청 → 결과 처리 컨트롤(사용 확인·비활성화) 노출', (await svcRow().locator('button', { hasText: /^사용 확인$/ }).count()) > 0)
  await svcRow().locator('button', { hasText: /^사용 확인$/ }).click()
  await page.waitForTimeout(600)
  ok('휴면 계정 사용 확인(유효 계정) → 휴면 리스크 정리', (await svcRow().locator('text=사용 확인').count()) > 0 && (await svcRow().locator('button', { hasText: /^비활성화$/ }).count()) === 0)
  const limRow = () => page.locator('tr', { has: page.locator('td', { hasText: 'jh.lim' }) }).first()
  await limRow().locator('button', { hasText: /^소유자 확인$/ }).click()
  await page.waitForTimeout(600)
  await limRow().locator('button', { hasText: /^비활성화$/ }).click()
  await page.waitForTimeout(600)
  ok('휴면 계정 소유자 확인 결과 미사용 → 비활성화 요청 전환', (await limRow().locator('text=비활성화 요청').count()) > 0)

  // 미인가 SW 정책의 허용 축 — 예외 승인 → SW 화이트리스트 등재 → 해제(재사용 정책, §01 보안담당: 미인가 SW 정책 관리)
  {
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const swCard = page.locator('.card', { has: page.locator('.tt', { hasText: '미인가 SW — 설치 SW 정책 위반' }) }).first()
    await swCard.locator('tr', { has: page.locator('td', { hasText: 'Notion Desktop' }) }).first().locator('button', { hasText: /^예외 승인$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    const wlText = () => page.locator('.card', { has: page.locator('.tt', { hasText: 'SW 예외 승인 목록' }) }).first().textContent()
    ok('미인가 SW 예외 승인 → SW 화이트리스트 등재', (await wlText()).includes('Notion Desktop'))
    // 해제 → 다시 정책 대상 (목록에서 제거)
    const wlCard = page.locator('.card', { has: page.locator('.tt', { hasText: 'SW 예외 승인 목록' }) }).first()
    await wlCard.locator('tr', { has: page.locator('td', { hasText: 'Notion Desktop' }) }).first().locator('button', { hasText: /^해제$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${FOUND}`, { waitUntil: 'networkidle' })
    ok('SW 화이트리스트 해제 → 목록에서 제거', !(await wlText()).includes('Notion Desktop'))
  }

  // 외부 공격표면 화면 — 크리덴셜(45)·IOC(50)·유출(28)
  const EXT = '/discovery/external'
  await twoStep(page, { name: '크리덴셜 노출(45)', navTo: EXT, cardText: '인증 취약점 점검', rowText: 'PostgreSQL' })
  await twoChoice(page, { name: 'IOC 상관(50)', navTo: EXT, cardText: 'IOC 상관·행위자 귀속', rowText: 'RedLine', btnRe: /^차단$/ })
  await twoStep(page, { name: '다크웹 유출(28)', navTo: EXT, cardText: '유출 수집', rowText: '유출 계정' })

  // 대응 취소(재개) 파리티 — 유출·크리덴셜·IOC 도 위험수용 해제처럼 오조치를 되돌릴 수 있어야 한다(잘못 종결한 건이 미조치 큐·감사에서 사라지지 않게).
  //  각 건: 조치 완료 → 재개 → 미조치(조치 버튼 복귀) 확인 후, 재대응으로 원상 복구해 하위 감사 검증 상태를 보존한다.
  {
    // 크리덴셜(PostgreSQL): 조치 완료 → 재개 → 대응 버튼 복귀
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const credCard = page.locator('.card', { hasText: '인증 취약점 점검' })
    const credRow = () => credCard.locator('tr', { hasText: 'PostgreSQL' })
    await credRow().locator('button', { hasText: /^재개$/ }).click()
    await page.waitForTimeout(600)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    ok('크리덴셜 대응 취소(재개): 조치 완료 → 미조치(대응 버튼 복귀)', (await credRow().locator('button', { hasText: /^대응$/ }).count()) > 0)
    await credRow().locator('button', { hasText: /^대응$/ }).click()
    await page.waitForTimeout(300)
    await credCard.locator('button', { hasText: '대응 확정' }).first().click()
    await page.waitForTimeout(700)
  }
  {
    // IOC(RedLine): 차단 요청 → 재개 → 차단 버튼 복귀
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const iocCard = page.locator('.card', { hasText: 'IOC 상관·행위자 귀속' })
    const iocRow = () => iocCard.locator('tr', { hasText: 'RedLine' })
    await iocRow().locator('button', { hasText: /^재개$/ }).click()
    await page.waitForTimeout(600)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    ok('IOC 조치 취소(재개): 차단 요청 → 미조치(차단 버튼 복귀)', (await iocRow().locator('button', { hasText: /^차단$/ }).count()) > 0)
    await iocRow().locator('button', { hasText: /^차단$/ }).first().click()
    await page.waitForTimeout(700)
  }
  // IOC 일괄 대응 — 위협 인텔 피드 갱신으로 다수 IOC가 한꺼번에 상관될 때 체크박스로 선택해 한 번에 차단(단건 반복 방지). RedLine 은 위 단건·재개 테스트가 소비하므로 미조치분 Tor C2·LockBit 도메인 선택.
  {
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const iocCard = page.locator('.card', { hasText: 'IOC 상관·행위자 귀속' })
    await iocCard.locator('tr', { hasText: '185.220.101.44' }).locator('input[type="checkbox"]').check()
    await iocCard.locator('tr', { hasText: 'lockbit-mirror' }).locator('input[type="checkbox"]').check()
    await iocCard.locator('button', { hasText: /^차단 \(2\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const c = page.locator('.card', { hasText: 'IOC 상관·행위자 귀속' })
    const tor = (await c.locator('tr', { hasText: '185.220.101.44' }).first().textContent()) || ''
    const lb = (await c.locator('tr', { hasText: 'lockbit-mirror' }).first().textContent()) || ''
    ok('IOC 일괄 차단: 선택 2건 일괄 처리(차단 요청 반영)', tor.includes('차단 요청') && lb.includes('차단 요청'))
  }
  {
    // 유출(유출 계정): 조치 완료 → 재개 → 대응 버튼 복귀
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const leakCard = page.locator('.card', { hasText: '유출 수집' })
    const leakRow = () => leakCard.locator('tr', { hasText: '유출 계정' })
    await leakRow().locator('button', { hasText: /^재개$/ }).click()
    await page.waitForTimeout(600)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    ok('유출 대응 취소(재개): 조치 완료 → 미조치(대응 버튼 복귀)', (await leakRow().locator('button', { hasText: /^대응$/ }).count()) > 0)
    await leakRow().locator('button', { hasText: /^대응$/ }).click()
    await page.waitForTimeout(300)
    await leakCard.locator('button', { hasText: '대응 확정' }).first().click()
    await page.waitForTimeout(700)
  }

  // 크리덴셜 노출 일괄 대응 — 크리덴셜 스터핑·대량 유출 점검에서 미조치 노출을 같은 표준 조치로 한 번에 처리(단건 반복 방지). PostgreSQL 은 위 단건·재개가 소비하므로 미조치분 HTTP Basic·Redis 선택.
  {
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const credCard = page.locator('.card', { hasText: '인증 취약점 점검' })
    await credCard.locator('tr', { hasText: 'HTTP Basic' }).locator('input[type="checkbox"]').check()
    await credCard.locator('tr', { hasText: 'Redis' }).locator('input[type="checkbox"]').check()
    await credCard.locator('button', { hasText: /^일괄 대응 \(2\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const cc = page.locator('.card', { hasText: '인증 취약점 점검' })
    const hb = (await cc.locator('tr', { hasText: 'HTTP Basic' }).first().textContent()) || ''
    const rd = (await cc.locator('tr', { hasText: 'Redis' }).first().textContent()) || ''
    ok('크리덴셜 노출 일괄 대응: 선택 2건 일괄 처리(조치 완료)', hb.includes('조치 완료') && rd.includes('조치 완료'))
  }
  // 다크웹 유출 일괄 대응 — 대량 유출 사고에서 미조치 건을 같은 표준 조치로 한 번에 처리. 유출 계정은 위 단건·재개가 소비하므로 미조치분 스틸러 로그·코드 저장소 시크릿 선택.
  {
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const leakCard2 = page.locator('.card', { hasText: '유출 수집' })
    await leakCard2.locator('tr', { hasText: '스틸러 로그' }).locator('input[type="checkbox"]').check()
    await leakCard2.locator('tr', { hasText: '코드 저장소 시크릿' }).locator('input[type="checkbox"]').check()
    await leakCard2.locator('button', { hasText: /^일괄 대응 \(2\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const lc = page.locator('.card', { hasText: '유출 수집' })
    const stl = (await lc.locator('tr', { hasText: '스틸러 로그' }).first().textContent()) || ''
    const sk = (await lc.locator('tr', { hasText: '코드 저장소 시크릿' }).first().textContent()) || ''
    ok('다크웹 유출 일괄 대응: 선택 2건 일괄 처리(조치 완료)', stl.includes('조치 완료') && sk.includes('조치 완료'))
  }

  // 감사 로그 적재 확인 — 조치가 감사에 남는지
  await page.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const audit = await page.textContent('body')
  ok('감사 로그: findings 대응 6종 적재', ['휴면 계정 비활성화', '미인가 SW 제거', 'USB 저장매체 차단', '로컬 VM 회수', 'IOC 차단', '크리덴셜 노출 대응'].every((s) => audit.includes(s)))
  // 긴급 보안 에스컬레이션(IOC 차단)은 이메일 상세 + 문자(SMS) 즉시 알림으로 이중 발송된다
  ok('긴급 에스컬레이션: IOC 차단 이메일+문자(SMS) 이중 발송', audit.includes('IOC 차단 집행 요청') && audit.includes('[긴급] IOC 차단 요청'))

  // 탐지 채널 재탐지 주기 경과(수집 지연 · Discovery 사각) — 활성 채널인데 마지막 수집이 주기를 넘긴 정체 수집기를 스캔 화면에 칩으로 노출(EASM 재탐지 지연과 동형).
  await page.goto(`${BASE}/discovery/scan`, { waitUntil: 'networkidle' })
  const scanChanBody = (await page.textContent('body')) || ''
  ok('스캔 실행: 재탐지 주기 경과 채널에 재탐지 지연 칩', scanChanBody.includes('채널별 수집 현황') && scanChanBody.includes('재탐지 지연'))

  // 주간 Shadow IT 브리핑의 '미인가 SaaS' 절 — 이미 차단 판정이 난 서비스는 '소유자 확인 후 편입 또는 차단 판정이 필요'한 대상이 아니다.
  //  sanctioned 는 인가/미인가 두 값뿐이라 차단을 담지 못해, 시드 Dropbox(카탈로그 차단 · 프록시·DNS 차단 집행 요청까지 발송)가
  //  미인가 갭으로 계속 집계됐다. 통합 후보 산정이 이미 쓰는 기준(카탈로그 차단 목록)과 같게 맞춘다.
  const ctxSB = await browser.newContext(); await ctxSB.addCookies([cookie(ASSET)]); const pSB = await ctxSB.newPage()
  await pSB.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await pSB.locator('.card', { hasText: '리포트 유형' }).locator('tr', { hasText: '주간 Shadow IT 브리핑' }).locator('button', { hasText: /^생성$/ }).click()
  await pSB.waitForTimeout(1200)
  // '.card' 로 절을 잡으려 했더니 리포트 유형 표의 설명(…미인가 SaaS…)이 먼저 걸려 빈 대조가 됐다 — 생성된 리포트 미리보기가 열린 페이지 전체로 본다.
  const sbBody = (await pSB.textContent('body')) || ''
  ok('Shadow IT 브리핑: 차단 판정된 SaaS 는 미인가 갭에서 제외(Dropbox)', !sbBody.includes('Dropbox'))
  ok('Shadow IT 브리핑: 판정 대기 미인가 SaaS 는 그대로 집계(ChatGPT)', sbBody.includes('ChatGPT'))
  // 외부 공격표면 절도 같은 기준이어야 한다 — 시드 EXT-2607-06(db-backup)은 이미 차단 요청이 걸린 노출인데
  //  state 로만 걸러 손대지 않은 노출로 실렸다(표에 조치 상태 열이 없어 읽는 쪽은 구분 못 한다).
  ok('Shadow IT 브리핑: 조치 걸린 외부 노출은 미등록 갭에서 제외(db-backup)', !sbBody.includes('db-backup.seekerslab.co.kr'))
  ok('Shadow IT 브리핑: 미조치 외부 노출은 그대로 집계(legacy-vpn)', sbBody.includes('legacy-vpn.seekerslab.co.kr'))
  await ctxSB.close()

  // 컴플라이언스 증적의 '미등록 발견 자산 N건(편입 대상)' — 편입하지 않기로 판정된 건(관리 제외·격리 요청)까지 세면
  //  실재하지 않는 통제 갭을 ISMS/ISO 감사 증적에 올리게 된다. 시드 미등록 8건 중 격리 요청 1건(DSC-2607-0031)을 빼 7건.
  //  아래 발견 자산 처리 테스트들이 미등록 집합을 바꾸므로 그 앞에서 확인한다.
  const ctxCE = await browser.newContext(); await ctxCE.addCookies([cookie(ASSET)]); const pCE = await ctxCE.newPage()
  await pCE.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await pCE.locator('.card', { hasText: '리포트 유형' }).locator('tr', { hasText: '정보보호 컴플라이언스 증적' }).locator('button', { hasText: /^생성$/ }).click()
  await pCE.waitForTimeout(1200)
  ok('컴플라이언스 증적: 편입 대상 집계에서 격리 요청·관리 제외 제외(7건)', ((await pCE.textContent('body')) || '').includes('미등록 발견 자산 7건(편입 대상)'))
  await ctxCE.close()

  // 발견 자산 관리 제외 — 관리 대상이 아닌 비자산(협력사 장비·게스트 단말)을 편입/격리 아닌 판정으로 미등록 갭에서 뺀다(사유 필수·해제 가능).
  //  그동안 편입/격리/확인만 있어 비자산 발견 건은 미등록 갭에 영구 잔존했다(컨셉 §3 '목록만 쌓인다'). DSC-2607-0046 제외 → 해제(원복).
  await page.goto(`${BASE}/discovery/found?sel=DSC-2607-0046`, { waitUntil: 'networkidle' })
  await page.locator('input[placeholder*="관리 제외 사유"]').fill('e2e — 협력사 임시 반입 장비(비관리)')
  await page.locator('button', { hasText: /^관리 제외$/ }).click()
  await page.waitForTimeout(700)
  const dismissedBody = (await page.textContent('body')) || ''
  ok('발견 자산 관리 제외: 비자산 판정 → 미등록 갭에서 제외', dismissedBody.includes('관리 제외됨') && dismissedBody.includes('제외 해제'))
  // 미등록 처리 필요 카운트에서 빠졌는지 — 제외 후 편입/격리 액션이 사라지고 제외 해제 액션만 남는다
  ok('발견 자산 관리 제외: 편입/격리 액션 대신 제외 해제 노출', (await page.locator('button', { hasText: /^편입 요청 \(결재\)$/ }).count()) === 0)
  // 관리 제외는 '미등록 갭·Shadow IT 신호에서 뺀다'가 정의다 — AI 자동분류 패널도 그 신호 중 하나라, 비자산으로 판정한 건에
  //  표준 자산 유형을 붙여 분류 대상 수·평균 신뢰도·유형 분포까지 부풀리면 제외 판정이 무의미해진다. 제외 중에는 빠지고 해제하면 돌아와야 한다.
  const ctxCL = await browser.newContext(); await ctxCL.addCookies([cookie(SEC)]); const pCL = await ctxCL.newPage()
  await pCL.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const clCard = pCL.locator('.card', { hasText: '자동분류 제안' }).first()
  ok('AI 자동분류: 관리 제외된 발견 건은 분류 대상에서 빠짐', !((await clCard.textContent()) || '').includes('DESKTOP-UNK09'))
  await ctxCL.close()
  await page.locator('button', { hasText: /^제외 해제/ }).click()
  await page.waitForTimeout(700)
  ok('발견 자산 관리 제외 해제 → 미등록 처리 대상 복귀(편입 요청 액션 재노출)', (await page.locator('button', { hasText: /^편입 요청 \(결재\)$/ }).count()) > 0)
  // 관리 제외 일괄 — 협력사 장비·게스트 단말 등 비자산을 같은 사유로 한 번에 미등록 갭에서 뺀다(편입·소유자 확인 일괄 요청과 함께 발견 트리아지 3종 완결). 미등록·미처리분 0045·0046 선택.
  await page.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  await page.locator('input[aria-label="DSC-2607-0045 편입 선택"]').check()
  await page.locator('input[aria-label="DSC-2607-0046 편입 선택"]').check()
  await page.locator('input[placeholder="관리 제외 사유"]').fill('협력사 임시 반입 장비 일괄 정리 — e2e')
  await page.locator('button', { hasText: /^일괄 관리 제외 \(2\)$/ }).click()
  await page.waitForTimeout(800)
  ok('관리 제외 일괄: 선택 2건 일괄 관리 제외(미등록 갭에서 제외)', ((await page.locator('body').textContent()) || '').includes('2건 관리 제외'))

  // 외부 노출 위험 수용 — 편입/차단이 아닌 '인지된 노출'로 공식 수용(사유 필수). 활성 취약점 우선순위(미조치)에서 제외, 오판이면 해제. 위험 관리 표준 처분(ISMS 위험 수용).
  await page.goto(`${BASE}/discovery/external`, { waitUntil: 'networkidle' })
  const extRow = page.locator('tr', { has: page.locator('td', { hasText: 'dev-api.seekerslab.co.kr' }) }).first()
  await extRow.locator('button', { hasText: /^위험 수용$/ }).click()
  await page.waitForTimeout(200)
  await extRow.locator('input[placeholder="수용 사유"]').fill('e2e — 격리망 내부 전용·보상통제 적용')
  await extRow.locator('button', { hasText: /^확정$/ }).click()
  await page.waitForTimeout(700)
  const extRow2 = page.locator('tr', { has: page.locator('td', { hasText: 'dev-api.seekerslab.co.kr' }) }).first()
  ok('외부 노출 위험 수용: 인지된 노출로 수용(위험 수용 처분 · 편입/차단 대신)', (await extRow2.locator('text=위험 수용').count()) > 0 && (await extRow2.locator('button', { hasText: /^차단 요청$/ }).count()) === 0)
  await extRow2.locator('button', { hasText: /^해제$/ }).click()
  await page.waitForTimeout(700)
  ok('외부 노출 위험 수용 해제 → 미조치(편입/차단 대상) 복귀', (await page.locator('tr', { has: page.locator('td', { hasText: 'dev-api.seekerslab.co.kr' }) }).first().locator('button', { hasText: /^차단 요청$/ }).count()) > 0)

  // 외부 노출 일괄 차단 — 재탐지·CVE 스윕에서 미조치·생존 확인된 노출 호스트를 체크박스로 선택해 한 번에 차단(공격 표면 축소 스윕). dev-api 는 위 위험 수용 테스트가 소비하므로 미조치분 legacy-vpn·kiosk-cam 선택.
  {
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const extCard = page.locator('.card', { hasText: '발견에서 조치까지' })
    await extCard.locator('tr', { hasText: 'legacy-vpn' }).locator('input[type="checkbox"]').check()
    await extCard.locator('tr', { hasText: 'kiosk-cam' }).locator('input[type="checkbox"]').check()
    await extCard.locator('button', { hasText: /^차단 요청 \(2\)$/ }).click()
    await page.waitForTimeout(700)
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const c = page.locator('.card', { hasText: '발견에서 조치까지' })
    const vpn = (await c.locator('tr', { hasText: 'legacy-vpn' }).first().textContent()) || ''
    const cam = (await c.locator('tr', { hasText: 'kiosk-cam' }).first().textContent()) || ''
    ok('외부 노출 일괄 차단: 선택 2건 일괄 처리(차단요청 반영)', vpn.includes('차단요청') && cam.includes('차단요청'))
  }

  // CT(인증서 투명성) 채널 — 인증서 발급 CA·유효기간 수집 후 유효기간으로 생존 여부 추정(§04). 유효 인증서=생존 유력, 만료=생존 불명(방치 후보). 능동 확인 전 수동 트라이애지 신호.
  {
    await page.goto(`${BASE}${EXT}`, { waitUntil: 'networkidle' })
    const c = page.locator('.card', { hasText: '발견에서 조치까지' })
    const active = (await c.locator('tr', { hasText: 'ct-active.seekerslab.co.kr' }).first().textContent()) || ''
    const legacy = (await c.locator('tr', { hasText: 'ct-legacy.seekerslab.co.kr' }).first().textContent()) || ''
    ok('CT 인증서 유효 → 발급 CA·유효기간 수집·생존 유력 추정(추정 생존)',
      active.includes("Let's Encrypt") && active.includes('생존 유력') && active.includes('추정 생존'))
    ok('CT 인증서 만료 → 생존 불명(방치 후보)로 추정',
      legacy.includes('Sectigo') && legacy.includes('만료') && legacy.includes('생존 불명'))
  }

  // AI 어시스턴트 스코핑(회귀) — 보안담당은 계약·라이선스·재고·수명주기 화면·전역 검색에서 막히므로 어시스턴트도 동일. 자산 도메인 질의는 데이터가 아니라 데모 안내(폴백)로 떨어져야 한다(!isUser 로 뭉뚱그려 유출하던 공백). Discovery·미인가 SaaS 등 보안 정당 도메인은 그대로 응답.
  {
    await page.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
    const secAsk = async (q) => {
      const before = await page.locator('.msg.assistant .bub').count()
      await page.locator('.chat-in input').fill(q)
      await page.locator('.chat-in input').press('Enter')
      await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, before, { timeout: 8000 })
      await page.waitForTimeout(150)
      return (await page.locator('.msg.assistant .bub').last().textContent()) || ''
    }
    const secLic = await secAsk('라이선스 초과 사용 현황')
    ok('AI 어시스턴트 스코핑: 보안담당 라이선스 질의는 데이터 미노출(데모 안내 폴백)', secLic.includes('데모 모드'))
    const secContract = await secAsk('만료 임박한 계약 목록')
    ok('AI 어시스턴트 스코핑: 보안담당 계약 질의도 미노출(폴백)', secContract.includes('데모 모드') && !secContract.includes('세종네트웍스'))
    const secSaas = await secAsk('미인가 SaaS 현황 알려줘')
    ok('AI 어시스턴트 스코핑: 보안담당 미인가 SaaS 질의는 정상 응답(과잉 차단 아님 · 양성 대조)', !secSaas.includes('데모 모드'))
  }

  // AI 제안 판정 루프(11) — 승인→조치·반려 사유 필수
  await aiInsightDecide(page)
  await ctx.close()

  // ── 자산담당: 역할 게이트(조치 버튼 미노출) ────────────────────
  const ctx2 = await browser.newContext()
  await ctx2.addCookies([cookie(ASSET)])
  const p2 = await ctx2.newPage()
  await p2.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  const foundCards = ['계정 위생', '설치 SW 정책 위반', '이동식 매체 정책 위반', '엔드포인트 VM 정책 위반']
  let gated = true
  for (const c of foundCards) gated = gated && (await p2.locator('.card', { hasText: c }).locator('button', { hasText: /비활성화|제거 요청|차단|회수/ }).count()) === 0
  ok('자산담당: 발견 자산 findings 조치 버튼 전부 미노출 (조회만)', gated)
  await p2.goto(`${BASE}/discovery/external`, { waitUntil: 'networkidle' })
  ok('자산담당: 외부 공격표면 findings 조치 버튼 미노출 (조회만)', (await p2.locator('button', { hasText: /^대응$|^차단$|^조사 착수$/ }).count()) === 0)
  // 수령 확인 독촉 — 수령 미확인 자산(시드 AST-2024-000015, 이후 ctxU 가 확인)에 대해 자산담당이 사용자에게 인수 확인 요청 발송(반환 독촉의 수령판).
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  const rcptBtn = p2.locator('button', { hasText: /수령 확인 독촉 발송/ })
  ok('수령 확인 독촉: 미확인 있으면 자산담당에 독촉 버튼 노출', (await rcptBtn.count()) > 0)
  await rcptBtn.first().click()
  await p2.waitForTimeout(700)
  const rcptBody = (await p2.locator('body').textContent()) || ''
  ok('수령 확인 독촉: 발송 성공(미확인 사용자 통보·발송 이력)', rcptBody.includes('수령 확인 독촉') && rcptBody.includes('발송'))
  // 정기 점검 독촉 — 예방 정비 예정일이 경과(미시행)한 자산(시드 AST-2022-000640/641)의 소유 부서에 점검 시행 요청 발송(수령·반환 독촉과 같은 컴플라이언스 독촉). 점검 완료(뒤 단계) 전에 검증.
  const maintRemindBtn = p2.locator('button', { hasText: /정기 점검 독촉 발송/ })
  ok('정기 점검 독촉: 예정 경과 있으면 자산담당에 독촉 버튼 노출', (await maintRemindBtn.count()) > 0)
  await maintRemindBtn.first().click()
  await p2.waitForTimeout(700)
  const maintRemindBody = (await p2.locator('body').textContent()) || ''
  ok('정기 점검 독촉: 발송 성공(소유 부서 점검 시행 요청·발송 이력)', maintRemindBody.includes('정기 점검 독촉') && maintRemindBody.includes('발송'))
  // EOL OS 업그레이드 통보(로61) — 지원 종료 OS 자산(시드 Windows 10 Pro·CentOS 7.9)의 소유 부서에 업그레이드·교체 검토 통보(폐기 외 조치 접점). 정기 점검·수령 독촉과 같은 컴플라이언스 통보.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  const eolBtn = p2.locator('button', { hasText: /EOL 업그레이드 통보/ })
  ok('EOL 업그레이드 통보: EOL OS 자산 있으면 자산담당에 통보 버튼 노출', (await eolBtn.count()) > 0)
  await eolBtn.first().click()
  await p2.waitForTimeout(700)
  const eolBody = (await p2.locator('body').textContent()) || ''
  ok('EOL 업그레이드 통보: 발송 성공(소유 부서 업그레이드·교체 요청·발송 이력)', eolBody.includes('EOL 업그레이드 통보') && eolBody.includes('발송'))
  // 교체 검토 통보(fn03 수명예측 조치) — 교체 대상 자산(내용연수·보증·장애 이력)의 소유 부서에 교체 검토 요청 발송. EOL 통보의 수명예측 판, 그동안 수명예측 패널이 읽기 전용 표로 dead-end 였다.
  await p2.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const replBtn = p2.locator('button', { hasText: /교체 검토 통보/ })
  ok('교체 검토 통보: 교체 대상 있으면 자산담당에 통보 버튼 노출', (await replBtn.count()) > 0)
  await replBtn.first().click()
  await p2.waitForTimeout(700)
  const replBody = (await p2.locator('body').textContent()) || ''
  ok('교체 검토 통보: 발송 성공(소유 부서 교체 검토 요청·발송 이력)', replBody.includes('교체 검토 통보') && replBody.includes('발송'))
  // 위험 신호 요약(#4107 신규 역량 — 자산별 복합 위험 트리아지) — 대장 필터로 흩어진 주의 신호(정합성·EOL·보증·점검·SPOF·교체·미실측)를 자산 도시어 한 곳에 집약, 2+ 이면 복합 위험(우선 조치). 각 필터 셋 단일 소스 재사용.
  //  AST-2021-000432(유휴·Win10 EOL·내용연수/보증 경과 교체 대상)는 EOL+교체 등 2+ 신호 → 복합 위험.
  await p2.goto(`${BASE}/assets/register?sel=AST-2021-000432`, { waitUntil: 'networkidle' })
  const riskBody = (await p2.locator('body').textContent()) || ''
  ok('위험 신호 요약: 자산 도시어에 복합 위험 신호 집약(EOL OS·교체 대상 ≥2 → 복합 위험)', riskBody.includes('위험 신호') && riskBody.includes('EOL OS') && riskBody.includes('복합 위험'))
  // 보유자 없는 자산(EOL·교체 대상 유휴 AST-2021-000432·owner '-') 통보 수신자 정합(#4107 알림 감사) — notifyReplacement·notifyEolUpgrade·remindMaintenance 가
  //  다른 owner 발송 사이트의 미지정/- 가드를 빠뜨려 '- (자산관리팀)' 아무에게도 아닌 발송이 나가던 것을, 보유자 없으면 관리 부서(자산관리팀) 앞으로 정합.
  await p2.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('교체·EOL 통보 수신자: 보유자 없는 자산은 관리 부서 앞으로(- 아무에게도 아닌 발송 방지)', !((await p2.locator('body').textContent()) || '').includes('- (자산관리팀)'))
  // EOL 대상 운영 상태 게이트(회귀) — 대장 EOL 필터가 비운영(수리중·분실·반납대기) 자산을 제외하는지. 시드 AST-2021-000556(수리중·Win10 EOL)은 빠지고, AST-2021-000432(유휴·Win10 EOL)은 남아야 한다(표시·통보 게이트 일치).
  // 렌더된 표 셀(td)로만 검사 — body 텍스트에는 RSC 플라이트 페이로드(전체 자산 직렬화)가 섞여 필터와 무관하게 모든 자산번호가 잡힌다.
  await p2.goto(`${BASE}/assets/register?os=eol`, { waitUntil: 'networkidle' })
  ok('EOL 필터: 운영 중 EOL 자산 노출(AST-2021-000432 유휴)', (await p2.locator('td', { hasText: 'AST-2021-000432' }).count()) > 0)
  ok('EOL 필터: 비운영(수리중) EOL 자산 제외(AST-2021-000556 · 교체 통보 오발송 방지)', (await p2.locator('td', { hasText: 'AST-2021-000556' }).count()) === 0)
  // 어시스턴트 EOL 답변 ↔ 이 목록 정합 — 답변 바로 아래 근거 링크가 이 화면(?os=eol)이다. 어시스턴트는 폐기 경로만
  //  빼고 세어 비운영(수리중·분실·반납대기) EOL 자산까지 포함했고, 그래서 "N건입니다"를 읽고 그 답이 준 링크를 열면
  //  더 적게 나왔다(같은 질문에 두 답). 지금 시점의 AST-2021-000556 은 수리중이라 두 게이트가 갈리는 자산이다 —
  //  바로 아래 '수리 불가' 검사가 이 자산을 폐기예정으로 바꾸므로 반드시 그 전에 본다.
  const eolRows = await p2.locator('tbody tr.clickable').count()
  const ctxEOL = await browser.newContext(); await ctxEOL.addCookies([cookie(ASSET)]); const pEOL = await ctxEOL.newPage()
  await pEOL.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const eolBubbles = await pEOL.locator('.msg.assistant .bub').count()
  await pEOL.locator('.chat-in input').fill('교체 대상 자산과 교체 예산 알려줘')
  await pEOL.locator('.chat-in input').press('Enter')
  await pEOL.waitForFunction((k) => document.querySelectorAll('.msg.assistant .bub').length > k, eolBubbles, { timeout: 8000 })
  await pEOL.waitForTimeout(250)
  const eolAns = (await pEOL.locator('.msg.assistant .bub').last().textContent()) || ''
  const eolLine = eolAns.split('\n').find((l) => l.includes('OS 지원 종료(EOL) 자산')) || ''
  const eolAnswerN = Number((/OS 지원 종료\(EOL\) 자산 (\d+)건/.exec(eolLine) || [])[1] ?? -1)
  ok(`AI EOL질의 ↔ 대장 EOL 필터: 답변 ${eolAnswerN}건 = 목록 ${eolRows}건(같은 게이트)`, eolRows >= 1 && eolAnswerN === eolRows)
  ok('AI EOL질의: 비운영(수리중) EOL 자산 제외(AST-2021-000556 — 대장 필터와 같은 판정)',
    eolLine !== '' && !eolLine.includes('AST-2021-000556'))
  await ctxEOL.close()
  // 수리 불가 → 보유자 정리(홀더-스테이트 불변식) — 장애 신고로 소유자를 유지한 채 수리에 든 자산(AST-2021-000556 한지원)이 수리 불가로 폐기예정 전환될 때 소유자를 비워야 한다.
  //  안 하면 폐기 결재 반려 시 유휴 자산이 원 소유자에 오귀속되고 좌석이 샌다(반납·회수·폐기와 동일 정리). 이 EOL 게이트가 556 을 읽은 뒤에 소비.
  await p2.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  await p2.locator('tr', { hasText: 'AST-2021-000556' }).first().locator('button', { hasText: /^수리 불가$/ }).click()
  await p2.waitForTimeout(700)
  await p2.goto(`${BASE}/assets/register?q=AST-2021-000556`, { waitUntil: 'networkidle' })
  const repaired556 = (await p2.locator('tr', { hasText: 'AST-2021-000556' }).first().textContent()) || ''
  ok('수리 불가 → 보유자 정리(미지정·폐기예정 · 원 소유자 오귀속 방지)', repaired556.includes('미지정') && repaired556.includes('폐기예정') && !repaired556.includes('한지원'))
  // 무상 보증 청구(신규) — 보증 기간 내 자산 수리는 제조사 보증으로 무상 청구(자사 부담 0). 실 수리비는 제조사 부담(절감)액으로 기록돼 자사 TCO 에서 제외되고 '보증 절감'으로 집계(비용 회피 가시화). AST-2025-000377(보증 2028·수리중).
  await p2.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const wRow = p2.locator('tr', { hasText: 'AST-2025-000377' }).first()
  await wRow.locator('input[placeholder="실 수리비"]').fill('350000')
  await wRow.locator('button', { hasText: /^무상 보증 청구$/ }).click()
  await p2.waitForTimeout(700)
  ok('무상 보증 청구: 보증 내 자산 무상 청구 성공(자사 부담 0 · 절감 표기)', ((await p2.locator('body').textContent()) || '').includes('절감 350,000원'))
  await p2.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const returnsBodyW = (await p2.locator('body').textContent()) || ''
  ok('무상 보증 청구: 보증 절감 누계 반영(시드 200,000 + 377 350,000 = 550,000원 · 자사 TCO 제외분)', returnsBodyW.includes('보증 절감') && returnsBodyW.includes('550,000원'))
  // 월간 자산 현황 리포트가 보증 절감을 노출(비용 회피 가시화·숫자 투명성) — 무상 청구분은 자사 수리비 총계에서 빠지되 '보증 절감'으로 별도 명시(위 377 청구 350,000 반영). 리포트 생성은 키 무관 결정적 처리.
  await p2.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const beforeM = await p2.locator('.msg.assistant .bub').count()
  await p2.locator('.chat-in input').fill('월간 자산 현황 리포트 생성해줘')
  await p2.locator('.chat-in input').press('Enter')
  await p2.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, beforeM, { timeout: 8000 })
  await p2.waitForTimeout(200)
  const warRHref = await p2.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const warRid = decodeURIComponent((warRHref?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const warRtext = Buffer.from(await (await p2.request.get(`${BASE}/api/reports/${encodeURIComponent(warRid)}?format=xlsx`)).body()).toString('utf8')
  ok('월간 리포트: 무상 보증 청구 보증 절감 노출(비용 회피 가시화·숫자 투명성)', warRtext.includes('보증 절감') && warRtext.includes('550,000'))

  // 자산 재배정(직접 인계) — 사용 중 자산을 반납·재불출 왕복 없이 새 보유자에게 직접 인계. 그동안 사용 중 자산의 보유자 변경 경로가 없어
  //  팀 내 인수인계가 반납→재불출을 강제했다(correctField 가 '이동·불출 결재로'라며 막지만 이동은 위치만·불출은 유휴만). AST-2023-000113(이서연) → 오세훈(인사팀).
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000113`, { waitUntil: 'networkidle' })
  const reassignBtn = p2.locator('button', { hasText: /^자산 재배정 \(직접 인계\)$/ })
  ok('자산 재배정: 사용 중 자산에 재배정(직접 인계) 버튼 노출', (await reassignBtn.count()) > 0)
  await reassignBtn.click()
  await p2.waitForTimeout(200)
  await p2.locator('select', { has: p2.locator('option', { hasText: '오세훈 · 인사팀' }) }).selectOption('오세훈')
  await p2.locator('input[placeholder*="인계 사유"]').fill('팀 내 인수인계 — e2e')
  await p2.locator('button', { hasText: /^재배정 확정$/ }).click()
  await p2.waitForTimeout(700)
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000113`, { waitUntil: 'networkidle' })
  const reassignedBody = (await p2.locator('body').textContent()) || ''
  ok('자산 재배정 → 소유자·부서 갱신(오세훈 · 인사팀)', reassignedBody.includes('오세훈') && reassignedBody.includes('인사팀'))
  ok('자산 재배정 → 새 보유자 수령(인수) 확인 대기(체인 오브 커스터디)', reassignedBody.includes('수령 확인 대기'))
  ok('자산 재배정 → 이력에 재배정(직접 인계) 기록', reassignedBody.includes('재배정(직접 인계)'))

  // 라이선스 좌석 보유자 승계 — 재배정(직접 인계)은 좌석을 회수하지 않고 자산과 함께 넘기므로(로56) 배정 대장의 보유자·부서도 새 보유자로 갱신돼야 한다(SAM 감사 정합). 그동안 재배정은 자산 소유자만 바꾸고 좌석은 '떠난 사람'을 계속 가리켰다. AST-2023-000112(김민준·LIC-004 좌석)를 오세훈으로 재배정해 승계 확인 후, 하위 테스트(분실·STEP2)를 위해 김민준으로 원복.
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000112`, { waitUntil: 'networkidle' })
  await p2.locator('button', { hasText: /^자산 재배정 \(직접 인계\)$/ }).click()
  await p2.waitForTimeout(200)
  await p2.locator('select', { has: p2.locator('option', { hasText: '오세훈 · 인사팀' }) }).selectOption('오세훈')
  await p2.locator('input[placeholder*="인계 사유"]').fill('좌석 승계 검증 — e2e')
  await p2.locator('button', { hasText: /^재배정 확정$/ }).click()
  await p2.waitForTimeout(700)
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000112`, { waitUntil: 'networkidle' })
  const seatXferBody = (await p2.locator('body').textContent()) || ''
  ok('자산 재배정 → 라이선스 좌석 보유자 승계(배정 대장 정합·떠난 사람 미참조)', seatXferBody.includes('라이선스 좌석 보유자 승계'))
  // 원복 — 하위 테스트를 위해 김민준으로 되돌린다(좌석 보유자도 함께 원복)
  await p2.locator('button', { hasText: /^자산 재배정 \(직접 인계\)$/ }).click()
  await p2.waitForTimeout(200)
  await p2.locator('select', { has: p2.locator('option', { hasText: '김민준 · 플랫폼개발팀' }) }).selectOption('김민준')
  await p2.locator('input[placeholder*="인계 사유"]').fill('원복 — e2e')
  await p2.locator('button', { hasText: /^재배정 확정$/ }).click()
  await p2.waitForTimeout(700)

  // 일괄 재배정(직접 인계) — 단건 reassignAsset 의 배치 판(reassignAssetMany). 팀 인수인계·후임 승계로 여러 사용 중 자산을 한 사람에게 한 번에 인계.
  //  AST-2023-000113(위에서 오세훈으로 재배정됨)과 AST-2023-000112(김민준)를 함께 선택해 오세훈으로 일괄 재배정 → 000113 은 이미 오세훈이라 건너뛰고(동일 보유자 스킵) 000112 만 이동 = '1건'. 검증 후 000112 는 김민준으로 원복.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2023-000113 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000112 선택"]').check()
  ok('일괄 재배정: 선택 사용 중 자산에 일괄 재배정 컨트롤 노출(사용중 2)', (await p2.locator('span', { hasText: /일괄 재배정 \(사용중 2\)/ }).count()) > 0)
  await p2.locator('select', { has: p2.locator('option', { hasText: '인계 대상…' }) }).selectOption('오세훈')
  await p2.locator('button', { hasText: /^재배정$/ }).click()
  await p2.waitForTimeout(700)
  ok('일괄 재배정: 동일 보유자(오세훈) 선택분은 건너뛰고 1건만 재배정(스킵 로직 · 새 보유자 오세훈)', ((await p2.locator('body').textContent()) || '').includes('1건 재배정') && ((await p2.locator('body').textContent()) || '').includes('오세훈'))
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000112`, { waitUntil: 'networkidle' })
  ok('일괄 재배정 → 대상 자산 소유자·부서 갱신(오세훈 · 인사팀)', ((await p2.locator('body').textContent()) || '').includes('오세훈'))
  // 원복 — 하위 테스트를 위해 김민준으로 되돌린다
  await p2.locator('button', { hasText: /^자산 재배정 \(직접 인계\)$/ }).click()
  await p2.waitForTimeout(200)
  await p2.locator('select', { has: p2.locator('option', { hasText: '김민준 · 플랫폼개발팀' }) }).selectOption('김민준')
  await p2.locator('input[placeholder*="인계 사유"]').fill('원복(일괄 재배정 검증 후) — e2e')
  await p2.locator('button', { hasText: /^재배정 확정$/ }).click()
  await p2.waitForTimeout(700)

  // 수명주기 처리 대기열 라우팅 — 대여중·수리중·분실이 '다음 처리 -'로 막다른 행이던 것을 처리 화면 딥링크로 연결(폐기완료는 대기열 제외).
  await p2.goto(`${BASE}/assets/lifecycle`, { waitUntil: 'networkidle' })
  const lifeBody = (await p2.locator('body').textContent()) || ''
  ok('수명주기 대기열: 대여중·수리중 처리 안내(막다른 행 제거)', lifeBody.includes('반환 기한 관리') && lifeBody.includes('수리 진행 관리'))
  const repairLink = p2.locator('a', { hasText: '반환 기한 관리' }).first()
  ok('수명주기 대기열: 처리 안내가 처리 화면 딥링크', (await repairLink.count()) > 0)
  await repairLink.click()
  await p2.waitForTimeout(500)
  ok('수명주기 대기열 → 반납·유휴 화면으로 라우팅', p2.url().includes('/assets/returns'))

  // 자산 회수(오프보딩·재배정) — 자산담당이 사용 중 자산을 직접 회수 → 반납 접수 대기열로(사용자 상신 없이). 그동안 반납은 사용자 상신에서만 시작됐다.
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000221`, { waitUntil: 'networkidle' })
  const recoverBtn = p2.locator('button', { hasText: /^자산 회수 \(반납 처리\)$/ })
  ok('자산 회수: 사용 중 자산에 회수(반납 처리) 버튼 노출(자산담당)', (await recoverBtn.count()) > 0)
  // 오프보딩 좌석 회수(로56) 사전 상태 — 이 자산엔 라이선스 좌석(LIC-001 M365)이 배정돼 배정 라이선스 역조회가 보인다.
  ok('자산 회수 전: 배정 라이선스 역조회 노출(LIC-001 좌석)', ((await p2.locator('body').textContent()) || '').includes('배정 라이선스') && ((await p2.locator('body').textContent()) || '').includes('Microsoft 365'))
  // 수령 미확인 스테일 방지 — 이 자산은 불출 후 인수 미확인(receiptPending) 상태. 회수 시 함께 해제되어야 스테일 '수령 미확인'이 남지 않는다.
  ok('자산 회수 전: 수령 확인 대기(인수 미확인) 노출', ((await p2.locator('body').textContent()) || '').includes('수령 확인 대기'))
  // 자산 인수인계서(영구 불출 서면 증적) — 대여 확인서·분실 신고서는 있으나 주된 물리 인계인 영구 불출엔 서명 인수인계 문서가 없었다.
  //  사용중 자산 상세에 인수인계서 인쇄 링크 + 라우트 렌더. receiptPending 이라 '인수 확인 대기'로 표기된다.
  ok('사용중 자산 상세: 인수인계서 인쇄 링크(불출 서면 증적)', (await p2.locator('a[href="/api/handover-sheet/AST-2023-000221"]').count()) > 0)
  const handoverRes = await p2.request.get(`${BASE}/api/handover-sheet/AST-2023-000221`)
  const handoverBody = await handoverRes.text()
  ok('인수인계서: 인계·인수 확인서 렌더(인수자·인수 확인 대기)', handoverRes.status() === 200 && handoverBody.includes('ASSET HANDOVER') && handoverBody.includes('인수 확인 대기'))
  // 자산 카드(dossier) 업무 중요도 — 화면·반출(중요도)과 정합. 인수·감사 dossier 에 ISO 27001 자산 분류(핵심/중요/일반)가 담긴다.
  const cardBody = await (await p2.request.get(`${BASE}/api/asset-card/AST-2020-000883`)).text()
  ok('자산 카드: 업무 중요도(핵심) 표기(화면·반출 정합)', cardBody.includes('업무 중요도') && cardBody.includes('핵심'))
  // 대여 확인서(loan-agreement) 회귀 — 연장 조치(kind '대여' 재사용)가 있는 대여중 자산의 대여일이 최초 대여일(2026-07-28)이어야 하고
  //  연장 조치일(2026-08-12)로 흘러선 안 된다(!연장 술어). 시드 AST-2024-000230 이 이 시나리오용인데 그동안 e2e 가 없어 회귀가 무방비였다.
  const loanAgrRes = await p2.request.get(`${BASE}/api/loan-agreement/AST-2024-000230`)
  const loanAgrBody = await loanAgrRes.text()
  ok('대여 확인서: 대여중 자산 확인서 렌더(200)', loanAgrRes.status() === 200 && loanAgrBody.includes('ASSET LOAN AGREEMENT'))
  ok('대여 확인서 회귀: 대여일=최초 대여일(2026-07-28) · 연장 조치일(2026-08-12) 아님', loanAgrBody.includes('2026-07-28') && !loanAgrBody.includes('2026-08-12'))
  // 데이터 소거 확인서(wipe-cert) — 컴플라이언스·감사 증적. 폐기 완료건(시드 DSP-00)의 확인서가 렌더되고 확인서 번호가 담기는지. 그동안 e2e 무방비.
  const wipeCertRes = await p2.request.get(`${BASE}/api/wipe-cert/DSP-00`)
  const wipeCertBody = await wipeCertRes.text()
  ok('데이터 소거 확인서: 폐기 완료건 증적 렌더(확인서 번호)', wipeCertRes.status() === 200 && wipeCertBody.includes('데이터 소거 확인서') && wipeCertBody.includes('WIPE-20260722-050'))
  // 검수 확인서(intake-cert) — 물품 인수·검수 증적(대금 지급·감사). 검수 이력 있는 로트(시드 IN-2606-42 검수완료)의 확인서 렌더. 그동안 e2e 무방비.
  const intakeCertRes = await p2.request.get(`${BASE}/api/intake-cert/IN-2606-42`)
  const intakeCertBody = await intakeCertRes.text()
  ok('검수 확인서: 검수 이력 로트 증적 렌더(로트번호)', intakeCertRes.status() === 200 && intakeCertBody.includes('검수 확인서') && intakeCertBody.includes('IN-2606-42'))
  // 라이선스 카드(license-card) — SAM dossier. 시드 LIC-001(Microsoft 365 E3) 렌더. 그동안 e2e 무방비.
  const licCardRes = await p2.request.get(`${BASE}/api/license-card/LIC-001`)
  const licCardBody = await licCardRes.text()
  ok('라이선스 카드: SAM dossier 렌더(라이선스명)', licCardRes.status() === 200 && licCardBody.includes('라이선스') && licCardBody.includes('Microsoft 365 E3'))
  // 계약 카드(contract-card) — 계약 dossier. 시드 CT-2023-014 렌더. 그동안 e2e 무방비.
  const ctCardRes = await p2.request.get(`${BASE}/api/contract-card/CT-2023-014`)
  const ctCardBody = await ctCardRes.text()
  ok('계약 카드: 계약 dossier 렌더(계약명)', ctCardRes.status() === 200 && ctCardBody.includes('계약') && ctCardBody.includes('2023 개발용 노트북 60대'))
  await recoverBtn.click()
  await p2.waitForTimeout(200)
  await p2.locator('input[placeholder*="회수 사유"]').fill('퇴직 오프보딩')
  await p2.locator('button', { hasText: /^회수 확정$/ }).click()
  await p2.waitForTimeout(700)
  await p2.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const returnsBody = (await p2.locator('body').textContent()) || ''
  ok('자산 회수 → 반납 접수 대기열 편성(반납대기)', returnsBody.includes('AST-2023-000221'))
  // 오프보딩 좌석 회수 결과 — 회수 후 그 자산의 라이선스 좌석이 제거돼 배정 라이선스 역조회가 사라진다(좌석 여유석 복귀, 대사 정합).
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000221`, { waitUntil: 'networkidle' })
  const recoveredBody = (await p2.locator('body').textContent()) || ''
  ok('자산 회수 → 라이선스 좌석 자동 회수(배정 라이선스 역조회 사라짐)', !recoveredBody.includes('배정 라이선스'))
  // 회수 시 수령 미확인(receiptPending)도 함께 해제 — 보유자를 떠난 자산이 스테일 '수령 미확인'으로 남지 않는다(v1.327 버그픽스).
  ok('자산 회수 → 수령 미확인 스테일 해제(수령 확인 대기 사라짐)', !recoveredBody.includes('수령 확인 대기'))
  // 계약 일괄 연계 — HW 유지보수·구매 계약이 다수 자산을 덮을 때 선택분을 한 계약에 한 번에 연계(보증 일괄 연장·일괄 회수와 같은 배치 접점). 그동안 계약 연계는 자산 하나씩만 가능했다.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2024-000091 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000562 선택"]').check()
  await p2.locator('select[title*="계약에 일괄 연계"]').selectOption('CT-2022-007')
  await p2.locator('.callout button', { hasText: /^연계$/ }).click()
  await p2.waitForTimeout(700)
  ok('계약 일괄 연계: 선택 2건을 한 계약에 일괄 연계(CT-2022-007)', ((await p2.locator('body').textContent()) || '').includes('계약 일괄 연계 완료') && ((await p2.locator('body').textContent()) || '').includes('CT-2022-007'))

  // 종료 상태 자산 계약 연계 가드 — 폐기완료·분실 자산을 계약에 새로 연계하면 유지보수 커버리지·연계 자산 수가 이탈 자산으로 부풀려진다(좌석 배정 종료-상태 가드와 동형). 폐기완료 AST-2018-000090 연계 시도 → 거부.
  await p2.goto(`${BASE}/assets/register?sel=AST-2018-000090`, { waitUntil: 'networkidle' })
  const ctGuardSel = p2.locator('select').filter({ has: p2.locator('option', { hasText: '계약 선택 —' }) }).first()
  await ctGuardSel.selectOption({ index: 1 })
  await p2.locator('button', { hasText: /^연계$/ }).first().click()
  await p2.waitForTimeout(600)
  ok('종료 상태 자산 계약 연계 가드: 폐기완료 자산 연계 거부(연계 자산 수 부풀림 방지)', ((await p2.locator('body').textContent()) || '').includes('종료 상태') && ((await p2.locator('body').textContent()) || '').includes('연계할 수 없습니다'))

  // 업무 중요도 일괄 지정 — 연 1회 자산 분류 재검토(ISO 27001 A.8.2)에서 다수 자산을 같은 등급으로 한 번에 분류(취약점 우선순위 축). 그동안 중요도 지정은 자산 하나씩만 가능했다.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2024-000091 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000562 선택"]').check()
  await p2.locator('select[title*="업무 중요도를 일괄 지정"]').selectOption('핵심')
  await p2.locator('.callout button', { hasText: /^지정$/ }).click()
  await p2.waitForTimeout(700)
  ok('업무 중요도 일괄 지정: 선택 2건을 핵심으로 일괄 분류', ((await p2.locator('body').textContent()) || '').includes("2건 업무 중요도 '핵심' 지정"))

  // 일괄 회수(오프보딩) — 여러 사용 중 자산을 선택해 한 번에 회수. 대장에서 선택(체크)은 검색 간 유지된다.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2024-000091 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000562 선택"]').check()
  const bulkRecoverBtn = p2.locator('button', { hasText: /일괄 회수 \(사용중 2\)/ })
  ok('일괄 회수: 사용 중 2건 선택 시 일괄 회수 버튼(사용중 2)', (await bulkRecoverBtn.count()) > 0)
  await bulkRecoverBtn.click()
  await p2.waitForTimeout(700)
  ok('일괄 회수: 2건 회수 성공(반납 접수 대기열)', ((await p2.locator('body').textContent()) || '').includes('2건 회수'))
  await p2.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const bulkRecoverBody = (await p2.locator('body').textContent()) || ''
  ok('일괄 회수 → 반납 접수 대기열 편성(2건)', bulkRecoverBody.includes('AST-2024-000091') && bulkRecoverBody.includes('AST-2023-000562'))

  // 반납 일괄 접수 — 일괄 회수로 반납대기에 몰린 묶음을 같은 점검 결과·위치로 한 번에 접수(일괄 회수의 짝). 위 일괄 회수분 091·562를 정상 접수 → 유휴 풀.
  await p2.locator('input[aria-label="AST-2024-000091 일괄 접수 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000562 일괄 접수 선택"]').check()
  await p2.locator('button', { hasText: /^일괄 접수 \(2\)$/ }).click()
  await p2.waitForTimeout(800)
  ok('반납 일괄 접수: 선택 2건 일괄 접수 완료(반납대기 → 유휴 풀)', ((await p2.locator('body').textContent()) || '').includes('건 반납 접수 완료'))
  await p2.goto(`${BASE}/assets/register?sel=AST-2024-000091`, { waitUntil: 'networkidle' })
  ok('반납 일괄 접수 → 유휴 풀 편성(091 유휴 복귀)', ((await p2.locator('tr', { has: p2.locator('td', { hasText: 'AST-2024-000091' }) }).first().textContent()) || '').includes('유휴'))

  // 자산 일괄 대여 — 교육·행사용 로너 풀처럼 유휴 재고 다수를 한 대여자·부서·반환 기한으로 한 번에 대여(일괄 회수의 반대편). 위 반납 접수로 유휴 복귀한 091·562를 일괄 대여.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2024-000091 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000562 선택"]').check()
  const loanCtl = p2.locator('span').filter({ has: p2.locator('button', { hasText: /^대여$/ }) }).first()
  await loanCtl.locator('input[placeholder="대여자"]').fill('김강사')
  await loanCtl.locator('input[placeholder="부서"]').fill('인재개발팀')
  await loanCtl.locator('input[type="date"]').fill('2026-09-30')
  await loanCtl.locator('button', { hasText: /^대여$/ }).click()
  await p2.waitForTimeout(800)
  ok('자산 일괄 대여: 선택 유휴 2건 일괄 대여(대여중 전환·반환 기한 공유)', ((await p2.locator('body').textContent()) || '').includes('2건 대여 처리'))
  await p2.goto(`${BASE}/assets/register?sel=AST-2024-000091`, { waitUntil: 'networkidle' })
  ok('자산 일괄 대여 → 대여중 전환(091)', ((await p2.locator('tr', { has: p2.locator('td', { hasText: 'AST-2024-000091' }) }).first().textContent()) || '').includes('대여중'))

  // 폐기 절차 자산 대여 가드 — 유휴여도 폐기 대상 선정(대상 선정~소거 대기)된 자산은 재불출·대여 대상이 아니다(파기 예정 자산 재순환 방지 · 가용 재고 산정과 동일 판정). 유휴+DSP-02 인 AST-2021-000432 일괄 대여 시도 → 제외.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2021-000432 선택"]').check()
  const loanCtl2 = p2.locator('span').filter({ has: p2.locator('button', { hasText: /^대여$/ }) }).first()
  await loanCtl2.locator('input[placeholder="대여자"]').fill('김강사')
  await loanCtl2.locator('input[placeholder="부서"]').fill('인재개발팀')
  await loanCtl2.locator('input[type="date"]').fill('2026-09-30')
  await loanCtl2.locator('button', { hasText: /^대여$/ }).click()
  await p2.waitForTimeout(700)
  ok('폐기 절차 자산 대여 가드: 폐기 대상 선정 유휴 자산 대여 제외(파기 예정 재순환 방지)', ((await p2.locator('body').textContent()) || '').includes('폐기 절차 자산 제외'))

  // 정기 점검 일괄 예약 — 선택 자산에 예방 정비 예정일을 한 번에 등록(보증 일괄 연장·일괄 회수와 같은 배치 접점). 그동안 점검 예약은 자산 하나씩만 가능했다.
  await p2.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p2.locator('input[aria-label="AST-2023-000112 선택"]').check()
  await p2.locator('input[aria-label="AST-2023-000113 선택"]').check()
  const maintBulk = p2.locator('span').filter({ hasText: '정기 점검 일괄 예약' }).first()
  await maintBulk.locator('input[type="date"]').fill('2026-12-15')
  await maintBulk.locator('button', { hasText: /^예약$/ }).click()
  await p2.waitForTimeout(700)
  ok('정기 점검 일괄 예약: 선택 자산에 점검 예정일 일괄 등록', ((await p2.locator('body').textContent()) || '').includes('예정 2026-12-15'))
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000112`, { waitUntil: 'networkidle' })
  ok('정기 점검 일괄 예약 → 개별 자산에 예정일 반영', ((await p2.locator('body').textContent()) || '').includes('2026-12-15'))

  // 정기 점검 예약 취소 — 잘못 잡은 예약을 완료 처리 없이 해제한다(하지도 않은 점검을 완료 처리해 가짜 이력을 남기던 문제 해소 · 장애 신고 취소와 동형). 위 일괄 예약분 AST-2023-000113 취소.
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000113`, { waitUntil: 'networkidle' })
  await p2.locator('button', { hasText: /^예약 취소$/ }).click()
  await p2.waitForTimeout(700)
  await p2.goto(`${BASE}/assets/register?sel=AST-2023-000113`, { waitUntil: 'networkidle' })
  ok('정기 점검 예약 취소: 해제 시 정비 대상에서 제외(가짜 점검 이력 없이)', !((await p2.locator('body').textContent()) || '').includes('예방 정비 대상 자산입니다'))

  // 정기 점검(예방 정비) — 예정일 도래 자산(시드 AST-2022-000640)을 자산담당이 점검 완료 → 다음 점검 12개월 후로 재예약(반응형 수리와 별개).
  await p2.goto(`${BASE}/assets/register?sel=AST-2022-000640`, { waitUntil: 'networkidle' })
  const maintBtn = p2.locator('button', { hasText: /^정기 점검 완료$/ })
  ok('정기 점검: 예정 도래 자산에 점검 완료 액션 노출(자산담당)', (await maintBtn.count()) > 0)
  await maintBtn.click()
  await p2.waitForTimeout(200)
  await p2.locator('input[placeholder*="점검 내용"]').fill('펌웨어 업데이트·팬 청소')
  await p2.locator('button', { hasText: /^완료 기록$/ }).click()
  await p2.waitForTimeout(700)
  const maintBody = (await p2.locator('body').textContent()) || ''
  ok('정기 점검 완료: 다음 점검 재예약(연 1회)', maintBody.includes('정기 점검 완료') && maintBody.includes('재예약'))
  // 정기 점검 일정 등록 — 예방 정비 미편성 운영 자산(AST-2024-000618)을 자산담당이 정비 사이클에 편입(최초 등록 접점). 등록 후 예정일이 대장에 반영된다.
  await p2.goto(`${BASE}/assets/register?sel=AST-2024-000618`, { waitUntil: 'networkidle' })
  const schedBtn = p2.locator('button', { hasText: /^정기 점검 일정 등록$/ })
  ok('정기 점검 일정 등록: 예방 정비 미편성 자산에 등록 액션 노출(자산담당)', (await schedBtn.count()) > 0)
  await schedBtn.click()
  await p2.waitForTimeout(200)
  await p2.locator('input[title*="점검 예정일"]').fill('2027-03-15')
  await p2.locator('button', { hasText: /^일정 등록$/ }).click()
  await p2.waitForTimeout(700)
  const schedBody = (await p2.locator('body').textContent()) || ''
  // 등록 성공 시 자산에 maintenanceDue 가 잡혀 상세가 '정기 점검 예정 …' + 완료 액션 블록으로 전환된다(등록 콜아웃은 게이트가 뒤집혀 사라지므로 결과 상태로 검증).
  ok('정기 점검 일정 등록: 예정일 반영 → 점검 예정 상태 전환(2027-03-15)', schedBody.includes('정기 점검 예정 2027-03-15') && schedBody.includes('정기 점검 완료'))
  // 안전재고 발주 요청(루프 57 조치) — 재고 경보 카드에서 부족 유형 보충 발주를 구매·IT기획팀에 요청. 재고 경보(검출)를 조치로 잇는다. 당일 중복 발송 차단.
  await p2.goto(`${BASE}/inventory/stock`, { waitUntil: 'networkidle' })
  const reorderBtn = p2.locator('button', { hasText: /^발주 요청 발송$/ })
  ok('안전재고 발주 요청: 재고 경보 카드에 발주 요청 버튼 노출(자산담당)', (await reorderBtn.count()) > 0)
  await reorderBtn.click()
  await p2.waitForTimeout(700)
  ok('안전재고 발주 요청: 발송 성공(구매·IT기획팀 통지·발송 이력)', ((await p2.locator('body').textContent()) || '').includes('발주 요청 발송 —') && ((await p2.locator('body').textContent()) || '').includes('통지'))
  await reorderBtn.click()
  await p2.waitForTimeout(700)
  ok('안전재고 발주 요청: 당일 중복 발송 차단', ((await p2.locator('body').textContent()) || '').includes('당일 중복 발송 차단'))
  await ctx2.close()

  // ── 사용자: AI 어시스턴트 본인 자산 자연어 질의(§01 사용자 본인 자산 조회 · §05 권한 필터) ──
  const ctxU = await browser.newContext()
  await ctxU.addCookies([cookie(USER)])
  const pU = await ctxU.newPage()
  pU.on('pageerror', (e) => { fail++; console.log('  ✗ PAGEERROR: ' + (e.message || e)) })
  // 문서 라우트 역할 게이트 — 대여 확인서·데이터 소거 확인서 발급은 자산담당·Admin 전용(USER 차단). auth 가드 회귀 방지 lock-in.
  ok('대여 확인서: USER 접근 차단(403 · 자산담당·Admin 전용)', (await pU.request.get(`${BASE}/api/loan-agreement/AST-2024-000230`)).status() === 403)
  ok('데이터 소거 확인서: USER 접근 차단(403 · 자산담당·Admin 전용)', (await pU.request.get(`${BASE}/api/wipe-cert/DSP-00`)).status() === 403)
  ok('검수 확인서: USER 접근 차단(403 · 자산담당·Admin 전용)', (await pU.request.get(`${BASE}/api/intake-cert/IN-2606-42`)).status() === 403)
  ok('라이선스 카드: USER 접근 차단(403 · 자산담당·Admin 전용)', (await pU.request.get(`${BASE}/api/license-card/LIC-001`)).status() === 403)
  ok('계약 카드: USER 접근 차단(403 · 자산담당·Admin 전용)', (await pU.request.get(`${BASE}/api/contract-card/CT-2023-014`)).status() === 403)
  await pU.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const ub = await pU.locator('.msg.assistant .bub').count()
  await pU.locator('.chat-in input').fill('내 자산 보증 언제 만료돼?')
  await pU.locator('.chat-in input').press('Enter')
  await pU.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, ub, { timeout: 8000 })
  await pU.waitForTimeout(150)
  const uAns = (await pU.locator('.msg.assistant .bub').last().textContent()) || ''
  // 본인 자산에 초점(전량 나열 catch-all 이 아니라 보증 현황) + 본인 자산번호 + 권한 필터(타인·서버 자산 미포함)
  ok('사용자 AI 질의: 본인 자산 보증 현황 초점 답변', uAns.includes('보증 현황') && uAns.includes('AST-2024-000015') && /D-|만료 경과/.test(uAns))
  ok('사용자 AI 질의: 권한 필터 — 타인·서버 자산 미포함', !uAns.includes('AST-2023-000561') && !uAns.includes('AST-2020-000883'))
  // 본인 대여 자산 반환 기한 질의 — 대여자 관점의 반환 마감(본인 대여중 자산에 스코프)
  const ub2 = await pU.locator('.msg.assistant .bub').count()
  await pU.locator('.chat-in input').fill('내 대여 자산 반환 기한')
  await pU.locator('.chat-in input').press('Enter')
  await pU.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, ub2, { timeout: 8000 })
  await pU.waitForTimeout(150)
  const uLoan = (await pU.locator('.msg.assistant .bub').last().textContent()) || ''
  // 본인 대여분(AST-2024-000230·반환 기한 2026-08-20)에 초점 + 타인 대여(AST-2023-000450·한지민) 미포함
  ok('사용자 AI 질의: 본인 대여 자산 반환 기한 초점 답변', uLoan.includes('대여 자산 반환 현황') && uLoan.includes('AST-2024-000230') && uLoan.includes('2026-08-20'))
  ok('사용자 AI 질의: 대여 권한 필터 — 타인 대여 자산 미포함', !uLoan.includes('AST-2023-000450'))
  // 본인 QnA 문의·답변 현황 질의 (김민준 QNA-03 답변 완료)
  const ub3 = await pU.locator('.msg.assistant .bub').count()
  await pU.locator('.chat-in input').fill('내 문의 답변 현황')
  await pU.locator('.chat-in input').press('Enter')
  await pU.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, ub3, { timeout: 8000 })
  await pU.waitForTimeout(150)
  const uQna = (await pU.locator('.msg.assistant .bub').last().textContent()) || ''
  // 본인 문의(JetBrains, 답변 완료)에 초점 + 타인 문의(NAS·이서연) 미포함(권한 필터)
  ok('사용자 AI 질의: 본인 QnA 답변 현황 초점 답변', uQna.includes('답변 완료') && uQna.includes('JetBrains') && uQna.includes('[답변]'))
  ok('사용자 AI 질의: QnA 권한 필터 — 타인 문의 미포함', !uQna.includes('NAS'))
  // QnA 종결 루프(작성자 셀프서비스) — 답변된 본인 문의를 작성자가 해결 확인하거나, 미흡하면 재문의로 재검토를 요청한다. QNA-03(김민준·JetBrains, 박자산 답변).
  await pU.goto(`${BASE}/board/qna?sel=QNA-03`, { waitUntil: 'networkidle' })
  await pU.locator('button', { hasText: /^해결 확인$/ }).click()
  await pU.waitForTimeout(600)
  await pU.goto(`${BASE}/board/qna?sel=QNA-03`, { waitUntil: 'networkidle' })
  ok('QnA 해결 확인(작성자): 해결됨 표시', ((await pU.locator('body').textContent()) || '').includes('해결됨'))
  await pU.locator('button', { hasText: /^재문의$/ }).click()
  await pU.waitForTimeout(600)
  await pU.goto(`${BASE}/board/qna?sel=QNA-03`, { waitUntil: 'networkidle' })
  ok('QnA 재문의(작성자): 해결 확인 해제 후 해결 확인 버튼 복귀', (await pU.locator('button', { hasText: /^해결 확인$/ }).count()) > 0)
  // 게시판 조회수 증가(§01) — views 는 시드 고정이었다(증가 접점 부재). 공지 상세를 열면(행 클릭 → recordPostView) 조회수가 1 증가한다. 증가 접점이 없으면 그대로라 실패. 첫 행(필독)은 자동 오픈이므로 닫힘 상태인 비고정 공지(NTC-02)를 연다.
  await pU.goto(`${BASE}/board/notices`, { waitUntil: 'networkidle' })
  const ntcRow = pU.locator('tr', { has: pU.locator('td', { hasText: '미인가 SaaS(스토리지류) 차단 정책' }) }).first()
  const viewsBefore = parseInt(((await ntcRow.locator('td.num').first().textContent()) || '0').replace(/\D/g, ''), 10)
  await ntcRow.click()
  await pU.waitForTimeout(800)
  const viewsAfter = parseInt(((await pU.locator('tr', { has: pU.locator('td', { hasText: '미인가 SaaS(스토리지류) 차단 정책' }) }).first().locator('td.num').first().textContent()) || '0').replace(/\D/g, ''), 10)
  ok('게시판 조회수: 공지 상세 열람 → 조회수 1 증가(시드 고정 아님)', viewsAfter === viewsBefore + 1)
  // 대여 신청 대상 재배치 풀 정합 — 폐기 절차 자산(AST-2021-000432, 유휴+DSP-02)은 대여 후보에서 제외, 유효 유휴는 노출
  await pU.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const reqCard = pU.locator('.card', { has: pU.locator('.tt', { hasText: '신청 상신' }) }).first()
  await reqCard.locator('button', { hasText: /^신청하기$/ }).click()
  await pU.waitForTimeout(150)
  await reqCard.locator('select').first().selectOption('대여')
  await pU.waitForTimeout(150)
  const loanOpts = (await reqCard.locator('select').nth(1).textContent()) || ''
  ok('대여 신청 대상: 폐기 절차 자산 제외(AST-2021-000432)', !loanOpts.includes('AST-2021-000432') && loanOpts.includes('AST-2023-000704'))
  // 수령 확인 대기 대시보드 나눔 — 불출 배정된 본인 자산이 인수 미확인이면 대시보드 My Work 에 상기(로54 수령 확인 루프의 사용자 능동 접점). 확인 전에 검증.
  await pU.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const dashBody = (await pU.locator('body').textContent()) || ''
  ok('사용자 대시보드: 수령 확인 대기 나눔 노출(인수 미확인 본인 자산)', dashBody.includes('수령 확인 대기') && dashBody.includes('AST-2024-000015'))
  // 역할별 드릴인 정합 — 접근 불가 화면(Discovery·계약)으로 가는 드릴인 링크를 사용자 대시보드에는 걸지 않는다(데드엔드 제거). Shadow IT KPI·발견 카드·계약 카드 링크 모두 미노출.
  ok('사용자 대시보드: 접근 불가 화면 드릴인 링크 없음(Discovery·계약)', (await pU.locator('a[href="/discovery/found"]').count()) === 0 && (await pU.locator('a[href="/inventory/contracts"]').count()) === 0)
  // 신청·결재 뱃지 정합 — 결재 권한이 없는 사용자에겐 결재 대기 뱃지(내 결재 차례)가 뜨지 않는다(전사 총계 오노출 제거).
  ok('사용자 사이드바: 워크플로 결재 뱃지 없음(결재 권한 밖 · 내 결재 차례 0)', (await pU.locator('nav.menubar button').filter({ hasText: '워크플로' }).locator('.bdg').count()) === 0)
  // 나눔 딥링크 → 대장 상세의 수령 확인 액션으로 바로 진입
  await pU.locator('a', { hasText: 'AST-2024-000015' }).first().click()
  await pU.waitForTimeout(400)
  ok('사용자 대시보드: 수령 확인 나눔 → 대장 상세 딥링크(수령 확인 액션)', (await pU.locator('button', { hasText: '수령 확인 (인수 확인)' }).count()) > 0)
  // 자산 수령(인수) 확인 — 불출 배정된 본인 자산을 사용자가 실물 인수 확인(체인 오브 커스터디). 시드 AST-2024-000015 는 수령 대기.
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000015`, { waitUntil: 'networkidle' })
  ok('수령 확인: 수령 대기 자산에 수령 확인 버튼 노출(사용자)', (await pU.locator('button', { hasText: '수령 확인 (인수 확인)' }).count()) > 0)
  await pU.locator('button', { hasText: '수령 확인 (인수 확인)' }).click()
  await pU.waitForTimeout(700)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000015`, { waitUntil: 'networkidle' })
  ok('수령 확인: 확인 후 수령 대기 해제(버튼 사라짐)', (await pU.locator('button', { hasText: '수령 확인 (인수 확인)' }).count()) === 0)
  // 자산 장애 신고(사용자 발화형 수리 진입점) — 본인 명의 사용 중 자산의 고장을 사용자가 직접 신고 → 수리중 전환·수리 대기 편성.
  //  그동안 수리는 반납 점검에서만 시작돼, 실물을 쓰는 사용자가 장애를 알려 수리를 개시할 경로가 없었다.
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000015`, { waitUntil: 'networkidle' })
  const faultBtn = pU.locator('button', { hasText: '장애 신고 (수리 요청)' })
  ok('장애 신고: 사용자 본인 사용중 자산에 신고 버튼 노출', (await faultBtn.count()) > 0)
  await faultBtn.first().click()
  await pU.waitForTimeout(200)
  await pU.locator('input[placeholder*="장애 증상"]').fill('전원 불량 — 간헐적으로 꺼짐')
  await pU.locator('button', { hasText: /^신고 접수$/ }).click()
  await pU.waitForTimeout(700)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000015`, { waitUntil: 'networkidle' })
  const faultRow = ((await pU.locator('tr', { has: pU.locator('td', { hasText: 'AST-2024-000015' }) }).first().textContent()) || '')
  ok('장애 신고: 신고 자산 수리중 전환(본인 대장 반영)', faultRow.includes('수리중'))
  // 장애 신고 취소(오신고 철회) — 업체 배정 전 사용자가 오신고를 스스로 철회해 사용중으로 복원(반납 신청 취소·상신 취소와 같은 셀프서비스 되돌리기). 철회 검증 후 재신고로 하위 수리 대기 검증 상태를 보존한다.
  await pU.locator('button', { hasText: /^장애 신고 철회$/ }).first().click()
  await pU.waitForTimeout(700)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000015`, { waitUntil: 'networkidle' })
  const cancelledRow = ((await pU.locator('tr', { has: pU.locator('td', { hasText: 'AST-2024-000015' }) }).first().textContent()) || '')
  ok('장애 신고 철회: 오신고 철회 시 사용중 복원(수리 대기 제외)', cancelledRow.includes('사용중') && !cancelledRow.includes('수리중'))
  // 재신고 — 하위 '수리 대기'·'내 수리 현황' 검증을 위해 원 상태(수리중·전원 불량)로 복구
  await pU.locator('button', { hasText: '장애 신고 (수리 요청)' }).first().click()
  await pU.waitForTimeout(200)
  await pU.locator('input[placeholder*="장애 증상"]').fill('전원 불량 — 간헐적으로 꺼짐')
  await pU.locator('button', { hasText: /^신고 접수$/ }).click()
  await pU.waitForTimeout(700)
  // 내 수리 현황 질의 — 방금 신고한 자산이 사용자 수리 현황에 증상과 함께 뜬다(장애 신고 루프의 사용자 추적 접점).
  await pU.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const urc = await pU.locator('.msg.assistant .bub').count()
  await pU.locator('.chat-in input').fill('내 수리 현황')
  await pU.locator('.chat-in input').press('Enter')
  await pU.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, urc, { timeout: 8000 })
  await pU.waitForTimeout(150)
  const uRepair = (await pU.locator('.msg.assistant .bub').last().textContent()) || ''
  ok('사용자 AI 질의: 내 수리 현황 — 장애 신고 자산·증상 초점(AST-2024-000015·전원 불량)', uRepair.includes('AST-2024-000015') && uRepair.includes('전원 불량'))

  // 반납 신청 셀프서비스(사용자) — 대여자가 대여를 마치고 반환하겠다고 자산담당에 알린다. 그동안 반환은 자산담당만 처리 가능했다. AST-2024-000230(김민준 대여중).
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  await pU.locator('button', { hasText: /^반납 신청$/ }).click()
  await pU.waitForTimeout(600)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  ok('반납 신청(사용자): 신청 접수 표시(반납 신청됨)', ((await pU.locator('body').textContent()) || '').includes('반납 신청됨'))
  // ?loanret=1 필터 활성화 — 대시보드 반납 신청 큐의 드릴다운 목적지(전체 대여중 아님). 대여자 본인 화면에서 취소 전 확인(자산담당 페이지는 이 시점 미개설).
  await pU.goto(`${BASE}/assets/register?loanret=1`, { waitUntil: 'networkidle' })
  const loanRetBody = (await pU.locator('body').textContent()) || ''
  ok('자산 대장: ?loanret=1 반납 신청 필터 활성화(대시보드 큐 드릴다운)', loanRetBody.includes('반납 신청 ') && loanRetBody.includes('✓ '))
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  // 반납 신청 취소 — 반환 접수 전이라면 본인 신청을 철회한다. 취소해 자산을 연장 요청 테스트를 위한 원상태로 되돌린다.
  await pU.locator('button', { hasText: /^신청 취소$/ }).click()
  await pU.waitForTimeout(600)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  ok('반납 신청 취소(사용자): 철회 후 반납 신청 버튼 복귀', (await pU.locator('button', { hasText: /^반납 신청$/ }).count()) > 0)

  // 대여 반환 기한 연장 요청(사용자 셀프서비스) — 대여자가 본인 대여 자산의 연장을 자산담당에 신청. 그동안 연장은 자산담당만 가능했다. AST-2024-000230(김민준 대여중).
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  await pU.locator('button', { hasText: /^반환 기한 연장 요청$/ }).click()
  await pU.waitForTimeout(200)
  await pU.locator('dd input[type="date"]').last().fill('2026-09-30')
  await pU.locator('input[placeholder="연장 사유"]').fill('e2e — 프로젝트 연장으로 반환 지연')
  await pU.locator('button', { hasText: /^요청$/ }).click()
  await pU.waitForTimeout(700)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  ok('대여 연장 요청(사용자): 요청 접수 표시(연장 요청·요청 날짜)', ((await pU.locator('body').textContent()) || '').includes('연장 요청') && ((await pU.locator('body').textContent()) || '').includes('2026-09-30'))
  // 반납·연장 상호배제(모순 상태·이중 큐 방지) — 연장 요청 중이면 반납 신청이 서버에서 차단된다(대칭 가드). 상태 변화 없이 차단만.
  await pU.locator('button', { hasText: /^반납 신청$/ }).click()
  await pU.waitForTimeout(500)
  ok('대여 셀프서비스: 연장 요청 중 반납 신청 차단(상호배제)', ((await pU.locator('body').textContent()) || '').includes('연장 요청 중인 자산입니다'))
  // 대여 연장 요청 취소(요청자 셀프서비스) — 자산담당 처리 전이라면 본인 요청을 철회할 수 있다. 취소 후 다시 신청해 p3 승인 테스트를 위한 요청을 남긴다.
  await pU.locator('button', { hasText: /^요청 취소$/ }).click()
  await pU.waitForTimeout(600)
  await pU.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  ok('대여 연장 요청 취소(사용자): 요청 철회 후 재신청 버튼 복귀', (await pU.locator('button', { hasText: /^반환 기한 연장 요청$/ }).count()) > 0)
  await pU.locator('button', { hasText: /^반환 기한 연장 요청$/ }).click()
  await pU.waitForTimeout(200)
  await pU.locator('dd input[type="date"]').last().fill('2026-09-30')
  await pU.locator('input[placeholder="연장 사유"]').fill('e2e — 프로젝트 연장으로 반환 지연(재신청)')
  await pU.locator('button', { hasText: /^요청$/ }).click()
  await pU.waitForTimeout(700)
  await ctxU.close()

  // ── Admin: AI 모델·프롬프트 버전 관리(§05 AI 거버넌스) + 감사 적재 ──
  const ctx3 = await browser.newContext()
  await ctx3.addCookies([cookie(ADMIN)])
  const p3 = await ctx3.newPage()
  p3.on('pageerror', (e) => { fail++; console.log('  ✗ PAGEERROR: ' + (e.message || e)) })
  // 대여 연장 요청 대기 대시보드 큐(자산담당) — 사용자 연장 요청이 통보만으로 놓치지 않게 대시보드에도 뜬다. pU 가 방금 AST-2024-000230 에 요청했다.
  await p3.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  ok('대시보드(자산담당): 대여 연장 요청 대기 큐 노출', ((await p3.textContent('body')) || '').includes('대여 연장 요청 대기'))
  // 상단 KPI 카드 드릴다운(대시보드=업무 허브) — 지표 클릭이 상세 화면으로 이어진다(미등록 신규 발견 KPI 와 동형). 그전엔 총 등록·만료 임박·결재 대기가 dead-end.
  ok('대시보드 KPI: 총 등록 자산 → 자산 대장 드릴다운', (await p3.locator('a[href="/assets/register"]', { hasText: '총 등록 자산' }).count()) > 0)
  ok('대시보드 KPI: 만료 임박 → 계약·라이선스 드릴다운', (await p3.locator('a[href="/inventory/contracts"]', { hasText: '만료 임박' }).count()) > 0)
  ok('대시보드 KPI: 결재 대기 → 결재함 드릴다운', (await p3.locator('a[href="/workflow/approvals"]', { hasText: '결재 대기' }).count()) > 0)
  // 대여 연장 요청 큐 드릴다운(count↔destination) — 전체 대여중이 아니라 ?loanext=1(연장 요청 자산만)로 연결. 큐 건수=목록.
  const extHref = await p3.locator('a', { hasText: '대여 연장 요청 대기' }).first().getAttribute('href')
  ok('대시보드: 대여 연장 요청 큐가 ?loanext=1 로 드릴다운(전체 대여중 아님)', !!extHref && decodeURIComponent(extHref).includes('/assets/register?loanext=1'))
  // 미등록 신규 발견(Shadow IT) KPI 클릭 → 발견 화면 이동 — 조치가 필요한 지표가 대시보드에서 상세로 바로 이어진다(비사용자만).
  ok('대시보드(비사용자): Shadow IT KPI 가 발견 화면 링크', (await p3.locator('a[href="/discovery/found"]').filter({ hasText: '미등록 신규 발견' }).count()) > 0)
  // 신청·결재 뱃지(결재자) — 결재 권한자에겐 내 결재 차례 건수가 사이드바 워크플로 뱃지로 뜬다(전사 총계 아님).
  ok('결재자 사이드바: 워크플로 결재 뱃지 노출(내 결재 차례 ≥ 1)', (await p3.locator('nav.menubar button').filter({ hasText: '워크플로' }).locator('.bdg').count()) > 0)
  // 대여 연장 요청 승인(자산담당 측) — 사용자가 올린 연장 요청을 자산담당이 요청대로 반영한다. 위 pU 가 AST-2024-000230 에 2026-09-30 연장 요청.
  await p3.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  ok('대여 연장 요청 승인: 자산담당에 요청대로 연장 버튼 노출', (await p3.locator('button', { hasText: /^요청대로 연장$/ }).count()) > 0)
  await p3.locator('button', { hasText: /^요청대로 연장$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/assets/register?sel=AST-2024-000230`, { waitUntil: 'networkidle' })
  ok('대여 연장 승인 → 반환 기한 요청 날짜로 연장(2026-09-30)', ((await p3.locator('body').textContent()) || '').includes('2026-09-30') && (await p3.locator('button', { hasText: /^요청대로 연장$/ }).count()) === 0)

  // 결재 지연 → 결재 독촉 발송(검출→조치). 결재 상태를 바꾸지 않으므로(발송만) 다른 검증에 영향 없음.
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const apRemind = p3.locator('button', { hasText: /^결재 독촉 발송 \d+건$/ })
  ok('결재 지연: 결재 독촉 발송 버튼(SLA 초과 대기)', (await apRemind.count()) > 0)
  await apRemind.click()
  await p3.waitForTimeout(800)
  ok('결재 지연 → 독촉: 발송 성공', (await p3.textContent('body')).includes('결재 독촉'))
  // 폐기 반려 → 자산 원 상태 복원·폐기 대상 해제 (반려된 폐기가 폐기예정 림보에 남지 않는다). 시드 APR-2607-119(AST-2019-000218·DSP-01)
  await p3.goto(`${BASE}/workflow/approvals?sel=APR-2607-119`, { waitUntil: 'networkidle' })
  const dispApr = p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2607-119' }) }).first()
  await dispApr.locator('button', { hasText: /^반려$/ }).click()
  await p3.waitForTimeout(150)
  await dispApr.locator('input[placeholder="반려 사유"]').fill('아직 사용 가능 — 폐기 보류')
  await dispApr.locator('button', { hasText: /^반려 확정$/ }).click()
  await p3.waitForTimeout(800)
  // 결재는 반려로 확정
  ok('폐기 반려: 결재 확정(반려)', ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2607-119' }) }).first().textContent()) || '').includes('반려'))
  // 자산은 폐기예정 림보가 아니라 원 상태(유휴)로 복원 — 폐기 절차에서 해제됨(대장 행 기준)
  await p3.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  const regRow = (await p3.locator('tr', { has: p3.locator('td', { hasText: 'AST-2019-000218' }) }).first().textContent()) || ''
  ok('폐기 반려 → 자산 유휴 복원(폐기예정 해제)', regRow.includes('유휴') && !regRow.includes('폐기예정'))
  await aiModelManage(p3)
  await aiFeedbackAccuracy(p3)
  await p3.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const auditAi = await p3.textContent('body')
  ok('감사 로그: AI 모델·프롬프트 버전 관리 적재', auditAi.includes('AI 모델·프롬프트 버전 관리') && auditAi.includes('claude-opus-5'))
  // 알림 재발송(#GAP3·§06 발송 신뢰성) — 전달 실패한 긴급 격리 문자(시드 MSG-4004)를 재발송하면 전달 완료로 전환·재발송 버튼이 사라진다.
  const failRow = () => p3.locator('tr', { has: p3.locator('td', { hasText: 'MSG-4004' }) }).first()
  ok('연동: 전달 실패 알림에 재발송 버튼(Admin)', (await failRow().locator('button', { hasText: /^재발송$/ }).count()) > 0)
  await failRow().locator('button', { hasText: /^재발송$/ }).click()
  await p3.waitForTimeout(700)
  ok('연동: 재발송 → 전달 완료(발송) 전환', ((await p3.textContent('body')) || '').includes('전달 완료') && (await failRow().locator('button', { hasText: /^재발송$/ }).count()) === 0)
  await aiPeriodQuery(p3)

  // ── 순수 로직 불변식(회귀 방지) — 상태를 바꾸지 않는 읽기 검증 ──
  // 원가·감가상각(lib/cost bookValueOf): 장부가 ≤ 취득가 · 감가상각률 0~100%
  {
    await p3.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
    const b = await p3.locator('.msg.assistant .bub').count()
    await p3.locator('.chat-in input').fill('자산 가치 현황')
    await p3.locator('.chat-in input').press('Enter')
    await p3.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, b, { timeout: 8000 })
    await p3.waitForTimeout(150)
    const vt = (await p3.locator('.msg.assistant .bub').last().textContent()) || ''
    const acq = Number((vt.match(/총 취득가 ([\d,]+)원/) || [])[1]?.replace(/,/g, '') ?? '-1')
    const book = Number((vt.match(/총 잔존가치\(장부가\) ([\d,]+)원/) || [])[1]?.replace(/,/g, '') ?? '-1')
    const dep = Number((vt.match(/감가상각률 (\d+)%/) || [])[1] ?? '-1')
    // 표시된 감가상각률이 표시된 금액과 정합해야 한다 — 율=round((취득-장부)/취득×100). 율·금액이 따로 놀면(공식 회귀) 잡는다.
    const depExpected = acq > 0 ? Math.round((1 - book / acq) * 100) : -1
    ok('불변식: 장부가 ≤ 취득가 · 감가상각률 0~100% · 율↔금액 정합', acq > 0 && book >= 0 && book <= acq && dep >= 0 && dep <= 100 && dep === depExpected)
  }
  // 취약점 우선순위(lib/vuln-priority): 점수 내림차순 · 티어 임계 정합 — 임계는 하드코딩이 아니라 보안담당이 관리하는 위험도 기준(riskPolicy)에서 온다
  const riskCard = () => p3.locator('.card', { has: p3.locator('*', { hasText: /^위험도 기준 — 취약점 우선순위 판정 컷오프$/ }) }).first()
  // 표 각 행의 tier 가 주어진 컷오프(p1Min·p2Min)와 정합하는지 + 점수 내림차순 검사
  const checkTiers = async (p1Min, p2Min) => {
    const vtable = p3.locator('table', { has: p3.locator('th', { hasText: /^점수$/ }) }).first()
    const vrows = vtable.locator('tbody tr')
    const nv = await vrows.count()
    let mono = true, tierOk = true, prev = 101, checked = 0
    for (let i = 0; i < nv; i++) {
      const tds = await vrows.nth(i).locator('td').allTextContents()
      const tier = (tds.find((x) => /^P[123]$/.test(x.trim())) || '').trim()
      const score = Number((tds[tds.length - 2] || '').trim())
      if (!/^P[123]$/.test(tier) || Number.isNaN(score)) continue
      checked++
      if (score > prev) mono = false
      prev = score
      if ((score >= p1Min ? 'P1' : score >= p2Min ? 'P2' : 'P3') !== tier) tierOk = false
    }
    return { checked, mono, tierOk }
  }
  {
    await p3.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
    // 활성 위험도 기준을 패널에서 읽어(기본 P1≥67·P2≥34) 그 임계로 정합 검사
    const rc0 = (await riskCard().textContent()) || ''
    const liveP1 = Number((rc0.match(/점수\s*(\d+)\s*이상/) || [])[1] ?? '67')
    const liveP2 = Number((rc0.match(/점수\s*(\d+)~/) || [])[1] ?? '34')
    const r0 = await checkTiers(liveP1, liveP2)
    ok('불변식: 취약점 우선순위 점수 내림차순·티어 임계(활성 위험도 기준) 정합', r0.checked > 0 && r0.mono && r0.tierOk)
    // 취약점 점수 floor 절사(반올림 아님) 회귀 — 중간×높음=66.67 은 floor 66(P2)이어야 한다. 반올림이면 67(P1)이 돼 P2 가 P1 로 오분류(리포트 P2 상한 '66' 라벨과 불일치). 기본 기준(67/34)에서 66점 행은 P2·67점 행은 부재여야 한다. 위 checkTiers 는 표시된 점수로 티어를 되계산해 vacuous 하므로 이 절대 단언으로 잡는다.
    const vtbl0 = p3.locator('table', { has: p3.locator('th', { hasText: /^점수$/ }) }).first()
    const vpairs = []
    { const nn = await vtbl0.locator('tbody tr').count(); for (let i = 0; i < nn; i++) { const tds = await vtbl0.locator('tbody tr').nth(i).locator('td').allTextContents(); const tier = (tds.find((x) => /^P[123]$/.test(x.trim())) || '').trim(); const sc = Number((tds[tds.length - 2] || '').trim()); if (/^P[123]$/.test(tier) && !Number.isNaN(sc)) vpairs.push({ sc, tier }) } }
    ok('취약점 점수 floor 절사: 중간×높음=66점은 P2 (반올림 67·P1 오분류 아님)', vpairs.some((v) => v.sc === 66 && v.tier === 'P2') && !vpairs.some((v) => v.sc === 67))

    // 위험도 기준 편집(보안담당 책무 — ADMIN 가능) → 컷오프를 40/20 으로 낮추면 표가 새 기준으로 재분류된다
    await riskCard().locator('button', { hasText: /^기준 변경$/ }).click()
    const nums = riskCard().locator('input[type="number"]')
    await nums.nth(0).fill('40'); await nums.nth(1).fill('20')
    await riskCard().locator('button', { hasText: /^저장$/ }).click()
    await p3.waitForTimeout(700)
    await p3.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
    const rc1 = (await riskCard().textContent()) || ''
    const r1 = await checkTiers(40, 20)
    ok('위험도 기준 편집 → 표가 새 컷오프(40/20)로 재분류·정합', rc1.includes('40') && r1.checked > 0 && r1.tierOk)

    // P2 ≥ P1 은 세 등급이 성립 안 함 — 서버가 거부한다
    await riskCard().locator('button', { hasText: /^기준 변경$/ }).click()
    const nums2 = riskCard().locator('input[type="number"]')
    await nums2.nth(0).fill('30'); await nums2.nth(1).fill('50')
    await riskCard().locator('button', { hasText: /^저장$/ }).click()
    await p3.waitForTimeout(500)
    ok('위험도 기준: P2 ≥ P1 거부(서버 검증)', ((await riskCard().textContent()) || '').includes('P2 기준은 P1 기준보다 낮아야'))

    // 원복 — 후속 검사·재실행이 기본 기준을 보도록 67/34 로 되돌린다
    await riskCard().locator('input[type="number"]').nth(0).fill('67')
    await riskCard().locator('input[type="number"]').nth(1).fill('34')
    await riskCard().locator('button', { hasText: /^저장$/ }).click()
    await p3.waitForTimeout(600)
    await p3.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
    ok('위험도 기준 원복(67/34)', ((await riskCard().textContent()) || '').includes('67'))
  }
  // 자동분류(lib/classify) 분기 — 관측 유형에 카테고리 단어가 없어 '분류로만' 나오는 강한 케이스로 매핑 검증
  {
    await p3.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
    const clsRow = async (typeText, cat) => ((await p3.locator('tr', { hasText: typeText }).first().textContent()) || '').includes(cat)
    ok('불변식: 자동분류 AWS EC2 → 가상자원', await clsRow('AWS EC2', '가상자원'))
    ok('불변식: 자동분류 NAS → 서버', await clsRow('NAS', '서버'))
  }

  // 운영 정책(임계값) 편집 — 소유자 확인 기한을 5일로 바꾸면 발견 처리 화면 에스컬레이션 기한에 반영된다(스토어 단일 출처).
  //  전역 opsPolicy 를 바꾸므로 마지막 컨텍스트의 맨 끝에서 수행한다(다른 검증에 영향 없음).
  await p3.goto(`${BASE}/settings/ai-policy`, { waitUntil: 'networkidle' })
  const opsCard = p3.locator('.card', { hasText: '운영 정책 — 기한' })
  ok('운영 정책: 카드 렌더', (await opsCard.count()) > 0)
  await opsCard.locator('button', { hasText: /^정책 편집$/ }).click()
  await p3.waitForTimeout(250)
  await opsCard.locator('input[type="number"]').nth(0).fill('5')   // 소유자 확인 기한
  await opsCard.locator('input[type="number"]').nth(3).fill('60')  // 만료 알림 창
  await opsCard.locator('input[type="number"]').nth(4).fill('45')  // 정기 점검 창 (신규 — 하드코딩 30 승격)
  await opsCard.locator('button', { hasText: /^저장$/ }).click()
  await p3.waitForTimeout(700)
  ok('운영 정책: 변경 성공(확인기한 5일·만료창 60일)', (await p3.textContent('body')).includes('운영 정책 갱신'))
  // 정기 점검 창(신규 임계값) — 하드코딩 30 을 opsPolicy 로 승격, 설정값이 setter·표시에 반영된다(isMaintenanceDue 가 이 값을 창으로 사용).
  ok('운영 정책: 정기 점검 창 편집 반영(하드코딩 30 → 설정 45)', (await p3.textContent('body')).includes('점검창 45'))
  await p3.goto(`${BASE}/settings/ai-policy`, { waitUntil: 'networkidle' })
  ok('운영 정책: 정기 점검 창 설정값(45일) 표시 유지', (await opsCard.textContent()).includes('정기 점검 창') && (await opsCard.textContent()).includes('45일'))
  await p3.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  ok('운영 정책 다운스트림: 발견 처리 에스컬레이션 기한 5일 반영', (await p3.textContent('body')).includes('기한(5일)'))
  // 리포트도 운영 정책을 따른다 — 월간 자산 현황의 만료 임박 섹션이 60일 창으로 산출된다(하드코딩 90 제거)
  await p3.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const rb = await p3.locator('.msg.assistant .bub').count()
  await p3.locator('.chat-in input').fill('월간 자산 현황 리포트 생성해줘')
  await p3.locator('.chat-in input').press('Enter')
  await p3.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, rb, { timeout: 8000 })
  await p3.waitForTimeout(300)
  const mh = await p3.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const mid = decodeURIComponent((mh.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const mmd = await (await p3.request.get(`${BASE}/api/reports/${encodeURIComponent(mid)}?format=md`)).text()
  ok('운영 정책 다운스트림: 리포트 만료 임박 창 60일 반영', mmd.includes('만료 임박 계약 (60일 이내)') && !mmd.includes('(90일 이내)'))
  // 월간 자산 현황에 폐기 진행 현황(완료 전 파이프라인) 섹션이 포함된다 — 처분 실적(완료)의 짝
  ok('리포트: 월간 자산 현황에 폐기 진행 현황 섹션', mmd.includes('폐기 진행 현황') && mmd.includes('자산 처분 실적'))
  // 수명주기 처리 대상 섹션 화면-리포트 정합(#4107 리포트 내용 감사) — 화면 대기열(lifecycle/page)은 종결(폐기완료)을 제외하는데 리포트가 사용중만 제외해 종결 자산이 '처리 대상'(할 일)에 남던 드리프트. 폐기완료 AST-2018-000090 은 이 섹션에만 없어야 한다(처분 실적·폐기 진행 섹션엔 정상 노출이라 섹션 스코프로 검증).
  const lcStart = mmd.indexOf('## 수명주기 처리 대상')
  const lcEnd = mmd.indexOf('## ', lcStart + 3)
  const lcSec = lcStart >= 0 ? mmd.slice(lcStart, lcEnd === -1 ? undefined : lcEnd) : ''
  ok('리포트(월간 자산 현황): 수명주기 처리 대상에 종결(폐기완료) 자산 미포함(화면 대기열 정합)', lcStart >= 0 && !lcSec.includes('AST-2018-000090') && !lcSec.includes('폐기완료'))
  // 감사 대응 자료 — '정책 이행'을 탐지 정책만이 아니라 운영·위험도·AI 거버넌스 기준 + SW·SaaS 정책 상태까지 증빙
  const rb2 = await p3.locator('.msg.assistant .bub').count()
  await p3.locator('.chat-in input').fill('감사 대응 자료 리포트 생성해줘')
  await p3.locator('.chat-in input').press('Enter')
  await p3.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, rb2, { timeout: 8000 })
  await p3.waitForTimeout(300)
  const ah = await p3.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const aid = decodeURIComponent((ah.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const amd = await (await p3.request.get(`${BASE}/api/reports/${encodeURIComponent(aid)}?format=md`)).text()
  ok('감사 대응 자료: 운영·거버넌스 정책 기준 섹션(운영·위험도·AI)', amd.includes('운영 · 거버넌스 정책 기준') && amd.includes('취약점 우선순위 P1') && amd.includes('AI 로그 보존'))
  ok('감사 대응 자료: SW·SaaS 정책 상태 섹션(화이트리스트·카탈로그)', amd.includes('SW · SaaS 정책 상태') && amd.includes('화이트리스트') && amd.includes('SaaS 카탈로그'))
  // 라이선스 컴플라이언스 — 중복 기능 SaaS 통합 후보(화면 v1.250)를 결재 첨부 리포트에도 담는다(§05 라이선스 최적화). 화면·리포트 동일 산출.
  const rb3 = await p3.locator('.msg.assistant .bub').count()
  await p3.locator('.chat-in input').fill('라이선스 컴플라이언스 리포트 생성해줘')
  await p3.locator('.chat-in input').press('Enter')
  await p3.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, rb3, { timeout: 8000 })
  await p3.waitForTimeout(300)
  const lh = await p3.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const lid = decodeURIComponent((lh.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const lmd = await (await p3.request.get(`${BASE}/api/reports/${encodeURIComponent(lid)}?format=md`)).text()
  ok('라이선스 컴플라이언스: 중복 기능 SaaS 통합 후보 섹션(협업=Notion·Miro)', lmd.includes('중복 기능 SaaS 통합 후보') && lmd.includes('협업') && lmd.includes('Notion'))
  // 만료 경과 라이선스 — 리포트 판정에 '만료' 반영(LIC-002 JetBrains 만료·초과 사용) + 대사 note 집계
  ok('라이선스 컴플라이언스: 만료 경과 판정 반영(JetBrains 만료·초과)', lmd.includes('만료 경과') && lmd.includes('만료·초과 사용'))
  // 갱신 협상 근거(§05 라이선스 최적화 3번째 축) — 사용률 기반 권고 수량. 초과(JetBrains)=증설, 미사용(Adobe 22/40)=감축.
  ok('라이선스 컴플라이언스: 갱신 협상 근거 섹션(증설·감축 권고)', lmd.includes('갱신 협상 근거') && lmd.includes('증설 협상') && lmd.includes('감축 협상'))
  // 계약 반출 화면-반출 정합 — 화면(ContractsTable)의 SLA·집행(누계 비용)이 감사 엑셀에도 담긴다(벤더 SLA 검토·예산 집행 대사 증적). ADMIN 엑셀 권한.
  const cxls = Buffer.from(await (await p3.request.get(`${BASE}/api/export/contracts`)).body()).toString('utf8')
  ok('계약 반출: xlsx 에 SLA·집행(누계) 열 반영(화면-반출 정합)', cxls.includes('SLA') && cxls.includes('집행(누계)') && cxls.includes('온사이트'))
  // 반출 화면-반출 정합 보강 — 화면이 보여주는 감사 필드가 각 반출 시트에도 담긴다(승인 반려 사유·자산 업무중요도/점검 예정·발견 불일치·SaaS 검토 접수).
  const axls = Buffer.from(await (await p3.request.get(`${BASE}/api/export/approvals`)).body()).toString('utf8')
  ok('결재 반출: xlsx 에 반려 사유 열·값(반려 감사 정합)', axls.includes('반려 사유') && axls.includes('개인 용도로 판단'))
  const asxls = Buffer.from(await (await p3.request.get(`${BASE}/api/export/assets`)).body()).toString('utf8')
  ok('자산 반출: xlsx 에 업무 중요도·정기 점검 예정 열(화면 컬럼 정합)', asxls.includes('업무 중요도') && asxls.includes('정기 점검 예정'))
  const dxls = Buffer.from(await (await p3.request.get(`${BASE}/api/export/discovered`)).body()).toString('utf8')
  ok('발견 반출: xlsx 에 불일치 내용 열·값(CMDB 대사 증적)', dxls.includes('불일치 내용') && dxls.includes('위치 상이'))
  const scxls = Buffer.from(await (await p3.request.get(`${BASE}/api/export/saasCatalog`)).body()).toString('utf8')
  ok('SaaS 정책 반출: xlsx 에 검토 접수일 열·값(검토중 SLA 경과 증적)', scxls.includes('검토 접수일') && scxls.includes('2026-07-09'))
  // 계약 해지 연계 영향 surfacing — CT-2023-002(M365 구매 · LIC-001 연계) 해지 시 연계 라이선스·자산 영향을 담당자가 검토하도록 노출
  await p3.goto(`${BASE}/inventory/contracts?sel=CT-2023-002`, { waitUntil: 'networkidle' })
  const ctRow = p3.locator('tr', { has: p3.locator('td', { hasText: 'CT-2023-002' }) }).first()
  await ctRow.locator('button', { hasText: /^해지$/ }).first().click()
  await p3.waitForTimeout(150)
  const ctReason = ctRow.locator('input[placeholder="해지 사유"]')
  await ctReason.fill('공급사 변경 — 신규 계약 이관')
  await ctReason.press('Enter')
  await p3.waitForTimeout(700)
  ok('계약 해지: 연계 라이선스·자산 영향 노출(검토 필요)', (await p3.textContent('body')).includes('라이선스 1건(구독 확인)') && (await p3.textContent('body')).includes('검토 필요'))
  // 역방향 교차 정합 — 근거 계약이 해지되면 그 라이선스(LIC-001 Microsoft 365)에 '근거 해지' 표기(v1.272 의 역방향)
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const licTable2 = p3.locator('table', { has: p3.locator('th', { hasText: /보유.{0,2}사용 대사/ }) }).first()
  const licRow2 = licTable2.locator('tbody tr').filter({ hasText: 'Microsoft 365' }).first()
  ok('계약 해지 → 라이선스 근거 해지 표기(LIC-001)', ((await licRow2.textContent()) || '').includes('근거 해지'))
  // 근거 해지 → 이관·재계약 검토 요청(로64) — 계약 해지(32)의 라이선스 측 낙수. 표시뿐이던 근거 해지에 이관·재계약 조치 채널을 붙인다.
  ok('근거 해지: 이관·재계약 검토 요청 버튼 노출(표시→조치)', (await licRow2.locator('button', { hasText: /^재계약 검토$/ }).count()) > 0)
  await licRow2.locator('button', { hasText: /^재계약 검토$/ }).first().click()
  await p3.waitForTimeout(700)
  ok('근거 해지: 재계약 검토 요청 발송 성공(주관부서·공급사 · 발송 이력)', ((await licTable2.textContent()) || '').includes('재계약 검토 요청') && ((await licTable2.textContent()) || '').includes('통지'))
  // 계약 부속서류 제출 요청(로65) — 필수 부속서류 미비(감사 리스크 배지)에 배치 조치 채널을 붙인다. 시드 다수 계약(CT-2023-021·CT-2026-009 등)이 부속서류 미비.
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const docBtn = p3.locator('button', { hasText: /^부속서류 제출 요청 \(\d+\)$/ })
  ok('계약 부속서류: 제출 요청 버튼 노출(미비 배지 ≥1)', (await docBtn.count()) > 0 && !/\(0\)/.test(await docBtn.first().innerText()))
  await docBtn.first().click()
  await p3.waitForTimeout(800)
  ok('계약 부속서류: 제출 요청 발송 성공(주관부서·공급사 · 발송 이력)', ((await p3.textContent('body')) || '').includes('미비 서류 제출 요청'))
  // 라이선스 좌석 배정 대장 — 누가 어느 석을 쓰는지 명명형 관리 + 탐지 사용량과 대사(배정 밖 사용 식별). 시드 LIC-004 AutoCAD 배정 2/사용 6.
  const camRow = licTable2.locator('tbody tr').filter({ hasText: 'AutoCAD' }).first()
  ok('라이선스 좌석: 배정 대장·미배정 사용 대사 표기(LIC-004 배정 2/사용 6)', ((await camRow.textContent()) || '').includes('배정 2/15석') && ((await camRow.textContent()) || '').includes('미배정 사용 4'))
  await camRow.locator('button', { hasText: /배정 2\/15석/ }).click()
  await p3.waitForTimeout(200)
  await camRow.locator('input[placeholder*="자산번호"]').fill('AST-2024-000092')
  await camRow.locator('button', { hasText: /^좌석 배정$/ }).click()
  await p3.waitForTimeout(700)
  ok('라이선스 좌석 배정: 자산 배정 성공 → 배정 3석·미배정 사용 3으로 대사 갱신', ((await camRow.textContent()) || '').includes('배정 3/15석') && ((await camRow.textContent()) || '').includes('미배정 사용 3'))
  // 좌석 회수(배정 해제) — 배정 대장에서 제거하면 다시 배정 2석으로 복귀
  await camRow.locator('.hstack', { hasText: 'AST-2024-000092' }).locator('button', { hasText: /^회수$/ }).click()
  await p3.waitForTimeout(700)
  ok('라이선스 좌석 회수: 배정 해제 → 배정 2석 복귀', ((await camRow.textContent()) || '').includes('배정 2/15석'))
  // 좌석 파생 used 하향 정합 — UI 생성 라이선스는 used 가 좌석 배정 고점에서만 온다(전사 소비 집계 없음). 배정 후 전량 회수하면 used 도 함께 내려야 하며,
  //  갇히면 '미배정 사용' 팬텀이 남고 컴플라이언스가 '적정'으로 오분류돼 회수 절감 기회가 감춰진다(배정 상한 클램프의 하향 짝). used===좌석수일 때만 하향(넓은 소비 집계는 유지).
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  await p3.locator('button', { hasText: /라이선스 등록/ }).first().click()
  await p3.locator('input[placeholder="라이선스명"]').fill('e2e-좌석파생-라이선스')
  await p3.locator('input[placeholder="공급사"]').fill('e2e-공급사')
  await p3.locator('label', { hasText: '보유' }).locator('input[type="number"]').fill('3')
  await p3.locator('input[placeholder*="만료"]').fill('-')
  await p3.locator('button', { hasText: /^등록$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const drvRow = () => p3.locator('tr', { hasText: 'e2e-좌석파생-라이선스' }).first()
  await drvRow().locator('button', { hasText: /배정 0\/3석/ }).click()
  await drvRow().locator('input[placeholder*="자산번호"]').fill('AST-2024-000618')
  await drvRow().locator('button', { hasText: /^좌석 배정$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  await drvRow().locator('button', { hasText: /배정 1\/3석/ }).click()
  await drvRow().locator('.hstack', { hasText: 'AST-2024-000618' }).locator('button', { hasText: /^회수$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const drvFinal = (await drvRow().textContent()) || ''
  ok('라이선스 좌석 파생 used 하향 정합: 전량 회수 후 used 갇힘 없음(미배정 사용 팬텀 제거)', drvFinal.includes('배정 0/3석') && !drvFinal.includes('미배정 사용'))
  // 전량 미사용(used=0) 라이선스 회수 차단(데이터 무결성 · #4107 계산 감사) — 회수 승인은 purchased=used 로 감축하는데 used=0 이면 purchased=0 → 사용률 0/0=NaN 로
  //  컴플라이언스·리포트·좌석 카드가 무너진다(회수 게이트가 used>0 을 요구 안 하던 공백). 전량 미사용은 해지 대상으로 유도. 위 좌석파생 라이선스는 전량 회수로 used=0·purchased=3.
  await drvRow().locator('button', { hasText: /^회수 3석$/ }).click()
  await p3.waitForTimeout(500)
  ok('전량 미사용 라이선스 회수 차단(purchased=0 → NaN 방지 · 해지 유도)', ((await drvRow().textContent()) || '').includes('해지 대상'))
  // 라이선스 STEP2 사용 수집(§03) — EDR 설치 SW 인벤토리를 배정 좌석과 대사. 배정 밖 설치(무단 사용)·미설치 좌석 식별 + 수집 실행.
  //  LIC-004: 좌석 2(871·112) vs 설치 2(871·432) → AST-2021-000432 배정 밖 설치, AST-2023-000112 미설치 좌석.
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const step2 = p3.locator('.card', { hasText: '사용 수집 — EDR 설치 SW 인벤토리 대사' }).first()
  const step2Txt = (await step2.textContent()) || ''
  ok('라이선스 STEP2: 사용 수집 패널 — 배정 밖 설치 대사(AST-2021-000432)', step2Txt.includes('AST-2021-000432') && step2Txt.includes('배정 밖 설치'))
  await step2.locator('button', { hasText: /^사용 수집$/ }).click()
  await p3.waitForTimeout(900)
  ok('라이선스 STEP2: 사용 수집 실행 → 설치 관측 대사 완료', ((await step2.textContent()) || '').includes('사용 수집 완료'))

  // SAM 좌석 대사 인라인 처리 — STEP2 검출 좌석 불일치(무단 사용·미설치 좌석)를 화면 이탈 없이 좌석 배정/회수로 처리(그동안 라이선스 좌석 관리로 이동해야 했다).
  const step2Card = () => p3.locator('.card', { hasText: '사용 수집 — EDR 설치 SW 인벤토리 대사' }).first()
  ok('라이선스 STEP2: 미설치 좌석에 인라인 좌석 회수 액션(회수 후보)', (await step2Card().locator('span').filter({ hasText: 'AST-2023-000112' }).locator('button', { hasText: /^좌석 회수$/ }).count()) > 0)
  const offSpan = step2Card().locator('span').filter({ hasText: 'AST-2024-000015' }).first()
  ok('라이선스 STEP2: 배정 밖 설치(무단 사용)에 인라인 좌석 배정 액션', (await offSpan.locator('button', { hasText: /^좌석 배정$/ }).count()) > 0)
  await offSpan.locator('button', { hasText: /^좌석 배정$/ }).first().click()
  await p3.waitForTimeout(800)
  ok('라이선스 STEP2: 인라인 좌석 배정 처리 성공(무단 사용 합법화 · 배정 N/M석)', /배정 \d+\/\d+석/.test((await step2Card().textContent()) || ''))
  // 배정 밖 설치 제거 요청(로62) — 좌석 배정(구매·합법화) 대신 무단 설치 소거를 소유 부서에 통지. 같은 셀의 반대편 조치(미인가 SW 제거 47의 라이선스판).
  const rmSpan = step2Card().locator('span').filter({ hasText: 'AST-2021-000432' }).first()
  ok('라이선스 STEP2: 배정 밖 설치에 제거 요청 액션(합법화 아니면 제거)', (await rmSpan.locator('button', { hasText: /^제거 요청$/ }).count()) > 0)
  await rmSpan.locator('button', { hasText: /^제거 요청$/ }).first().click()
  await p3.waitForTimeout(800)
  ok('라이선스 STEP2: 제거 요청 발송 성공(소유 부서 통지·발송 이력)', ((await step2Card().textContent()) || '').includes('통지·감사 적재'))

  // 좌석 배정 이탈-자산 가드 — 폐기·분실·반납대기 등 이탈한 자산에 좌석을 새로 배정하면 좌석 자동 회수(이탈 시점에만 돎)가 다시 돌지 않아 좌석이 영구 누수된다(보유 초과·사용량 과대·SAM 배정 대장 오기록, 로56 무결성). 폐기완료 자산(AST-2018-000090) 배정 시도 → 거부·배정 2석 유지.
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const seatGuardRow = p3.locator('table', { has: p3.locator('th', { hasText: /보유.{0,2}사용 대사/ }) }).first().locator('tbody tr').filter({ hasText: 'AutoCAD' }).first()
  await seatGuardRow.locator('button', { hasText: /배정 2\/15석/ }).click()
  await p3.waitForTimeout(300)
  await seatGuardRow.locator('input[placeholder*="자산번호"]').fill('AST-2018-000090')
  await seatGuardRow.locator('button', { hasText: /^좌석 배정$/ }).click()
  await p3.waitForTimeout(700)
  ok('좌석 배정 이탈-자산 가드: 폐기완료 자산 배정 거부(좌석 누수 방지) · 배정 2석 유지', ((await seatGuardRow.textContent()) || '').includes('배정 2/15석') && !((await seatGuardRow.textContent()) || '').includes('배정 3/15석'))

  // 라이선스 표 필터·딥링크(계약 표와 대칭) — 그동안 SW 라이선스 표에는 검색·상태·판정 필터가 없어 대시보드 라이선스 큐(초과 사용·만료 경과) 드릴인이 전체 목록으로 떨어졌다.
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const licTable = () => p3.locator('table', { has: p3.locator('th', { hasText: /보유.{0,2}사용 대사/ }) }).first()
  const licCard = p3.locator('.card', { has: p3.locator('th', { hasText: /보유.{0,2}사용 대사/ }) }).first()
  ok('라이선스 표: 검색·필터 툴바 존재(계약 표와 대칭)', (await licCard.locator('input[placeholder*="라이선스명"]').count()) > 0)
  // 만료 임박 토글 — 시드 5종 중 만료창(60일) 내 3종(JetBrains 경과·Adobe·Slack)으로 좁혀진다
  const licRows = () => licTable().locator('tbody tr')
  const totalLic = await licRows().count()
  await licCard.locator('button', { hasText: /만료 임박 \d+/ }).click()
  await p3.waitForTimeout(300)
  const expLic = await licRows().count()
  ok('라이선스 표: 만료 임박 토글로 행 축소', expLic < totalLic && expLic > 0)
  // 대시보드 딥링크(?lic=over) — 초과 사용만 사전 필터(JetBrains 1종). 필터 없이는 5종 전체가 떠 AutoCAD(미사용)도 노출.
  await p3.goto(`${BASE}/inventory/contracts?lic=over`, { waitUntil: 'networkidle' })
  const overTxt = (await licTable().locator('tbody').textContent()) || ''
  ok('라이선스 표: 딥링크 ?lic=over 초과 사용 사전 필터(JetBrains만·AutoCAD 제외)', overTxt.includes('JetBrains') && !overTxt.includes('AutoCAD') && (await licRows().count()) === 1)

  // 유지보수 계약 예산 집행(§03) — CT-2022-007 누계 4,980만 > 계약 4,800만 → 예산 초과 판정. 대시보드 재협상 큐와 동일 근거.
  const maintCard = p3.locator('.card', { hasText: '유지보수 계약 관리 — 예산 집행 · SLA' }).first()
  const maintTxt = (await maintCard.textContent()) || ''
  ok('유지보수 계약: 예산 초과 판정 렌더(CT-2022-007 집행률>100%)', maintTxt.includes('네트워크 장비 통합 유지보수') && maintTxt.includes('예산 초과'))
  // 구매 계약 발주·검수 이행(§03) — CT-2023-021 발주 7%·만료 임박 → 발주 미이행 위험 판정. 대시보드 이행 점검 큐와 동일 근거.
  const procCard = p3.locator('.card', { hasText: '구매 계약 발주·검수 이행 현황' }).first()
  const procTxt = (await procCard.textContent()) || ''
  ok('구매 계약: 발주 미이행 위험 판정 렌더(CT-2023-021 발주율 저조·만료 임박)', procTxt.includes('IDC-A 서버 증설') && procTxt.includes('미이행 위험'))
  // SaaS 인가 요청 승인 → 사용 현황(s.saas) + 정책 카탈로그(s.saasCatalog) 양쪽 인가 반영(교차 정합). 시드 APR-2607-125(Linear)
  await p3.goto(`${BASE}/workflow/approvals?sel=APR-2607-125`, { waitUntil: 'networkidle' })
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2607-125' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/settings/saas-catalog`, { waitUntil: 'networkidle' })
  const linearRow = p3.locator('tr').filter({ hasText: 'Linear' }).first()
  ok('SaaS 인가 요청 승인 → 카탈로그 인가 반영(Linear)', ((await linearRow.textContent()) || '').includes('인가'))
  // SaaS 판정 기한 경과 에스컬레이션 — 표시뿐이던 기한 경과 신호에 조치 채널(보안담당 판정 요청 통보). 시드 검토중 방치분(Notion·ChatGPT 등)으로 활성.
  const saasEscBtn = p3.locator('button', { hasText: /^판정 기한 경과 에스컬레이션 \(\d+\)$/ })
  ok('SaaS 카탈로그: 판정 기한 경과 에스컬레이션 버튼 노출(신호→조치)', (await saasEscBtn.count()) > 0 && !/\(0\)/.test(await saasEscBtn.first().innerText()))
  await saasEscBtn.first().click()
  await p3.waitForTimeout(800)
  ok('SaaS 판정 기한 경과 에스컬레이션: 보안담당 판정 요청 통보 발송', ((await p3.textContent('body')) || '').includes('SaaS 판정 독촉') && ((await p3.textContent('body')) || '').includes('발송'))
  // SaaS 판정 독촉 SMS 등급 게이트 — 기밀·민감 등급만 문자(SMS) 병행, 일반 등급은 이메일만(데이터 반출 위험 기준). escalate 가 sms 미지정에도 제목으로 문자를 보내 일반 등급(Miro)에도 SMS 가 새던 버그. 문자 subject '[긴급] …'로 식별: 민감(ChatGPT)엔 '[긴급] ChatGPT 미판정' 문자, 일반(Miro)엔 '[긴급] SaaS 판정 기한 경과 — Miro' 문자가 없어야 한다.
  await p3.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const saasSmsBody = (await p3.locator('.card', { has: p3.locator('text=알림 발송 이력') }).first().textContent()) || ''
  ok('SaaS 판정 독촉 SMS 게이트: 민감(ChatGPT) 문자 발송 · 일반(Miro) 문자 미발송', saasSmsBody.includes('[긴급] ChatGPT 미판정') && !saasSmsBody.includes('[긴급] SaaS 판정 기한 경과 — Miro'))
  await p3.goto(`${BASE}/settings/saas-catalog`, { waitUntil: 'networkidle' }) // 후속 테스트 컨텍스트 복원(SaaS 카탈로그 화면)
  // SaaS 카탈로그 신규 등록(create 파리티) — 발견 이전이라도 담당자가 서비스를 검토중으로 직접 등재. 그동안 카탈로그는 발견 판정·인가 결재로만 늘어 create 진입점이 없었다(공통코드엔 있는 add).
  await p3.locator('button', { hasText: /^\+ SaaS 등록$/ }).click()
  await p3.waitForTimeout(200)
  await p3.locator('input[placeholder="서비스명 (필수)"]').fill('e2e-신규SaaS')
  await p3.locator('input[placeholder="분류"]').fill('테스트')
  await p3.locator('button', { hasText: /^검토중으로 등재$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/settings/saas-catalog`, { waitUntil: 'networkidle' })
  const newSaasRow = p3.locator('tr').filter({ hasText: 'e2e-신규SaaS' }).first()
  ok('SaaS 카탈로그 신규 등록: 검토중으로 카탈로그 등재(create)', (await newSaasRow.count()) > 0 && ((await newSaasRow.textContent()) || '').includes('검토중'))
  // 등록 가드(경계) — 빈 서비스명은 등재 버튼 비활성, 중복 서비스명은 서버가 거부한다(create 파리티 방어).
  await p3.locator('button', { hasText: /^\+ SaaS 등록$/ }).click()
  await p3.waitForTimeout(200)
  ok('SaaS 등록 가드: 빈 서비스명이면 등재 버튼 비활성', await p3.locator('button', { hasText: /^검토중으로 등재$/ }).isDisabled())
  await p3.locator('input[placeholder="서비스명 (필수)"]').fill('e2e-신규SaaS')
  await p3.locator('button', { hasText: /^검토중으로 등재$/ }).click()
  await p3.waitForTimeout(600)
  ok('SaaS 등록 가드: 중복 서비스명 거부(이미 카탈로그에 있는 서비스)', ((await p3.textContent('body')) || '').includes('이미 카탈로그에 있는 서비스'))
  // 반납 결재 승인 → 라이선스 좌석 자동 회수(로56 좌석 생애주기 버그픽스) — 담당자 회수·폐기뿐 아니라 사용자 반납 승인도 좌석을 회수한다. 시드 AST-2025-000513(LIC-001 좌석)·APR-2607-117.
  await p3.goto(`${BASE}/assets/register?sel=AST-2025-000513`, { waitUntil: 'networkidle' })
  ok('반납 좌석 회수 전: 배정 라이선스 역조회 노출(LIC-001)', ((await p3.locator('body').textContent()) || '').includes('배정 라이선스') && ((await p3.locator('body').textContent()) || '').includes('Microsoft 365'))
  await p3.goto(`${BASE}/workflow/approvals?sel=APR-2607-117`, { waitUntil: 'networkidle' })
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2607-117' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/assets/register?sel=AST-2025-000513`, { waitUntil: 'networkidle' })
  const relBody = (await p3.locator('body').textContent()) || ''
  ok('반납 결재 승인 → 라이선스 좌석 자동 회수(이력 적재·역조회 소멸)', relBody.includes('라이선스 좌석 회수') && !relBody.includes('배정 라이선스'))
  // 스테일 반납 방어 — 상신(이서연) 후 자산이 회수·재배정되어 보유자가 오세훈으로 바뀐 반납 결재(APR-2607-118)는 승인해도 반납대기로 되돌리지 않는다(대여 승인·차이 조정 스테일 방어와 동형). 재배정 무효화·새 보유자 좌석 회수 방지.
  await p3.goto(`${BASE}/workflow/approvals?sel=APR-2607-118`, { waitUntil: 'networkidle' })
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2607-118' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/assets/register?q=AST-2023-000707`, { waitUntil: 'networkidle' })
  const staleRet = (await p3.locator('tr', { hasText: 'AST-2023-000707' }).first().textContent()) || ''
  ok('스테일 반납 승인 미적용 — 재배정 자산은 사용중·오세훈 유지(반납대기로 뒤엎지 않음)', staleRet.includes('사용중') && staleRet.includes('오세훈') && !staleRet.includes('반납대기'))
  await p3.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  ok('스테일 반납 승인 → 반납 접수 대기열에 미편성(재배정 자산 보호)', !((await p3.locator('body').textContent()) || '').includes('AST-2023-000707'))
  // 유지보수 소진 임박 경계 회귀 — 집행률 89.6%(반올림 90%)는 실집행 기준(89.6%<90%)으로 '정상'이어야 한다(반올림 rate 로 판정하면 '소진 임박' 오분류·예산 통보 큐 오염). CT-2025-015.
  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const maintRow = (await p3.locator('tr', { hasText: '가상화 플랫폼 유지보수' }).first().textContent()) || ''
  ok('유지보수 소진 임박 경계: 89.6%(반올림 90%)는 정상 판정(반올림 오분류 방지)', maintRow.includes('정상') && !maintRow.includes('소진 임박'))
  // 양쪽 정합 — 사용 현황(Shadow SaaS)에서도 Linear 가 인가로 반영되어야 한다(카탈로그↔사용현황 이중 저장소 일치)
  await p3.goto(`${BASE}/discovery/saas`, { waitUntil: 'networkidle' })
  const linearUsage = p3.locator('tr').filter({ hasText: 'Linear' }).first()
  ok('SaaS 인가 요청 승인 → 사용 현황도 인가(카탈로그↔사용현황 정합)', (await linearUsage.count()) > 0 && ((await linearUsage.textContent()) || '').includes('인가'))
  // SaaS 인가 승인 시 검토 접수일(reviewSince) 해제(회귀) — 기존 검토중 카탈로그(CAT-07 FlowTrackr·검토 접수일 2026-08-17)를 인가 요청 승인으로 인가 전환하면 검토 접수일이 지워져 정책 반출에 잔여하면 안 된다(decideSaas 와 동형·교차 정합).
  await p3.goto(`${BASE}/workflow/approvals?sel=APR-2608-141`, { waitUntil: 'networkidle' })
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2608-141' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await p3.waitForTimeout(700)
  const scAfter = Buffer.from(await (await p3.request.get(`${BASE}/api/export/saasCatalog`)).body()).toString('utf8')
  ok('SaaS 인가 승인 → 검토 접수일 해제(정책 반출 잔여 없음)', scAfter.includes('FlowTrackr') && !scAfter.includes('2026-08-17'))
  // EASM 재탐지 후보 이중 계상(회귀) — surfaced 는 이미 s.external 에 편입되므로 candidates 에 다시 더하면 안 된다. 같은 단일 도메인(seekerslab.co.kr) 연속 재탐지:
  //  1회차(staging-api Passive 신규 편입)·2회차(신규 0) 후보 수가 같아야 한다. 두 회차 모두 seekerslab.co.kr 만 선택(재탐지 후 dueIn 이 바뀌어 기본 선택이 달라지므로 명시적으로 단일 선택).
  for (let r = 0; r < 2; r += 1) {
    await p3.goto(`${BASE}/discovery/external`, { waitUntil: 'networkidle' })
    const rc = p3.locator('.card', { has: p3.locator('.tt', { hasText: '재탐지 실행' }) }).first()
    const boxes = rc.locator('tbody input[type="checkbox"]')
    const bn = await boxes.count()
    for (let i = 0; i < bn; i += 1) { const b = boxes.nth(i); if (await b.isChecked()) await b.uncheck() }
    await rc.locator('tr', { has: p3.locator('td', { hasText: 'seekerslab.co.kr' }) }).first().locator('input[type="checkbox"]').check()
    await rc.locator('button', { hasText: /^재탐지 실행$/ }).click()
    await p3.waitForTimeout(800)
  }
  await p3.goto(`${BASE}/discovery/external`, { waitUntil: 'networkidle' })
  const histRows = p3.locator('.card', { has: p3.locator('.tt', { hasText: '재탐지 이력' }) }).first().locator('tbody tr')
  const run2Cand = Number(((await histRows.nth(0).locator('td').nth(5).textContent()) || '').trim() || '-1')
  const run1Cand = Number(((await histRows.nth(1).locator('td').nth(5).textContent()) || '').trim() || '-2')
  ok('EASM 재탐지: surfaced 이중 계상 없음(연속 재탐지 후보 수 동일)', run1Cand > 0 && run1Cand === run2Cand)
  // 스캔 시간대 안전장치 파싱(회귀) — 정책 편집기가 한 자리 시('9:00')를 그대로 저장하면 inWindow(2자리 기대)가 창을 못 읽어 §07 시간대 밖 능동 스캔 안전장치가 조용히 꺼진다. 저장 시 두 자리로 정규화돼야 한다.
  const ctxSP = await browser.newContext(); await ctxSP.addCookies([cookie(ADMIN)]); const pSP = await ctxSP.newPage()
  await pSP.goto(`${BASE}/settings/scan-policy`, { waitUntil: 'networkidle' })
  const spRow = pSP.locator('tr', { has: pSP.locator('td', { hasText: '네트워크 능동 스캔' }) }).first()
  await spRow.locator('button', { hasText: /^정책 편집$/ }).click()
  await pSP.waitForTimeout(200)
  await spRow.locator('input[placeholder="23:00 ~ 05:00"]').fill('9:00 ~ 18:00')
  await spRow.locator('button', { hasText: /^저장$/ }).click()
  await pSP.waitForTimeout(700)
  await pSP.goto(`${BASE}/settings/scan-policy`, { waitUntil: 'networkidle' })
  const spText = (await pSP.locator('tr', { has: pSP.locator('td', { hasText: '네트워크 능동 스캔' }) }).first().textContent()) || ''
  ok('스캔 시간대: 한 자리 시 저장 시 두 자리 정규화(09:00 — 시간대 안전장치 파싱 보장)', spText.includes('09:00 ~ 18:00'))
  await ctxSP.close()
  // 발주 미이행 임계 반올림 회귀 — 발주율 79.6%(반올림 80%)·만료 임박 계약(CT-2026-055)이 위험 큐에서 빠지면 안 된다(실집행 기준 판정). 감가상각 반올림 회귀 — 4.99년 경과 자산은 상각 완료 아닌 99%.
  const ctxPR = await browser.newContext(); await ctxPR.addCookies([cookie(ADMIN)]); const pPR = await ctxPR.newPage()
  await pPR.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  // 발주·검수 이행 현황 카드로 스코프 — 계약명은 상단 계약 표에도 있어 스코프 없이는 발주 판정 없는 행이 잡힌다.
  const procCardPR = pPR.locator('.card', { has: pPR.locator('.tt', { hasText: '발주·검수 이행 현황' }) }).first()
  const procRow = procCardPR.locator('tr', { has: pPR.locator('td', { hasText: '보안장비 도입(회귀)' }) }).first()
  ok('발주 미이행: 79.6%(반올림 80%) 계약도 미이행 위험 판정(반올림 오분류 회귀)', ((await procRow.textContent()) || '').includes('발주 미이행'))
  await pPR.goto(`${BASE}/assets/register?sel=AST-2021-000997`, { waitUntil: 'networkidle' })
  const depBody = (await pPR.textContent('body')) || ''
  ok('감가상각: 99.8%는 상각 완료 아닌 99%(잔존가치 잔여와 모순 방지)', depBody.includes('상각 99%') && !depBody.includes('상각 완료'))
  await ctxPR.close()
  // 부서 지정 공지 검색 스코핑(회귀) — 마케팅팀 대상 공지(NTC-09)가 대상 밖 사용자(김민준·플랫폼개발팀) 전역 검색엔 안 나오고, 관리자 검색엔 나온다(화면·대시보드 스코핑과 정합).
  const ctxSU = await browser.newContext(); await ctxSU.addCookies([cookie(USER)]); const pSU = await ctxSU.newPage()
  const userSearch = await (await pSU.request.get(`${BASE}/api/search?q=zzmktgscope`)).text()
  ok('전역 검색: 부서 지정 공지가 대상 밖 사용자에게 미노출(스코핑 유출 방지)', !userSearch.includes('ZZMKTGSCOPE'))
  // 결재 검색 소유자확인 스코핑(회귀) — 우리 부서로 온 소유자 확인 요청(APR-2607-114·플랫폼개발팀)은 김민준이 응답 대상이라 검색에 나와야 한다(결재함 화면 USER 스코핑과 정합). 기안자가 아니라 검색만 좁아 응답할 건을 못 찾던 공백.
  const ownerCfmSearch = await (await pSU.request.get(`${BASE}/api/search?q=APR-2607-114`)).text()
  ok('전역 검색: 우리 부서 소유자 확인 요청은 응답 대상 사용자에게 노출(결재함 스코핑 정합)', ownerCfmSearch.includes('APR-2607-114'))
  await ctxSU.close()
  const ctxSA = await browser.newContext(); await ctxSA.addCookies([cookie(ADMIN)]); const pSA = await ctxSA.newPage()
  const adminSearch = await (await pSA.request.get(`${BASE}/api/search?q=zzmktgscope`)).text()
  ok('전역 검색: 부서 지정 공지가 관리자에겐 노출(스코핑이지 소실 아님 · 양성 대조)', adminSearch.includes('ZZMKTGSCOPE'))
  await ctxSA.close()
  // 라이선스 컴플라이언스 판정 불변식 — 초과/미사용/적정이 보유·사용 관계와 정합(감사 리스크 플래깅·회수/구매 결재 근거). 비즈니스 임계 계산 회귀 방지.
  {
    await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
    const licTable = p3.locator('table', { has: p3.locator('th', { hasText: /보유.{0,2}사용 대사/ }) }).first()
    const licRows = licTable.locator('tbody tr')
    const ln = await licRows.count()
    let licOk = true, licChecked = 0
    for (let i = 0; i < ln; i++) {
      const tds = await licRows.nth(i).locator('td').allTextContents()
      const held = Number((tds[3] || '').replace(/[,\s]/g, ''))
      const used = Number((tds[4] || '').replace(/[,\s]/g, ''))
      const verdict = (tds[7] || '').trim()
      if (verdict.includes('해지') || !held || Number.isNaN(used)) continue
      licChecked++
      const expected = used > held ? '초과 사용' : (used / held < 0.6 ? '미사용 보유' : '적정')
      if (!verdict.includes(expected)) { licOk = false; console.log(`    [판정 불일치] 보유 ${held}·사용 ${used} → ${verdict} (기대 ${expected})`) }
    }
    console.log(`    [라이선스] 검사 ${licChecked}행`)
    ok('불변식: 라이선스 컴플라이언스 판정 정합(초과·미사용·적정 ↔ 보유·사용)', licChecked > 0 && licOk)
  }
  // 만료 창(60일)이 대시보드·계약 화면에도 일관 반영된다(하드코딩 90 제거)
  await p3.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  ok('운영 정책 다운스트림: 대시보드 만료 임박 라벨 60일', (await p3.textContent('body')).includes('계약·라이선스 60일') && !(await p3.textContent('body')).includes('계약·라이선스 90일'))
  // 대여 반환 독촉 큐는 독촉 액션이 있는 반납·유휴 화면으로 연결된다(라벨과 링크 정합)
  const loanQueueHref = await p3.locator('a', { hasText: '대여 반환 연체' }).first().getAttribute('href')
  ok('대시보드: 대여 반환 독촉 큐 → 반납·유휴(독촉 액션) 연결', loanQueueHref === '/assets/returns')
  // 최근 공지 위젯(Main/Home 공지 요약) — 발행 공지를 필독 우선·최신순으로 노출하고 게시판으로 연결한다
  const noticeCard = p3.locator('.card', { has: p3.locator('*', { hasText: /^최근 공지$/ }) }).first()
  ok('대시보드: 최근 공지 위젯 노출', (await noticeCard.count()) > 0)
  const noticeItems = noticeCard.locator('a[href*="/board/notices?sel="]')
  const firstNoticeText = ((await noticeItems.first().textContent()) || '')
  ok('최근 공지: 필독(고정) 공지가 최상단', firstNoticeText.includes('필독') && firstNoticeText.includes('재물조사'))
  ok('최근 공지: 게시판(공지·QnA) 전체 보기 연결', (await noticeCard.locator('a[href="/board/notices"]').count()) > 0)

  // 부서 대상 공지(§01 공지 targeting) — 전사 공지가 무관한 팀의 필독 확인율까지 희석하던 문제 해소. 대상 부서로 확인율·독촉 분모를 좁힌다.
  //  자산관리팀(시드 2명) 대상 필독 공지를 올리고, 커버리지 분모가 전사(6)가 아니라 대상 부서(2)로 산출되는지 검증한다.
  await p3.goto(`${BASE}/board/notices`, { waitUntil: 'networkidle' })
  await p3.locator('button', { hasText: /^공지 등록$/ }).click()
  await p3.waitForTimeout(200)
  await p3.locator('input[placeholder="공지 제목"]').fill('e2e 자산관리팀 대상 필독 공지')
  await p3.locator('textarea[placeholder="공지 내용"]').fill('자산관리팀 전용 정책 안내 — e2e')
  await p3.locator('select[title*="공지 대상"]').selectOption('자산관리팀')
  await p3.locator('label', { hasText: '상단 고정 (필독)' }).locator('input[type="checkbox"]').check()
  await p3.locator('button', { hasText: /^등록$/ }).click()
  await p3.waitForTimeout(800)
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'e2e 자산관리팀 대상 필독 공지' }) }).first().click()
  await p3.waitForTimeout(400)
  const ntcBody = (await p3.textContent('body')) || ''
  ok('부서 대상 공지: 대상 라벨(자산관리팀) 노출', ntcBody.includes('대상 자산관리팀'))
  ok('부서 대상 공지: 필독 확인율 분모가 대상 부서(2명)로 좁혀짐(전사 6 아님)', /필독 확인 \d+\/2명/.test(ntcBody))
  // 대상 재조정(편집) — 발행 후에도 대상을 바꿀 수 있어야 한다(그동안 편집은 대상을 못 바꿔 삭제·재작성뿐). 자산관리팀 → 전사 재조정 시 분모가 전사(6)로 넓어진다.
  await p3.locator('button', { hasText: /^수정$/ }).first().click()
  await p3.waitForTimeout(200)
  await p3.locator('select[title*="공지 대상"]').selectOption('전사')
  await p3.locator('button', { hasText: /^저장$/ }).click()
  await p3.waitForTimeout(700)
  const ntcBody2 = (await p3.textContent('body')) || ''
  ok('부서 대상 공지 편집: 대상 재조정(자산관리팀 → 전사) 반영 · 확인율 분모 전사(6)로 확대', ntcBody2.includes('대상 전사') && /필독 확인 \d+\/6명/.test(ntcBody2))
  // 예약 발행(미래 publishAt) 필독 공지 — 발행 전엔 확인 집계·미확인자 독촉을 노출하지 않아야 한다(발행 전 제목·존재 조기 노출·조기 독촉 방지).
  await p3.locator('button', { hasText: /^공지 등록$/ }).click()
  await p3.waitForTimeout(200)
  await p3.locator('input[placeholder="공지 제목"]').fill('e2e 예약 발행 필독 공지')
  await p3.locator('textarea[placeholder="공지 내용"]').fill('발행 예정 공지 — e2e')
  await p3.locator('label', { hasText: '상단 고정 (필독)' }).locator('input[type="checkbox"]').check()
  await p3.locator('input[type="date"]').first().fill('2027-01-15')
  await p3.waitForTimeout(150)
  await p3.locator('button', { hasText: /^예약 등록$/ }).click()
  await p3.waitForTimeout(800)
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'e2e 예약 발행 필독 공지' }) }).first().click()
  await p3.waitForTimeout(400)
  const schedNtcBody = (await p3.textContent('body')) || ''
  ok('예약 발행 공지: 발행 전 확인 집계·미확인자 독촉 미노출(조기 노출/독촉 방지)', schedNtcBody.includes('발행 후 확인 집계') && !schedNtcBody.includes('안내 발송'))

  // 필독 공지 내용 변경 → 읽음 확인 초기화 — 바뀐 내용을 다시 확인받아야 커버리지가 무결하다(대상만 바꾼 편집과 달리 본문 편집은 이전 확인을 무효화·재확인 필요). 그동안 편집은 이전 확인을 그대로 둬 '바뀐 내용을 확인했다'는 허위 커버리지가 남았다.
  await p3.goto(`${BASE}/board/notices`, { waitUntil: 'networkidle' })
  await p3.locator('button', { hasText: /^공지 등록$/ }).click()
  await p3.waitForTimeout(200)
  await p3.locator('input[placeholder="공지 제목"]').fill('e2e 내용변경 재확인 필독 공지')
  await p3.locator('textarea[placeholder="공지 내용"]').fill('원본 정책 내용 — e2e')
  await p3.locator('label', { hasText: '상단 고정 (필독)' }).locator('input[type="checkbox"]').check()
  await p3.locator('button', { hasText: /^등록$/ }).click()
  await p3.waitForTimeout(800)
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'e2e 내용변경 재확인 필독 공지' }) }).first().click()
  await p3.waitForTimeout(400)
  await p3.locator('button', { hasText: /^읽음 확인$/ }).first().click()
  await p3.waitForTimeout(600)
  ok('필독 공지 읽음 확인: 확인 후 확인함 표시', ((await p3.textContent('body')) || '').includes('읽음 확인함'))
  await p3.locator('button', { hasText: /^수정$/ }).first().click()
  await p3.waitForTimeout(200)
  await p3.locator('textarea[placeholder="공지 내용"]').fill('개정 정책 내용 — 재확인 필요 e2e')
  await p3.locator('button', { hasText: /^저장$/ }).click()
  await p3.waitForTimeout(700)
  const reackBody = (await p3.textContent('body')) || ''
  ok('필독 공지 내용 변경 → 읽음 확인 초기화(확인함 해제·재확인 버튼 복귀)', !reackBody.includes('읽음 확인함') && (await p3.locator('button', { hasText: /^읽음 확인$/ }).count()) > 0)

  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const cHtml = await p3.content()
  ok('운영 정책 다운스트림: 계약 화면 만료 임박 창 60일', cHtml.includes('만료 60일 이내') && !cHtml.includes('만료 90일 이내'))
  // 소유자 확인 일괄 요청 — 스캔이 정체 불명 장비를 다수 올릴 때 편입과 같은 선택에서 소유 부서를 한 번에 조회한다(편입 일괄 요청과 대칭·편입 전 조사 트랙). 미등록·미처리분 0035(EC2)·0044(OAuth) 선택.
  await p3.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  await p3.locator('input[aria-label="DSC-2607-0035 편입 선택"]').check()
  await p3.locator('input[aria-label="DSC-2607-0044 편입 선택"]').check()
  await p3.locator('button', { hasText: /선택 일괄 소유자 확인/ }).click()
  await p3.waitForTimeout(800)
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const ocApr = (await p3.locator('body').textContent()) || ''
  ok('소유자 확인 일괄 요청: 선택 2건 소유자 확인 결재 생성(후보 부서 확인)', ocApr.includes('DSC-2607-0035') && ocApr.includes('DSC-2607-0044'))
  // 발견 자산 편입 → CMDB 대사 종결(핵심 Discovery 루프) — 편입 결재 승인 시 대장 자산이 생성되고, 발견 레코드가
  //  '등록·일치'로 전환되며 matchedAssetNo 로 새 자산과 연결된다. 그 전엔 편입해도 상태가 '미등록'으로 남아 대사가 안 닫혔다.
  await p3.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  await p3.locator('input[aria-label="DSC-2607-0042 편입 선택"]').check()
  await p3.locator('button', { hasText: /선택 일괄 편입 요청/ }).click()
  await p3.waitForTimeout(800)
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const encApr = () => p3.locator('tr', { has: p3.locator('td', { hasText: 'DSC-2607-0042' }) }).first()
  ok('발견 편입: 편입 결재 생성됨', (await encApr().count()) > 0)
  // 자산 신청 결재선(신청자→부서장→자산담당)을 ADMIN 오버라이드로 승인 완료까지 진행
  for (let i = 0; i < 5; i++) {
    if (!(((await encApr().textContent().catch(() => '')) || '').includes('대기'))) break
    const btn = encApr().locator('button', { hasText: /^승인$/ }).first()
    if (!(await btn.count())) break
    await btn.click()
    await p3.waitForTimeout(600)
  }
  ok('발견 편입: 결재 승인 완료(대기 해제)', !(((await encApr().textContent().catch(() => '')) || '').includes('대기')))
  await p3.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  const enc042 = p3.locator('tr', { has: p3.locator('td', { hasText: 'DSC-2607-0042' }) }).first()
  const encRow = (await enc042.textContent()) || ''
  await enc042.locator('td', { hasText: 'nas-dev-team' }).click() // 상세 패널 열기(대사 자산 링크 확인)
  await p3.waitForTimeout(250)
  const encBody = (await p3.locator('body').textContent()) || ''
  ok('발견 편입 → 대사 종결: 발견 레코드 등록·일치·편입완료 + 대사 자산(matchedAssetNo) 링크', encRow.includes('등록·일치') && encRow.includes('편입완료') && encBody.includes('대사 자산') && /AST-\d{4}-\d{6}/.test(encBody))
  // 등록·불일치(이미 대장에 매칭된 자산)는 편입 불가 — 편입하면 대장에 중복 자산이 생긴다. 불일치는 재물조사 차이 조정으로 대사.
  await p3.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  const mis029 = p3.locator('tr', { has: p3.locator('td', { hasText: 'DSC-2607-0029' }) }).first()
  ok('발견 대사: 등록·불일치 자산은 일괄 편입 체크박스 미노출(중복 편입 방지)', (await mis029.locator('input[type="checkbox"]').count()) === 0)
  await mis029.locator('td', { hasText: 'DESKTOP-KJM45' }).click()
  await p3.waitForTimeout(250)
  const misBody = (await p3.locator('body').textContent()) || ''
  ok('발견 대사: 등록·불일치 상세는 불일치·대사 자산 정보만(편입 요청 버튼 없음)', misBody.includes('위치 상이') && misBody.includes('AST-2025-000512') && !misBody.includes('편입 요청 (결재)'))
  // CMDB 대사 확인 = 대장 실측 보정(로67) — 위치 불일치는 실측값(판교 사무소)이 구조화돼 있어 대사 확인이 곧 대장 보정이다.
  //  correctField 는 빈 필드만 채우고 기존 오값 정정은 이동·불출(실물 이동)뿐이라, 실물은 그대로인데 대장값만 틀린 데이터 불일치는 보정 경로가 없었다.
  ok('발견 대사(로67): 등록·불일치에 실측값 안내·실측 보정 버튼 노출', misBody.includes('부산 지사 3F') && misBody.includes('대사 확인 — 실측 보정·종결'))
  await p3.goto(`${BASE}/assets/register?q=AST-2025-000512`, { waitUntil: 'networkidle' })
  ok('발견 대사(로67): 보정 전 대장 위치 본사 8F(불일치 전제)', ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'AST-2025-000512' }) }).first().textContent()) || '').includes('본사 8F'))
  await p3.goto(`${BASE}/discovery/found?sel=DSC-2607-0029`, { waitUntil: 'networkidle' })
  await p3.locator('button', { hasText: '대사 확인 — 실측 보정·종결' }).first().click()
  await p3.waitForTimeout(800)
  await p3.goto(`${BASE}/discovery/found?sel=DSC-2607-0029`, { waitUntil: 'networkidle' })
  const mis029row = ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'DSC-2607-0029' }) }).first().textContent()) || '')
  ok('발견 대사 확인: 등록·불일치 → 등록·일치 종결', mis029row.includes('등록·일치'))
  await p3.goto(`${BASE}/assets/register?q=AST-2025-000512`, { waitUntil: 'networkidle' })
  ok('발견 대사 실측 보정(로67): 대사 확인 → 대장 위치 부산 지사 3F 반영(본사 8F 소거)', ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'AST-2025-000512' }) }).first().textContent()) || '').includes('부산 지사 3F'))
  // 라이선스 조치 품의(kind=자산 신청·refId=LIC-)는 물리 자산 불출 대상이 아니다 — 라이선스 최적화 제안(INS-2607-15) 승인 →
  //  LIC-002 추가 구매 결재 상신 → 승인 후, 불출 대기 큐(movement·returns·대시보드 issueDue, 모두 !fulfilled 기준)에 새면 안 된다.
  await p3.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const licProp = p3.locator('.card', { hasText: 'AI 제안 — 판정 대기' }).locator('tr', { has: p3.locator('td', { hasText: 'INS-2607-15' }) }).first()
  await licProp.locator('button', { hasText: /^승인$/ }).first().click()
  await p3.waitForTimeout(800)
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const licApr = () => p3.locator('tr', { has: p3.locator('td', { hasText: '추가 구매 품의' }) }).first()
  ok('라이선스 조치 품의: 제안 승인 → 추가 구매 결재 상신', (await licApr().count()) > 0)
  for (let i = 0; i < 5; i++) {
    if (!(((await licApr().textContent().catch(() => '')) || '').includes('대기'))) break
    const b = licApr().locator('button', { hasText: /^승인$/ }).first()
    if (!(await b.count())) break
    await b.click(); await p3.waitForTimeout(600)
  }
  ok('라이선스 조치 품의: 결재 승인 완료(대기 해제)', !(((await licApr().textContent().catch(() => '')) || '').includes('대기')))
  await p3.goto(`${BASE}/assets/movement`, { waitUntil: 'networkidle' })
  const issueCard = (await p3.locator('.card', { hasText: '불출 대기' }).first().textContent()) || ''
  ok('라이선스 조치 품의: 승인 후 불출 대기 큐 미노출(물리 불출 아님)', !issueCard.includes('추가 구매 품의'))
  // 사용자 장애 신고 다운스트림 — ctxU 에서 신고된 자산(AST-2024-000015)이 반납 화면 '수리 대기'에 떠서
  //  자산담당이 업체 배정·수리 완료/불가를 처리한다(사용자 발화형 진입 → 기존 수리 흐름 재사용).
  await p3.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const repairCard = (await p3.locator('.card', { hasText: '수리 대기' }).first().textContent()) || ''
  ok('장애 신고 다운스트림: 신고 자산이 수리 대기 큐에 편성 + 신고 증상 노출(자산담당 처리 대상)', repairCard.includes('AST-2024-000015') && repairCard.includes('수리 사유') && repairCard.includes('전원 불량'))
  // 수리 완료 → 소유자를 유지한 채 들어온 장애 신고분은 원 소유자(김민준)에게 반환(사용중 복귀). 반납 접수분(소유자 비움)이 유휴 풀로 가는 것과 구분.
  const repairRow = p3.locator('tr', { has: p3.locator('td', { hasText: 'AST-2024-000015' }) }).first()
  await repairRow.locator('button', { hasText: /^수리 완료$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/assets/register?sel=AST-2024-000015`, { waitUntil: 'networkidle' })
  const repairedRow = ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'AST-2024-000015' }) }).first().textContent()) || '')
  ok('장애 신고 수리 완료: 원 소유자 반환(사용중·김민준) — 유휴 풀 아님', repairedRow.includes('사용중') && repairedRow.includes('김민준'))
  // 수리 결과 통보(루프 폐쇄) — 소유자 유지 자산의 수리 완료/불가 결과가 신고자·소유자(김민준)에게 통보되고 발송 이력에 남는다.
  await p3.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const notifBody = (await p3.locator('body').textContent()) || ''
  ok('장애 신고 수리 완료: 신고자(김민준)에게 수리 결과 통보(발송 이력 적재)', notifBody.includes('수리 결과') && notifBody.includes('사용 재개 (반환 완료)') && notifBody.includes('김민준'))
  // QnA 답변 독촉(루프 58) — SLA 경과 미답변 문의(시드 QNA-01/02, 미답변)의 담당 팀에 답변 처리를 재촉. 결재 지연 독촉의 QnA 판. 당일 중복 차단.
  await p3.goto(`${BASE}/board/qna`, { waitUntil: 'networkidle' })
  const qnaRemindBtn = p3.locator('button', { hasText: /^답변 독촉 발송 \(\d+\)$/ })
  ok('QnA 답변 독촉: SLA 경과 미답변 있으면 담당자에 독촉 버튼 노출', (await qnaRemindBtn.count()) > 0)
  await qnaRemindBtn.click()
  await p3.waitForTimeout(700)
  ok('QnA 답변 독촉: 발송 성공(담당 팀 답변 요청·발송 이력)', ((await p3.locator('body').textContent()) || '').includes('QnA 답변 독촉') && ((await p3.locator('body').textContent()) || '').includes('발송'))
  // 해결 확인된 QnA 답변이 바뀌면 해결 확인 해제(재확인) — 작성자가 '바뀌기 전 답변'으로 확인한 것이 개정 답변에 허위로 남지 않게(필독 공지 내용 변경 시 읽음 확인 초기화와 동형). ADMIN 이 문의·답변·해결 확인·재답변을 한 컨텍스트에서 검증(해결 확인 버튼은 작성자·미해결에만 노출되므로 재노출이 곧 해제 증거).
  await p3.goto(`${BASE}/board/qna`, { waitUntil: 'networkidle' })
  await p3.locator('button', { hasText: /^질문하기$/ }).click()
  await p3.waitForTimeout(150)
  await p3.locator('input[placeholder="문의 제목"]').fill('e2e 해결확인 재검증 문의')
  await p3.locator('textarea[placeholder="문의 내용을 입력하세요"]').fill('원본 질문 — e2e')
  await p3.locator('button', { hasText: /^등록$/ }).click()
  await p3.waitForTimeout(700)
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'e2e 해결확인 재검증 문의' }) }).first().click()
  await p3.waitForTimeout(300)
  await p3.locator('textarea[placeholder="답변 내용을 입력하세요"]').fill('원본 답변 — e2e')
  await p3.locator('button', { hasText: /^답변 등록$/ }).click()
  await p3.waitForTimeout(700)
  await p3.locator('button', { hasText: /^해결 확인$/ }).click()
  await p3.waitForTimeout(600)
  ok('QnA 해결 확인(작성자=ADMIN): 해결됨 표시', ((await p3.textContent('body')) || '').includes('해결됨'))
  await p3.locator('button', { hasText: /^답변 수정$/ }).click()
  await p3.waitForTimeout(150)
  await p3.locator('textarea').first().fill('개정 답변 — 재확인 필요 e2e')
  await p3.locator('button', { hasText: /^저장$/ }).click()
  await p3.waitForTimeout(700)
  ok('QnA 답변 변경 → 해결 확인 해제(작성자 재확인 필요·해결 확인 버튼 복귀)', (await p3.locator('button', { hasText: /^해결 확인$/ }).count()) > 0)
  // 오프보딩 요약 — 사용자 화면에서 한 사람(김민준)의 회수·재배정 대상(사용중 보유·라이선스 좌석·상신 결재)을 한눈에. 자산·좌석·대여·라이선스가 흩어져 있던 것을 모은다.
  await p3.goto(`${BASE}/settings/users`, { waitUntil: 'networkidle' })
  const userRow = p3.locator('tr', { has: p3.locator('td', { hasText: '김민준' }) }).first()
  const obToggle = userRow.locator('button', { hasText: /요약/ })
  ok('오프보딩 요약: 자산·좌석 보유 사용자에 요약 토글 노출(김민준)', (await obToggle.count()) > 0)
  await obToggle.click()
  await p3.waitForTimeout(300)
  const obBody = (await p3.locator('body').textContent()) || ''
  ok('오프보딩 요약: 배정 라이선스 좌석 집계·표기(AutoCAD 좌석)', obBody.includes('오프보딩 요약 — 김민준') && obBody.includes('배정 라이선스 좌석') && obBody.includes('AutoCAD'))
  // 오프보딩 명세서 인쇄 링크 — 확장 요약에서 인수인계 체크리스트(회수·재배정 대상)를 한 장 인쇄 산출물로 발급
  ok('오프보딩 요약: 명세서 인쇄 링크(인수인계 체크리스트)', obBody.includes('명세서 인쇄') && (await p3.locator('a[href*="/api/offboard-sheet/"]').count()) > 0)

  // 대여 결재선 거버넌스 편입(AL-09) — 대여(자산 반출) 상신은 결재선 매트릭스에 행이 없어 레거시 폴백(ASSET_MGR)으로만 라우팅되고
  //  거버넌스 화면·리포트에서 보이지 않았다. 유일하게 매트릭스에서 누락된 상신 종류. 매트릭스 행 추가로 편입·편집 가능함을 검증한다.
  const loanLineRow = p3.locator('tr', { has: p3.locator('td', { hasText: '수명주기 · 대여' }) }).first()
  ok('결재선 매트릭스: 대여 결재선 행 노출(레거시 폴백 아님)', (await loanLineRow.count()) > 0)
  const loanLineText = (await loanLineRow.textContent()) || ''
  ok('결재선 매트릭스: 대여 결재선 단계(신청자 → 자산담당)', loanLineText.includes('신청자') && loanLineText.includes('자산담당'))
  ok('결재선 매트릭스: 대여는 선택 결재(필수 ↔ 선택 전환 가능 · 잠금 아님)', (await loanLineRow.locator('button', { hasText: /^선택$/ }).count()) > 0)

  // 공통코드 참조 무결성 가드 — 살아있는 레코드가 참조하는 코드는 미사용 전환 차단(드롭다운 사각지대 방지). 그동안 toggleCodeValue 는
  //  참조 검사 없이 active 를 뒤집어, 사용 중 LOCATION 을 미사용화하면 이동·실사 드롭다운에서 사라졌다(구축_요약 위치 코드 누락 버그류).
  await p3.goto(`${BASE}/settings/codes`, { waitUntil: 'networkidle' })
  await p3.locator('button', { hasText: 'LOCATION' }).click()
  await p3.waitForTimeout(300)
  const locUsedRow = p3.locator('tr', { has: p3.locator('td', { hasText: '본사 3F 자산창고' }) }).first()
  ok('공통코드: 참조 수 표기(사용 중 N건)', ((await locUsedRow.textContent()) || '').includes('건 사용 중'))
  await locUsedRow.locator('button', { hasText: /^미사용$/ }).click()
  await p3.waitForTimeout(600)
  ok('공통코드: 참조 있는 코드 미사용 전환 차단(가드)', ((await p3.textContent('body')) || '').includes('사용 중인 코드는 미사용 전환할 수 없습니다'))
  ok('공통코드: 차단 후 코드 사용 상태 유지(미사용 버튼 잔존)', (await locUsedRow.locator('button', { hasText: /^미사용$/ }).count()) > 0)
  // rename 가드 — 참조는 label 로 저장되므로, 사용 중 코드 명칭을 바꾸면 옛 label 참조가 고아가 되고 새 label 은 참조 0 으로
  //  집계돼 미사용 가드까지 우회된다. rename 도 toggle 과 동일하게 '이관 후 변경'으로 잠기는지 검증(그동안 rename 은 무가드였다).
  //  행 앵커는 코드값(HQ_3F_WH)으로 잡는다 — 수정 진입 시 label td 텍스트가 input 으로 바뀌어 사라지므로 label 텍스트로는 재조회 실패.
  const locCodeRow = p3.locator('tr', { has: p3.locator('td.code', { hasText: 'HQ_3F_WH' }) }).first()
  await locCodeRow.locator('button', { hasText: /^수정$/ }).click()
  await p3.waitForTimeout(250)
  await locCodeRow.locator('input').fill('본사 3층 창고')
  await locCodeRow.locator('button', { hasText: /^저장$/ }).click()
  await p3.waitForTimeout(600)
  ok('공통코드: 참조 있는 코드 명칭 변경 차단(rename 도 미사용과 동일 가드)', ((await p3.textContent('body')) || '').includes('사용 중인 코드는 명칭을 바꿀 수 없습니다'))
  await locCodeRow.locator('button', { hasText: /^취소$/ }).click()
  await p3.waitForTimeout(200)
  ok('공통코드: 차단 후 원 명칭 유지(변경 미반영)', ((await locCodeRow.textContent()) || '').includes('본사 3F 자산창고'))
  // 명칭 유일성 — 참조가 label 로 저장되므로 같은 그룹에 중복 명칭 금지(add·rename 공통 · label 이 사실상 참조 키). 기존 명칭으로 신규 추가 차단.
  await p3.locator('input[placeholder="코드 (예: IDC-C-01)"]').fill('HQ_DUP_T')
  await p3.locator('input[placeholder="명칭"]').fill('본사 3F 자산창고')
  await p3.locator('button', { hasText: /^추가$/ }).click()
  await p3.waitForTimeout(600)
  ok('공통코드: 중복 명칭 신규 추가 차단(label 유일성 가드)', ((await p3.textContent('body')) || '').includes('이미 같은 명칭의 코드가 있습니다'))
  const locFreeRow = p3.locator('tr', { has: p3.locator('td', { hasText: '본사 9F' }) }).first()
  await locFreeRow.locator('button', { hasText: /^미사용$/ }).click()
  await p3.waitForTimeout(600)
  ok('공통코드: 참조 없는 코드는 미사용 전환 허용(사용 버튼으로 전환)', (await locFreeRow.locator('button', { hasText: /^사용$/ }).count()) > 0)

  // Shadow SaaS 차단 → 보안운영팀 프록시·DNS 차단 집행 요청(로37 판정 단일화) — 그동안 이 집행 요청은 설정 카탈로그 화면(decideSaas)에서만
  //  나가고 Shadow SaaS 화면 차단(classifyShadowSaas)은 카탈로그 상태만 바꿔, 문서가 광고한 '두 화면 동일 카탈로그' 대칭이 깨져 있었다.
  //  두 진입점을 공통 decideSaasStatus 로 단일화한 것을 검증한다. 상태 변경이라 p3 마지막에 수행(ChatGPT 검토중→차단).
  await p3.goto(`${BASE}/discovery/saas`, { waitUntil: 'networkidle' })
  const chatgptRow = p3.locator('tr', { has: p3.locator('td', { hasText: 'ChatGPT' }) }).first()
  await chatgptRow.locator('button', { hasText: /^차단$/ }).click()
  await p3.waitForTimeout(800)
  ok('Shadow SaaS 차단 → 프록시·DNS 차단 집행 요청 메시지(설정 화면과 동일 집행)', ((await p3.textContent('body')) || '').includes('프록시·DNS 차단 집행 요청'))
  await p3.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('Shadow SaaS 차단 → 보안운영팀 차단 집행 통보 발송 이력(단일화 반영)', ((await p3.textContent('body')) || '').includes('ChatGPT') && ((await p3.textContent('body')) || '').includes('프록시·DNS 차단 집행'))

  // 중복 SaaS 통합 정리(로69) — 개발 분류: 인가 표준 GitHub + 미인가 중복 GitLab. §05 기능05 '통합 후보'는 화면·리포트 표시만 있고 조치가 없었다. 통합 정리 요청 → GitLab 을 표준(GitHub)으로 통합·차단하면 차단 서비스가 통합 후보에서 빠져 개발 분류가 사라진다(협업=Notion·Miro 는 표준 없어 버튼 없이 남음). 조치가 없으면 개발 분류·버튼이 그대로라 실패.
  await p3.goto(`${BASE}/discovery/saas`, { waitUntil: 'networkidle' })
  const consCard = p3.locator('.card', { has: p3.locator('text=중복 기능 SaaS 통합 후보') })
  const devRow = consCard.locator('tr', { has: p3.locator('td', { hasText: 'GitLab' }) })
  ok('중복 SaaS 통합 정리(로69): 개발 분류가 통합 후보에 노출(GitHub 표준·GitLab 미인가·정리 버튼)', (await devRow.count()) === 1 && (await devRow.locator('button', { hasText: '통합 정리 요청' }).count()) === 1)
  await devRow.locator('button', { hasText: '통합 정리 요청' }).first().click()
  await p3.waitForTimeout(900)
  ok('중복 SaaS 통합 정리(로69): GitHub 표준 통합·GitLab 차단 집행 메시지', ((await p3.textContent('body')) || '').includes('GitHub 표준') && ((await p3.textContent('body')) || '').includes('GitLab'))
  await p3.goto(`${BASE}/discovery/saas`, { waitUntil: 'networkidle' })
  const consCard2 = p3.locator('.card', { has: p3.locator('text=중복 기능 SaaS 통합 후보') })
  ok('중복 SaaS 통합 정리(로69): 정리 후 개발 분류가 통합 후보에서 빠짐(GitLab 차단 제외)', (await consCard2.locator('tr', { has: p3.locator('td', { hasText: 'GitLab' }) }).count()) === 0)

  // 데이터 일괄 소거 — EOL 배치 폐기에서 소거 대기 건을 같은 소거 방식·처분으로 한 번에 처리(대상 선정 일괄 상신과 대칭). 시드 소거 대기 DSP-03(AST-2020-000771) 선택 → 일괄 소거·처분(건별 확인서).
  await p3.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  await p3.locator('input[aria-label="AST-2020-000771 일괄 소거 선택"]').check()
  await p3.locator('button', { hasText: /^일괄 소거·처분 \(1\)$/ }).click()
  await p3.waitForTimeout(800)
  ok('데이터 일괄 소거: 선택 소거 대기 건 일괄 소거·처분 완료(건별 확인서)', ((await p3.locator('body').textContent()) || '').includes('건 소거·처분 완료'))
  await p3.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  ok('데이터 일괄 소거 → 폐기완료·소거 확인서 발급', ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'DSP-03' }) }).first().textContent()) || '').includes('소거 확인서'))

  // 폐기 대상 선정 보유-상태 가드 — 사용중·대여중 등 보유자가 쥔 자산은 회수·반환 전엔 폐기 선정 불가(실물 없이 폐기 방지 · 대여 가드(#149)의 반대편). 사용중 보증 만료 후보 AST-2022-000512 선정 시도 → 건너뜀·사용중 유지.
  await p3.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  await p3.locator('input[aria-label="AST-2022-000512 선택"]').check()
  await p3.locator('button', { hasText: /선택 일괄 대상 선정/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/assets/register?sel=AST-2022-000512`, { waitUntil: 'networkidle' })
  ok('폐기 대상 선정 보유-상태 가드: 사용중 자산 폐기 선정 제외(실물 회수 전 폐기 방지)', ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'AST-2022-000512' }) }).first().textContent()) || '').includes('사용중'))

  // 결재 일괄 반려 — 중복·무효·예산 동결 등 한꺼번에 반려할 대기 결재를 같은 사유로 일괄 반려(일괄 승인의 반대편, 반려는 사유 필수). ADMIN 이 결재 가능한 자산 신청 APR-2607-120·121 선택 → 일괄 반려.
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await p3.locator('input[aria-label="APR-2607-120 일괄 승인 선택"]').check()
  await p3.locator('input[aria-label="APR-2607-121 일괄 승인 선택"]').check()
  await p3.locator('input[placeholder="일괄 반려 사유"]').fill('중복 신청 정리 — e2e')
  await p3.locator('button', { hasText: /^선택 일괄 반려 \(2\)$/ }).click()
  await p3.waitForTimeout(800)
  ok('결재 일괄 반려: 선택 2건 일괄 반려(사유 공유·전체 반려 종결)', ((await p3.locator('body').textContent()) || '').includes('2건 반려 처리 완료'))
  // 반려 종결 확인 — 재조회 시 두 건이 더는 내 결재 차례(대기)에 없다(반려로 종결)
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  ok('결재 일괄 반려 → 대기 큐에서 종결(승인 선택 체크박스 소거)', (await p3.locator('input[aria-label="APR-2607-120 일괄 승인 선택"]').count()) === 0)

  // 정기 리포트 스케줄 신규 등록(신규 역량) — 주기는 월간이나 시드 스케줄이 없던 '감가상각 명세'를 자동 생성 대상으로 편입.
  //  그동안 toggleSchedule 은 기존 스케줄만 켜고 끌 수 있어(없으면 '스케줄을 찾을 수 없습니다') 신규 정기 리포트를 올릴 경로가 없었다.
  await p3.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  const depRow = p3.locator('table.tbl tr', { hasText: '감가상각 명세' }).first()
  const regBtn = depRow.locator('button', { hasText: /^스케줄 등록$/ })
  ok('리포트 스케줄: 스케줄 미등록 정기 리포트(감가상각 명세)에 스케줄 등록 버튼 노출', (await regBtn.count()) > 0)
  await regBtn.click()
  await p3.waitForTimeout(800)
  ok('리포트 스케줄 등록 → 자동 생성 편입(매월 1일 09:00 · 스케줄 카드 가동 행으로 전환)', ((await p3.locator('body').textContent()) || '').includes('감가상각 명세 스케줄 등록'))
  // 재조회 — 등록 후 감가상각 명세 행이 스케줄러(수정/중지 버튼)로 이동하고 '스케줄 등록' 버튼은 사라진다(멱등: 재등록 불가)
  await p3.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  ok('리포트 스케줄 등록 → 스케줄러 행 전환(수정/중지 노출·재등록 버튼 소거)', (await p3.locator('table.tbl tr', { hasText: '감가상각 명세' }).first().locator('button', { hasText: /^스케줄 등록$/ }).count()) === 0 && (await p3.locator('table.tbl tr', { hasText: '감가상각 명세' }).first().locator('button', { hasText: /^중지$/ }).count()) > 0)

  // 리포트 삭제 시 결재 첨부 참조 정리(참조 무결성) — 첨부된 리포트를 삭제하면 결재의 근거 리포트(reportRefs)도 함께 지워 죽은 링크(404)를 막는다.
  //  그동안 deleteReport 는 s.reports 에서만 지우고 ap.reportRefs 는 그대로 둬, 삭제된 리포트가 결재 '근거 리포트'로 남았다(404).
  await p3.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await p3.locator('.card', { hasText: '리포트 유형' }).locator('tr', { hasText: '재물조사 결과 요약' }).locator('button', { hasText: /^생성$/ }).click()
  await p3.waitForTimeout(1200)
  // 생성 직후 최신 리포트가 자동으로 펼쳐진다(ReportsView: 선택 없으면 최신 펼침) — 펼치기 클릭 불필요, 첨부 UI 가 바로 보인다.
  //  리포트 ID 는 열린 패널의 '결재 첨부용 문서'(md 다운로드) 링크에서 추출(견고).
  const drMd = (await p3.locator('a', { hasText: '결재 첨부용 문서' }).first().getAttribute('href')) || ''
  const drRepId = (drMd.match(/reports\/([^?]+)/) || [])[1] || ''
  const drSel = p3.locator('select', { has: p3.locator('option', { hasText: /대기 결재 선택|대기 중 결재 없음/ }) })
  const drOpts = drSel.locator('option')
  const drAprId = ((await drOpts.count()) > 1) ? ((await drOpts.nth(1).getAttribute('value')) || '') : ''
  ok('리포트 삭제-참조정리: 생성 리포트 ID·대기 결재 확보', drRepId.length > 0 && drAprId.length > 0)
  await drSel.selectOption(drAprId)
  await p3.locator('button', { hasText: /^첨부$/ }).click()
  await p3.waitForTimeout(600)
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  ok('리포트 삭제-참조정리: 첨부 직후 결재에 근거 리포트 노출', ((await p3.locator('tr', { hasText: drAprId }).first().textContent()) || '').includes(drRepId))
  await p3.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await p3.locator('tbody tr', { hasText: drRepId }).first().locator('button', { hasText: /^삭제$/ }).click()
  await p3.waitForTimeout(800)
  await p3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  ok('리포트 삭제 → 결재 근거 리포트 참조 정리(죽은 링크 방지·참조 무결성)', !((await p3.locator('tr', { hasText: drAprId }).first().textContent()) || '').includes(drRepId))
  await ctx3.close()

  // ── 자산담당: 장기 유휴 → 폐기 검토 브리지(검출→조치 루프). 상태를 바꾸므로 마지막에 수행. ──
  const ctx4 = await browser.newContext()
  await ctx4.addCookies([cookie(ASSET)])
  const p4 = await ctx4.newPage()
  p4.on('pageerror', (e) => { fail++; console.log('  ✗ PAGEERROR: ' + (e.message || e)) })
  // 직접 대여 처리 → 대여자 통보(불출 완료 통보의 대여판, 로35) — 자산담당이 유휴 재고를 반환 기한과 함께 대여하면 대여자에게 통보된다.
  //  AST-2019-000218 은 p3 폐기 반려로 유휴 복원된 자산(장기 유휴 폐기 검토 후보 000704 는 건드리지 않음).
  await p4.goto(`${BASE}/assets/register?sel=AST-2019-000218`, { waitUntil: 'networkidle' })
  await p4.locator('button', { hasText: /^대여 처리 \(반출\)$/ }).click()
  await p4.waitForTimeout(200)
  await p4.locator('input[placeholder="대여자 (성명)"]').fill('e2e 대여자')
  await p4.locator('input[placeholder="부서"]').fill('영업2팀')
  await p4.locator('input[type="date"]').first().fill('2027-06-30')
  await p4.locator('button', { hasText: /^대여 확정$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('직접 대여 처리 → 대여자 통보(반환 기한 안내·발송 이력 적재)', ((await p4.textContent('body')) || '').includes('자산 대여') && ((await p4.textContent('body')) || '').includes('AST-2019-000218') && ((await p4.textContent('body')) || '').includes('e2e 대여자'))
  await p4.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  // 대여 반환 상태 점검(로35) — 손상된 반환분은 유휴가 아니라 수리중으로 편성(손상 자산 재대여 방지). 반납 점검(로10·26)과 동일. AST-2023-000450(한지민 대여)을 수리 필요로 반환.
  const loanRow = p4.locator('tr', { has: p4.locator('td', { hasText: 'AST-2023-000450' }) }).first()
  ok('대여 반환: 대여 자산 행에 상태 점검 선택 노출', (await loanRow.locator('select').count()) > 0)
  await loanRow.locator('select').first().selectOption('수리 필요')
  await loanRow.locator('button', { hasText: /^반환 접수$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}/assets/register?sel=AST-2023-000450`, { waitUntil: 'networkidle' })
  ok('대여 반환(수리 필요) → 수리중 편성(유휴 아님·손상 자산 재대여 방지)', ((await p4.textContent('body')) || '').includes('수리중'))
  // 대여자 통보(반납 접수 통보의 대여판) — 파손 반환 결과를 대여자(한지민)에게 통지, 발송 이력 적재. receiveReturn 과 정합.
  await p4.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const loanNotif = (await p4.textContent('body')) || ''
  ok('대여 반환 → 대여자(한지민) 결과 통보(발송 이력 적재)', loanNotif.includes('대여 반환 접수 완료') && loanNotif.includes('AST-2023-000450') && loanNotif.includes('한지민'))
  // 대여 반환 좌석 회수(회귀 · 이탈 5번째 경로) — 대여 자산도 보유자를 떠나는 이탈이므로 좌석을 회수해야 한다(로56). AST-2024-000995(마케팅팀 대여·M365 좌석) 정상 반환 → 좌석 회수.
  await p4.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const loanRow995 = p4.locator('tr', { has: p4.locator('td', { hasText: 'AST-2024-000995' }) }).first()
  await loanRow995.locator('select').first().selectOption('정상')
  await loanRow995.locator('button', { hasText: /^반환 접수$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}/assets/register?sel=AST-2024-000995`, { waitUntil: 'networkidle' })
  ok('대여 반환 → 라이선스 좌석 자동 회수(좌석 누수 방지)', ((await p4.textContent('body')) || '').includes('대여 반환 접수 · 상태 점검 정상 (대여자 조민재) · 라이선스 좌석 1석 회수'))
  // 재물조사 미확인 유휴 편성 좌석 회수(회귀) + 스테일 재확인 방어 — 미확인 조정 승인은 plain 사용중 자산(994)을 유휴로 편성(좌석 회수)하되,
  //  조정 상신 후 재배정(수령 대기)된 자산(706)은 스테일이라 유휴로 강제하지 않고 미적용해야 한다(재배정 무효화·좌석 오회수 방지). APR-2608-131 이 DIF-05·DIF-06 을 함께 처리.
  const ctxMU = await browser.newContext(); await ctxMU.addCookies([cookie(ADMIN)]); const pMU = await ctxMU.newPage()
  // DIF-06 대상 706 을 조정 상신 후 재배정(수령 대기) — 재확인 스테일 유발
  await pMU.goto(`${BASE}/assets/register?sel=AST-2024-000706`, { waitUntil: 'networkidle' })
  await pMU.locator('button', { hasText: '자산 재배정 (직접 인계)' }).first().click()
  await pMU.waitForTimeout(200)
  await pMU.locator('select', { has: pMU.locator('option', { hasText: '김민준' }) }).first().selectOption('김민준')
  await pMU.locator('[placeholder*="인계 사유"]').fill('스테일 방어 검증 재배정')
  await pMU.locator('button', { hasText: /^재배정 확정$/ }).click()
  await pMU.waitForTimeout(700)
  // 미확인 조정 승인 (DIF-05 → 유휴 · DIF-06 → 스테일 미적용)
  await pMU.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await pMU.locator('tr', { has: pMU.locator('text=재물조사 미확인 2건 조정') }).first().locator('button', { hasText: /^승인$/ }).click()
  await pMU.waitForTimeout(900)
  await pMU.goto(`${BASE}/assets/register?sel=AST-2024-000994`, { waitUntil: 'networkidle' })
  const adj994 = (await pMU.textContent('body')) || ''
  ok('재물조사 미확인 조정 승인 → 유휴 편성 + 좌석 회수(보유자 이탈 정리)', adj994.includes('재물조사 미확인 — 분실 후보로 유휴 편성 · 라이선스 좌석 1석 회수 (Microsoft 365 E3)'))
  await pMU.goto(`${BASE}/assets/register?sel=AST-2024-000706`, { waitUntil: 'networkidle' })
  const adj706row = (await pMU.locator('tr', { has: pMU.locator('td', { hasText: 'AST-2024-000706' }) }).first().textContent()) || ''
  ok('재물조사 차이 조정 스테일 방어: 상신 후 재배정된 자산은 유휴 강제 안 함(사용중·재배정 보유자 김민준 유지·미적용)', adj706row.includes('사용중') && adj706row.includes('김민준'))
  // 폐기 절차 충돌 방어 — DIF-04(상태 불일치·AST-2021-000432)는 폐기 대상(DSP-02)이라 '사용중' 보정이 미적용돼 유휴 유지(사용중이면 폐기 리스트에 사용중 자산이 남아 사용중 가드 우회).
  await pMU.goto(`${BASE}/assets/register?sel=AST-2021-000432`, { waitUntil: 'networkidle' })
  const adj432row = (await pMU.locator('tr', { has: pMU.locator('td', { hasText: 'AST-2021-000432' }) }).first().textContent()) || ''
  ok('재물조사 차이 조정 폐기충돌 방어: 폐기 대상 자산은 상태 보정(사용중) 미적용·유휴 유지', adj432row.includes('유휴') && !adj432row.includes('사용중'))
  // 위치 스테일 방어 — DIF-01(위치·512)은 로67 실측 보정으로 위치가 이미 '부산 지사 3F'로 바뀌었다. 상신된 위치 조정(대장값 '본사 8F' 기준)은 스테일이라 미적용돼 최신 위치를 덮지 않는다(로67↔재물조사 교차-루프).
  await pMU.goto(`${BASE}/assets/register?sel=AST-2025-000512`, { waitUntil: 'networkidle' })
  const adj512row = (await pMU.locator('tr', { has: pMU.locator('td', { hasText: 'AST-2025-000512' }) }).first().textContent()) || ''
  ok('재물조사 차이 조정 위치 스테일 방어: 상신 후 위치 변경(로67 부산 지사)된 자산은 실사 위치 미적용·최신 위치 유지', adj512row.includes('부산 지사 3F') && !adj512row.includes('판교 사무소'))
  await ctxMU.close()
  await p4.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  // 수리 지연 → 업체 독촉(검출→조치). 상태를 바꾸지 않으므로 유휴 처리 앞에 수행.
  const repairRemind = p4.locator('button', { hasText: /^업체 독촉 발송 \d+건$/ })
  ok('수리 지연: 업체 독촉 발송 버튼 노출', (await repairRemind.count()) > 0)
  await repairRemind.click()
  await p4.waitForTimeout(800)
  ok('수리 지연 → 업체 독촉: 발송 성공', (await p4.textContent('body')).includes('수리 업체 독촉'))
  const scrap = p4.locator('button', { hasText: /^폐기 검토$/ }).first()
  ok('장기 유휴: 폐기 검토 버튼 노출', (await scrap.count()) > 0)
  const idleAsset = (await p4.locator('tr', { has: p4.locator('button', { hasText: /^폐기 검토$/ }) }).first().locator('td').first().textContent())?.trim() || ''
  await scrap.click()
  await p4.waitForTimeout(900)
  ok('장기 유휴 → 폐기: 대상 선정 성공', (await p4.textContent('body')).includes('폐기 대상 선정'))
  await p4.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  ok('장기 유휴 → 폐기: 폐기 기록에 사유(장기 유휴)로 등장', (await p4.textContent('body')).includes(idleAsset) && (await p4.textContent('body')).includes('장기 유휴'))

  // 분실 → 미회수 확정 → 폐기 브리지(dead-end 링크 대체)
  const lostTarget = 'AST-2023-000112'
  await p4.goto(`${BASE}/assets/register?sel=${lostTarget}`, { waitUntil: 'networkidle' })
  await p4.locator('button', { hasText: /^분실 · 도난 신고$/ }).click()
  await p4.waitForTimeout(300)
  await p4.locator('input[placeholder*="정황"]').fill('e2e 분실 신고 — 소재 불명')
  await p4.locator('button', { hasText: /^신고 확정$/ }).click()
  await p4.waitForTimeout(700)
  // 분실 신고 → 보유자 통보 — 회수·반납·재배정처럼 '보유 이탈'은 당사자에게 알린다(그동안 도난만 보안운영팀에 통보하고 보유자는 무통보였다). 발송 이력에 분실 신고 통지 적재.
  await p4.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('분실 신고 → 보유자 통보(발송 이력에 분실 신고 통지 적재)', ((await p4.textContent('body')) || '').includes('분실 신고'))
  // 분실·도난 큐 드릴다운(count↔destination 정합) — 분실 자산이 생긴 지금, 대시보드 분실 큐가 전체 대장이 아니라 ?status=분실 로 연결(큐 건수=목록).
  await p4.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const lostQueueHref = await p4.locator('a', { hasText: '분실 · 도난 자산' }).first().getAttribute('href')
  ok('대시보드: 분실·도난 큐가 ?status=분실 로 드릴다운(전체 대장 아님)', !!lostQueueHref && decodeURIComponent(lostQueueHref).includes('/assets/register?status=분실'))
  await p4.goto(`${BASE}/assets/register?sel=${lostTarget}`, { waitUntil: 'networkidle' })
  const lostScrap = p4.locator('button', { hasText: /^미회수 확정 → 폐기$/ })
  ok('분실 자산: 미회수 확정 → 폐기 조치 노출', (await lostScrap.count()) > 0)
  // 변경 이력 타임라인 이벤트 종류별 색(제품안내서 §03) — 분실 이벤트가 위험(err) 톤 마커로 도드라진다(수명주기 중대 이벤트 시인성).
  ok('자산 대장 상세: 변경 이력 타임라인 — 분실 이벤트 위험(err) 톤 마커', (await p4.locator('.tl .ev[data-tone="err"]').count()) > 0)
  await lostScrap.click()
  await p4.waitForTimeout(900)
  await p4.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  ok('분실 → 폐기: 폐기 기록에 사유(분실 미회수 확정)로 등장', (await p4.textContent('body')).includes(lostTarget) && (await p4.textContent('body')).includes('분실 미회수 확정'))

  // CSV 일괄 등록 — 파싱·클라 검증(유형/모델)·서버 재검증(시리얼 중복)·생성 반영(자산 생성이라 마지막에 수행)
  await p4.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await p4.locator('button', { hasText: /^＋ 일괄 등록$/ }).click()
  await p4.waitForTimeout(200)
  await p4.locator('textarea').fill(['유형,모델,시리얼,소유자,부서,위치', '단말,BulkE2E Term,SN-BULKE2E,홍길동,영업1팀,본사 8F', '노트북,BadCat,SN-BULK2,,,', '단말,,SN-BULK3,,,', '단말,Dup A,SN-BULKDUP,,,', '단말,Dup B,SN-BULKDUP,,,'].join('\n'))
  await p4.locator('button', { hasText: /^미리보기$/ }).click()
  await p4.waitForTimeout(300)
  ok('CSV 일괄 등록: 미리보기 집계(파싱 5·유효 3·오류 2)', (await p4.textContent('body')).includes('파싱 5행') && (await p4.textContent('body')).includes('유효 3') && (await p4.textContent('body')).includes('오류 2'))
  await p4.locator('button', { hasText: /^3건 등록$/ }).click()
  await p4.waitForTimeout(900)
  ok('CSV 일괄 등록: 2건 생성·서버 시리얼 중복 건너뜀', (await p4.textContent('body')).includes('2건') && (await p4.textContent('body')).includes('시리얼 중복'))

  // 재물조사 기한 경과 독촉(로59) — 기한 지난 미완료 회차를 '기한 경과' 표시만 하던 것을 담당자 앞 독촉으로 닫는다. 시드 INV-2026-SP1(판교 수시·기한 08-08 경과·계획)이 대상.
  await p4.goto(`${BASE}/inventory/survey-plan`, { waitUntil: 'networkidle' })
  const overdueRow = p4.locator('tr', { has: p4.locator('td', { hasText: '판교 사무소 수시 조사' }) }).first()
  ok('재물조사 회차: 기한 경과 회차에 독촉 버튼(표시→조치)', (await overdueRow.locator('button', { hasText: /^독촉$/ }).count()) > 0 && ((await overdueRow.textContent()) || '').includes('기한 경과'))
  // 기한 미도래·진행중 회차(INV-2026-H2 · 기한 08-29)에는 독촉 버튼이 없다(오발송 방지)
  const futureRow = p4.locator('tr', { has: p4.locator('td', { hasText: '2026 하반기 정기 재물조사' }) }).first()
  ok('재물조사 회차: 기한 미도래 회차에 독촉 버튼 없음', (await futureRow.locator('button', { hasText: /^독촉$/ }).count()) === 0)
  await overdueRow.locator('button', { hasText: /^독촉$/ }).click()
  await p4.waitForTimeout(800)
  ok('재물조사 회차: 독촉 발송(담당자 최지원 · 발송 이력 적재)', ((await p4.textContent('body')) || '').includes('최지원') && ((await p4.textContent('body')) || '').includes('재물조사 독촉 발송'))
  // 당일 중복 발송 차단(수령·반환 독촉과 같은 컴플라이언스 독촉)
  await overdueRow.locator('button', { hasText: /^독촉$/ }).click()
  await p4.waitForTimeout(700)
  ok('재물조사 회차: 당일 중복 독촉 차단', ((await p4.textContent('body')) || '').includes('오늘 이미 독촉'))
  // 대시보드 운영 대기 큐에 기한 경과 회차를 끌어올린다(신호를 담당자 일과 시작점으로 · 재물조사 계획 딥링크)
  await p4.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const roundQueue = p4.locator('a', { hasText: '재물조사 기한 경과' }).first()
  ok('대시보드: 재물조사 기한 경과 운영 대기 큐(→ 재물조사 계획)', (await roundQueue.count()) > 0 && (await roundQueue.getAttribute('href')) === '/inventory/survey-plan')

  // 미실사 남은 대상 — 장기 미실측 자동 편성(로34) 회차의 미스캔 대상을 실사 화면에 노출(무엇을 더 찾아야 하는지)
  await p4.goto(`${BASE}/inventory/survey-plan`, { waitUntil: 'networkidle' })
  const stvCard = p4.locator('.card', { has: p4.locator('.tt', { hasText: '장기 미실측(실사 기반 유령) 자산 자동 편성' }) }).first()
  const composeBtn = stvCard.locator('button', { hasText: /^자동 편성$/ })
  if (await composeBtn.isEnabled().catch(() => false)) { await composeBtn.click(); await p4.waitForTimeout(900) }
  await p4.goto(`${BASE}/inventory/survey-plan`, { waitUntil: 'networkidle' })
  await p4.locator('tr', { has: p4.locator('td', { hasText: '장기 미실측 자산 확인 조사' }) }).first().locator('button', { hasText: /^조사 개시$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}/inventory/survey-plan`, { waitUntil: 'networkidle' })
  const surveyHref = await p4.locator('tr', { has: p4.locator('td', { hasText: '장기 미실측 자산 확인 조사' }) }).first().locator('a', { hasText: '실사 화면' }).getAttribute('href')
  await p4.goto(`${BASE}${surveyHref}`, { waitUntil: 'networkidle' })
  const surveyBody = await p4.textContent('body')
  ok('재물조사: 미실사 남은 대상 노출(장기 미실측 유령 후보 AST-2022-000871)', surveyBody.includes('미실사 남은 대상') && surveyBody.includes('AST-2022-000871'))
  // 미실사 → 분실 신고 브리지(로30 연계) — 현장에서 끝내 못 찾은 대장 자산을 분실로 신고, 재편성만 되는 공백을 닫는다
  await p4.locator('tr', { has: p4.locator('td', { hasText: 'AST-2022-000871' }) }).first().locator('button', { hasText: /^분실 신고$/ }).click()
  await p4.waitForTimeout(900)
  ok('재물조사: 미실사 → 분실 신고 브리지 성공', (await p4.textContent('body')).includes('분실 처리'))
  await p4.goto(`${BASE}/assets/register?sel=AST-2022-000871`, { waitUntil: 'networkidle' })
  const lostBody = (await p4.textContent('body')) || ''
  ok('미실사 분실 신고 → 대장 분실 상태 반영', lostBody.includes('분실'))
  // 분실 신고 → 라이선스 좌석 자동 회수(로56 좌석 생애주기) — 실물이 사라진 자산의 좌석을 폐기·반납과 같이 회수한다. AST-2022-000871 은 LIC-004 AutoCAD 좌석이었다.
  ok('분실 신고 → 라이선스 좌석 자동 회수(이력 적재·역조회 소멸)', lostBody.includes('라이선스 좌석 회수') && !lostBody.includes('배정 라이선스'))
  // 분실·도난 신고서(로30 문서 산출물) — 분실 상태 자산 상세에 신고서 인쇄 링크 + 사건 개요·정황(재물조사 미실사)·자산 가액 렌더. 보험·감사 증적용.
  ok('분실 자산 상세: 분실·도난 신고서 인쇄 링크', lostBody.includes('분실·도난 신고서') && (await p4.locator('a[href*="/api/loss-report/AST-2022-000871"]').count()) > 0)
  const lossRep = await p4.request.get(`${BASE}/api/loss-report/AST-2022-000871`)
  const lossRepBody = await lossRep.text()
  ok('분실·도난 신고서: 사건 개요·정황·자산 가액 렌더(분실 신고)', lossRep.status() === 200 && lossRepBody.includes('LOSS / THEFT INCIDENT REPORT') && lossRepBody.includes('분실 신고') && lossRepBody.includes('미실사'))
  // 분실 회수 상태 점검(로30·35 정합) — 되찾은 분실 자산도 파손이면 유휴가 아니라 수리중으로. 신고서 발급 뒤 871 을 수리 필요로 회수.
  await p4.goto(`${BASE}/assets/register?sel=AST-2022-000871`, { waitUntil: 'networkidle' })
  const lostBlock = p4.locator('.hstack', { has: p4.locator('button', { hasText: /^회수 \(실물 확보\)$/ }) }).first()
  ok('분실 회수: 실물 상태 점검 선택 노출(정상·수리 필요·폐기 권고)', (await lostBlock.locator('select').count()) > 0)
  await lostBlock.locator('select').first().selectOption('수리 필요')
  await lostBlock.locator('button', { hasText: /^회수 \(실물 확보\)$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}/assets/register?sel=AST-2022-000871`, { waitUntil: 'networkidle' })
  ok('분실 회수(수리 필요) → 수리중 편성(유휴 아님·파손 자산 재불출 방지)', ((await p4.textContent('body')) || '').includes('수리중'))

  // 범위 지정 재물조사도 미실사 대상을 남긴다(로34 확장) — 그동안 범위(연간·정기) 회차는 대상 '수'만 저장하고
  //  대상 자산 목록이 없어 실사 화면이 미실사분을 못 보여줬다(누락 자산이 조용히 사라짐). 계획 시 대상 자산번호를 저장해
  //  범위 회차도 자동 편성 회차와 동일하게 '미실사 남은 대상 → 분실 신고' 루프가 열린다. 판교 사무소 범위 = 대장 1건.
  await p4.goto(`${BASE}/inventory/survey-plan`, { waitUntil: 'networkidle' })
  await p4.locator('button', { hasText: /^계획 수립$/ }).click()
  await p4.waitForTimeout(200)
  await p4.locator('input[placeholder*="회차명"]').fill('2027 판교 범위 정기 재물조사')
  await p4.locator('select', { has: p4.locator('option', { hasText: '판교 사무소' }) }).selectOption('판교 사무소')
  await p4.locator('input[type="date"]').fill('2026-09-30')
  await p4.locator('button', { hasText: /^등록$/ }).click()
  await p4.waitForTimeout(900)
  const scopeRow = p4.locator('tr', { has: p4.locator('td', { hasText: '2027 판교 범위 정기 재물조사' }) }).first()
  ok('재물조사 계획: 범위 지정 회차 등록(판교 사무소 · 대상 1건)', (await scopeRow.locator('td').nth(5).textContent() || '').trim() === '1')
  await scopeRow.locator('button', { hasText: /^조사 개시$/ }).click()
  await p4.waitForTimeout(500)
  // 개시 반영 대기 — 진행중 전환(실사 화면 링크 노출)까지 재조회한다. 고정 대기만으론 간헐 실패(개시 트랜지션 지연).
  const scopeLink = () => p4.locator('tr', { has: p4.locator('td', { hasText: '2027 판교 범위 정기 재물조사' }) }).first().locator('a', { hasText: '실사 화면' })
  let scopeHref = null
  for (let i = 0; i < 6 && !scopeHref; i++) {
    await p4.goto(`${BASE}/inventory/survey-plan`, { waitUntil: 'networkidle' })
    if ((await scopeLink().count()) > 0) scopeHref = await scopeLink().getAttribute('href')
    else await p4.waitForTimeout(500)
  }
  await p4.goto(`${BASE}${scopeHref}`, { waitUntil: 'networkidle' })
  const scopeSurveyBody = await p4.textContent('body')
  ok('재물조사(범위 지정): 미실사 남은 대상 노출(대장 대상 AST-2024-000230)', scopeSurveyBody.includes('미실사 남은 대상') && scopeSurveyBody.includes('AST-2024-000230'))
  ok('재물조사(범위 지정): 미실사 대상에 분실 신고 조치 노출', (await p4.locator('tr', { has: p4.locator('td', { hasText: 'AST-2024-000230' }) }).first().locator('button', { hasText: /^분실 신고$/ }).count()) > 0)

  // 재물조사 '대장 미등록' → 승인 시 대장 실제 편입(신규 등록) — 그동안 차이 조정 승인은 resolution 문자열('신규 등록')만
  //  남기고 현장에서 라벨만 확인된 미등록 자산을 대장에 넣지 않아 관리 사각에 방치됐다. 미등록 코드 스캔 → 조정 상신 → 승인 시
  //  검수중으로 채번·편입되고 스캔 라벨이 시리얼(LABEL-…)로 남는지 검증한다(판교 범위 회차 = 위에서 진행중, 차이 1건 격리).
  await p4.locator('input[placeholder*="스캔하거나"]').fill('UNKNOWN-E2E-88')
  await p4.locator('button', { hasText: /^확정$/ }).click()
  await p4.waitForTimeout(800)
  ok('재물조사: 미등록 코드 스캔 → 대장 미등록 차이 생성', ((await p4.textContent('body')) || '').includes('대장에 없는 자산') || ((await p4.textContent('body')) || '').includes('신규 등록 대상'))
  await p4.locator('button', { hasText: /^조정 결재 상신 \(\d+\)$/ }).click()
  await p4.waitForTimeout(800)
  // 차이 조정 필수 결재선(AL-07: 자산담당 → IT기획팀장) 2단계 승인 — #323 이후 상신은 첫 단계 자산담당에서 시작하므로
  //  두 단계를 연속 승인해야 효과(대장 편입)가 적용된다. ADMIN 오버라이드로 두 단계 모두 결재(p3 는 이 시점 종료됨).
  const ctxAI = await browser.newContext()
  await ctxAI.addCookies([cookie(ADMIN)])
  const pAI = await ctxAI.newPage()
  const adjApr = () => pAI.locator('tr', { has: pAI.locator('text=2027 판교 범위 정기 재물조사') }).first()
  await pAI.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await adjApr().locator('button', { hasText: /^승인$/ }).click() // 1차: 자산담당
  await pAI.waitForTimeout(900)
  await pAI.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await adjApr().locator('button', { hasText: /^승인$/ }).click() // 2차: IT기획팀장 → 확정·효과 적용
  await pAI.waitForTimeout(900)
  await pAI.goto(`${BASE}/assets/register?q=LABEL-UNKNOWN-E2E-88`, { waitUntil: 'networkidle' })
  const regBody = (await pAI.textContent('body')) || ''
  // q=LABEL-… 는 시리얼로 새 자산을 격리 조회한다(시리얼은 상세에만 표기되므로 목록 행의 모델·상태로 편입을 확인).
  ok('재물조사 대장 미등록 승인 → 대장 실제 편입(검수중·스캔 라벨 시리얼)', regBody.includes('미상 (라벨만 확인)') && regBody.includes('검수중'))
  // 감사 추적(§07) — 실측 스캔이 중앙 감사 로그에 적재되는지(최근 실측일 갱신·차이 생성의 추적성). 위에서 스캔한 UNKNOWN-E2E-88 건.
  await pAI.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('재물조사 실측 스캔 → 중앙 감사 로그 적재(§07 추적성)', ((await pAI.textContent('body')) || '').includes('재물조사 실측 스캔'))
  await ctxAI.close()

  // 재물조사 마감 완결성 가드(§03) — 미실사 대장 대상(스캔·분실·폐기 미처리)이 남으면 회차를 마감할 수 없다. 판교 회차엔 AST-2024-000230(미실사)이 남아 있다.
  await p4.goto(`${BASE}${scopeHref}`, { waitUntil: 'networkidle' })
  ok('재물조사 마감: 미실사 대상 남으면 조사 완료 버튼 비활성', await p4.locator('button', { hasText: /^조사 완료$/ }).isDisabled())
  await p4.locator('tr', { has: p4.locator('td', { hasText: 'AST-2024-000230' }) }).first().locator('button', { hasText: /^분실 신고$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}${scopeHref}`, { waitUntil: 'networkidle' })
  ok('재물조사 마감: 미실사 대상 분실 처리 후 조사 완료 활성', !(await p4.locator('button', { hasText: /^조사 완료$/ }).isDisabled()))
  await p4.locator('button', { hasText: /^조사 완료$/ }).click()
  await p4.waitForTimeout(800)
  ok('재물조사 마감: 전 대상 계상 후 회차 완료(결과 요약 리포트 배포)', ((await p4.textContent('body')) || '').includes('결과 요약'))

  // 유지보수 예산 통보(§03 유지보수 비용 관리 · 신호→조치 채널) — 집행률 판정(예산 초과·소진 임박)이 화면·대시보드에 보이기만 하고
  //  조치 채널이 없던 공백을 닫는다. 시드 CT-2022-007(집행률 104% 예산 초과) → 통보 버튼 활성 → 주관부서·공급사에 재협상·집행 점검 통보.
  await p4.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const budgetBtn = p4.locator('button', { hasText: /^예산 재협상·집행 점검 통보 \(\d+\)$/ })
  ok('유지보수 예산: 통보 버튼 노출(예산 초과·소진 임박 배지 ≥1)', (await budgetBtn.count()) > 0 && !/\(0\)/.test(await budgetBtn.first().innerText()))
  await budgetBtn.first().click()
  await p4.waitForTimeout(800)
  ok('유지보수 예산: 통보 발송 성공(주관부서·공급사 · 발송 이력)', ((await p4.textContent('body')) || '').includes('유지보수 예산 통보') && ((await p4.textContent('body')) || '').includes('발송'))
  // 유지보수 미집행 이행 독촉(로63) — 예산 통보의 반대편(집행률 0% 미집행)에 조치 채널이 없던 공백을 닫는다. 시드 CT-2024-011(스토리지·백업 유지보수, 비용 이력 없음=미집행) → 버튼 활성.
  const execBtn = p4.locator('button', { hasText: /^미집행 이행 독촉 \(\d+\)$/ })
  ok('유지보수 미집행: 이행 독촉 버튼 노출(미집행 배지 ≥1)', (await execBtn.count()) > 0 && !/\(0\)/.test(await execBtn.first().innerText()))
  await execBtn.first().click()
  await p4.waitForTimeout(800)
  ok('유지보수 미집행: 이행 독촉 발송 성공(주관부서·공급사 · 발송 이력)', ((await p4.textContent('body')) || '').includes('유지보수 이행 독촉') && ((await p4.textContent('body')) || '').includes('발송'))
  // 미집행 반올림 오분류(회귀) — 소액 착수비만 집행한 계약(30,000/60,000,000 = 0.05% · 반올림 0%)은 '집행 전무'가 아니므로 미집행이 아니라 정상. 시드 CT-2025-013(보안관제 MSS).
  await p4.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const mssRow = (await p4.locator('tr', { has: p4.locator('td', { hasText: '보안관제(MSS) 유지보수' }) }).first().textContent()) || ''
  ok('유지보수 판정: 소액 집행(0.05%)은 미집행 아닌 정상(반올림 오분류 회귀)', mssRow.includes('정상') && !mssRow.includes('미집행'))
  // 유지보수 SLA 위반 → 공급사 SLA 이행 독촉(로71) — SLA 편집기는 있으나 준수 감시·조치가 없던 공백. 시드 CT-2025-014(단말 유지보수, SLA 대응 5영업일)가 덮는 AST-2024-000512 의 열린 수리(sentAt 07-18, 시한 초과) → SLA 위반 판정 → 위반 배지·독촉 버튼. 위반 검출·독촉이 없으면 배지/버튼이 안 떠 실패.
  await p4.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const slaMaintCard = p4.locator('.card', { has: p4.locator('text=유지보수 계약 관리') })
  const slaRow = (await slaMaintCard.locator('tr', { has: p4.locator('td', { hasText: '임직원 단말 하드웨어 유지보수' }) }).first().textContent()) || ''
  ok('유지보수 SLA 위반: 대응 시한 초과 열린 수리 배지(위반 자산 열거)', slaRow.includes('SLA 위반') && slaRow.includes('AST-2024-000512'))
  const slaBtn = p4.locator('button', { hasText: /^SLA 위반 독촉 \(\d+\)$/ })
  ok('유지보수 SLA 위반: 이행 독촉 버튼 노출(위반 배지 ≥1)', (await slaBtn.count()) > 0 && !/\(0\)/.test(await slaBtn.first().innerText()))
  await slaBtn.first().click()
  await p4.waitForTimeout(800)
  ok('유지보수 SLA 위반: 이행 독촉 발송 성공(주관부서·공급사 · 발송 이력)', ((await p4.textContent('body')) || '').includes('SLA 위반 독촉') && ((await p4.textContent('body')) || '').includes('발송'))

  // 발주 이행 독촉(§03 구매 계약 · 신호→조치 채널) — 발주 미이행 위험 판정(발주율 저조·만료 임박)에 조치 채널이 없던 공백을 닫는다. 시드 CT-2023-021 미이행 → 버튼 활성.
  const procBtn = p4.locator('button', { hasText: /^발주 이행 독촉 \(\d+\)$/ })
  ok('구매 계약: 발주 이행 독촉 버튼 노출(미이행 위험 배지 ≥1)', (await procBtn.count()) > 0 && !/\(0\)/.test(await procBtn.first().innerText()))
  await procBtn.first().click()
  await p4.waitForTimeout(800)
  ok('발주 이행 독촉: 발송 성공(주관부서·공급사·구매팀 · 발송 이력)', ((await p4.textContent('body')) || '').includes('발주 이행 독촉') && ((await p4.textContent('body')) || '').includes('발송'))

  // 발주 정산 종결(로72) — 검수 완료액을 '대금 정산 근거'로 약속하나 종결 조치가 없어 전량 이행된 계약도 이행 현황에 열린 채 남던 공백. 시드 CT-2026-018(8×3M=24M 전량 발주·검수 완료) → 정산 종결 가능 → 종결 시 정산 완료로 닫히고 이행/미이행 집계에서 빠진다. 검출·종결이 없으면 배지/버튼이 안 떠 실패.
  const settleCardPre = p4.locator('.card', { has: p4.locator('text=발주·검수 이행 현황') })
  const settleRowPre = (await settleCardPre.locator('tr', { has: p4.locator('td', { hasText: '2026 개발팀 워크스테이션 도입' }) }).first().textContent()) || ''
  ok('발주 정산 종결(로72): 전량 발주·검수 완료 계약이 정산 종결 가능 판정', settleRowPre.includes('정산 종결 가능'))
  const settleBtn = p4.locator('button', { hasText: /^발주 정산 종결 \(\d+\)$/ })
  ok('발주 정산 종결(로72): 종결 버튼 노출(정산 종결 가능 ≥1)', (await settleBtn.count()) > 0 && !/\(0\)/.test(await settleBtn.first().innerText()))
  await settleBtn.first().click()
  await p4.waitForTimeout(800)
  ok('발주 정산 종결(로72): 종결·주관부서/재무 통지 발송 성공(대금 정산 근거 확정)', ((await p4.textContent('body')) || '').includes('발주 정산 종결') && ((await p4.textContent('body')) || '').includes('정산 근거'))
  await p4.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const settleCardPost = p4.locator('.card', { has: p4.locator('text=발주·검수 이행 현황') })
  const settleRowPost = (await settleCardPost.locator('tr', { has: p4.locator('td', { hasText: '2026 개발팀 워크스테이션 도입' }) }).first().textContent()) || ''
  ok('발주 정산 종결(로72): 종결 후 정산 완료로 닫힘(이행 현황 종착)', settleRowPost.includes('정산 완료'))

  // 입고 지연 독촉(§06 ITSM 납기 관리 · 검출→조치) — 납기 경과 발주 로트(시드 IN-2607-03)의 공급사에 납기 확인 독촉 발송
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  ok('도입·검수: 입고 지연 독촉 버튼 노출(발주처)', (await p4.locator('button', { hasText: /^입고 지연 독촉 발송 \d+건$/ }).count()) > 0)
  await p4.locator('button', { hasText: /^입고 지연 독촉 발송 \d+건$/ }).click()
  await p4.waitForTimeout(800)
  ok('입고 지연 독촉: 발주처 납기 확인 발송 성공(발송 이력)', (await p4.textContent('body')).includes('입고 지연 독촉') && (await p4.textContent('body')).includes('발송'))

  // 발주 단가 비유한(Infinity) 방어 — '1e309' 가 Number() 로 Infinity 파싱돼 lot.unitCost→asset.acquisitionCost 로 흘러
  //  TCO·감가상각·부서비용·가치 집계를 오염하던 공백(수리비·매각대금은 isFinite 가드 있는데 입고 단가만 누락). 상세에 ∞ 로 표기되면 오염.
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await p4.locator('button', { hasText: /^입고 등록$/ }).click()
  await p4.waitForTimeout(200)
  {
    const intakeCard = p4.locator('.card', { hasText: '입고 목록' })
    await intakeCard.locator('input[placeholder*="모델"]').fill('e2e 단가오버플로 검증기')
    await intakeCard.locator('input[type="number"]').first().fill('1')
    await intakeCard.locator('input[placeholder="발주 단가(원)"]').fill('1e309')
    await intakeCard.locator('button', { hasText: /^등록$/ }).click()
    await p4.waitForTimeout(800)
  }
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await p4.locator('tr.clickable', { has: p4.locator('td', { hasText: 'e2e 단가오버플로 검증기' }) }).first().click()
  await p4.waitForTimeout(300)
  ok('도입·검수: 발주 단가 비유한(1e309→Infinity) 방어 — 취득가 오염 차단(∞ 미표시)', !((await p4.textContent('body')) || '').includes('∞'))

  // 도입 예정 취소 — 발주·SR 취소로 무효가 된 도입 예정 건을 도착 전에 파이프라인에서 뺀다(방치 시 도착 예정일 경과로 입고 지연 오알림·발주처 오독촉). 도착 후 반품(검수 반려)과 구분. 사전 등록 후 취소로 검증.
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await p4.locator('button', { hasText: '도입 예정 등록' }).click()
  await p4.waitForTimeout(200)
  await p4.locator('input[placeholder*="SR·발주번호"]').fill('SR-E2E-999')
  await p4.locator('input[placeholder="모델"]').fill('e2e 취소 검증 노트북')
  await p4.locator('input[type="date"]').fill('2026-09-30')
  await p4.locator('button', { hasText: /^등록$/ }).click()
  await p4.waitForTimeout(800)
  ok('도입 예정 사전 등록: 신규 도입 예정 건 표시', ((await p4.textContent('body')) || '').includes('e2e 취소 검증 노트북'))
  const planRow = p4.locator('tr', { has: p4.locator('td', { hasText: 'e2e 취소 검증 노트북' }) }).first()
  await planRow.locator('button', { hasText: /^취소$/ }).click()
  await p4.waitForTimeout(800)
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' }) // 성공 메시지에 모델명이 남으므로 새로고침 후 목록에서 제거 확인
  ok('도입 예정 취소: 취소 시 목록에서 제거(입고 지연 알림 대상 제외)', !((await p4.textContent('body')) || '').includes('e2e 취소 검증 노트북'))

  // 검수 반려 → 반품 완료(교체 없음) 종결 — 재검수의 짝. 시드 IN-2607-04(검수 반려) 마감 후 대시보드 백로그에서 제외
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await p4.locator('tr.clickable', { has: p4.locator('td', { hasText: 'IN-2607-04' }) }).first().click()
  await p4.waitForTimeout(200)
  await p4.locator('button', { hasText: /^반품 완료 \(교체 없음\)$/ }).click()
  await p4.waitForTimeout(800)
  ok('도입·검수: 검수 반려 → 반품 완료 종결', (await p4.textContent('body')).includes('반품 완료'))
  // 반품 완료 로트 체크리스트 재토글 가드 — 반품된 로트의 체크리스트를 전부 체크해도 '검수 완료'로 되돌아가 채번되면 안 된다
  //  (이미 반품한 물품이 대장에 유령 자산으로 등록되는 것 방지). 채번 버튼이 계속 비활성이어야 한다.
  {
    const insCard = p4.locator('.card', { hasText: '검수 체크리스트' })
    const items = insCard.locator('.vstack').first().locator(':scope > button')
    const n = await items.count()
    for (let i = 0; i < n; i++) { await items.nth(i).click(); await p4.waitForTimeout(60) }
    await p4.waitForTimeout(300)
    ok('도입·검수 가드: 반품 완료 로트 체크리스트 재토글해도 채번 불가(유령 자산 방지)', await insCard.locator('button', { hasText: /^자산번호 채번/ }).isDisabled())
  }
  // 검수 완료 감사 — toggleCheck 가 검수 완료(채번 게이트) 전이를 감사에 안 남기던 공백. 입고 대기 로트(IN-2607-02)를 검수 완료하면 감사 로그에 '검수 완료 — 로트'가 남아야 한다(누가 QC 를 통과시켰는지 추적).
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await p4.locator('tr.clickable', { has: p4.locator('td', { hasText: 'IN-2607-02' }) }).first().click()
  await p4.waitForTimeout(200)
  {
    const insCard02 = p4.locator('.card', { hasText: '검수 체크리스트' })
    const items02 = insCard02.locator('.vstack').first().locator(':scope > button')
    const n02 = await items02.count()
    for (let i = 0; i < n02; i++) { await items02.nth(i).click(); await p4.waitForTimeout(60) }
    await p4.waitForTimeout(300)
  }
  await p4.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  await p4.locator('input[placeholder="수행자·동작·대상 검색"]').fill('IN-2607-02')
  await p4.waitForTimeout(300)
  ok('검수 완료 감사: toggleCheck 검수 완료 전이가 감사 로그에 기록(로트 IN-2607-02 · 채번 게이트)', ((await p4.textContent('body')) || '').includes('검수 완료 —') && ((await p4.textContent('body')) || '').includes('IN-2607-02'))
  await p4.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  const p4Dash = (await p4.textContent('body')) || ''
  ok('검수 반려 → 반품 완료: 대시보드 백로그에서 제외', !p4Dash.includes('검수 반려 (재검수 · 반품 확인)'))
  // 내게 온 알림(수신자 측) — 나를 수신자(to)로 한 통지를 My Work 에서 요약. 그동안 발송 이력은 관리자만 볼 수 있었다. 박자산 앞 통지(예: JetBrains 만료 임박) 노출.
  ok('대시보드(수신자): 내게 온 알림 — 나를 수신자로 한 통지 요약 노출', p4Dash.includes('내게 온 알림') && p4Dash.includes('JetBrains'))
  // 스캔 이력 원클릭 재실행 — 과거 회차의 채널·범위·강도 그대로 다시 돌린다(그동안 이력은 조회 전용). 상태 변경이라 스크립트 끝에서 수행.
  await p4.goto(`${BASE}/discovery/scan`, { waitUntil: 'networkidle' })
  const scanCountBefore = Number(((await p4.textContent('body')) || '').match(/스캔 이력 (\d+)회차/)?.[1] ?? '0')
  await p4.locator('tr', { has: p4.locator('td', { hasText: 'SCN-RUN-2607-27' }) }).first().locator('button', { hasText: /^재실행$/ }).click()
  await p4.waitForTimeout(900)
  await p4.goto(`${BASE}/discovery/scan`, { waitUntil: 'networkidle' })
  const scanCountAfter = Number(((await p4.textContent('body')) || '').match(/스캔 이력 (\d+)회차/)?.[1] ?? '0')
  ok('스캔 이력 재실행: 과거 회차 조건으로 새 회차 추가(원클릭 재탐지)', scanCountBefore > 0 && scanCountAfter === scanCountBefore + 1)
  await ctx4.close()

  // ── 커버리지 보강(회귀 방어) — 그동안 smoke SSR 렌더만 있고 액션이 미검증이던 상태 변경 루프. 스위트 끝에 배치해 앞 단언에 상태 오염이 없게 한다.
  // 만료 임박 알림 발송(로13) — 컴플라이언스 디스패치. 발송이 조용히 끊겨도 무탐지이던 공백을 닫는다.
  const ctxEN = await browser.newContext(); await ctxEN.addCookies([cookie(ASSET)]); const pEN = await ctxEN.newPage()
  await pEN.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const enBtn = pEN.locator('button', { hasText: /^만료 임박 알림 발송 \(\d+\)$/ })
  const enDue = Number((((await enBtn.first().innerText()) || '').match(/\((\d+)\)/) || [])[1] || '0')
  ok('만료 임박 알림(로13): 발송 버튼 노출(임박 대상 ≥1)', (await enBtn.count()) > 0 && enDue > 0)
  await enBtn.first().click()
  const enMsg = pEN.locator('text=발송 이력에서 확인할 수 있습니다').first()
  await enMsg.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {})
  const enBody = (await pEN.textContent('body')) || ''
  ok('만료 임박 알림(로13): 발송 성공(계약·라이선스·보증 통지 · 발송 이력 적재)', enBody.includes('발송 이력에서 확인할 수 있습니다'))
  // 화면-액션 정합 — 버튼이 보인 건수와 실제 발송 건수가 같아야 한다. 화면이 창 안 대상 전부를 세고 액션만 당일 발송분을 제외하면
  //  (시드에도 당일 발송분이 있다) 건수가 어긋나고, 다 보낸 뒤에도 버튼이 전체 건수로 활성인 채 눌러야 '신규 대상 없음'이 된다.
  ok('만료 임박 알림(화면-액션 정합): 버튼 건수 = 실제 발송 건수(당일 발송분 제외 · lib/expiry 단일 소스)', enBody.includes(`만료 임박 알림 ${enDue}건 발송`))
  await pEN.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const enAfter = pEN.locator('button', { hasText: /^만료 임박 알림 발송 \(\d+\)$/ }).first()
  ok('만료 임박 알림(중복 억제): 발송 직후 신규 대상 0 · 버튼 비활성(대상 없는데 활성인 유령 컨트롤 제거)', ((await enAfter.innerText()) || '').includes('(0)') && (await enAfter.isDisabled()))
  await ctxEN.close()
  // 커넥터 재연동(로22) — 지연·오류 커넥터를 정상으로 되돌리는 액션(보안담당). 시드 '프록시 · 방화벽 · DNS'(지연).
  const ctxCN = await browser.newContext(); await ctxCN.addCookies([cookie(SEC)]); const pCN = await ctxCN.newPage()
  await pCN.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const cnRow = pCN.locator('tr', { has: pCN.locator('td', { hasText: '프록시 · 방화벽 · DNS' }) }).first()
  ok('커넥터 재연동(로22): 지연 커넥터 표시', ((await cnRow.textContent()) || '').includes('지연'))
  await cnRow.locator('button', { hasText: /^연결 테스트$/ }).click()
  await pCN.waitForTimeout(700)
  await pCN.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const cnText = (await pCN.locator('tr', { has: pCN.locator('td', { hasText: '프록시 · 방화벽 · DNS' }) }).first().textContent()) || ''
  ok('커넥터 재연동(로22): 재연동 → 상태 정상(지연 해소·감사 적재)', cnText.includes('정상') && !cnText.includes('지연'))
  await ctxCN.close()
  // 계약 갱신(로23) — 만료 임박·경과 계약을 연장하고 상태 정상 전환(만료 임박 집계에서 제외). 그동안 smoke 렌더만. CT-2023-014(만료 2026-03-14 경과) 1년 갱신 → 2027.
  const ctxRN = await browser.newContext(); await ctxRN.addCookies([cookie(ASSET)]); const pRN = await ctxRN.newPage()
  await pRN.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const rnRow = pRN.locator('tr', { has: pRN.locator('td', { hasText: 'CT-2023-014' }) }).first()
  await rnRow.locator('button', { hasText: /^갱신$/ }).click()
  await pRN.waitForTimeout(200)
  await rnRow.locator('button', { hasText: /^1년$/ }).click()
  await pRN.waitForTimeout(700)
  await pRN.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const rnText = (await pRN.locator('tr', { has: pRN.locator('td', { hasText: 'CT-2023-014' }) }).first().textContent()) || ''
  ok('계약 갱신(로23): 갱신 → 만료일 연장(2027·만료 임박 해소)', rnText.includes('2027'))
  await ctxRN.close()
  // 보증 연장(로24) — 자산 보증 만료일 연장 + 보증연장 이력. 그동안 smoke 렌더만. AST-2022-000641(보증 2026-09-30) 1년 연장 → 2027-09-30.
  const ctxWY = await browser.newContext(); await ctxWY.addCookies([cookie(ASSET)]); const pWY = await ctxWY.newPage()
  await pWY.goto(`${BASE}/assets/register?sel=AST-2022-000641`, { waitUntil: 'networkidle' })
  await pWY.locator('button', { hasText: /^보증 연장$/ }).first().click()
  await pWY.waitForTimeout(200)
  await pWY.locator('button', { hasText: /^1년$/ }).first().click()
  await pWY.waitForTimeout(700)
  await pWY.goto(`${BASE}/assets/register?sel=AST-2022-000641`, { waitUntil: 'networkidle' })
  ok('보증 연장(로24): 연장 → 보증 만료일 +1년(2027-09-30)', ((await pWY.textContent('body')) || '').includes('2027-09-30'))
  await ctxWY.close()
  // 윤년 보증 연장 회귀 — 2/29 만료 자산(AST-2025-000701 · 보증 2028-02-29)을 1년 연장하면 실재하지 않는 2029-02-29 가 아니라 말일 2029-02-28 이어야 한다(lib/dates addYears 클램프).
  //  그전엔 호출부가 연도만 +1 해 달력에 없는 날짜가 대장·보증연장 이력·엑셀 반출·갱신 원장에 남고, Date 파싱이 3/1 로 굴러 표시일과 잔여일이 하루 어긋났다(재연장마다 승계).
  const ctxLY = await browser.newContext(); await ctxLY.addCookies([cookie(ASSET)]); const pLY = await ctxLY.newPage()
  await pLY.goto(`${BASE}/assets/register?sel=AST-2025-000701`, { waitUntil: 'networkidle' })
  await pLY.locator('button', { hasText: /^보증 연장$/ }).first().click()
  await pLY.waitForTimeout(200)
  await pLY.locator('button', { hasText: /^1년$/ }).first().click()
  await pLY.waitForTimeout(700)
  await pLY.goto(`${BASE}/assets/register?sel=AST-2025-000701`, { waitUntil: 'networkidle' })
  const lyBody = (await pLY.textContent('body')) || ''
  ok('윤년 보증 연장: 2028-02-29 +1년 → 말일 2029-02-28 (달력에 없는 2029-02-29 미생성)', lyBody.includes('2029-02-28') && !lyBody.includes('2029-02-29'))
  await ctxLY.close()
  // 거버넌스 가드(로19) — 본인/마지막 관리자 강등 방지 + 필수 결재선 잠금. UI 가 서버 규칙(lastAdmin · MANDATORY_APPROVAL_KINDS)을 반영해 잠근다. 그동안 오프보딩 읽기만 있고 가드는 미검증(잠금 풀리면 관리자 락아웃·필수 보안 결재 제거).
  const ctxGD = await browser.newContext(); await ctxGD.addCookies([cookie(ADMIN)]); const pGD = await ctxGD.newPage()
  await pGD.goto(`${BASE}/settings/users`, { waitUntil: 'networkidle' })
  const adminSel = pGD.locator('tr', { has: pGD.locator('td.code', { hasText: 'admin' }) }).first().locator('select').first()
  ok('거버넌스 가드(로19): 본인/마지막 관리자 강등 잠금(자산담당 옵션 비활성)', await adminSel.locator('option', { hasText: '자산담당' }).isDisabled())
  const lineTable = pGD.locator('table', { has: pGD.locator('th', { hasText: '필수 여부' }) }).first()
  const disposalLine = lineTable.locator('tbody tr', { has: pGD.locator('td', { hasText: '폐기' }) }).first()
  const lastCell = disposalLine.locator('td').last()
  ok('거버넌스 가드(로19): 필수 결재선(폐기) 잠금 — 해제 토글 없음(필수 보안 결재 제거 방지)', ((await lastCell.textContent()) || '').includes('필수 결재') && (await lastCell.locator('button').count()) === 0)
  await ctxGD.close()
  // 신청→결재→불출 물리 집행(로9) — 승인된 자산 신청(APR-2607-116 노트북 지급·오세훈)을 불출 처리하면 대장 소유자·부서·위치가 재기록되고 신청이 큐에서 빠진다('승인만으로는 실물이 안 움직인다'). 그동안 액션 미검증.
  const ctxIS = await browser.newContext(); await ctxIS.addCookies([cookie(ASSET)]); const pIS = await ctxIS.newPage()
  await pIS.goto(`${BASE}/assets/movement`, { waitUntil: 'networkidle' })
  const issueCard9 = pIS.locator('.card', { has: pIS.locator('.tt', { hasText: '불출 대기' }) }).first()
  const issueRow = issueCard9.locator('tr', { has: pIS.locator('td', { hasText: 'APR-2607-116' }) }).first()
  ok('불출 집행(로9): 승인된 자산 신청이 불출 대기 큐에 노출', (await issueRow.count()) > 0)
  await issueRow.locator('button', { hasText: /^불출 처리$/ }).click()
  await pIS.waitForTimeout(800)
  await pIS.goto(`${BASE}/assets/movement`, { waitUntil: 'networkidle' })
  const issueGone = (await pIS.locator('.card', { has: pIS.locator('.tt', { hasText: '불출 대기' }) }).first().locator('td', { hasText: 'APR-2607-116' }).count()) === 0
  ok('불출 집행(로9): 불출 처리 → 신청이 큐에서 빠짐(fulfilled)', issueGone)
  await pIS.goto(`${BASE}/assets/register?q=${encodeURIComponent('오세훈')}`, { waitUntil: 'networkidle' })
  ok('불출 집행(로9): 대장 소유자·부서 재기록(오세훈·인사팀)', (await pIS.locator('td', { hasText: '오세훈' }).count()) > 0 && ((await pIS.textContent('body')) || '').includes('인사팀'))
  await ctxIS.close()
  // 발견 → 격리 물리 집행(로2) — 격리 요청 결재(APR-2607-112·DSC-2607-0031)를 보안담당→IT기획팀장 2단계 승인하면 NAC 차단이 집행된다(격리완료 + 격리 통보 이메일·SMS). 편입 시블링만 검증됐고 격리 집행은 미검증이던 공백.
  const ctxQ1 = await browser.newContext(); await ctxQ1.addCookies([cookie(SEC)]); const pQ1 = await ctxQ1.newPage()
  await pQ1.goto(`${BASE}/workflow/approvals?sel=APR-2607-112`, { waitUntil: 'networkidle' })
  await pQ1.locator('tr', { has: pQ1.locator('td', { hasText: 'APR-2607-112' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await pQ1.waitForTimeout(700)
  await ctxQ1.close()
  const ctxQ2 = await browser.newContext(); await ctxQ2.addCookies([cookie(ADMIN)]); const pQ2 = await ctxQ2.newPage()
  await pQ2.goto(`${BASE}/workflow/approvals?sel=APR-2607-112`, { waitUntil: 'networkidle' })
  await pQ2.locator('tr', { has: pQ2.locator('td', { hasText: 'APR-2607-112' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await pQ2.waitForTimeout(800)
  await pQ2.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('격리 집행(로2): 보안담당→IT기획팀장 2단계 승인 → NAC 격리 집행(격리 통보 발송)', ((await pQ2.textContent('body')) || '').includes('NAC 격리 집행'))
  await ctxQ2.close()
  // 대여 신청 → 결재 → 대여중 자동 집행(로41) — 승인 즉시 지정 유휴 자산이 신청자(김민준)에게 반환 기한과 함께 대여 처리된다(decide 대여 자동 집행 분기). 자동 집행·유휴 전제가 그동안 미검증(연장 승인만 검증). 전용 유휴 서버(AST-2025-000701, 스위트 미변경) 대상.
  const ctxLN = await browser.newContext(); await ctxLN.addCookies([cookie(ADMIN)]); const pLN = await ctxLN.newPage()
  await pLN.goto(`${BASE}/assets/register?q=AST-2025-000701`, { waitUntil: 'networkidle' })
  const preLoan = (await pLN.locator('tr', { has: pLN.locator('td', { hasText: 'AST-2025-000701' }) }).first().textContent()) || ''
  ok('대여 자동 집행(로41): 승인 전 대상 자산 유휴(집행 전제)', preLoan.includes('유휴'))
  await pLN.goto(`${BASE}/workflow/approvals?sel=APR-2608-161`, { waitUntil: 'networkidle' })
  await pLN.locator('tr', { has: pLN.locator('td', { hasText: 'APR-2608-161' }) }).first().locator('button', { hasText: /^승인$/ }).first().click()
  await pLN.waitForTimeout(900)
  await pLN.goto(`${BASE}/assets/register?q=AST-2025-000701`, { waitUntil: 'networkidle' })
  const postLoan = (await pLN.locator('tr', { has: pLN.locator('td', { hasText: 'AST-2025-000701' }) }).first().textContent()) || ''
  ok('대여 자동 집행(로41): 승인 즉시 지정 자산 대여중·신청자 김민준(자동 집행)', postLoan.includes('대여중') && postLoan.includes('김민준'))
  await ctxLN.close()
  // AI 자동분류 판정→조치(로66) — 자동분류 제안 승인 시 발견 자산에 표준 유형이 확정(편입 승계)된다. INS-2608-07(DSC-2607-0038·ESP-9F31A2: IoT 장비→주변기기). 규칙 기본값은 미상 유형을 단말로 떨구지만 담당자 판정이 주변기기로 바로잡는다. 승인해도 default no-op이면 "판정 기록 — 담당 조치 대상으로 등록"이 찍혀 실패.
  const ctxAC = await browser.newContext(); await ctxAC.addCookies([cookie(ADMIN)]); const pAC = await ctxAC.newPage()
  await pAC.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  await pAC.locator('.seg button', { hasText: /^전체$/ }).click()  // 승인 후에도 행이 사라지지 않게 전체 필터로
  await pAC.waitForTimeout(200)
  const acBtn = pAC.locator('tr', { has: pAC.locator('td', { hasText: 'INS-2608-07' }) }).first().locator('button', { hasText: /^승인$/ })
  if ((await acBtn.count()) > 0) { await acBtn.first().click(); await pAC.waitForTimeout(800) }  // 상위 aiInsightDecide 가 먼저 승인했으면 스킵
  const acRow = (await pAC.locator('tr', { has: pAC.locator('td', { hasText: 'INS-2608-07' }) }).first().textContent()) || ''
  ok('AI 자동분류 판정→조치(로66): 승인 → 발견 자산 표준 유형 확정 · 주변기기(편입 승계)', acRow.includes('표준 유형 확정') && acRow.includes('주변기기'))
  await ctxAC.close()
  // 발견 재관측(등록·일치) → 대장 생존 신호(로68) — DSC-2608-0052(네트워크 스캔)가 AST-2020-000883(IDC-B 노후 서버, 최근 실측 10개월 경과)을 생존 재관측. lastVerifiedAt 은 물리 재물조사에서만 갱신돼 장기 미실측(유령 후보)으로 오탐되던 것을, 대사 생존 확인이 최근 실측일을 오늘로 갱신해 장기 미실측에서 뺀다. 갱신이 없으면 883 이 장기 미실측 필터에 남아 실패.
  const ctxSV = await browser.newContext(); await ctxSV.addCookies([cookie(ADMIN)]); const pSV = await ctxSV.newPage()
  await pSV.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await pSV.locator('button', { hasText: '장기 미실측' }).first().click()
  await pSV.waitForTimeout(300)
  ok('대사 생존 신호(로68): 생존 확인 전 883 은 장기 미실측(유령 후보)', (await pSV.locator('tr', { has: pSV.locator('td', { hasText: 'AST-2020-000883' }) }).count()) > 0)
  await pSV.goto(`${BASE}/discovery/found?sel=DSC-2608-0052`, { waitUntil: 'networkidle' })
  const svDetail = (await pSV.locator('body').textContent()) || ''
  ok('대사 생존 신호(로68): 등록·일치 재관측에 생존 확인 버튼 노출(대장 883 링크)', svDetail.includes('생존 확인 — 최근 실측일 갱신') && svDetail.includes('AST-2020-000883'))
  await pSV.locator('button', { hasText: '생존 확인 — 최근 실측일 갱신' }).first().click()
  await pSV.waitForTimeout(900)
  await pSV.goto(`${BASE}/assets/register`, { waitUntil: 'networkidle' })
  await pSV.locator('button', { hasText: '장기 미실측' }).first().click()
  await pSV.waitForTimeout(300)
  ok('대사 생존 신호(로68): 생존 확인 → 883 장기 미실측에서 빠짐(최근 실측일 갱신)', (await pSV.locator('tr', { has: pSV.locator('td', { hasText: 'AST-2020-000883' }) }).count()) === 0)
  await pSV.goto(`${BASE}/assets/register?sel=AST-2020-000883`, { waitUntil: 'networkidle' })
  ok('대사 생존 신호(로68): 대장 이력에 대사 생존 확인 점검 기록', ((await pSV.locator('body').textContent()) || '').includes('CMDB 대사 생존 확인'))
  await ctxSV.close()
  // AI 이상탐지 → 대장 관리 자산 격리(로70) — INS-2608-08(핵심 GPU 서버 AST-2024-000377 비정상 외부 통신, 발견 저장소 없음). 이상탐지 승인은 그동안 host 를 discovered 에서만 찾아 대장 자산은 no-op 이었다. refId 로 대장 자산 격리 요청 상신 → 보안담당→IT기획팀장 2단계 승인 → NAC 격리(대장 격리 표시). 집행이 없으면 격리 칩이 안 떠 실패.
  const ctxQA = await browser.newContext(); await ctxQA.addCookies([cookie(SEC)]); const pQA = await ctxQA.newPage()
  await pQA.goto(`${BASE}/assets/register?sel=AST-2024-000377`, { waitUntil: 'networkidle' })
  ok('대장 자산 격리(로70): 격리 전 대장 자산에 격리 표시 없음', !((await pQA.locator('tr', { has: pQA.locator('td', { hasText: 'AST-2024-000377' }) }).first().textContent()) || '').includes('격리'))
  await pQA.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  await pQA.locator('.seg button', { hasText: /^전체$/ }).click()
  await pQA.waitForTimeout(200)
  const insBtn = pQA.locator('tr', { has: pQA.locator('td', { hasText: 'INS-2608-08' }) }).first().locator('button', { hasText: /^승인$/ })
  if ((await insBtn.count()) > 0) { await insBtn.first().click(); await pQA.waitForTimeout(800) }  // 상위 aiInsightDecide 가 먼저 승인했으면 스킵
  await pQA.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const qaRow = pQA.locator('tr', { has: pQA.locator('td', { hasText: 'AST-2024-000377' }) }).first()
  ok('대장 자산 격리(로70): 이상탐지 승인 → 대장 자산 격리 요청 상신', (await qaRow.count()) > 0)
  await qaRow.locator('button', { hasText: /^승인$/ }).first().click()  // 1단계 보안담당 승인
  await pQA.waitForTimeout(700)
  await ctxQA.close()
  const ctxQB = await browser.newContext(); await ctxQB.addCookies([cookie(ADMIN)]); const pQB = await ctxQB.newPage()
  await pQB.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await pQB.locator('tr', { has: pQB.locator('td', { hasText: 'AST-2024-000377' }) }).first().locator('button', { hasText: /^승인$/ }).first().click()  // 2단계 IT기획팀장 승인 → NAC 격리 집행
  await pQB.waitForTimeout(900)
  await pQB.goto(`${BASE}/assets/register?sel=AST-2024-000377`, { waitUntil: 'networkidle' })
  ok('대장 자산 격리(로70): 2단계 승인 → NAC 격리 집행(대장 격리 표시)', ((await pQB.locator('tr', { has: pQB.locator('td', { hasText: 'AST-2024-000377' }) }).first().textContent()) || '').includes('격리'))
  await ctxQB.close()
  // 격리 집행 후 이상 행위 목록 정합 — 나머지 세 축(미인가 SW·USB·유휴 자산 사용)은 모두 미조치분만 세는데,
  //  이상탐지 제안만 '반려 아님' 기준이라 NAC 차단이 집행된 뒤에도 이탈 목록·심각도 집계에 영구히 남았다.
  const ctxQC = await browser.newContext(); await ctxQC.addCookies([cookie(SEC)]); const pQC = await ctxQC.newPage()
  await pQC.goto(`${BASE}/ai/insights`, { waitUntil: 'networkidle' })
  const qcCard = pQC.locator('.card', { hasText: '이상 자산 행위 탐지' }).first()
  const qcText = (await qcCard.textContent()) || ''
  ok('이상 행위 탐지: NAC 격리 집행된 자산은 이탈 목록에서 제외', !qcText.includes('AST-2024-000377'))
  // 양성 대조 — 패널이 그냥 비어서 통과한 게 아님을 확인한다(격리와 무관한 이탈은 그대로 남아야 한다)
  ok('이상 행위 탐지: 격리와 무관한 이탈은 그대로 노출(패널 비어서 통과한 것 아님)', /AST-|printer-3f-old/.test(qcText))
  await ctxQC.close()
  // 반납 폐기 권고 → 소유자 정리 불변식(홀더-상태) — 폐기 권고 접수는 정상·수리 필요 분기와 달리 소유자를 비우지 않아, 폐기 취소·반려로 유휴 복귀 시 떠난 보유자가 대장에 오귀속됐다(부서별 비용 배분 오염). 접수 즉시 owner='미지정' 이어야 한다. 시드 AST-2025-000513(반납대기·한도윤)을 폐기 권고로 접수 → 소유자 미지정 검증. 정리가 없으면 한도윤이 남아 실패.
  const ctxRT = await browser.newContext(); await ctxRT.addCookies([cookie(ADMIN)]); const pRT = await ctxRT.newPage()
  await pRT.goto(`${BASE}/assets/register?sel=AST-2025-000513`, { waitUntil: 'networkidle' })
  ok('반납 폐기 권고(홀더-상태): 접수 전 반납대기 자산 소유자 존재(한도윤)', ((await pRT.locator('tr', { has: pRT.locator('td', { hasText: 'AST-2025-000513' }) }).first().textContent()) || '').includes('한도윤'))
  // 반납 '접수' 경로 좌석 회수(데이터 무결성 · #4107 불변식 감사) — 승인 경로는 반납대기 진입 시 회수하나, 좌석 보유 상태로 반납대기에 온 자산이 receiveReturn(접수)될 때 회수가 없어 좌석이 영구 누수됐다(다른 이탈 경로는 전부 회수). 513(반납대기·로56에서 좌석 회수됨)에 LIC-001 좌석을 재배정한 뒤 폐기 권고 접수 → 소유자 정리 + 좌석 회수를 함께 검증(수정 전엔 접수 후에도 배정 역조회 잔존).
  await pRT.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const rtLic = pRT.locator('table', { has: pRT.locator('th', { hasText: /보유.{0,2}사용 대사/ }) }).first().locator('tbody tr').filter({ hasText: 'Microsoft 365 E3' }).first()
  await rtLic.locator('button', { hasText: /배정 \d+\/\d+석/ }).click()
  await pRT.waitForTimeout(200)
  await rtLic.locator('input[placeholder*="자산번호"]').fill('AST-2025-000513')
  await rtLic.locator('button', { hasText: /^좌석 배정$/ }).click()
  await pRT.waitForTimeout(700)
  await pRT.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const rtRow = pRT.locator('tr', { has: pRT.locator('td', { hasText: 'AST-2025-000513' }) }).first()
  await rtRow.locator('select').first().selectOption('폐기 권고')
  await pRT.waitForTimeout(200)
  await rtRow.locator('button', { hasText: /^접수$/ }).click()
  await pRT.waitForTimeout(900)
  await pRT.goto(`${BASE}/assets/register?sel=AST-2025-000513`, { waitUntil: 'networkidle' })
  const rtPost = (await pRT.locator('tr', { has: pRT.locator('td', { hasText: 'AST-2025-000513' }) }).first().textContent()) || ''
  ok('반납 폐기 권고(홀더-상태): 접수 → 폐기예정·소유자 미지정으로 정리(떠난 보유자 오귀속 방지)', rtPost.includes('폐기예정') && rtPost.includes('미지정') && !rtPost.includes('한도윤'))
  ok('반납 접수(폐기 권고) → 라이선스 좌석 회수(접수 경로도 회수 · 좌석 누수 방지 · 승인 경로와 대칭)', !((await pRT.locator('body').textContent()) || '').includes('배정 라이선스'))
  await ctxRT.close()
  // 직무 분리(자기 결재 차단) — 본인이 폼으로 올린 상신(selfSubmitted)은 본인이 못 밟는다. '내 결재 차례' 큐는 이미 제외하나 decide·결재함 버튼이 누락돼, 단일 단계 결재(대여=자산담당)에서 자산담당이 본인 대여 신청을 자기 승인하던 구멍. 시스템·운영자 상신(편입·격리·라이선스)은 selfSubmitted 없어 영향 없음.
  const ctxSD = await browser.newContext(); await ctxSD.addCookies([cookie(ASSET)]); const pSD = await ctxSD.newPage()
  await pSD.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const sdForm = pSD.locator('.card', { has: pSD.locator('.tt', { hasText: '신청 상신' }) }).first()
  await sdForm.locator('button', { hasText: /^신청하기$/ }).click()
  await pSD.waitForTimeout(200)
  await sdForm.locator('select').first().selectOption('대여')
  await pSD.waitForTimeout(300)
  // 대여 유휴 재고 select — 첫 옵션 값을 동적으로 골라 자산번호 하드코딩(소진 시 미스) 회피
  const loanSel = sdForm.locator('select').nth(1)
  const loanVal = await loanSel.locator('option').first().getAttribute('value')
  ok('직무 분리(전제): 대여 가능한 유휴 재고 존재', !!loanVal && /^AST-/.test(loanVal))
  await loanSel.selectOption(loanVal)
  await sdForm.locator('input[type="date"]').fill('2026-12-31')
  await sdForm.locator('[placeholder="신청 사유"]').fill('직무분리 검증 대여')
  await sdForm.locator('button', { hasText: /^상신$/ }).click()
  await pSD.waitForTimeout(900)
  const sdRow = pSD.locator('tr', { has: pSD.locator('td', { hasText: loanVal }) }).first()
  ok('직무 분리: 자산담당 본인 대여 상신 → 결재함 본인 건에 승인 버튼 없음·취소만(자기 결재 차단)', (await sdRow.count()) > 0 && (await sdRow.locator('button', { hasText: /^승인$/ }).count()) === 0 && (await sdRow.locator('button', { hasText: /취소/ }).count()) > 0)
  await ctxSD.close()

  // ── 메뉴·기능 관리 STEP2 기능 부여/회수(#GAP1) — 매트릭스 na→'메뉴 관리에서 부여 필요' 데드엔드 해소 ──
  const ctxMn = await browser.newContext(); await ctxMn.addCookies([cookie(ADMIN)]); const pMn = await ctxMn.newPage()
  await pMn.goto(`${BASE}/settings/menus`, { waitUntil: 'networkidle' })
  // 대시보드는 저장 미부여(actions=['조회','엑셀']) — 저장 부여 버튼이 노출되고, 부여하면 ✓ 로 바뀐다(매트릭스에서 편집 가능해짐).
  const dashRow = () => pMn.locator('tr', { has: pMn.locator('td', { hasText: /^대시보드$/ }) }).first()
  ok('메뉴 관리(STEP2): 대시보드 미부여 기능(저장) 부여 버튼 노출', (await dashRow().locator('button', { hasText: /^저장$/ }).count()) > 0)
  await dashRow().locator('button', { hasText: /^저장$/ }).click()
  await pMn.waitForTimeout(600)
  await pMn.goto(`${BASE}/settings/menus`, { waitUntil: 'networkidle' })
  ok('메뉴 관리(STEP2): 저장 부여 후 ✓ 표기(매트릭스 na 해소)', (await dashRow().locator('button', { hasText: /^✓ 저장$/ }).count()) > 0)
  // 회수로 원복 — 좌석 오염 방지(다른 검증에 영향 없게 원 상태로)
  await dashRow().locator('button', { hasText: /^✓ 저장$/ }).click()
  await pMn.waitForTimeout(600)
  await pMn.goto(`${BASE}/settings/menus`, { waitUntil: 'networkidle' })
  ok('메뉴 관리(STEP2): 회수 후 부여 버튼 복귀', (await dashRow().locator('button', { hasText: /^저장$/ }).count()) > 0)
  await ctxMn.close()

  // ── 모바일 웹 지원(제품안내서 §03) 회귀 가드 — 좁은 뷰포트(390px)에서 가로 오버플로가 없고 LV2 내비가 접힌다 ──
  const ctxMob = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await ctxMob.addCookies([cookie(ASSET)])
  const pMob = await ctxMob.newPage()
  for (const [path, label] of [['/inventory/survey', '재물조사 수행(바코드/QR 실사)'], ['/assets/register', '자산 대장(필터 15종)']]) {
    await pMob.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
    const noOverflow = await pMob.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ok(`모바일 웹 지원(§03): ${label} 가로 오버플로 없음(390px)`, noOverflow)
  }
  ok('모바일 웹 지원(§03): 좁은 뷰포트에서 LV2 내비(modnav) 접힘', (await pMob.locator('.modnav:visible').count()) === 0)
  await ctxMob.close()

  // 필수 결재선 준수(제품안내서 §01·§04: 폐기·차이조정은 필수 결재, 화면별 기본 결재선 사전 정의) —
  //  폐기 상신은 결재선(AL-04: 자산담당 → IT기획팀장)의 첫 단계에서 시작해야 한다. 그전엔 마지막 단계(IT기획팀장)로
  //  하드코딩돼 필수 '자산담당' 결재가 생략됐다(격리 요청은 보안담당→IT기획팀장로 옳게 동작하던 것과 불일치). 맨 끝 테스트라 DSP-02 소비 안전.
  //  스텝 플로우는 두 단계를 모두 렌더하므로 vacuous 방지 위해 '현재:' 단계 표시로만 판정한다(ADMIN 오버라이드로 두 단계 연속 결재).
  const ctxDL = await browser.newContext(); await ctxDL.addCookies([cookie(ADMIN)]); const pDL = await ctxDL.newPage()
  await pDL.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  await pDL.locator('button', { hasText: /^폐기 결재 상신 \(\d+\)$/ }).click()
  await pDL.waitForTimeout(800)
  const dispRow = () => pDL.locator('tr', { has: pDL.locator('td', { hasText: '폐기 상신' }) }).first()
  await pDL.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  ok('폐기 필수 결재선: 상신이 첫 단계(자산담당)에서 시작 — IT기획팀장 하드코딩 아님', ((await dispRow().textContent()) || '').includes('현재: 자산담당'))
  await dispRow().locator('button', { hasText: /^승인$/ }).click()
  await pDL.waitForTimeout(800)
  await pDL.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  ok('폐기 필수 결재선: 1차(자산담당) 승인 → IT기획팀장 단계로 진행(1회 승인으로 완결 안 됨)', ((await dispRow().textContent()) || '').includes('현재: IT기획팀장'))
  await dispRow().locator('button', { hasText: /^승인$/ }).click()
  await pDL.waitForTimeout(800)
  await pDL.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  ok('폐기 필수 결재선: 2차(IT기획팀장) 승인 → 소거 대기 전환(2단계 완료 후 효과 적용)', ((await pDL.locator('tr', { has: pDL.locator('td', { hasText: 'AST-2021-000432' }) }).first().textContent()) || '').includes('소거 대기'))
  await ctxDL.close()
  // 폐기 소거 후 SAM 대사 정합 — 좌석은 폐기 시 회수되는데 EDR 설치 기록만 남으면 사라진 장비가 '배정 밖 설치(무단 사용)'로
  //  영구히 잡히고, 화면은 없는 장비에 '좌석 배정 — 무단 사용 합법화'를 권한다. 위 결재로 소거 대기가 된 432 를 실제로 소거해 확인한다.
  //  (432 는 LIC-004 설치 기록이 있고 좌석은 없어 대사에서 배정 밖으로 잡혀 있다.)
  const ctxSAM = await browser.newContext(); await ctxSAM.addCookies([cookie(ASSET)]); const pSAM = await ctxSAM.newPage()
  await pSAM.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  ok('SAM 대사(소거 전): 폐기 대기 자산이 배정 밖 설치로 노출', ((await pSAM.textContent('body')) || '').includes('AST-2021-000432'))
  await pSAM.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  const samRow = pSAM.locator('tr', { has: pSAM.locator('td', { hasText: 'AST-2021-000432' }) }).first()
  await samRow.locator('input[type="checkbox"][aria-label$="일괄 소거 선택"]').check()
  await pSAM.waitForTimeout(300)
  await pSAM.locator('button', { hasText: /^일괄 소거·처분 \(\d+\)$/ }).first().click()
  await pSAM.waitForTimeout(1000)
  await pSAM.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const samAfter = (await pSAM.textContent('body')) || ''
  ok('SAM 대사(소거 후): 폐기 완료 자산의 설치 기록이 배정 밖 설치에서 제외', !samAfter.includes('AST-2021-000432'))
  ok('SAM 대사(소거 후): 다른 배정 밖 설치는 그대로 유지(대사 자체가 비지 않음)', samAfter.includes('배정 밖 설치'))
  await ctxSAM.close()

  // 결재 버튼이 권한 매트릭스를 따르는지(라운드트립) — 서버 decide 는 can('신청 · 결재','결재')를 강제하고 대시보드 큐·상단 배지도 그 판정을 쓰는데,
  //  결재함 버튼만 코드 역할 규칙(단계 역할·ADMIN 오버라이드)만 보고 있었다. 매트릭스에서 결재를 회수해도 승인·반려가 남아 눌러야 거부됐다.
  //  자산담당 × 결재 를 허용 → 본인 → 불가 로 돌린 뒤 결재함을 확인하고, 다시 허용으로 복원한다(스위트 상태 불변).
  const ctxPM = await browser.newContext(); await ctxPM.addCookies([cookie(ADMIN)]); const pPM = await ctxPM.newPage()
  await pPM.goto(`${BASE}/settings/permissions`, { waitUntil: 'networkidle' })
  const pmRow = pPM.locator('tr', { has: pPM.locator('td.strong', { hasText: '신청 · 결재' }) }).first()
  const pmCell = pmRow.locator('td').nth(14) // 라벨(0) + 자산담당(역할 2번째) × 결재(기능 7번째) = 1*7 + 6 + 1
  await pmCell.click(); await pPM.waitForTimeout(600) // 허용 → 본인
  await pmCell.click(); await pPM.waitForTimeout(800) // 본인 → 불가
  ok('권한 매트릭스: 자산담당 × 결재 회수(불가) 반영', ((await pmCell.textContent()) || '').includes('·'))
  const ctxAM = await browser.newContext(); await ctxAM.addCookies([cookie(ASSET)]); const pAM = await ctxAM.newPage()
  await pAM.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  // 행(td) 안의 결재 버튼만 센다 — 목록 상단 상태 필터에도 '승인'·'반려' 버튼이 있어 page 전체로 세면 항상 >0 이다(양성 대조는 복원 후).
  ok('결재함: 매트릭스 결재 회수 시 승인 버튼 미노출(서버 decide 게이트와 정합)', (await pAM.locator('td button', { hasText: /^승인$/ }).count()) === 0)
  await ctxAM.close()
  await pmCell.click(); await pPM.waitForTimeout(800) // 불가 → 허용 복원
  ok('권한 매트릭스: 결재 권한 복원(허용)', ((await pmCell.textContent()) || '').includes('✓'))
  // 양성 대조 — 복원하면 결재 버튼이 돌아온다(위 단언이 '버튼이 원래 없었다'로 통과하는 위양성 방지)
  const ctxAM2 = await browser.newContext(); await ctxAM2.addCookies([cookie(ASSET)]); const pAM2 = await ctxAM2.newPage()
  await pAM2.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  ok('결재함: 결재 권한 복원 시 승인 버튼 재노출(양성 대조)', (await pAM2.locator('td button', { hasText: /^승인$/ }).count()) > 0)
  await ctxAM2.close()
  await ctxPM.close()
  // 발견 편입·격리 버튼도 권한 매트릭스를 따르는지(라운드트립) — 서버 requestOnboard/requestQuarantine 은 can('발견 자산 · CMDB 대사', 편입/격리요청)을
  //  강제하고 메뉴 정의도 이 둘을 enforced 로 선언하는데, 화면은 아무 권한 게이트 없이 버튼을 내줬다. 게다가 거부가 undefined 반환이라
  //  권한 없는 담당자가 눌러도 아무 일도 일어나지 않았다(에러도 안내도 없는 무반응). 기능 단위 통제라 편입만 회수하면 격리는 남아야 한다.
  // 기준선 먼저 — 대상이 (앞선 테스트로 이미 처리돼) 애초에 편입 대상이 아니면 '버튼 없음'이 권한과 무관하게 통과해 위양성이 된다.
  //  스위트 진행에 따라 미처리 미등록 건이 달라지므로 지금 실제로 편입 버튼이 뜨는 건을 하나 찾아 그 건으로 검증한다.
  const ctxDB = await browser.newContext(); await ctxDB.addCookies([cookie(ASSET)]); const pDB = await ctxDB.newPage()
  await pDB.goto(`${BASE}/discovery/found?state=%EB%AF%B8%EB%93%B1%EB%A1%9D`, { waitUntil: 'networkidle' })
  const dgIds = (await pDB.locator('td.code').allTextContents()).map((t) => t.trim()).filter((t) => /^DSC-/.test(t))
  let dgTarget = ''
  for (const id of dgIds) {
    await pDB.goto(`${BASE}/discovery/found?sel=${id}`, { waitUntil: 'networkidle' })
    if (((await pDB.textContent('body')) || '').includes('편입 요청 (결재)')) { dgTarget = id; break }
  }
  ok('발견 자산: 기준선 — 편입 권한이 있으면 편입 요청 버튼 노출(미처리 미등록 건)', dgTarget !== '')
  await ctxDB.close()
  const ctxDG = await browser.newContext(); await ctxDG.addCookies([cookie(ADMIN)]); const pDG = await ctxDG.newPage()
  await pDG.goto(`${BASE}/settings/permissions`, { waitUntil: 'networkidle' })
  const dgRow = pDG.locator('tr', { has: pDG.locator('td.strong', { hasText: '발견 자산 · CMDB 대사' }) }).first()
  const dgCell = dgRow.locator('td').nth(12) // 라벨(0) + 자산담당(역할 2번째) × 편입(기능 5번째) = 1 + 7 + 4
  ok('권한 매트릭스: 발견 자산 × 편입(자산담당) 초기 허용', ((await dgCell.textContent()) || '').includes('✓'))
  await dgCell.click(); await pDG.waitForTimeout(600) // 허용 → 본인
  await dgCell.click(); await pDG.waitForTimeout(800) // 본인 → 불가
  const ctxDA = await browser.newContext(); await ctxDA.addCookies([cookie(ASSET)]); const pDA = await ctxDA.newPage()
  await pDA.goto(`${BASE}/discovery/found?sel=${dgTarget}`, { waitUntil: 'networkidle' })
  const dgBody = (await pDA.textContent('body')) || ''
  ok('발견 자산: 매트릭스 편입 회수 시 편입 요청 버튼 미노출(서버 게이트와 정합)', !dgBody.includes('편입 요청 (결재)'))
  ok('발견 자산: 편입만 회수하면 NAC 격리 요청은 남는다(기능 단위 통제)', dgBody.includes('NAC 격리 요청'))
  await ctxDA.close()
  await dgCell.click(); await pDG.waitForTimeout(800) // 불가 → 허용 복원
  ok('권한 매트릭스: 발견 자산 × 편입 복원(허용)', ((await dgCell.textContent()) || '').includes('✓'))
  const ctxDA2 = await browser.newContext(); await ctxDA2.addCookies([cookie(ASSET)]); const pDA2 = await ctxDA2.newPage()
  await pDA2.goto(`${BASE}/discovery/found?sel=${dgTarget}`, { waitUntil: 'networkidle' })
  ok('발견 자산: 편입 권한 복원 시 편입 요청 버튼 재노출(양성 대조)', ((await pDA2.textContent('body')) || '').includes('편입 요청 (결재)'))
  await ctxDA2.close()
  await ctxDG.close()
  // 채번 자산의 보증 시작일 — 대장이 도입일로 기록하는 입고일 기준이어야 한다. 채번일 기준이면 입고 후 검수·채번이 늦어진 만큼
  //  공급사 보증이 실제보다 길게 기록되고(시드 IN-2606-42: 입고 2026-06-20, 검수 완료 상태로 대기 중), 보증 만료 임박 알림·교체 판정도 그만큼 늦게 잡힌다.
  const ctxWB = await browser.newContext(); await ctxWB.addCookies([cookie(ASSET)]); const pWB = await ctxWB.newPage()
  await pWB.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await pWB.locator('tr', { has: pWB.locator('td', { hasText: 'IN-2606-42' }) }).first().click()
  await pWB.waitForTimeout(300)
  await pWB.locator('button', { hasText: '자산번호 채번' }).first().click()
  await pWB.waitForTimeout(900)
  const wbMsg = (await pWB.textContent('body')) || ''
  const wbNo = (wbMsg.match(/채번 완료 — (AST-[0-9-]+)/) || [])[1] || ''
  ok('채번: 자산번호 발번 성공(보증 기산 검증 대상 확보)', wbNo !== '')
  await pWB.goto(`${BASE}/assets/register?sel=${wbNo}`, { waitUntil: 'networkidle' })
  const wbBody = (await pWB.textContent('body')) || ''
  ok('채번 보증 기산: 도입일(입고일 2026-06-20)이 대장에 기록', wbBody.includes('2026-06-20'))
  ok('채번 보증 기산: 보증 만료 = 입고일 +3년(2029-06-20) — 채번일 기준으로 부풀리지 않음', wbBody.includes('2029-06-20'))
  await ctxWB.close()
  // 일괄 소거의 매각 제외 — 매각 대금은 건별이라 일괄로 받으면 대금 0 인 매각이 대장에 확정되고, 소거 완료 뒤에는
  //  대금을 기록할 경로가 없다(recordWipe 는 '소거 대기' 건만 받는다) → 회수 대금이 리포트·증적 대장에서 영구히 빠진다.
  //  화면이 선택지에서 빼는 것과 서버가 거부하는 것이 같은 규칙이어야 한다(주석만 있고 서버 강제가 없었다).
  const ctxWS = await browser.newContext(); await ctxWS.addCookies([cookie(ASSET)]); const pWS = await ctxWS.newPage()
  await pWS.goto(`${BASE}/assets/disposal`, { waitUntil: 'networkidle' })
  const wsBox = pWS.locator('input[type="checkbox"][aria-label$="일괄 소거 선택"]').first()
  ok('폐기 일괄 소거: 소거 대기 건 선택 컨트롤 노출', (await wsBox.count()) > 0)
  await wsBox.check()
  await pWS.waitForTimeout(300)
  const wsSel = pWS.locator('select', { has: pWS.locator('option', { hasText: '폐기(파쇄)' }) }).first()
  const wsOpts = (await wsSel.locator('option').allTextContents()).map((t) => t.trim())
  ok('폐기 일괄 소거: 처분 선택지에 매각 없음(대금 건별 입력 강제)', wsOpts.includes('폐기(파쇄)') && !wsOpts.includes('매각'))
  await ctxWS.close()
  // 통지·감사의 연결 문서 링크 — 위협 대응(크리덴셜·계정·미인가 SW·USB·로컬 VM·IOC)과 재물조사 독촉도 ref 를 남기지만
  //  entityHref 매핑이 자산·결재·계약·리포트 등에만 있어, 조치 화면이 있는데도 발송 이력에 링크 없는 텍스트로만 찍혔다.
  //  이 스위트 앞부분이 실제로 대응을 눌러 통지를 쌓아 두므로, 그 ref 들이 링크로 렌더되는지 확인한다.
  const ctxRL = await browser.newContext(); await ctxRL.addCookies([cookie(SEC)]); const pRL = await ctxRL.newPage()
  await pRL.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const rlExternal = await pRL.locator('a[href="/discovery/external"]').count()
  const rlFound = await pRL.locator('a[href="/discovery/found"]').count()
  ok('발송 이력 딥링크: 외부 위협 ref(크리덴셜·IOC·노출)가 외부 위협 화면으로 연결', rlExternal > 0)
  ok('발송 이력 딥링크: 발견 채널 ref(계정·미인가 SW·USB·로컬 VM)가 발견 화면으로 연결', rlFound > 0)
  await ctxRL.close()
  // 리포트 반출 감사 — 리포트 전문(감사 대응 자료·부서별 비용·취약점 우선순위)은 고정 URL 로 내려받아도 흔적이 없었다.
  //  대장·감사 로그·발송 이력 반출은 "누가 무엇을 몇 건 받았는지"를 남기는데 리포트만 빠져 있었다(결재 첨부 근거 문서로도 쓰인다).
  //  시드에 리포트가 없어(reports: []) 스모크로는 못 잡는다 — 여기서 생성 → 내려받기 → 감사 로그 확인까지 본다.
  const ctxRA = await browser.newContext(); await ctxRA.addCookies([cookie(ASSET)]); const pRA = await ctxRA.newPage()
  await pRA.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await pRA.locator('.card', { hasText: '리포트 유형' }).locator('tr', { hasText: '감사 대응 자료' }).locator('button', { hasText: /^생성$/ }).click()
  await pRA.waitForTimeout(1200)
  const raHref = (await pRA.locator('a', { hasText: '결재 첨부용 문서' }).first().getAttribute('href')) || ''
  ok('리포트 반출 감사: 생성 후 결재 첨부용 문서 링크 확보', raHref.includes('/api/reports/'))
  const raRes = await pRA.request.get(`${BASE}${raHref}`)
  ok('리포트 반출 감사: 문서 내려받기 200', raRes.status() === 200)
  const ctxRA2 = await browser.newContext(); await ctxRA2.addCookies([cookie(SEC)]); const pRA2 = await ctxRA2.newPage()
  await pRA2.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  ok('리포트 반출 감사: 감사 로그에 반출 기록(누가 무엇을 몇 건)', ((await pRA2.textContent('body')) || '').includes('리포트 반출'))
  // AI 제안 판정(승인·반려)은 감사 로그에 target: INS-… 로 남는데 딥링크 매핑이 없어 텍스트로만 찍혔다 —
  //  판정 화면(/ai/insights)이 있는데 감사에서 그 제안으로 들어갈 경로가 없었다. 위 판정 테스트들이 실제 항목을 쌓아 둔다.
  const insAudit = (await pRA2.textContent('body')) || ''
  ok('감사 로그 딥링크: AI 제안 판정 대상(INS-)이 판정 화면으로 연결', /INS-/.test(insAudit) && (await pRA2.locator('a[href="/ai/insights"]').count()) > 0)
  await ctxRA2.close(); await ctxRA.close()
  // 대여 승인 미집행 통보 — 요청~승인 사이에 자산이 빠지면 집행 가드가 막는다(폐기 예정분 대여 방지). 그런데 그때 아무 신호가 없었다:
  //  승인 통보만 나가고 자산은 오지 않으며, 대여는 자산 신청·이동과 달리 '승인 후 미집행' 대기열이 없어 어디에도 드러나지 않는다.
  //  신청 → 같은 자산을 담당자가 먼저 직접 대여 → 승인 순으로 재현하고, 감사와 신청자 통보가 남는지 본다.
  const ctxLM = await browser.newContext(); await ctxLM.addCookies([cookie(ASSET)]); const pLM = await ctxLM.newPage()
  await pLM.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await pLM.locator('button', { hasText: /^신청하기$/ }).first().click() // 상신 폼은 접혀 있다
  await pLM.waitForTimeout(300)
  const lmForm = pLM.locator('.card', { hasText: '신청 상신' }).first()
  await lmForm.locator('select').first().selectOption({ label: '대여 (임시 반출)' })
  await pLM.waitForTimeout(300)
  const lmAssetSel = lmForm.locator('select').nth(1)
  const lmAssetNo = ((await lmAssetSel.inputValue()) || '').trim()
  ok('대여 승인 미집행: 대여 신청 대상 유휴 자산 확보', /^AST-/.test(lmAssetNo))
  await lmForm.locator('input[type="date"]').first().fill('2026-12-31')
  await lmForm.locator('textarea[placeholder="신청 사유"]').first().fill('e2e — 대여 승인 미집행 통보 회귀')
  await lmForm.locator('button', { hasText: /^상신$/ }).first().click()
  await pLM.waitForTimeout(900)
  // 담당자가 같은 자산을 먼저 직접 대여 처리 → 승인 시점엔 유휴가 아니다
  await pLM.goto(`${BASE}/assets/register?sel=${lmAssetNo}`, { waitUntil: 'networkidle' })
  await pLM.locator('button', { hasText: /^대여 처리 \(반출\)$/ }).first().click()
  await pLM.waitForTimeout(300)
  const lmLoan = pLM.locator('div.vstack', { hasText: '대여 처리 (반출)' }).last() // 상세 패널의 대여 입력 묶음
  await lmLoan.locator('input[placeholder="대여자 (성명)"]').fill('선점자')
  await lmLoan.locator('input[placeholder="부서"]').fill('인재개발팀')
  // 반환 기한은 오늘+5일 — 아래에서 '다가오는 일정' 아젠다(향후 30일)에 대여 반환이 잡히는지 함께 확인한다(고정 날짜면 시간이 지나며 창을 벗어난다)
  const lmDue = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  await lmLoan.locator('input[type="date"]').first().fill(lmDue)
  await lmLoan.locator('button', { hasText: /^대여 확정$/ }).first().click() // 확정 버튼 라벨은 '대여 확정'
  await pLM.waitForTimeout(900)
  await ctxLM.close()
  const ctxLM2 = await browser.newContext(); await ctxLM2.addCookies([cookie(ADMIN)]); const pLM2 = await ctxLM2.newPage()
  await pLM2.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const lmRow = pLM2.locator('tbody tr', { hasText: lmAssetNo }).filter({ hasText: '대여' }).first() // 목록에 신청 사유는 안 나온다 — 자산번호로 잡는다
  await lmRow.locator('td button', { hasText: /^승인$/ }).first().click()
  await pLM2.waitForTimeout(1000)
  await pLM2.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  const lmAudit = (await pLM2.textContent('body')) || ''
  ok('대여 승인 미집행: 사유와 함께 감사에 기록', lmAudit.includes('대여 승인 미집행'))
  ok('대여 승인 미집행: 신청자에게 재신청 안내 통보', lmAudit.includes('더 이상 대여할 수 없어 집행되지 않았습니다'))
  // 다가오는 일정 아젠다 — 대여 반환 기한은 연체·반환 임박 큐만 다루고 아젠다에는 빠져 있었다(도입 예정 입고도 같은 누락).
  //  '경과분은 반응형 큐, 예정분은 아젠다'라는 분담대로면 아직 도래 전인 반환 기한이 아젠다에 있어야 한다. 위에서 오늘+5일로 대여했다.
  await pLM2.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const lmBefore = await pLM2.locator('.msg.assistant .bub').count() // 어시스턴트 입력은 .chat-in input · Enter 전송(위 ask 헬퍼와 동일 규약)
  await pLM2.locator('.chat-in input').fill('다가오는 일정 알려줘')
  await pLM2.locator('.chat-in input').press('Enter')
  await pLM2.waitForFunction((n2) => document.querySelectorAll('.msg.assistant .bub').length > n2, lmBefore, { timeout: 8000 })
  // 답변 말풍선은 '분석 중…' 자리표시자로 먼저 뜬다 — 실제 답으로 바뀔 때까지 기다린다(자리표시자를 읽으면 항상 실패한다)
  await pLM2.waitForFunction(() => { const b = document.querySelectorAll('.msg.assistant .bub'); return b.length > 0 && !(b[b.length - 1].textContent || '').includes('분석 중') }, null, { timeout: 15000 })
  const lmAgenda = (await pLM2.locator('.msg.assistant .bub').last().textContent()) || ''
  ok('다가오는 일정: 대여 반환 기한이 아젠다에 편입(유형별 집계 포함)', /대여 반환 [1-9]/.test(lmAgenda))
  await ctxLM2.close()
  // 리포트 종류 전수 생성 — 17종 중 스위트가 실제로 만들어 보는 건 소수였다. 빌더가 특정 데이터 형태에서
  //  던지거나 빈 섹션을 내도 아무도 모른다(생성은 서버 액션이라 스모크로는 못 만든다). 화면에서 전 종류를 눌러
  //  각 리포트가 실제 섹션을 갖고 나오는지 본다 — '섹션 정의 없음'은 종류 추가 시 분기 누락을 알리는 폴백 문구다.
  const ctxRK = await browser.newContext(); await ctxRK.addCookies([cookie(ADMIN)]); const pRK = await ctxRK.newPage()
  await pRK.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  const rkCard = pRK.locator('.card', { hasText: '리포트 유형' }).first()
  const rkKinds = (await rkCard.locator('tbody tr td.strong').allTextContents()).map((t) => t.trim()).filter(Boolean)
  ok(`리포트 전수 생성: 종류 목록 확보 (${rkKinds.length}종)`, rkKinds.length >= 17)
  let rkFail = ''
  for (const kind of rkKinds) {
    await rkCard.locator('tr', { hasText: kind }).first().locator('button', { hasText: /^생성$/ }).click()
    await pRK.waitForTimeout(700)
    const body = (await pRK.textContent('body')) || ''
    if (body.includes('섹션 정의 없음')) { rkFail = `${kind}: 섹션 정의 없음`; break }
    if (!body.includes(kind)) { rkFail = `${kind}: 생성 결과 미표시`; break }
  }
  ok('리포트 전수 생성: 전 종류가 섹션을 갖춘 리포트로 생성', rkFail === '', rkFail)
  await ctxRK.close()
  // 스캔 수집 시간대 범위 검증 — 형식만 맞고 범위를 벗어난 값이 저장되면 §07 시간대 안전장치가 조용히 뒤집힌다.
  //  '99:99 ~ 88:77' 은 분 환산 경계가 현재 시각(최대 1439분)보다 커져 자정 넘김 창으로 해석되고 항상 참이 된다(창 밖 능동 스캔 무제한 통과).
  //  형식 오류와 범위 오류를 각각 거부하고, 정상 값은 그대로 저장되는지까지 본다.
  const ctxWIN = await browser.newContext(); await ctxWIN.addCookies([cookie(ADMIN)]); const pWIN = await ctxWIN.newPage()
  await pWIN.goto(`${BASE}/settings/scan-policy`, { waitUntil: 'networkidle' })
  const winRow = pWIN.locator('tr', { has: pWIN.locator('td', { hasText: '네트워크 능동 스캔' }) }).first()
  await winRow.locator('button', { hasText: /^정책 편집$/ }).click()
  await pWIN.waitForTimeout(300)
  const winInput = winRow.locator('input[placeholder="23:00 ~ 05:00"]')
  await winInput.fill('99:99 ~ 88:77')
  await winRow.locator('button', { hasText: /^저장$/ }).first().click()
  await pWIN.waitForTimeout(700)
  ok('스캔 시간대: 범위 밖 시·분 거부(형식만 맞는 값으로 시간대 가드가 뒤집히지 않게)', ((await pWIN.textContent('body')) || '').includes('00~23'))
  await winInput.fill('밤에만')
  await winRow.locator('button', { hasText: /^저장$/ }).first().click()
  await pWIN.waitForTimeout(700)
  ok('스캔 시간대: 형식 오류 거부', ((await pWIN.textContent('body')) || '').includes("'HH:MM ~ HH:MM'"))
  await winInput.fill('22:00 ~ 06:00')
  await winRow.locator('button', { hasText: /^저장$/ }).first().click()
  await pWIN.waitForTimeout(800)
  ok('스캔 시간대: 정상 값은 저장(정규화된 HH:MM 창)', ((await pWIN.textContent('body')) || '').includes('22:00 ~ 06:00'))
  await ctxWIN.close()
  // 결재선 변경 후 단계 재고정 — 상신 뒤 Admin 이 결재선을 바꿔 현재 단계가 결재선에서 사라지면, 예전엔 이를
  //  '결재선 없음'(라이선스 품의 같은 시스템 상신)과 똑같이 취급해 마지막 단계로 보고 레거시 역할(격리=보안담당·
  //  그 외=자산담당)이 한 번의 승인으로 확정했다 — 화면은 새 결재선을 보여주는데 실제로는 그 단계들을 전부
  //  건너뛰어 결재선 변경이 통제가 아니라 구멍이 됐다. 이제 남은 경로의 처음으로 재고정한다.
  const alNote = '결재선 재고정 회귀'
  const ctxAL = await browser.newContext(); await ctxAL.addCookies([cookie(USER)]); const pAL = await ctxAL.newPage()
  await pAL.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await pAL.locator('button', { hasText: /^신청하기$/ }).click()
  await pAL.locator('textarea[placeholder="신청 사유"]').fill(alNote)
  await pAL.locator('button', { hasText: /^상신$/ }).click()
  await pAL.waitForTimeout(900)
  const alRow = pAL.locator('tr', { hasText: alNote }).first()
  ok('결재선 재고정: 자산 신청 상신 → 기본 결재선 첫 단계(부서장)에서 대기', ((await alRow.textContent()) || '').includes('부서장'))
  await ctxAL.close()

  // Admin 이 결재선을 [보안담당 → IT기획팀장] 으로 바꾼다 — 방금 상신한 건의 현재 단계(부서장)가 사라진다.
  const ctxAL2 = await browser.newContext(); await ctxAL2.addCookies([cookie(ADMIN)]); const pAL2 = await ctxAL2.newPage()
  await pAL2.goto(`${BASE}/settings/users`, { waitUntil: 'networkidle' })
  const alLine = pAL2.locator('tr', { has: pAL2.locator('td', { hasText: '자산 신청' }) }).first()
  await alLine.locator('button', { hasText: /^편집$/ }).click()
  await pAL2.waitForTimeout(300)
  await alLine.locator('label', { hasText: '부서장' }).locator('input').uncheck()
  await alLine.locator('label', { hasText: '자산담당' }).locator('input').uncheck()
  await alLine.locator('label', { hasText: '보안담당' }).locator('input').check()
  await alLine.locator('label', { hasText: 'IT기획팀장' }).locator('input').check()
  await alLine.locator('button', { hasText: /^저장$/ }).click()
  await pAL2.waitForTimeout(900)
  ok('결재선 재고정: 결재선 변경 저장(보안담당 → IT기획팀장)', ((await pAL2.textContent('body')) || '').includes('보안담당 → IT기획팀장'))

  // 자산담당(레거시 역할)은 이 건을 결재할 수 없다 — 새 결재선의 첫 단계는 보안담당이다.
  const ctxAL3 = await browser.newContext(); await ctxAL3.addCookies([cookie(ASSET)]); const pAL3 = await ctxAL3.newPage()
  await pAL3.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const alRowAsset = pAL3.locator('tr', { hasText: alNote }).first()
  ok('결재선 재고정: 사라진 단계를 레거시 역할(자산담당)이 한 번에 확정하지 못함',
    (await alRowAsset.locator('button', { hasText: /^승인$/ }).count()) === 0)
  await ctxAL3.close()

  // 보안담당은 결재할 수 있고, 승인해도 확정이 아니라 다음 단계(IT기획팀장)로 넘어간다.
  const ctxAL4 = await browser.newContext(); await ctxAL4.addCookies([cookie(SEC)]); const pAL4 = await ctxAL4.newPage()
  await pAL4.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const alRowSec = pAL4.locator('tr', { hasText: alNote }).first()
  ok('결재선 재고정: 새 결재선 첫 단계(보안담당)가 결재 가능', (await alRowSec.locator('button', { hasText: /^승인$/ }).count()) === 1)
  await alRowSec.locator('button', { hasText: /^승인$/ }).click()
  await pAL4.waitForTimeout(900)
  ok('결재선 재고정: 승인이 확정이 아니라 다음 단계로 진행(새 결재선 집행)',
    ((await pAL4.textContent('body')) || '').includes('다음 단계'))
  await ctxAL4.close()

  // 결재선 원복 — 이후 검사가 기본 결재선(부서장 → 자산담당)을 전제한다.
  await pAL2.goto(`${BASE}/settings/users`, { waitUntil: 'networkidle' })
  const alLineBack = pAL2.locator('tr', { has: pAL2.locator('td', { hasText: '자산 신청' }) }).first()
  await alLineBack.locator('button', { hasText: /^편집$/ }).click()
  await pAL2.waitForTimeout(300)
  await alLineBack.locator('label', { hasText: '보안담당' }).locator('input').uncheck()
  await alLineBack.locator('label', { hasText: 'IT기획팀장' }).locator('input').uncheck()
  await alLineBack.locator('label', { hasText: '부서장' }).locator('input').check()
  await alLineBack.locator('label', { hasText: '자산담당' }).locator('input').check()
  await alLineBack.locator('button', { hasText: /^저장$/ }).click()
  await pAL2.waitForTimeout(900)
  ok('결재선 재고정: 기본 결재선 원복(부서장 → 자산담당)', ((await pAL2.textContent('body')) || '').includes('부서장 → 자산담당'))
  await ctxAL2.close()
  // 자산 문서 발급 링크 ↔ API 가드 정합 — 대여 확인서·인수인계서·분실 신고서 라우트는 자산 운영 문서라 자산담당·Admin
  //  전용인데(각 route.ts 403), 화면은 대여 확인서를 역할 게이트 없이 내주고 인수인계서·분실 신고서는 canEdit(사용자만 제외)로
  //  걸어 보안담당에게도 보였다 — 눌러야 403 이 나는 막다른 길이다(권한이 없으면 컨트롤을 아예 내주지 않는다는 규약 위반).
  //  화면 게이트를 API 가드와 같은 집합(canDoc)으로 맞춘다.
  const docLinks = 'a[href^="/api/handover-sheet/"], a[href^="/api/loan-agreement/"], a[href^="/api/loss-report/"]'
  const firstAssetNo = async (page, query) => {
    await page.goto(`${BASE}/assets/register${query}`, { waitUntil: 'networkidle' })
    const cell = page.locator('tbody tr.clickable').first().locator('td').filter({ hasText: /^AST-\d{4}-\d{6}$/ }).first()
    return ((await cell.textContent()) || '').trim()
  }
  const ctxDOC = await browser.newContext(); await ctxDOC.addCookies([cookie(ASSET)]); const pDOC = await ctxDOC.newPage()
  const docAsset = await firstAssetNo(pDOC, '?status=사용중')
  await pDOC.goto(`${BASE}/assets/register?sel=${docAsset}`, { waitUntil: 'networkidle' })
  ok(`자산 문서 게이트: 자산담당 상세에는 문서 발급 링크 노출 (${docAsset})`, (await pDOC.locator(docLinks).count()) >= 1)
  await ctxDOC.close()

  const ctxDOC2 = await browser.newContext(); await ctxDOC2.addCookies([cookie(SEC)]); const pDOC2 = await ctxDOC2.newPage()
  await pDOC2.goto(`${BASE}/assets/register?sel=${docAsset}`, { waitUntil: 'networkidle' })
  ok('자산 문서 게이트: 보안담당 상세에는 문서 발급 링크 미노출(막다른 길 제거)', (await pDOC2.locator(docLinks).count()) === 0)
  ok('자산 문서 게이트: 보안담당의 인수인계서 API 는 403 — 화면 게이트가 API 가드와 같은 집합',
    (await pDOC2.request.get(`${BASE}/api/handover-sheet/${docAsset}`)).status() === 403)
  await ctxDOC2.close()

  const ctxDOC3 = await browser.newContext(); await ctxDOC3.addCookies([cookie(USER)]); const pDOC3 = await ctxDOC3.newPage()
  const docUserAsset = await firstAssetNo(pDOC3, '')
  await pDOC3.goto(`${BASE}/assets/register?sel=${docUserAsset}`, { waitUntil: 'networkidle' })
  ok('자산 문서 게이트: 사용자 본인 자산 상세에도 문서 발급 링크 미노출', (await pDOC3.locator(docLinks).count()) === 0)
  await ctxDOC3.close()
  // 근거 리포트 링크 ↔ 리포트 열람 권한 정합 — 리포트 열람(/api/reports)은 비사용자 전용인데, 결재함은 첨부된
  //  근거 리포트를 역할 구분 없이 링크로 내줬다. 자산담당은 /ai/reports 의 '결재 첨부' 에서 대기 결재라면 무엇이든
  //  고를 수 있어(사용자가 올린 자산 신청 포함) 사용자 결재에 리포트가 붙고, 사용자는 눌러야 403 이 나는 링크를 본다.
  //  사용자에게는 첨부 사실(리포트 ID)만 텍스트로 남기고 링크는 내주지 않는다.
  const rplNote = '근거 리포트 링크 회귀'
  const ctxRPL = await browser.newContext(); await ctxRPL.addCookies([cookie(USER)]); const pRPL = await ctxRPL.newPage()
  await pRPL.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await pRPL.locator('button', { hasText: /^신청하기$/ }).click()
  await pRPL.locator('textarea[placeholder="신청 사유"]').fill(rplNote)
  await pRPL.locator('button', { hasText: /^상신$/ }).click()
  await pRPL.waitForTimeout(900)
  const rplId = ((await pRPL.locator('tr', { hasText: rplNote }).first().locator('td').filter({ hasText: /^APR-/ }).first().textContent()) || '').trim()
  ok(`근거 리포트 링크: 사용자 상신 결재 생성 (${rplId})`, /^APR-/.test(rplId))

  // 자산담당이 그 사용자 결재에 근거 리포트를 첨부한다(리포트는 앞의 전수 생성 검사로 이미 쌓여 있다).
  const ctxRPL2 = await browser.newContext(); await ctxRPL2.addCookies([cookie(ASSET)]); const pRPL2 = await ctxRPL2.newPage()
  await pRPL2.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await pRPL2.locator('button', { hasText: /^펼치기$/ }).first().click()
  await pRPL2.waitForTimeout(400)
  await pRPL2.locator('select').filter({ hasText: rplId }).first().selectOption(rplId)
  await pRPL2.locator('button', { hasText: /^첨부$/ }).click()
  await pRPL2.waitForTimeout(900)
  ok('근거 리포트 링크: 사용자 결재에 리포트 첨부 성공(첨부 경로가 실재함)',
    ((await pRPL2.textContent('body')) || '').includes('결재에 첨부했습니다'))

  const rplLink = 'a[href^="/api/reports/"]'
  await pRPL2.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const rplRowMgr = pRPL2.locator('tr', { hasText: rplNote }).first()
  ok('근거 리포트 링크: 자산담당에게는 리포트 링크 노출(양성 대조)', (await rplRowMgr.locator(rplLink).count()) >= 1)
  await ctxRPL2.close()

  await pRPL.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  const rplRowUser = pRPL.locator('tr', { hasText: rplNote }).first()
  const rplRowText = (await rplRowUser.textContent()) || ''
  ok('근거 리포트 링크: 사용자에게는 첨부 사실만 텍스트로(막다른 링크 제거)',
    rplRowText.includes('근거 리포트') && (await rplRowUser.locator(rplLink).count()) === 0)
  ok('근거 리포트 링크: 사용자의 리포트 열람 API 는 403 — 화면 게이트와 같은 집합',
    (await pRPL.request.get(`${BASE}/api/reports/RPT-0001?format=md`)).status() === 403)
  await ctxRPL.close()
  // 재물조사 결과 요약 리포트의 '조정 결재 대상' 절 — 세 숫자가 한 문단 안에서 서로 맞아야 한다.
  //  누적 차이는 회차 카운터(round.mismatched)를 더해 왔는데, 그 카운터는 진행 중 회차에선 미조치 수이고 완료
  //  회차에선 당시 발견 수라 성격이 섞인다. 그래서 같은 문단에서 누적 20건인데 완료 0 + 미해결 6 으로 합이
  //  안 맞았고, 조정이 승인될수록 카운터가 줄어 '누적'이 감소했다. 이제 차이 행에서 세므로 항상 누적 = 완료 + 미해결.
  const ctxRS = await browser.newContext(); await ctxRS.addCookies([cookie(ADMIN)]); const pRS = await ctxRS.newPage()
  await pRS.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })
  await pRS.locator('.card', { hasText: '리포트 유형' }).first()
    .locator('tr', { hasText: '재물조사 결과 요약' }).first().locator('button', { hasText: /^생성$/ }).click()
  await pRS.waitForTimeout(900)
  // 생성 이력 표의 행만 고른다 — 유형 표에는 '문서' 링크가 없으므로 그 링크 유무로 두 표를 가른다.
  const rsRow = pRS.locator('tr').filter({ hasText: '재물조사 결과 요약' })
    .filter({ has: pRS.locator('a', { hasText: '문서' }) }).first()
  const rsHref = (await rsRow.locator('a', { hasText: '문서' }).first().getAttribute('href')) || ''
  ok(`재물조사 리포트: 생성·문서 링크 확보 (${rsHref})`, rsHref.includes('/api/reports/RPT-'))
  const rsMd = await (await pRS.request.get(`${BASE}${rsHref}`)).text()
  const rsTotal = Number((/누적 차이 (\d+)건/.exec(rsMd) || [])[1] ?? -1)
  const rsDone = Number((/조정 완료 (\d+)건/.exec(rsMd) || [])[1] ?? -1)
  const rsOpen = Number((/미해결 (\d+)건/.exec(rsMd) || [])[1] ?? -1)
  ok(`재물조사 리포트: 누적 차이(${rsTotal}) = 조정 완료(${rsDone}) + 미해결(${rsOpen}) — 한 문단 안 수치 정합`,
    rsTotal >= 0 && rsDone >= 0 && rsOpen >= 0 && rsTotal === rsDone + rsOpen)
  await ctxRS.close()
  // 발주 미이행 위험 — 입고가 한 건도 없는 구매 계약이 위험 판정에서 통째로 빠져 있었다. 소진률 0% 는 미이행의
  //  극단인데, 로트가 있는 계약만 대상으로 삼아 '아무것도 안 들어온 계약일수록 안 보이는' 역설이 있었다.
  //  만료가 임박(90일 이내)한 무입고 구매 계약을 만들어 표와 위험 집계에 함께 잡히는지 본다(집계=목록 정합).
  const ctxPRO = await browser.newContext(); await ctxPRO.addCookies([cookie(ASSET)]); const pPRO = await ctxPRO.newPage()
  await pPRO.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const prRiskOf = async () => Number((await pPRO.locator('.stat', { hasText: '발주 미이행 · 만료 임박' }).first()
    .locator('.v').first().textContent()) || '-1')
  const prBefore = await prRiskOf()
  const prName = '발주 미이행 회귀 계약'
  const prEnd = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  await pPRO.locator('button', { hasText: /계약 등록$/ }).first().click()
  await pPRO.waitForTimeout(300)
  await pPRO.locator('input[placeholder="계약명"]').fill(prName)
  await pPRO.locator('input[placeholder="공급사"]').fill('회귀상사')
  await pPRO.locator('input[placeholder="주관부서"]').fill('자산관리팀')
  const prDates = pPRO.locator('input[placeholder="YYYY-MM-DD"]')
  await prDates.nth(0).fill('2026-01-02')
  await prDates.nth(1).fill(prEnd)
  await pPRO.locator('input[type="number"]').first().fill('10000000')
  await pPRO.locator('button', { hasText: /^등록$/ }).first().click()
  await pPRO.waitForTimeout(900)
  await pPRO.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const prCard = pPRO.locator('.card', { hasText: '구매 계약 발주·검수 이행 현황' }).first()
  ok('발주 이행 현황: 입고 없는 구매 계약도 표에 노출(소진률 0%)',
    (await prCard.locator('tr', { hasText: prName }).count()) >= 1)
  const prAfter = await prRiskOf()
  ok(`발주 미이행 집계: 무입고·만료 임박 계약이 위험으로 잡힘 (${prBefore} → ${prAfter})`, prAfter === prBefore + 1)
  await ctxPRO.close()
  // 수리 예상 반환일 미기재 — eta 는 선택 입력이라 업체가 일정을 안 준 채 수리 의뢰만 접수될 수 있는데,
  //  지연 판정(isRepairOverdue)은 eta 경과로만 계산해 그런 건은 영영 독촉 대상이 아니었다. 정작 그 통보의
  //  문구가 '진행 상황·반환 일정 회신 요청'이라, 일정을 못 받은 건이야말로 보내야 할 대상이다.
  //  버튼 건수도 실제 발송 대상과 같은 집합이어야 한다(눌러도 안 나가는 건수가 생기지 않게).
  const ctxREP = await browser.newContext(); await ctxREP.addCookies([cookie(ASSET)]); const pREP = await ctxREP.newPage()
  // 시작 시점의 독촉 대상 건수 — 일정 미회신 건을 만든 뒤 정확히 1 늘어야 한다(다른 지연 건에 묻히지 않게).
  await pREP.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const repBtnBefore = Number((/(\d+)건/.exec((await pREP.locator('button', { hasText: /업체 독촉 발송/ }).first().textContent().catch(() => '')) || '') || [])[1] ?? 0)
  // 수리 대기 자산을 직접 만든다 — 앞선 검사들이 시드 수리 건을 모두 처리했을 수 있어 남은 것에 기대지 않는다.
  await pREP.goto(`${BASE}/assets/register?status=사용중`, { waitUntil: 'networkidle' })
  const repNo = ((await pREP.locator('tbody tr.clickable').first().locator('td')
    .filter({ hasText: /^AST-\d{4}-\d{6}$/ }).first().textContent()) || '').trim()
  await pREP.goto(`${BASE}/assets/register?sel=${repNo}`, { waitUntil: 'networkidle' })
  await pREP.locator('button', { hasText: /^장애 신고 \(수리 요청\)$/ }).first().click()
  await pREP.locator('input[placeholder^="장애 증상"]').fill('회귀 — 수리 의뢰 일정 확인용')
  await pREP.locator('button', { hasText: /^신고 접수$/ }).click()
  await pREP.waitForTimeout(900)
  ok(`수리 일정 미회신: 수리 대기 자산 생성 (${repNo})`, /^AST-/.test(repNo))
  await pREP.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const repRow = pREP.locator('tr', { hasText: repNo }).first()
  // 업체만 넣고 예상 반환일은 비운 채 의뢰 — 일정 미회신 상태를 만든다(재의뢰는 eta 를 덮어쓴다).
  await repRow.locator('input[placeholder="수리 업체"]').fill('회귀수리센터')
  await repRow.locator('input[title="예상 반환일"]').fill('')
  await repRow.locator('button', { hasText: /^의뢰$/ }).click()
  await pREP.waitForTimeout(900)
  await pREP.goto(`${BASE}/assets/returns`, { waitUntil: 'networkidle' })
  const repBtnText = (await pREP.locator('button', { hasText: /업체 독촉 발송/ }).first().textContent()) || ''
  const repBtnN = Number((/(\d+)건/.exec(repBtnText) || [])[1] ?? -1)
  ok(`수리 일정 미회신: 독촉 대상 건수가 정확히 1 증가 (${repBtnBefore} → ${repBtnN})`, repBtnN === repBtnBefore + 1)
  await pREP.locator('button', { hasText: /업체 독촉 발송/ }).first().click()
  await pREP.waitForTimeout(900)
  ok('수리 일정 미회신: 독촉 발송 성공', ((await pREP.textContent('body')) || '').includes('수리 업체 독촉'))
  await pREP.goto(`${BASE}/platform/integrations`, { waitUntil: 'networkidle' })
  // 같은 행에서 자산번호와 '예상 반환일 미회신'이 함께 잡혀야 한다 — 페이지 어딘가에 두 문자열이 따로 있는 것으로는
  //  이 건이 실제로 그 제목으로 발송됐다고 말할 수 없다(장애 신고 통보에도 자산번호가 들어간다).
  const repLogRows = await pREP.locator('tr').filter({ hasText: repNo })
    .filter({ hasText: '예상 반환일 미회신' }).count()
  ok(`수리 일정 미회신: 발송 이력에 '예상 반환일 미회신' 통보 적재 (${repNo})`, repLogRows >= 1)
  await ctxREP.close()
  // 휴면 경과일은 저장값이 아니라 마지막 로그인에서 파생해야 한다 — 저장 카운터는 갱신되지 않아 시간이 지나면
  //  같은 행 안에서 '마지막 로그인'과 '경과일'이 서로 다른 이야기를 한다(시드 기준 24일 차이였다).
  //  로그인 이력이 없는 계정은 경과일을 셀 수 없으므로 숫자를 지어내지 않고 '이력 없음'으로 적고 강조한다.
  const ctxDM = await browser.newContext(); await ctxDM.addCookies([cookie(SEC)]); const pDM = await ctxDM.newPage()
  await pDM.goto(`${BASE}/discovery/found`, { waitUntil: 'networkidle' })
  const dmCells = await pDM.locator('tr', { has: pDM.locator('td', { hasText: 'sh.oh' }) }).first().locator('td').allTextContents()
  const dmLast = dmCells.find((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.trim()))
  const dmIdx = dmCells.findIndex((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.trim()))
  const dmShown = Number((dmCells[dmIdx + 1] || '').trim())
  const dmExpect = Math.round((Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${dmLast}T00:00:00Z`)) / 86_400_000)
  ok(`휴면 경과일: 마지막 로그인(${dmLast})에서 파생 — 표시 ${dmShown}일 ≈ 계산 ${dmExpect}일`,
    Number.isFinite(dmShown) && Math.abs(dmShown - dmExpect) <= 1)
  const dmNoLogin = (await pDM.locator('tr', { has: pDM.locator('td', { hasText: 'jh.lim' }) }).first().textContent()) || ''
  ok('휴면 경과일: 로그인 이력 없는 계정은 숫자를 지어내지 않고 이력 없음으로 표기',
    dmNoLogin.includes('이력 없음') && !/\b402\b/.test(dmNoLogin))
  await ctxDM.close()
  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail ? 1 : 0)
