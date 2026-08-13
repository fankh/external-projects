/** 도메인 타입 — 제품안내서(AI 기반 IT 자산관리 시스템)의 데이터 모델 */

export type Role = 'USER' | 'ASSET_MGR' | 'SEC_MGR' | 'ADMIN'

export const ROLE_LABEL: Record<Role, string> = {
  USER: '사용자',
  ASSET_MGR: '자산담당',
  SEC_MGR: '보안담당',
  ADMIN: 'Admin',
}

export type AssetCategory = '단말' | '서버' | '네트워크' | '주변기기' | 'SW' | '가상자원'
export const ASSET_CATEGORIES: AssetCategory[] = ['단말', '서버', '네트워크', '주변기기', 'SW', '가상자원']

/** 수명주기 5단계 (도입·검수 → 등록 → 운영·이동 → 반납·유휴 → 폐기) */
export type AssetStatus = '검수중' | '사용중' | '유휴' | '대여중' | '반납대기' | '수리중' | '분실' | '폐기예정' | '폐기완료'

export interface AssetHistoryItem {
  date: string
  kind: '등록' | '불출' | '이동' | '구성변경' | '점검' | '반납' | '폐기' | '편입' | '보증연장' | '수리' | '분실' | '대여'
  detail: string
  actor: string
}

export interface Asset {
  assetNo: string
  category: AssetCategory
  model: string
  serial: string
  status: AssetStatus
  owner: string
  dept: string
  location: string
  os?: string
  cpu?: string
  memory?: string
  ip?: string
  mac?: string
  purchaseDate: string
  warrantyEnd: string
  /** 취득가(원) — 자산 단위 취득 원가. 미입력 시 유형 표준 단가(lib/cost)로 대체. TCO·감가상각의 기준. */
  acquisitionCost?: number
  contractId?: string
  /** Discovery 편입 자산이면 최초 발견 채널 */
  discoveredVia?: string
  /** 최근 실측 확인일 — 재물조사 실사 스캔으로 실물이 확인된 마지막 날. 미설정이면 실측 이력 없음.
   *  STALE_VERIFY_DAYS 초과·미설정이면 '장기 미실측'(유령 자산 후보)으로 드러난다. */
  lastVerifiedAt?: string
  /** 대여(반출) 자산의 반환 기한 — 상태가 '대여중'일 때만 유효. 기한 경과 시 연체로 드러난다. */
  loanDueDate?: string
  /** 수리 의뢰 정보 — 상태가 '수리중'이고 외부 수리 의뢰가 접수됐을 때. 수리 완료·불가 시 이력에 실비를 남기고 해제한다. (제품안내서 §03 유지보수) */
  repair?: { vendor: string; sentAt: string; eta?: string; estCost?: number }
  /** 수리·유지보수 비용 이력 — 외부 수리 완료 시 실비를 구조적으로 누적한다(자유 이력 텍스트와 달리 자산 TCO 집계·현황에 쓰인다).
   *  계약의 ContractCost(계약 단위 비용 이력)와 대칭인 자산 단위 비용 이력. (제품안내서 §03 유지보수: 비용 이력) */
  repairCosts?: AssetRepairCost[]
  history: AssetHistoryItem[]
}

/** 자산 단위 수리 비용 이력 항목 — 외부 수리 완료 시 실비를 남긴다. */
export interface AssetRepairCost {
  id: string
  date: string
  vendor: string
  /** 수리 내용 — 예: 메인보드 교체, 액정 교체, 긴급 출동 */
  item: string
  amount: number
  by: string
}

/** 최근 실측 확인이 이 일수를 넘거나 아예 없으면 '장기 미실측'(유령 자산 후보)으로 본다.
 *  재물조사 주기(반기)를 고려한 값 — 반기 조사를 한 번 거르면 드러난다. */
export const STALE_VERIFY_DAYS = 180

/** Discovery 6종 탐지 채널 */
export type Channel =
  | '네트워크 능동 스캔'
  | '패시브 트래픽'
  | 'DNS·프록시 로그'
  | 'EDR·엔드포인트'
  | '클라우드 API'
  | 'AD/IdP·SSO 로그'

export const CHANNELS: Channel[] = [
  '네트워크 능동 스캔',
  '패시브 트래픽',
  'DNS·프록시 로그',
  'EDR·엔드포인트',
  '클라우드 API',
  'AD/IdP·SSO 로그',
]

