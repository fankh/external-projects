/** 플랫폼 기준일·시각 — 만료 계산과 신규 기록(스캔·리포트·감사 로그)의 '지금'.
 *
 *  두 가지를 반드시 지켜야 한다.
 *
 *  1. **호출 시점에 계산한다(함수, 상수 아님).** 모듈 로드 시 상수로 굳히면 컨테이너가 며칠간
 *     떠 있는 동안 기동일이 영구히 '오늘'로 남는다.
 *  2. **표준시를 명시한다(Asia/Seoul).** 컨테이너는 보통 UTC 로 동작하므로 KST 자정~09시
 *     사이에는 날짜가 하루 뒤처진다 — 실제로 D-22 로 표시돼야 할 계약이 D-23 으로 보였다.
 *
 *  시연에서 특정 날짜를 재현하려면 `ITAM_TODAY=YYYY-MM-DD`, 표준시를 바꾸려면 `ITAM_TZ`.
 *  서버 전용 모듈 — 클라이언트에서 쓰면 하이드레이션 불일치가 생긴다.
 */
import { DISPOSAL_STATUSES, EXPIRY_WINDOW_DAYS, GONE_STATUSES } from './types'
import { NON_OPERATIONAL_STATUSES } from '@/lib/types'
import type { Asset, IntakeLot } from '@/lib/types'

const TZ = process.env.ITAM_TZ || 'Asia/Seoul'

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

/** 기준일 `YYYY-MM-DD` (기본 KST) */
export function today(): string {
  const pinned = process.env.ITAM_TODAY
  if (pinned && /^\d{4}-\d{2}-\d{2}$/.test(pinned)) return pinned
  return dateFmt.format(new Date())
}

/** 감사 로그·이력용 타임스탬프 `YYYY-MM-DD HH:MM:SS` (기준일 + 현재 시각) */
export function nowStamp(): string {
  return `${today()} ${timeFmt.format(new Date())}`
}

/** 목록 표시용 `YYYY-MM-DD HH:MM` (초 생략).
 *  `new Date().getHours()` 로 조립하면 프로세스 표준시(컨테이너=UTC)를 따라가 날짜는 KST,
 *  시각은 UTC 인 뒤섞인 값이 된다 — 반드시 이 함수를 쓴다. */
export function nowMinute(): string {
  return `${today()} ${timeFmt.format(new Date()).slice(0, 5)}`
}

/** 자연어 기간 표현 → 날짜 창 `{start,end}` (YYYY-MM-DD, 경계 포함).
 *  AI 어시스턴트가 "내년 1분기", "올해 하반기", "2027년 3월", "다음 분기"처럼 시점을 좁히는
 *  질의를 실제 기간으로 해석하도록 한다 (제품안내서 §05 예시 질의 "내년 1분기 보증 만료…").
 *  기간 토큰이 없으면 null → 호출부는 기존(임박순) 동작으로 폴백한다. base 는 today() 문자열. 서버 전용. */
