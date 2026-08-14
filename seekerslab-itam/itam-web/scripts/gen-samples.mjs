/* 샘플 산출물 재생성 — docs/샘플_*.{md,csv} 8종을 실행 중인 플랫폼이 만든 결과물로 다시 저장한다.
 * 샘플은 "손으로 쓴 예시가 아니라 생성기 출력의 스냅샷"이므로, 리포트 섹션이 늘면(예: 감사 대응 자료의
 * 이상 자산 행위 탐지) 샘플도 다시 생성해야 실제 산출물과 일치한다.
 * 재현성: 시드 기준일(2026-07-29)로 ITAM_TODAY 를 고정하고, 신선한 인메모리 시드(ITAM_DATA_FILE 미설정)에서
 * 자산담당(박자산) 권한으로 생성한다 — 원본 스냅샷의 메타(‘규칙 생성 · 박자산 · 생성일 2026-07-29’)를 그대로 재현.
 * 실행: node scripts/gen-samples.mjs   (생성 후 git diff 로 드리프트만 반영됐는지 확인) */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
const REPORTS = [
  ['주간 Shadow IT 브리핑', '샘플_주간ShadowIT브리핑'],
  ['월간 자산 현황', '샘플_월간자산현황'],
  ['라이선스 컴플라이언스', '샘플_라이선스컴플라이언스'],
  ['재물조사 결과 요약', '샘플_재물조사결과요약'],
  ['감사 대응 자료', '샘플_감사대응자료'],
  ['연간 교체 계획', '샘플_연간교체계획'],
  ['취약점 조치 우선순위', '샘플_취약점조치우선순위'],
  ['AI 거버넌스·성능', '샘플_AI거버넌스성능'],
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
await page.goto(`${BASE}/ai/assistant`, { waitUntil: 'networkidle' })

let failed = 0
for (const [kind, file] of REPORTS) {
  const before = await page.locator('.msg.assistant .bub').count()
  await page.locator('.chat-in input').fill(`${kind} 리포트 생성해줘`)
  await page.locator('.chat-in input').press('Enter')
  await page.waitForFunction((n) => document.querySelectorAll('.msg.assistant .bub').length > n, before, { timeout: 10000 })
  await page.waitForTimeout(150)
  const href = await page.locator('.msg.assistant').last().locator('.refs a').first().getAttribute('href')
  const id = decodeURIComponent((href?.match(/\/api\/reports\/([^?]+)/) || [])[1] || '')
  if (!id) { console.error(`✗ ${kind}: 리포트 id 추출 실패`); failed++; continue }
  // 원본과 바이트 동일하도록 raw 바디로 저장한다(CSV UTF-8 BOM·LF 개행 보존 — 불필요한 인코딩 diff 방지)
  const mdBuf = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(id)}?format=md`)).body())
  const csvBuf = Buffer.from(await (await page.request.get(`${BASE}/api/reports/${encodeURIComponent(id)}?format=csv`)).body())
  // 오라우팅(엉뚱한 종류 생성) 가드 — md 제목이 요청한 종류가 아니면 파일을 덮어쓰지 않는다
  if (!mdBuf.toString('utf8').startsWith(`# ${kind}`)) { console.error(`✗ ${kind}: 제목 불일치(생성된 리포트가 다름) — 저장 생략`); failed++; continue }
  writeFileSync(path.join(DOCS, `${file}.md`), mdBuf)
  writeFileSync(path.join(DOCS, `${file}.csv`), csvBuf)
  console.log(`  ✓ ${kind} → ${file}.{md,csv}`)
}

await browser.close()
server.kill()
console.log(failed ? `\n실패 ${failed}건 — 커밋 전 확인 필요` : '\n8종 재생성 완료 — git diff 로 드리프트 확인')
process.exit(failed ? 1 : 0)
