/** REST 메시징 어댑터 — 목업을 넘어선 실동작 구현.
 *
 *  제품안내서 §V·요구사항 기타작업: 메일은 그룹웨어(Knox) REST API, 문자는 홈페이지 서버 REST API 로
 *  발송한다. 이 어댑터는 설정된 엔드포인트로 실제 HTTP POST 를 보내고 응답을 SendResult 로 매핑한다.
 *  엔드포인트·인증·발신자는 배포 환경변수로 주입하므로(하드코딩 없음) 고객사별로 재빌드 없이 전환된다.
 *
 *  계약(registry.sendVia·conformance 와의 정합):
 *   · 수신자 0명 → 네트워크 호출 없이 { ok:true }. (자가진단이 send([]) 로 호출하므로 엔드포인트 없이도
 *     계약 통과 — 실제 발송 경로는 수신자가 있을 때만 탄다.)
 *   · 엔드포인트 미설정 → 네트워크 호출 없이 { ok:false, detail } (throw 하지 않음 — 설정 누락은 소프트 실패).
 *   · 비정상 응답(비 2xx) → { ok:false, detail: 'HTTP <status>' } (소프트 실패).
 *   · 네트워크·인증 예외 → throw. registry.sendVia 의 try/catch 가 실패 이력으로 흡수한다.
 *   · 자체 타임아웃 없음 — registry.withTimeout 이 모든 어댑터 호출을 감싼다. */
import type { ApprovalAdapter, AssetAdapter, ExternalAsset, HrAdapter, MessagingAdapter, PrintoutSourceRow, SecdataAdapter, SecMonAdapter, SecurityEvent, SendResult } from './types'
import type { Person, ViolationType } from '@/lib/types'

interface RestChannelEnv {
  /** 발송 엔드포인트 URL (예: https://knox.example/api/v1/mail) */
  urlKey: string
  /** Bearer 토큰(선택) */
  tokenKey: string
  /** 발신자 주소·번호(선택) */
  fromKey: string
  /** 발송 이력 라벨 */
  label: string
}

const MAIL_ENV: RestChannelEnv = { urlKey: 'PORTAL_MAIL_API_URL', tokenKey: 'PORTAL_MAIL_API_TOKEN', fromKey: 'PORTAL_MAIL_FROM', label: '메일' }
const SMS_ENV: RestChannelEnv = { urlKey: 'PORTAL_SMS_API_URL', tokenKey: 'PORTAL_SMS_API_TOKEN', fromKey: 'PORTAL_SMS_FROM', label: '문자' }

/** 환경변수는 호출 시점에 읽는다 — 배포·테스트가 프로세스 기동 후 주입해도 반영되도록. */
function restMessaging(cfg: RestChannelEnv): MessagingAdapter {
  return {
    async send(to: string[], subject: string): Promise<SendResult> {
      const recipients = [...new Set(to.filter((t) => typeof t === 'string' && t.trim().length > 0))]
      // 수신자 0명 — 실제 발송할 대상이 없으면 네트워크 호출 없이 성공(무발송). 자가진단 send([]) 경로.
      if (recipients.length === 0) return { ok: true, detail: `${cfg.label} 수신자 0건 — 발송 생략` }

      const url = (process.env[cfg.urlKey] ?? '').trim()
      if (!url) return { ok: false, detail: `${cfg.label} 엔드포인트 미설정 (${cfg.urlKey})` }

      const token = (process.env[cfg.tokenKey] ?? '').trim()
      const from = (process.env[cfg.fromKey] ?? '').trim()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      // 실제 HTTP POST — 네트워크·인증 예외는 throw 되어 sendVia 가 흡수한다.
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ to: recipients, subject, from }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { ok: false, detail: `${cfg.label} API HTTP ${res.status}${body ? ` — ${body.slice(0, 80)}` : ''}` }
      }
      // 응답에 수락/실패 건수가 있으면 반영(게이트웨이별 상이) — 없으면 요청 건수로 기록.
      let accepted = recipients.length
      try {
        const j = (await res.clone().json()) as { accepted?: unknown; sent?: unknown }
        const n = typeof j.accepted === 'number' ? j.accepted : typeof j.sent === 'number' ? j.sent : null
        if (n != null && Number.isFinite(n)) accepted = n
      } catch { /* 비 JSON 응답 — 요청 건수로 기록 */ }
      return { ok: true, detail: `${cfg.label} ${accepted}/${recipients.length}건 발송 (HTTP ${res.status})` }
    },
  }
}

