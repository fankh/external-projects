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
