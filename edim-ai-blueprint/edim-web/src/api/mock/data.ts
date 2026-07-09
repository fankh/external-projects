/** Mock 데이터 — 원천: 발표자료 슬라이드 36 (KDCR 3-13 BOM), 디자인시안 b03~b05, 화면설계서 W-03/06/19.
 *  DB 검증(docs/ddl/verify_runtime.sql)과 동일한 코드 체계를 사용한다. */
import type {
  SlotDef, BomItem, TechDataRow, CanvasBlock, DimensionDef,
  ProcessDef, MaterialRow, RunStep, RunOutput, RunLogEntry,
} from '../types'

// ── KOF (Specification - Fan) slot 정의 — W-04/S-1-1 ──
export const KOF_SLOTS: SlotDef[] = [
  { slot: 'A', label: 'Fan Model', values: ['KAD', 'KFD', 'KAP', 'KFS', 'ECE', 'ECB'], approved: true },
  { slot: 'B', label: 'Fan Size', values: ['350', '400', '450', '500', '560', '630', '710', '800'], approved: true },
  { slot: 'C', label: 'Material', values: ['1.EU', '2.AR', '3.TC', '4.2DC'], approved: true },
  { slot: 'D', label: 'Bearing Type', values: ['1.0505', '2.1005', '3.1010', '4.1510'], approved: true },
  { slot: 'E', label: 'FF', values: ['1.None', '2.FF'], approved: true },
  { slot: 'F', label: 'Sensor', values: ['1.Air Vol.'], approved: true },
]

// ── AHU 5 (Micron #7) 구성 모듈 — b03 캔버스 ──
export const AHU_BLOCKS: CanvasBlock[] = [
  { id: 'filter', name: 'Filter', sub: 'EFP 55·3EA', x: 36, y: 34, w: 110, h: 100 },
  { id: 'ccoil', name: 'Cooling Coil', sub: 'ECC 55·6R', x: 146, y: 34, w: 110, h: 100 },
  { id: 'sffan', name: 'SF Fan', sub: 'KAD 900 FW', x: 256, y: 34, w: 210, h: 74 },
  { id: 'mixbox', name: 'Mixing Box', sub: 'EMX 55', x: 256, y: 108, w: 210, h: 80 },
  { id: 'hcoil', name: 'Heating Coil', sub: 'EHC 55·2R', x: 36, y: 134, w: 220, h: 54 },
]

// ── BOM (슬라이드 36 축약 — 47항목 중 대표) ──
// slotValues 가 바뀌면 resolvedCode 의 상속 슬롯이 재계산된다 (code_relationship_slot_map 재현)
export interface BomTemplate {
  level: number
  mainCode: string
  name: string
  quantity: number
  priceK: number | null
  inheritSlots: string[]   // mother 에서 상속하는 slot
  fixed?: string           // 고정값 접미
}

export const BOM_TEMPLATE: BomTemplate[] = [
  { level: 1, mainCode: 'KAD 900 FW', name: 'SF Fan', quantity: 1, priceK: null, inheritSlots: ['B', 'E'] },
  { level: 2, mainCode: 'KDP 1-21', name: 'Fan 원심 Casing', quantity: 1, priceK: 2400, inheritSlots: ['B', 'E'] },
  { level: 2, mainCode: 'H 22 380', name: 'Motor', quantity: 1, priceK: 2400, inheritSlots: [], fixed: '380V' },
  { level: 1, mainCode: 'ECC 55', name: 'Cooling Coil', quantity: 1, priceK: 1180, inheritSlots: ['C'] },
  { level: 1, mainCode: 'EFP 55', name: 'Filter', quantity: 3, priceK: 420, inheritSlots: [] },
  { level: 1, mainCode: 'EHC 55', name: 'Heating Coil', quantity: 1, priceK: 960, inheritSlots: ['C'] },
  { level: 1, mainCode: 'EMX 55', name: 'Mixing Box', quantity: 1, priceK: 310, inheritSlots: [] },
  { level: 2, mainCode: 'KDP 9', name: 'Bearing Unit', quantity: 4, priceK: 96, inheritSlots: ['D'] },
]

