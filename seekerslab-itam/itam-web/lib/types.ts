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

/** 업무 중요도 — 자산이 담당하는 업무의 중요도(운영자 지정). 취약점 우선순위 스코어링의 '자산 중요도' 축(제품안내서 §05).
 *  미지정 자산은 '일반'으로 간주. 핵심(업무 중단 직결)·중요(부서 업무 영향)·일반. */
export type BizCriticality = '핵심' | '중요' | '일반'

export interface Asset {
  assetNo: string
  category: AssetCategory
  model: string
  serial: string
  status: AssetStatus
  owner: string
  dept: string
  location: string
  /** 업무 중요도 — 미지정이면 '일반'. 취약점 우선순위 스코어링에 반영된다. */
  criticality?: BizCriticality
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
  /** 대여자(사용자)가 올린 반환 기한 연장 요청 — 자산담당이 승인(요청대로 연장) 또는 반려한다. 처리 시 해제. */
  loanExtendRequest?: { newDueDate: string; reason: string; by: string; at: string }
  /** 대여자(사용자)가 올린 반납(반환) 신청 — 대여를 마치고 자산을 돌려주겠다는 셀프서비스 신호. 자산담당이 반환 접수하면 해제. */
  returnRequest?: { by: string; at: string; note?: string }
  /** 수리 의뢰 정보 — 상태가 '수리중'이고 외부 수리 의뢰가 접수됐을 때. 수리 완료·불가 시 이력에 실비를 남기고 해제한다. (제품안내서 §03 유지보수) */
  repair?: { vendor: string; sentAt: string; eta?: string; estCost?: number }
  /** 수리 사유 — 장애 신고 증상 또는 반납 점검 '수리 필요' 사유. 수리 대기 화면에서 자산담당이 무엇을 고칠지 보이게 한다(업체 배정 전에도). 수리 완료·불가 시 해제. */
  faultNote?: string
  /** 수령(인수) 확인 대기 — 불출로 사용자에게 배정된 뒤 아직 수령 확인을 하지 않은 상태. 사용자가 확인하면 해제(체인 오브 커스터디). */
  receiptPending?: boolean
  /** 정기 점검 예정일 — 예방 정비(펌웨어·하드웨어 점검 등) 다음 예정일(§03 유지보수). 점검 완료 시 주기(기본 12개월)만큼 재예약. 반응형 수리와 별개의 사전 정비. */
  maintenanceDue?: string
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
  /** 실측이 대장과 다른 필드 — 지정 시 '대사 확인'이 대장 값을 실측값으로 보정한다(등록·불일치 폐쇄). 미지정 불일치(구성 상이 등)는 검토·종결만 한다. */
  mismatchField?: '위치' | '소유자' | '부서'
  /** 실측값 — mismatchField 와 함께 지정되면 대사 확인 시 대장에 반영된다. */
  observedValue?: string
  ownerCandidate?: string
  note?: string
  /** 처리 상태 — 확인요청은 편입/격리 앞단의 소유자 확인 단계 (제품안내서 그림 3). '관리 제외'는 관리 대상이 아닌 알려진 비자산(협력사 장비·게스트 단말·비관리 어플라이언스)으로 판정해 미등록 갭에서 제외한 상태(사유·감사 필수, 해제 가능). */
  action?: '확인요청' | '편입요청' | '격리요청' | '편입완료' | '격리완료' | '관리 제외'
  /** 소유자 확인 요청 발송일 — 기한 내 무응답 시 격리 에스컬레이션의 기준 */
  confirmRequestedAt?: string
  /** 소유자 확인 결과 */
  ownerAnswer?: '본인 자산' | '본인 자산 아님'
  /** AI 자동분류 판정으로 확정된 표준 유형 — 편입 시 이 유형이 대장으로 승계된다(없으면 발견 유형 문자열을 자동분류). */
  classifiedCategory?: AssetCategory
  /** CMDB 대사 생존 확인 처리일 — 등록·일치(대장 매칭) 재관측을 대장 '최근 실측일'로 확정한 시점. §04 그림3의 등록·일치 = 생존 신호. */
  survivalConfirmedAt?: string
}