/** 보안관제 탐지 유형 → 포털 위반 유형(ViolationType) 정규화. 고객 DLP·EDR 의 탐지 카테고리 문자열을
 *  포털 3종 위반 유형에 매핑한다. 매핑 실패 시 원문을 반환하고, 코드에 없는 유형은 secmon.ts 가 드롭한다. */
function toViolationType(raw: string): string {
  const t = raw.trim()
  if (t === '출력물 방치' || t === '화면 미잠금' || t === '인가되지 않은 USB 사용') return t
  const low = t.toLowerCase()
  if (t.includes('USB') || /usb|removable|이동식|저장장치/.test(low)) return '인가되지 않은 USB 사용' satisfies ViolationType
  if (/lock|screen|idle|잠금|미잠금|세션/.test(low)) return '화면 미잠금' satisfies ViolationType
  if (/print|출력|프린터|tray|트레이/.test(low)) return '출력물 방치' satisfies ViolationType
  return t
}

/** 보안관제(SIEM·DLP·EDR, REST) — 탐지 이벤트를 조회해 SecurityEvent 로 매핑한다(→ secmon.ts 가 보안위반
 *  자동 편입). `PORTAL_SECMON_API_URL` GET, 인증 `PORTAL_SECMON_API_TOKEN`. 고객 스키마는 통용 필드명으로
 *  매핑하고, 탐지 유형은 위반 유형으로 정규화한다. 발생일이 타임스탬프면 날짜(YYYY-MM-DD)로 절단.
 *  미설정 시 빈 배열(자가진단은 빈 배열도 계약 통과), 비정상 응답은 throw(secmon.ts try/catch 흡수). */
export const restSecmon: SecMonAdapter = {
  async fetchEvents(): Promise<SecurityEvent[]> {
    const url = (process.env.PORTAL_SECMON_API_URL ?? '').trim()
    if (!url) return []

    const token = (process.env.PORTAL_SECMON_API_TOKEN ?? '').trim()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`보안관제 API HTTP ${res.status}`)
    const rows = unwrapRows(await res.json(), 'events')
    return rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => {
        const when = pickField(r, '', ['detectedAt', 'detectedDate', 'eventDate', 'occurredAt', 'timestamp', 'ts', '발생일'])
        return {
          name: pickField(r, '', ['name', 'empName', 'userName', '성명', '사용자']),
          dept: pickField(r, '', ['dept', 'orgName', 'department', 'deptName', '부서']),
          type: toViolationType(pickField(r, '', ['type', 'category', 'eventType', 'detectionType', '유형'])) as ViolationType,
          detail: pickField(r, '', ['detail', 'message', 'description', 'desc', '내용']),
          detectedAt: when.length > 10 ? when.slice(0, 10) : when,
        }
      })
      .filter((e) => e.name && e.dept && e.type && e.detectedAt)
  },
}

/** 보안·출력물 시스템(REST) — 전일자 출력물 자료를 조회한다(→ 출력물 개인정보관리 일배치 이관 원천).
 *  `PORTAL_SECDATA_API_URL` GET, 인증 `PORTAL_SECDATA_API_TOKEN`. 고객 스키마는 통용 필드명으로 매핑하며
 *  매수(pages)는 수치·개인정보 포함(personalInfo)은 불리언으로 강제 변환한다. 미설정 시 빈 배열(자가진단
 *  통과), 비정상 응답은 throw(수집 지점 try/catch 흡수). 실 스키마가 다르면 이 매핑만 조정한다. */