/** CMDB 대사 결과 4상태 */
export type ReconcileState = '등록·일치' | '등록·불일치' | '미등록' | '미확인'
export const RECONCILE_STATES: ReconcileState[] = ['등록·일치', '등록·불일치', '미등록', '미확인']

export type RiskLevel = '높음' | '중간' | '낮음'

/** 채널별 원시 관측 — 6종 채널이 각자 본 것. 같은 장비를 여러 채널이 보므로
 *  자산 지문으로 병합해야 발견 목록이 중복으로 부풀지 않는다 (제품안내서 §04 정규화·병합). */
export interface ChannelObservation {
  id: string
  /** 병합된 발견 자산 */
  discoveredId: string
  channel: Channel
  hostname: string
  ip: string
  mac: string
  seenAt: string
  detail: string
}

/** 자산 지문 — 병합 키. MAC 이 있으면 MAC 우선, 없으면 호스트명, 그것도 없으면 IP.
 *  클라우드 리소스처럼 MAC 이 없는 자산이 있어 단일 키로는 병합이 되지 않는다. */
export function fingerprintOf(o: { mac: string; hostname: string; ip: string }): string {
  if (o.mac && o.mac !== '-') return `MAC:${o.mac.toUpperCase()}`
  if (o.hostname && o.hostname !== '-') return `HOST:${o.hostname.toLowerCase()}`
  return `IP:${o.ip}`
}

export interface DiscoveredAsset {
  id: string
  /** 병합 키 — 같은 지문의 관측은 한 건으로 합쳐진다 */
  fingerprint?: string
  hostname: string
  ip: string
  mac: string
  channel: Channel
  type: string
  firstSeen: string
  lastSeen: string
  state: ReconcileState
  risk: RiskLevel
  matchedAssetNo?: string
  mismatch?: string
  ownerCandidate?: string
  note?: string
  /** 처리 상태 — 확인요청은 편입/격리 앞단의 소유자 확인 단계 (제품안내서 그림 3) */
  action?: '확인요청' | '편입요청' | '격리요청' | '편입완료' | '격리완료'
  /** 소유자 확인 요청 발송일 — 기한 내 무응답 시 격리 에스컬레이션의 기준 */
  confirmRequestedAt?: string
  /** 소유자 확인 결과 */
  ownerAnswer?: '본인 자산' | '본인 자산 아님'
}

/** 소유자 확인 요청의 응답 기한(일). 경과 시 격리 요청으로 에스컬레이션한다.
 *  서버액션 모듈('use server')은 async 함수만 export 할 수 있어 정책 상수는 여기에 둔다. */
export const CONFIRM_DEADLINE_DAYS = 7

/** 만료 임박 알림 대상 기준(일) — 계약·보증·라이선스 공통 */
export const EXPIRY_WINDOW_DAYS = 90

/** 알림 발송 이력 — 소유자 확인 요청·만료 임박·격리 통보는 이메일·문자로 나가고 이력이 남는다
 *  (제품안내서 §06 연동: 그룹웨어 — SSO·결재·알림 메일) */
export interface Dispatch {
  id: string
  at: string
  channel: '이메일' | '문자'
  to: string
  subject: string
  kind: '소유자 확인' | '만료 임박' | '격리 통보' | '에스컬레이션' | '리포트 배포' | '위협 대응' | '입고 반려' | '계약 해지' | '공지 독촉' | '결재 결과' | '대여 독촉' | 'QnA 답변' | 'QnA 접수' | '자산 불출' | '자산 이동' | '반납 접수' | 'MFA 등록 요구'
  ref?: string
}

export interface Contract {
  id: string
  kind: '구매' | '유지보수'
  name: string
  vendor: string
  start: string
  end: string
  amount: number
  assetCount: number
  ownerDept: string
  /** 계약 상태 — 미설정/유효는 진행 중, 해지는 조기 종료(만료 임박 집계·알림에서 제외) */
  status?: '유효' | '해지'
  /** 해지 확정일 */
  terminatedAt?: string
  /** 부속서류 — 계약서·견적서·세금계산서·보증서 등 근거 문서 목록 (제품안내서 §03 구매 계약: 부속서류 관리) */
  documents?: ContractDoc[]
  /** SLA — 유지보수 계약의 서비스 수준 협약(장애 대응 시간·가동률 등). 제품안내서 §03 유지보수 계약: SLA 관리 */
  sla?: string
  /** 비용 이력 — 유지보수 계약의 정기·수시 지출 기록. 제품안내서 §03 유지보수 계약: 비용 이력 */
  costs?: ContractCost[]
  /** 갱신 이력 — 계약 기간 연장 기록(이전 만료일→새 만료일). 계약 카드·상세에서 계약 생애주기(등록→갱신×N→만료/해지) 추적 */
  renewals?: Renewal[]
}

