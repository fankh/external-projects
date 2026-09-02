/* 전체 검증 러너 — 빌드 → 스모크 → e2e → 헬스 → 레이아웃 → 빈 대장 → 샘플을 한 번에, 순서대로 돌린다.
 *
 * 왜 따로 두는가: 세 스위트는 각자 `next start` 로 **이미 만들어진** .next 를 띄우고 각자 고정 포트를 쓴다.
 * 그래서 손으로 돌릴 때 두 가지가 반복해서 어긋났다.
 *   1) 빌드를 잊거나(또는 중간에 끊겨서) 예전 코드를 검증하고 초록으로 통과한다 — build-guard 가 소스 mtime 은
 *      보지만, 도중에 끊긴 빌드는 .next 가 소스보다 새것이라 통과한다. 여기서는 빌드를 항상 먼저, 끝까지 돌린다.
 *   2) 앞 스위트의 서버가 아직 포트를 쥔 채 다음 스위트를 띄우면 전부 실패한다(로드가 다 죽는다).
 *      각 스위트 직전에 포트를 실제로 잡아 보고, 비어 있을 때만 시작한다.
 *
 * 사용: npm run verify   (개별 실행은 그대로 npm run smoke|e2e|health) */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const SUITES = [
  { name: 'smoke', script: 'scripts/smoke.mjs', port: 3378 },
  { name: 'e2e', script: 'scripts/e2e-findings.mjs', port: 3396 },
  { name: 'health', script: 'scripts/client-health.mjs', port: 3388 },
  // 레이아웃 스윕 — 카드 밖으로 이탈해 도달 불가한 컨트롤(스크롤 조상 없는 넘침)을 폭 5종에서 잡는다.
  //  게이트로 만들어 두고 루프에서 돌리지 않으면, 있는 검사가 회귀를 못 막는다(2분 · 결정적).
  { name: 'layout', script: 'scripts/layout-sweep.mjs', port: 3391 },
  // 빈 대장 — '갓 배포한 상태'(데이터 0)에서 화면이 열리는지. 다른 스위트는 전부 풍성한 시드 위에서 도는데,
  //  0으로 나누기·빈 배열 최댓값 같은 계산은 그때만 터진다(도입 첫날 화면이 곧 이 상태다).
  { name: 'empty', script: 'scripts/empty-store.mjs', port: 3379 },
  // 리포트 샘플 드리프트 — docs/샘플_*.md·csv 가 현재 생성기 출력과 같은지 본다. 기준일을 고정해 돌리므로
  //  결정적이고, 리포트 로직이 바뀌면 여기서 걸린다. 이 검사가 루프에 없던 동안 10종 전부가 밀려 있었다.
  { name: 'samples', script: 'scripts/gen-samples.mjs', port: 3397, args: ['--check'] },
]

/** 포트가 비었는지 — 실제로 바인딩해 본다(netstat 파싱보다 확실하고 OS 중립적). */
function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', () => resolve(false))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, '127.0.0.1')
  })
}

/** 포트가 빌 때까지 기다린다 — 앞 스위트의 서버가 내려가는 데 잠깐 걸릴 수 있다. */
async function waitForPort(port, name) {
  for (let i = 0; i < 30; i++) {
    if (await portFree(port)) return true
    if (i === 0) console.log(`  · ${name}: 포트 ${port} 사용 중 — 비기를 기다립니다`)
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function run(cmd, args, label) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: { ...process.env, ITAM_BUILT_BY_VERIFY: '1' } })
    let tail = ''
    //  전체 출력도 모은다 — 스위트가 중간에 죽으면 마지막 4000자에는 원인이 없다(서버 기동·포트 가드·
    //   첫 실패는 모두 앞부분에 찍힌다). 실패했을 때만 파일로 남겨 다음 사람이 tail 밖을 볼 수 있게 한다.
    let full = ''
    const keep = (buf) => {
      const s = String(buf)
      process.stdout.write(s)
      tail = (tail + s).slice(-4000)
      full += s
    }
    p.stdout.on('data', keep)
    p.stderr.on('data', keep)
    p.on('close', (code) => resolve({ code: code ?? 1, tail, full, label }))
  })
}

const started = Date.now()
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

