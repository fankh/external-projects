'use server'

/** 설계 변경 뮤테이션 (N2) — ECR 등록 (영향 분석 자동 첨부 → ECO 승인 경로). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface EcrState { error?: string; ok?: string }

/** ECO 상세 + 영향 분석 (GET /eco/changes/{eco_no}) — 더블클릭 상세 다이얼로그. */
export interface EcoDetail {
  ecoNo: string; title: string; reason: string; targetType: string; targetNo: string
  status: string; revFrom: string; revTo: string; impact: Record<string, unknown> | null
  createdAt: string; appliedAt: string | null
}

export async function getEcoDetail(ecoNo: string): Promise<{ detail?: EcoDetail; error?: string }> {
  try {
    return { detail: await apiServer<EcoDetail>(`/eco/changes/${encodeURIComponent(ecoNo)}`) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'ECO 상세 조회 실패' }
  }
}

export async function createEcr(_prev: EcrState, formData: FormData): Promise<EcrState> {
  const title = String(formData.get('title') ?? '').trim()
  const targetType = String(formData.get('targetType') ?? 'DRAWING').trim()
  const targetNo = String(formData.get('targetNo') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  const newDrawingNo = String(formData.get('newDrawingNo') ?? '').trim()
  if (!title || !targetNo) return { error: '제목·대상 번호는 필수입니다' }
  try {
    const r = await apiServer<{ ecoNo: string; impact: Record<string, unknown> }>('/eco/changes', {
      method: 'POST',
      body: JSON.stringify({ title, targetType, targetNo, reason, ...(newDrawingNo ? { newDrawingNo } : {}) }),
    })
    revalidatePath('/plm/eco-change')
    const impactN = Object.values(r.impact ?? {}).reduce<number>(
      (s, v) => s + (Array.isArray(v) ? v.length : typeof v === 'number' ? v : 0), 0)
    return { ok: `${r.ecoNo} 등록 — 영향 분석 ${impactN}건 자동 첨부` }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : 'ECR 등록 실패' }
  }
}
