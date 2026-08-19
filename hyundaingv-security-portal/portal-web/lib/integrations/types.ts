/** 연동 어댑터 계약 — 제품안내서 §V 시스템 연동 아키텍처의 추상화.
 *  포털 본체는 이 인터페이스만 알고, 고객사별 구현(그룹웨어·인사·자산·보안 시스템)은
 *  어댑터로 캡슐화한다. 목업 어댑터(mock.ts)를 고객사 어댑터로 교체하는 것이 커스터마이징이다. */
import type { Person, ViolationType } from '@/lib/types'

export type ChannelKind = 'mail' | 'sms' | 'approval' | 'sso' | 'hr' | 'asset' | 'secdata' | 'secmon'

/** 고객사 브랜딩 — 프로필이 공급하고 셸(타이틀바·상태바)·로그인 화면이 소비한다 */
export interface PortalBrand {
  customer: string
  productName: string
  productSub: string
  version: string
}

/** portal.config.ts 의 채널 바인딩 — 고객사 프로필이 채널을 어댑터에 연결한다 */
export interface ChannelBinding {
  id: string
  kind: ChannelKind
  name: string
  transport: 'REST API' | 'SAML' | 'DB 연계' | '인터페이스'
  usage: string
  adapterId: string
  enabledByDefault: boolean
  /** 실구현 예정 채널 — 화면에 '연동 예정'으로 표시되고 활성 집계·토글에서 제외된다 */
  planned?: boolean
}

export interface SendResult {
  ok: boolean
  detail: string
}

/** 메일·문자 발송 (그룹웨어 메일 · 홈페이지 서버 SMS) */
export interface MessagingAdapter {
  send(to: string[], subject: string): Promise<SendResult>
}

/** 인사·근태 — 사용자 기본정보 동기화 (서약 대상·권한 판별 기준) */
export interface HrAdapter {
  fetchPeople(): Promise<Person[]>
}

/** 외부 전자결재(그룹웨어) 상신 대상 — 포털 결재 문서를 그룹웨어 결재함에 등록할 때 넘긴다 */
export interface ApprovalPushDoc {
  docId: string
  docType: string
  title: string
  drafter: string
  approver: string
  submittedAt: string
}

/** 전자결재(그룹웨어) — 포털 결재 상신을 외부 그룹웨어 결재함에 푸시하고 추적 id 를 취득한다.
 *  결재 자체는 그룹웨어에서 확인·처리하고(요구사항: "결재는 그룹웨어에서 확인"), 포털은 연동 id 로 상태를 잇는다.
 *  자가진단 안전 — docId 가 `__probe` 로 시작하면 어댑터는 네트워크 호출 없이 합성 id 를 반환해야 한다
 *  (푸시는 외부 시스템에 부작용을 남기므로, 자가진단이 실 그룹웨어에 유령 결재를 만들지 않게 한다). */
export interface ApprovalAdapter {
  pushApproval(doc: ApprovalPushDoc): Promise<{ externalId: string }>
}

/** 자산관리시스템 — 자산 조회·신규 자산등록번호 취득 (REST API) */
export interface ExternalAsset {
  serial: string
  model: string
  category: string
  holder: string
  /** 자산관리시스템에 이미 등록된 자산이면 등록번호 보유 */
  assetNo?: string
}

export interface AssetAdapter {
  searchAssets(query: string): Promise<ExternalAsset[]>
  /** 신규 자산 자료를 전송하고 자산등록번호를 취득한다 (IT포털 → 자산관리시스템) */
  acquireAssetNo(serial: string): Promise<{ assetNo: string }>
}

/** 보안·출력물 시스템 — DB 연계 자료 조회 (출력물 개인정보관리 일배치 이관 원천) */
export interface PrintoutSourceRow {
  printedAt: string
  name: string
  dept: string
  document: string
  pages: number
  personalInfo: boolean
}

export interface SecdataAdapter {
  /** 전일자 출력물 자료 조회 — 결재 등 조건 적용된 이관 대상 (요구사항: 일배치 이관) */
  fetchPrintouts(): Promise<PrintoutSourceRow[]>
}

/** 보안관제(DLP·EDR·UEBA) 탐지 이벤트 — 보안위반으로 자동 등록되는 원천.
 *  탐지 유형은 포털 보안위반 유형(ViolationType)에 매핑된다(출력물 방치·화면 미잠금·USB 사용). */
export interface SecurityEvent {
  name: string
  dept: string
  type: ViolationType
  detail: string
  /** 탐지 일자(YYYY-MM-DD) — 위반 발생일이자 중복 이관 방지 키의 일부 */
  detectedAt: string
}

/** 보안관제 시스템 — 탐지 이벤트 조회 (탐지 → 보안위반 자동 등록). 제품안내서 §V '보안 시스템' 연동. */
export interface SecMonAdapter {
  fetchEvents(): Promise<SecurityEvent[]>
}

/** 어댑터 묶음 — registry 가 adapterId 로 해석한다 */
export interface AdapterSet {
  mail?: MessagingAdapter
  sms?: MessagingAdapter
  approval?: ApprovalAdapter
  hr?: HrAdapter
  asset?: AssetAdapter
  secdata?: SecdataAdapter
  secmon?: SecMonAdapter
}
