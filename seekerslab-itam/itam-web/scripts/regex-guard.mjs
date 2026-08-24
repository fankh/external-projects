/** 정규식 리터럴의 역슬래시 유실 탐지 — 편집 중 '\d' 가 'd' 로 떨어지면 정규식은 문법 오류 없이 살아남고
 *  타입 검사·빌드도 통과하지만 아무것도 매칭하지 않는다. 실제로 lib/dates 의 addDays 가 그렇게 깨져 있었다
 *  (날짜 파싱이 항상 실패해 입력 날짜를 그대로 반환) — 재물조사 기한(+14일)·리포트 다음 실행일(+7일)·
 *  EASM 재스캔 주기·AI 로그 보존 컷오프가 모두 '더하지 않은 날짜'로 계산돼 늘 기한 도래로 보였다.
 *  이 파일 자체는 역슬래시를 쓰지 않는다(문자 코드로 조립) — 같은 사고가 이 가드까지 무력화하지 않게. */
import { readFileSync } from 'node:fs'

const BS = String.fromCharCode(92)
// 한 줄 안의 정규식 리터럴 후보 — /.../ 사이에 개행·슬래시가 없는 조각
const RE_LITERAL = new RegExp(BS + '/[^/' + BS + 'n]{2,}' + BS + '/', 'g')
// 역슬래시 없는 d{n} — '\d{4}' 가 'd{4}' 로 떨어진 흔적
const SUSPECT = new RegExp('[^' + BS + BS + ']d' + BS + '{[0-9]')
const EOL = new RegExp(BS + 'r?' + BS + 'n')

/** 손상 의심 위치 목록 ('경로:줄') — 비어 있으면 정상. */
export function damagedRegexLiterals(files, rel = (f) => f) {
  const bad = []
  for (const f of files) {
    readFileSync(f, 'utf8').split(EOL).forEach((ln, n) => {
      for (const m of ln.matchAll(RE_LITERAL)) {
        if (SUSPECT.test(m[0])) bad.push(rel(f) + ':' + (n + 1))
      }
    })
  }
  return [...new Set(bad)]
}
