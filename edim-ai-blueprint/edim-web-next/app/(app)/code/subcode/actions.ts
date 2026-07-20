'use server'

/** Sub Code 등록 뮤테이션 (N4b) — 그룹 등록·항목 등록(+승인 PENDING)·Excel Import. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'
import { getToken } from '@/lib/session'

const PATH = '/code/subcode'
const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export interface ActState { error?: string; ok?: string }

export async function createGroup(_prev: ActState, formData: FormData): Promise<ActState> {
  const groupCode = String(formData.get('groupCode') ?? '').trim().toUpperCase()
  const groupName = String(formData.get('groupName') ?? '').trim()
  if (!groupCode || !groupName) return { error: '그룹 코드·이름은 필수입니다' }
  const body = {
    groupCode, groupName,
    groupType: String(formData.get('groupType') ?? 'PRODUCT').trim(),
  }
  try {
    await apiServer('/codes/groups', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '그룹 등록 실패 (중복 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `그룹 ${groupCode} 등록 (DRAFT)` }
}

export async function addItem(group: string, slot: string, name: string, values: string[]): Promise<ActState> {
  if (!slot.trim() || !name.trim()) return { error: 'Item No·Description 은 필수입니다' }
  try {
    await apiServer(`/codes/groups/${encodeURIComponent(group)}/items`, {
      method: 'POST', body: JSON.stringify({ slot: slot.trim().toUpperCase(), name: name.trim(), values }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '항목 등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${slot.toUpperCase()} 등록 — 승인 요청 (PENDING)` }
}

/** #28 — Slot 의 미승인 값 일괄 승인. 승인된 값만 제품 코드 조합에 쓸 수 있다. */
export async function approveSlotValues(group: string, slot: string): Promise<ActState> {
  try {
    const vals = await apiServer<{ slot: string; valueCode: string; status: string; valueId: number }[]>(
      `/codes/values?group=${encodeURIComponent(group)}`)
    const pending = vals.filter((v) => v.slot === slot && v.status !== 'APPROVED' && v.status !== 'DEPRECATED')
    if (!pending.length) return { error: `${slot} 에 승인 대기 값이 없습니다` }
    for (const v of pending) {
      await apiServer(`/codes/values/${v.valueId}`, { method: 'PATCH', body: JSON.stringify({ approve: true }) })
    }
    revalidatePath(PATH)
    return { ok: `${slot} 승인 ${pending.length}건 — 조합 사용 가능 (${pending.map((v) => v.valueCode).join(', ')})` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 실패' }
  }
}

export async function importGroupExcel(_prev: ActState, formData: FormData): Promise<ActState> {
  const group = String(formData.get('group') ?? '').trim()
  const file = formData.get('uploadedFile')
  // 트리아지 #32 — Diff Review: 검토만 체크 시 반영 없이 미리보기
  const dryRun = formData.get('dryRun') === 'on'
  if (!(file instanceof File) || file.size === 0) return { error: 'Excel 파일을 선택하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/codes/groups/${encodeURIComponent(group)}/import-excel${dryRun ? '?dryRun=true' : ''}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  const r = await res.json() as {
    dryRun?: boolean; inserted: number; updated: number; rejected: string[]
    diff?: { row: number; slot: string; action: string; before?: string; after: string }[]
  }
  if (r.dryRun) {
    const head = (r.diff ?? []).slice(0, 5)
      .map((d) => `${d.slot}:${d.action === 'update' ? `${d.before}→${d.after}` : `+${d.after}`}`).join(', ')
    return { ok: `검토(Diff) — 추가 ${r.inserted} · 갱신 ${r.updated} · 거부 ${r.rejected.length}${head ? ` | ${head}${(r.diff?.length ?? 0) > 5 ? ' …' : ''}` : ''} (미반영)` }
  }
  revalidatePath(PATH)
  return { ok: `Import — 추가 ${r.inserted} · 갱신 ${r.updated}${r.rejected?.length ? ` · 거부 ${r.rejected.length}` : ''}` }
}
