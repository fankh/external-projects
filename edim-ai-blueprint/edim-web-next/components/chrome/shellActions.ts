'use server'

/** 셸 전역 서버 액션 (N6) — 통합 검색·비밀번호 변경. */
import { apiServer, ApiError } from '@/lib/api'

export interface SearchResults {
  codes: { code: string; name: string }[]
  docs: { docNo: string; title: string; grade: string }[]
  files: { fileId: number; name: string; type: string }[]
  parts?: { partNo: string; name: string }[]
  projects?: { projectNo: string; name: string; stage: string }[]
  users?: { login: string; name: string; level: string }[]
}

export async function searchQuery(q: string): Promise<{ result?: SearchResults; error?: string }> {
  if (!q.trim()) return { result: { codes: [], docs: [], files: [] } }
  try {
    return { result: await apiServer<SearchResults>(`/search?q=${encodeURIComponent(q.trim())}`) }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '검색 실패' }
  }
}

/** 화면 즐겨찾기 (D8, P2) — /prefs/favorites 서버 영속. */
export interface FavItem { href: string; code: string; title: string }

export async function getFavorites(): Promise<FavItem[]> {
  try {
    const r = await apiServer<{ value: FavItem[] | null }>('/prefs/favorites')
    return Array.isArray(r.value) ? r.value : []
  } catch { return [] }
}

export async function saveFavorites(items: FavItem[]): Promise<void> {
  try {
    await apiServer('/prefs/favorites', { method: 'PUT', body: JSON.stringify({ value: items }) })
  } catch { /* 백엔드 불가 — 다음 세션에서 재시도 */ }
}

/** 셸 크롬 카운트 (P2) — 승인 대기 = 실 inbox 길이, PL 지연 = 부서 이벤트 delayed 합. */
export async function shellCounts(): Promise<{ inbox: number; delayed: number }> {
  const [inbox, dash] = await Promise.all([
    apiServer<unknown[]>('/approvals/inbox').catch(() => []),
    apiServer<{ deptEvents?: { delayed: number }[] }>('/erp/dashboard').catch(() => ({ deptEvents: [] })),
  ])
  const delayed = (dash.deptEvents ?? []).reduce((s, e) => s + (e.delayed ?? 0), 0)
  return { inbox: Array.isArray(inbox) ? inbox.length : 0, delayed }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok?: string; error?: string }> {
  if (!currentPassword || !newPassword) return { error: '현재/새 비밀번호를 입력하십시오' }
  if (newPassword.length < 4) return { error: '새 비밀번호가 너무 짧습니다' }
  try {
    await apiServer('/users/me/password', {
      method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }),
    })
    return { ok: '비밀번호 변경 완료' }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '변경 실패 (현재 비밀번호 확인)' }
  }
}