export function parsePeriodWindow(q: string, base: string): { start: string; end: string; label: string } | null {
  const y0 = Number(base.slice(0, 4))
  const m0 = Number(base.slice(5, 7)) // 1-based
  if (!y0 || !m0) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  // 월말일 — Date.UTC(y, m, 0) 은 1-based m 의 전월 마지막 = m 월 말일. 로컬 Date 의 TZ 흔들림을 피해 UTC 로 계산.
  const win = (y: number, sm: number, em: number, label: string) => ({
    start: `${y}-${pad(sm)}-01`,
    end: `${y}-${pad(em)}-${pad(new Date(Date.UTC(y, em, 0)).getUTCDate())}`,
    label,
  })

  // 대상 연도 — 명시 "YYYY년" 우선, 아니면 상대어(내년/작년/올해)
  const yExplicit = q.match(/(20\d{2})\s*년/)
  let year = y0
  if (yExplicit) year = Number(yExplicit[1])
  else if (q.includes('내년') || q.includes('명년')) year = y0 + 1
  else if (q.includes('작년') || q.includes('지난해') || q.includes('전년')) year = y0 - 1

  const curQ = Math.floor((m0 - 1) / 3) + 1

  // 분기 — "N분기"(연도어와 조합) · 상대(이번/다음/지난)
  const qm = q.match(/([1-4])\s*분기/)
  if (qm) { const qn = Number(qm[1]); const sm = (qn - 1) * 3 + 1; return win(year, sm, sm + 2, `${year}년 ${qn}분기`) }
  if (q.includes('이번 분기') || q.includes('금분기') || q.includes('당분기')) { const sm = (curQ - 1) * 3 + 1; return win(y0, sm, sm + 2, `${y0}년 ${curQ}분기`) }
  if (q.includes('다음 분기') || q.includes('차분기')) { const nq = curQ === 4 ? 1 : curQ + 1; const ny = curQ === 4 ? y0 + 1 : y0; const sm = (nq - 1) * 3 + 1; return win(ny, sm, sm + 2, `${ny}년 ${nq}분기`) }
  if (q.includes('지난 분기') || q.includes('지난분기') || q.includes('전분기')) { const pq = curQ === 1 ? 4 : curQ - 1; const py = curQ === 1 ? y0 - 1 : y0; const sm = (pq - 1) * 3 + 1; return win(py, sm, sm + 2, `${py}년 ${pq}분기`) }

  // 반기
  if (q.includes('상반기')) return win(year, 1, 6, `${year}년 상반기`)
  if (q.includes('하반기')) return win(year, 7, 12, `${year}년 하반기`)

  // 월 — 명시 "N월"(단 '개월'·'월간' 제외) · 상대(이번/다음/지난 달)
  const mm = q.match(/(1[0-2]|[1-9])\s*월/)
  if (mm && !q.includes('개월') && !q.includes('월간')) { const mn = Number(mm[1]); return win(year, mn, mn, `${year}년 ${mn}월`) }
  if (q.includes('이번 달') || q.includes('이달') || q.includes('당월') || q.includes('금월')) return win(y0, m0, m0, `${y0}년 ${m0}월`)
  if (q.includes('다음 달') || q.includes('내달') || q.includes('익월')) { const nm = m0 === 12 ? 1 : m0 + 1; const ny = m0 === 12 ? y0 + 1 : y0; return win(ny, nm, nm, `${ny}년 ${nm}월`) }
  if (q.includes('지난 달') || q.includes('지난달') || q.includes('전월')) { const pm = m0 === 1 ? 12 : m0 - 1; const py = m0 === 1 ? y0 - 1 : y0; return win(py, pm, pm, `${py}년 ${pm}월`) }

  // 연도만 명시 (예: "2027년 만료", "내년 만료 계약")
  if (yExplicit || q.includes('내년') || q.includes('작년') || q.includes('명년') || q.includes('지난해') || q.includes('전년')) return win(year, 1, 12, `${year}년`)

  return null
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === '-') return null
  const d = new Date(dateStr).getTime()
  const t = new Date(today()).getTime()
  if (Number.isNaN(d)) return null
  return Math.round((d - t) / 86_400_000)
}

/** 해당 연·월의 마지막 날(1~12월 외에는 31 폴백) — 윤년은 그레고리력 규칙. */
function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? 31
}

/** 실재하는 달력 날짜인가 — `YYYY-MM-DD` 형식이면서 월 1~12, 일 1~그 달의 마지막 날(윤년 반영).
 *  입력 검증이 형식만 보던 자리를 대신한다. 형식만 통과시키면 2026-02-31·2026-02-29(평년) 같은
 *  없는 날이 그대로 저장되는데, 화면·엑셀은 입력값을 그대로 찍고 daysUntil 은 Date 파싱으로 3/3·3/1 로
 *  굴러가(V8 rollover) 표시일과 잔여일이 어긋난다. 같은 함수 안의 문자열 비교(`due <= today()`)는 굴러가기
 *  전 리터럴을 보므로 한 판정의 두 축이 서로 다른 날을 가리킨다. 2026-13-45 처럼 파싱 자체가 실패하면
 *  daysUntil 이 null → `?? 999` 폴백으로 정기 점검·연체 판정이 영영 뜨지 않는다(경보가 조용히 꺼진다).
 *  addYears/addMonths 가 이미 daysInMonth 로 없는 날을 당기는 것과 같은 달력 규칙을 입력단에서 공유한다. */
