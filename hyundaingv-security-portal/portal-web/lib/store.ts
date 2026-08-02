/** 데이터 스토어 — globalThis 싱글턴으로 HMR·서버액션 간 상태 유지.
 *  스텁 단계에서는 대시보드·뱃지·상태바를 채우는 최소 시드만 갖는다.
 *  실서비스에서는 MS-SQL 업무 데이터베이스로 대체된다(제품안내서 §02). */
import { CHANNELS } from '@/portal.config'
import type { Approval, ApprovalLine, BatchRun, ChangeWork, EducationCourse, EducationRecord, ExpenseFlash, Incident, InspectionItem, InspectionPlan, InvestContract, InvestPlan, Notice, Person, PledgeSign, PrintoutRecord, RemoteCheck, SendLogEntry, Settlement, SrRequest, TodoItem, Violation } from './types'

export interface Store {
  inspectionItems: InspectionItem[]
  inspectionPlans: InspectionPlan[]
  educationCourses: EducationCourse[]
  educationRecords: EducationRecord[]
  printouts: PrintoutRecord[]
  remoteChecks: RemoteCheck[]
  violations: Violation[]
  investPlans: InvestPlan[]
  investContracts: InvestContract[]
  settlements: Settlement[]
  expenseFlashes: ExpenseFlash[]
  incidents: Incident[]
  changes: ChangeWork[]
  srRequests: SrRequest[]
  approvals: Approval[]
  /** 문서 유형별 기본 결재선 — 환경설정 > 결재선 관리 */
  approvalLines: ApprovalLine[]
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
    investPlans: [
      { id: 'IP-2026-01', kind: '투자', year: '2026', title: 'ERP 리포트 모듈 고도화', owner: '김현우', dept: '개발1팀', amount: 12000, status: '확정' },
      { id: 'IP-2026-02', kind: '투자', year: '2026', title: '보안관제 시스템 증설', owner: '박정호', dept: 'IT운영팀', amount: 8000, status: '확정' },
      { id: 'IP-2026-03', kind: '투자', year: '2026', title: '테스트 자동화 도입', owner: '김현우', dept: '개발1팀', amount: 3000, status: '작성중' },
      { id: 'IP-2026-04', kind: '비용', year: '2026', title: '클라우드 인프라 이용료', owner: '이수진', dept: '경영지원팀', amount: 24000, status: '확정' },
      { id: 'IP-2026-05', kind: '비용', year: '2026', title: 'SW 유지보수료', owner: '박정호', dept: 'IT운영팀', amount: 9000, status: '확정' },
    ],
    investContracts: [
      { id: 'CT-2026-01', kind: '투자', planId: 'IP-2026-01', vendor: '에이원정보', title: 'ERP 리포트 모듈 구축 계약', amount: 7000, signedAt: '2026-06-30' },
      { id: 'CT-2026-02', kind: '투자', planId: 'IP-2026-02', vendor: '비솔루션', title: '보안관제 증설 1차 계약', amount: 5000, signedAt: '2026-07-14' },
      { id: 'CT-2026-03', kind: '비용', planId: 'IP-2026-04', vendor: '씨클라우드', title: '클라우드 연간 이용 계약', amount: 24000, signedAt: '2026-01-05' },
    ],
    settlements: [
      { id: 'ST-2026-01', contractId: 'CT-2026-01', item: '착수금', amount: 2100, status: '지급완료', requestedBy: '김현우', requestedAt: '2026-07-05' },
      { id: 'ST-2026-02', contractId: 'CT-2026-03', item: '월정산', amount: 2000, status: '지급완료', requestedBy: '이수진', requestedAt: '2026-07-31' },
    ],
    expenseFlashes: [
      { id: 'EF-2026-31', month: '2026-07', vendor: '씨클라우드', planId: 'IP-2026-04', expected: 2000 },
      { id: 'EF-2026-32', month: '2026-08', vendor: '씨클라우드', planId: 'IP-2026-04', expected: 2000 },
      { id: 'EF-2026-33', month: '2026-08', vendor: '유지보수파트너', planId: 'IP-2026-05', expected: 750 },
    ],
    printouts: [],
    remoteChecks: [
      { name: '한지원', dept: 'IT운영팀', period: '2026-08', submittedAt: '2026-08-01' },
      { name: '정민서', dept: '경영지원팀', period: '2026-08', submittedAt: '2026-08-01' },
    ],
    violations: [
      { id: 'VL-2026-07', name: '강도윤', dept: '정보기획팀', type: '출력물 방치', detail: '공용 프린터에 개인정보 포함 출력물 방치 (7/29 야간 점검)', occurredAt: '2026-07-29', status: '징구중' },
    ],
    educationCourses: [
      { id: 'ED-2026-01', year: '2026', title: '상반기 정보보호 교육', target: '전임직원', plannedMonth: '2026-06', status: '완료' },
      { id: 'ED-2026-02', year: '2026', title: '개인정보보호 실무 교육', target: '전임직원', plannedMonth: '2026-09', status: '계획' },
      { id: 'ED-2026-03', year: '2026', title: '시큐어코딩 교육', target: '개발자', plannedMonth: '2026-10', status: '계획' },
    ],
    educationRecords: [
      { courseId: 'ED-2026-01', name: '최은영', dept: '개발1팀', completedAt: '2026-06-19' },
      { courseId: 'ED-2026-01', name: '이수진', dept: '경영지원팀', completedAt: '2026-06-19' },
      { courseId: 'ED-2026-01', name: '정민서', dept: '경영지원팀', completedAt: '2026-06-20' },
      { courseId: 'ED-2026-01', name: '박정호', dept: 'IT운영팀', completedAt: '2026-06-19' },
      { courseId: 'ED-2026-01', name: '한지원', dept: 'IT운영팀', completedAt: '2026-06-20' },
      { courseId: 'ED-2026-01', name: '시스템관리자', dept: '정보기획팀', completedAt: '2026-06-19' },
      { courseId: 'ED-2026-01', name: '강도윤', dept: '정보기획팀', completedAt: '2026-06-20' },
    ],
    inspectionItems: [
      { id: 'CK-01', category: '접근통제', control: '중요 시스템 계정·권한 정기 검토', cycle: '분기', source: 'ISMS' },
      { id: 'CK-02', category: '접근통제', control: '퇴직·전보자 계정 회수 점검', cycle: '월', source: 'ISMS' },
      { id: 'CK-03', category: '운영보안', control: '보안패치 적용 현황 점검', cycle: '분기', source: 'ISMS' },
      { id: 'CK-04', category: '개인정보', control: '개인정보 취급 화면 접근이력 점검', cycle: '반기', source: 'ISMS' },
      { id: 'CK-05', category: '물리보안', control: '전산실 출입기록 대사', cycle: '분기', source: '외부기관' },
    ],
    inspectionPlans: [
      { id: 'IS-2026-21', itemId: 'CK-01', month: '2026-07', inspector: '박정호', status: '완료', result: '전 시스템 계정 검토 완료, 미사용 계정 3건 회수' },
      { id: 'IS-2026-22', itemId: 'CK-02', month: '2026-07', inspector: '박정호', status: '결과미등록' },
      { id: 'IS-2026-23', itemId: 'CK-03', month: '2026-08', inspector: '박정호', status: '계획' },
      { id: 'IS-2026-24', itemId: 'CK-04', month: '2026-08', inspector: '한지원', status: '계획' },
    ],
    incidents: [
      { id: 'FL-2026-11', system: 'ERP', title: 'DB 커넥션 풀 고갈로 응답 지연', grade: '2등급', occurredAt: '2026-07-18', status: '조치완료', action: '커넥션 풀 확대 및 누수 쿼리 수정', countermeasure: '커넥션 사용량 임계 알림 구축', reportStatus: '미상신' },
      { id: 'FL-2026-12', system: '그룹웨어', title: '대용량 첨부 업로드 실패', grade: '3등급', occurredAt: '2026-07-25', status: '조치완료', action: '스토리지 용량 증설', reportStatus: '미상신' },
      { id: 'FL-2026-13', system: '영업정보시스템', title: '야간 집계 배치 지연', grade: '3등급', occurredAt: '2026-08-01', status: '조치중', reportStatus: '미상신' },
    ],
    changes: [
      { id: 'CW-2026-05', kind: '인프라', title: 'WAS 보안패치 적용', status: '작업등록승인', registeredAt: '2026-07-24', plan: '패치 적용 후 재기동, 실패 시 스냅샷 원복' },
    ],
    srRequests: [
      { srNo: 'SR-2026-0141', kind: '시스템개발', title: '판매 실적 리포트 화면 개선', system: '영업정보시스템', requester: '김현우', dept: '개발1팀', status: '개발중', requestedAt: '2026-07-21', ci: '박정호', dueDate: '2026-08-14' },
      { srNo: 'SR-2026-0145', kind: '데이터', title: '월별 정산 데이터 추출 요청', system: 'ERP', requester: '김현우', dept: '개발1팀', status: '결재중', requestedAt: '2026-07-29' },
      { srNo: 'SR-2026-0146', kind: '계정/권한', title: '신규 입사자 그룹웨어 권한 부여', system: '그룹웨어', requester: '이수진', dept: '경영지원팀', status: 'CI배정', requestedAt: '2026-07-30' },
      { srNo: 'SR-2026-0132', kind: '시스템개발', title: '구매 발주 승인 프로세스 변경', system: '구매시스템', requester: '박정호', dept: 'IT운영팀', status: '적용요청', requestedAt: '2026-07-08', ci: '박정호', dueDate: '2026-07-31' },
    ],
    approvalLines: [
      { docType: 'SR 신청', approver: '박정호' },
      { docType: '투자 정산품의', approver: '박정호' },
      { docType: '비용 정산품의', approver: '박정호' },
      { docType: '변경계획 상신', approver: '시스템관리자' },
      { docType: '변경결과 상신', approver: '시스템관리자' },
      { docType: '장애보고 상신', approver: '시스템관리자' },
      { docType: '점검결과 상신', approver: '시스템관리자' },
      { docType: '출력물폐기 상신', approver: '박정호' },
      { docType: '보안위반 확인서', approver: '박정호' },
      { docType: '서약 현황 상신', approver: '박정호' },
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
