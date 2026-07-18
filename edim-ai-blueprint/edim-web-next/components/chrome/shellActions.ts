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

/** U11 테넌트 로고 설정 (ADMIN) — data URL base64. '' = 제거. */
export async function saveBranding(logoData: string): Promise<{ ok?: string; error?: string }> {
  try {
    await apiServer('/tenant/branding', { method: 'PUT', body: JSON.stringify({ logoData }) })
    return { ok: logoData ? '로고 설정 완료' : '로고 제거 완료' }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '설정 실패 (ADMIN 권한·64KB 이하)' }
  }
}

/** 화면 즐겨찾기 (D8, P2) — /prefs/favorites 서버 영속. */
export interface FavItem { href: string; code: string; title: string }

export async function getFavorites(): Promise<FavItem[]> {
  try {
    const r = await apiServer<{ value: FavItem[] | null }>('/prefs/favorites')
    // 레거시 SPA 항목({screenId,...} — href 없음)은 라우팅 불가 → 제외 (다음 저장 시 자연 정리)
    return Array.isArray(r.value) ? r.value.filter((f) => typeof f.href === 'string' && f.href.startsWith('/')) : []
  } catch { return [] }
}

export async function saveFavorites(items: FavItem[]): Promise<void> {
  try {
    await apiServer('/prefs/favorites', { method: 'PUT', body: JSON.stringify({ value: items }) })
  } catch { /* 백엔드 불가 — 다음 세션에서 재시도 */ }
}

/** 좌측 사용자 메뉴 목록 — 모듈별 leaf node id 순서. 키 부재 = 기본 전체 트리, [] = 의도적 빈 목록. */
export type LeftNavPref = Partial<Record<string, string[]>>

export async function getLeftNav(): Promise<LeftNavPref> {
  try {
    const r = await apiServer<{ value: LeftNavPref | null }>('/prefs/leftnav')
    const v = r.value
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    // 모듈별 검증 — 문자열 배열이 아니면 해당 모듈만 기본 트리 폴백
    const out: LeftNavPref = {}
    for (const [k, ids] of Object.entries(v)) {
      if (Array.isArray(ids) && ids.every((x) => typeof x === 'string')) out[k] = ids
    }
    return out
  } catch { return {} }
}

export async function saveLeftNav(p: LeftNavPref): Promise<void> {
  try {
    await apiServer('/prefs/leftnav', { method: 'PUT', body: JSON.stringify({ value: p }) })
  } catch { /* 백엔드 불가 — 세션 내 낙관 상태 유지 */ }
}

/** 셸 크롬 카운트+To-do 패널 (P2/U14) — 승인 inbox 상위 3·PL 지연 합·임박/지연 마일스톤 상위 3. */
export interface ShellPanelData {
  inbox: number
  delayed: number
  inboxTop: { id: number; assetType: string; target: string }[]
  upcoming: { projectNo: string; stageLabel: string; plannedDate: string; delayStatus: string }[]
}

export async function shellCounts(): Promise<ShellPanelData> {
  const [inbox, dash, ms] = await Promise.all([
    apiServer<{ id: number; assetType: string; target: string }[]>('/approvals/inbox').catch(() => []),
    apiServer<{ deptEvents?: { delayed: number }[] }>('/erp/dashboard').catch(() => ({ deptEvents: [] })),
    apiServer<{ projectNo: string; stageLabel: string; plannedDate: string; delayStatus: string; status: string }[]>('/erp/milestones').catch(() => []),
  ])
  const delayed = (dash.deptEvents ?? []).reduce((s, e) => s + (e.delayed ?? 0), 0)
  const rows = Array.isArray(inbox) ? inbox : []
  const upcoming = (Array.isArray(ms) ? ms : [])
    .filter((m) => m.delayStatus === 'OVERDUE' || m.delayStatus === 'DUE_SOON')
    .sort((a, b) => (a.delayStatus === b.delayStatus ? a.plannedDate.localeCompare(b.plannedDate) : a.delayStatus === 'OVERDUE' ? -1 : 1))
    .slice(0, 3)
    .map((m) => ({ projectNo: m.projectNo, stageLabel: m.stageLabel, plannedDate: m.plannedDate, delayStatus: m.delayStatus }))
  return {
    inbox: rows.length,
    delayed,
    inboxTop: rows.slice(0, 3).map((r) => ({ id: r.id, assetType: r.assetType, target: r.target })),
    upcoming,
  }
}

/** F1 프로젝트 컨텍스트 시드 — 미선택 시 프로젝트 목록 첫 건. */
export async function firstProject(): Promise<{ no: string; name: string; stage: string } | null> {
  try {
    const rows = await apiServer<{ projectNo: string; projectName: string; stage?: string }[]>('/projects')
    const p = Array.isArray(rows) ? rows[0] : null
    return p ? { no: p.projectNo, name: p.projectName, stage: p.stage ?? '' } : null
  } catch { return null }
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
