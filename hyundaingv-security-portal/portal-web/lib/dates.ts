/** 날짜 유틸 — 서버 TZ가 UTC여도 KST 기준 날짜가 나오도록 고정한다.
 *  (컨테이너 TZ=UTC에서 KST 00~09시에 날짜가 하루 뒤처지는 결함 예방 — itam-web smoke 교훈) */
const KST = 9 * 60 * 60 * 1000

export function today(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 10)
}

/** 현재 연도(KST 4자리) — 연차 서약·계획의 '올해' 판정을 today() 파생으로 통일한다.
 *  '2026' 리터럴을 쓰면 연도 전환 후 연차 컴플라이언스(미서약 안내 등)가 조용히 멈춘다. */
export function currentYear(): string {
  return today().slice(0, 4)
}

export function nowStamp(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 16).replace('T', ' ')
}

/** 초 단위 타임스탬프 (KST) — 서약/개정 시각처럼 같은 날·같은 분 내 선후를 가려야 하는 값에 쓴다.
 *  (서약 signedAt >= 개정 revisedAt 비교가 당일 개정 전후를 구분하려면 분 단위론 부족) */
export function nowStampSec(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 19).replace('T', ' ')
}

/** 두 날짜(YYYY-MM-DD) 사이 일수 = to - from. 손상 파일의 파싱 불가 날짜(예: '0000-00-00')는 Date.parse 가
 *  NaN 을 내고, 그대로 뺄셈·Math.round 하면 화면에 'D+NaN'·'NaN일' 이 렌더된다(strField 정규화는 문자열만
 *  보장하고 날짜 유효성은 검증 안 함). 유한값이 아니면 null 을 반환해 호출부에서 '-'·0 으로 폴백하게 한다. */
export function daysBetween(from: string, to: string): number | null {
  const d = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
  return Number.isFinite(d) ? d : null
}

/** YYYY-MM-DD 에 개월 수를 더한 날짜(YYYY-MM-DD) — 정책 재검토 주기(nextReviewDue) 산출용. 월 오버플로는
 *  연도로 캐리, 말일은 대상 월 말일로 클램프(예: 1/31 +1개월 = 2/28). 손상 날짜(파싱 불가)는 원본 반환. */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12) return dateStr
  const total = y * 12 + (m - 1) + Math.round(months)
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1  // 1~12
  const lastDay = new Date(ny, nm, 0).getDate()  // 대상 월(nm) 말일 (숫자 생성자 — 앱 런타임 OK)
  const nd = Math.min(d, lastDay)
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}