export const restSecdata: SecdataAdapter = {
  async fetchPrintouts(): Promise<PrintoutSourceRow[]> {
    const url = (process.env.PORTAL_SECDATA_API_URL ?? '').trim()
    if (!url) return []

    const token = (process.env.PORTAL_SECDATA_API_TOKEN ?? '').trim()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`출력물 조회 API HTTP ${res.status}`)
    const rows = unwrapRows(await res.json(), 'printouts')
    return rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        printedAt: pickField(r, '', ['printedAt', 'printDate', 'printedTime', 'timestamp', 'ts', '출력일시']),
        name: pickField(r, '', ['name', 'empName', 'userName', '성명', '사용자']),
        dept: pickField(r, '', ['dept', 'orgName', 'department', 'deptName', '부서']),
        document: pickField(r, '', ['document', 'docName', 'fileName', 'title', '문서명']),
        pages: pickNumber(r, ['pages', 'pageCount', 'numPages', '매수', '페이지수']),
        personalInfo: pickBool(r, ['personalInfo', 'hasPii', 'pii', 'containsPii', '개인정보']),
      }))
      .filter((p) => p.printedAt && p.name && p.document)
  },
}

/** 전자결재(그룹웨어, REST) — 포털 결재 상신을 외부 그룹웨어 결재함에 푸시하고 추적 id 를 취득한다.
 *  `PORTAL_APPROVAL_API_URL` POST(`ApprovalPushDoc` → `{externalId}`), 인증 `PORTAL_APPROVAL_API_TOKEN`.
 *  자가진단 프로브(docId 가 `__probe`로 시작)는 네트워크 없이 합성 id 를 반환(실 그룹웨어 유령 결재 방지).
 *  엔드포인트 미설정 시 실 문서는 throw(푸시 지점 try/catch 가 흡수하고 다음 배치 재시도). */
export const restApproval: ApprovalAdapter = {
  async pushApproval(doc): Promise<{ externalId: string }> {
    // 자가진단 프로브 — 부작용(외부 결재 생성) 없이 계약 반환형만 확인시킨다.
    if (doc.docId.startsWith('__probe')) return { externalId: `PROBE-${doc.docId}` }

    const url = (process.env.PORTAL_APPROVAL_API_URL ?? '').trim()
    if (!url) throw new Error('전자결재 endpoint 미설정 (PORTAL_APPROVAL_API_URL)')

    const token = (process.env.PORTAL_APPROVAL_API_TOKEN ?? '').trim()
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(doc) })
    if (!res.ok) throw new Error(`전자결재 API HTTP ${res.status}`)
    const j = (await res.json()) as { externalId?: unknown; id?: unknown }
    const externalId = typeof j.externalId === 'string' ? j.externalId : typeof j.id === 'string' ? j.id : ''
    if (!externalId.trim()) throw new Error('전자결재 응답에 externalId 없음')
    return { externalId: externalId.trim() }
  },
}

/** 그룹웨어 메일(REST) — PORTAL_MAIL_API_URL 등으로 설정 */
export const restMail: MessagingAdapter = restMessaging(MAIL_ENV)

/** 문자(SMS, REST) — PORTAL_SMS_API_URL 등으로 설정 */
export const restSms: MessagingAdapter = restMessaging(SMS_ENV)

/** 부트스트랩 임직원 명단 — 실 HR 엔드포인트(PORTAL_HR_API_URL) 미설정 시의 초기 디렉터리.
 *  HRIS 연동 전 초기 구동·자가진단(계약이 비어있지 않은 Person[] 를 요구)용. 엔드포인트를 설정하면
 *  실 HR API 응답으로 대체된다(이 상수는 사용되지 않는다). */
const BOOTSTRAP_DIRECTORY: Person[] = [
  { name: '김현우', dept: '개발1팀' },
  { name: '최은영', dept: '개발1팀' },
  { name: '이수진', dept: '경영지원팀' },
  { name: '정민서', dept: '경영지원팀' },
  { name: '박정호', dept: 'IT운영팀' },
  { name: '한지원', dept: 'IT운영팀' },
  { name: '시스템관리자', dept: '정보기획팀' },
  { name: '강도윤', dept: '정보기획팀' },
]

