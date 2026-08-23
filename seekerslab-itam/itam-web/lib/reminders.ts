import { isMaintenanceOverdue, today } from './dates'
import { isEolTarget } from './eol'
import { getStore } from './store'
import type { Asset } from './types'

/** 독촉·통보 **신규** 발송 대상 — 대상 조건에 들면서 오늘 아직 보내지 않은 자산만 추린다.
 *  (같은 대상에 하루 두 번 보내지 않는다 — 알림 피로가 알림을 무력화한다. 만료 임박 통지의 lib/expiry 와 같은 규약.)
 *
 *  대장 화면의 '수령 확인 독촉 발송 (N)' · '정기 점검 독촉 발송 (N)' · 'EOL 업그레이드 통보 (N)' 버튼 건수와
 *  각 액션의 발송 로직이 이 모듈을 공유한다. 그전에는 화면이 조건에 드는 자산 전부를 세고 액션만 당일 발송분을
 *  제외해, 한 번 보낸 뒤에도 버튼이 같은 건수로 남아 있다가 누르면 '오늘 발송분 제외 — 대상이 없습니다'로
 *  끝나는 유령 컨트롤이 됐다(만료 임박 알림에서 닫은 바로 그 드리프트). 서버 전용. */
function sentTodayRefs(kind: string, subjectIncludes?: string): Set<string | undefined> {
  const s = getStore()
  const t = today()
  return new Set(
    s.dispatches
      .filter((m) => m.kind === kind && m.at.startsWith(t) && (!subjectIncludes || m.subject.includes(subjectIncludes)))
      .map((m) => m.ref),
  )
}

/** 수령(인수) 미확인 독촉 대상 — 불출 후 인수 확인이 안 된 사용중 자산(현 보유자 보유분만). */
export function receiptRemindTargets(): Asset[] {
  const sent = sentTodayRefs('수령 확인', '독촉')
  return getStore().assets.filter((a) => a.receiptPending && a.status === '사용중' && !sent.has(a.assetNo))
}

/** 정기 점검 독촉 대상 — 예방 정비 예정일이 지났는데도 미시행인 운영 자산(임박분 제외). */
export function maintenanceRemindTargets(): Asset[] {
  const sent = sentTodayRefs('정기 점검 독촉')
  return getStore().assets.filter((a) => isMaintenanceOverdue(a) && !sent.has(a.assetNo))
}

/** EOL OS 업그레이드·교체 통보 대상 — 지원 종료가 경과한 운영 중 자산. */
export function eolNoticeTargets(): Asset[] {
  const sent = sentTodayRefs('EOL 업그레이드 통보')
  const t = today()
  return getStore().assets.filter((a) => isEolTarget(a.status, a.os, t) && !sent.has(a.assetNo))
}
