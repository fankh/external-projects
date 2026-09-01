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
import { announce, pinnedDate } from './future-clock.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const arg = (process.argv[2] || '').trim()

// 원격 대상(E2E_BASE)에는 쓸 수 없다 — ITAM_TODAY 는 이 프로세스의 환경변수라 원격 서버의 시계를 바꾸지
//  못한다. 그대로 두면 "미래 시계로 돌렸다"고 출력하면서 실제로는 원격의 현재 시계를 검사하는 무증상
//  실행이 된다(게다가 검사 쪽만 미래를 기준일로 삼아 서버와 어긋난 채 거짓 실패를 낸다). 이 진단이 잡으려는
//  실패가 바로 그런 모양이므로, 조용히 도는 대신 멈추고 무엇이 안 되는지 말한다.
if (process.env.E2E_BASE) {
  console.error('미래 시계 e2e 는 원격 대상(E2E_BASE)에 쓸 수 없습니다 — ITAM_TODAY 로 원격 서버의 시계를 바꿀 수 없습니다.')
  console.error('  원격 배포본을 미래 시계로 보려면 그 서버를 ITAM_TODAY 를 지정해 기동한 뒤 E2E_BASE 로 npm run e2e 를 돌리세요.')
  process.exit(2)
}

const pinned = pinnedDate(arg)
announce('e2e', pinned)

const p = spawn(process.execPath, [path.join(ROOT, 'scripts', 'e2e-findings.mjs')], {
  cwd: ROOT, stdio: 'inherit', env: { ...process.env, ITAM_TODAY: pinned },
})
p.on('exit', (code) => process.exit(code ?? 1))