export interface Renewal {
  date: string
  from: string
  to: string
  termYears: number
  by: string
}

export interface ContractCost {
  id: string
  date: string
  /** 항목 — 예: 정기 유지보수료 3Q, 부품 교체(HDD), 긴급 출동 */
  item: string
  amount: number
  addedBy: string
}

/** 계약 부속서류 유형 — 실제 파일 저장은 범위 밖이므로 문서 메타데이터(이름·유형·등록자·등록일)만 관리한다 */
export const CONTRACT_DOC_TYPES = ['계약서', '견적서', '발주서', '세금계산서', '보증서', '부속합의서', '기타'] as const
export type ContractDocType = (typeof CONTRACT_DOC_TYPES)[number]

export interface ContractDoc {
  id: string
  name: string
  docType: ContractDocType
  addedAt: string
  addedBy: string
}

export interface SwLicense {
  id: string
  name: string
  vendor: string
  purchased: number
  used: number
  expiry: string
  unitCost: number
  /** 갱신 이력 — 라이선스 만료일 연장 기록(계약 갱신과 동형). 라이선스 카드에서 구독 기간 변천 추적 */
  renewals?: Renewal[]
  /** 상태 — '해지'(구독 중단·도구 이관)면 만료 임박 집계·알림·컴플라이언스 판정에서 제외. undefined=유효 */
  status?: '유효' | '해지'
  terminatedAt?: string
  /** 근거 계약 — 라이선스를 구매·구독한 계약(CT-*). 라이선스↔계약 추적성. 미연계면 계약 없는 구독(추적 밖). */
  contractId?: string
}

export type ApprovalKind = '자산 신청' | '반납' | '이동' | '대여' | '폐기' | '소유자 확인' | '격리 요청' | '차이 조정' | 'SaaS 인가'
export type ApprovalStatus = '대기' | '승인' | '반려' | '취소'

/** 제품안내서가 필수 결재로 규정한 종류 — 폐기·격리·편입(소유자 확인)·차이 조정.
 *  결재선 화면에서 '선택'으로 내릴 수 없도록 고정한다(§03·§04 통제 우회 방지). */
export const MANDATORY_APPROVAL_KINDS: ApprovalKind[] = ['폐기', '격리 요청', '소유자 확인', '차이 조정']

/** 결재선 단계 → 결재 권한그룹 매핑. 다단계 결재선 집행에 쓴다.
 *  부서장 = 요청자 부서장 → 4-역할 모델에선 ADMIN 으로 근사(제품 결정). IT기획팀장도 ADMIN. */
export const APPROVAL_STEP_ROLE: Record<string, Role> = {
  '부서장': 'ADMIN',
  '자산담당': 'ASSET_MGR',
  'IT기획팀장': 'ADMIN',
  '보안담당': 'SEC_MGR',
}

/** currentStep 표기(예: '자산담당 검토'·'보안담당 승인'·'IT기획팀장 결재'·'부서 확인')에서 단계 라벨을 뽑는다. */
export function approvalStepLabel(currentStep: string): string {
  const s = currentStep.replace(/\s*(검토|승인|결재|확인)\s*$/, '').trim()
  return s === '부서' ? '부서장' : s
}

/** 결재선 steps 에서 사람 승인 단계만 남긴 라우트 (신청자·자동 단계 제외). */
export function approvalRoute(steps: string[]): string[] {
  return steps.filter((st) => st !== '신청자' && st !== 'Discovery 엔진')
}

