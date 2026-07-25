'use server'

/** U28 — 내부 Q&A 액션 (대화 이력 포함). */
import { apiServer, ApiError } from '@/lib/api'

export interface ChatRef { kind: string; code: string; title: string; href: string }
export interface ChatResult { mode: 'live' | 'search' | 'error'; answer: string; refs: ChatRef[]; error?: string }
export interface ChatTurn { q: string; a: string }

export async function askAssistant(question: string, history: ChatTurn[] = []): Promise<ChatResult | null> {
  try {
    return await apiServer<ChatResult>('/ai/chat', {
      method: 'POST', body: JSON.stringify({ question, history: history.slice(-6) }),
    })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}
