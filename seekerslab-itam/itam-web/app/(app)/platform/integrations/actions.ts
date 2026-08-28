'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit, appendDenial } from '@/lib/audit'
import { nowMinute } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

async function guard() {
  const session = await getSession()
  // 커넥터 관리는 인프라·보안 책임 — 보안담당·Admin. 자산담당은 조회만.
  if (!session) return null
  if (!['SEC_MGR', 'ADMIN'].includes(session.role)) {
    // 거부는 감사에 남긴다 — 서버 액션은 화면에서 버튼을 숨겨도 액션 id 로 직접 호출할 수 있다.
    //  화면 진입·문서 반출 거부는 이미 '결과=실패'로 남는데, 정작 변경을 시도한 기록만 빠져 있었다.
    //  같은 사람·같은 화면의 반복은 하루 한 건으로 접힌다(lib/audit appendDenial).
    appendDenial({ actor: session.name, action: '권한 밖 변경 시도 — 연동 · 인프라 (커넥터 관리)', target: '/platform/integrations' })
    return null
  }
  return session
}

/** 커넥터 연결 테스트 · 재연동 — 지연/오류/미연동 커넥터의 상태를 재확인하고 최근 수집 시각을 갱신한다.
 *  결과는 상태·최근 수집에 반영되고 같은 화면의 감사 로그에 남는다 (§06·§07 운영·추적성).
 *  목업: 실제 NAC·EDR 대신 헬스체크를 시뮬레이션한다(스캔 실행과 같은 경계). */
export async function testConnector(id: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '커넥터 관리 권한이 없습니다 (보안담당·Admin).' }

  const s = getStore()
  const conn = s.integrations.find((i) => i.id === id)
  if (!conn) return { ok: false, message: '커넥터를 찾을 수 없습니다.' }

  const before = conn.status
  const activated = before === '미연동'
  conn.status = '정상'
  conn.lastSync = nowMinute()

  appendAudit({
    actor: session.name,
    action: `커넥터 ${activated ? '연동 활성화' : '연결 테스트 · 재연동'} — ${before} → 정상`,
    target: conn.system,
    result: '성공',
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${conn.system} ${activated ? '연동 활성화' : '재연동'} 완료 — 상태 정상 · 최근 수집 ${conn.lastSync}` }
}

/** 알림 재발송 — 전달 실패(반송·게이트웨이 오류)한 통지를 배치·연동 서버로 다시 보낸다(§06 이메일·문자 발송 신뢰성).
 *  긴급 격리·에스컬레이션 문자가 미도달하면 야간·현장 대응이 지연되므로, 실패 건을 재발송으로 닫는다. 보안담당·Admin. */
export async function resendDispatch(id: string) {
  const session = await guard()
  if (!session) return { ok: false, message: '알림 재발송 권한이 없습니다 (보안담당·Admin).' }
  const s = getStore()
  const msg = s.dispatches.find((m) => m.id === id)
  if (!msg) return { ok: false, message: '발송 이력을 찾을 수 없습니다.' }
  if (msg.deliveryStatus !== '실패') return { ok: false, message: '전달 실패 건만 재발송할 수 있습니다.' }
  // 실패했던 시각을 먼저 보존한다 — at 은 최신 시도로 덮인다(당일 중복 억제가 at 을 본다).
  //  덮기만 하면 이 행은 '처음부터 정상 발송'으로 읽혀 재발송했다는 사실 자체가 사라진다.
  msg.failedAt ??= msg.at
  msg.resentBy = session.name
  msg.deliveryStatus = '발송'
  msg.at = nowMinute()
  // 시각을 고쳤으면 자리도 옮긴다 — 발송 이력은 정렬 없이 배열 순서를 그대로 보여 주고(화면·반출 모두),
  //  그 순서는 unshift 로 유지되는 '최신 먼저'다. at 만 오늘로 고치고 자리를 두면 오늘 나간 발송이 옛 행들
  //  사이에 묻혀, 목록 위쪽만 훑는 사람은 재발송된 통지를 못 본다(날짜 필터에는 걸리는데 순서는 어긋난다).
  s.dispatches = [msg, ...s.dispatches.filter((m) => m.id !== msg.id)]
  appendAudit({ actor: session.name, action: `알림 재발송 — ${msg.channel} ${msg.kind} (${msg.to})`, target: id, result: '성공' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${msg.channel} 알림 재발송 — ${id} 전달 완료` }
}
