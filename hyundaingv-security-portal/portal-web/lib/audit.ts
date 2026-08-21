/** 감사 이력 — 결재 처리·권한/설정 변경 등 통제 행위를 기록한다 (제품안내서 §VI 이력 추적성).
 *  업무 데이터와 달리 수정·삭제 액션이 없는 append-only 로그다. */
import { nowStamp } from './dates'
import { getStore } from './store'
import type { AuditLog } from './types'

export type AuditAction =
  | '결재 상신' | '결재 승인' | '결재 반려' | '결재 회수'
  | '결재선 변경' | '연동 채널 변경' | '공통코드 변경' | '서약양식 개정' | '보안서약 대리등록' | '엑셀양식 변경' | '게시물 삭제' | '재택 대상자 변경' | '점검 기준 변경' | '인프라 자산 변경' | '메뉴권한 변경' | '사용자 그룹 변경' | '보안위반 등록' | '협력업체 서약 징구' | '보안담당자 지정' | '교육 이수 등록' | '재무 속보 등록' | '재무 속보 수정' | '정산품의 삭제' | '보안성 검토 완료' | '컴플라이언스 스냅샷'
  | '장애 등록' | '장애 조치' | '변경 등록' | '화면 정의서 변경'
  | '인사정보 동기화' | '배치 수동 실행' | '일배치 이관' | '알림 배치 실행' | '전자결재 상신 연동'
  | '위험 등록' | '위험 변경' | '위험 삭제' | '위험 스냅샷'
  | '정책 등록' | '정책 변경' | '정책 삭제'
  | '복구계획 등록' | '복구계획 변경' | '복구계획 삭제'

const MAX_LOGS = 500

export function audit(actor: string, action: AuditAction, detail: string): void {
  const s = getStore()
  s.auditLogs.unshift({ at: nowStamp(), actor, action, detail: detail.slice(0, 200) })
  if (s.auditLogs.length > MAX_LOGS) s.auditLogs.length = MAX_LOGS
}

/** 감사 이력 조회 필터 — 화면·엑셀 export 가 공유하는 단일 원천(중복 산식 drift 방지). 감사관이 '누가·무엇을·
 *  언제'로 좁혀 증적을 찾고 그대로 내려받게 한다. 빈 필드는 무시. 날짜는 at 의 YYYY-MM-DD 부분을 문자열
 *  사전순 비교(양끝 포함) — at 은 항상 'YYYY-MM-DD HH:MM' 이라 패딩이 보장돼 사전순=시간순. 손상 로그
 *  (비문자열 action 등)도 문자열 강제로 방어(감사 화면이 500 나지 않게). */
export interface AuditFilter {
  actor?: string
  action?: string
  q?: string
  from?: string
  to?: string
}

export function filterAuditLogs(logs: AuditLog[], f: AuditFilter): AuditLog[] {
  const actor = (f.actor ?? '').trim()
  const action = (f.action ?? '').trim()
  const q = (f.q ?? '').trim().toLowerCase()
  const from = (f.from ?? '').trim()
  const to = (f.to ?? '').trim()
  return logs.filter((l) => {
    if (actor && l.actor !== actor) return false
    if (action && String(l.action ?? '') !== action) return false
    const day = String(l.at ?? '').slice(0, 10)
    if (from && day < from) return false
    if (to && day > to) return false
    if (q) {
      const hay = `${l.actor ?? ''} ${String(l.action ?? '')} ${l.detail ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
