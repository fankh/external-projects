/** 감사 이력 — 결재 처리·권한/설정 변경 등 통제 행위를 기록한다 (제품안내서 §VI 이력 추적성).
 *  업무 데이터와 달리 수정·삭제 액션이 없는 append-only 로그다. */
import { nowStamp } from './dates'
import { getStore } from './store'

export type AuditAction =
  | '결재 상신' | '결재 승인' | '결재 반려' | '결재 회수'
  | '결재선 변경' | '연동 채널 변경' | '공통코드 변경' | '서약양식 개정' | '엑셀양식 변경' | '게시물 삭제' | '재택 대상자 변경' | '점검 기준 변경' | '인프라 자산 변경' | '메뉴권한 변경' | '보안위반 등록' | '재무 속보 수정' | '보안성 검토 완료'
  | '인사정보 동기화' | '배치 수동 실행' | '일배치 이관' | '알림 배치 실행'

const MAX_LOGS = 500

export function audit(actor: string, action: AuditAction, detail: string): void {
  const s = getStore()
  s.auditLogs.unshift({ at: nowStamp(), actor, action, detail: detail.slice(0, 200) })
  if (s.auditLogs.length > MAX_LOGS) s.auditLogs.length = MAX_LOGS
}
