'use server'

/** U9 Project 대화 서버 액션 — 등록/삭제 후 최신 목록 반환. */
import { apiServer, ApiError } from '@/lib/api'

export interface CommentRow { id: number; author: string; body: string; at: string }
interface CommentResult { rows?: CommentRow[]; error?: string }

async function fetchRows(projectNo: string): Promise<CommentRow[]> {
  return apiServer<CommentRow[]>(`/projects/${encodeURIComponent(projectNo)}/comments`).catch(() => [])
}

export async function addComment(projectNo: string, body: string): Promise<CommentResult> {
  if (!body.trim()) return { error: '내용을 입력하십시오' }
  try {
    await apiServer(`/projects/${encodeURIComponent(projectNo)}/comments`, {
      method: 'POST', body: JSON.stringify({ body: body.trim() }),
    })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '등록 실패' }
  }
  return { rows: await fetchRows(projectNo) }
}

export async function deleteComment(projectNo: string, id: number): Promise<CommentResult> {
  try {
    await apiServer(`/projects/comments/${id}`, { method: 'DELETE' })
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '삭제 실패 (본인/ADMIN 만)' }
  }
  return { rows: await fetchRows(projectNo) }
}