// ── 제품 슬롯 (KDCR 3-13 · Double Deck 2) — DB 검증 verify_runtime.sql T1 과 동일 값 체계 ──
export const PRODUCT_SLOTS: SlotDef[] = [
  { slot: 'B', label: 'Size', values: ['13', '21', '32'], approved: true },
  { slot: 'C', label: 'Material', values: ['32', '45'], approved: true },
  { slot: 'E', label: 'Motor', values: ['15', '21'], approved: true },
]
export const DEFAULT_SLOT_VALUES: Record<string, string> = { B: '13', C: '32', E: '15' }

/** 완성품 Code — 인터페이스정의서 §1.5 응답 예시와 동일 규칙 */
export function finishedGoods(slotValues: Record<string, string>): string {
  return `KDCR 3-13-${slotValues.B ?? '?'}-${slotValues.E ?? '?'}`
}

/** slot_map 재현: mother slotValues 에서 상속 슬롯을 뽑아 resolvedCode 를 만든다. */
export function expandBom(slotValues: Record<string, string>): BomItem[] {
  const num = (v: string | undefined) => (v ? v.split('.')[0] : '')
  return BOM_TEMPLATE.map((t) => {
    const parts = t.inheritSlots.map((s) => num(slotValues[s])).filter(Boolean)
    const suffix = [...parts, ...(t.fixed ? [t.fixed] : [])].join('-')
    return {
      level: t.level,
      mainCode: t.mainCode,
      resolvedCode: suffix ? `${t.mainCode}-${suffix}` : t.mainCode,
      name: t.name,
      quantity: t.quantity,
      priceK: t.priceK,
      path: t.level === 1 ? `KDCR 3-13 > ${t.mainCode}` : `KDCR 3-13 > … > ${t.mainCode}`,
    }
  })
}

// ── Technical Data (W-03) ──
export const TECH_DATA: TechDataRow[] = [
  { model: '710', pd: 11, pt: 111, rpm: 1000, eff: 82, power: 40, sound: 57 },
  { model: '800', pd: 9, pt: 109, rpm: 980, eff: 84, power: 43, sound: 58 },
  { model: '900', pd: 7, pt: 107, rpm: 910, eff: 72, power: 44, sound: 59 },
  { model: '1000', pd: 6, pt: 104, rpm: 860, eff: 68, power: 47, sound: 61 },
  { model: '1120', pd: 5, pt: 101, rpm: 800, eff: 63, power: 52, sound: 63 },
]

// ── Design Editor (W-06) — Fan 원심 Casing KDCR 3-13 ──
export const DWG_BLOCKS: CanvasBlock[] = [
  { id: 'casing', name: 'Casing', x: 190, y: 60, w: 220, h: 180 },
  { id: 'impeller', name: 'Impeller', sub: 'Airfoil 900', x: 230, y: 80, w: 140, h: 100 },
  { id: 'shaft', name: 'Shaft', x: 80, y: 150, w: 440, h: 12 },
  { id: 'brgL', name: 'Brg', x: 96, y: 138, w: 26, h: 34 },
  { id: 'brgR', name: 'Brg', x: 478, y: 138, w: 26, h: 34 },
  { id: 'coneL', name: 'Inlet Cone', x: 150, y: 96, w: 40, h: 110, dashed: true },
  { id: 'coneR', name: 'Inlet Cone', x: 410, y: 96, w: 40, h: 110, dashed: true },
]

export const DWG_DIMS: DimensionDef[] = [
  { no: 'A', value: '670', binding: 'MACRO', kind: 'KEY' },
  { no: 'B', value: '=A+56', binding: 'MACRO', kind: 'KEY' },
  { no: 'C', value: '45', binding: 'VARIANT', kind: 'DETAIL' },
  { no: 'D', value: '=Table12(B,C)', binding: 'MACRO', kind: 'DETAIL' },
  { no: 'E', value: '320', binding: 'VARIANT', kind: 'DETAIL' },
  { no: 'K', value: '=A*1.62', binding: 'MACRO', kind: 'KEY' },
]

