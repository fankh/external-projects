/* 미래 시계 진단의 공통 조각 — 기준일 계산과 안내 출력.
 *
 * 왜 모듈로 두는가: 날짜 계산이 러너마다 복사되면 하나만 고쳐지는 사고가 난다(이 저장소가 상수·판정을
 * 한 곳에 모아 두는 것과 같은 이유 — lib/types.ts·lib/upcoming.ts 주석 참조). 반대로 원격 가드는
 * 여기 두지 않는다: 스위트마다 환경변수가 다르고(E2E_BASE · SMOKE_BASE) 대안 안내도 달라서,
 * 공통화하면 러너 안에 '스위트 → 변수' 매핑이 생겨 새 스위트를 붙일 때 두 곳을 고쳐야 한다.
 * 값이 다른 것은 의도이고, 값을 여러 번 적는 것이 문제다. */

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

/** 인자 → 기준일(YYYY-MM-DD). 날짜를 직접 주면 그대로, 숫자면 +N년, 그 밖(빈 값·오타)은 기본 +2년.
 *  오늘로 폴백하지 않는 것이 중요하다 — 그러면 '미래 시계로 돌렸다'고 믿는데 실제로는 아무것도
 *  새로 검사하지 않는 무증상 실행이 된다(이 진단이 잡으려는 실패가 정확히 그 모양이다). */
export function pinnedDate(arg) {
  const a = String(arg ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(a)) return a
  const n = Number(a)
  return plusYears(Number.isFinite(n) && n > 0 ? n : 2)
}

/** 진단 성격을 먼저 말한다 — 실패를 보고 제품을 의심하는 오독을 막는다. */
export function announce(suite, pinned) {
  console.log(`미래 시계 ${suite} — ITAM_TODAY=${pinned}`)
  console.log('  (제품 회귀가 아니라 검사 자신의 시계 의존을 찾는 진단입니다 — 실패는 그 검사의 가정을 먼저 의심하세요)')
}