export function isValidDate(dateStr: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return false
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12) return false
  return d >= 1 && d <= daysInMonth(Number(m[1]), mo)
}

/** 날짜 문자열(`YYYY-MM-DD`) 연 단위 가감 — years 가 음수면 소급. 대상 연도에 없는 날(2/29)은
 *  그 달의 마지막 날로 당긴다(2028-02-29 +1년 → 2029-02-28). Date 객체를 쓰지 않아 TZ 영향이 없다.
 *  그동안 각 호출부가 `${Number(y) + n}-${m}-${d}` 로 연도만 올려 윤년 2/29 기준 갱신이 실재하지 않는
 *  날짜(2029-02-29)를 만들었다 — 저장·표시·엑셀 반출·갱신 이력에 남고, Date 파싱은 3/1 로 굴러가
 *  표시일과 잔여일이 하루 어긋났으며 재갱신마다 오염이 승계됐다. 보증 연장·계약/라이선스 갱신·
 *  정기 점검 재예약·검수 등록 보증 산정·교체 내용연수 기준일이 이 한 함수를 공유한다. 형식 불명은 원본 반환(방어). */
export function addYears(dateStr: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return dateStr
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return dateStr
  const y = Number(m[1]) + years
  if (!Number.isFinite(y) || y < 1) return dateStr
  const d = Math.min(Number(m[3]), daysInMonth(y, mo))
  return `${String(y).padStart(4, '0')}-${m[2]}-${String(d).padStart(2, '0')}`
}

/** 날짜 문자열(`YYYY-MM-DD`) 일 단위 가감 — 월·연 경계를 넘겨 정확히 계산한다(음수면 소급).
 *  파싱·포맷 양쪽을 UTC 로 못박아 로컬 TZ 가 끼어들지 않는다. `new Date(str)` 은 시각이 붙은 문자열을 로컬로 해석해서
 *  toISOString() 으로 되돌릴 때 KST(+9) 기준 09시 이전이 하루 뒤로 밀린다 — 컨테이너 TZ 가 UTC 라 배포본에서만
 *  날짜가 하루 어긋나던 사고와 같은 계열이다. 형식이 날짜만이 아니면 원본을 돌려줘(방어) 시각이 섞인 값이
 *  조용히 하루를 옮기지 못하게 한다. 재탐지 주기·리포트 주간 스케줄·재물조사 기한이 이 한 함수를 공유한다. */
export function addDays(dateStr: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return dateStr
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000)
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 미답변 QnA SLA(일) — 등록 후 이 기간을 넘겨도 답변이 없으면 응답 지연으로 본다(헬프데스크 SLA). */
export const QNA_SLA_DAYS = 3

/** QnA 등록 후 경과일 — today 기준(음수면 미래 등록, 방어). 지연 판정·경과일 표기에 쓴다. */
/** 휴면 경과일 — 마지막 로그인 이후 지난 일수. 로그인 이력이 없으면(lastLogin '-') null.
 *  저장값이 아니라 파생값이다 — 예전엔 발견 레코드에 dormantDays 를 함께 박아 두어 시간이 지나면
 *  마지막 로그인과 어긋났다(시드 기준 24일 차이). 계약 연계 자산 수(contractAssetCount)를 실측 파생으로
 *  돌린 것과 같은 이유 — 갱신되지 않는 저장 카운터는 화면에서 조용히 틀린 숫자가 된다.
 *  로그인 이력이 아예 없는 계정은 경과일을 셀 수 없지만 휴면 위험이 가장 큰 쪽이므로 호출부가 강조 처리한다. */
/** 휴면 경과일 — today 인자로만 계산해 서버·클라이언트가 같은 값을 낸다(하이드레이션 안전).
 *  그전에는 내부에서 today() 를 불러, 이 함수를 쓰는 클라이언트 표(발견 자산 · 계정)가 브라우저 시계로 계산했다 —
 *  서버(UTC 컨테이너)와 브라우저(KST)의 날짜가 갈리는 자정~09시 구간에 서버 HTML 과 값이 어긋나 하이드레이션이 깨진다
 *  (이 모듈 첫머리가 경고하는 바로 그 상황이다). warrantyState·isApprovalOverdue 와 같은 규약. */
