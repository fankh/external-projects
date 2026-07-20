'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { apiLogin, ApiError } from '@/lib/api'
import { SESSION_COOKIE } from '@/lib/session'

export interface LoginState { error?: string; mfaRequired?: boolean }

/** 로그인 서버 액션 — FastAPI 인증 → httpOnly 세션 쿠키 → 리다이렉트. MFA 활성 사용자는 OTP 2단계. */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const userId = String(formData.get('userId') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const otp = String(formData.get('otp') ?? '').trim()
  const rawNext = String(formData.get('next') ?? '')
  // next='/' 은 루트→/erp/dashboard 재리다이렉트라 서버액션 중첩 리다이렉트 오류를 유발.
  // 실제 랜딩(/erp/dashboard)로 정규화 — /login·비-슬래시도 기본값 처리.
  const next = rawNext.startsWith('/') && rawNext !== '/' && rawNext !== '/login' ? rawNext : '/erp/dashboard'
  if (!userId || !password) return { error: '사번과 비밀번호를 입력하십시오' }

  let token: string
  try {
    const r = await apiLogin(userId, password, otp || undefined)
    if (r.mfaRequired) return { mfaRequired: true }
    token = r.token!
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '로그인 실패', mfaRequired: !!otp || undefined }
  }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 8,
  })
  redirect(next)
}
