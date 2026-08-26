/** 빈 대장 스위트 — '갓 배포한 상태'(자산·계약·발견·결재가 하나도 없는 스토어)에서 모든 화면이 열리는지 본다.
 *
 *  다른 스위트는 전부 풍성한 시드 위에서 돈다. 그런데 실제 도입 첫날의 화면은 데이터가 0인 상태이고,
 *  0으로 나누기·빈 배열의 최댓값·`[0]` 접근처럼 시드에서는 절대 드러나지 않는 계산이 그때 터진다
 *  (실제로 '빈 목록 최댓값'이 화면에 Infinity 로 새던 적이 있어 표기 무결성 검사를 넣었지만,
 *   그 검사도 시드가 채워진 상태만 본다).
 *
 *  방법: ITAM_DATA_FILE 로 스냅샷을 한 번 받아 배열을 전부 비우고(메뉴·권한·정책 등 설정성 배열은 남긴다 —
 *  권한 매트릭스가 비면 화면 접근 자체가 막혀 검사가 무의미해진다) 다시 띄운 뒤, 권한그룹 4종으로 모든
 *  내비 화면을 연다. HTTP 5xx·NaN·Infinity·[object Object] 가 하나라도 보이면 실패한다.
 *
 *  사용:  npm run build  후  npm run empty
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertFreshBuild } from './build-guard.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3379 // 스모크(3378)·헬스(3388)·레이아웃(3391)·e2e(3396)·샘플(3397) 과 겹치지 않는 대역
const BASE = `http://localhost:${PORT}`

assertFreshBuild(ROOT)

const ACCOUNTS = [
  ['USER', { login: 'mj.kim', name: '김민준', dept: '플랫폼개발팀', role: 'USER' }],
  ['ASSET_MGR', { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR' }],
  ['SEC_MGR', { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR' }],
  ['ADMIN', { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN' }],
]

// 대상 화면은 내비 정의에서 읽는다 — 목록을 여기 또 두면 새 화면이 이 스위트에서만 조용히 빠진다(레이아웃 스윕과 같은 규약).
const navSrc = readFileSync(path.join(ROOT, 'components', 'chrome', 'menus.ts'), 'utf8')
const ROUTES = [...new Set([...navSrc.matchAll(/href: '([^']+)'/g)].map((m) => m[1]))]

// 설정성 배열은 남긴다 — 권한 매트릭스·메뉴 정의가 비면 모든 화면이 접근 거부로 튕겨 검사가 공허해진다.
const KEEP = new Set(['menuDefs', 'menuPermissions', 'scanPolicies', 'integrations', 'codeGroups', 'approvalLines', 'users'])

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'itam-empty-'))
const DATA = path.join(tmpDir, 'store.json')
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

const boot = async () => {
  const srv = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, ITAM_DATA_FILE: DATA },
  })
  const start = Date.now()
  while (Date.now() - start < 60000) {
    try { const r = await fetch(`${BASE}/login`); if (r.status === 200) return srv } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  srv.kill()
  throw new Error('서버 기동 실패')
}

const cookieOf = (acct) => 'itam_session=' + encodeURIComponent(JSON.stringify(acct))
const failures = []
let checks = 0
/** 시드 화면에서 수집한 필터·드릴다운 링크 — 빈 대장에서도 같은 경로를 다시 연다 */
let FILTER_LINKS = []

try {
  // 1) 시드 스냅샷 받기 — 자동 저장(2초 주기)이 파일을 만들 때까지 기다린다.
  let srv = await boot()
  await fetch(`${BASE}/dashboard`, { headers: { cookie: cookieOf(ACCOUNTS[3][1]) } })

  // 1-1) 필터·드릴다운 링크를 시드 화면에서 수집한다 — 목록을 여기 적어 두면 새 필터가 이 스위트에서만
  //  조용히 빠진다(화면 목록을 내비에서 읽는 것과 같은 규약). 빈 대장에서 터지는 계산은 대개 필터를 건
  //  경로에 있다: 걸러낸 배열의 [0] 접근·최댓값·나누기가 그때 처음 빈 배열을 만난다.
  //  같은 모양(경로 + 파라미터 이름)당 하나만 남겨 검사 수가 폭발하지 않게 한다.
  const filtered = new Map()
  for (const [, acct] of ACCOUNTS) {
    for (const route of ROUTES) {
      let html = ''
      try { html = await (await fetch(`${BASE}${route}`, { headers: { cookie: cookieOf(acct) } })).text() } catch { continue }
      for (const m of html.matchAll(new RegExp(String.raw`href="(/[^"?#]*[?][^"#]+)"`, "g"))) {
        const link = m[1].replace(/&amp;/g, '&')
        if (link.startsWith('/api/')) continue
        const [p, q] = link.split('?')
        const shape = p + '?' + [...new URLSearchParams(q).keys()].sort().join(',')
        if (!filtered.has(shape)) filtered.set(shape, link)
      }
    }
  }
  FILTER_LINKS = [...filtered.values()]
  if (FILTER_LINKS.length === 0) throw new Error('드릴다운 링크를 하나도 수집하지 못했습니다(수집 정규식 확인)')
  const waitStart = Date.now()
  while (Date.now() - waitStart < 15000 && !existsSync(DATA)) await new Promise((r) => setTimeout(r, 500))
  srv.kill()
  await new Promise((r) => setTimeout(r, 1500))
  if (!existsSync(DATA)) throw new Error('스토어 스냅샷이 생성되지 않았습니다(ITAM_DATA_FILE 영속화 확인)')

  // 2) 데이터 배열 비우기
  const snap = JSON.parse(readFileSync(DATA, 'utf8'))
  let emptied = 0
  for (const [k, v] of Object.entries(snap)) {
    if (Array.isArray(v) && !KEEP.has(k)) { snap[k] = []; emptied++ }
  }
  if (emptied === 0) throw new Error('비울 데이터 배열을 찾지 못했습니다(스냅샷 형태 확인)')
  writeFileSync(DATA, JSON.stringify(snap))

  // 3) 빈 대장으로 다시 띄우고 전 화면 순회
  srv = await boot()
  for (const [tag, acct] of ACCOUNTS) {
    for (const route of [...ROUTES, ...FILTER_LINKS]) {
      checks++
      try {
        const res = await fetch(`${BASE}${route}`, { headers: { cookie: cookieOf(acct) } })
        const html = await res.text()
        if (res.status >= 400) { failures.push(`[${tag}] ${route} → HTTP ${res.status}`); continue }
        const marks = ['NaN', 'Infinity', '[object Object]'].filter((m) => html.includes(m))
        if (marks.length) failures.push(`[${tag}] ${route} → ${marks.join(', ')}`)
      } catch (e) {
        failures.push(`[${tag}] ${route} → ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  srv.kill()
} catch (err) {
  failures.push(`실행 오류: ${err instanceof Error ? err.message : err}`)
} finally {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* 임시 파일 정리 실패는 무시 */ }
}

for (const f of failures) console.log('✗ ' + f)
if (failures.length === 0) {
  console.log(`✓ empty: 빈 대장에서 화면 ${ROUTES.length}종 + 필터 링크 ${FILTER_LINKS.length}종 x 권한그룹 ${ACCOUNTS.length}종 (${checks}건) 정상 렌더 — 5xx·NaN·Infinity 없음`)
} else {
  console.log(`✗ empty: ${checks}건 중 ${failures.length}건 실패`)
}
console.log('')
console.log(`결과: ${checks - failures.length} passed / ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
