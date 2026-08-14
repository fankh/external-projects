/** 목업 어댑터 — 데모 환경에서 고객사 시스템을 대체한다.
 *  실서비스 커스터마이징: 이 파일을 고객사 어댑터(REST API·DB 연계 구현)로 교체하고
 *  portal.config.ts 의 adapterId 만 바꾼다. 포털 본체 코드는 변경 없음. */
import type { AssetAdapter, ExternalAsset, HrAdapter, MessagingAdapter, PrintoutSourceRow, SecdataAdapter } from './types'
import type { Person } from '@/lib/types'

export const mockMail: MessagingAdapter = {
  async send(to, subject) {
    return { ok: true, detail: `메일 ${to.length}건 발송 — ${subject}` }
  },
}

export const mockSms: MessagingAdapter = {
  async send(to, subject) {
    return { ok: true, detail: `문자 ${to.length}건 발송 — ${subject}` }
  },
}

/** 인사·근태 목업 — 실서비스에서는 HR 시스템 인터페이스(일배치)로 대체 */
const PEOPLE: Person[] = [
  { name: '김현우', dept: '개발1팀' },
  { name: '최은영', dept: '개발1팀' },
  { name: '이수진', dept: '경영지원팀' },
  { name: '정민서', dept: '경영지원팀' },
  { name: '박정호', dept: 'IT운영팀' },
  { name: '한지원', dept: 'IT운영팀' },
  { name: '시스템관리자', dept: '정보기획팀' },
  { name: '강도윤', dept: '정보기획팀' },
]

export const mockHr: HrAdapter = {
  async fetchPeople() {
    // 테스트 전용 결함 주입 — 실 어댑터 예외(throw)·무응답(hang)에 대한 포털 내성(v1.5.16~17)
    // 검증용. 목업은 데모 대체물이므로 여기 두어도 실 고객 어댑터엔 영향 없다. 미설정 시 정상.
    if (process.env.PORTAL_FAULT_HR === 'throw') throw new Error('주입된 인사 어댑터 장애 (테스트)')
    if (process.env.PORTAL_FAULT_HR === 'hang') return new Promise<Person[]>(() => { /* 무응답 → withTimeout 이 끊는다 */ })
    // 계약 위반(resolve 된 오형) 주입 — 비배열({data,total}) 반환으로 syncHr 형태 검증·스토어 오염 방어 검증
    if (process.env.PORTAL_FAULT_HR === 'malformed') return { data: [], total: 0 } as unknown as Person[]
    return PEOPLE
  },
}

/** 자산관리시스템 목업 — 고객사 보유 자산 데이터셋과 등록번호 채번기 */
const EXTERNAL_ASSETS: ExternalAsset[] = [
  { serial: 'SN-NB-88121', model: 'ThinkPad T14 Gen5', category: '노트북', holder: '김현우', assetNo: 'AST-2025-0112' },
  { serial: 'SN-NB-88342', model: 'ThinkPad T14 Gen5', category: '노트북', holder: '최은영', assetNo: 'AST-2025-0113' },
  { serial: 'SN-MN-71011', model: 'Dell U2723QE', category: '모니터', holder: '이수진', assetNo: 'AST-2024-0871' },
  { serial: 'SN-NB-91205', model: 'Galaxy Book4 Pro', category: '노트북', holder: '정민서' },
  { serial: 'SN-SV-30018', model: 'PowerEdge R760', category: '서버', holder: 'IT운영팀' },
  { serial: 'SN-PR-55290', model: 'Sindoh D420', category: '복합기', holder: '경영지원팀' },
]

/** 보안·출력물 시스템 목업 — 전일자 출력물 자료 (실서비스: PRINTERCHASER류 DB 연계) */
const PRINTOUT_ROWS: PrintoutSourceRow[] = [
  { printedAt: '2026-08-01 09:12', name: '김현우', dept: '개발1팀', document: '고객사 정산 내역서.xlsx', pages: 4, personalInfo: true },
  { printedAt: '2026-08-01 10:41', name: '김현우', dept: '개발1팀', document: '판매 실적 보고서.pptx', pages: 12, personalInfo: false },
  { printedAt: '2026-08-01 11:02', name: '이수진', dept: '경영지원팀', document: '급여 이체 명세.xlsx', pages: 2, personalInfo: true },
  { printedAt: '2026-08-01 14:27', name: '이수진', dept: '경영지원팀', document: '사무용품 구매 품의.docx', pages: 1, personalInfo: false },
  { printedAt: '2026-08-01 16:05', name: '박정호', dept: 'IT운영팀', document: '서버 접근권한 신청서.pdf', pages: 3, personalInfo: true },
]

export const mockSecdata: SecdataAdapter = {
  async fetchPrintouts() {
    return PRINTOUT_ROWS
  },
}

let assetSeq = 230

export const mockAsset: AssetAdapter = {
  async searchAssets(query) {
    const q = query.trim()
    if (!q) return EXTERNAL_ASSETS
    return EXTERNAL_ASSETS.filter(
      (a) => a.serial.includes(q) || a.model.includes(q) || a.holder.includes(q) || (a.assetNo ?? '').includes(q),
    )
  },
  async acquireAssetNo(serial) {
    const asset = EXTERNAL_ASSETS.find((a) => a.serial === serial)
    if (!asset) throw new Error(`미확인 시리얼: ${serial}`)
    if (!asset.assetNo) {
      assetSeq += 1
      asset.assetNo = `AST-2026-${String(assetSeq).padStart(4, '0')}`
    }
    return { assetNo: asset.assetNo }
  },
}