/** 소유자 확인 요청의 응답 기한(일). 경과 시 격리 요청으로 에스컬레이션한다.
 *  서버액션 모듈('use server')은 async 함수만 export 할 수 있어 정책 상수는 여기에 둔다. */
export const CONFIRM_DEADLINE_DAYS = 7

/** 만료 임박 알림 대상 기준(일) — 계약·보증·라이선스 공통 */
export const EXPIRY_WINDOW_DAYS = 90

/** 운영 정책(임계값) — 그동안 코드 상수로 고정돼 표시만 되던 기한·SLA·판정 기준을 운영자가 설정할 수 있게 스토어로 승격한다.
 *  화면·리포트·스케줄러가 모두 이 값을 참조하도록 단일 출처로 둔다(제품안내서 §02 정책 통제·§07 감사). */
export interface OpsPolicy {
  /** 소유자 확인 요청 응답 기한(일) — 경과 시 격리 에스컬레이션 */
  confirmDeadlineDays: number
  /** 결재 SLA(일) — 초과 시 '지연' 표기 */
  approvalSlaDays: number
  /** 장기 미실측 기준(일) — 초과·미실측 시 유령 자산 후보(재물조사 편성) */
  staleVerifyDays: number
  /** 계약·보증·라이선스 만료 임박 알림 창(일) */
  expiryWindowDays: number
  /** 안전재고 기준(대수) — 불출 가능한 유형(단말·주변기기)의 가용(유휴) 재고가 이 값 미만이면 재고 부족(발주 검토) 경보. */
  safetyStock: number
}

/** 운영 정책 기본값 — 기존 상수를 시드 기본값으로 승계한다(APPROVAL_SLA_DAYS 는 lib/dates 소재라 순환참조 방지로 기본 3 명시). */
export const DEFAULT_OPS_POLICY: OpsPolicy = {
  confirmDeadlineDays: CONFIRM_DEADLINE_DAYS,
  approvalSlaDays: 3,
  staleVerifyDays: STALE_VERIFY_DAYS,
  expiryWindowDays: EXPIRY_WINDOW_DAYS,
  safetyStock: 2,
}

/** 안전재고 관리 대상 유형 — 신규 입사·교체 수요로 상시 보충하는 불출형 HW.
 *  서버·네트워크는 예비 재고를 두지 않고, SW·가상자원은 물리 재고 개념이 아니라 제외한다. */
export const STOCKED_CATEGORIES = ['단말', '주변기기'] as const

/** 위험도 기준(취약점 우선순위 임계값) — 보안담당이 관리하는 조치 우선순위 판정 기준.
 *  자산 중요도 × 노출도 점수(0~100)를 P1/P2/P3 로 나누는 컷오프. (제품안내서 §01 역할: 보안담당 — 위험도 기준 관리, §05 취약점 우선순위) */
export interface RiskPolicy {
  /** P1(즉시 조치) 최소 점수 — 이 값 이상이면 P1 */
  p1MinScore: number
  /** P2(우선 조치) 최소 점수 — 이 값 이상이면 P2, 미만이면 P3 */
  p2MinScore: number
}

/** 위험도 기준 기본값 — 기존 하드코딩(P1≥67·P2≥34)을 시드 기본값으로 승계한다. */
export const DEFAULT_RISK_POLICY: RiskPolicy = { p1MinScore: 67, p2MinScore: 34 }

/** 알림 발송 이력 — 소유자 확인 요청·만료 임박·격리 통보는 이메일·문자로 나가고 이력이 남는다
 *  (제품안내서 §06 연동: 그룹웨어 — SSO·결재·알림 메일) */
