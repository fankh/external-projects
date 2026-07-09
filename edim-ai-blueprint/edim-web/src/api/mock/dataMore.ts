/** Toolbox·공통·CPQ 문서·Duct·권한 mock — 원천: W-07/08/11/12/15/16/17/18/22/23/24. */

// ── W-07 Macro Studio (4-Way Sync) ──
export const MACRO_META = { person: 'Kim', ver: 'KD-0.2', docNo: 'DF 342-234 E', grade: 'S-2' }
export const MACRO_PROMPT = 'SS Fan 샤프트의 길이 계산 — Table1의 선정된 Impeller를 참조하여 Table2의 casing 폭, Table3의 Bearing 폭을 찾아 각각의 길이를 더하여 Shaft 길이를 계산한다.'
export const MACRO_FORMULA = 'IF(MC>500, Table12(E,560:800,Cos2)+Var(FES,15), Table12(E,560:800,Cos1)+Var(FES,15))*PreC(1)'
export const MACRO_CODING_PY = `def shaft_length(sel):
  imp = table1.lookup(sel.impeller)
  cw  = table2.width(sel.casing)
  bw  = table3.width(sel.bearing)
  return imp + cw + bw`
export const MACRO_DESC = '[SS Fan 샤프트의 길이 계산] Table1의 선정된 Impeller를 참조하여 Table2의 선정된 casing의 폭을, Table3의 선정된 Bearing 폭을 찾아 각각의 길이를 더하여 Shaft의 길이를 계산한다.'
export const FUNCTIONS = ['IF', 'AND', 'IFERROR', 'SUM', 'LOOKUP', 'Table()', 'Var()', 'PreC()']

// ── W-08 UI Designer ──
export interface Widget { id: string; kind: string; label: string; x: number; y: number; w: number; h: number }
export const INITIAL_WIDGETS: Widget[] = [
  { id: 'w1', kind: 'PushButton', label: 'Button', x: 30, y: 26, w: 90, h: 26 },
  { id: 'w2', kind: 'ComboBox', label: 'Combo (S-2)', x: 30, y: 80, w: 110, h: 24 },
  { id: 'w3', kind: 'TableView', label: 'Table (Item·A~I)', x: 30, y: 130, w: 250, h: 110 },
  { id: 'w4', kind: 'Canvas', label: 'Canvas (그래프·도면)', x: 320, y: 130, w: 200, h: 150 },
]
export const WIDGET_PALETTE = [
  { group: 'Layouts', items: ['Vertical', 'Horizontal', 'Grid', 'Form'] },
  { group: 'Buttons', items: ['Push', 'Radio', 'Check'] },
  { group: 'Input', items: ['Combo', 'Line Edit', 'Text', 'Date'] },
  { group: 'Views', items: ['Table', 'Tree', 'List'] },
  { group: 'Containers', items: ['Frame', 'Canvas', 'Group Box'] },
]

// ── W-11 Document Management ──
export interface DocRow {
  docNo: string; title: string; person: string; date: string
  status: 'Set-up' | 'Check' | 'Approve 대기' | 'Accepted'
  approver: string; appDate: string; version: string; grade: string
}
export const DOCS: DocRow[] = [
  { docNo: 'DF 342-234 E', title: 'Density 계산서', person: 'Kim', date: '07-01', status: 'Check', approver: '-', appDate: '-', version: 'KD-0.2', grade: 'S-2' },
  { docNo: 'DF 342-235 A', title: 'Fan 성능 Report', person: 'Lee', date: '07-02', status: 'Approve 대기', approver: 'Park', appDate: '-', version: 'KD-1.0', grade: 'S-3' },
  { docNo: 'QR-61216-01', title: 'CLT 견적서', person: 'Jang', date: '06-28', status: 'Accepted', approver: 'Choi', appDate: '06-30', version: '1.1', grade: 'S-3' },
  { docNo: 'I011902', title: '승인도면 (AHU 5)', person: 'Kim', date: '06-25', status: 'Accepted', approver: 'Choi', appDate: '06-27', version: 'B', grade: 'S-1' },
  { docNo: 'DF 342-236', title: '소음 예측 계산서', person: 'Kim', date: '07-08', status: 'Set-up', approver: '-', appDate: '-', version: 'KD-0.1', grade: 'S-2' },
]

// ── W-15 Duct ──
export const DUCT_CALC = [
  { item: '압력 손실', value: '142 Pa' },
  { item: 'Leak율', value: '1.8 %' },
  { item: '온도 변화', value: '0.4 ℃' },
  { item: '결로 위험', value: '없음' },
  { item: '하중', value: '38 kg/m' },
]

// ── W-12 승인함 ──
export interface ApprovalReq {
  id: number; assetType: string; target: string; reqKind: 'CREATE' | 'UPDATE'
  requester: string; reqDate: string; stage: string; tested: boolean
}
export const APPROVAL_REQS: ApprovalReq[] = [
  { id: 1, assetType: 'Code', target: 'KOF / G: Impeller Type', reqKind: 'CREATE', requester: 'YS.Gang', reqDate: '07-06', stage: '승인', tested: false },
  { id: 2, assetType: 'Code', target: 'KDCR 3-13 ↔ KDI 21 관계', reqKind: 'UPDATE', requester: 'YS.Gang', reqDate: '07-06', stage: '검토', tested: false },
  { id: 3, assetType: '도면', target: 'KDCR 3-13 Rev.B', reqKind: 'UPDATE', requester: 'Kim', reqDate: '07-07', stage: '승인', tested: false },
  { id: 4, assetType: 'Macro', target: 'Shaft 길이 계산 v0.3', reqKind: 'CREATE', requester: 'Lee', reqDate: '07-07', stage: '검토', tested: true },
]
export const MACRO_BEFORE = 'Table12(E,10:25)+Var(FES,15,F3)'
export const APPROVAL_HIST = [
  { target: 'FDV / 480', result: '승인', date: '07-05' },
  { target: 'Print Form v2', result: '반려', date: '07-04' },
]

