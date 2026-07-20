/** 서버 전용 API — 쿠키 토큰을 Bearer 로 FastAPI(/api/v1)에 전달. 서버 컴포넌트·액션 전용. */
import 'server-only'
import { getToken } from './session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** 서버측 fetch — 인증 헤더 자동. SSR 데이터 로드용(no-store: 항상 최신 ERP 데이터). */
export async function apiServer<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken()
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const b = await res.json()
      if (b?.detail) detail = b.detail
    } catch { /* non-json */ }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

/** 로그인(쿠키 미설정 상태에서 호출) — 토큰+유저 반환 */
export async function apiLogin(userId: string, password: string, otp?: string): Promise<{ token?: string; mfaRequired?: boolean; user?: unknown }> {
  const res = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password, ...(otp ? { otp } : {}) }),
    cache: 'no-store',
  })
  if (!res.ok) {
    let detail = '사번 또는 비밀번호가 올바르지 않습니다'
    try {
      const b = await res.json()
      if (b?.detail) detail = b.detail
    } catch { /* */ }
    throw new ApiError(res.status, detail)
  }
  return res.json()
}
