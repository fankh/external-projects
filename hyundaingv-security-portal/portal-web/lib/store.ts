/** 데이터 스토어 — globalThis 싱글턴으로 HMR·서버액션 간 상태 유지.
 *  스텁 단계에서는 대시보드·뱃지·상태바를 채우는 최소 시드만 갖는다.
 *  실서비스에서는 MS-SQL 업무 데이터베이스로 대체된다(제품안내서 §02). */
import { CHANNELS } from '@/portal.config'
import type { Approval, BatchRun, Notice, Person, PledgeSign, SendLogEntry, SrRequest, TodoItem } from './types'

export interface Store {
  srRequests: SrRequest[]
  approvals: Approval[]
  todos: TodoItem[]
  notices: Notice[]
  people: Person[]
  pledges: PledgeSign[]
  /** 연동 채널 활성 상태 (channelId → on/off) — 정의는 portal.config.ts, 상태는 런타임 */
  channelStates: Record<string, boolean>
  sendLog: SendLogEntry[]
  batchRuns: BatchRun[]
  /** 자산등록번호 취득 이력 — 자산관리시스템 API 연계 결과 */
  assetAcquisitions: { serial: string; model: string; assetNo: string; by: string; at: string }[]
}

function seed(): Store {
  return {
    srRequests: [
      { srNo: 'SR-2026-0141', kind: '시스템개발', title: '판매 실적 리포트 화면 개선', system: '영업정보시스템', requester: '김현우', dept: '개발1팀', status: '개발중', requestedAt: '2026-07-21', ci: '박정호', dueDate: '2026-08-14' },
      { srNo: 'SR-2026-0145', kind: '데이터', title: '월별 정산 데이터 추출 요청', system: 'ERP', requester: '김현우', dept: '개발1팀', status: '결재중', requestedAt: '2026-07-29' },
      { srNo: 'SR-2026-0146', kind: '계정/권한', title: '신규 입사자 그룹웨어 권한 부여', system: '그룹웨어', requester: '이수진', dept: '경영지원팀', status: 'CI배정', requestedAt: '2026-07-30' },
      { srNo: 'SR-2026-0132', kind: '시스템개발', title: '구매 발주 승인 프로세스 변경', system: '구매시스템', requester: '박정호', dept: 'IT운영팀', status: '적용요청', requestedAt: '2026-07-08', ci: '박정호', dueDate: '2026-07-31' },
    ],
    approvals: [
      { id: 'AP-2026-0712', docType: 'SR 신청', title: '월별 정산 데이터 추출 요청', drafter: '김현우', dept: '개발1팀', approver: '박정호', status: '대기', draftedAt: '2026-07-29', ref: 'SR-2026-0145' },
      { id: 'AP-2026-0709', docType: '비용 정산품의', title: '7월 클라우드 이용료 정산', drafter: '이수진', dept: '경영지원팀', approver: '시스템관리자', status: '대기', draftedAt: '2026-07-28' },
      { id: 'AP-2026-0701', docType: '변경계획 상신', title: 'WAS 보안패치 적용 계획', drafter: '박정호', dept: 'IT운영팀', approver: '시스템관리자', status: '승인', draftedAt: '2026-07-24', decidedAt: '2026-07-25' },
    ],
    todos: [
      { id: 'TD-101', owner: '김현우', kind: '보안서약서', title: '2026년 일반 보안서약서 제출', dueDate: '2026-08-10', done: false },
      { id: 'TD-102', owner: '김현우', kind: '보안교육', title: '상반기 정보보호 교육 이수', dueDate: '2026-08-20', done: false },
      { id: 'TD-103', owner: '이수진', kind: '출력물 폐기확인', title: '7월 부서 출력물 폐기현황 취합', dueDate: '2026-08-05', done: false },
      { id: 'TD-104', owner: '박정호', kind: 'SR 처리', title: 'SR-2026-0146 CI 배정', dueDate: '2026-08-04', done: false },
      { id: 'TD-105', owner: '박정호', kind: '결재', title: 'AP-2026-0712 결재 처리', dueDate: '2026-08-04', done: false },
    ],
    notices: [
      { id: 'NT-31', title: '8월 정기 서버 점검 안내 (8/9 02:00~06:00)', category: '시스템', author: '시스템관리자', postedAt: '2026-07-31', pinned: true },
      { id: 'NT-30', title: '2026년 보안서약서 전 임직원 제출 안내', category: '보안', author: '박정호', postedAt: '2026-07-28', pinned: true },
      { id: 'NT-29', title: '상반기 정보보호 교육 이수 마감 안내', category: '보안', author: '박정호', postedAt: '2026-07-24' },
      { id: 'NT-28', title: '그룹웨어 결재 연동 개선 배포 안내', category: '공지', author: '시스템관리자', postedAt: '2026-07-18' },
    ],
    people: [
      { name: '김현우', dept: '개발1팀' },
      { name: '최은영', dept: '개발1팀' },
      { name: '이수진', dept: '경영지원팀' },
      { name: '정민서', dept: '경영지원팀' },
      { name: '박정호', dept: 'IT운영팀' },
      { name: '한지원', dept: 'IT운영팀' },
      { name: '시스템관리자', dept: '정보기획팀' },
      { name: '강도윤', dept: '정보기획팀' },
    ],
    pledges: [
      { name: '이수진', dept: '경영지원팀', year: '2026', kind: '일반', signedAt: '2026-07-12', method: '온라인' },
      { name: '정민서', dept: '경영지원팀', year: '2026', kind: '일반', signedAt: '2026-07-15', method: '온라인' },
      { name: '박정호', dept: 'IT운영팀', year: '2026', kind: '일반', signedAt: '2026-07-10', method: '온라인' },
      { name: '한지원', dept: 'IT운영팀', year: '2026', kind: '일반', signedAt: '2026-07-21', method: '서면(스캔)' },
      { name: '시스템관리자', dept: '정보기획팀', year: '2026', kind: '일반', signedAt: '2026-07-09', method: '온라인' },
      { name: '박정호', dept: 'IT운영팀', year: '2026', kind: '관리책임자', signedAt: '2026-07-10', method: '온라인' },
    ],
    channelStates: Object.fromEntries(CHANNELS.map((c) => [c.id, c.enabledByDefault])),
    sendLog: [],
    assetAcquisitions: [],
    batchRuns: [
      { job: '인사정보 동기화', ranAt: '2026-08-02 05:00', result: '성공' },
      { job: '미서약자 안내메일 발송', ranAt: '2026-08-01 08:00', result: '성공' },
    ],
  }
}

const g = globalThis as typeof globalThis & { __ngvPortalStore?: Store }

export function getStore(): Store {
  if (!g.__ngvPortalStore) g.__ngvPortalStore = seed()
  return g.__ngvPortalStore
}

/** 채번 — 'PREFIX-YYYY-NNNN' 형식에서 연도 내 최대 시퀀스 + 1 */
export function nextNo(prefix: string, year: string, existing: string[]): string {
  const head = `${prefix}-${year}-`
  const max = existing
    .filter((n) => n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0)
  return `${head}${String(max + 1).padStart(4, '0')}`
}
