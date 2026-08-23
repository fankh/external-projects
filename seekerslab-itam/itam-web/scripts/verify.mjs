/* 전체 검증 러너 — 빌드 → 스모크 → e2e → 헬스를 한 번에, 순서대로 돌린다.
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
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const SUITES = [
  { name: 'smoke', script: 'scripts/smoke.mjs', port: 3378 },
  { name: 'e2e', script: 'scripts/e2e-findings.mjs', port: 3396 },
  { name: 'health', script: 'scripts/client-health.mjs', port: 3388 },
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
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: false })
    let tail = ''
    const keep = (buf) => {
      const s = String(buf)
      process.stdout.write(s)
      tail = (tail + s).slice(-4000)
    }
    p.stdout.on('data', keep)
    p.stderr.on('data', keep)
    p.on('close', (code) => resolve({ code: code ?? 1, tail, label }))
  })
}

const started = Date.now()
const nextBin = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next')

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
  const r = await run(process.execPath, [path.join(ROOT, s.script)], s.name)
  const m = /결과: (\d+) passed \/ (\d+) failed/.exec(r.tail)
  results.push({ name: s.name, code: r.code, passed: m?.[1] ?? '?', failed: m?.[2] ?? '?' })
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
console.log('✓ 빌드 · 스모크 · e2e · 헬스 전부 통과')
