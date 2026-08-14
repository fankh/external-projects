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
