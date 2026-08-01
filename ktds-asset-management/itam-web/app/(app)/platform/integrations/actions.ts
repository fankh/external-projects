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
