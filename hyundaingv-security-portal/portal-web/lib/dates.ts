/** 날짜 유틸 — 서버 TZ가 UTC여도 KST 기준 날짜가 나오도록 고정한다.
 *  (컨테이너 TZ=UTC에서 KST 00~09시에 날짜가 하루 뒤처지는 결함 예방 — itam-web smoke 교훈) */
const KST = 9 * 60 * 60 * 1000

export function today(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 10)
}

export function nowStamp(): string {
  return new Date(Date.now() + KST).toISOString().slice(0, 16).replace('T', ' ')
}