// 러너가 세운 빌드를 스위트가 그대로 검증하도록 표시를 넘긴다 — 러너가 도는 동안 소스를 건드려도
//  뒤 스위트가 신선도 가드에 걸려 멈추지 않게 한다(빌드 자체는 아래에서 항상 먼저, 끝까지 돌린다).
// 정적 검사를 먼저 돌린다 — 빌드보다 빠르고, 여기서 걸리면 빌드 시간을 아낀다.
//  next lint 는 경고만 있어도 종료 코드 0 을 내므로 출력을 직접 본다 — 그대로 두면 '통과'로 읽혀
//  경고가 쌓인다(실제로 그렇게 쌓인 경고 하나가 useMemo 의존성 누락이었다: 위치 레지스트리가
//  바뀌어도 일괄 등록 미리보기가 예전 목록으로 검증했다).
console.log('▶ lint')
const lint = await run(process.execPath, [nextBin, 'lint'], 'lint')
const lintDirty = lint.full.includes('Warning:') || lint.full.includes('Error:')
if (lint.code !== 0 || lintDirty) {
  console.error(String.fromCharCode(10) + '✗ lint 실패 — 경고도 실패로 봅니다(쌓이면 아무도 보지 않게 됩니다).')
  process.exit(1)
}

console.log('▶ 빌드')
const build = await run(process.execPath, [nextBin, 'build'], 'build')
if (build.code !== 0) {
  console.error('\n✗ 빌드 실패 — 스위트를 돌리지 않습니다(끊긴 빌드로 검증하면 예전 코드가 통과합니다).')
  process.exit(1)
}

const results = []
for (const s of SUITES) {
  console.log(`\n▶ ${s.name}`)
  if (!(await waitForPort(s.port, s.name))) {
    console.error(`✗ ${s.name}: 포트 ${s.port} 가 계속 사용 중입니다 — 다른 실행이 끝난 뒤 다시 시도하세요.`)
    process.exit(1)
  }
  const r = await run(process.execPath, [path.join(ROOT, s.script), ...(s.args ?? [])], s.name)
  const m = /결과: (\d+) passed \/ (\d+) failed/.exec(r.tail)
  // 샘플 검사는 '결과: N passed' 대신 자체 요약을 낸다 — 두 형식을 모두 읽어 한 줄로 정리한다.
  const sm = /(\d+)종 샘플 최신/.exec(r.tail)
  results.push({ name: s.name, code: r.code, passed: m?.[1] ?? (sm ? `${sm[1]}종 최신` : '?'), failed: m?.[2] ?? (r.code === 0 ? '0' : '?') })
  // 결과 줄을 못 읽었으면 원인을 같이 남긴다 — '? passed / ? failed' 만 보이면 스위트가 왜 죽었는지 알 수 없다.
  //  (스위트가 중간에 죽으면 마지막 4000자에 결과 줄이 없다 — 종료 코드와 마지막 출력이 유일한 단서다.)
  if (!m && !sm) {
    console.error(`  · ${s.name}: 결과 줄을 찾지 못했습니다 (종료 코드 ${r.code}) — 마지막 출력:`)
    console.error(r.tail.split(/\r?\n/).filter((x) => x.trim()).slice(-12).map((x) => '      ' + x).join('\n'))
  }
  //  결과 줄이 없으면 통과로 세지 않는다 — 스위트가 아무것도 검사하지 않고 종료 코드 0 으로 끝나는 일이
  //   실제로 있다(작업 디렉터리가 어긋나 npm 이 package.json 을 못 찾으면 제목만 찍히고 0 으로 끝난다).
  //   그때 요약은 '? passed / 0 failed' 가 되는데, 실패가 0 인 것이 아니라 아무것도 세지 않은 것이다.
  //   그 둘을 구분하지 않으면 게이트가 "검증했다"고 말하면서 실제로는 아무것도 돌지 않은 상태가 된다.
  if (!m && !sm) {
    console.error(`  · ${s.name}: 검사 수를 확인할 수 없어 통과로 처리하지 않습니다 (0 failed 가 아니라 0 checked).`)
    //  전체 출력을 파일로 남긴다 — tail 4000자에는 원인이 없다(실제로 포트 선점으로 스위트가 조기
    //   종료했을 때, 남은 tail 이 권한 매트릭스 검사 목록이라 원인을 세 번 재현해서야 찾았다).
    const failLog = path.join(ROOT, `verify-fail-${s.name}.log`)
    try {
      writeFileSync(failLog, r.full)
      console.error(`  · 전체 출력: ${failLog}`)
    } catch { /* 로그를 못 남겨도 게이트 판정은 그대로 진행한다 */ }
    results[results.length - 1].code = r.code === 0 ? 2 : r.code
    break
  }
  if (r.code !== 0) break
}

const mins = Math.round((Date.now() - started) / 60000)
console.log(`\n── 검증 요약 (${mins}분)`)
for (const r of results) console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.name}: ${r.passed} passed / ${r.failed} failed`)
const bad = results.find((r) => r.code !== 0)
if (bad || results.length !== SUITES.length) {
  console.error(`✗ ${bad?.name ?? '중단'} 에서 실패 — 위 출력에서 첫 ✗ 를 보세요.`)
  process.exit(1)
}
console.log('✓ 빌드 · 스모크 · e2e · 헬스 · 레이아웃 · 빈 대장 · 샘플 전부 통과')
