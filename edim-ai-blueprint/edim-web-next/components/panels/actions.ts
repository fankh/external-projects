'use server'

/** U13 우측 공용 패널 (Sub Work Place Templet, E-4) 서버 액션. */
import { apiServer, ApiError } from '@/lib/api'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export interface TableInfo { name: string; type: string; department: string; description: string; rows: number }
export interface TableRows { columns: string[]; rows: { key: string; values: Record<string, unknown> }[] }

/** Table 미리보기 — 상위 N행. */
export async function getTableRows(name: string, limit = 4): Promise<{ data?: TableRows; error?: string }> {
  try {
    const d = await apiServer<{ columns: string[]; rows: { key: string; values: Record<string, unknown> }[] }>(
      `/tables/${encodeURIComponent(name)}`)
    return { data: { columns: d.columns ?? [], rows: (d.rows ?? []).slice(0, limit) } }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '조회 실패' }
  }
}

/** Coding 즉석 Run — Macro 엔진 평가 (TBX-011). */
export async function evalPanelMacro(formula: string): Promise<{ ok: boolean; value?: number | string; error?: string }> {
  if (!formula.trim()) return { ok: false, error: '수식이 없습니다' }
  try {
    const r = await apiServer<{ ok: boolean; value?: number | string; error?: string }>('/macros/evaluate', {
      method: 'POST', body: JSON.stringify({ formula, variables: {} }),
    })
    return r
  } catch (e) {
    return { ok: false, error: e instanceof ApiError ? e.message : '평가 실패' }
  }
}

/** Data Up-Load — 파일 업로드 (folder=DATA, 활성 프로젝트 컨텍스트). */
export async function uploadPanelFile(_prev: { ok?: string; error?: string }, formData: FormData): Promise<{ ok?: string; error?: string }> {
  const file = formData.get('uploadedFile')
  if (!(file instanceof File) || file.size === 0) return { error: '업로드할 파일을 선택하십시오' }
  const project = String(formData.get('project') ?? '').trim() || 'PS-61313-5'
  const name = String(formData.get('name') ?? '').trim()
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file, name ? `${name}${file.name.slice(file.name.lastIndexOf('.'))}` : file.name)
  fd.append('folder', 'DATA')
  fd.append('project', project)
  const res = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  return { ok: `업로드 ✓ — ${file.name} (${project} · DATA)` }
}

export interface RelChild { code: string; desc: string; qty: number; remarks: string }

/** U26 — Child Component 패널: mother 연결 Sub Code 표. */
export async function getRelChildren(mother: string): Promise<RelChild[] | null> {
  try {
    return await apiServer<RelChild[]>(`/codes/relationships/${encodeURIComponent(mother.trim())}/children`)
  } catch { return null }
}

/** U26 — Table 패널 Excel Import (기존 /tables/{name}/import-excel 재사용, 멀티파트 raw fetch). */
export async function importTableExcel(_prev: { ok?: string; error?: string }, formData: FormData): Promise<{ ok?: string; error?: string }> {
  const name = String(formData.get('tableName') ?? '').trim()
  const file = formData.get('excelFile')
  if (!name || !(file instanceof File) || file.size === 0) return { error: 'Table·파일을 지정하십시오' }
  const token = await getToken()
  const fd = new FormData()
  fd.append('uploadedFile', file)
  const res = await fetch(`${API_BASE}/tables/${encodeURIComponent(name)}/import-excel`, {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: fd, cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try { detail = (await res.json())?.detail ?? detail } catch { /* non-json */ }
    return { error: detail }
  }
  const r = await res.json() as { inserted: number; updated: number; rejected: string[] }
  return { ok: `Import ✓ — 신규 ${r.inserted} · 갱신 ${r.updated}${r.rejected?.length ? ` · 거부 ${r.rejected.length}` : ''}` }
}
