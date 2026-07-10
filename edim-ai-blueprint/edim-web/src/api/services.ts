/** 서비스 계층 — 실 API(/api/v1, PostgreSQL 54테이블) 우선, 불가 시 mock 폴백.
 *  각 함수 주석 = 대응 REST 엔드포인트 (OpenAPI docs/api/edim-openapi.yaml). */
import type { DimensionDef, ExpandResult, RunResult, RunStep, SlotDef, TechDataRow, User } from './types'
import {
  expandBom, finishedGoods, KOF_SLOTS, RUN_LOGS, RUN_OUTPUTS, RUN_STEPS, TECH_DATA,
} from './mock/data'
import {
  DEPT_EVENTS, KPIS, PR_ITEMS,
  PRICES as MOCK_PRICES, PROJECT as MOCK_PROJECT,
  resolvePrice as mockResolvePrice, type PriceRow, type PrItem,
} from './mock/dataErp'
import {
  CHILD_GROUP, runningTest as mockRunningTest,
  type ChildDef, type RunningTestRow,
} from './mock/dataCode'
import {
  DRAWING_REVS, DRAWINGS, FOLDER_FILES, SUPERSEDURES,
  type DrawingRow, type FolderFile, type RevisionRow, type SupersedureRow,
} from './mock/dataMore'
import {
  APPROVAL_REQS, DEPT_TASKS, DOCS, SYS_HISTORY, USERS,
  type ApprovalReq, type DocRow, type TaskRow, type UserRow,
} from './mock/dataMore'
import { KOF_TABLE, type SubCodeSlot } from './mock/dataCode'

const API = '/api/v1'
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── 데이터 소스 표시 (상태바 "DB:" 셀) ──
export type DataSource = 'live' | 'mock' | 'unknown'
let dataSource: DataSource = 'unknown'
const listeners = new Set<(s: DataSource) => void>()

function setSource(s: DataSource) {
  if (dataSource !== s) {
    dataSource = s
    listeners.forEach((cb) => cb(s))
  }
}

export function subscribeDataSource(cb: (s: DataSource) => void): () => void {
  listeners.add(cb)
  cb(dataSource)
  return () => listeners.delete(cb)
}

let token: string | null = sessionStorage.getItem('edim-token')

/** API 도달 불가 (네트워크/503) — mock 폴백 신호 */
class ApiUnavailable extends Error {}

const API_TIMEOUT_MS = 6000   // 응답 없는 프록시/백엔드 → mock 폴백 (행 방지)

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(API + path, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    setSource('mock')
    throw new ApiUnavailable()
  }
  if (res.status === 503) {
    setSource('mock')
    throw new ApiUnavailable()
  }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    // 토큰 없음/만료 — 세션 정리 후 재로그인 (P0-1)
    sessionStorage.removeItem('edim-session')
    sessionStorage.removeItem('edim-token')
    window.location.reload()
    throw new ApiUnavailable()
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { detail?: string } | null
    if (body?.detail == null || (res.status === 404 && body.detail === 'Not Found')) {
      // JSON 오류 본문이 아니거나 라우트 자체가 없음(구버전 백엔드) → mock 폴백
      setSource('mock')
      throw new ApiUnavailable()
    }
    setSource('live')
    throw new Error(body.detail)
  }
  // B8 — 토큰 슬라이딩 갱신 (백엔드가 만료 30분 전 새 토큰을 헤더로 전달)
  const renewed = res.headers.get('X-EDIM-Token')
  if (renewed && renewed !== token) {
    token = renewed
    sessionStorage.setItem('edim-token', renewed)
  }
  try {
    const out = await res.json() as T
    setSource('live')
    return out
  } catch {
    // 본문 읽기 중 타임아웃/절단 — 폴백 (Uncaught AbortError 방지)
    setSource('mock')
    throw new ApiUnavailable()
  }
}

/** GET /api/v1/health — 기동 시 데이터 소스 판별 */
export async function pingBackend(): Promise<void> {
  try {
    const h = await api<{ db: boolean }>('/health')
    setSource(h.db ? 'live' : 'mock')
  } catch { /* setSource 은 api() 에서 처리 */ }
}

// ── SVC-01 Auth ──
export const authService = {
  /** POST /api/v1/auth/login */
  async login(userId: string, password: string): Promise<User> {
    if (!userId.trim() || !password.trim()) {
      throw new Error('사번과 비밀번호를 입력하십시오')
    }
    try {
      const r = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ userId, password }),
      })
      token = r.token
      sessionStorage.setItem('edim-token', token)
      return r.user
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      // mock 폴백 — 동일 계정 규칙
      await delay(300)
      if (userId.trim() !== 'edim' || password !== 'edim') {
        throw new Error('사번 또는 비밀번호가 올바르지 않습니다')
      }
      return {
        userId, name: 'YS.Gang', department: '기술연구소',
        userLevel: 'SETUP', tenantId: 'nova',
      }
    }
  },
  /** PUT /api/v1/users/me/password — 비밀번호 변경 (B8; mock 모드는 정직 거부) */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await api('/users/me/password', {
        method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) {
        throw new Error('백엔드 연결 필요 — MOCK 모드에서는 비밀번호를 변경할 수 없습니다')
      }
      throw e
    }
  },
}

