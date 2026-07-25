'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface RunningTestRow { no: string; name: string; desc: string; qty: number; remarks: string }
interface TestApiRow extends RunningTestRow { mainCode: string; level?: number; path?: string }

/** 전개 무결성 — 서버가 **실제로 계산한** 값. 순환·깊이 초과가 있으면 전개 결과는 일부다. */
export interface TestIntegrity {
  passed: boolean; cycleCheck: string; cycles: string[]
  depthCapped: boolean; maxLevel: number; notes: string[]
}

/** Running Test — Mother slot 조합으로 Child 전량 전개 (CODE-009). 체크 해제 직계는 서브트리 제외. */
export async function runningTest(mother: string, slotValues: Record<string, string>, checked: string[]): Promise<{ rows?: RunningTestRow[]; integrity?: TestIntegrity; error?: string }> {
  try {
    const r = await apiServer<{ rows: TestApiRow[] } & TestIntegrity>('/codes/relationships/running-test', {
      method: 'POST', body: JSON.stringify({ motherCode: mother, slotValues }),
    })
    const checkedSet = new Set(checked)
    const unchecked = r.rows.filter((row) => row.level === 1 && !checkedSet.has(row.mainCode)).map((row) => row.mainCode)
    const rows = r.rows.filter((row) => row.no === 'Main' || !unchecked.some((c) => (row.path ?? '').includes(`> ${c}`)))
    return { rows, integrity: { passed: r.passed, cycleCheck: r.cycleCheck, cycles: r.cycles ?? [], depthCapped: r.depthCapped, maxLevel: r.maxLevel, notes: r.notes ?? [] } }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Running Test 실패' }
  }
}

/** Child 실등록 (DRAFT, Running Test 통과 후 승인 CODE-009). relId 반환 — 세션 내 삭제(undo) 대상. */
export async function addChild(mother: string, child: string, qty: number): Promise<{ relId?: number; error?: string }> {
  if (!child.trim()) return { error: 'Child Code 를 입력하십시오' }
  try {
    const r = await apiServer<{ relId: number }>('/codes/relationships', { method: 'POST', body: JSON.stringify({ mother, child: child.trim(), qty }) })
    revalidatePath('/code/relationship')
    return { relId: r.relId }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Child 추가 실패' }
  }
}

/** DRAFT 관계 삭제 — 승인 전 잘못 추가한 Child 회수 (백엔드: DRAFT 한정, 승인 관계 보호). */
export async function deleteRelationship(relId: number): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer(`/codes/relationships/${relId}`, { method: 'DELETE' })
    revalidatePath('/code/relationship')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'DRAFT 관계 삭제 실패' }
  }
}

/** 승인 요청 — 범용 승인 API (승인 시 mother 관계 세트 APPROVED 전이). */
export async function requestApproval(mother: string, testCount: number): Promise<{ ok?: true; error?: string }> {
  try {
    await apiServer('/approvals', {
      method: 'POST',
      body: JSON.stringify({ targetTable: 'code_relationship', targetId: 0, requestType: 'UPDATE', label: `Code Relationship — ${mother} (Running Test ${testCount}행 통과)`, targetCode: mother }),
    })
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '승인 요청 실패' }
  }
}

/** U20 — 관계 구성 실도면 (CAD 정본, /cad/arrangement 재사용). */
export async function relationshipCad(): Promise<import('@/lib/cadTypes').CadDocument | null> {
  try {
    const r = await apiServer<{ document: import('@/lib/cadTypes').CadDocument }>('/cad/arrangement')
    return r.document
  } catch { return null }
}

/** #29 — Mother 선택조건 → Child 전개 기준 (슬롯 매핑) CRUD.
 *  종전엔 시드로만 존재해 사용자가 만든 관계는 Child 슬롯이 빈 채 전개됐다. */
export interface SlotMapRow { slotMapId: number; childSlot: string; motherSlot: string | null; fixedValue: string | null }
export interface SlotMapView {
  relId: number; mother: string; child: string; status: string
  maps: SlotMapRow[]; motherSlots: string[]; childSlots: string[]
}

export async function getSlotMap(relId: number): Promise<SlotMapView | null> {
  try { return await apiServer<SlotMapView>(`/codes/relationships/${relId}/slot-map`) } catch { return null }
}

export async function addSlotMap(relId: number, childSlot: string, motherSlot: string,
                                 fixedValue: string): Promise<{ ok?: string; error?: string }> {
  try {
    await apiServer(`/codes/relationships/${relId}/slot-map`, {
      method: 'POST', body: JSON.stringify({ childSlot, motherSlot, fixedValue }),
    })
    revalidatePath('/code/relationship')
    return { ok: `${childSlot} ← ${motherSlot || `"${fixedValue}"`} 매핑 추가` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '매핑 추가 실패' }
  }
}

export async function delSlotMap(relId: number, slotMapId: number): Promise<{ ok?: string; error?: string }> {
  try {
    await apiServer(`/codes/relationships/${relId}/slot-map/${slotMapId}`, { method: 'DELETE' })
    revalidatePath('/code/relationship')
    return { ok: '매핑 삭제' }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '매핑 삭제 실패' }
  }
}

/** U20 잔여 — child 코드별 연결 도면(DXF) 조회. 연결 없는 코드는 맵에서 제외(정직 표시). */
export interface ChildDrawingFile { fileId: number; fileName: string; drawingName: string }

const DRAWING_FILES_CHUNK = 50   // 서버 상한과 동일 — 초과분은 버리지 않고 나눠 조회한다

export async function childDrawingFiles(codes: string[]): Promise<Record<string, ChildDrawingFile>> {
  const uniq = [...new Set(codes.map((c) => c.trim()).filter(Boolean))]
  if (!uniq.length) return {}
  const out: Record<string, ChildDrawingFile> = {}
  try {
    // child 가 상한을 넘어도 일부만 조회하고 나머지를 '도면 없음'으로 오표시하지 않도록 청크 분할
    for (let i = 0; i < uniq.length; i += DRAWING_FILES_CHUNK) {
      const chunk = uniq.slice(i, i + DRAWING_FILES_CHUNK)
      const r = await apiServer<{ files: Record<string, ChildDrawingFile> }>(
        `/codes/drawing-files?codes=${encodeURIComponent(chunk.join(','))}`)
      Object.assign(out, r.files ?? {})
    }
    return out
  } catch (e) {
    if (e instanceof ApiError) return out   // 일부라도 확보했으면 그만큼은 표시
    throw e
  }
}