/** 통용 후보에서 첫 수치 필드를 뽑는다(숫자·숫자문자열). 없으면 0. */
function pickNumber(row: Record<string, unknown>, candidates: string[]): number {
  for (const k of candidates) {
    const v = row[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  }
  return 0
}

/** 통용 후보에서 첫 불리언 필드를 뽑는다(불리언·'true'/'Y'/'1'). 없으면 false. */
function pickBool(row: Record<string, unknown>, candidates: string[]): boolean {
  for (const k of candidates) {
    const v = row[k]
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    if (typeof v === 'string' && v.trim()) return /^(true|y|yes|1|Y|개인정보|포함)$/i.test(v.trim())
  }
  return false
}

/** 고객 응답 행에서 필드를 뽑는다 — 명시 필드(env)가 있으면 우선, 없으면 통용 후보를 차례로. */
function pickField(row: Record<string, unknown>, explicit: string, candidates: string[]): string {
  const keys = explicit ? [explicit, ...candidates] : candidates
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

/** 인사·근태 디렉터리(REST) — 실 HR API 로 임직원 명단을 조회해 포털 Person{name,dept} 으로 매핑한다.
 *  엔드포인트·인증은 환경변수 주입: PORTAL_HR_API_URL·PORTAL_HR_API_TOKEN. 고객 스키마 필드명이 다르면
 *  PORTAL_HR_NAME_FIELD·PORTAL_HR_DEPT_FIELD 로 지정(미지정 시 name·empName·성명 / dept·orgName·부서 순 탐색).
 *  응답 봉투는 배열 또는 {employees|data|items:[...]} 를 지원한다. 미설정 시 부트스트랩 명단을 반환한다
 *  (자가진단 계약 통과). 네트워크·인증·비정상 응답은 throw 하여 syncHr 의 try/catch 가 실패로 흡수한다. */
export const restHr: HrAdapter = {
  async fetchPeople(): Promise<Person[]> {
    const url = (process.env.PORTAL_HR_API_URL ?? '').trim()
    if (!url) return BOOTSTRAP_DIRECTORY

    const token = (process.env.PORTAL_HR_API_TOKEN ?? '').trim()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`HR API HTTP ${res.status}`)
    const data = (await res.json()) as unknown
    const rows: unknown[] = Array.isArray(data) ? data
      : Array.isArray((data as { employees?: unknown[] })?.employees) ? (data as { employees: unknown[] }).employees
        : Array.isArray((data as { data?: unknown[] })?.data) ? (data as { data: unknown[] }).data
          : Array.isArray((data as { items?: unknown[] })?.items) ? (data as { items: unknown[] }).items
            : []

    const nameField = (process.env.PORTAL_HR_NAME_FIELD ?? '').trim()
    const deptField = (process.env.PORTAL_HR_DEPT_FIELD ?? '').trim()
    return rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => ({
        name: pickField(r, nameField, ['name', 'empName', 'userName', '성명', '이름']),
        dept: pickField(r, deptField, ['dept', 'orgName', 'deptName', 'department', '부서']),
      }))
      .filter((p) => p.name && p.dept)
  },
}

/** 응답 봉투에서 행 배열을 꺼낸다 — 배열 또는 {<key>|data|items:[...]} 지원. */
function unwrapRows(data: unknown, key: string): unknown[] {
  if (Array.isArray(data)) return data
  const o = data as Record<string, unknown>
  for (const k of [key, 'data', 'items']) {
    if (Array.isArray(o?.[k])) return o[k] as unknown[]
  }
  return []
}

