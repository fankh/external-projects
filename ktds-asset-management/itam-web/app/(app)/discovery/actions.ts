'use server'
import { revalidatePath } from 'next/cache'
import { TODAY } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'

/** 발견 자산 편입 요청 — 소유자 확인 → 자산 등록 결재를 통과해야 대장에 편입 (편입도 결재로) */
export async function requestOnboard(discoveredId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d || d.action) return
  d.action = '편입요청'
  s.approvals.unshift({
    id: nextId('APR-2607'),
    kind: '자산 신청',
    title: `${d.id} (${d.hostname}) 대장 편입 — 발견 채널: ${d.channel}`,
    requester: session.name,
    dept: d.ownerCandidate ?? session.dept,
    requestedAt: TODAY,
    status: '대기',
    currentStep: '자산담당 검토',
    refId: d.id,
  })
  revalidatePath('/', 'layout')
}

/** NAC 격리 요청 — 미확인·미인가 자산 차단 (발견과 조치의 양방향 폐쇄 루프) */
export async function requestQuarantine(discoveredId: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return
  const s = getStore()
  const d = s.discovered.find((x) => x.id === discoveredId)
  if (!d || d.action) return
  d.action = '격리요청'
  s.approvals.unshift({
    id: nextId('APR-2607'),
    kind: '격리 요청',
    title: `${d.id} (${d.hostname}) NAC 격리 — ${d.note ?? '미확인 자산'}`,
    requester: session.name,
    dept: session.dept,
    requestedAt: TODAY,
    status: '대기',
    currentStep: '보안담당 승인',
    refId: d.id,
  })
  revalidatePath('/', 'layout')
}
