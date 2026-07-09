/** ERP mock — 원천: W-09(슬라이드 4·52)·W-10(슬라이드 10)·W-13(슬라이드 74·75)·
 *  W-14(슬라이드 17)·W-21(슬라이드 53). */

// ── S-3-5 Project 등록 ──
export const SALES_STAGES = ['기술 제안', '견적', '협의', '계약', '계약 변경', '종료']

export const PROJECT = {
  projectNo: 'PS-61313-5',
  projectType: 'Client',
  stage: '기술 제안',
  item: 'AHU',
  client: 'Micron',
  registeredAt: '2026-07-07',
  clientContact: 'KSY',
  owner: 'YKK',
  documentCode: 'EU-3-2020-450-6-21-4-SR-7',
}

export interface ReceivedFile {
  name: string
  fileType: string
  registrant: string
  date: string
}

export const RECEIVED_FILES: ReceivedFile[] = [
  { name: 'Micron7_사양서_v2.xlsx', fileType: 'XLSX', registrant: 'KSY', date: '2026-07-07' },
  { name: '현장 배치도.pdf', fileType: 'PDF', registrant: 'YKK', date: '2026-07-07' },
]

// ── M-14-4 Dashboard ──
export const KPIS = [
  { label: '진행 Project', value: '12' },
  { label: '승인 대기', value: '4' },
  { label: '이번 달 수주', value: '₩ 8.4억' },
  { label: '이상 경고 (시간·자금)', value: '2', err: true },
]

// 프로세스 코드 상태기계(erp_process_event) 집계 — done/now/pending
export const PROCESS_FLOW_1 = [
  { code: 'PS 등록', st: 'done' }, { code: 'PCR 견적검토', st: 'done' },
  { code: 'QCR 견적', st: 'done' }, { code: 'OR 수주', st: 'now' },
  { code: 'AP 승인도서', st: '' }, { code: 'APP 고객승인', st: '' }, { code: 'MR 제작의뢰', st: '' },
] as const

export const PROCESS_FLOW_2 = [
  { code: 'BOM', st: '' }, { code: 'PR 발주요청', st: '' }, { code: 'PO 발주', st: '' },
  { code: 'MI 입고', st: '' }, { code: 'MP 생산계획', st: '' }, { code: 'WR 작업지시', st: '' },
  { code: 'FF 완성', st: '' }, { code: 'DF 납품', st: '' }, { code: 'IR 기성청구', st: '' },
] as const

export const DEPT_EVENTS = [
  { dept: '영업', waiting: 3, running: 5, doneWeek: 12, delayed: 1 },
  { dept: '기술', waiting: 2, running: 7, doneWeek: 18, delayed: 0 },
  { dept: '자재', waiting: 6, running: 4, doneWeek: 9, delayed: 1 },
  { dept: '생산', waiting: 1, running: 8, doneWeek: 15, delayed: 0 },
]

export const ALERTS = [
  { kind: '시간', project: 'PS-612', message: 'MR 기한 초과 2일' },
  { kind: '자금', project: 'PS-598', message: '기성청구 지연' },
]

// ── M-12-5 단가 관리 (4종 단가 Table · CST-001) ──
export type PriceSource = '견적적용' | '구매' | '재고' | '견적'

export interface PriceRow {
  code: string
  name: string
  supplier: string
  price: number
  source: PriceSource
  from: string
  to: string | null
  active: boolean
}

export const PRICES: PriceRow[] = [
  { code: 'FDV-480', name: 'Motor H22 380V', supplier: '효성', price: 450000, source: '견적', from: '2026-06-01', to: null, active: true },
  { code: 'FDV-480', name: 'Motor H22 380V', supplier: 'LG', price: 462000, source: '견적', from: '2026-05-15', to: null, active: true },
  { code: 'KDC-1', name: 'Casing 강판', supplier: '중원', price: 128000, source: '구매', from: '2026-04-01', to: '2026-06-30', active: false },
  { code: 'KDC-1', name: 'Casing 강판', supplier: '중원', price: 131000, source: '재고', from: '2026-07-01', to: null, active: true },
  { code: 'EWT-3', name: 'Water Trap', supplier: '대신금속', price: 36000, source: '견적적용', from: '2026-06-10', to: null, active: true },
]

export const STOCK_PRICE = { code: 'KDC-1', max: 131000, min: 119000, avg: 125300, last: 128000 }

/** Pricing Run resolve 규칙 — 우선순위 견적적용 → 구매 → 재고 → 견적, 기간 일치 (CST-001) */
export function resolvePrice(code: string, date: string): PriceRow | null {
  const order: PriceSource[] = ['견적적용', '구매', '재고', '견적']
  const valid = PRICES.filter((p) => p.code.toUpperCase() === code.toUpperCase()
    && p.from <= date && (p.to == null || date <= p.to))
  for (const src of order) {
    const hit = valid.find((p) => p.source === src)
    if (hit) return hit
  }
  return null
}

// ── M-14-7 ERP Process Set-up (erp_process_def) ──
export interface ProcessDefRow {
  code: string
  name: string
  dept: string
  prev: string
  next: string
  form: string
  auto: boolean
  precondition: string
  deadlineRule: string
  ownerRule: string
}

export const DEPTS = [
  { dept: '영업', count: 10 }, { dept: '기술', count: 6 }, { dept: '자재', count: 8 },
  { dept: '생산', count: 7 }, { dept: 'QC', count: 4 }, { dept: '재무', count: 7 },
]

export const PROCESS_DEFS: ProcessDefRow[] = [
  { code: 'OR', name: '수주', dept: '영업', prev: 'QCR', next: 'AP, PL', form: '수주 Form v2', auto: false, precondition: 'QCR = DONE', deadlineRule: 'QCR + 7일 (초과 시 이상경고)', ownerRule: 'Project 담당자' },
  { code: 'AP', name: '승인 도서', dept: '영업', prev: 'OR', next: 'APP', form: '승인도서 Form', auto: true, precondition: 'OR = DONE', deadlineRule: 'OR + 5일', ownerRule: 'Project 담당자' },
  { code: 'PL', name: 'Part List', dept: '기술', prev: 'OR', next: 'BOM', form: '-', auto: true, precondition: 'OR = DONE', deadlineRule: 'OR + 3일', ownerRule: '기술 담당' },
  { code: 'PR', name: '발주 요청', dept: '자재', prev: 'BOM', next: 'PO', form: '발주요청 Form', auto: false, precondition: 'BOM = DONE', deadlineRule: 'BOM + 2일', ownerRule: '구매 담당' },
]

// ── M-8-2 구매·발주 (PR → PO) ──
export interface PrItem {
  code: string
  name: string
  supplierCode: string
  supplier: string
  qty: number
  price: number | null
  requiredDate: string
  delivery: string
  stockOk: boolean
  checked: boolean
}

export const PR_ITEMS: PrItem[] = [
  { code: 'FDV-480', name: 'Motor H22 380V', supplierCode: 'HS-M480', supplier: '효성', qty: 2, price: 450000, requiredDate: '08-20', delivery: 'EXW', stockOk: false, checked: true },
  { code: 'KDC-1', name: 'Casing 강판', supplierCode: 'JW-C001', supplier: '중원', qty: 4, price: 128000, requiredDate: '08-15', delivery: '지정장소', stockOk: false, checked: true },
  { code: 'EWT-3', name: 'Water Trap', supplierCode: '-', supplier: '-', qty: 1, price: null, requiredDate: '-', delivery: '-', stockOk: true, checked: false },
]
