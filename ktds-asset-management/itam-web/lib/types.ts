/** 도메인 타입 — 제품안내서(AI 기반 IT 자산관리 시스템)의 데이터 모델 */

export type Role = 'USER' | 'ASSET_MGR' | 'SEC_MGR' | 'ADMIN'

export const ROLE_LABEL: Record<Role, string> = {
  USER: '사용자',
  ASSET_MGR: '자산담당',
  SEC_MGR: '보안담당',
  ADMIN: 'Admin',
}

export type AssetCategory = '단말' | '서버' | '네트워크' | '주변기기' | 'SW' | '가상자원'

/** 수명주기 5단계 (도입·검수 → 등록 → 운영·이동 → 반납·유휴 → 폐기) */
export type AssetStatus = '검수중' | '사용중' | '유휴' | '반납대기' | '폐기예정' | '폐기완료'

export interface AssetHistoryItem {
  date: string
  kind: '등록' | '불출' | '이동' | '구성변경' | '점검' | '반납' | '폐기' | '편입'
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
  contractId?: string
  /** Discovery 편입 자산이면 최초 발견 채널 */
  discoveredVia?: string
  history: AssetHistoryItem[]
}

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

export type RiskLevel = '높음' | '중간' | '낮음'

export interface DiscoveredAsset {
  id: string
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
  kind: '소유자 확인' | '만료 임박' | '격리 통보' | '에스컬레이션'
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
}

export interface SwLicense {
  id: string
  name: string
  vendor: string
  purchased: number
  used: number
  expiry: string
  unitCost: number
}

export type ApprovalKind = '자산 신청' | '반납' | '이동' | '폐기' | '소유자 확인' | '격리 요청' | '차이 조정'
export type ApprovalStatus = '대기' | '승인' | '반려'

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
  /** 승인 후 자산담당이 실제 불출·이동을 집행했는지. 결재 승인만으로는 실물이 움직이지 않는다 */
  fulfilled?: boolean
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
  status: '입고 대기' | '검수 중' | '검수 완료'
  checklist: IntakeChecklistItem[]
  /** 채번 완료된 자산번호 */
  issued: string[]
  inspector?: string
}

/** 폐기 — 대상 선정 → 결재 → 데이터 소거 → 증적 보존 */
export type WipeMethod = '디가우징' | '물리 파쇄' | '소프트웨어 3-pass'

export interface DisposalRecord {
  id: string
  assetNo: string
  model: string
  reason: string
  status: '대상 선정' | '결재 대기' | '소거 대기' | '완료'
  approvalId?: string
  wipeMethod?: WipeMethod
  wipedAt?: string
  wipedBy?: string
  /** 증적 — 소거 확인서 번호 · 사진 */
  certNo?: string
  evidence?: string
}

/** 게시판 — 공지 · QnA (제품안내서 §01 Main) */
export type QnaCategory = '자산 신청·반납' | '장애·수리' | '라이선스' | '보안·Discovery' | '기타'

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
  category?: QnaCategory
  answer?: { body: string; by: string; at: string }
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

export interface LeakFinding {
  id: string
  kind: '유출 계정' | '스틸러 로그' | '코드 저장소 시크릿' | '랜섬웨어 유출 사이트'
  detail: string
  source: string
  confidence: '높음' | '중간' | '낮음'
  foundAt: string
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

export interface ReportSection {
  title: string
  note?: string
  columns?: string[]
  rows?: string[][]
  bullets?: string[]
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
