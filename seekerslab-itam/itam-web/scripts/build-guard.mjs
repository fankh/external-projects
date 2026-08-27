/* 빌드 신선도 가드 — 세 스위트(smoke·e2e·health)는 모두 `next start` 로 **이미 만들어진** .next 를 띄운다.
 * 빌드를 잊고 소스만 고친 채 돌리면 예전 코드를 검증하면서 초록으로 통과한다(고친 결함이 그대로 남았는데
 * 회귀는 통과하고, 새 회귀는 '아직 없는 기능'이라 실패한다 — 원인을 코드가 아니라 테스트에서 찾게 된다).
 * 실제로 결재선 재고정 수정 후 e2e 가 예전 빌드를 돌려 수정 전 동작을 그대로 재현한 적이 있다.
 * 그래서 소스가 빌드보다 새로우면 검사를 시작하지 않고 무엇이 새로운지 말하며 멈춘다.
 * 원격 대상(SMOKE_BASE·HEALTH_BASE·E2E_BASE)일 때는 로컬 .next 와 무관하므로 건너뛴다. */
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/** 빌드 산출물에 영향을 주는 소스 트리 — 스크립트 자신(scripts/)은 빌드에 들어가지 않으므로 제외한다. */
const SOURCE_DIRS = ['app', 'lib', 'components']
const SOURCE_FILES = ['package.json', 'next.config.ts', 'next.config.js', 'next.config.mjs', 'tsconfig.json']
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

function newestSource(root) {
  let newest = { mtime: 0, file: '' }
  const visit = (abs, rel) => {
    for (const ent of readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name)) continue
      const childAbs = path.join(abs, ent.name)
      const childRel = rel ? `${rel}/${ent.name}` : ent.name
      if (ent.isDirectory()) { visit(childAbs, childRel); continue }
      const m = statSync(childAbs).mtimeMs
      if (m > newest.mtime) newest = { mtime: m, file: childRel }
    }
  }
  for (const d of SOURCE_DIRS) {
    const abs = path.join(root, d)
    if (existsSync(abs)) visit(abs, d)
  }
  for (const f of SOURCE_FILES) {
    const abs = path.join(root, f)
    if (!existsSync(abs)) continue
    const m = statSync(abs).mtimeMs
    if (m > newest.mtime) newest = { mtime: m, file: f }
  }
  return newest
}

/** .next 가 없거나 소스보다 오래됐으면 안내하고 종료한다(스위트를 시작하지 않는다). */
export function assertFreshBuild(root, { remote = false } = {}) {
  // 전체 러너(verify)가 방금 빌드하고 부른 경우 — 검증 대상은 그 빌드다. 러너가 도는 12~15분 동안 소스를
  //  건드리면(다음 작업을 시작하는 것이 보통이다) 뒤 스위트가 '빌드가 오래됐다'로 멈춰, 실제로는 통과할
  //  검사가 실패로 남는다 — 실제로 그렇게 헬스가 죽었다. 러너가 세운 빌드를 신뢰하고 가드를 건너뛴다.
  if (process.env.ITAM_BUILT_BY_VERIFY === '1') {
    console.log('· 빌드 신선도 가드 생략 — 전체 러너가 방금 세운 빌드를 검증합니다(ITAM_BUILT_BY_VERIFY).')
    return
  }
  if (remote) return
  const buildId = path.join(root, '.next', 'BUILD_ID')
  if (!existsSync(path.join(root, '.next')) || !existsSync(buildId)) {
    console.error('✗ .next 빌드가 없습니다 — 먼저 `npm run build`를 실행하세요.')
    process.exit(1)
  }
  const built = statSync(buildId).mtimeMs
  const newest = newestSource(root)
  if (newest.mtime > built) {
    const ago = Math.round((newest.mtime - built) / 1000)
    console.error(`✗ 빌드가 소스보다 오래됐습니다 — \`npm run build\` 후 다시 실행하세요.`)
    console.error(`  가장 최근 변경: ${newest.file} (빌드보다 ${ago}초 최신)`)
    console.error('  이 가드가 없으면 예전 빌드를 검증하면서 초록으로 통과합니다.')
    process.exit(1)
  }
}

/** 포트 선점 가드 — 스위트는 저마다 전용 포트에 `next start` 를 띄우고 /login 이 200 이면 '기동됨'으로 본다.
 *  포트가 이미 물려 있으면 spawn 은 바인드에 실패해 조용히 죽는데, 준비 확인은 남의 서버에서 200 을 받아
 *  통과한다. 그래서 스위트는 '신선한 인메모리 시드'라는 자기 전제를 깬 채 앞 실행이 더럽혀 놓은 상태를
 *  검사하고, 끝나며 죽은 spawn 만 kill 해 남의 서버는 계속 살아 있다 — 다음 실행은 더 더러운 상태를 본다.
 *  실제로 중단된 e2e 가 남긴 서버 때문에 첫 검사(휴면 계정 조치)부터 엉뚱하게 실패했다.
 *  검사 대상을 착각하느니 즉시 멈추고 무엇을 정리해야 하는지 알린다. */
export async function assertPortFree(port) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 1500)
  let taken = false
  try {
    await fetch(`http://localhost:${port}/login`, { signal: ctl.signal })
    taken = true
  } catch { /* 아무도 안 듣는다 = 정상 */ }
  clearTimeout(t)
  if (taken) {
    console.error(
      `포트 ${port} 가 이미 사용 중입니다 — 앞 실행이 남긴 서버일 가능성이 큽니다.\n` +
      `  그대로 두면 이 스위트는 새 서버가 아니라 그 서버(오염된 상태)를 검사합니다.\n` +
      `  정리: netstat -ano | findstr :${port}  →  taskkill /F /PID <PID>`,
    )
    process.exit(1)
  }
}
