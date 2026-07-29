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
  /** 처리 상태 */
  action?: '편입요청' | '격리요청' | '편입완료' | '격리완료'
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
}

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
}

export interface InventoryRound {
  id: string
  name: string
  scope: string
  planned: number
  scanned: number
  mismatched: number
  dueDate: string
  assignee: string
  status: '계획' | '진행중' | '완료'
}

export interface Notice {
  id: string
  title: string
  date: string
  pinned?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  evidence?: { label: string; href: string }[]
}
