'use server'

/** 설계 변경 뮤테이션 (N2) — ECR 등록 (영향 분석 자동 첨부 → ECO 승인 경로). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

export interface EcrState { error?: string; ok?: string }

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
