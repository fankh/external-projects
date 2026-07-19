'use server'

/** U28 — 내부 Q&A 액션. */
import { apiServer, ApiError } from '@/lib/api'

export interface ChatRef { kind: string; code: string; title: string; href: string }
export interface ChatResult { mode: 'live' | 'search' | 'error'; answer: string; refs: ChatRef[]; error?: string }

export async function askAssistant(question: string): Promise<ChatResult | null> {
  try {
    return await apiServer<ChatResult>('/ai/chat', { method: 'POST', body: JSON.stringify({ question }) })
  } catch (e) {
    if (e instanceof ApiError) return null
    throw e
  }
}