export interface Approval {
  id: string
  kind: ApprovalKind
  title: string
  requester: string
  dept: string
  requestedAt: string
  status: ApprovalStatus
  currentStep: string
  refId?: string
  decidedAt?: string
  decidedBy?: string
  /** 신청 사유 — 상신 시 신청자가 입력 */
  note?: string
  /** 이동 신청의 목적지 — 이동 처리 시 대장 위치에 반영된다 */
  targetLocation?: string
  /** SaaS 인가 요청의 대상 서비스명 — 승인 시 카탈로그 인가(sanctioned) 반영·미등재면 사전 등재 */
  saasService?: string
  /** 승인 후 자산담당이 실제 불출·이동을 집행했는지. 결재 승인만으로는 실물이 움직이지 않는다 */
  fulfilled?: boolean
  /** 반려 사유 — 반려 시 필수 입력. 신청자 재상신 근거이자 감사 기록 (AI 제안 반려와 동일 원칙) */
  rejectReason?: string
  /** 재상신 완료 표시 — 반려 건을 재상신하면 원 건에 세워, 대시보드 '재상신 검토' 넛지에서 빠진다(중복 독촉 방지) */
  resubmitted?: boolean
  /** 결재 첨부 리포트 — 근거 문서로 첨부한 생성 리포트(GeneratedReport) ID. 결재자가 결재함에서 열람한다. */
  reportRefs?: string[]
  /** 대여 신청의 희망 반환 기한 — 승인 시 이 기한으로 대여 처리된다. */
  loanDueDate?: string
  /** 자산 신청의 희망 자산 유형 — 불출 처리 시 재배치 우선 원칙에 따라 같은 유형의 유휴 재고를 우선 추천한다.
   *  (제품안내서 §03 PHASE 4: 유휴 자산 풀 관리 · 재배치 우선 원칙) */
  desiredCategory?: AssetCategory
}

/** 반납 접수 시 상태 점검 결과 — 재배치 가능 여부를 가른다 (제품안내서 §03 PHASE 4) */
export type ReturnCondition = '정상' | '수리 필요' | '폐기 권고'

export interface SaasUsage {
  id: string
  service: string
  category: string
  dept: string
  users: number
  sanctioned: boolean
  monthlyVisits: number
  risk: RiskLevel
}

export type InsightKind = '자동분류' | '이상탐지' | '수명예측' | '취약점 우선순위' | '라이선스 최적화'

export interface AiInsight {
  id: string
  kind: InsightKind
  severity: RiskLevel
  title: string
  detail: string
  evidence: string
  createdAt: string
  status: '제안' | '승인' | '반려'
  decidedAt?: string
  decidedBy?: string
  /** 반려 사유 — 오탐 유형을 남겨 재학습 신호로 쓴다 (제품안내서 §05 그림 4 환류) */
  rejectReason?: string
  /** 승인 시 연결된 후속 조치 — 제안이 실제 무엇을 바꿨는지 */
  action?: string
  /** 조치 대상 참조 — 라이선스 최적화 제안은 대상 라이선스(LIC-*)를 가리켜
   *  승인 시 해당 라이선스의 추가 구매·회수 결재로 이어진다 */
  refId?: string
}

/** 조사 유형 — 연간 정기 조사와 수시(사유 발생 시) 조사 (제품안내서 §03 재물조사 계획) */
export type RoundKind = '연간' | '수시'

export interface InventoryRound {
  id: string
  name: string
  kind: RoundKind
  scope: string
  planned: number
  scanned: number
  mismatched: number
  dueDate: string
  assignee: string
  status: '계획' | '진행중' | '완료'
  /** 대사 결과 '미확인'에서 자동 편성된 회차면 그 대상 자산번호 — 유령 자산 추적용 */
  targets?: string[]
}

/** 재물조사 수행 — 바코드/QR 스캔 실사 (제품안내서 §03) */
export interface SurveyScan {
  id: string
  roundId: string
  code: string
  assetNo?: string
  scannedAt: string
  location: string
  by: string
  result: '일치' | '차이' | '대장 미등록'
}

export type SurveyDiffKind = '위치 불일치' | '미확인 (실사 없음)' | '대장 미등록' | '상태 불일치'

export interface SurveyDiff {
  id: string
  roundId: string
  kind: SurveyDiffKind
  assetNo: string
  model: string
  expected: string
  actual: string
  status: '미조치' | '조정 상신' | '조정 완료'
  resolution?: '대장 보정' | '유휴 편성' | '분실 처리' | '신규 등록'
}

/** 도입·검수 — 발주 연계 입고 → 검수 체크리스트 → 자산번호 채번 → 라벨 발행 (제품안내서 §03) */
export interface IntakeChecklistItem {
  item: string
  checked: boolean
  note?: string
}

