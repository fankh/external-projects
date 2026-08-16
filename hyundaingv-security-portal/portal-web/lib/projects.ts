/** 프로젝트 PMO 신호 단일 원천 — 산출물 완료·기한경과, 오픈 이슈, 높은 리스크(오픈)를 화면(schedule)·
 *  대시보드가 같은 술어로 산출해 수치 불일치를 막는다. 데이터는 전부 in-store(연동 무관). */
import { today } from './dates'
import type { Store } from './store'

export interface ProjectPmo {
  /** 산출물 전체 */
  dlTotal: number
  /** 산출물 완료 */
  dlDone: number
  /** 산출물 기한 경과 (미완료 + 기한 < 오늘) */
  dlLate: number
  /** 오픈 이슈 */
  openIssues: number
  /** 오픈 이슈 중 리스크 '높음' */
  highRiskOpen: number
}

export function computeProjectPmo(s: Store): ProjectPmo {
  const t = today()
  const open = s.projectIssues.filter((i) => i.status === '오픈')
  return {
    dlTotal: s.deliverables.length,
    dlDone: s.deliverables.filter((d) => d.done).length,
    dlLate: s.deliverables.filter((d) => !d.done && d.due < t).length,
    openIssues: open.length,
    highRiskOpen: open.filter((i) => i.risk === '높음').length,
  }
}
