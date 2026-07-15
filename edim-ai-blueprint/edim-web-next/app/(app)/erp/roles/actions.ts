'use server'

/** 사용자·권한 관리 뮤테이션 (N4) — 사용자 CRUD·잠금해제·레벨·활성 + 역할·매트릭스. */
import { revalidatePath } from 'next/cache'
import { apiServer, ApiError } from '@/lib/api'

const PATH = '/erp/roles'

export interface ActState { error?: string; ok?: string }

function fail(e: unknown, fallback: string): ActState {
  return { error: e instanceof ApiError ? e.message : fallback }
}

export async function createUser(_prev: ActState, formData: FormData): Promise<ActState> {
  const login = String(formData.get('login') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const initialPassword = String(formData.get('initialPassword') ?? '').trim()
  if (!login || !name || !initialPassword) return { error: '로그인 ID·이름·초기 비밀번호는 필수입니다' }
  const body = {
    login, name, initialPassword,
    department: String(formData.get('department') ?? '').trim(),
    email: String(formData.get('email') ?? '').trim(),
    level: String(formData.get('level') ?? 'GENERAL').trim(),
  }
  try {
    await apiServer('/users', { method: 'POST', body: JSON.stringify(body) })
  } catch (e) { return fail(e, '사용자 등록 실패') }
  revalidatePath(PATH)
  return { ok: `${login} 등록` }
}

export async function unlockUser(login: string): Promise<ActState> {
  try {
    await apiServer(`/users/${encodeURIComponent(login)}/unlock`, { method: 'POST', body: '{}' })
  } catch (e) { return fail(e, '잠금 해제 실패') }
  revalidatePath(PATH)
  return { ok: `${login} 잠금 해제` }
}

export async function changeUserLevel(login: string, level: string): Promise<ActState> {
  try {
    await apiServer(`/users/${encodeURIComponent(login)}/level`, {
      method: 'PATCH', body: JSON.stringify({ level }),
    })
  } catch (e) { return fail(e, '레벨 변경 실패') }
  revalidatePath(PATH)
  return { ok: `${login} → ${level}` }
}

export async function setUserActive(login: string, active: boolean): Promise<ActState> {
  try {
    await apiServer(`/users/${encodeURIComponent(login)}/active`, {
      method: 'PATCH', body: JSON.stringify({ active }),
    })
  } catch (e) { return fail(e, '상태 변경 실패') }
  revalidatePath(PATH)
  return { ok: `${login} ${active ? '재활성' : '비활성'}` }
}

export async function createRole(name: string, description: string): Promise<ActState> {
  if (!name.trim()) return { error: '역할명을 입력하십시오' }
  try {
    await apiServer('/roles', { method: 'POST', body: JSON.stringify({ name: name.trim(), description }) })
  } catch (e) { return fail(e, '역할 생성 실패 (중복/예약 409 가능)') }
  revalidatePath(PATH)
  return { ok: `역할 ${name} 생성` }
}

export async function deleteRole(name: string): Promise<ActState> {
  try {
    await apiServer(`/roles/${encodeURIComponent(name)}`, { method: 'DELETE' })
  } catch (e) { return fail(e, '역할 삭제 실패 (내장·배정 시 409)') }
  revalidatePath(PATH)
  return { ok: `역할 ${name} 삭제` }
}

export async function saveRolePermissions(role: string, permissions: Record<string, string>): Promise<ActState> {
  try {
    await apiServer(`/roles/${encodeURIComponent(role)}/permissions`, {
      method: 'PUT', body: JSON.stringify({ permissions }),
    })
  } catch (e) { return fail(e, '매트릭스 저장 실패') }
  revalidatePath(PATH)
  return { ok: `${role} 권한 저장` }
}
