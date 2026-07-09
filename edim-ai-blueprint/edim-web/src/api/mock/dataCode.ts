/** Code(TLM) Set-up mock — 원천: W-04(슬라이드 33)·W-05(슬라이드 36)·W-20(슬라이드 66). */

// ── S-1-1 Sub Code 등록 — Registered Code Table (Group KOF) ──
export interface SubCodeSlot {
  slot: string
  label: string
  values: string
  count: number
  status: 'APPROVED' | 'PENDING'
}

export const KOF_TABLE: SubCodeSlot[] = [
  { slot: 'A', label: 'Fan Model', values: 'KAD · KFD · KAP · KFS · ECE · ECB', count: 6, status: 'APPROVED' },
  { slot: 'B', label: 'Fan Size', values: '350 400 450 500 560 630 710 800', count: 8, status: 'APPROVED' },
  { slot: 'C', label: 'Material', values: '1.EU 2.AR 3.TC 4.2DC', count: 4, status: 'APPROVED' },
  { slot: 'D', label: 'Bearing Type', values: '1.0505 2.1005 3.1010 4.1510', count: 4, status: 'APPROVED' },
  { slot: 'E', label: 'FF', values: '1.None 2.FF', count: 2, status: 'APPROVED' },
  { slot: 'F', label: 'Sensor', values: '1.Air Vol.', count: 1, status: 'APPROVED' },
]

// ── S-1-4 Code Relationship — Mother KDCR 3-13 + Child Group ──
export interface ChildDef {
  code: string
  desc: string
  qty: number
  remarks: string
  /** resolved 코드 생성 템플릿 — {B}/{C}/{E} 가 Mother slot 값으로 치환 (slot_map) */
  template: string
}

export const MOTHER = {
  code: 'KDCR 3-13',
  desc: 'Double Suction casing with reinforced frame',
  slots: [
    { slot: 'A', label: 'Fan Model', values: 'KAD · KFD' },
    { slot: 'B', label: 'Fan Size', values: '350~800' },
    { slot: 'C', label: 'Material', values: 'Gal. CU AL 316 FRP' },
    { slot: 'D', label: 'Bearing', values: 'Ball · Roller' },
    { slot: 'E', label: 'Air Vol.', values: '-' },
    { slot: 'F', label: 'FF', values: 'None · FF' },
  ],
}

export const CHILD_GROUP: ChildDef[] = [
  { code: 'KDP 1-21', desc: 'Fan bearing Frame', qty: 1, remarks: 'Reverse Bending R', template: 'KDP 1-21-{B}-{E}' },
  { code: 'KDP 1-22', desc: 'Fan bearing Frame', qty: 1, remarks: 'Reverse Bending L', template: 'KDP 1-22-{B}-1' },
  { code: 'KDC 1', desc: 'Casing', qty: 1, remarks: 'Pittsburgh seaming', template: 'KDC 1-{C}-1-{E}' },
  { code: 'KDC 20', desc: 'Inlet-Cone', qty: 2, remarks: 'With FF', template: 'KDC 20-{B}-{E}' },
  { code: 'KDC 21', desc: 'Inlet-Cone', qty: 2, remarks: 'W/O FF', template: 'KDC 21-{B}' },
]

export interface RunningTestRow {
  no: string
  name: string
  desc: string
  qty: number
  remarks: string
}

/** Running Test — Mother slot 조합으로 Child 전량 전개 (CODE-009).
 *  기본값 B=13·C=32·E=15 → W-05/검증 SQL 과 동일한 KDP 1-21-13-15 산출. */
export function runningTest(
  slotValues: Record<string, string>, checkedCodes: Set<string>,
): RunningTestRow[] {
  const fill = (t: string) => t.replaceAll('{B}', slotValues.B ?? '?')
    .replaceAll('{C}', slotValues.C ?? '?').replaceAll('{E}', slotValues.E ?? '?')
  const main: RunningTestRow = {
    no: 'Main', name: fill('KDC 3-13-{C}-22-{E}-1'),
    desc: MOTHER.desc, qty: 1, remarks: '',
  }
  const children = CHILD_GROUP.filter((c) => checkedCodes.has(c.code)).map((c, i) => ({
    no: String(i + 1), name: fill(c.template), desc: c.desc, qty: c.qty, remarks: c.remarks,
  }))
  return [main, ...children]
}

// ── M-3-7 데이터 Table 관리 (Table12 · Variant) ──
export interface TableRow {
  key: string
  cols: (number | null)[]   // A~E
  remarks: string
}

export const TABLE12 = {
  name: 'Table12',
  type: 'Variant',
  department: 'Engineering',
  address: '/T/ENG/VARIANT/Table12',
  rowDef: 'Key: Size · 열: A~E',
  columns: ['A', 'B', 'C', 'D', 'E'],
  refMacros: [
    { macro: 'MC-CAS-04', usage: 'Table12(E,10:25,Cos2)', screen: 'Design Editor' },
    { macro: 'MC-DIM-11', usage: 'Table12(B,C)', screen: 'Design Editor' },
    { macro: 'MC-CST-02', usage: 'Table12(A,560:800)', screen: 'Pricing Run' },
    { macro: 'MC-TEC-07', usage: 'Table12(C,*)', screen: '기술 데이터' },
  ],
}

export const TABLE12_ROWS: TableRow[] = [
  { key: '560', cols: [55, 45, 9, null, 656], remarks: '' },
  { key: '630', cols: [32, 45, 11, null, 656], remarks: '' },
  { key: '710', cols: [679, 760, 45, 700, 656], remarks: '' },
  { key: '800', cols: [721, 806, 45, 760, 702], remarks: '' },
]
