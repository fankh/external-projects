'use server'

/** 문서함 뮤테이션 (N5) — 문서 등록(+승인 요청 자동)·메타 수정(ACCEPTED 통제). */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/cpq/documents'

export interface ActState { error?: string; ok?: string }

export async function createDocument(_prev: ActState, formData: FormData): Promise<ActState> {
  const docNo = String(formData.get('docNo') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  if (!docNo || !title) return { error: '문서번호·제목은 필수입니다' }
  const body = {
    docNo, title,
    docType: String(formData.get('docType') ?? 'DOC').trim(),
    grade: String(formData.get('grade') ?? 'GENERAL').trim(),
  }
  try {
    await apiServer('/documents', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패 (중복 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${docNo} 등록 — 승인 요청 자동` }
}

export async function updateDocMeta(docNo: string, p: { title?: string; docType?: string; grade?: string }): Promise<ActState> {
  if (!p.title && !p.docType && !p.grade) return { error: '수정할 항목을 입력하십시오' }
  try {
    await apiServer(`/documents/${encodeURIComponent(docNo)}/meta`, {
      method: 'PATCH', body: JSON.stringify(p),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '수정 실패 (ACCEPTED 문서 통제 409 가능)' }
  }
  revalidatePath(PATH)
  return { ok: `${docNo} 메타 수정` }
}

/** U23 — 규칙 기반 자동 채번. */
export async function allocDocNo(docType: string): Promise<{ docNo: string; template: string } | null> {
  try {
    return await apiServer<{ docNo: string; template: string }>('/documents/allocate-code', {
      method: 'POST', body: JSON.stringify({ docType: docType || 'DOC' }),
    })
  } catch { return null }
}

export interface NumberingRule { template: string; dept: string; sample: string }

export async function getNumberingRule(): Promise<NumberingRule | null> {
  try { return await apiServer<NumberingRule>('/documents/numbering-rule') } catch { return null }
}

export async function saveNumberingRule(template: string, dept: string): Promise<NumberingRule | { error: string }> {
  try {
    return await apiServer<NumberingRule>('/documents/numbering-rule', {
      method: 'PUT', body: JSON.stringify({ template, dept }),
    })
  } catch (e) {
    if (e instanceof ApiError) return { error: e.message }
    throw e
  }
}