export interface Dispatch {
  id: string
  at: string
  channel: '이메일' | '문자'
  to: string
  subject: string
  kind: '소유자 확인' | '만료 임박' | '격리 통보' | '에스컬레이션' | '리포트 배포' | '위협 대응' | '입고 반려' | '계약 해지' | '공지 독촉' | '결재 결과' | '결재 독촉' | '대여 독촉' | '수리 독촉' | '정기 점검 독촉' | '입고 독촉' | '발주 요청' | '장애 신고' | '수리 결과' | '수령 확인' | 'QnA 답변' | 'QnA 접수' | 'QnA 독촉' | 'QnA 해결' | '자산 불출' | '자산 대여' | '자산 이동' | '반납 접수' | '분실 신고' | 'MFA 등록 요구' | '유지보수 예산 통보' | 'SaaS 판정 독촉' | '발주 이행 독촉' | '재물조사 독촉' | 'EOL 업그레이드 통보' | '라이선스 제거 요청' | '유지보수 이행 독촉' | '라이선스 재계약 검토' | '부속서류 제출 요청'
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

/** 라이선스 좌석 배정 — 라이선스 한 석을 특정 자산(과 그 보유자·부서)에 배정한 기록.
 *  보유·사용 집계(수량)만으로는 '누가 어느 석을 쓰는지' 증명이 안 돼, 감사에서 배정 대장을 요구한다(SAM 실사).
 *  탐지 사용량(used)과 대사하면 배정 밖 사용(추적 안 된 설치)을 드러낸다 — 고가·명명형 라이선스(CAD·Adobe 등)에 특히 유효. */
export interface LicenseSeat {
  assetNo: string
  user: string
  dept: string
  at: string
}

export interface SwLicense {
  id: string
  name: string
  vendor: string
  purchased: number
  used: number
  expiry: string
  unitCost: number
  /** 좌석 배정 대장 — 배정된 석의 자산·보유자·부서. 탐지 사용량(used)과 대사해 배정 밖 사용을 식별한다. */
  seats?: LicenseSeat[]
  /** 갱신 이력 — 라이선스 만료일 연장 기록(계약 갱신과 동형). 라이선스 카드에서 구독 기간 변천 추적 */
  renewals?: Renewal[]
  /** 상태 — '해지'(구독 중단·도구 이관)면 만료 임박 집계·알림·컴플라이언스 판정에서 제외. undefined=유효 */
  status?: '유효' | '해지'
  terminatedAt?: string
  /** 근거 계약 — 라이선스를 구매·구독한 계약(CT-*). 라이선스↔계약 추적성. 미연계면 계약 없는 구독(추적 밖). */
  contractId?: string
  /** 사용 수집 시각 — EDR 설치 SW 인벤토리를 마지막으로 수집·대사한 시점(제품안내서 §03 라이선스 STEP2). undefined=미수집 */
  usageCollectedAt?: string
}

/** EDR 설치 SW 인벤토리 관측 — 특정 자산에 라이선스 대상 SW가 설치돼 있음을 EDR·에이전트가 검출한 기록.
 *  제품안내서 §03 라이선스 컴플라이언스 STEP2 "사용 수집 — EDR·에이전트 설치 SW 인벤토리".
 *  배정 좌석(seats)과 대사해 배정 밖 설치(무단 사용)·미설치 좌석(회수 후보)을 식별한다. */
export interface SwInstall {
  id: string
  licenseId: string
  assetNo: string
  host: string
  user: string
  dept: string
  version: string
  detectedAt: string
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
  /** 조치 대상 참조 — 라이선스 최적화 제안은 대상 라이선스(LIC-*)를, 자동분류 제안은 발견 자산(DSC-*)을 가리킨다.
   *  승인 시 라이선스는 추가 구매·회수 결재로, 자동분류는 발견 자산 표준 유형 확정(편입 승계)으로 이어진다 */
  refId?: string
  /** 자동분류 제안이 매핑한 표준 자산 유형 — 승인 시 발견 자산에 확정 저장되고 편입 시 대장으로 승계된다(§05 기능01). */
  proposedCategory?: AssetCategory
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
  resolution?: '대장 보정' | '유휴 편성' | '분실 처리' | '신규 등록' | '미적용'
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
  status: '도입 예정' | '입고 대기' | '검수 중' | '검수 완료' | '검수 반려' | '반품 완료'
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
  /** QnA 해결 확인일 — 문의 작성자가 답변으로 해결됐음을 확정한 날. 재문의 시 해제. (헬프데스크 종결 루프) */
  resolvedAt?: string
  /** 필독(상단 고정) 공지의 읽음 확인 이력 — 사용자별 확인 여부·일시. 컴플라이언스 커버리지 집계용 */
  acks?: { by: string; at: string }[]
  /** 공지 예약 발행일 — 미설정이면 즉시 발행. 발행일이 미래면 관리자에게만 '예약'으로 보이고
   *  발행일이 도래하면(≤ 기준일) 공개된다. */
  publishAt?: string
  /** 공지 대상 부서 — 미설정이면 전사. 지정 시 해당 부서에만 노출되고 필독 확인율·독촉 분모가 그 부서로 좁혀진다
   *  (제품안내서 §01 공지: 부서별 대상 공지 — 전사 공지가 무관한 팀의 확인율까지 희석하던 문제 해소). */
  audienceDept?: string
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
  /** 조치 상태 — '위험 수용'은 편입/차단 대신 인지된 노출로 공식 수용한 상태(사유·감사 필수, 해제 가능). 활성 취약점 우선순위에서 제외된다. */
  action?: '편입요청' | '차단요청' | '편입완료' | '차단완료' | '위험 수용'
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

/** 위협 인텔리전스 IOC 상관 — 외부 위협 인텔 피드의 IOC(네트워크·호스트·해시)를 조직 자산·관측과 상관해
 *  알려진 자산에 위협 맥락(위협 행위자 귀속)을 부여한다 (제품안내서 §04 위협 인텔리전스).
 *  신규 자산 발견이 아니라 이미 아는 자산의 악성 통신·감염 징후를 드러내므로, 검출에서 끝내지 않고 보안담당이 차단·조사한다. */
export interface IocMatch {
  id: string
  iocType: 'IP' | '도메인' | '파일 해시' | 'URL'
  iocValue: string
  /** 위협 행위자·캠페인 귀속 */
  threatActor: string
  /** 관측 방식 — 어떻게 조직 환경과 상관됐는지 */
  matchType: '아웃바운드 통신' | '파일 해시 일치' | 'DNS 질의'
  /** 상관된 자산(대장 자산번호 또는 호스트) */
  matchedAsset: string
  dept: string
  confidence: '높음' | '중간' | '낮음'
  source: string
  firstSeen: string
  severity: RiskLevel
  note?: string
  /** 조치 — 차단(프록시·방화벽·EDR 차단) 또는 조사 착수(침해 대응) */
  action?: '차단 요청' | '조사 착수'
  actedBy?: string
  actedAt?: string
}

/** IOC 관측 방식별 표준 조치 사유 — 판정 근거로 표시한다. */
export const IOC_RESPONSE: Record<IocMatch['matchType'], string> = {
  '아웃바운드 통신': 'C2 의심 통신 — 프록시·방화벽 즉시 차단 후 단말 격리·포렌식',
  '파일 해시 일치': '악성 파일 검출 — EDR 격리·해시 차단, 감염 범위 조사',
  'DNS 질의': '악성 도메인 질의 — DNS·프록시 차단, 통신 이력 조사',
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

/** 휴면 계정 — AD/IdP·SSO 로그에서 발견한 계정 기반 Shadow IT (제품안내서 §04 탐지 채널 06,
 *  §06 AD/Entra: "OAuth 앱·휴면 계정 발견"). 일정 기간 로그인 없는 계정은 방치된 접근 경로(퇴직 미회수·
 *  미사용 서비스 계정)이므로, 검출에서 끝내지 않고 비활성화 집행 또는 소유자(부서) 사용 여부 확인으로 이어간다. */
export interface AccountFinding {
  id: string
  /** 계정 로그인 ID / UPN */
  account: string
  displayName: string
  dept: string
  kind: '휴면 사용자 계정' | '휴면 관리자 계정' | '미사용 서비스 계정'
  /** 마지막 로그인 일자 — 로그인 이력이 없으면 '-' */
  lastLogin: string
  /** 마지막 로그인 이후 경과일 (로그인 이력 없으면 계정 생성 이후 경과) */
  dormantDays: number
  source: 'AD' | 'Entra ID' | 'SSO'
  risk: RiskLevel
  note?: string
  /** 조치 — 비활성화 집행 요청(보안운영팀) 또는 소유자(부서) 사용 여부 확인 요청. '사용 확인'은 확인 결과 유효 계정으로 판정해 휴면 리스크에서 정리한 상태. */
  action?: '비활성화 요청' | '소유자 확인 요청' | '사용 확인'
  actedBy?: string
  actedAt?: string
}

/** 미인가 SW — EDR·백신 콘솔의 설치 SW 인벤토리에서 검출한 정책 위반 소프트웨어
 *  (제품안내서 §03 컴플라이언스: "미인가 SW 설치는 Discovery 모듈의 정책 위반 항목으로 연계되어 보안담당에게 통보",
 *   §04 탐지 채널 04 EDR: "설치 SW", §05 이상탐지: "미인가 SW 설치"). 설치된 자산(assetNo)에 연결된다.
 *  검출에서 끝내지 않고 보안담당이 제거 요청 또는 예외 승인(업무 정당성)으로 조치한다. */
export interface UnauthorizedSw {
  id: string
  name: string
  version?: string
  /** 설치된 자산 — 대장 자산번호로 연결 */
  assetNo: string
  owner: string
  dept: string
  kind: '금지 SW' | '무단 원격제어' | '미승인 SW'
  detectedBy: string
  firstSeen: string
  risk: RiskLevel
  note?: string
  /** 조치 — 제거 요청(사용자·보안운영팀 통지) 또는 예외 승인(업무상 정당·화이트리스트) */
  action?: '제거 요청' | '예외 승인'
  actedBy?: string
  actedAt?: string
}

/** SW 예외 승인 목록(화이트리스트) — 보안담당이 업무상 정당성을 인정한 SW. 예외 승인 시 여기 등재되어(§01 보안담당: 미인가 SW 정책 관리)
 *  같은 SW 가 다른 자산에서 재검출돼도 이미 허용된 것으로 참조된다 — 그동안 예외 승인은 해당 건만 표시하고 재사용되는 정책으로 남지 않았다. */
export interface SwAllowEntry {
  /** SW 이름 — 검출 name 과 대조하는 키 */
  name: string
  approvedBy: string
  approvedAt: string
  /** 승인 근거 — 업무 정당성 메모 */
  note?: string
}

/** 미인가 SW 유형별 표준 조치 사유 — 판정 근거로 표시한다. */
export const UNAUTH_SW_POLICY: Record<UnauthorizedSw['kind'], string> = {
  '금지 SW': '전사 금지 목록(P2P·토렌트·크랙) — 즉시 제거 대상',
  '무단 원격제어': '승인되지 않은 원격제어 도구 — 외부 접근 경로, 제거·예외 심사',
  '미승인 SW': '카탈로그 미등재 업무 SW — 사용 정당성 확인 후 등재 또는 제거',
}

/** USB 저장매체 정책 위반 — EDR·백신 콘솔이 검출한 이동식 저장매체 사용(제품안내서 §04 탐지 채널 04 EDR: "설치 SW, USB, 로컬 가상머신").
 *  미등록 매체·대용량 반출·암호화 미적용은 데이터 유출(DLP) 위험이므로, 검출에서 끝내지 않고 보안담당이 차단 또는 예외 승인한다. */
export interface UsbFinding {
  id: string
  /** 매체 식별 — 제조사·모델·시리얼 요약 */
  device: string
  /** 사용된 자산 — 대장 자산번호로 연결 */
  assetNo: string
  owner: string
  dept: string
  kind: '미등록 저장매체' | '대용량 반출 의심' | '암호화 미적용'
  detectedBy: string
  firstSeen: string
  risk: RiskLevel
  note?: string
  /** 조치 — 매체 차단(EDR 장치 제어) 또는 예외 승인(등록된 업무용 매체) */
  action?: '차단 요청' | '예외 승인'
  actedBy?: string
  actedAt?: string
}

/** USB 유형별 표준 조치 사유 — 판정 근거로 표시한다. */
export const USB_POLICY: Record<UsbFinding['kind'], string> = {
  '미등록 저장매체': '자산관리 미등록 이동식 매체 — 반입 승인·등록 또는 차단',
  '대용량 반출 의심': '단시간 대용량 복사 — 데이터 유출(DLP) 점검·차단 우선',
  '암호화 미적용': '비암호화 저장매체 — 분실 시 유출 위험, 암호화 매체로 교체 요구',
}

/** 로컬 가상머신 정책 위반 — EDR·백신 콘솔이 검출한 엔드포인트 내 로컬 VM(제품안내서 §04 탐지 채널 04 EDR: "설치 SW, USB, 로컬 가상머신").
 *  미인가 하이퍼바이저·EOL 게스트·미관리 VM 은 관리 사각지대(미패치·통제 우회)이므로, 검출에서 끝내지 않고 보안담당이 회수 또는 예외 승인한다. */
export interface LocalVmFinding {
  id: string
  /** VM 식별 — 하이퍼바이저·VM 명 요약 */
  vm: string
  /** 게스트 OS */
  guestOs: string
  /** 실행 자산(호스트) — 대장 자산번호로 연결 */
  assetNo: string
  owner: string
  dept: string
  kind: '미인가 하이퍼바이저' | 'EOL·미패치 게스트' | '미관리 VM'
  detectedBy: string
  firstSeen: string
  risk: RiskLevel
  note?: string
  /** 조치 — 회수(하이퍼바이저 제거·VM 삭제 요청) 또는 예외 승인(등록된 개발용 VM) */
  action?: '회수 요청' | '예외 승인'
  actedBy?: string
  actedAt?: string
}

/** 로컬 VM 유형별 표준 조치 사유 — 판정 근거로 표시한다. */
export const LOCALVM_POLICY: Record<LocalVmFinding['kind'], string> = {
  '미인가 하이퍼바이저': '승인되지 않은 가상화 SW(VMware·VirtualBox·WSL 등) — 제거·예외 심사',
  'EOL·미패치 게스트': '지원 종료·미패치 게스트 OS — 관리 사각지대의 취약점 상시 노출, 회수 우선',
  '미관리 VM': '자산관리 미등록 VM — 통제 우회·미패치 위험, 등록 또는 회수',
}

/** 미관리 클라우드 리소스 — CSP API(제품안내서 §04 탐지 채널 05 "클라우드 API")가 검출한 거버넌스 위반 리소스.
 *  태그 미부착(소유·비용 추적 불가)·개인 구독(조직 계정 밖)·미관리(대장 미등록)는 통제 사각지대이므로,
 *  발견에서 끝내지 않고 보안담당이 태그·소유자 지정 요청 / 회수(종료) / 예외 승인으로 조치한다. */
export interface CloudFinding {
  id: string
  /** 리소스 식별 — 인스턴스 ID·리소스명 요약 */
  resource: string
  /** CSP·리전 */
  provider: string
  /** 계정·구독 — AWS 계정 또는 Azure 구독 */
  account: string
  owner: string
  dept: string
  kind: '태그 미부착' | '개인 구독·계정' | '미관리 리소스'
  detectedBy: string
  firstSeen: string
  risk: RiskLevel
  note?: string
  /** 조치 — 태그·소유자 지정 요청 / 회수(리소스 종료) / 예외 승인(등록된 업무용 리소스) */
  action?: '태그·소유자 지정 요청' | '회수 요청' | '예외 승인'
  actedBy?: string
  actedAt?: string
}

/** 클라우드 리소스 유형별 표준 조치 사유 — 판정 근거로 표시한다. */
export const CLOUD_POLICY: Record<CloudFinding['kind'], string> = {
  '태그 미부착': '소유자·비용센터 태그 없는 리소스 — 소유 불명·비용 추적 불가, 태그·소유자 지정 요청',
  '개인 구독·계정': '조직 계정 밖 개인 구독·개인 액세스키로 생성 — 통제 우회, 회수 우선',
  '미관리 리소스': '자산관리 미등록 클라우드 리소스 — 통제 사각지대, 등록 또는 회수',
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

/** 재탐지 주기 프리셋 — 스케줄러가 지원하는 표준 주기(제품안내서 §04 "재탐지는 도메인별 주기(스케줄러)로 자동 반복").
 *  불규칙 값 방지를 위해 화면·서버가 같은 목록을 쓴다. */
export const SCAN_INTERVALS = ['실시간', '1분', '5분', '15분', '30분', '1시간', '6시간', '12시간', '매일', '주 1회'] as const

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
  /** 검토 시작일 — 검토중 상태로 접수된 시점. 판정 기한(SLA) 경과 판정의 기준(제품안내서 §01 보안담당: Shadow IT 적시 판정) */
  reviewSince?: string
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
  | '취약점 조치 우선순위'
  | 'AI 거버넌스·성능'
  | '부서별 IT 비용 배분'
  | '계약 관리 현황'

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
