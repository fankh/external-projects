/* 미래 시계 e2e — 서버 기준일(ITAM_TODAY)을 앞으로 밀어 e2e 를 한 번 더 돌린다.
 *
 * 무엇을 잡는가: 제품 회귀가 아니라 **검사 자신의 시계 의존**이다. 기대값을 고정 날짜로 적거나
 * "그 분기에 시드 자산이 있겠지"처럼 픽스처를 가정한 검사는, 오늘 시계에서는 초록이다가 그 날짜가
 * 지나는 순간 깨진다 — 그때는 제품이 고장 난 것처럼 보고되어 진짜 회귀와 구분이 안 된다.
 * 실제로 이 진단이 세 건을 찾아냈다(#783 픽스처 전제와 창 판정의 융합 · #784 윤년 고정 기대값 ·
 * #785 시드 가정). 손으로 ITAM_TODAY 를 넣어 돌리던 것을 한 명령으로 굳힌다.
 *
 * 왜 기본 게이트(verify)에 넣지 않는가: 초록을 실제로 확인한 지점은 +2년 하나뿐이다. 더 먼 시계에서는
 * 시드 보증이 전부 만료되는 등 정당하게 실패하는 검사가 있을 수 있고, 검증하지 않은 범위를 게이트로
 * 만들면 거짓 경보가 된다. 필요할 때 부르는 진단으로 둔다.
 *
 * 사용: npm run e2e:future            (기본 +2년)
 *       npm run e2e:future -- 3       (+3년)
 *       npm run e2e:future -- 2029-01-15  (날짜 직접 지정)
 *
 * 기준일을 코드에 박지 않는다 — 고정 날짜는 이 스크립트가 방금 고친 함정 그 자체다. 실행 시점에서 센다. */
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const ROOT = path.resolve(import.meta.dirname, '..')
const arg = (process.argv[2] || '').trim()

/** 실행 시점 + n년 — 2/29 는 말일로 당긴다(lib/dates addYears 와 같은 달력 규칙). */
function plusYears(n) {
  const d = new Date()
  const y = d.getUTCFullYear() + n
  const mo = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const pad = (v) => String(v).padStart(2, '0')
  return `${y}-${pad(mo)}-${pad(Math.min(day, last))}`
}

const pinned = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : plusYears(Number(arg) > 0 ? Number(arg) : 2)
console.log(`미래 시계 e2e — ITAM_TODAY=${pinned}`)
console.log('  (제품 회귀가 아니라 검사 자신의 시계 의존을 찾는 진단입니다 — 실패는 그 검사의 가정을 먼저 의심하세요)')

const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'e2e-findings.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, ITAM_TODAY: pinned },
})
p.on('exit', (code) => process.exit(code ?? 1))
