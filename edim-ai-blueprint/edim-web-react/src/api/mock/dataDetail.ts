/** 상세(드릴다운) 화면 mock — 코드 상세 · 문서 상세 · 부품 상세 · 프로세스 이벤트 상세. */

// ── 코드 상세 (Where-Used · 승인 이력) ──
export interface WhereUsedRow {
  mother: string
  desc: string
  qty: number
  level: string
}

/** Referencers — 이 코드를 Child 로 쓰는 Mother 목록 (SVC-04 referencers) */
export const WHERE_USED: Record<string, WhereUsedRow[]> = {
  'KDP 1-21': [
    { mother: 'KDCR 3-13', desc: 'Double Suction casing', qty: 1, level: 'Product' },
    { mother: 'KDCR 3-14', desc: 'Double Suction casing (FRP)', qty: 1, level: 'Product' },
  ],
  'ECC 55': [
    { mother: 'AHU Double Deck 2', desc: 'Arrangement', qty: 1, level: 'Arrangement' },
  ],
  'FDV-480': [
    { mother: 'KAD 900 FW', desc: 'SF Fan', qty: 1, level: 'Sub' },
    { mother: 'KAD 1120 4KA', desc: 'SF Fan (대형)', qty: 1, level: 'Sub' },
  ],
}

export interface ApprovalHistRow {
  date: string
  action: string
  by: string
  note: string
}

export const CODE_APPROVAL_HIST: ApprovalHistRow[] = [
  { date: '2026-06-12', action: '등록 (DRAFT)', by: 'YS.Gang', note: '초기 등록' },
  { date: '2026-06-13', action: '승인 요청', by: 'YS.Gang', note: 'Running Test 통과' },
  { date: '2026-06-14', action: '승인 (APPROVED)', by: 'Platform·KJH', note: 'Grade B' },
]

// ── 문서 상세 (Run 산출물 → doc_control) ──
export const DOC_STAGES = ['Set-up', 'Check', 'Approve', 'Accepted'] as const

export interface DocHistRow {
  date: string
  action: string
  by: string
}

export const DOC_HIST: DocHistRow[] = [
  { date: '10:39:21', action: 'EDIM Run #7 생성 (자동)', by: 'ENG-02' },
  { date: '10:40:02', action: 'Doc No 채번 · Project Folder 저장', by: 'SVC-11' },
  { date: '10:41 —', action: '승인 요청 대기', by: '-' },
]

// ── 부품 상세 (Design Editor Block) ──
export interface PartInfo {
  name: string
  code: string
  status: 'DRAFT' | 'APPROVED'
  material: string
  makeBuy: 'MAKE' | 'BUY'
  assemblySeq: number
  caution: string
  dims: string[]        // 연결 치수 번호
}

export const PART_INFO: Record<string, PartInfo> = {
  casing: { name: 'Casing', code: 'KDC 1-32', status: 'APPROVED', material: 'Gal. Steel 1.6t', makeBuy: 'MAKE', assemblySeq: 3, caution: 'Pittsburgh seaming — 접합부 누기 검사', dims: ['A', 'B', 'K'] },
  impeller: { name: 'Impeller', code: 'KDI 9-13', status: 'APPROVED', material: 'Airfoil · Carbon Steel', makeBuy: 'BUY', assemblySeq: 5, caution: '밸런싱 G6.3 등급 확인', dims: ['C', 'D'] },
  shaft: { name: 'Shaft', code: 'KDS 2-45', status: 'APPROVED', material: 'S45C 연마봉', makeBuy: 'MAKE', assemblySeq: 2, caution: '', dims: ['E', 'K'] },
  brgL: { name: 'Bearing housing (L)', code: 'KDP 9-32', status: 'APPROVED', material: 'FC250 주물', makeBuy: 'BUY', assemblySeq: 1, caution: '조립 시 그리스 주입 — QC 체크시트 #4', dims: ['G'] },
  brgR: { name: 'Bearing housing (R)', code: 'KDP 9-32', status: 'APPROVED', material: 'FC250 주물', makeBuy: 'BUY', assemblySeq: 1, caution: '조립 시 그리스 주입 — QC 체크시트 #4', dims: ['G'] },
  coneL: { name: 'Inlet Cone (L)', code: 'KDC 21-13', status: 'DRAFT', material: 'Gal. Steel 1.2t', makeBuy: 'MAKE', assemblySeq: 4, caution: 'W/O FF — 방향 주의', dims: ['C'] },
  coneR: { name: 'Inlet Cone (R)', code: 'KDC 20-13', status: 'DRAFT', material: 'Gal. Steel 1.2t', makeBuy: 'MAKE', assemblySeq: 4, caution: 'With FF', dims: ['C'] },
}

// ── 프로세스 이벤트 상세 (erp_process_event) ──
export interface EventDetail {
  project: string
  processCode: string
  processName: string
  owner: string
  deadline: string
  status: string
  prev: string
  next: string
  history: { date: string; action: string; by: string }[]
}

export const EVENT_DETAILS: Record<string, EventDetail> = {
  'PS-612': {
    project: 'PS-612', processCode: 'MR', processName: '제작의뢰', owner: 'YS.Gang',
    deadline: '2026-07-07 (초과 2일)', status: '지연', prev: 'APP 고객승인', next: 'BOM',
    history: [
      { date: '07-01', action: 'APP 완료 → MR 생성', by: 'system' },
      { date: '07-05', action: '기한 경고 발송', by: 'SVC-13' },
      { date: '07-07', action: '이상 경고 (시간) 승격', by: 'system' },
    ],
  },
  'PS-598': {
    project: 'PS-598', processCode: 'IR', processName: '기성청구', owner: 'Kim',
    deadline: '2026-07-04 (지연)', status: '지연', prev: 'DF 납품', next: '-',
    history: [
      { date: '06-28', action: 'DF 완료 → IR 생성', by: 'system' },
      { date: '07-04', action: '기성청구 지연 — 자금 경고', by: 'system' },
    ],
  },
}