export interface IntakeLot {
  id: string
  contractId: string
  model: string
  category: AssetCategory
  qty: number
  arrivedAt: string
  vendor: string
  status: '도입 예정' | '입고 대기' | '검수 중' | '검수 완료' | '검수 반려'
  checklist: IntakeChecklistItem[]
  /** 채번 완료된 자산번호 */
  issued: string[]
  inspector?: string
  /** ITSM SR·발주 번호 — 도입 예정(사전 등록) 건의 연계 근거 (제품안내서 §06 ITSM·구매 연동) */
  srNo?: string
  /** 도입 예정 도착 예정일 — 아직 물리 입고 전(도입 예정) 단계에서만 의미 */
  expectedDate?: string
  /** 발주 단가(원) — 입고 시 입력. 채번 자산의 취득가로 반영돼 유형 표준 단가 대신 실제 취득 원가를 쓴다. */
  unitCost?: number
}

/** 폐기 — 대상 선정 → 결재 → 데이터 소거 → 증적 보존 */
export type WipeMethod = '디가우징' | '물리 파쇄' | '소프트웨어 3-pass'

/** 물리 처분(불용 처리) 방식 — 데이터 소거 후 실물을 어떻게 처분하는가.
 *  매각은 대금 회수, 기증·반납은 인계처가 있어 폐기(파쇄)와 회계·ESG·감사 상 구분된다. (제품안내서 §03 폐기: 소거·불용 처리) */
export const DISPOSITIONS = ['폐기(파쇄)', '매각', '기증', '반납(리스)'] as const
export type Disposition = (typeof DISPOSITIONS)[number]

export interface DisposalRecord {
  id: string
  assetNo: string
  model: string
  reason: string
  status: '대상 선정' | '결재 대기' | '소거 대기' | '완료'
  /** 선정 취소 시 되돌릴 원 상태 — 잘못 선정한 자산을 원위치로 복원한다 */
  prevStatus?: AssetStatus
  approvalId?: string
  wipeMethod?: WipeMethod
  /** 물리 처분 방식 — 소거 완료 시 함께 기록. 매각이면 proceeds(대금) 동반. */
  disposition?: Disposition
  /** 매각 대금(원) — disposition 이 매각일 때 회수 금액 */
  proceeds?: number
  wipedAt?: string
  wipedBy?: string
  /** 증적 — 소거 확인서 번호 · 사진 */
  certNo?: string
  evidence?: string
  /** 증적 사진 — 처리 전·후·폐기물 인계 등 실제 촬영 증적 기록 (제품안내서 §03 폐기: 증적(사진·확인서) 보존) */
  photos?: DisposalPhoto[]
}

/** 폐기 증적 사진 유형 — 파일 저장은 범위 밖이므로 사진 메타데이터(구분·설명·등록자·등록일)만 관리한다 */
export const DISPOSAL_PHOTO_LABELS = ['처리 전', '처리 후', '라벨·시리얼', '폐기물 인계', '기타'] as const
export type DisposalPhotoLabel = (typeof DISPOSAL_PHOTO_LABELS)[number]

export interface DisposalPhoto {
  id: string
  label: DisposalPhotoLabel
  note?: string
  addedAt: string
  addedBy: string
}

/** 게시판 — 공지 · QnA (제품안내서 §01 Main) */
export type QnaCategory = '자산 신청·반납' | '장애·수리' | '라이선스' | '보안·Discovery' | '기타'

/** 공지 분류 — 게시판 공지의 유형(QnaCategory 와 별개). 목록 필터·조직화용. */
export const NOTICE_CATEGORIES = ['정책·규정', '시스템 점검', '교육·안내', '일반'] as const
export type NoticeCategory = (typeof NOTICE_CATEGORIES)[number]

export interface BoardPost {
  id: string
  kind: '공지' | 'QnA'
  title: string
  body: string
  author: string
  dept: string
  createdAt: string
  views: number
  pinned?: boolean
  category?: QnaCategory | NoticeCategory
  answer?: { body: string; by: string; at: string }
  /** 필독(상단 고정) 공지의 읽음 확인 이력 — 사용자별 확인 여부·일시. 컴플라이언스 커버리지 집계용 */
  acks?: { by: string; at: string }[]
  /** 공지 예약 발행일 — 미설정이면 즉시 발행. 발행일이 미래면 관리자에게만 '예약'으로 보이고
   *  발행일이 도래하면(≤ 기준일) 전사에 공개된다. */
  publishAt?: string
}

/** 외부 공격표면 탐지 (제품안내서 §04) — 조직 밖으로 노출된 미인지 자산 */
export type EasmMode = 'Passive' | 'Active'