// ── SVC-03 Code ──
export const codeService = {
  /** GET /api/v1/codes/groups/{group}/slots — 승인된 값만 (CODE-003) */
  async getSlotDefs(group: string): Promise<SlotDef[]> {
    try {
      return await api<SlotDef[]>(`/codes/groups/${encodeURIComponent(group)}/slots`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      await delay(120)
      return KOF_SLOTS
    }
  },
  /** POST /api/v1/codes/products/expand — 재귀 CTE + slot_map (실 DB) */
  async expand(slotValues: Record<string, string>): Promise<ExpandResult> {
    try {
      return await api<ExpandResult>('/codes/products/expand', {
        method: 'POST', body: JSON.stringify({ rootCode: 'KDCR 3-13', slotValues }),
      })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      await delay(250)
      return { finishedGoodsCode: finishedGoods(slotValues), items: expandBom(slotValues) }
    }
  },
}

// ── SVC-05 Table CRUD (TBL-001~006) ──
export interface TableData {
  name: string
  columns: string[]
  rows: { key: string; values: Record<string, number> }[]
}

export interface ImportReport { inserted: number; updated: number; rejected: string[] }

export const tableCrudService = {
  /** GET /api/v1/tables/{name} — tbl_data_row (row_key_num 정렬) */
  async get(name: string): Promise<TableData | null> {
    try {
      return await api<TableData>(`/tables/${encodeURIComponent(name)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/tables/{name}/rows — true=실DB 영속, false=백엔드 불가 (mock 성공 없음) */
  async addRow(name: string, key: string, values: Record<string, number | null>): Promise<boolean> {
    try {
      await api(`/tables/${encodeURIComponent(name)}/rows`, {
        method: 'POST', body: JSON.stringify({ key, values }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** PUT /api/v1/tables/{name}/rows/{key} — true=실DB 영속, false=백엔드 불가 */
  async updateRow(name: string, key: string, values: Record<string, number | null>): Promise<boolean> {
    try {
      await api(`/tables/${encodeURIComponent(name)}/rows/${encodeURIComponent(key)}`, {
        method: 'PUT', body: JSON.stringify({ key, values }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** DELETE /api/v1/tables/{name}/rows/{key} — true=실DB 영속, false=백엔드 불가 */
  async deleteRow(name: string, key: string): Promise<boolean> {
    try {
      await api(`/tables/${encodeURIComponent(name)}/rows/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** POST /api/v1/tables/{name}/import-excel — 정형 양식, Key 중복은 갱신 */
  async importExcel(name: string, file: globalThis.File): Promise<ImportReport | null> {
    const form = new FormData()
    form.append('uploadedFile', file)
    try {
      const res = await fetch(`${API}/tables/${encodeURIComponent(name)}/import-excel`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return await res.json() as ImportReport
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError)) throw e
      setSource('mock')
      return null
    }
  },
}

// ── SVC-05 Table ──
export const tableService = {
  /** GET /api/v1/tables/tech-data — row_key_num 범위 조회 */
  async queryTechData(airflow: number, pressure: number): Promise<TechDataRow[]> {
    try {
      return await api<TechDataRow[]>(`/tables/tech-data?airflow=${airflow}&pressure=${pressure}`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      await delay(200)
      return [...TECH_DATA].sort(
        (a, b) => Math.abs(a.pd - airflow) + Math.abs(a.pt - pressure)
          - (Math.abs(b.pd - airflow) + Math.abs(b.pt - pressure)),
      )
    }
  },
}

// ── SVC-08 Cost ──
export const erpService = {
  /** GET /api/v1/prices/resolve — 우선순위 견적적용→구매→재고→견적 (CST-001) */
  async resolvePrice(code: string, at: string): Promise<PriceRow | null> {
    try {
      const r = await api<{
        code: string; name: string; source: PriceRow['source']
        price: number; from: string; to: string | null; supplier: string
      }>(`/prices/resolve?code=${encodeURIComponent(code)}&at=${at}`)
      return { ...r, active: true }
    } catch (e) {
      if (e instanceof ApiUnavailable) return mockResolvePrice(code, at)
      if (e instanceof Error && e.message.startsWith('단가 없음')) return null
      throw e
    }
  },
}

// ── SVC-10 Approval (승인함) ──
export const approvalService = {
  /** POST /api/v1/approvals — 범용 승인 요청 (true=등록, false=백엔드 불가) */
  async request(targetTable: string, label: string, targetId = 0, requestType = 'UPDATE'): Promise<boolean> {
    try {
      await api('/approvals', {
        method: 'POST',
        body: JSON.stringify({ targetTable, targetId, requestType, label }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** GET /api/v1/approvals/inbox */
  async inbox(): Promise<ApprovalReq[]> {
    try {
      return await api<ApprovalReq[]>('/approvals/inbox')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return APPROVAL_REQS
    }
  },
  /** POST /api/v1/approvals/{id}/decide — 승인 시 대상 approval_status 전이 + 이력 */
  async decide(id: number, approve: boolean, comment: string): Promise<void> {
    try {
      await api(`/approvals/${id}/decide`, {
        method: 'POST', body: JSON.stringify({ approve, comment }),
      })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
    }
  },
}

// ── SVC-11 Documents (문서함) ──
export const docService = {
  /** GET /api/v1/documents — doc_control */
  async list(): Promise<DocRow[]> {
    try {
      return await api<DocRow[]>('/documents')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return DOCS
    }
  },
  /** POST /api/v1/documents — 문서 등록 (doc_control + 승인 요청; 409=중복) */
  async create(doc: { docNo: string; title: string; docType: string; grade: string }): Promise<boolean> {
    try {
      await api('/documents', { method: 'POST', body: JSON.stringify(doc) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** GET /api/v1/documents/{no}/render.pdf — Grade 워터마크 실렌더 (blob URL, null=백엔드 불가) */
  async renderPdf(docNo: string): Promise<string | null> {
    try {
      const res = await fetch(`${API}/documents/${encodeURIComponent(docNo)}/render.pdf`, {
        signal: AbortSignal.timeout(15_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return URL.createObjectURL(await res.blob())
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError) && e.name !== 'TimeoutError') throw e
      setSource('mock')
      return null
    }
  },
}

// ── SVC-01 Users ──
export const userService = {
  /** GET /api/v1/users — sys_user */
  async list(): Promise<UserRow[]> {
    try {
      return await api<UserRow[]>('/users')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return USERS
    }
  },
  /** POST /api/v1/users/{login}/unlock */
  async unlock(login: string): Promise<void> {
    try {
      await api(`/users/${encodeURIComponent(login)}/unlock`, { method: 'POST' })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
    }
  },
  /** PATCH /api/v1/users/{login}/level — 권한 레벨 변경 + 감사 (true=반영, false=백엔드 불가) */
  async changeLevel(login: string, level: string): Promise<boolean> {
    try {
      await api(`/users/${encodeURIComponent(login)}/level`, {
        method: 'PATCH', body: JSON.stringify({ level }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

// ── SVC-09 ERP 이벤트 (업무함·Dashboard 경고) ──
export interface ErpEvent extends TaskRow { eventId?: number; procName?: string }

export const eventService = {
  /** GET /api/v1/erp/events — erp_process_event */
  async list(): Promise<ErpEvent[]> {
    try {
      const rows = await api<(TaskRow & { eventId: number; procName: string })[]>('/erp/events')
      return rows.map((r) => ({ ...r, title: `${r.project} ${r.procName}` }))
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return DEPT_TASKS
    }
  },
  /** POST /api/v1/erp/events/{id}/complete */
  async complete(eventId: number | undefined, comment: string): Promise<void> {
    if (eventId == null) return
    try {
      await api(`/erp/events/${eventId}/complete`, {
        method: 'POST', body: JSON.stringify({ comment }),
      })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
    }
  },
  /** PATCH /api/v1/erp/events/{id} — 재배정 (true=실행, false=백엔드 불가) */
  async reassign(eventId: number, assignee: string, comment = ''): Promise<boolean> {
    try {
      await api(`/erp/events/${eventId}`, {
        method: 'PATCH', body: JSON.stringify({ assignee, comment }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** POST /api/v1/erp/events/{id}/escalate — ADMIN 알림 (true=실행) */
  async escalate(eventId: number, reason = ''): Promise<boolean> {
    try {
      await api(`/erp/events/${eventId}/escalate`, {
        method: 'POST', body: JSON.stringify({ reason }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

// ── SVC-09 Project ──
export interface ProjectRow {
  projectNo: string
  projectName: string
  projectType: string
  stage: string
  clientContact: string
  status: string
  item: string
  registeredAt: string
  client: string
}

export const projectService = {
  /** GET /api/v1/projects — 프로젝트 대장 (F1) */
  async list(): Promise<ProjectRow[]> {
    try {
      return await api('/projects')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return [{
        projectNo: MOCK_PROJECT.projectNo, projectName: 'Micron #7',
        projectType: MOCK_PROJECT.projectType, stage: MOCK_PROJECT.stage,
        clientContact: MOCK_PROJECT.clientContact, status: 'IN_PROGRESS',
        item: MOCK_PROJECT.item, registeredAt: MOCK_PROJECT.registeredAt,
        client: MOCK_PROJECT.client,
      }]
    }
  },
  /** POST /api/v1/projects — 신규 등록 + PS 자동 채번 (F1, honest-write) */
  async create(p: {
    projectName: string; projectType: string; item: string
    client: string; clientContact: string
  }): Promise<ProjectRow | null> {
    try {
      return await api('/projects', { method: 'POST', body: JSON.stringify(p) })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return null   // mock 모드 — 정직 거부
    }
  },
  /** DELETE /api/v1/projects/{no} — 기술 제안 + 무참조만 (409 보호) */
  async remove(no: string): Promise<boolean> {
    try {
      await api(`/projects/${encodeURIComponent(no)}`, { method: 'DELETE' })
      return true
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return false
    }
  },
  /** GET /api/v1/projects/{no} */
  async get(no: string): Promise<{ stage: string; clientContact: string }> {
    try {
      return await api(`/projects/${encodeURIComponent(no)}`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return { stage: MOCK_PROJECT.stage, clientContact: MOCK_PROJECT.clientContact }
    }
  },
  /** PATCH /api/v1/projects/{no} — sales_stage 전이 + 이력 */
  async setStage(no: string, stage: string): Promise<void> {
    try {
      await api(`/projects/${encodeURIComponent(no)}`, {
        method: 'PATCH', body: JSON.stringify({ stage }),
      })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
    }
  },
}

// ── SVC-08 단가 대장 ──
export const priceService = {
  /** GET /api/v1/prices — cst_price */
  async list(): Promise<PriceRow[]> {
    try {
      return await api<PriceRow[]>('/prices')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return MOCK_PRICES
    }
  },
}

// ── SYS-012 이력 ──
export interface HistoryRow { at: string; target: string; action: string; by: string }

export const historyService = {
  /** GET /api/v1/history — sys_history */
  async recent(): Promise<HistoryRow[]> {
    try {
      return await api<HistoryRow[]>('/history')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return SYS_HISTORY
    }
  },
}

// ── SVC-03 Sub Code 등록 ──
export const codeSetupService = {
  /** GET /api/v1/codes/groups/{g}/slots — 등록 그리드용 (allValues·status 포함) */
  async groupTable(group: string): Promise<SubCodeSlot[]> {
    try {
      const rows = await api<{
        slot: string; label: string; allValues: string[]; count: number
        status: 'APPROVED' | 'PENDING'
      }[]>(`/codes/groups/${encodeURIComponent(group)}/slots`)
      return rows.map((r) => ({
        slot: r.slot, label: r.label, values: r.allValues.join(' · '),
        count: r.count, status: r.status,
      }))
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return KOF_TABLE
    }
  },
  /** POST /api/v1/codes/groups/{g}/items — code_item 등록 + 승인 요청 (PENDING) */
  async addItem(group: string, slot: string, name: string, values: string[]): Promise<'live' | 'mock'> {
    try {
      await api(`/codes/groups/${encodeURIComponent(group)}/items`, {
        method: 'POST', body: JSON.stringify({ slot, name, values }),
      })
      return 'live'
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return 'mock'
    }
  },
}

// ── SVC-03 Code Relationship (S-1-4) ──
export interface ChildRow extends Omit<ChildDef, 'template'> { slotMap?: string }

export const relationshipService = {
  /** GET /api/v1/codes/relationships/{mother}/children */
  async children(mother: string): Promise<ChildRow[]> {
    try {
      return await api<ChildRow[]>(`/codes/relationships/${encodeURIComponent(mother)}/children`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return CHILD_GROUP
    }
  },
  /** POST /api/v1/codes/relationships/running-test — CODE-009 (expand 재사용) */
  async runningTest(
    mother: string, slotValues: Record<string, string>, checked: Set<string>,
  ): Promise<RunningTestRow[]> {
    try {
      const r = await api<{
        rows: (RunningTestRow & { mainCode: string; level?: number; path?: string })[]
      }>('/codes/relationships/running-test',
        { method: 'POST', body: JSON.stringify({ motherCode: mother, slotValues }) })
      // 체크 해제된 직계(level 1) Child 는 서브트리 전체 제외 (path 기준)
      const unchecked = r.rows
        .filter((row) => row.level === 1 && !checked.has(row.mainCode))
        .map((row) => row.mainCode)
      return r.rows.filter((row) => row.no === 'Main'
        || !unchecked.some((c) => (row.path ?? '').includes(`> ${c}`)))
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return mockRunningTest(slotValues, checked)
    }
  },
}

// ── SVC-09 Dashboard 집계 ──
export interface DashboardData {
  kpis: { label: string; value: string; err?: boolean }[]
  deptEvents: { dept: string; waiting: number; running: number; doneWeek: number; delayed: number }[]
}

export const dashboardService = {
  /** GET /api/v1/erp/dashboard — erp_process_event·approval·project 집계 */
  async get(): Promise<DashboardData> {
    try {
      return await api<DashboardData>('/erp/dashboard')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return { kpis: KPIS, deptEvents: DEPT_EVENTS }
    }
  },
}

// ── SVC-09 발주 품목 ──
export const purchaseService = {
  /** GET /api/v1/erp/pr-items — 단가 resolve 실연동 */
  async items(): Promise<PrItem[]> {
    try {
      return await api<PrItem[]>('/erp/pr-items')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return PR_ITEMS
    }
  },
}

// ── SVC-12 Project Folder 파일 (MinIO 프록시) ──
export interface FolderFileEx extends FolderFile { fileId?: number; registrant?: string }

export const fileService = {
  /** GET /api/v1/files — cpq_output 실산출물 + dwg_file 업로드 + RECEIVED */
  async list(project: string): Promise<FolderFileEx[]> {
    try {
      return await api<FolderFileEx[]>(`/files?project=${encodeURIComponent(project)}`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return FOLDER_FILES
    }
  },
  /** POST /api/v1/files/upload — MinIO 저장 + dwg_file 등록 */
  async upload(file: globalThis.File, folder: string, project: string): Promise<boolean> {
    const form = new FormData()
    form.append('uploadedFile', file)
    form.append('folder', folder)
    form.append('project', project)
    try {
      const res = await fetch(`${API}/files/upload`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return true
    } catch (e) {
      if (e instanceof TypeError || e instanceof DOMException) { setSource('mock'); return false }
      throw e
    }
  },
  /** GET /api/v1/files/download/{id} — 스트리밍 (fetch blob → 저장) */
  async download(fileId: number, fileName: string): Promise<void> {
    const res = await fetch(`${API}/files/download/${fileId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) throw new Error(`다운로드 실패 (HTTP ${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  },
}

// ── SVC-13 알림 ──
export interface Notification {
  id: number
  type: string
  title: string
  link: string | null
  read: boolean
  at: string
}

export const notificationService = {
  /** GET /api/v1/notifications — 폴링 (WS 는 후속, 인터페이스정의서 §3 폴백) */
  async list(): Promise<Notification[]> {
    try {
      return await api<Notification[]>('/notifications')
    } catch (e) {
      if (e instanceof ApiUnavailable) return []
      throw e
    }
  },
  /** POST /api/v1/notifications/{id}/read */
  async markRead(id: number): Promise<void> {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
    }
  },
  /** POST /api/v1/notifications/read-all — 모두 읽음 (B6) */
  async readAll(): Promise<void> {
    try {
      await api('/notifications/read-all', { method: 'POST' })
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
    }
  },
}

// ── INT-04 CAD (DXF 뷰/Import/Export · DWG 는 ODA 플러그블) ──
export interface CadPoint { x: number; y: number }
export interface CadLayer { layerName: string; colorHex: string; isVisible: boolean }
export interface CadEntity {
  entityId: string
  entityType: 'line' | 'polyline' | 'circle' | 'arc' | 'text'
  layerName: string
  startPoint?: CadPoint
  endPoint?: CadPoint
  vertexPoints?: CadPoint[]
  isClosed?: boolean
  centerPoint?: CadPoint
  radius?: number
  startAngleDegrees?: number
  endAngleDegrees?: number
  insertionPoint?: CadPoint
  textContent?: string
  textHeight?: number
  rotationDegrees?: number
}
export interface CadDocument {
  drawingName: string
  sourceFormat: string
  units: string
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  layers: CadLayer[]
  entities: CadEntity[]
  skippedEntityCounts: Record<string, number>
}

// ── 잔여 mock 실데이터화 (v4.0) — 치수 정의·Macro 목록·공정 정의·역참조 ──
export interface FlowchartNode {
  id: string; name: string; sub?: string; x: number; y: number; w: number; h: number
}

export interface MacroLibRow {
  name: string; expr: string; status: string; address: string
  prompt: string; description: string
  // B20 — 4-Way Sync 전체 필드
  codeText: string
  flowchartDef: { nodes: FlowchartNode[]; edges: string[][] } | null
  applyType: 'MACRO' | 'CODING'
  version: number
  testInput: Record<string, number> | null
  testResult: { value?: number; ok?: boolean } | null
}

export interface MacroFn { name: string; sig: string; desc: string; keywords: string }
export interface MacroRefRow { refType: string; target: string }
export interface ProcessDefApi { id: number; code: string; name: string; dept: string; auto: boolean }
export interface ProcessDefsResponse { defs: ProcessDefApi[]; edges: { from: number; to: number }[] }
export interface ReferencerRow { code: string; name: string; qty: number; status: string }

export const drawingService = {
  /** GET /api/v1/drawings/dimensions — dwg_dimension + tbx_macro (Design Rule 실데이터) */
  async dimensions(drawing = 'KDCR 3-13'): Promise<DimensionDef[] | null> {
    try {
      return await api<DimensionDef[]>(`/drawings/dimensions?drawing=${encodeURIComponent(drawing)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** PUT /api/v1/drawings/dimensions — F12 임시저장 (null=백엔드 불가) */
  async saveDimensions(dims: DimensionDef[], drawing = 'KDCR 3-13'):
    Promise<{ variantSaved: number; macroSaved: number } | null> {
    try {
      return await api<{ variantSaved: number; macroSaved: number }>('/drawings/dimensions', {
        method: 'PUT', body: JSON.stringify({ drawing, dims }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

export const priceWriteService = {
  /** POST /api/v1/prices — 단가 등록 (true=등록, false=백엔드 불가; 422/409 는 throw) */
  async create(row: {
    code: string; supplier: string; price: number
    source: string; validFrom: string; validTo?: string | null
  }): Promise<boolean> {
    try {
      await api('/prices', { method: 'POST', body: JSON.stringify(row) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** POST /api/v1/prices/import-excel — 헤더: Code·공급처·단가·Table·적용시작·적용종료 */
  async importExcel(file: globalThis.File): Promise<{ inserted: number; rejected: string[] } | null> {
    const form = new FormData()
    form.append('uploadedFile', file)
    try {
      const res = await fetch(`${API}/prices/import-excel`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return await res.json() as { inserted: number; rejected: string[] }
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError) && e.name !== 'TimeoutError') throw e
      setSource('mock')
      return null
    }
  },
}

export interface SearchResults {
  codes: { code: string; name: string }[]
  docs: { docNo: string; title: string; grade: string }[]
  files: { fileId: number; name: string; type: string }[]
}

export const searchService = {
  /** GET /api/v1/search?q= — 코드·문서·파일 통합 검색 (null=백엔드 불가) */
  async query(q: string): Promise<SearchResults | null> {
    try {
      return await api<SearchResults>(`/search?q=${encodeURIComponent(q)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

// ── B13 — Arrangement Set-Up · Templet 관리 ──
export interface ArrangementRow {
  code: string; name: string; family: string
  direction: string; install: string; status: string; components: number
}
export interface ArrangementComponent {
  position: string; code: string; name: string; quantity: number
}
export interface TempletRow {
  name: string; templetType: string; definition: Record<string, unknown>
  status: string; system: boolean
}

export const arrangementService = {
  /** GET /api/v1/arrangements (null=백엔드 불가) */
  async list(): Promise<ArrangementRow[] | null> {
    try {
      return await api<ArrangementRow[]>('/arrangements')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/arrangements/{code}/components */
  async components(code: string): Promise<ArrangementComponent[] | null> {
    try {
      return await api<ArrangementComponent[]>(`/arrangements/${encodeURIComponent(code)}/components`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/arrangements — 등록 + 승인 요청 자동 (true=등록) */
  async create(a: { code: string; name: string; family: string; direction: string; install: string }): Promise<boolean> {
    try {
      await api('/arrangements', { method: 'POST', body: JSON.stringify(a) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** POST /api/v1/arrangements/{code}/components */
  async addComponent(code: string, c: { productCode: string; position: string; quantity: number }): Promise<boolean> {
    try {
      await api(`/arrangements/${encodeURIComponent(code)}/components`, {
        method: 'POST', body: JSON.stringify(c),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

export const templetService = {
  /** GET /api/v1/toolbox/templets (null=백엔드 불가) */
  async list(): Promise<TempletRow[] | null> {
    try {
      return await api<TempletRow[]>('/toolbox/templets')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** PUT /api/v1/toolbox/templets/{name} — upsert DRAFT (true=영속) */
  async save(name: string, templetType: string, definition: Record<string, unknown>): Promise<boolean> {
    try {
      await api(`/toolbox/templets/${encodeURIComponent(name)}`, {
        method: 'PUT', body: JSON.stringify({ templetType, definition }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

// ── B13-2 — Variant·Constant · Raw Material · Quality ──
export interface CodeValueRow {
  slot: string; itemName: string; valueCode: string; valueName: string; status: string
}
export interface MaterialRowApi {
  code: string; name: string; materialType: string
  density: number | null; standard: string; hazard: string
}
export interface VerificationRow {
  rule: string; macro: string; warning: string; active: boolean
}

export const codeValueService = {
  async list(group = 'KOF'): Promise<CodeValueRow[] | null> {
    try {
      return await api<CodeValueRow[]>(`/codes/values?group=${encodeURIComponent(group)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  async add(v: { group: string; slot: string; valueCode: string; valueName: string }): Promise<boolean> {
    try {
      await api('/codes/values', { method: 'POST', body: JSON.stringify(v) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

export const materialService = {
  async list(): Promise<MaterialRowApi[] | null> {
    try {
      return await api<MaterialRowApi[]>('/materials')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  async create(m: {
    code: string; name: string; materialType: string
    density: number | null; standard: string; hazard: string
  }): Promise<boolean> {
    try {
      await api('/materials', { method: 'POST', body: JSON.stringify(m) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

export const verificationService = {
  async list(drawing = 'KDCR 3-13'): Promise<VerificationRow[] | null> {
    try {
      return await api<VerificationRow[]>(`/drawings/${encodeURIComponent(drawing)}/verifications`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  async add(drawing: string, v: { ruleName: string; macroName: string; warning: string }): Promise<boolean> {
    try {
      await api(`/drawings/${encodeURIComponent(drawing)}/verifications`, {
        method: 'POST', body: JSON.stringify(v),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

// ── B14 — 마스터 데이터 · RBAC 동적화 · Hierarchy ──
export interface CompanyRow {
  name: string; companyType: string; nation: string; grade: string; terms: string
}
export interface RoleRow {
  name: string; description: string; permissions: Record<string, string>
}
export interface HierarchyNode {
  id: number; parentId: number | null; name: string
  symbol: string; address: string; status: string
}

export const companyService = {
  async list(): Promise<CompanyRow[] | null> {
    try {
      return await api<CompanyRow[]>('/companies')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  async create(c: CompanyRow): Promise<boolean> {
    try {
      await api('/companies', { method: 'POST', body: JSON.stringify(c) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

export const roleService = {
  async list(): Promise<RoleRow[] | null> {
    try {
      return await api<RoleRow[]>('/roles')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** PUT /api/v1/roles/{name}/permissions — 매트릭스 셀 저장 (true=영속) */
  async setPermissions(role: string, permissions: Record<string, string>): Promise<boolean> {
    try {
      await api(`/roles/${encodeURIComponent(role)}/permissions`, {
        method: 'PUT', body: JSON.stringify({ permissions }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

export const hierarchyService = {
  async list(treeType = 'PRODUCT'): Promise<HierarchyNode[] | null> {
    try {
      return await api<HierarchyNode[]>(`/hierarchy?treeType=${encodeURIComponent(treeType)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

export const c1Service = {
  /** POST /api/v1/cpq/quote-preview.pdf — 현재 슬롯으로 견적서 즉석 렌더 (blob URL, null=백엔드 불가) */
  async quotePreviewPdf(slotValues: Record<string, string>): Promise<string | null> {
    try {
      const res = await fetch(`${API}/cpq/quote-preview.pdf`, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rootCode: 'KDCR 3-13', slotValues }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return URL.createObjectURL(await res.blob())
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError) && e.name !== 'TimeoutError') throw e
      setSource('mock')
      return null
    }
  },
  /** POST /api/v1/cpq/spec-import — 사양 Excel(Slot·Value) → slotValues (null=백엔드 불가) */
  async specImport(file: globalThis.File): Promise<Record<string, string> | null> {
    const form = new FormData()
    form.append('uploadedFile', file)
    try {
      const res = await fetch(`${API}/cpq/spec-import`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return (await res.json() as { slotValues: Record<string, string> }).slotValues
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError) && e.name !== 'TimeoutError') throw e
      setSource('mock')
      return null
    }
  },
}

export const renderService = {
  /** POST /api/v1/render/pdf — 범용 PDF 렌더 (blob URL, null=백엔드 불가) */
  async pdf(title: string, lines: string[], opts?: { subtitle?: string; confidential?: boolean }):
    Promise<string | null> {
    try {
      const res = await fetch(`${API}/render/pdf`, {
        method: 'POST', signal: AbortSignal.timeout(15_000),
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title, lines, subtitle: opts?.subtitle ?? '', confidential: opts?.confidential ?? false,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return URL.createObjectURL(await res.blob())
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError) && e.name !== 'TimeoutError') throw e
      setSource('mock')
      return null
    }
  },
}

export const workProcessService = {
  /** GET /api/v1/erp/work-process — 저장된 MAKE/BUY */
  async get(code = 'KDCR 3-13'): Promise<{ item: string; makeOrBuy: 'MAKE' | 'BUY' }[] | null> {
    try {
      return await api<{ item: string; makeOrBuy: 'MAKE' | 'BUY' }[]>(
        `/erp/work-process?code=${encodeURIComponent(code)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** PUT /api/v1/erp/work-process — MAKE/BUY 저장 (true=영속) */
  async save(items: { item: string; makeOrBuy: string }[], code = 'KDCR 3-13'): Promise<boolean> {
    try {
      await api('/erp/work-process', { method: 'PUT', body: JSON.stringify({ code, items }) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
}

export const uiFormService = {
  /** GET /api/v1/toolbox/forms/{name} — 저장된 레이아웃 (404/불가 = null) */
  async get(name: string): Promise<{ version: number; layout: unknown[] } | null> {
    try {
      return await api<{ version: number; layout: unknown[] }>(
        `/toolbox/forms/${encodeURIComponent(name)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      if (e instanceof Error && e.message.includes('Form 없음')) return null
      throw e
    }
  },
  /** PUT /api/v1/toolbox/forms/{name} — layout_def 저장, version+1 (null=백엔드 불가) */
  async save(name: string, layout: unknown[]): Promise<{ version: number } | null> {
    try {
      return await api<{ version: number }>(`/toolbox/forms/${encodeURIComponent(name)}`, {
        method: 'PUT', body: JSON.stringify({ layout }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

export const macroLibService = {
  /** GET /api/v1/macros — tbx_macro 라이브러리 */
  async list(): Promise<MacroLibRow[] | null> {
    try {
      return await api<MacroLibRow[]>('/macros')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** PUT /api/v1/macros/{name} — 4-Way Sync 전체 upsert DRAFT (B20; true=영속, false=백엔드 불가) */
  async save(name: string, expr: string, prompt = '', extra?: {
    codeText?: string; flowchartDef?: object | null; descriptionText?: string
    applyType?: string; testInput?: object | null; testResult?: object | null
  }): Promise<{ version: number; refs: number } | null> {
    try {
      return await api(`/macros/${encodeURIComponent(name)}`, {
        method: 'PUT', body: JSON.stringify({ prompt, expr, ...extra }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/macros/functions?q= — 함수 카탈로그·자연어 검색 (TBX-014) */
  async searchFunctions(q: string): Promise<MacroFn[] | null> {
    try {
      return await api<MacroFn[]>(`/macros/functions?q=${encodeURIComponent(q)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/macros/{name}/refs — Table 참조 (tbx_macro_ref) */
  async refs(name: string): Promise<MacroRefRow[] | null> {
    try {
      return await api<MacroRefRow[]>(`/macros/${encodeURIComponent(name)}/refs`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/tables/{name}/impact — 이 Table 을 참조하는 Macro (영향도) */
  async tableImpact(table: string): Promise<{ macro: string; status: string }[] | null> {
    try {
      return await api(`/tables/${encodeURIComponent(table)}/impact`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

export const processDefService = {
  /** GET /api/v1/erp/process-defs — erp_process_def + edge */
  async get(): Promise<ProcessDefsResponse | null> {
    try {
      return await api<ProcessDefsResponse>('/erp/process-defs')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

export const referencerService = {
  /** GET /api/v1/codes/{code}/referencers — Where-Used 역참조 */
  async list(code: string): Promise<ReferencerRow[] | null> {
    try {
      return await api<ReferencerRow[]>(`/codes/${encodeURIComponent(code)}/referencers`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

// ── B7 — PLM 도면 대장 (dwg_drawing·dwg_revision·dwg_supersedure) ──

export type { DrawingRow, RevisionRow, SupersedureRow } from './mock/dataMore'

export const drawingLedgerService = {
  /** GET /api/v1/drawings — 도면 대장 (code 지정 시 해당 도면만; 읽기는 mock 폴백) */
  async list(code?: string): Promise<DrawingRow[]> {
    try {
      return await api<DrawingRow[]>(`/drawings${code ? `?code=${encodeURIComponent(code)}` : ''}`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return code ? DRAWINGS.filter((d) => d.drawingNo === code) : DRAWINGS
    }
  },
  /** POST /api/v1/drawings — 도면 등록 + Rev.A (409=중복 throw, false=백엔드 불가) */
  async create(row: { drawingNo: string; name: string; drawingType: string; kind: string }):
  Promise<boolean> {
    try {
      await api('/drawings', { method: 'POST', body: JSON.stringify(row) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** GET /api/v1/drawings/{no}/revisions — Rev 이력 (최신 우선) */
  async revisions(no: string): Promise<RevisionRow[]> {
    try {
      return await api<RevisionRow[]>(`/drawings/${encodeURIComponent(no)}/revisions`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return DRAWING_REVS[no] ?? []
    }
  },
  /** POST /api/v1/drawings/{no}/revisions — Rev 올리기 (반환=새 Rev, null=백엔드 불가) */
  async revUp(no: string, reason: string): Promise<string | null> {
    try {
      const r = await api<{ rev: string }>(`/drawings/${encodeURIComponent(no)}/revisions`, {
        method: 'POST', body: JSON.stringify({ reason }),
      })
      return r.rev
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/drawings/supersedures — Rev 대체 이력 */
  async supersedures(): Promise<SupersedureRow[]> {
    try {
      return await api<SupersedureRow[]>('/drawings/supersedures')
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return SUPERSEDURES
    }
  },
  /** POST /api/v1/drawings/supersedures — 대체 등록 (409=이미 대체 throw) */
  async supersede(oldNo: string, newNo: string, reason: string): Promise<boolean> {
    try {
      await api('/drawings/supersedures', {
        method: 'POST', body: JSON.stringify({ oldNo, newNo, reason }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** GET /api/v1/codes/{code}/approval-history — sys_approval_request 실조회 (null=백엔드 불가) */
  async approvalHistory(code: string):
  Promise<{ date: string; action: string; by: string; note: string }[] | null> {
    try {
      return await api(`/codes/${encodeURIComponent(code)}/approval-history`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  // ── B16 도면 상세 탭 — Variants·첨부·단계별 승인·블록·부품 관계 ──
  /** GET /api/v1/drawings/{no}/variants — 동일 패밀리 도면 (null=백엔드 불가) */
  async variants(no: string): Promise<DrawingVariantRow[] | null> {
    try {
      return await api<DrawingVariantRow[]>(`/drawings/${encodeURIComponent(no)}/variants`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/drawings/{no}/files — 첨부 (dwg_file 연결분) */
  async files(no: string): Promise<DrawingFileRow[] | null> {
    try {
      return await api<DrawingFileRow[]>(`/drawings/${encodeURIComponent(no)}/files`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/drawings/{no}/approvals — 단계별 승인 (WRITE→REVIEW→APPROVE) */
  async stepApprovals(no: string): Promise<DwgApprovalRow[] | null> {
    try {
      return await api<DwgApprovalRow[]>(`/drawings/${encodeURIComponent(no)}/approvals`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/drawings/{no}/approvals — 단계 결정 (순서 강제·반려=DRAFT 복귀, 쓰기 정직) */
  async decideStep(no: string, step: string, approve: boolean, comment: string):
  Promise<{ drawingStatus: string | null }> {
    try {
      return await api(`/drawings/${encodeURIComponent(no)}/approvals`, {
        method: 'POST', body: JSON.stringify({ step, approve, comment }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — 승인 단계를 처리할 수 없습니다')
      throw e
    }
  },
  /** GET /api/v1/drawings/{no}/blocks — dwg_document (Design Editor Block 원천) */
  async blocks(no: string): Promise<DrawingBlockRow[] | null> {
    try {
      return await api<DrawingBlockRow[]>(`/drawings/${encodeURIComponent(no)}/blocks`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/drawings/{no}/relations — dwg_part_relation (정렬·접촉 조건 + Macro) */
  async relations(no: string): Promise<DwgRelationRow[] | null> {
    try {
      return await api<DwgRelationRow[]>(`/drawings/${encodeURIComponent(no)}/relations`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

// ── B21 시스템·UX 마감 — auth/me·다중 역할·Hierarchy 편집·문서 채번/전이·초대/비활성 ──

export const sysService = {
  /** GET /api/v1/auth/me */
  async me(): Promise<{ login: string; name: string; userLevel: string; roles: string[] } | null> {
    try {
      return await api('/auth/me')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/auth/permissions — 유효 권한 (역할 합집합) */
  async myPermissions(): Promise<Record<string, string> | null> {
    try {
      return await api('/auth/permissions')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET/PUT /api/v1/users/{login}/roles — 다중 역할 */
  async roles(login: string): Promise<string[] | null> {
    try {
      return await api(`/users/${encodeURIComponent(login)}/roles`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  async assignRoles(login: string, roles: string[]): Promise<boolean> {
    try {
      await api(`/users/${encodeURIComponent(login)}/roles`, {
        method: 'PUT', body: JSON.stringify({ roles }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** POST /api/v1/users/{login}/invite — 인앱 알림 (메일 서버 미설정 정직 범위) */
  async invite(login: string): Promise<boolean> {
    try {
      await api(`/users/${encodeURIComponent(login)}/invite`, { method: 'POST' })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** PATCH /api/v1/users/{login}/active — 비활성화/재활성 */
  async setActive(login: string, active: boolean): Promise<boolean> {
    try {
      await api(`/users/${encodeURIComponent(login)}/active`, {
        method: 'PATCH', body: JSON.stringify({ active }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** Hierarchy 노드 편집 (M-3-1) */
  async hierarchyAdd(body: {
    treeType: string; name: string; symbol: string; address: string; parentAddress: string
  }): Promise<boolean> {
    try {
      await api('/hierarchy/nodes', { method: 'POST', body: JSON.stringify(body) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  async hierarchyPatch(id: number, name: string, symbol: string): Promise<boolean> {
    try {
      await api(`/hierarchy/nodes/${id}`, { method: 'PATCH', body: JSON.stringify({ name, symbol }) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  async hierarchyDelete(id: number): Promise<boolean> {
    try {
      await api(`/hierarchy/nodes/${id}`, { method: 'DELETE' })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** 문서 채번 + 상태 전이 */
  async allocateDocNo(docType: string): Promise<string | null> {
    try {
      const r = await api<{ docNo: string }>('/documents/allocate-code', {
        method: 'POST', body: JSON.stringify({ docType }),
      })
      return r.docNo
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  async docStatus(docNo: string, status: string): Promise<boolean> {
    try {
      await api(`/documents/${encodeURIComponent(docNo)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** Child 관계 추가 (S-1-4) */
  async relationshipAdd(mother: string, child: string, qty: number): Promise<boolean> {
    try {
      await api('/codes/relationships', {
        method: 'POST', body: JSON.stringify({ mother, child, qty }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** 프로젝트 중복검토 (S-3-5) */
  async projectDupCheck(name: string, no: string):
  Promise<{ duplicate: boolean; matches: { no: string; name: string }[] } | null> {
    try {
      return await api(`/erp/projects/check-duplicate?name=${encodeURIComponent(name)}&no=${encodeURIComponent(no)}`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

// ── B19 창고·저장위치 계층 + 구매 상세 — erp_warehouse·QCR·PO ──

export interface WarehouseNode {
  warehouseId: number
  parentId: number | null
  type: 'REGION' | 'PLANT' | 'WAREHOUSE' | 'STORAGE' | 'SECTOR'
  code: string
  name: string
  hazard: string
  inspection: string
  remarks: string
  depth: number
  path: string
}

export const warehouseService = {
  /** GET /api/v1/erp/warehouses — 계층 트리 (경로 정렬, null=백엔드 불가) */
  async tree(): Promise<WarehouseNode[] | null> {
    try {
      return await api<WarehouseNode[]>('/erp/warehouses')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/erp/warehouses — 계층 순서 강제 (409=중복·422=계층 오류 throw) */
  async create(body: {
    parentCode: string; locationType: string; code: string; name: string
    hazard: string; inspection: string; remarks: string
  }): Promise<boolean> {
    try {
      await api('/erp/warehouses', { method: 'POST', body: JSON.stringify(body) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** DELETE /api/v1/erp/warehouses/{code} — 하위 존재 시 409 */
  async remove(code: string): Promise<boolean> {
    try {
      await api(`/erp/warehouses/${encodeURIComponent(code)}`, { method: 'DELETE' })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** POST /api/v1/erp/qcr — 견적 요청 발행 (감사+알림, 쓰기 정직) */
  async issueQcr(codes: string[], note = ''): Promise<string> {
    try {
      const r = await api<{ qcrNo: string }>('/erp/qcr', {
        method: 'POST', body: JSON.stringify({ codes, note }),
      })
      return r.qcrNo
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — QCR 을 발행할 수 없습니다')
      throw e
    }
  },
  /** POST /api/v1/erp/po — 발주 = doc_control PO 문서 영속 (조건·공급자 코드 병기) */
  async createPo(body: {
    codes: string[]; totalK: number; deliveryTerms: string; transport: string
    minOrderQty: number; certRequired: boolean
  }): Promise<{ poNo: string; terms: string }> {
    try {
      return await api('/erp/po', { method: 'POST', body: JSON.stringify(body) })
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — 발주를 생성할 수 없습니다')
      throw e
    }
  },
}

// ── B18 원가·수익성 — cst_calc·cst_pcr·cst_quotation ──

export interface RunCostRow {
  calcType: 'MATERIAL' | 'MANUFACTURING' | 'DIRECT'
  lines: Record<string, unknown>[]
  total: number
}

export interface PcrResult {
  pcrId: number
  businessType: string
  revenue: number
  directCostTotal: number
  contributionMargin: number
  ebit: number
}

export interface QuotationRow {
  quotationId: number
  quotationNo: string
  total: number
  currency: string
  status: string
  date: string
  project: string
  customer: string
}

export const costService = {
  /** GET /api/v1/cpq/runs/{id}/costs — Run 원가 3분류 (null=백엔드 불가/미적재) */
  async runCosts(runId: number): Promise<RunCostRow[] | null> {
    try {
      return await api<RunCostRow[]>(`/cpq/runs/${runId}/costs`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      if (e instanceof Error && e.message.includes('원가 상세 없음')) return null
      throw e
    }
  },
  /** POST /api/v1/cost/pcr — PCR upsert (쓰기 정직) */
  async pcrCreate(businessType: string, marginRate = 0.35): Promise<PcrResult> {
    try {
      return await api<PcrResult>('/cost/pcr', {
        method: 'POST', body: JSON.stringify({ businessType, marginRate }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — PCR 을 생성할 수 없습니다')
      throw e
    }
  },
  /** POST /api/v1/cost/quotations — 견적 확정 (PCR 필요 409) */
  async quotationCreate(businessType: string): Promise<{ quotationNo: string; total: number }> {
    try {
      return await api('/cost/quotations', {
        method: 'POST', body: JSON.stringify({ businessType }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — 견적을 확정할 수 없습니다')
      throw e
    }
  },
  /** GET /api/v1/cost/quotations */
  async quotationList(): Promise<QuotationRow[] | null> {
    try {
      return await api<QuotationRow[]>('/cost/quotations')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/cost/quotations/{id}/render.pdf — 인증 fetch → blob URL */
  async quotationPdfUrl(quotationId: number): Promise<string> {
    const res = await fetch(`${API}/cost/quotations/${quotationId}/render.pdf`, {
      signal: AbortSignal.timeout(30_000),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) throw new Error(`견적서 렌더 실패 (HTTP ${res.status})`)
    return URL.createObjectURL(await res.blob())
  },
}

// ── B17 부품 마스터 — prt_part·dwg_bom·prt_supplier_code_map·product_code_item ──

export interface PartRow {
  partId: number
  partNo: string
  name: string
  spec: string
  material: string | null
  supplier: string | null
  productCode: string | null
  unit: string
  weight: number | null
  isStandard: boolean
  bomCount: number
}

export interface BomRow {
  bomId: number
  itemNo: number
  partNo: string
  partName: string
  qty: number
  assemblySeq: number | null
  assemblyNote: string
  unit: string
  isStandard: boolean
}

export interface SupplierCodeRow {
  mapId: number
  supplier: string
  supplierCode: string
  supplierName: string
}

export interface SlotItemRow {
  pcItemId: number
  slot: string
  itemName: string
  required: boolean
  sortOrder: number
}

export const partService = {
  /** GET /api/v1/parts — 부품 대장 (null=백엔드 불가) */
  async list(): Promise<PartRow[] | null> {
    try {
      return await api<PartRow[]>('/parts')
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/parts — 등록 (409=중복 throw, false=백엔드 불가) */
  async create(body: {
    partNo: string; name: string; spec: string; materialCode: string
    supplier: string; productCode: string; unit: string; weight: number | null
    isStandard: boolean
  }): Promise<boolean> {
    try {
      await api('/parts', { method: 'POST', body: JSON.stringify(body) })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** DELETE /api/v1/parts/{no} — BOM 참조 시 409 */
  async remove(partNo: string): Promise<boolean> {
    try {
      await api(`/parts/${encodeURIComponent(partNo)}`, { method: 'DELETE' })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** GET /api/v1/parts/{no}/supplier-codes — ERP-018 매핑 */
  async supplierCodes(partNo: string): Promise<SupplierCodeRow[] | null> {
    try {
      return await api<SupplierCodeRow[]>(`/parts/${encodeURIComponent(partNo)}/supplier-codes`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/parts/{no}/supplier-codes */
  async addSupplierCode(partNo: string, supplier: string, supplierCode: string, supplierName: string):
  Promise<boolean> {
    try {
      await api(`/parts/${encodeURIComponent(partNo)}/supplier-codes`, {
        method: 'POST', body: JSON.stringify({ supplier, supplierCode, supplierName }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
      throw e
    }
  },
  /** GET /api/v1/drawings/{no}/bom — 조립순서 정렬 BOM */
  async bom(drawingNo: string): Promise<BomRow[] | null> {
    try {
      return await api<BomRow[]>(`/drawings/${encodeURIComponent(drawingNo)}/bom`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/codes/{code}/supplier-codes — 발주 문서 표시용 */
  async codeSupplierCodes(code: string): Promise<SupplierCodeRow[] | null> {
    try {
      return await api<SupplierCodeRow[]>(`/codes/${encodeURIComponent(code)}/supplier-codes`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/codes/{code}/slot-items — 필수 슬롯 정의 */
  async slotItems(code: string): Promise<SlotItemRow[] | null> {
    try {
      return await api<SlotItemRow[]>(`/codes/${encodeURIComponent(code)}/slot-items`)
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

export interface DrawingVariantRow {
  drawingNo: string
  name: string
  rev: string
  status: string
  superseded: boolean
}

export interface DrawingFileRow {
  fileId: number
  fileName: string
  fileType: string
  size: number
  date: string
}

export interface DwgApprovalRow {
  approvalId: number
  step: 'WRITE' | 'REVIEW' | 'APPROVE'
  result: 'APPROVED' | 'REJECTED' | null
  comment: string
  date: string
  by: string
}

export interface DrawingBlockRow {
  documentId: number
  blockName: string
  content: { x: number; y: number; w: number; h: number; sub?: string; dashed?: boolean }
  originX: number | null
  originY: number | null
}

export interface DwgRelationRow {
  relationId: number
  blockA: string
  blockB: string
  align: string
  contact: string
  macro: string | null
  priority: number
  status: string
}

export const cadService = {
  /** GET /api/v1/cad/view/{fileId} — MinIO DXF → DrawingDocument */
  async view(fileId: number): Promise<CadDocument | null> {
    try {
      const r = await api<{ document: CadDocument }>(`/cad/view/${fileId}`)
      return r.document
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/cad/import — DXF/DWG 업로드 + 파싱 + Folder 등록 */
  async importFile(file: globalThis.File, project: string):
  Promise<{ fileId: number; document: CadDocument } | null> {
    const form = new FormData()
    form.append('uploadedFile', file)
    form.append('project', project)
    try {
      const res = await fetch(`${API}/cad/import`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(60_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `HTTP ${res.status}`)
      }
      setSource('live')
      return await res.json() as { fileId: number; document: CadDocument }
    } catch (e) {
      if (e instanceof TypeError || e instanceof DOMException) { setSource('mock'); return null }
      throw e
    }
  },
  /** GET /api/v1/cad/arrangement — C-1 구성도의 CAD 정본 (실 DXF 작도→파싱) */
  async arrangement(): Promise<CadDocument | null> {
    try {
      const r = await api<{ document: CadDocument }>('/cad/arrangement')
      return r.document
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** GET /api/v1/cad/arrangement.dxf — 구성도 DXF 다운로드 */
  async arrangementDxf(): Promise<void> {
    const res = await fetch(`${API}/cad/arrangement.dxf`, {
      signal: AbortSignal.timeout(15_000),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) throw new Error(`DXF 다운로드 실패 (HTTP ${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'AHU5_arrangement.dxf'
    a.click()
    URL.revokeObjectURL(url)
  },
  /** POST /api/v1/cad/part-drawing — 현재 치수로 부품도 작도 (Design Editor CAD 모드) */
  async partDrawing(dims: Record<string, number>): Promise<CadDocument | null> {
    try {
      const r = await api<{ document: CadDocument }>('/cad/part-drawing', {
        method: 'POST', body: JSON.stringify({ dims }),
      })
      return r.document
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/cad/export-dxf — 현재 치수로 제작 DXF 다운로드 */
  async exportDxf(dims: Record<string, number>): Promise<void> {
    const res = await fetch(`${API}/cad/export-dxf`, {
      method: 'POST', body: JSON.stringify({ dims }),
      signal: AbortSignal.timeout(30_000),
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
    if (!res.ok) throw new Error(`DXF 내보내기 실패 (HTTP ${res.status})`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'KDCR3-13_mfg.dxf'
    a.click()
    URL.revokeObjectURL(url)
  },
}

// ── AI-04/06 — Prompt→Macro · UI 초안 ──
export interface AiMacroResult {
  mode: 'live' | 'sample' | 'error'
  formula: string
  description: string
  coding: string
  error?: string
}

export interface AiUiResult {
  mode: 'live' | 'sample' | 'error'
  widgets: { kind: string; label: string; x: number; y: number; w: number; h: number }[]
  notes: string
  error?: string
}

export const aiService = {
  /** POST /api/v1/ai/macro-generate — Claude (키 없으면 sample) */
  async macroGenerate(prompt: string): Promise<AiMacroResult | null> {
    try {
      return await api<AiMacroResult>('/ai/macro-generate', {
        method: 'POST', body: JSON.stringify({ prompt }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
  /** POST /api/v1/ai/ui-suggest */
  async uiSuggest(description: string): Promise<AiUiResult | null> {
    try {
      return await api<AiUiResult>('/ai/ui-suggest', {
        method: 'POST', body: JSON.stringify({ description }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

// ── ENG-01 Macro 실행 엔진 ──
export interface MacroResult { ok: boolean; value?: number; error?: string; trace?: string[] }

export const macroService = {
  /** POST /api/v1/macros/evaluate — Excel 호환 문법, Table 참조는 실 tbl_data_row.
   *  반환 null = 백엔드 불가 (mock 폴백). */
  async evaluate(formula: string, variables: Record<string, number>): Promise<MacroResult | null> {
    try {
      return await api<MacroResult>('/macros/evaluate', {
        method: 'POST', body: JSON.stringify({ formula, variables }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) return null
      throw e
    }
  },
}

// ── SVC-07 CPQ / ENG-02 Run ──
let mockRunSeq = 7

function mockRun(onProgress: (r: RunResult) => void): { runId: number; cancel: () => void } {
  const runId = mockRunSeq++
  const steps: RunStep[] = RUN_STEPS.map((s) => ({ ...s, status: 'PENDING' }))
  let i = 0
  let cancelled = false
  const emit = (status: RunResult['status'], progress: number) => {
    onProgress({
      runId, status, progress,
      steps: steps.map((s) => ({ ...s })),
      outputs: status === 'SUCCESS' ? RUN_OUTPUTS : [],
      logs: RUN_LOGS.slice(0, Math.ceil(RUN_LOGS.length * progress)),
    })
  }
  const tick = () => {
    if (cancelled) return
    if (i > 0) steps[i - 1].status = steps[i - 1].no === 4 ? 'WARN' : 'DONE'
    if (i < steps.length) {
      steps[i].status = 'RUNNING'
      i += 1
      emit('RUNNING', (i - 0.5) / steps.length)
      setTimeout(tick, 700 + Math.floor(i * 60))
    } else {
      emit('SUCCESS', 1)
    }
  }
  setTimeout(tick, 300)
  return { runId, cancel: () => { cancelled = true } }
}

export const cpqService = {
  /** POST /api/v1/cpq/runs (202) → GET /api/v1/cpq/runs/{id} 폴링 (비동기 잡 패턴). */
  startRun(onProgress: (r: RunResult) => void): { runId: number; cancel: () => void } {
    let cancelled = false
    let liveRunId = 0
    const cancel = () => { cancelled = true }

    void (async () => {
      let started: { runId: number }
      try {
        started = await api<{ runId: number }>('/cpq/runs', {
          method: 'POST', body: JSON.stringify({ runType: 'ALL' }),
        })
      } catch (e) {
        if (e instanceof ApiUnavailable && !cancelled) {
          const m = mockRun(onProgress)
          liveRunId = m.runId
        }
        return
      }
      liveRunId = started.runId
      while (!cancelled) {
        try {
          const r = await api<RunResult>(`/cpq/runs/${started.runId}`)
          onProgress(r)
          if (r.status !== 'RUNNING') break
        } catch {
          break
        }
        await delay(700)
      }
    })()

    return { runId: liveRunId, cancel }
  },
}

// ── 개발서버 전용 — 운영자 요구사항 접수 (dev_requirement) ──

export interface DevRequirement {
  reqId: number
  screenId: string
  category: 'CHANGE' | 'BUG' | 'FEATURE'
  title: string
  content: string
  priority: 'P1' | 'P2' | 'P3'
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'REJECTED'
  requester: string
  resolution: string
  createdAt: string
  resolvedAt: string | null
  imageCount: number
}

export interface DevReqImage {
  imageId: number
  fileName: string
  size: number
  contentType: string
}

export const devReqService = {
  /** GET /api/v1/config — devMode 게이트 (백엔드 불가/구버전 → false = 버튼 숨김) */
  async devMode(): Promise<boolean> {
    try {
      return (await api<{ devMode: boolean }>('/config')).devMode === true
    } catch {
      return false
    }
  },
  /** GET /api/v1/dev/requirements */
  async list(): Promise<DevRequirement[]> {
    try {
      return await api<DevRequirement[]>('/dev/requirements')
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — 요구사항 목록을 불러올 수 없습니다')
      throw e
    }
  },
  /** POST /api/v1/dev/requirements — 쓰기는 정직 (mock 저장 없음) */
  async create(body: {
    title: string; content: string; category: string; priority: string; screenId: string
  }): Promise<number> {
    try {
      const r = await api<{ reqId: number }>('/dev/requirements', {
        method: 'POST', body: JSON.stringify(body),
      })
      return r.reqId
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — MOCK 모드에서는 등록할 수 없습니다')
      throw e
    }
  },
  /** PATCH /api/v1/dev/requirements/{id} — 상태 변경 (SETUP+) */
  async setStatus(reqId: number, status: string, resolution = ''): Promise<void> {
    try {
      await api(`/dev/requirements/${reqId}`, {
        method: 'PATCH', body: JSON.stringify({ status, resolution }),
      })
    } catch (e) {
      if (e instanceof ApiUnavailable) throw new Error('백엔드 연결 필요 — 상태를 변경할 수 없습니다')
      throw e
    }
  },
  /** POST /api/v1/dev/requirements/{id}/images — 스크린샷 첨부 (multipart) */
  async uploadImage(reqId: number, file: globalThis.File): Promise<void> {
    const form = new FormData()
    form.append('uploadedFile', file)
    let res: Response
    try {
      res = await fetch(`${API}/dev/requirements/${reqId}/images`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
    } catch {
      throw new Error('백엔드 연결 필요 — 이미지를 첨부할 수 없습니다')
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { detail?: string } | null
      throw new Error(body?.detail ?? `HTTP ${res.status}`)
    }
  },
  /** GET /api/v1/dev/requirements/{id}/images */
  async listImages(reqId: number): Promise<DevReqImage[]> {
    return await api<DevReqImage[]>(`/dev/requirements/${reqId}/images`)
  },
  /** GET /api/v1/dev/requirements/images/{imageId} — authorized fetch → blob URL (<img> 는 헤더 불가) */
  async imageBlobUrl(imageId: number): Promise<string> {
    const res = await fetch(`${API}/dev/requirements/images/${imageId}`, {
      signal: AbortSignal.timeout(30_000),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!res.ok) throw new Error(`이미지 로드 실패 (HTTP ${res.status})`)
    return URL.createObjectURL(await res.blob())
  },
}
