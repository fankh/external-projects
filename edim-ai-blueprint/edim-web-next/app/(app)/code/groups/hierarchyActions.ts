'use server'

/** Hierarchy 주소 (M-3-1) 뮤테이션 (N4b) — sys_hierarchy 노드 등록·개명·삭제. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/code/groups'

export interface ActState { error?: string; ok?: string }

export async function addHierarchyNode(_prev: ActState, formData: FormData): Promise<ActState> {
  const name = String(formData.get('name') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  if (!name || !address) return { error: '이름·주소는 필수입니다' }
  const body = {
    treeType: String(formData.get('treeType') ?? 'PRODUCT').trim(),
    name, address,
    symbol: String(formData.get('symbol') ?? '').trim(),
    parentAddress: String(formData.get('parentAddress') ?? '').trim(),
  }
  try {
    await apiServer('/hierarchy/nodes', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '노드 등록 실패' }
  }
  revalidatePath(PATH)
  return { ok: `${address} ${name} 등록` }
}

export async function renameHierarchyNode(id: number, name: string, symbol: string): Promise<ActState> {
  if (!name.trim()) return { error: '새 이름을 입력하십시오' }
  try {
    await apiServer(`/hierarchy/nodes/${id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim(), symbol }) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '개명 실패' }
  }
  revalidatePath(PATH)
  return { ok: `#${id} → ${name}` }
}

export async function deleteHierarchyNode(id: number): Promise<ActState> {
  try {
    await apiServer(`/hierarchy/nodes/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (하위/참조 보호 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `#${id} 삭제` }
}

/** U18 — 노드 이동 (대상 부모 하위로, 하위 주소 연쇄 재계산). targetParentId null = 루트. */
export async function moveHierarchyNode(id: number, targetParentId: number | null): Promise<ActState> {
  try {
    const r = await apiServer<{ newAddress: string; moved: number }>(`/hierarchy/nodes/${id}/move`, {
      method: 'POST', body: JSON.stringify({ targetParentId }),
    })
    revalidatePath('/code/groups')
    return { ok: `이동 ✓ — 새 주소 ${r.newAddress} (${r.moved}노드)` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '이동 실패' }
  }
}

export interface NodeInfo {
  address: string; name: string; symbol: string; treeType: string; status: string
  isSystem: boolean; remarks: string; createdBy: string; createdAt: string; updatedAt: string; descendants: number
}

export async function getNodeInfo(id: number): Promise<NodeInfo | null> {
  try {
    return await apiServer<NodeInfo>(`/hierarchy/nodes/${id}/info`)
  } catch { return null }
}

export interface HierarchyIssue { type: string; nodeId: number; name: string; address: string; detail: string }
export interface ValidateResult { tree: string; nodes: number; ok: boolean; issues: HierarchyIssue[] }

/** U22 — 저장 전 정합 점검 (주소 중복·고아·부모 불일치·루트 형식). */
export async function validateHierarchy(tree: string): Promise<ValidateResult | null> {
  try {
    return await apiServer<ValidateResult>(`/hierarchy/validate?tree=${encodeURIComponent(tree)}`)
  } catch { return null }
}