export interface ExternalAsset {
  id: string
  host: string
  ip?: string
  method: string
  mode: EasmMode
  /** 생존 확인 여부 — 수동 수집 단계에서는 미확인 */
  alive: boolean
  services?: string
  cve?: string
  cvss?: number
  risk: RiskLevel
  firstSeen: string
  note?: string
  /** 내부 6채널 결과와 자산 지문 통합 → 대장 대사 결과 */
  state: ReconcileState
  action?: '편입요청' | '차단요청' | '편입완료' | '차단완료'
}

/** 외부 공격표면 재탐지 대상 도메인 — 도메인별 주기로 스케줄러가 반복한다 (제품안내서 §04) */
export interface EasmTarget {
  domain: string
  /** 재탐지 주기(일) */
  intervalDays: number
  lastRunAt?: string
  /** 능동 탐지 사전 협의 여부 — 협의 없이 능동 탐지를 돌리면 안 된다 */
  activeApproved: boolean
  note?: string
}

/** 외부 공격표면 재탐지 회차 */
export interface EasmRun {
  id: string
  startedAt: string
  finishedAt?: string
  domains: string[]
  mode: EasmMode | 'Passive+Active'
  status: '실행 중' | '완료'
  /** 수동 수집으로 확보한 후보 */
  candidates: number
  /** 능동 확인으로 생존 판정한 수 */
  confirmed: number
  /** 새로 드러난 노출 자산 */
  newFound: number
  by: string
  note?: string
}

/** 아직 외부에서 관측되지 않은 노출 자산 — 재탐지가 돌면 드러난다 */
export interface UnseenExternal {
  host: string
  ip?: string
  method: string
  mode: EasmMode
  domain: string
  services?: string
  cve?: string
  cvss?: number
  risk: RiskLevel
  note: string
}

export interface LeakFinding {
  id: string
  kind: '유출 계정' | '스틸러 로그' | '코드 저장소 시크릿' | '랜섬웨어 유출 사이트'
  detail: string
  source: string
  confidence: '높음' | '중간' | '낮음'
  foundAt: string
  /** 대응 상태 — 검출에서 끝내지 않고 보안 대응까지 이어간다 (§04 다크웹 유출 감시) */
  status?: '미조치' | '조치 완료'
  /** 취한 대응 조치 내용 */
  response?: string
  respondedBy?: string
  respondedAt?: string
}

/** 유출 유형별 표준 대응 조치 — 대응 폼의 기본값으로 제시하고, 담당자가 수정해 확정한다. */
export const LEAK_RESPONSE: Record<LeakFinding['kind'], string> = {
  '유출 계정': '해당 계정 비밀번호 강제 재설정 및 전 세션 로그아웃',
  '스틸러 로그': '감염 단말 격리·포렌식, 저장 크리덴셜 전량 로테이션',
  '코드 저장소 시크릿': '노출 시크릿 즉시 폐기·로테이션, 커밋 이력 정리',
  '랜섬웨어 유출 사이트': '침해 대응 개시·법무/CISO 통보, 유출 범위 조사',
}

/** 인증 취약점 점검 결과 — 오픈 확인된 포트에 한해 기본·취약 크리덴셜을 점검한 서비스별 노출.
 *  (제품안내서 §04 외부 공격표면 탐지: "인증 취약점 점검 — SSH·DB·FTP·HTTP Basic·Redis·SMTP 등,
 *   산출: 취약·기본 크리덴셜 노출(서비스별)"). 검출에서 끝내지 않고 보안담당 대응으로 이어간다. */
export interface CredentialFinding {
  id: string
  /** 점검 대상 서비스 — 오픈 확인된 포트에 한해서만 점검한다 */
  service: 'SSH' | 'PostgreSQL' | 'MySQL' | 'FTP' | 'HTTP Basic' | 'Redis' | 'SMTP'
  host: string
  port: number
  /** 점검 판정 — 기본 크리덴셜 / 약한 암호 / 인증 없음 */
  issue: '기본 크리덴셜' | '약한 암호' | '인증 없음'
  severity: RiskLevel
  foundAt: string
  /** 연계된 외부 노출 자산 ID — 같은 호스트의 노출 서비스에서 점검됐으면 잇는다 */
  extId?: string
  note?: string
  /** 대응 상태 — 검출에서 끝내지 않고 보안 대응까지 이어간다 */
  status?: '미조치' | '조치 완료'
  response?: string
  respondedBy?: string
  respondedAt?: string
}

