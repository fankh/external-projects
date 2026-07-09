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
import { FOLDER_FILES, type FolderFile } from './mock/dataMore'
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
}

// ── SVC-09 Project ──
export const projectService = {
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
export interface FolderFileEx extends FolderFile { fileId?: number }

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
export interface MacroLibRow {
  name: string; expr: string; status: string; address: string
  prompt: string; description: string
}
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
  /** PUT /api/v1/macros/{name} — tbx_macro upsert DRAFT (true=영속, false=백엔드 불가) */
  async save(name: string, expr: string, prompt = ''): Promise<boolean> {
    try {
      await api(`/macros/${encodeURIComponent(name)}`, {
        method: 'PUT', body: JSON.stringify({ prompt, expr }),
      })
      return true
    } catch (e) {
      if (e instanceof ApiUnavailable) return false
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
