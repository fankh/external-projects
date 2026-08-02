'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
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

  // 점검 결과가 다음 상태를 결정한다:
  //  - 폐기 권고 → 폐기예정 (유휴 풀을 거치지 않고 폐기 절차로)
  //  - 수리 필요 → 수리중 (수리를 마쳐야 유휴 풀에 들어간다. 고장 자산이 바로 재불출되면 안 된다)
  //  - 정상 → 유휴 (바로 재배치 가능)
  if (condition === '폐기 권고') {
    asset.status = '폐기예정'
    // 폐기 권고는 폐기 절차로 바로 편입한다 — 폐기 대상 레코드를 만들어야 결재·소거로 이어진다
    // (그동안 상태만 폐기예정으로 바뀌고 폐기 대장에 오르지 않아 소거로 진행할 수 없었다)
    if (!s.disposals.some((d) => d.assetNo === assetNo)) {
      s.disposals.push({ id: nextId('DSP'), assetNo, model: asset.model, reason: `반납 점검 폐기 권고${note.trim() ? ` — ${note.trim()}` : ''}`, status: '대상 선정', prevStatus: '유휴' })
    }
  } else if (condition === '수리 필요') {
    asset.status = '수리중'
    asset.owner = '미지정'
    asset.dept = '자산관리팀'
    asset.location = location
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

  const next = condition === '폐기 권고' ? '폐기 절차 대상으로 전환'
    : condition === '수리 필요' ? `수리중 편성 — 수리 완료 후 유휴 풀로 (${location})`
    : `유휴 풀 편성 — ${location}`
  return { ok: true, message: `${assetNo} 반납 접수 완료 · 점검 ${condition} → ${next}` }
}

/** 수리 완료 처리 — 수리중 자산을 유휴 풀로 되돌리거나(수리 완료), 수리 불가면 폐기 절차로 보낸다.
 *  (제품안내서 §03 유지보수 — 고장 자산은 수리를 마쳐야 재배치 가능 재고가 된다) */
export async function completeRepair(assetNo: string, outcome: '수리 완료' | '수리 불가', note: string) {
  const session = await getSession()
  if (!session || !['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return { ok: false, message: '수리 처리 권한이 없습니다 (자산담당·Admin).' }
  }

  const s = getStore()
  const asset = s.assets.find((a) => a.assetNo === assetNo)
  if (!asset) return { ok: false, message: '자산을 찾을 수 없습니다.' }
  if (asset.status !== '수리중') {
    return { ok: false, message: `수리중 자산이 아닙니다 — ${assetNo} (${asset.status})` }
  }

  asset.status = outcome === '수리 완료' ? '유휴' : '폐기예정'
  asset.history.push({
    date: today(),
    kind: '수리',
    detail: `수리 처리 ${outcome}${note ? ` — ${note}` : ''}`,
    actor: session.name,
  })
  appendAudit({ actor: session.name, action: `수리 처리 (${outcome})`, target: assetNo })
  revalidatePath('/', 'layout')

  const next = outcome === '수리 완료' ? '유휴 풀 편성 — 재배치 가능' : '폐기예정 전환 — 폐기 절차로'
  return { ok: true, message: `${assetNo} ${outcome} → ${next}` }
}
