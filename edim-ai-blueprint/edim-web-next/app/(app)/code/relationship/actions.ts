'use server'

import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface RunningTestRow { no: string; name: string; desc: string; qty: number; remarks: string }
interface TestApiRow extends RunningTestRow { mainCode: string; level?: number; path?: string }

/** Running Test — Mother slot 조합으로 Child 전량 전개 (CODE-009). 체크 해제 직계는 서브트리 제외. */
export async function runningTest(mother: string, slotValues: Record<string, string>, checked: string[]): Promise<{ rows?: RunningTestRow[]; error?: string }> {
  try {
    const r = await apiServer<{ rows: TestApiRow[] }>('/codes/relationships/running-test', {
      method: 'POST', body: JSON.stringify({ motherCode: mother, slotValues }),
    })
    const checkedSet = new Set(checked)
    const unchecked = r.rows.filter((row) => row.level === 1 && !checkedSet.has(row.mainCode)).map((row) => row.mainCode)
    const rows = r.rows.filter((row) => row.no === 'Main' || !unchecked.some((c) => (row.path ?? '').includes(`> ${c}`)))
    return { rows }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Running Test 실패' }
  }
}

/** Child 실등록 (DRAFT, Running Test 통과 후 승인 CODE-009). */
export async function addChild(mother: string, child: string, qty: number): Promise<{ ok?: true; error?: string }> {
  if (!child.trim()) return { error: 'Child Code 를 입력하십시오' }
  try {
    await apiServer('/codes/relationships', { method: 'POST', body: JSON.stringify({ mother, child: child.trim(), qty }) })
    revalidatePath('/code/relationship')
    return { ok: true }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'Child 추가 실패' }
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
