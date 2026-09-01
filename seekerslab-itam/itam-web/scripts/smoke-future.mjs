/* 미래 시계 스모크 — 서버 기준일(ITAM_TODAY)을 앞으로 밀어 스모크를 한 번 더 돌린다.
 *
 * 무엇을 잡는가: e2e 판(scripts/e2e-future.mjs)과 같다 — 제품 회귀가 아니라 검사 자신의 시계 의존이다.
 * 실제로 이 진단이 스모크에서 한 건을 찾아냈다(#787 잔존가치 — 검사가 특정 자산을 '상각 진행 중'이라
 * 가정해, 그 자산의 내용연수가 끝나는 2028-03 을 지나면 제품이 멀쩡한데도 깨졌다).
 *
 * 미래 시계 실행은 이 저장소에서 진짜 제품 결함도 찾은 적이 있다 — scripts/smoke.mjs 의 하이드레이션
 * 주석이 'ITAM_TODAY 를 미래로 두고 돌렸을 때 그 두 화면에서만 재현됐다(PAGEERROR 48건 → 0건)'고 적는다.
 *
 * 왜 기본 게이트(verify)에 넣지 않는가: e2e 판과 같은 이유다. 초록을 확인한 지점은 +2년 하나뿐이고,
 * 더 먼 시계에서는 시드가 전부 만료되는 등 정당하게 실패하는 검사가 있을 수 있다. 검증하지 않은 범위를
 * 게이트로 만들면 그 자체가 거짓 경보다. 필요할 때 부르는 진단으로 둔다.
 *
 * 사용: npm run smoke:future            (기본 +2년)
 *       npm run smoke:future -- 3       (+3년)
 *       npm run smoke:future -- 2029-01-15  (날짜 직접 지정) */
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { announce, pinnedDate } from './future-clock.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

// 원격 대상(SMOKE_BASE)에는 쓸 수 없다 — ITAM_TODAY 는 이 프로세스의 환경변수라 원격 서버의 시계를
//  바꾸지 못한다. 그대로 두면 '미래 시계로 돌렸다'고 출력하면서 실제로는 원격의 현재 시계를 검사하는
//  무증상 실행이 된다. 이 진단이 잡으려는 실패가 바로 그 모양이므로, 조용히 도는 대신 멈추고 말한다.
if (process.env.SMOKE_BASE) {
  console.error('미래 시계 스모크는 원격 대상(SMOKE_BASE)에 쓸 수 없습니다 — ITAM_TODAY 로 원격 서버의 시계를 바꿀 수 없습니다.')
  console.error('  원격 배포본을 미래 시계로 보려면 그 서버를 ITAM_TODAY 를 지정해 기동한 뒤 SMOKE_BASE 로 npm run smoke 를 돌리세요.')
  process.exit(2)
}

const pinned = pinnedDate(process.argv[2])
announce('스모크', pinned)

const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'smoke.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, ITAM_TODAY: pinned },
})
p.on('exit', (code) => process.exit(code ?? 1))
