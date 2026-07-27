/**
 * 금액 표기 — 마스킹된 값을 **숫자처럼 보이게 하지 않는다** (18.65).
 *
 * 서버는 정보그룹 통제에 따라 금액을 세 가지로 돌려준다:
 *   · full        → 숫자              (예: 131000)
 *   · masked      → 자릿수만 남긴 문자열 (예: "100000~")
 *   · hidden/summary → null
 *
 * 화면마다 `const won = (n: number) => ₩${Math.round(n).toLocaleString()}` 를 따로 두고
 * `won(v ?? 0)` 로 부르고 있었다. 그래서 **hidden 은 ₩0, masked 는 ₩NaN** 으로 찍혔다.
 * ₩0 이 특히 나쁘다 — 통제로 가려졌다는 신호 없이 **그럴듯한 값**으로 읽혀, 재고가 실제로
 * 0원인 것과 구분되지 않는다. 통제가 서버에서 제대로 걸려도 화면이 이러면 사용자는
 * 잘못된 사실을 믿게 된다.
 *
 * 단가 Table 화면(PriceGrid)만 이 세 경우를 바르게 다루고 있었다 — 그 처리를 공용으로 옮긴다.
 */
export type Money = number | string | null | undefined

/** 금액 한 건. 가려진 값은 가려진 것으로 보인다. */
export function won(v: Money, space = false): string {
  if (v === null || v === undefined) return '••••'
  if (typeof v === 'string') return v          // 서버가 준 자릿수 표기를 그대로 쓴다
  if (!Number.isFinite(v)) return '••••'
  return `₩${space ? ' ' : ''}${Math.round(v).toLocaleString()}`
}

/**
 * 열람 모드를 아는 자리에서의 금액 (18.75).
 *
 * `null` 은 자리마다 뜻이 다르다 — **통제로 가려짐**일 수도, **값이 아직 없음**일 수도 있다.
 * 응답이 `maskMode` 를 함께 주면 둘을 가릴 수 있다: full 인데 null 이면 가려진 게 아니라
 * 값이 없는 것이므로 `—` 로 적고, 그 밖에는 `••••` 로 적는다.
 * (공용 포맷터를 도입하며 이 구분을 놓쳐 '해당 없음' 자리에 가려짐 기호가 찍힌 적이 있다.)
 */
export function wonBy(v: Money, maskMode?: string, space = false): string {
  if ((v === null || v === undefined) && (!maskMode || maskMode === 'full')) return '—'
  return won(v, space)
}

/**
 * 정렬 키 — 가려진 값끼리는 크기를 비교할 수 없다. 임의로 0 자리에 끼워 넣으면 실제 금액과
 * 섞여 잘못된 순서를 보여주므로, 한쪽 끝에 모아 둔다.
 */
export function sortMoney(v: Money): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY
}

/**
 * 합계 — 가려진 값이 하나라도 섞이면 **합계는 성립하지 않는다**.
 * 가려진 항목을 0으로 치고 더하면 실제보다 작은 총액이 사실처럼 표시된다.
 */
export function sumMoney(vals: Money[]): number | null {
  let total = 0
  for (const v of vals) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null
    total += v
  }
  return total
}
