// 게이트용 파이썬 러너 — PATH 의 python 이 playwright 없는 무관한 venv 로 바뀌어도
// (선례: hermes-agent venv 가 PATH 선두를 차지) 게이트가 깨지지 않도록,
// playwright 를 import 할 수 있는 인터프리터를 찾아 그대로 실행한다.
// 우선순위: PORTAL_PYTHON 환경변수 → py 런처(Windows) → python3 → python
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('사용: node scripts/pyrun.mjs <script.py> [args...]')
  process.exit(2)
}

const candidates = [
  process.env.PORTAL_PYTHON,
  ...(process.platform === 'win32' ? ['py'] : []),
  'python3',
  'python',
].filter(Boolean)

const tried = []
for (const cmd of candidates) {
  const probe = spawnSync(cmd, ['-c', 'import playwright'], { stdio: 'ignore' })
  if (probe.error || probe.status !== 0) {
    tried.push(cmd)
    continue
  }
  const run = spawnSync(cmd, args, { stdio: 'inherit' })
  process.exit(run.status ?? 1)
}

console.error(
  `playwright 를 가진 파이썬을 찾지 못했다 (시도: ${tried.join(', ')}).\n` +
  '해결: PORTAL_PYTHON 환경변수로 인터프리터를 지정하거나, ' +
  '`pip install playwright && playwright install chromium` 을 실행한다.'
)
process.exit(1)
