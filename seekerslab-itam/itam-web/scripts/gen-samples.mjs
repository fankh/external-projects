/* 샘플 산출물 재생성 — docs/샘플_*.{md,csv} 10종을 실행 중인 플랫폼이 만든 결과물로 다시 저장한다.
 * 샘플은 "손으로 쓴 예시가 아니라 생성기 출력의 스냅샷"이므로, 리포트 섹션이 늘면(예: 감사 대응 자료의
 * 이상 자산 행위 탐지) 샘플도 다시 생성해야 실제 산출물과 일치한다.
 * 재현성: 시드 기준일(2026-07-29)로 ITAM_TODAY 를 고정하고, 신선한 인메모리 시드(ITAM_DATA_FILE 미설정)에서
 * 자산담당(박자산) 권한으로 생성한다 — 원본 스냅샷의 메타(‘규칙 생성 · 박자산 · 생성일 2026-07-29’)를 그대로 재현.
 * 실행: node scripts/gen-samples.mjs           재생성(파일 덮어쓰기) 후 git diff 로 드리프트만 반영됐는지 확인
 *       node scripts/gen-samples.mjs --check   드리프트 감지(파일 미변경) — 커밋된 샘플이 현재 생성기와
 *                                              어긋나면 목록과 함께 비정상 종료(CI 게이트로 사용 가능) */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECK = process.argv.includes('--check')
// 개행 정규화 — git autocrlf 로 워킹트리가 CRLF 여도 생성기(LF)와 동등 비교되게 한다
const norm = (buf) => buf.toString('utf8').replace(/\r\n/g, '\n')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = path.join(ROOT, '..', 'docs')
const PORT = 3397
const BASE = `http://localhost:${PORT}`
const SEED_DATE = '2026-07-29' // 시드 기준일 — 원본 샘플과 동일 날짜로 재현

const pw = await import('file:///C:/Users/seekers/AppData/Roaming/npm/node_modules/playwright/index.js')
const { chromium } = pw.default ?? pw
const EXE = 'C:/Users/seekers/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
const ASSET = { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' }
const cookie = { name: 'itam_session', value: encodeURIComponent(JSON.stringify(ASSET)), url: BASE }

// 리포트 종류 → 파일명(확장자 제외). 설명 문서(docs/샘플_리포트_설명.md)의 매핑과 일치.
// 감사 대응 자료를 맨 먼저 둔다 — 이 리포트의 '감사 로그(최근)' 섹션은 생성 시점의 감사 로그를 담으므로,
// 다른 리포트 생성이 로그를 오염시키기 전에 뽑아야 시드 로그만 남아 재현 가능하다(UI 경로 생성과 결합).
const REPORTS = [
  ['감사 대응 자료', '샘플_감사대응자료'],
  ['주간 Shadow IT 브리핑', '샘플_주간ShadowIT브리핑'],
  ['월간 자산 현황', '샘플_월간자산현황'],
  ['라이선스 컴플라이언스', '샘플_라이선스컴플라이언스'],
  ['재물조사 결과 요약', '샘플_재물조사결과요약'],
  ['연간 교체 계획', '샘플_연간교체계획'],
  ['취약점 조치 우선순위', '샘플_취약점조치우선순위'],
  ['AI 거버넌스·성능', '샘플_AI거버넌스성능'],
  ['부서별 IT 비용 배분', '샘플_부서별IT비용배분'],
  ['계약 관리 현황', '샘플_계약관리현황'],
]

// 신선한 시드 + 기준일 고정으로 서버 기동 (ITAM_DATA_FILE 는 명시적으로 제거)
const env = { ...process.env, ITAM_TODAY: SEED_DATE }
delete env.ITAM_DATA_FILE
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')
const server = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore', env })

let up = false
const start = Date.now()
while (Date.now() - start < 60000) {
  try { const r = await fetch(`${BASE}/login`); if (r.status === 200) { up = true; break } } catch { /* not ready */ }
  await new Promise((r) => setTimeout(r, 500))
}
if (!up) { console.error('서버 기동 실패'); server.kill(); process.exit(1) }

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext()
await ctx.addCookies([cookie])
const page = await ctx.newPage()
await page.goto(`${BASE}/ai/reports`, { waitUntil: 'networkidle' })

let failed = 0
for (const [kind, file] of REPORTS) {
  // UI 경로로 생성한다(어시스턴트 아님) — 어시스턴트 경로는 'AI 질의(리포트 생성)' 감사 항목을 남겨
  //  감사 대응 자료의 로그 섹션을 오염시킨다. createReport 의 감사 적재는 buildSections 이후라 자기 항목은 자기 섹션에 안 들어간다.
  const topBefore = (await page.locator('td.code').first().textContent({ timeout: 1500 }).catch(() => '')) || ''
  const genRow = page.locator('tr', { hasText: kind }).filter({ has: page.locator('button', { hasText: '생성' }) }).first()
  await genRow.locator('button', { hasText: '생성' }).click()
  // 생성 완료 대기 — '생성된 리포트' 표 최상단 id 가 바뀌면 새 리포트가 올라온 것
  await page.waitForFunction((prev) => { const c = document.querySelector('td.code'); return !!c && c.textContent !== prev }, topBefore, { timeout: 10000 })
  const id = ((await page.locator('td.code').first().textContent()) || '').trim()
  if (!id) { console.error(`✗ ${kind}: 리포트 id 추출 실패`); failed++; continue }
  // 원본과 바이트 동일하도록 raw 바디로 저장한다(CSV UTF-8 BOM·LF 개행 보존 — 불필요한 인코딩 diff 방지)
  const mdBuf = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(id)}?format=md`)).body())
  const csvBuf = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(id)}?format=csv`)).body())
  // 오라우팅(엉뚱한 종류 생성) 가드 — md 제목이 요청한 종류가 아니면 파일을 덮어쓰지 않는다
  if (!mdBuf.toString('utf8').startsWith(`# ${kind}`)) { console.error(`✗ ${kind}: 제목 불일치(생성된 리포트가 다름) — 저장 생략`); failed++; continue }
  const mdPath = path.join(DOCS, `${file}.md`)
  const csvPath = path.join(DOCS, `${file}.csv`)
  if (CHECK) {
    // 드리프트 감지 — 커밋된 샘플과 생성물을 개행 정규화 후 비교. 어긋나면 실패로 집계(파일은 건드리지 않음).
    const drift = []
    try { if (norm(readFileSync(mdPath)) !== norm(mdBuf)) drift.push('md') } catch { drift.push('md(없음)') }
    try { if (norm(readFileSync(csvPath)) !== norm(csvBuf)) drift.push('csv') } catch { drift.push('csv(없음)') }
    if (drift.length) { console.error(`  ✗ ${kind}: 샘플 드리프트 (${drift.join('·')}) — gen-samples.mjs 재생성 필요`); failed++ }
    else console.log(`  ✓ ${kind}: 최신`)
  } else {
    writeFileSync(mdPath, mdBuf)
    writeFileSync(csvPath, csvBuf)
    console.log(`  ✓ ${kind} → ${file}.{md,csv}`)
  }
}

await browser.close()
server.kill()
if (CHECK) console.log(failed ? `\n드리프트 ${failed}건 — 'node scripts/gen-samples.mjs' 로 재생성 후 커밋하세요` : '\n10종 샘플 최신 — 드리프트 없음')
else console.log(failed ? `\n실패 ${failed}건 — 커밋 전 확인 필요` : '\n10종 재생성 완료 — git diff 로 드리프트 확인')
process.exit(failed ? 1 : 0)
