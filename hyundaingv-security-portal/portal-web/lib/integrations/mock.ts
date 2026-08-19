/** 목업 어댑터 — 데모 환경에서 고객사 시스템을 대체한다.
 *  실서비스 커스터마이징: 이 파일을 고객사 어댑터(REST API·DB 연계 구현)로 교체하고
 *  portal.config.ts 의 adapterId 만 바꾼다. 포털 본체 코드는 변경 없음. */
import type { ApprovalAdapter, AssetAdapter, ExternalAsset, HrAdapter, MessagingAdapter, PrintoutSourceRow, SecdataAdapter, SecMonAdapter, SecurityEvent } from './types'
import type { Person } from '@/lib/types'

export const mockMail: MessagingAdapter = {
  async send(to, subject) {
    // 계약 위반(SendResult 아님) 주입 — undefined resolve 로 sendVia 의 result.ok 접근 방어 검증
    if (process.env.PORTAL_FAULT_MAIL === 'malformed') return undefined as unknown as { ok: boolean; detail: string }
    return { ok: true, detail: `메일 ${to.length}건 발송 — ${subject}` }
  },
}

export const mockSms: MessagingAdapter = {
  async send(to, subject) {
    return { ok: true, detail: `문자 ${to.length}건 발송 — ${subject}` }
  },
}

/** 전자결재(그룹웨어) 목업 — 데모에서 외부 그룹웨어 결재함 등록을 흉내내 합성 추적 id 를 반환한다.
 *  실서비스에서는 restApproval(REST 푸시)로 교체한다. */
export const mockApproval: ApprovalAdapter = {
  async pushApproval(doc) {
    return { externalId: `KNOX-${doc.docId}` }
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
    // 계약 위반(오형 행) 주입 — 필수 문자열(name·document·printedAt) 누락 행으로 importDaily 수집 검증
    if (process.env.PORTAL_FAULT_SECDATA === 'malformed') return [{ pages: 3 } as unknown as PrintoutSourceRow]
    // 계약 위반(dept·pages 객체값) 주입 — 유효 name/document/printedAt + 객체 pages/dept 로 {p.pages}/{p.dept}
    // 직접 렌더의 React child 500 방지(dept·pages 형태검증) 검증
    if (process.env.PORTAL_FAULT_SECDATA === 'badfield') return [{ printedAt: '2026-08-14 09:00', name: '김현우', document: '급여명세.xlsx', dept: {}, pages: {}, personalInfo: true } as unknown as PrintoutSourceRow]
    return PRINTOUT_ROWS
  },
}

/** 보안관제(DLP·EDR) 목업 — 탐지 이벤트 (실서비스: SIEM·DLP·EDR REST API 연계). 탐지 유형은 보안위반 유형에 매핑. */
const SECURITY_EVENTS: SecurityEvent[] = [
  { name: '김현우', dept: '개발1팀', type: '인가되지 않은 USB 사용', detail: 'DLP: 미등록 USB 저장장치 쓰기 시도 차단 (PC-KHW-01)', detectedAt: '2026-08-18' },
  { name: '이수진', dept: '경영지원팀', type: '화면 미잠금', detail: 'EDR: 30분 이상 세션 미잠금 상태 방치 감지 (PC-LSJ-02)', detectedAt: '2026-08-18' },
  { name: '박정호', dept: 'IT운영팀', type: '출력물 방치', detail: 'DLP: 개인정보 포함 출력물 프린터 트레이 장시간 방치 (PRN-3F)', detectedAt: '2026-08-18' },
]

export const mockSecmon: SecMonAdapter = {
  async fetchEvents() {
    // 테스트 결함 주입 — 실 어댑터 예외·무응답 내성(secdata·hr 와 동일 계열). 미설정 시 정상.
    if (process.env.PORTAL_FAULT_SECMON === 'throw') throw new Error('주입된 보안관제 어댑터 장애 (테스트)')
    if (process.env.PORTAL_FAULT_SECMON === 'hang') return new Promise<SecurityEvent[]>(() => { /* 무응답 → withTimeout 이 끊는다 */ })
    // 계약 위반(오형 행) 주입 — 필수 문자열(name·type·detectedAt) 누락으로 import 수집 형태검증 검증
    if (process.env.PORTAL_FAULT_SECMON === 'malformed') return [{ detail: 'no name' } as unknown as SecurityEvent]
    // 계약 위반(미정의 유형) 주입 — ViolationType 아닌 type 으로 코드 매핑 방어(유효 유형만 등록) 검증
    if (process.env.PORTAL_FAULT_SECMON === 'badtype') return [{ name: '김현우', dept: '개발1팀', type: '알수없는유형' as SecurityEvent['type'], detail: 'x', detectedAt: '2026-08-18' }]
    return SECURITY_EVENTS
  },
}

let assetSeq = 230

export const mockAsset: AssetAdapter = {
  async searchAssets(query) {
    // 계약 위반(비배열 REST 봉투) 주입 — {data,total} 반환으로 assets.filter/.map 500 방어(수집 형태검증) 검증
    if (process.env.PORTAL_FAULT_ASSET === 'malformed') return { data: [], total: 0 } as unknown as ExternalAsset[]
    // 계약 위반(assetNo 객체값) 주입 — {a.assetNo} 직접 렌더가 React child 500 나지 않는지(assetNo 형태검증) 검증
    if (process.env.PORTAL_FAULT_ASSET === 'badfield') return [{ serial: 'SN-BAD-1', model: 'ThinkPad', category: '노트북', holder: '김현우', assetNo: {} }] as unknown as ExternalAsset[]
    const q = query.trim()
    if (!q) return EXTERNAL_ASSETS
    return EXTERNAL_ASSETS.filter(
      (a) => a.serial.includes(q) || a.model.includes(q) || a.holder.includes(q) || (a.assetNo ?? '').includes(q),
    )
  },
  async acquireAssetNo(serial) {
    // 계약 위반(assetNo 누락) 주입 — {} 반환으로 빈 등록번호 저장·재시도 차단 방어(수집 형태검증) 검증
    if (process.env.PORTAL_FAULT_ASSET === 'malformed') return {} as unknown as { assetNo: string }
    const asset = EXTERNAL_ASSETS.find((a) => a.serial === serial)
    if (!asset) throw new Error(`미확인 시리얼: ${serial}`)
    if (!asset.assetNo) {
      assetSeq += 1
      asset.assetNo = `AST-2026-${String(assetSeq).padStart(4, '0')}`
    }
    return { assetNo: asset.assetNo }
  },
}