/** 서비스별 표준 대응 조치 — 대응 폼의 기본값으로 제시하고, 담당자가 수정해 확정한다. */
export const CRED_RESPONSE: Record<CredentialFinding['service'], string> = {
  SSH: '기본·공용 계정 비활성화, 키 기반 인증 전환·비밀번호 로그인 차단',
  PostgreSQL: 'DB 계정 비밀번호 재설정, 외부 접근 차단·pg_hba 화이트리스트 적용',
  MySQL: 'root 원격 접속 차단, 계정 비밀번호 재설정·바인드 주소 제한',
  FTP: '익명·기본 계정 폐지, SFTP 전환·평문 인증 중단',
  'HTTP Basic': '기본 크리덴셜 교체, 관리 콘솔 접근 IP 제한·MFA 적용',
  Redis: 'requirepass 설정·보호 모드 활성화, 외부 바인드 차단',
  SMTP: '메일 릴레이 인증 강제, 열린 릴레이 차단·전송 제한',
}

/** 연동 대상 시스템 (제품안내서 §06) — 수집 소스이자 조치 채널 */
export interface Integration {
  id: string
  system: string
  method: 'REST API' | 'API · 로그' | '로그 수집' | 'CSP API' | 'SAML · API'
  purpose: string
  role: '수집' | '조치' | '수집 · 조치'
  status: '정상' | '지연' | '오류' | '미연동'
  lastSync: string
  /** 최근 24시간 수집 건수 */
  volume24h: number
}

export interface AuditLog {
  id: string
  at: string
  actor: string
  action: string
  target: string
  result: '성공' | '실패'
  ip: string
}

/** 환경설정 — 공통코드 (제품안내서 §01 환경설정 · 권한 · 코드 · 정책) */
export interface CodeValue {
  code: string
  label: string
  sort: number
  active: boolean
}

export interface CodeGroup {
  id: string
  name: string
  desc: string
  values: CodeValue[]
}

/** 탐지 채널·스캔 정책 — 대역·시간대·강도 통제 (스캔 안전장치, §07) */
export interface ScanPolicy {
  channel: Channel
  enabled: boolean
  kind: '능동' | '패시브' | 'API 연동' | '로그 수집'
  targets: string
  window: string
  intensity: '낮음' | '보통' | '높음'
  interval: string
  note: string
}

/** 권한 매트릭스 — 메뉴(화면) × 기능(버튼) 단위. 환경설정에서 편집하며 서버가 이를 강제한다.
 *  'y'=허용 · 'n'=불가 · 'p'=부분(본인 범위 한정) */
export type PermCell = 'y' | 'n' | 'p'
export type PermAction = '조회' | '저장' | '삭제' | '엑셀' | '편입' | '격리요청' | '결재'
export type PermMenu =
  | '대시보드' | '자산 대장' | '수명주기' | '재고 · 재물조사' | '계약 · 라이선스'
  | '발견 자산 · CMDB 대사' | 'Shadow SaaS' | 'AI 어시스턴트' | '신청 · 결재' | '권한 · 정책'

/** 메뉴 정의 — 권한 파이프라인 STEP 1·2 (메뉴기능관리 → 메뉴관리).
 *  화면마다 카테고리·화면번호를 부여하고, 그 화면이 제공하는 기능(버튼)을 정의한다.
 *  매트릭스(STEP 3)는 이 정의 위에서만 권한을 부여할 수 있다 — 화면에 없는 기능에
 *  권한을 주는 칸은 애초에 의미가 없다. (제품안내서 §02) */
export interface MenuDef {
  /** 화면번호 — 카테고리 약어 + 일련번호 */
  code: string
  category: string
  menu: PermMenu
  /** 대표 라우트 (여러 화면을 묶은 메뉴는 대표 1개) */
  path: string
  /** 이 화면이 제공하는 기능 */
  actions: PermAction[]
  /** 그중 서버가 직접 강제하는 기능 — 나머지는 화면 가드가 구현 */
  enforced: PermAction[]
}

export interface MenuPermission {
  menu: PermMenu
  cells: Record<Role, PermCell[]>
}

/** 스캔 실행 회차 — 수집 계층이 실제로 돈 기록. 정책(대역·시간대·강도)이 실행을 통제한다.
 *  (제품안내서 §04 6종 병렬 수집 · §07 스캔 안전장치) */