/** 부트스트랩 자산 목록 — 실 자산 엔드포인트(PORTAL_ASSET_API_URL) 미설정 시의 데모 인벤토리.
 *  자산관리시스템 연동 전 초기 구동용. 모두 미등록(assetNo 없음)이라 자가진단의 취득 경로를 건드리지 않는다
 *  (등록 자산이 있으면 conformance 가 acquireAssetNo 를 호출하는데 등록 엔드포인트 미설정 시 throw 되므로). */
const BOOTSTRAP_ASSETS: ExternalAsset[] = [
  { serial: 'SN-DEMO-0001', model: 'ThinkPad T14 Gen5', category: '노트북', holder: '김현우' },
  { serial: 'SN-DEMO-0002', model: 'PowerEdge R760', category: '서버', holder: 'IT운영팀' },
  { serial: 'SN-DEMO-0003', model: 'Dell U2723QE', category: '모니터', holder: '이수진' },
]

/** 자산관리시스템(REST) — 자산 조회 + 신규 자산등록번호 취득(쓰기 폐쇄 루프).
 *  조회는 `PORTAL_ASSET_API_URL` GET(`?q=`), 취득은 `PORTAL_ASSET_REGISTER_URL` POST(`{serial}` → `{assetNo}`).
 *  인증은 `PORTAL_ASSET_API_TOKEN`(Bearer). 고객 스키마는 통용 필드명으로 매핑(serial·sn / model / category·type /
 *  holder·owner / assetNo?). 조회 엔드포인트 미설정 시 빈 배열(자가진단은 빈 배열도 계약 통과). 네트워크·인증·
 *  비정상 응답은 throw — 조회는 화면의 `.catch(()=>[])`, 취득은 acquire 액션의 try/catch 가 흡수한다. */
export const restAsset: AssetAdapter = {
  async searchAssets(query: string): Promise<ExternalAsset[]> {
    const url = (process.env.PORTAL_ASSET_API_URL ?? '').trim()
    if (!url) {
      const q = (query ?? '').trim()
      return q ? BOOTSTRAP_ASSETS.filter((a) => a.serial.includes(q) || a.model.includes(q) || a.holder.includes(q)) : BOOTSTRAP_ASSETS
    }

    const token = (process.env.PORTAL_ASSET_API_TOKEN ?? '').trim()
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const sep = url.includes('?') ? '&' : '?'
    const res = await fetch(`${url}${sep}q=${encodeURIComponent(query ?? '')}`, { headers })
    if (!res.ok) throw new Error(`자산 조회 API HTTP ${res.status}`)
    const rows = unwrapRows(await res.json(), 'assets')
    return rows
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r) => {
        const assetNo = pickField(r, '', ['assetNo', 'assetNumber', 'registrationNo', 'assetRegNo'])
        const asset: ExternalAsset = {
          serial: pickField(r, '', ['serial', 'sn', 'serialNo', 'assetTag']),
          model: pickField(r, '', ['model', 'modelName', 'modelNm']),
          category: pickField(r, '', ['category', 'type', 'assetType', 'categoryName']),
          holder: pickField(r, '', ['holder', 'owner', 'user', 'userName', 'holderName']),
        }
        return assetNo ? { ...asset, assetNo } : asset
      })
      .filter((a) => a.serial && a.model && a.category && a.holder)
  },

  async acquireAssetNo(serial: string): Promise<{ assetNo: string }> {
    const url = (process.env.PORTAL_ASSET_REGISTER_URL ?? '').trim()
    if (!url) throw new Error('자산등록 endpoint 미설정 (PORTAL_ASSET_REGISTER_URL)')

    const token = (process.env.PORTAL_ASSET_API_TOKEN ?? '').trim()
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ serial }) })
    if (!res.ok) throw new Error(`자산등록 API HTTP ${res.status}`)
    const j = (await res.json()) as { assetNo?: unknown; assetNumber?: unknown }
    const assetNo = typeof j.assetNo === 'string' ? j.assetNo : typeof j.assetNumber === 'string' ? j.assetNumber : ''
    if (!assetNo.trim()) throw new Error('자산등록 응답에 assetNo 없음')
    return { assetNo: assetNo.trim() }
  },
}
