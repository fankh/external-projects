'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import type { ReturnCondition } from '@/lib/types'

/** 반납 접수 · 상태 점검 — 회수한 실물을 점검해 유휴 풀에 넣을지, 수리·폐기로 뺄지 가른다.
 *  (제품안내서 §03 PHASE 4: 반납 접수·상태 점검, 유휴 자산 풀 관리) */
export async function receiveReturn(assetNo: string, condition: ReturnCondition, location: string, note: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '반납 접수 권한이 없습니다.' }
  }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '반납대기') {
    return { ok: false, message: `반납 접수 대상이 아닙니다 — ${assetNo} (${asset.status})` }
  }

  const prevOwner = asset.owner

  // 점검 결과가 다음 상태를 결정한다 — 폐기 권고는 유휴 풀을 거치지 않고 폐기 절차로 간다
  if (condition === '폐기 권고') {
    asset.status = '폐기예정'
  } else {
    asset.status = '유휴'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = location
  }

  asset.history.push({
    date: today(),
    kind: '반납',
    detail: `반납 접수 · 상태 점검 ${condition}${note ? ` — ${note}` : ''} (반납자 ${prevOwner})`,
    actor: session.name,
  })

  appendAudit({ actor: session.name, action: `반납 접수 (점검 ${condition})`, target: assetNo })
  revalidatePath('/', 'layout')

  const next = condition === '폐기 권고' ? '폐기 절차 대상으로 전환' : `유휴 풀 편성 — ${location}`
  return { ok: true, message: `${assetNo} 반납 접수 완료 · 점검 ${condition} → ${next}` }
}