export const MACRO_CODING =
  '=IF(MC,CC>500, Table12(E,10:25,Cos2)+Var(FES,15,F3), Table12(E,10:25,Cos1))'

// ── Work Process (W-19) ──
export const PROCESS_DEF: ProcessDef = {
  process: 'Assembling', workplace: 'Work shop 3', person: 2, skill: 'H2', wtimeHr: 0.3,
}
export const PROCESS_OPTIONS = {
  process: ['Assembling', 'Welding', 'Painting', 'Packing'],
  workplace: ['Work shop 1', 'Work shop 2', 'Work shop 3'],
  skill: ['H1', 'H2', 'H3'],
}

export const MATERIAL_ROWS: MaterialRow[] = [
  { item: '560', warehouse: 'WS 1', minStock: 1, supplier: 'E2', makeBuy: 'MAKE', timeMin: 45, remarks: '' },
  { item: '630', warehouse: 'WS 1', minStock: 1, supplier: '중원', makeBuy: 'BUY', timeMin: null, remarks: '외주' },
  { item: '710', warehouse: 'WS 2', minStock: 2, supplier: 'E2', makeBuy: 'MAKE', timeMin: 52, remarks: '' },
  { item: '800', warehouse: 'WS 2', minStock: 1, supplier: '대신금속', makeBuy: 'BUY', timeMin: null, remarks: '외주 도장 포함' },
]

// ── EDIM Run 파이프라인 (b05) ──
export const RUN_STEPS: Omit<RunStep, 'status'>[] = [
  { no: 1, task: 'BOM 전개 (Code Relationship 재귀)', measured: '47 파트 · 깊이 3', elapsed: '0.8s' },
  { no: 2, task: '치수 Macro 평가 (우선순위 위상정렬)', measured: '214 식', elapsed: '12.0s' },
  { no: 3, task: '도면 생성 (승인 1 · 제작 12)', measured: '13 파일', elapsed: '2m 25s' },
  { no: 4, task: '원가·PCR (OWN/BIZ1/BIZ2)', measured: '단가 resolve 47', elapsed: '1m 40s' },
  { no: 5, task: '기술자료 생성', measured: '5건', elapsed: '55s' },
  { no: 6, task: '서류·Project Folder 저장', measured: '산출물 21', elapsed: '38s' },
]

export const RUN_OUTPUTS: RunOutput[] = [
  { folder: 'DWG', file: 'AHU5 승인도면 Rev.B', fileType: 'PDF', status: '고객승인 대기', statusTone: 'warn', nextAction: 'AP 요청' },
  { folder: 'DWG', file: '제작도면 12매 (KDCR 3-13 외)', fileType: 'DXF', status: '생성', statusTone: 'ok', nextAction: '미리보기' },
  { folder: 'PRICE', file: '견적서 QR-61216-01 · ₩23,000K', fileType: 'PDF', status: 'DRAFT', statusTone: 'info', nextAction: 'QCR 발행' },
  { folder: 'PRICE', file: 'PCR (EBIT 18.2%)', fileType: 'XLSX', status: '생성', statusTone: 'ok', nextAction: '열기' },
  { folder: 'DATA', file: '기술자료 5건 — Fan 성능·밀도 외', fileType: 'PDF', status: '생성', statusTone: 'ok' },
  { folder: 'BOM', file: 'BOM·Part List', fileType: 'XLSX', status: '생성', statusTone: 'ok', nextAction: 'ERP 전송' },
]

export const RUN_LOGS: RunLogEntry[] = [
  { time: '10:31:02', message: 'BOM expand root=KDCR 3-13 … 47 items', level: 'info' },
  { time: '10:31:15', message: 'macro eval 214/214 ✓ avg 41ms', level: 'info' },
  { time: '10:33:40', message: 'drawing compose 13 files → DWG/', level: 'info' },
  { time: '10:35:12', message: 'warn KDC 21: 재고단가 없음 → 견적단가 대체 (③→④)', level: 'warn' },
  { time: '10:38:56', message: 'PCR OWN/BIZ1/BIZ2 · quotation draft', level: 'info' },
  { time: '10:39:34', message: 'outputs 21 → Project Folder SUCCESS', level: 'info' },
]
