'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { apiLogin, ApiError } from '@/lib/api'
import { SESSION_COOKIE } from '@/lib/session'

export interface LoginState { error?: string }

/** 로그인 서버 액션 — FastAPI 인증 → httpOnly 세션 쿠키 → 리다이렉트. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const userId = String(formData.get('userId') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/erp/eco-ledger') || '/erp/eco-ledger'
  if (!userId || !password) return { error: '사번과 비밀번호를 입력하십시오' }

  let token: string
  try {
    const r = await apiLogin(userId, password)
    token = r.token
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '로그인 실패' }
  }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 8,
  })
  redirect(next.startsWith('/') ? next : '/erp/eco-ledger')
}