export function dormantDaysOf(a: { lastLogin: string }, today: string): number | null {
  if (!a.lastLogin || a.lastLogin === '-') return null
  const d = Math.round((Date.parse(today) - Date.parse(a.lastLogin)) / 86_400_000)
  return Number.isFinite(d) ? Math.max(0, d) : 0
}

export function qnaAgeDays(createdAt: string): number {
  return Math.max(0, -(daysUntil(createdAt) ?? 0))
}

/** 미답변 QnA SLA 경과 — QnA 이면서 답변이 없고 등록 후 SLA(기본 3일)를 넘긴 문의(응답성 지연 신호).
 *  결재 SLA 지연(isApprovalOverdue)과 같은 원칙의 QnA 판. QnA 화면·대시보드가 공유한다. 서버 전용. */
export function isQnaOverdue(p: { kind: string; answer?: unknown; createdAt: string }, slaDays: number = QNA_SLA_DAYS): boolean {
  if (p.kind !== 'QnA' || p.answer) return false
  return qnaAgeDays(p.createdAt) > slaDays
}

/** 비율(부분/전체) 백분율 — 이정표(0%·100%)는 실제로 그 상태일 때만 쓴다.
 *  반올림은 99.6% 를 100% 로, 0.4% 를 0% 로 만들어 "다 됐다"·"하나도 안 했다"로 읽히게 한다 — 집행률·소진률·
 *  사용률·진행률처럼 완료 여부를 읽는 수치에서는 그 한 칸이 판단을 바꾼다(감가상각률이 같은 이유로 floor 를 쓴다).
 *  · 부분 0 → 0%, 부분 = 전체 → 100%, 그 사이 → floor(최소 1%)
 *  · 부분 > 전체(좌석 초과 사용·예산 초과)는 실수치를 그대로 보여주되 100% 로는 내려가지 않는다 — 초과를 감추지 않는다.
 *  전체가 0 이면 0(0으로 나누지 않는다). 판정(초과·미집행·소진 임박)은 이 표기값이 아니라 원값으로 한다. */
export function ratioPct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0
  if (part <= 0) return 0
  if (part === total) return 100
  if (part > total) { const over = Math.round((part / total) * 100); return over <= 100 ? 101 : over }
  return Math.max(1, Math.floor((part / total) * 100))
}

/** 재물조사 진행률 — 계획 대비 실측 스캔 비율(이정표 정직 규약 공유).
 *  대장 미등록(잉여)·범위 밖 스캔이 scanned 를 부풀려도 100% 를 넘지 않는다. */
export function roundProgressPct(r: { scanned: number; planned: number }): number {
  return Math.min(100, ratioPct(r.scanned, r.planned))
}

/** 숫자 표기 로케일 — 천 단위 구분 표기를 못박는다.
 *
 *  인자 없는 toLocaleString() 은 실행 환경의 기본 로케일을 쓴다. 서버는 컨테이너의 로케일,
 *  브라우저는 보는 사람의 로케일이다. 클라이언트 컴포넌트는 SSR 로 한 번 그려지고 브라우저에서
 *  다시 그려지므로 둘이 다르면 같은 금액이 화면에서 바뀐다 — 실측으로 브라우저 로케일이 de-DE 이면
 *  취득가가 1,680,000원 대신 1.680.000원 으로 찍혔다. 독일식 표기에서 마침표는 천 단위지만
 *  한국어 화면에서 마침표는 소수점으로 읽힌다: 168만 원이 1.68원으로 읽힐 수 있다. 화면과
 *  엑셀 반출(네이티브 숫자 + #,##0 서식)도 서로 다른 표기를 내놓게 된다.
 *  React 19 는 이 텍스트 차이를 조용히 덮어써서 콘솔에 남지 않는다 — 스위트가 보지 못한 이유다.
 *  날짜를 Intl.DateTimeFormat 에 로케일을 박아 고정한 것과 같은 규약이다(이 파일 위쪽 dateFmt). */
export const NUM_LOCALE = 'ko-KR'

