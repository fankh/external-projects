/* 보안 findings 대응 + AI 제안 판정 인터랙티브 e2e — SSR 스모크가 못 잡는 클릭·상태 전환·역할 게이트를 실제 브라우저로 검증한다.
 * 대상: 크리덴셜 노출(45)·휴면 계정(46)·미인가 SW(47)·USB(48)·로컬 VM(49)·IOC 상관(50) 대응 + AI 제안 판정(11, 승인→조치·반려 사유 필수).
 * 실행: npm run e2e   (원격 배포본: E2E_BASE=http://localhost:3390 npm run e2e)
 * 신선한 인메모리 시드에서 시작(ITAM_DATA_FILE 미설정)하므로 결정적. */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  let after = -1
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(200)
    after = await row().locator('button').count()
    if (after === 0) break
  }
  ok(`${name}: 조치 클릭 → 상태 전환(버튼 소거·칩 노출)`, after === 0)
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
  const q2 = await ask('2099년 1분기 보증 만료 자산')
  ok('AI 기간질의: 먼 미래 → 해당 없음 메시지', q2.includes('2099년 1분기') && q2.includes('보증이 만료되는 자산이 없습니다'))
  const q3 = await ask('보증 만료되는 네트워크 장비 목록')
  ok('AI 기간질의: 기간 미지정 → 임박순 폴백', q3.includes('만료 임박순') && !/ ~ 20\d{2}-/.test(q3))

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
  // 취약점 우선순위·이상 탐지 인라인 질의(AI 기능 04·02) — 컴퓨티드 산출을 자연어로 조회(리포트 생성과 별개)
  const rv = await ask('취약점 조치 우선순위 알려줘')
  ok('AI 취약점질의: P1/P2/P3 인라인 요약(리포트 생성 아님)', /취약점 조치 우선순위 — 총 \d+건/.test(rv) && rv.includes('P1 즉시') && !rv.includes('리포트를 생성했습니다'))
  const ra = await ask('이상 탐지 현황 알려줘')
  ok('AI 이상탐지질의: 프로파일 이탈 인라인 요약(유휴 자산 사용 AST-2021-000432)', /이상 자산 행위 탐지 — 총 \d+건/.test(ra) && ra.includes('평시 프로파일') && ra.includes('AST-2021-000432'))
  // 부서별 자산 보유 질의 — '분포'가 상태별 인텐트에도 걸리므로, '부서' 질의가 부서 집계로 정확히 라우팅되는지 확인
  const rd = await ask('부서별 자산 보유 현황 알려줘')
  ok('AI 부서질의: 부서별 자산 보유 집계(상태별 분포 인텐트와 분리)', rd.includes('부서별 자산 보유 현황') && /대 \(사용중 \d+\)/.test(rd) && !rd.includes('상태별 분포'))
  // 정기 점검(예방 정비) 대상 질의 — 대장 필터·대시보드 큐와 같은 lib/dates 판정으로 경과·임박을 나눠 답한다(시드 AST-2022-000640/641 경과)
  const rm = await ask('정기 점검(예방 정비) 대상 자산 알려줘')
  ok('AI 정기점검질의: 예방 정비 대상 경과·임박 분류 답변', rm.includes('정기 점검(예방 정비) 대상') && rm.includes('예정일 경과(미시행)') && rm.includes('AST-2022-000641'))
  // 안전재고 부족 질의 — 재고 화면·대시보드와 같은 lib/stock 판정. 주변기기(유휴 1대)는 안전재고 2 미만이라 항상 부족(단말은 폐기 반려 복원 타이밍에 따라 가변이라 주변기기로 검증).
  const rs = await ask('안전재고 부족한 유형 알려줘')
  ok('AI 안전재고질의: 발주 검토 대상 유형·부족 수량 답변', rs.includes('안전재고 미달(발주 검토)') && rs.includes('주변기기') && rs.includes('부족'))
  // 수령 미확인 질의 — 인수 미확인 사용 중 자산(receiptPending·사용중). 이 시점엔 시드 2건(000015·000221)이 각각 확인·회수로 해제돼 '모두 확인' 응답(status 게이트가 스테일 제외).
  const rr = await ask('수령 미확인 자산 알려줘')
  ok('AI 수령미확인질의: 인수 확인 완료 시 모두 확인 응답(스테일 제외)', rr.includes('수령(인수) 확인이 안 된 자산이 없습니다') || rr.includes('수령(인수) 미확인 자산 현황'))
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
  // 감사 대응 자료 리포트에 이상 자산 행위 탐지(fn02) 섹션이 실제 생성됨 — fn02가 유일하게 리포트 미커버였던 공백 해소.
  // 유휴 자산 사용(미승인 불출 AST-2021-000432)은 위협 대응 카운트 섹션엔 없는 행위 이상이라, 이 섹션이 없으면 감사 증적에서 누락된다.
  const r3 = await ask('감사 대응 자료 리포트 생성해줘')
  ok('AI 감사질의: 감사 대응 자료 생성 분기', r3.includes('리포트를 생성했습니다'))
  const aHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const aid = decodeURIComponent((aHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const ax = await page.request.get(`${BASE}/api/reports/${encodeURIComponent(aid)}?format=xlsx`)
  const atext = Buffer.from(await ax.body()).toString('utf8')
  ok('리포트 반출: 감사 대응 자료 xlsx 에 이상 자산 행위 탐지 섹션(fn02·유휴 자산 사용) 실린다', atext.includes('이상 자산 행위 탐지') && atext.includes('유휴 자산 사용') && atext.includes('AST-2021-000432'))
  // 부서별 IT 비용 배분(차지백) 리포트 — 자연어 생성 인텐트가 신규 종류를 매칭하고, buildSections 가 부서별 원가·좌석 비용 섹션을 실제 산출.
  const r4 = await ask('부서별 IT 비용 배분 리포트 생성해줘')
  ok('AI 차지백질의: 부서별 IT 비용 배분 생성 분기', r4.includes('리포트를 생성했습니다'))
  const cHref = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const cid = decodeURIComponent((cHref.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  const cx = await page.request.get(`${BASE}/api/reports/${encodeURIComponent(cid)}?format=xlsx`)
  const ctext = Buffer.from(await cx.body()).toString('utf8')
  ok('리포트 반출: 부서별 IT 비용 배분 xlsx 에 원가·좌석·유지보수 계약 섹션 실린다', ctext.includes('부서별 IT 자산 원가') && ctext.includes('부서별 라이선스 좌석 비용') && ctext.includes('부서별 유지보수 계약 비용') && ctext.includes('배분 요약'))
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

  // 특정 자산 조회(자산번호) — 상세·이력·레코드 딥링크
  const a1 = await ask('AST-2023-000112 자산의 상태와 변경 이력 알려줘')
  ok('AI 자산조회: 자산번호 상세+이력', a1.includes('AST-2023-000112') && a1.includes('변경 이력') && a1.includes('사용자'))
  const lastCard = page.locator('.msg.assistant').last()
  const href = await lastCard.locator('.refs a').first().getAttribute('href')
  ok('AI 자산조회: 레코드 단위 딥링크(?sel=)', href === '/assets/register?sel=AST-2023-000112')
  const a2 = await ask('AST-9999-000000 상태')
  ok('AI 자산조회: 미존재 자산 → 찾을 수 없음', a2.includes('찾을 수 없습니다'))

  // 결재 질의 역할 인지 — 전체 대기 중 '내가 결재할 수 있는 건'을 대시보드와 동일 게이트로 함께 제시.
  //  ADMIN 은 전 단계 오버라이드라 '내 결재 = 전체'(본인 상신분은 시드상 없음)
  const ap = await ask('결재 대기 현황 알려줘')
  const apTotal = Number((ap.match(/현재 결재 대기 (\d+)건/) || [])[1] ?? -1)
  const apMine = Number((ap.match(/지금 결재할 수 있는 건 (\d+)건/) || [])[1] ?? -2)
  ok('AI 결재질의: 역할 인지(내 결재 가능 수 표기)', ap.includes('지금 결재할 수 있는 건') && apMine >= 0 && apMine <= apTotal)
  ok('AI 결재질의: ADMIN 은 전 단계 결재 가능(내 결재 = 전체)', apTotal > 0 && apMine === apTotal)

  // 미인가 SaaS 부서 스코프 — 대장엔 있으나 SaaS 기록 없는 부서는 '해당 없음'으로 정확히(전체로 미확장)
  const sInfra = await ask('인프라운영팀에서 쓰는 미인가 SaaS 알려줘')
  ok('AI SaaS질의: SaaS 없는 부서 → 해당 없음(전체 미확장)', sInfra.includes('인프라운영팀에서 사용하는 미인가(Shadow) SaaS는 없습니다'))
  const sDev = await ask('플랫폼개발팀에서 쓰는 미인가 SaaS')
  ok('AI SaaS질의: SaaS 있는 부서 → 부서 스코프', sDev.includes('플랫폼개발팀의 미인가') || sDev.includes('플랫폼개발팀에서 사용하는'))
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
  await twoChoice(page, { name: '미인가 SW(47)', navTo: FOUND, cardText: '설치 SW 정책 위반', rowText: 'uTorrent', btnRe: /^제거 요청$/ })
  await twoChoice(page, { name: 'USB(48)', navTo: FOUND, cardText: '이동식 매체 정책 위반', rowText: 'Samsung T7 SSD', btnRe: /^차단$/ })
  await twoChoice(page, { name: '로컬 VM(49)', navTo: FOUND, cardText: '엔드포인트 VM 정책 위반', rowText: 'legacy-test', btnRe: /^회수$/ })

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
  await page.locator('button', { hasText: /^제외 해제/ }).click()
  await page.waitForTimeout(700)
  ok('발견 자산 관리 제외 해제 → 미등록 처리 대상 복귀(편입 요청 액션 재노출)', (await page.locator('button', { hasText: /^편입 요청 \(결재\)$/ }).count()) > 0)

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
  // 내 수리 현황 질의 — 방금 신고한 자산이 사용자 수리 현황에 증상과 함께 뜬다(장애 신고 루프의 사용자 추적 접점).
  await pU.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })
  const urc = await pU.locator('.msg.assistant .bub').count()
  await pU.locator('.chat-in input').fill('내 수리 현황')
  await pU.locator('.chat-in input').press('Enter')
  await pU.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, urc, { timeout: 8000 })
  await pU.waitForTimeout(150)
  const uRepair = (await pU.locator('.msg.assistant .bub').last().textContent()) || ''
  ok('사용자 AI 질의: 내 수리 현황 — 장애 신고 자산·증상 초점(AST-2024-000015·전원 불량)', uRepair.includes('AST-2024-000015') && uRepair.includes('전원 불량'))

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
  await opsCard.locator('button', { hasText: /^저장$/ }).click()
  await p3.waitForTimeout(700)
  ok('운영 정책: 변경 성공(확인기한 5일·만료창 60일)', (await p3.textContent('body')).includes('운영 정책 갱신'))
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
  // 반납 결재 승인 → 라이선스 좌석 자동 회수(로56 좌석 생애주기 버그픽스) — 담당자 회수·폐기뿐 아니라 사용자 반납 승인도 좌석을 회수한다. 시드 AST-2025-000513(LIC-001 좌석)·APR-2607-117.
  await p3.goto(`${BASE}/assets/register?sel=AST-2025-000513`, { waitUntil: 'networkidle' })
  ok('반납 좌석 회수 전: 배정 라이선스 역조회 노출(LIC-001)', ((await p3.locator('body').textContent()) || '').includes('배정 라이선스') && ((await p3.locator('body').textContent()) || '').includes('Microsoft 365'))
  await p3.goto(`${BASE}/workflow/approvals?sel=APR-2607-117`, { waitUntil: 'networkidle' })
  await p3.locator('tr', { has: p3.locator('td', { hasText: 'APR-2607-117' }) }).first().locator('button', { hasText: /^승인$/ }).click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/assets/register?sel=AST-2025-000513`, { waitUntil: 'networkidle' })
  const relBody = (await p3.locator('body').textContent()) || ''
  ok('반납 결재 승인 → 라이선스 좌석 자동 회수(이력 적재·역조회 소멸)', relBody.includes('라이선스 좌석 회수') && !relBody.includes('배정 라이선스'))
  // 양쪽 정합 — 사용 현황(Shadow SaaS)에서도 Linear 가 인가로 반영되어야 한다(카탈로그↔사용현황 이중 저장소 일치)
  await p3.goto(`${BASE}/discovery/saas`, { waitUntil: 'networkidle' })
  const linearUsage = p3.locator('tr').filter({ hasText: 'Linear' }).first()
  ok('SaaS 인가 요청 승인 → 사용 현황도 인가(카탈로그↔사용현황 정합)', (await linearUsage.count()) > 0 && ((await linearUsage.textContent()) || '').includes('인가'))
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

  await p3.goto(`${BASE}/inventory/contracts`, { waitUntil: 'networkidle' })
  const cHtml = await p3.content()
  ok('운영 정책 다운스트림: 계약 화면 만료 임박 창 60일', cHtml.includes('만료 60일 이내') && !cHtml.includes('만료 90일 이내'))
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
  // CMDB 대사 확인 — 등록·불일치에 대장 보정 링크 + 대사 확인(등록·일치 처리) 액션(v1.296 이후 액션 부재 공백 해소). 확인 시 등록·일치로 종결.
  ok('발견 대사: 등록·불일치에 대장 보정 링크·대사 확인 액션 노출', misBody.includes('대장에서 보정') && misBody.includes('대사 확인 (등록·일치 처리)'))
  await p3.locator('button', { hasText: '대사 확인 (등록·일치 처리)' }).first().click()
  await p3.waitForTimeout(700)
  await p3.goto(`${BASE}/discovery/found?sel=DSC-2607-0029`, { waitUntil: 'networkidle' })
  const mis029row = ((await p3.locator('tr', { has: p3.locator('td', { hasText: 'DSC-2607-0029' }) }).first().textContent()) || '')
  ok('발견 대사 확인: 등록·불일치 → 등록·일치 종결', mis029row.includes('등록·일치'))
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
  const lostScrap = p4.locator('button', { hasText: /^미회수 확정 → 폐기$/ })
  ok('분실 자산: 미회수 확정 → 폐기 조치 노출', (await lostScrap.count()) > 0)
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
  // IT기획팀장 단계 = ADMIN — 신규 ADMIN 컨텍스트로 차이 조정 승인(p3 는 이 시점 종료됨)
  const ctxAI = await browser.newContext()
  await ctxAI.addCookies([cookie(ADMIN)])
  const pAI = await ctxAI.newPage()
  await pAI.goto(`${BASE}/workflow/approvals`, { waitUntil: 'networkidle' })
  await pAI.locator('tr', { has: pAI.locator('text=2027 판교 범위 정기 재물조사') }).first().locator('button', { hasText: /^승인$/ }).click()
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

  // 발주 이행 독촉(§03 구매 계약 · 신호→조치 채널) — 발주 미이행 위험 판정(발주율 저조·만료 임박)에 조치 채널이 없던 공백을 닫는다. 시드 CT-2023-021 미이행 → 버튼 활성.
  const procBtn = p4.locator('button', { hasText: /^발주 이행 독촉 \(\d+\)$/ })
  ok('구매 계약: 발주 이행 독촉 버튼 노출(미이행 위험 배지 ≥1)', (await procBtn.count()) > 0 && !/\(0\)/.test(await procBtn.first().innerText()))
  await procBtn.first().click()
  await p4.waitForTimeout(800)
  ok('발주 이행 독촉: 발송 성공(주관부서·공급사·구매팀 · 발송 이력)', ((await p4.textContent('body')) || '').includes('발주 이행 독촉') && ((await p4.textContent('body')) || '').includes('발송'))

  // 입고 지연 독촉(§06 ITSM 납기 관리 · 검출→조치) — 납기 경과 발주 로트(시드 IN-2607-03)의 공급사에 납기 확인 독촉 발송
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  ok('도입·검수: 입고 지연 독촉 버튼 노출(발주처)', (await p4.locator('button', { hasText: /^입고 지연 독촉 발송 \d+건$/ }).count()) > 0)
  await p4.locator('button', { hasText: /^입고 지연 독촉 발송 \d+건$/ }).click()
  await p4.waitForTimeout(800)
  ok('입고 지연 독촉: 발주처 납기 확인 발송 성공(발송 이력)', (await p4.textContent('body')).includes('입고 지연 독촉') && (await p4.textContent('body')).includes('발송'))

  // 검수 반려 → 반품 완료(교체 없음) 종결 — 재검수의 짝. 시드 IN-2607-04(검수 반려) 마감 후 대시보드 백로그에서 제외
  await p4.goto(`${BASE}/assets/intake`, { waitUntil: 'networkidle' })
  await p4.locator('tr.clickable', { has: p4.locator('td', { hasText: 'IN-2607-04' }) }).first().click()
  await p4.waitForTimeout(200)
  await p4.locator('button', { hasText: /^반품 완료 \(교체 없음\)$/ }).click()
  await p4.waitForTimeout(800)
  ok('도입·검수: 검수 반려 → 반품 완료 종결', (await p4.textContent('body')).includes('반품 완료'))
  await p4.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  ok('검수 반려 → 반품 완료: 대시보드 백로그에서 제외', !(await p4.textContent('body')).includes('검수 반려 (재검수 · 반품 확인)'))
  await ctx4.close()

  await browser.close()
} catch (err) {
  fail++
  console.error('실행 오류:', err instanceof Error ? err.message : err)
} finally {
  server?.kill()
}

console.log(`\n결과: ${pass} passed / ${fail} failed`)
process.exit(fail ? 1 : 0)
