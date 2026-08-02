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
  dueDate?: string
}

export type ApprovalStatus = '대기' | '승인' | '반려'

export interface Approval {
  id: string
  docType: '투자 정산품의' | '비용 정산품의' | 'SR 신청' | '변경계획 상신' | '서약 현황 상신' | '장애보고 상신'
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

/** 연동 채널 (이메일·문자·인사정보·SSO 등) — 상태바 표시용 */
export interface Integration {
  name: string
  kind: '이메일' | '문자' | '인사정보' | 'SSO(SAML)' | '자산관리 API' | '그룹웨어'
  enabled: boolean
}

export interface BatchRun {
  job: string
  ranAt: string
  result: '성공' | '실패'
}