/** 정렬 비교 로케일 — 문자열 순서를 못박는다.
 *
 *  인자 없는 localeCompare() 도 실행 환경의 기본 로케일을 쓴다. 숫자 표기와 달리 이쪽은 목록의
 *  순서 자체가 바뀐다 — 실측:
 *
 *    ko-KR: ㄱ테스트 가나다 김민준 맥북 Pro … 하늘 A-노트북 Dell 모니터 ThinkPad
 *    en-US: A-노트북 Dell 모니터 ThinkPad ㄱ테스트 가나다 김민준 맥북 Pro … 하늘
 *
 *  한글을 라틴보다 앞에 두느냐 뒤에 두느냐가 통째로 갈린다. 이 앱의 목록은 모델명(라틴)과
 *  사용자·부서명(한글)이 섞여 있어 정확히 이 차이에 걸린다. 클라이언트 컴포넌트(대장·발견 자산·
 *  계약 표)에서는 SSR 로 그린 순서와 브라우저가 다시 그린 순서가 어긋나고, 서버 전용 자리에서는
 *  컨테이너 로케일이 리포트·문서의 행 순서를 정하게 된다. NUM_LOCALE 과 같은 이유로 고정한다. */
export const SORT_LOCALE = 'ko-KR'
export function fmtAmount(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`
  const man = Math.round(n / 10_000)
  // 만 단위 반올림이 1억에 닿으면 억으로 올린다 — 99,999,999원이 "10,000만"으로 찍히면 같은 금액이 화면마다
  //  다른 단위로 보이고(계약 금액은 1억 근처가 흔하다), 읽는 사람이 자릿수를 다시 세어야 한다.
  if (man >= 10_000) return `${(man / 10_000).toFixed(1)}억`
  if (n >= 10_000) return `${man.toLocaleString(NUM_LOCALE)}만`
  return n.toLocaleString(NUM_LOCALE)
}

/** 장기 미실측(유령 자산 후보) 판정 — 폐기 경로 자산은 제외하고, 최근 실측이 없거나
 *  staleDays(운영 정책 staleVerifyDays)를 넘은 자산이면 참. 대장 필터·재물조사 편성이 같은 기준을 쓰도록 한 곳에 둔다.
 *  임계값은 스토어 opsPolicy 를 단일 출처로 받는다(호출부가 s.opsPolicy.staleVerifyDays 전달). 서버 전용. */
export function isStaleVerify(a: Asset, staleDays: number): boolean {
  //  손을 떠난 자산(분실·폐기예정·폐기완료)은 대상이 아니다 — 다시 실측할 실물이 없다. 그전에는 폐기 두
  //   상태만 빼서 분실 자산이 영원히 장기 미실측으로 남았다(같은 개념 두 정의 — 예정 일정·계약 커버리지는
  //   이미 GONE_STATUSES 한 기준을 쓴다). 그 결과 실물이 사라졌다고 신고한 자산이 곧바로 다음 회차의
  //   편성 대기로 돌아왔다 — 편성해도 스캔할 실물이 없어 미실사로 남고, 회차를 닫으려면 다시 '분실 처리'다.
  //   재물조사의 '미실사 → 분실 신고' 브리지가 닫으려던 바로 그 고리다.
  if (GONE_STATUSES.includes(a.status)) return false
  // 미측정('-' 센티넬 포함)은 장기 미실측으로 본다 — '-' 는 daysUntil 이 null 로 처리하므로 명시 가드가 없으면
  // 최근 측정으로 오판(재물조사 편성·'장기 미실측' 큐에서 누락)된다. 다른 날짜 예측 헬퍼와 같은 페일세이프.
  if (!a.lastVerifiedAt || a.lastVerifiedAt === '-') return true
  return -(daysUntil(a.lastVerifiedAt) ?? 0) > staleDays
}

/** 대여 연체 — '대여중' 상태이고 반환 기한이 지난 자산. 대장 필터·대시보드 큐가 같은 기준을 쓴다. 서버 전용. */
export function isLoanOverdue(a: Asset): boolean {
  if (a.status !== '대여중' || !a.loanDueDate) return false
  return (daysUntil(a.loanDueDate) ?? 0) < 0
}

/** 대여 반환 임박 — '대여중'이고 반환 기한이 오늘~7일 이내(아직 연체는 아님). 연체 전 사전 독촉 대상. 서버 전용. */
export function isLoanDueSoon(a: Asset): boolean {
  if (a.status !== '대여중' || !a.loanDueDate) return false
  const d = daysUntil(a.loanDueDate)
  return d !== null && d >= 0 && d <= 7
}

/** 수리 예상 반환 경과 — '수리중'이고 수리 의뢰의 예상 반환일이 지났는데 아직 완료되지 않았다(업체 지연). 담당자가 업체를 독촉할 대상. 서버 전용. */
export function isRepairOverdue(a: Asset): boolean {
  if (a.status !== '수리중' || !a.repair?.eta) return false
  return (daysUntil(a.repair.eta) ?? 0) < 0
}

/** 수리 예상 반환일 미기재 — 수리 의뢰는 접수됐는데 업체가 아직 반환 일정을 주지 않은 상태(eta 선택 입력).
 *  경과일을 셀 수 없어 isRepairOverdue 로는 영원히 잡히지 않는다 — 일정이 없는 수리일수록 독촉 대상에서
 *  빠지는 역설이라, 업체 독촉(remindRepairs)이 이 건도 대상으로 삼는다. 독촉 문구가 원래 '진행 상황·반환
 *  일정 회신 요청'이라 일정을 못 받은 건이야말로 그 요청의 대상이다. 지연(경과) 판정 자체는 넓히지 않는다 —
 *  의뢰 당일 건까지 '예상 반환 경과'로 셀 수는 없으므로 대시보드 큐·리포트·업체 성과는 그대로 eta 기준이다. */
export function isRepairEtaMissing(a: Asset): boolean {
  return a.status === '수리중' && !!a.repair && !a.repair.eta
}

/** 수리 의뢰 정보 미기재 — '수리중'인데 수리 의뢰(업체·의뢰일) 자체가 기록돼 있지 않다.
 *  isRepairEtaMissing 은 '의뢰는 됐는데 일정만 없는' 경우라 repair 객체를 요구한다. 그래서 의뢰 기록이 아예 없는
 *  자산은 두 판정(경과·일정 미기재) 어디에도 안 걸리고, 독촉은 a.repair.vendor 로 보내므로 보낼 곳도 없다 —
 *  '수리중 N건'으로만 보이고 빠져나갈 길이 없는 상태가 된다(일정 없는 수리가 독촉에서 빠지는 역설의 한 칸 더 안쪽).
 *  업체가 아니라 담당자가 해야 할 일이라, 독촉 대신 화면이 '의뢰 정보 등록 필요'로 드러낸다. 서버 전용. */
export function isRepairUnrecorded(a: Asset): boolean {
  return a.status === '수리중' && !a.repair
}

/** 도입 예정(발주) 입고 지연 — 도착 예정일이 지났는데 아직 입고되지 않은 사전 등록 로트.
 *  제품안내서 §06 ITSM·구매 연동(SR·발주 연계) — 발주처 독촉·납기 관리의 기준. 서버 전용. */
export function isIntakeOverdue(l: IntakeLot): boolean {
  if (l.status !== '도입 예정' || !l.expectedDate) return false
  return (daysUntil(l.expectedDate) ?? 0) < 0
}

/** 보증 만료 임박·경과 — 운영 중(폐기예정·폐기완료 제외) 자산 중 보증 만료가 알림 창 안에 든 것(경과 포함).
 *  보증이 없는 자산(SW·가상자원)은 대상이 아니다.
 *  창(windowDays)은 운영 정책 opsPolicy.expiryWindowDays 를 호출부가 넘긴다(isMaintenanceDue·isStaleVerify 와 동일 규약).
 *  그전에는 통지(lib/expiry 의 expiryNoticeTargets)만 정책을 따르고 대장 필터·대시보드 큐·어시스턴트는 90 을 박아 둬,
 *  관리자가 만료창을 줄이면 '보증 만료 임박 자산 N건' 통지와 화면의 보증 임박 집합이 서로 다른 것을 가리켰다.
 */
export function isWarrantyExpiring(a: Asset, windowDays: number): boolean {
  if (!a.warrantyEnd || a.warrantyEnd === '-' || DISPOSAL_STATUSES.includes(a.status)) return false
  return (daysUntil(a.warrantyEnd) ?? 999) <= windowDays
}

/** 정기 점검 대상 — 예방 정비 예정일이 30일 내로 도래했거나 지난(미시행) 운영 자산. 폐기 절차 자산은 제외. 서버 전용.
 *  반응형 수리(장애·반납)와 별개로, 사전 정비 일정이 도래한 자산을 대장·대시보드에 드러낸다(§03 유지보수). */
export function isMaintenanceDue(a: Asset, windowDays = 30): boolean {
  // 운영 상태 자산만 대상 — 폐기/분실은 물론, 이미 수리중이거나 반납대기(보유자 이탈 중)인 자산은 예방 정비 대상이 아니다
  // (isLoanOverdue/isRepairOverdue 처럼 상태로 가른다 — 잔여 maintenanceDue 로 인한 큐 오염·오독촉 방지).
  // windowDays 는 운영 정책(opsPolicy.maintenanceWindowDays) 값을 호출부가 넘긴다(isStaleVerify 와 동일 규약). 기본 30.
  if (!a.maintenanceDue || NON_OPERATIONAL_STATUSES.includes(a.status)) return false
  return (daysUntil(a.maintenanceDue) ?? 999) <= windowDays
}

/** 정기 점검 경과(미시행) — 예방 정비 예정일이 지났는데도 점검이 안 된 운영 자산. isMaintenanceДue 의 부분집합(도래 임박 제외).
 *  독촉 대상 판정에 쓴다 — 임박(D-30)은 예고, 경과는 이미 넘긴 것이라 소유 부서 앞으로 점검 독촉을 보낸다. 서버 전용. */
export function isMaintenanceOverdue(a: Asset): boolean {
  // isMaintenanceDue 와 동일 운영 상태 게이트 — 분실·수리중·반납대기 자산에 정기 점검 독촉이 나가지 않게 한다.
  if (!a.maintenanceDue || NON_OPERATIONAL_STATUSES.includes(a.status)) return false
  return (daysUntil(a.maintenanceDue) ?? 999) < 0
}

/** 보증 상태 — 자산의 보증 만료일 대비 현재 상태. 상세·카드에서 한눈에 보증 여부를 드러낸다(수리 무상 판단·교체 시점).
 *  none=보증 정보 없음(SW 등) / expired=만료 / soon=만료 임박 / covered=보증 내. today 인자로 하이드레이션 안전.
 *  임박 창(windowDays)은 운영 정책 opsPolicy.expiryWindowDays 를 호출부가 넘긴다(isWarrantyExpiring 과 동일 규약).
 *  그전에는 여기만 90 을 박아 둬, 관리자가 만료창을 줄여도 대장 칩·자산 카드·반출본의 '만료 임박' 은 90일 기준으로 남았다 —
 *  같은 대장 화면에서 '보증 임박' 필터 설명은 정책 일수를 말하는데 행 옆 칩은 90일로 서고, 같은 반출본이 정책 창으로 거른
 *  행 목록과 90일로 매긴 '보증 상태' 열을 나란히 실었다. */
export function warrantyState(warrantyEnd: string, today: string, windowDays: number = EXPIRY_WINDOW_DAYS): 'none' | 'expired' | 'soon' | 'covered' {
  if (!warrantyEnd || warrantyEnd === '-') return 'none'
  if (warrantyEnd < today) return 'expired'
  const d = Math.round((Date.parse(warrantyEnd) - Date.parse(today)) / 86_400_000)
  return d <= windowDays ? 'soon' : 'covered'
}

/** 상신 후 경과일 — 서버가 준 today(YYYY-MM-DD) 인자로만 계산해 서버·클라이언트 모두 하이드레이션 안전하게 쓴다. */
export function approvalAgeDays(requestedAt: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(requestedAt)) / 86_400_000))
}

/** 결재 지연 — '대기' 상태로 SLA(slaDays, 운영 정책 approvalSlaDays)를 초과했다. Approval 타입 의존을 피해 구조적 타입으로 받는다.
 *  임계값은 스토어 opsPolicy 를 단일 출처로 받는다(호출부가 s.opsPolicy.approvalSlaDays 전달). */
export function isApprovalOverdue(a: { status: string; requestedAt: string }, today: string, slaDays: number): boolean {
  return a.status === '대기' && approvalAgeDays(a.requestedAt, today) > slaDays
}
