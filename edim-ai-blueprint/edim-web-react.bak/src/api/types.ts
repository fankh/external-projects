/** OpenAPI(docs/api/edim-openapi.yaml) 스키마 대응 타입.
 *  mock → 실 API 전환 시 이 타입은 그대로 유지하고 서비스 구현체만 교체한다. */

// ── Auth (SVC-01) ──
export interface User {
  userId: string
  name: string
  department: string
  userLevel: 'PLATFORM' | 'ADMIN' | 'SETUP' | 'GENERAL' | 'USER'
  tenantId: string
}

// ── Code (SVC-03) ──
export interface SlotDef {
  slot: string          // A~G
  label: string         // Fan Model, Fan Size …
  values: string[]      // 승인된 값 목록 (CODE-003: 미승인 값 미표시)
  approved: boolean
}

export interface ProductCode {
  id: number
  mainCode: string      // "KDCR 3-13"
  name: string
  codeType: 'SUB' | 'PRODUCT' | 'ARRANGEMENT'
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'RELEASED'
}

// POST /api/v1/codes/products/{id}/expand 응답
export interface ExpandResult {
  finishedGoodsCode: string   // "KDCR 3-13-13-15" (인터페이스정의서 §1.5)
  items: BomItem[]
}

export interface BomItem {
  level: number
  mainCode: string
  resolvedCode: string
  name: string
  quantity: number
  priceK: number | null // 천원 단위, 미확정 null
  path: string
}

// ── CPQ (SVC-07) ──
export interface Selection {
  projectNo: string     // PS-61313-5
  projectName: string   // Micron #7
  arrangement: string
  airflowCmm: number
  staticPressureMmaq: number
  slotValues: Record<string, string>
}

export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'

export interface RunStep {
  no: number
  task: string
  measured: string
  elapsed: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'WARN'
}

export interface RunOutput {
  folder: 'DWG' | 'PRICE' | 'DATA' | 'BOM'
  file: string
  fileType: string
  status: string
  statusTone: 'ok' | 'warn' | 'info'
  nextAction?: string
  fileId?: number | null   // 실산출물 (MinIO) — 다운로드 가능
}

export interface RunLogEntry {
  time: string
  message: string
  level: 'info' | 'warn'
}

export interface RunResult {
  runId: number
  status: RunStatus
  progress: number      // 0~1
  steps: RunStep[]
  outputs: RunOutput[]
  logs: RunLogEntry[]
}

// ── Table (SVC-05) ──
export interface TechDataRow {
  model: string
  pd: number
  pt: number
  rpm: number
  eff: number
  power: number
  sound: number
}

// ── Drawing (SVC-04) ──
export interface CanvasBlock {
  id: string
  name: string
  sub?: string
  x: number; y: number; w: number; h: number
  dashed?: boolean
}

export interface DimensionDef {
  no: string            // A~K
  value: string         // "670" 또는 "=A+56"
  binding: 'MACRO' | 'VARIANT'
  kind: 'KEY' | 'DETAIL'
}

// ── PLM Work Process (SVC-09/ENG) ──
export interface ProcessDef {
  process: string
  workplace: string
  person: number
  skill: string
  wtimeHr: number
}

export interface MaterialRow {
  item: string
  warehouse: string
  minStock: number
  supplier: string
  makeBuy: 'MAKE' | 'BUY'
  timeMin: number | null
  remarks: string
}