export interface ScanRun {
  id: string
  startedAt: string
  finishedAt?: string
  channels: Channel[]
  scope: string
  intensity: ScanPolicy['intensity']
  status: '실행 중' | '완료' | '중단'
  /** 이번 회차가 수집한 관측 건수 */
  observed: number
  /** 그중 기존 지문에 병합된 재관측 */
  reobserved: number
  /** 새 지문 = 신규 발견 */
  newFound: number
  by: string
  /** 정책 시간대 밖 실행 사유 — 안전장치를 우회했다면 근거가 남아야 한다 */
  override?: string
}

/** 아직 대장에도 발견 저장소에도 없는 장비 — 스캔이 돌면서 드러난다.
 *  실제로는 네트워크에 존재하는 실물이며, 여기서는 스캔의 결과를 재현하기 위한 대기 풀이다. */
export interface UndiscoveredDevice {
  hostname: string
  ip: string
  mac: string
  type: string
  /** 이 장비를 처음 잡아낼 수 있는 채널 — 채널마다 사각지대가 다르다 */
  by: Channel[]
  risk: RiskLevel
  note: string
  ownerCandidate?: string
}

/** SaaS 카탈로그 — 인가/차단 판정이 Shadow SaaS 화면으로 환류 */
export interface SaasCatalogEntry {
  id: string
  service: string
  category: string
  vendor: string
  status: '인가' | '차단' | '검토중'
  dataGrade: '일반' | '민감' | '기밀'
  owner: string
  decidedAt?: string
  decidedBy?: string
}

/** AI 정책 — 실행 환경 · 거버넌스 (§05) */
export interface AiPolicy {
  deployment: '온프레미스 LLM' | '외부 API 연계' | '하이브리드'
  modelId: string
  promptVersion: string
  classifyAccuracy: number
  auditRetentionDays: number
  /** 권한 밖 데이터 질의 컨텍스트 원천 배제 */
  scopeFilter: boolean
  /** AI 제안 자동 승인 (미사용 권장 — 담당자 확인·결재 원칙) */
  autoApprove: boolean
  /** 판정 결과 환류 재학습 */
  feedbackLearning: boolean
}

export interface UserAccount {
  login: string
  name: string
  dept: string
  role: Role
  group: string
  lastLogin: string
  mfa: boolean
}

/** 결재선 — 화면별 기본 결재선 사전 정의 (폐기·격리는 필수 결재) */
export interface ApprovalLine {
  id: string
  screen: string
  kind: ApprovalKind
  steps: string[]
  required: boolean
}

/** AI 리포트 자동 생성 (제품안내서 §05) — 결재 첨부용 문서 산출 */
export type ReportKind =
  | '주간 Shadow IT 브리핑'
  | '월간 자산 현황'
  | '라이선스 컴플라이언스'
  | '재물조사 결과 요약'
  | '감사 대응 자료'
  | '연간 교체 계획'

export interface ReportSection {
  title: string
  note?: string
  columns?: string[]
  rows?: string[][]
  bullets?: string[]
}

/** 리포트 자동 생성 스케줄 — 주간/월간 리포트는 스케줄러가 돌려 결재 첨부용으로 배포한다.
 *  '수시' 리포트(재물조사·감사 대응)는 사유가 있을 때만 만들므로 스케줄을 두지 않는다.
 *  (제품안내서 §05: 주간 Shadow IT 브리핑 · 월간 자산 현황·라이선스 리포트 자동 작성) */
export interface ReportSchedule {
  kind: ReportKind
  period: '주간' | '월간'
  enabled: boolean
  /** 주간 = 요일(1 월 … 7 일) */
  dayOfWeek?: number
  /** 월간 = 일자 */
  dayOfMonth?: number
  hour: number
  recipients: string[]
  lastRunAt?: string
}

/** AI 호출의 실제 결과 — 키 존재 여부가 아니라 '동작하는가' 를 화면에 표시하기 위한 것 */
export interface AiCallRecord {
  at: string
  ok: boolean
  detail?: string
}

export interface AiCallStatus {
  state: '키 미설정' | '미검증' | '가동' | '폴백'
  label: string
  tone: 'ok' | 'warn' | 'info' | 'neutral'
}

export interface GeneratedReport {
  id: string
  kind: ReportKind
  title: string
  period: string
  generatedAt: string
  generatedBy: string
  /** AI = LLM 서술 생성 · 규칙 = 데이터 기반 결정적 생성 (키 미설정 시) */
  mode: 'AI' | '규칙'
  headline: string
  sections: ReportSection[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  evidence?: { label: string; href: string }[]
}