// ── W-22 부서 업무함 ──
export interface TaskRow {
  code: string; project: string; title: string; owner: string
  deadline: string; delayed: boolean; status: '진행' | 'TODO' | '지연' | 'DONE'
}
export const DEPT_TASKS: TaskRow[] = [
  { code: 'MR', project: 'PS-61313-5', title: 'Micron #7 제작의뢰 검토', owner: 'YS.Gang', deadline: '07-09', delayed: false, status: '진행' },
  { code: 'PL', project: 'PS-61313-5', title: 'Part List 확정', owner: 'Kim', deadline: '07-05', delayed: true, status: '지연' },
  { code: 'BOM', project: 'PS-598', title: 'BOM 재실행 (사양 변경)', owner: 'Kim', deadline: '07-11', delayed: false, status: 'TODO' },
]

// ── W-23 사용자·권한 ──
export interface UserRow {
  login: string; name: string; dept: string
  level: 'PLATFORM' | 'ADMIN' | 'SETUP' | 'GENERAL'
  role: string; status: 'ACTIVE' | 'LOCKED'
}
export const USERS: UserRow[] = [
  { login: 'ysgang', name: 'YS.Gang', dept: '기술', level: 'SETUP', role: '설계 Set-up', status: 'ACTIVE' },
  { login: 'kim01', name: 'Kim', dept: '기술', level: 'GENERAL', role: '기술 일반', status: 'ACTIVE' },
  { login: 'park.f', name: 'Park', dept: '재무', level: 'ADMIN', role: '관리자', status: 'LOCKED' },
  { login: 'lee.t', name: 'Lee', dept: '기술', level: 'GENERAL', role: '기술 일반', status: 'ACTIVE' },
  { login: 'jang.s', name: 'Jang', dept: '영업', level: 'GENERAL', role: '영업 일반', status: 'ACTIVE' },
]
export const ROLE_MATRIX = [
  { resource: 'HEAD_TAB: PLM', view: true, edit: true, approve: false, setup: false },
  { resource: 'FEATURE: S-1-* (Code)', view: true, edit: true, approve: false, setup: false },
  { resource: 'HIERARCHY: /CODE/**', view: true, edit: true, approve: false, setup: false },
  { resource: 'TABLE: Engineering', view: true, edit: true, approve: false, setup: false },
]
export const AUDIT_LOG = [
  { at: '07-07 11:02', action: 'role 변경: kim01' },
  { at: '07-07 09:41', action: 'LOCKED: park.f (5회 실패)' },
]

// ── W-24 Project Folder ──
export const FOLDERS = [
  { name: 'DWG', count: 8 }, { name: 'PRICE', count: 3 }, { name: 'DATA', count: 5 },
  { name: 'BOM', count: 2 }, { name: 'RECEIVED', count: 4 },
] as const
export interface FolderFile {
  name: string; fileType: string; kind: string; kindTone: 'ok' | 'warn' | 'info'
  run: string; date: string; folder: string
}
export const FOLDER_FILES: FolderFile[] = [
  { name: 'AHU5_approval_RevB.pdf', fileType: 'PDF', kind: '승인도', kindTone: 'ok', run: '#7', date: '07-07', folder: 'DWG' },
  { name: 'KDCR3-13_mfg.dxf', fileType: 'DXF', kind: '제작도', kindTone: 'info', run: '#7', date: '07-07', folder: 'DWG' },
  { name: 'AHU5_concept.dxf', fileType: 'DXF', kind: 'Concept', kindTone: 'warn', run: '#6', date: '07-05', folder: 'DWG' },
  { name: 'QR-61216-01.pdf', fileType: 'PDF', kind: '견적서', kindTone: 'info', run: '#7', date: '07-07', folder: 'PRICE' },
  { name: 'PCR_OWN.xlsx', fileType: 'XLSX', kind: 'PCR', kindTone: 'ok', run: '#7', date: '07-07', folder: 'PRICE' },
  { name: 'Fan_perf_variant.pdf', fileType: 'PDF', kind: '기술자료', kindTone: 'ok', run: '#7', date: '07-07', folder: 'DATA' },
  { name: 'BOM_BM21456.xlsx', fileType: 'XLSX', kind: 'BOM', kindTone: 'ok', run: '#7', date: '07-07', folder: 'BOM' },
  { name: 'Micron7_사양서_v2.xlsx', fileType: 'XLSX', kind: '접수자료', kindTone: 'info', run: '-', date: '07-07', folder: 'RECEIVED' },
]
export const SYS_HISTORY = [
  { at: '07-07 10:31', target: 'Run #7', action: 'SUCCESS (산출물 6)', by: 'system' },
  { at: '07-07 09:12', target: 'KDCR 3-13 관계', action: 'UPDATE → 승인', by: 'YS.Gang' },
  { at: '07-06 17:44', target: 'Hierarchy /CODE/FAN', action: 'MOVE (address 갱신)', by: 'admin' },
]
