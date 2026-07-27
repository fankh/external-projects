/** 서버 전용 API — 쿠키 토큰을 Bearer 로 FastAPI(/api/v1)에 전달. 서버 컴포넌트·액션 전용. */
import 'server-only'
import { getToken } from './session'
import { API_BASE } from './apiBase'

// 9.44 — SSR fetch 타임아웃(회복탄력성): 백엔드가 느리거나 응답 없을 때 SSR 렌더가 무한 대기하지
// 않도록 상한을 둔다. 초과·네트워크 실패는 504 ApiError 로 정규화 → 페이지가 즉시 오류 상태로 열화.
const TIMEOUT_MS = Number(process.env.EDIM_API_TIMEOUT_MS ?? 8000)

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * 응답 **헤더까지** 필요한 SSR 로드 (18.84).
 *
 * 백엔드는 절단(`X-Truncated`)·숨김(`X-Superseded-Hidden`) 같은 사실을 헤더로 알린다.
 * `apiServer` 는 본문만 돌려주므로 그 사실이 화면에 닿지 못한다 — 서버가 잘 적어도
 * 중간 계층이 지우면 없는 것과 같다(18.79 에서 다운로드 프록시가 그랬다).
 */
export async function apiServerWith<T>(path: string, init?: RequestInit):
    Promise<{ data: T; headers: Headers }> {
  const res = await apiFetch(path, init)
  return { data: (await res.json()) as T, headers: res.headers }
}

/** 서버측 fetch — 인증 헤더 자동. SSR 데이터 로드용(no-store: 항상 최신 ERP 데이터). */
export async function apiServer<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiFetch(path, init)).json() as Promise<T>
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getToken()
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
      signal: init?.signal ?? AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    throw new ApiError(504, timeout ? '백엔드 응답 시간 초과' : '백엔드 연결 실패')
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const b = await res.json()
      if (b?.detail) detail = b.detail
    } catch { /* non-json */ }
    throw new ApiError(res.status, detail)
  }
  return res
}

/** 로그인(쿠키 미설정 상태에서 호출) — 토큰+유저 반환 */
export async function apiLogin(userId: string, password: string, otp?: string): Promise<{ token?: string; mfaRequired?: boolean; user?: unknown }> {
  let res: Response
  try {
    res = await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password, ...(otp ? { otp } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ApiError(504, '로그인 서버 응답이 없습니다 — 잠시 후 다시 시도하십시오')
  }
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
