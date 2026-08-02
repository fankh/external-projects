/** 도메인 타입 — 전사 IT·보안 거버넌스 포털 제품안내서의 운영 주체·데이터 모델 */

/** 운영 주체 (권한그룹) — 제품안내서 §01
 *  사용자: 본인 업무(투자·비용 계획, 서약서, SR 신청 등) 작성·조회 및 결재 상신
 *  부서담당: 부서 단위 서약·폐기 현황 취합, 결재 상신 및 부서 진행현황 관리
 *  업무담당: 전사 단위 업무(SR 배정, 인프라·장애·점검) 처리 및 현황 관리
 *  Admin: 사용자·권한·메뉴·공통코드·양식 등 시스템 전반 관리 */
export type Role = 'USER' | 'DEPT_MGR' | 'BIZ_MGR' | 'ADMIN'

export const ROLE_LABEL: Record<Role, string> = {
  USER: '사용자',
  DEPT_MGR: '부서담당',
  BIZ_MGR: '업무담당',
  ADMIN: 'Admin',
}

/** SR 3종 (시스템개발 · 데이터 · 계정/권한) */
export type SrKind = '시스템개발' | '데이터' | '계정/권한'
export type SrStatus = '작성중' | '결재중' | 'CI배정' | '개발중' | '테스트' | '적용요청' | '완료' | '반려'

export interface SrRequest {
  srNo: string
  kind: SrKind
  title: string
  system: string
  requester: string
  dept: string
  status: SrStatus
  requestedAt: string
  /** 요청 내용 (신청 화면 입력) */
  content?: string
  /** 담당 CI — CI 배정 시 지정 */
  ci?: string
  dueDate?: string
  completedAt?: string
}

/** SR 진행 단계 순서 — 시스템개발 SR 파이프라인 (제품안내서 §03) */
export const SR_FLOW: SrStatus[] = ['작성중', '결재중', 'CI배정', '개발중', '테스트', '적용요청', '완료']

export type ApprovalStatus = '대기' | '승인' | '반려'

export type ApprovalDocType = '투자 정산품의' | '비용 정산품의' | 'SR 신청' | '변경계획 상신' | '서약 현황 상신' | '장애보고 상신'

export interface Approval {
  id: string
  docType: ApprovalDocType
  title: string
  drafter: string
  dept: string
  approver: string
  status: ApprovalStatus
  draftedAt: string
  /** 결재 대상 업무 문서 참조 (SR번호 등) — 승인·반려가 해당 업무 상태로 전파된다 */
  ref?: string
  decidedAt?: string
}

export interface TodoItem {
  id: string
  owner: string
  kind: '보안서약서' | '보안교육' | '재택 체크리스트' | '출력물 폐기확인' | 'SR 처리' | '결재'
  title: string
  dueDate: string
  done: boolean
}

export interface Notice {
  id: string
  title: string
  category: '공지' | '보안' | '시스템'
  author: string
  postedAt: string
  pinned?: boolean
}

/** 임직원 디렉터리 — 인사정보 연동 목업 (부서 현황 집계 기준) */
export interface Person {
  name: string
  dept: string
}

export type PledgeKind = '일반' | '관리책임자' | '재택근무' | '특별'

/** 보안서약 제출 기록 — 연도·양식 개정일자 기준 */
export interface PledgeSign {
  name: string
  dept: string
  year: string
  kind: PledgeKind
  signedAt: string
  method: '온라인' | '서면(스캔)'
}

/** IT 투자 — 경영계획(투자과제) → 시행(계약) → 정산품의 → 계획대비실적 (제품안내서 §03) */
export interface InvestPlan {
  id: string
  year: string
  title: string
  owner: string
  dept: string
  /** 계획 금액 (만원) */
  amount: number
  status: '작성중' | '확정'
}

export interface InvestContract {
  id: string
  /** 경영계획 과제 참조 — 계획외 건은 미지정 (요구사항: 계획 미반영건 추가 가능) */
  planId?: string
  vendor: string
  title: string
  amount: number
  signedAt: string
}

export type SettlementItem = '착수금' | '중도금' | '잔금'

export interface Settlement {
  id: string
  contractId: string
  item: SettlementItem
  amount: number
  status: '결재중' | '지급완료' | '반려'
  requestedBy: string
  requestedAt: string
}

/** 발송 이력 — 어댑터 경유 메일·문자 발송 기록 (연동·인프라 화면에서 추적) */
export interface SendLogEntry {
  channelId: string
  to: number
  subject: string
  ok: boolean
  detail: string
  at: string
}

export interface BatchRun {
  job: string
  ranAt: string
  result: '성공' | '실패'
}
