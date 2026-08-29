'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit, denied } from '@/lib/audit'
import { today } from '@/lib/dates'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { can } from '@/lib/perm'
import { lowStockCategories } from '@/lib/stock'

/** 발주 요청 발송 — 안전재고 미달(가용 재고 부족) 유형에 대해 구매·IT기획팀에 보충 발주를 요청한다(루프 57).
 *  재고 경보가 표시로 끝나지 않고 조치(발주 요청)로 이어지게 한다 — 만료 알림·독촉과 같은 통지 패턴.
 *  부족 수량을 유형별로 담아 발송하고, 당일 중복 발송은 차단한다. 자산담당·Admin. */
export async function requestReorder() {
  const session = await getSession()
  if (!session) return { ok: false, message: '발주 요청 권한이 없습니다 (자산담당·Admin).' }
  if ((!['ASSET_MGR', 'ADMIN'].includes(session.role) || !can('재고 · 재물조사', '저장', session.role))) return denied(session.name, '발주 요청 권한이 없습니다 (자산담당·Admin).', '/inventory/stock')
  const s = getStore()
  const low = lowStockCategories(s.assets, s.disposals, s.opsPolicy.safetyStock)
  if (low.length === 0) return { ok: false, message: '발주 요청 대상이 없습니다 — 모든 불출형 재고가 안전재고 이상입니다.' }

  const t = today()
  // 당일 이미 발주 요청을 보냈으면 중복 발송하지 않는다(알림 피로 방지)
  if (s.dispatches.some((m) => m.kind === '발주 요청' && m.at.startsWith(t))) {
    return { ok: false, message: '오늘 이미 발주 요청을 발송했습니다 (당일 중복 발송 차단).' }
  }
  //  검수중 미배정분은 불출 가드가 받아 주는 재고다 — 빼고 통보하면 구매팀이 실제보다 큰 부족으로 발주한다
  const summary = low.map((r) => `${r.category} ${r.short}대(가용 ${r.available}/안전재고 ${r.safetyStock}${r.intake ? ` · 검수중 ${r.intake}대` : ``})`).join(', ')
  dispatch({ channel: '이메일', to: '구매팀 · IT기획팀', subject: `IT 자산 발주 요청 — 안전재고 미달 ${low.length}종: ${summary}`, kind: '발주 요청', ref: 'STOCK' })
  appendAudit({ actor: session.name, action: `안전재고 발주 요청 발송 (${low.length}종 — ${summary})`, target: '재고 보충' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `발주 요청 발송 — ${low.length}종(${summary}) 구매·IT기획팀 통지 (발송 이력 적재)` }
}
