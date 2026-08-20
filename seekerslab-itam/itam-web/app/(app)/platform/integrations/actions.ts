'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { nowMinute } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'

async function guard() {
  const session = await getSession()
  // 커넥터 관리는 인프라·보안 책임 — 보안담당·Admin. 자산담당은 조회만.
  if (!session || !['SEC_MGR', 'ADMIN'].includes(session.role)) return null
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
  msg.deliveryStatus = '발송'
  msg.at = nowMinute()
  appendAudit({ actor: session.name, action: `알림 재발송 — ${msg.channel} ${msg.kind} (${msg.to})`, target: id, result: '성공' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `${msg.channel} 알림 재발송 — ${id} 전달 완료` }
}
