/** 서비스 계층 — 실 API(/api/v1, PostgreSQL 54테이블) 우선, 불가 시 mock 폴백.
 *  각 함수 주석 = 대응 REST 엔드포인트 (OpenAPI docs/api/edim-openapi.yaml). */
import type { ExpandResult, RunResult, RunStep, SlotDef, TechDataRow, User } from './types'
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(API + path, {
      ...init,
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
  setSource('live')
  return res.json() as Promise<T>
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

// ── SVC-12 Project Folder 파일 ──
export const fileService = {
  /** GET /api/v1/files — cpq_output 실산출물 + RECEIVED */
  async list(project: string): Promise<FolderFile[]> {
    try {
      return await api<FolderFile[]>(`/files?project=${encodeURIComponent(project)}`)
    } catch (e) {
      if (!(e instanceof ApiUnavailable)) throw e
      return FOLDER_FILES
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
