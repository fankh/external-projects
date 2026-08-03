/** 데이터 스토어 — globalThis 싱글턴으로 HMR·서버액션 간 상태 유지.
 *  PORTAL_DATA_FILE 이 설정되면 파일 기반으로 영속화되어 서버 재시작 후에도 유지된다
 *  (itam-web DATA_FILE 패턴). 미설정(로컬 개발·스모크)이면 순수 인메모리라 매 기동 시 시드로 초기화된다.
 *  실서비스에서는 MS-SQL 업무 데이터베이스로 대체된다(제품안내서 §02). */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { CHANNELS } from '@/portal.config'
import type { Approval, ApprovalLine, Attachment, AuditLog, BatchJob, BatchRun, ChangeWork, CodeGroup, CompanyPledge, Deliverable, EducationCourse, EducationRecord, ExcelTemplate, ExpenseFlash, Incident, InspectionItem, InspectionPlan, InterfaceDef, InvestContract, InvestPlan, Notice, Person, PledgeForm, PledgeSign, PrintoutRecord, Project, ProjectIssue, ProjectNote, QnaPost, RemoteCheck, SendLogEntry, ServerInfo, Settlement, SrRequest, SystemInfo, TodoItem, Violation } from './types'

export interface Store {
  inspectionItems: InspectionItem[]
  inspectionPlans: InspectionPlan[]
  educationCourses: EducationCourse[]
  educationRecords: EducationRecord[]
  printouts: PrintoutRecord[]
  remoteChecks: RemoteCheck[]
  violations: Violation[]
  projects: Project[]
  deliverables: Deliverable[]
  projectIssues: ProjectIssue[]
  projectNotes: ProjectNote[]
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
  pledgeForms: PledgeForm[]
  /** 부서별 보안담당자 — 특별서약 대상 */
  securityOfficers: string[]
  companyPledges: CompanyPledge[]
  servers: ServerInfo[]
  systems: SystemInfo[]
  batchJobs: BatchJob[]
  interfaces: InterfaceDef[]
  qna: QnaPost[]
  codeGroups: CodeGroup[]
  excelTemplates: ExcelTemplate[]
  /** 공통 첨부 — refId(업무 문서 번호)로 전 모듈이 공유 */
  attachments: Attachment[]
  /** 감사 이력 — 통제 행위 append-only */
  auditLogs: AuditLog[]
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
    projects: [
      { id: 'PJ-2026-01', title: 'ERP 리포트 모듈 구축', contractId: 'CT-2026-01', manager: '박정호', headcount: 4, start: '2026-07-01', end: '2026-10-31', progress: 35, status: '진행중' },
      { id: 'PJ-2026-02', title: '보안관제 증설 구축', contractId: 'CT-2026-02', manager: '한지원', headcount: 2, start: '2026-07-20', end: '2026-09-30', progress: 15, status: '진행중' },
    ],
    deliverables: [
      { id: 'DL-01', projectId: 'PJ-2026-01', name: '요구사항정의서', due: '2026-07-11', done: true },
      { id: 'DL-02', projectId: 'PJ-2026-01', name: '화면 설계서', due: '2026-07-31', done: true },
      { id: 'DL-03', projectId: 'PJ-2026-01', name: '개발 산출물 (소스·단위테스트)', due: '2026-09-30', done: false },
      { id: 'DL-04', projectId: 'PJ-2026-01', name: '통합테스트 결과서', due: '2026-10-20', done: false },
      { id: 'DL-05', projectId: 'PJ-2026-02', name: '증설 구성도', due: '2026-08-08', done: false },
    ],
    projectIssues: [
      { id: 'PI-2026-01', projectId: 'PJ-2026-01', title: '레거시 리포트 데이터 정합성 오류', risk: '높음', status: '오픈', raisedAt: '2026-07-28' },
    ],
    projectNotes: [
      { id: 'PN-2026-01', projectId: 'PJ-2026-01', kind: '회의록', title: '킥오프 회의 — 범위·일정 확정', author: '박정호', writtenAt: '2026-07-02' },
      { id: 'PN-2026-02', projectId: 'PJ-2026-01', kind: '주간보고', title: '7월 4주차 — 설계 완료, 개발 착수', author: '박정호', writtenAt: '2026-07-25' },
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
      { docType: '부서서약 현황 상신', approver: '박정호' },
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
    pledgeForms: [
      { kind: '일반', revisedAt: '2026-01-02' },
      { kind: '관리책임자', revisedAt: '2026-01-02' },
      { kind: '재택근무', revisedAt: '2026-03-02' },
      { kind: '특별', revisedAt: '2026-01-02' },
    ],
    securityOfficers: ['박정호'],
    companyPledges: [
      { id: 'CP-2026-01', company: '에이원정보', personName: '오세훈', registeredAt: '2026-07-03', status: '완료' },
      { id: 'CP-2026-02', company: '비솔루션', personName: '임가람', registeredAt: '2026-07-28', status: '등록' },
    ],
    servers: [
      { id: 'SV-01', hostname: 'ngv-web-01', ip: '10.10.1.11', purpose: 'Web', os: 'Windows Server 2022', rack: 'A-01', diskUsedPct: 42 },
      { id: 'SV-02', hostname: 'ngv-was-01', ip: '10.10.1.21', purpose: 'WAS', os: 'Windows Server 2022', rack: 'A-01', diskUsedPct: 63 },
      { id: 'SV-03', hostname: 'ngv-db-01', ip: '10.10.1.31', purpose: 'DB', os: 'Windows Server 2022 · MS-SQL', rack: 'A-02', diskUsedPct: 91 },
      { id: 'SV-04', hostname: 'ngv-bat-01', ip: '10.10.1.41', purpose: '배치', os: 'Windows Server 2019', rack: 'B-01', diskUsedPct: 55 },
    ],
    systems: [
      { id: 'SYS-01', name: 'ERP', url: 'https://erp.internal', env: '운영계', serverIds: ['SV-02', 'SV-03'], owner: '박정호' },
      { id: 'SYS-02', name: '그룹웨어', url: 'https://gw.internal', env: '운영계', serverIds: ['SV-01'], owner: '한지원' },
      { id: 'SYS-03', name: '영업정보시스템', url: 'https://sales.internal', env: '운영계', serverIds: ['SV-02', 'SV-04'], owner: '박정호' },
      { id: 'SYS-04', name: 'ERP (개발계)', url: 'https://erp-dev.internal', env: '개발계', serverIds: ['SV-04'], owner: '김현우' },
    ],
    batchJobs: [
      { id: 'BJ-01', name: '인사정보 동기화', system: '그룹웨어', schedule: '일', lastRun: '2026-08-02 05:00', lastResult: '성공' },
      { id: 'BJ-02', name: '출력물 자료 이관', system: '보안·출력물 시스템', schedule: '일', lastRun: '2026-08-01 23:30', lastResult: '성공' },
      { id: 'BJ-03', name: '영업 실적 집계', system: '영업정보시스템', schedule: '일', lastRun: '2026-08-01 23:00', lastResult: '실패' },
      { id: 'BJ-04', name: '월 비용 속보 마감', system: 'ERP', schedule: '월', lastRun: '2026-07-31 18:00', lastResult: '성공' },
    ],
    interfaces: [
      { id: 'IF-01', name: '그룹웨어 결재 연계', from: '포털', to: '그룹웨어', method: 'REST API', status: '정상' },
      { id: 'IF-02', name: '인사 기본정보 수신', from: '인사·근태 시스템', to: '포털', method: '파일', status: '정상' },
      { id: 'IF-03', name: '자산정보 조회', from: '포털', to: '자산관리시스템', method: 'REST API', status: '정상' },
      { id: 'IF-04', name: '출력물 자료 수신', from: '보안·출력물 시스템', to: '포털', method: 'DB 연계', status: '오류' },
    ],
    auditLogs: [
      { at: '2026-07-25 10:12', actor: '시스템관리자', action: '결재 승인', detail: 'AP-2026-0701 변경계획 상신 — WAS 보안패치 적용 계획' },
    ],
    attachments: [
      { id: 'AT-2026-0001', refId: 'CT-2026-01', name: 'ERP리포트모듈_계약서.pdf', sizeKb: 842, uploadedBy: '김현우', at: '2026-06-30' },
      { id: 'AT-2026-0002', refId: 'CT-2026-01', name: '보안관리약정서.pdf', sizeKb: 310, uploadedBy: '김현우', at: '2026-06-30' },
      { id: 'AT-2026-0003', refId: 'SR-2026-0141', name: '리포트_개선_요구사항.xlsx', sizeKb: 96, uploadedBy: '김현우', at: '2026-07-21' },
    ],
    codeGroups: [
      { id: 'FAULT_GRADE', name: '장애등급', values: [{ code: '1등급', enabled: true }, { code: '2등급', enabled: true }, { code: '3등급', enabled: true }] },
      { id: 'SR_KIND', name: 'SR 유형', values: [{ code: '시스템개발', enabled: true }, { code: '데이터', enabled: true }, { code: '계정/권한', enabled: true }] },
      { id: 'INSPECT_CYCLE', name: '점검 주기', values: [{ code: '월', enabled: true }, { code: '분기', enabled: true }, { code: '반기', enabled: true }, { code: '년', enabled: true }] },
      { id: 'VIOLATION_TYPE', name: '보안위반 유형', values: [{ code: '출력물 방치', enabled: true }, { code: '화면 미잠금', enabled: true }, { code: '인가되지 않은 USB 사용', enabled: true }] },
      { id: 'DISCARD_METHOD', name: '출력물 폐기방법', values: [{ code: '세단', enabled: true }, { code: '소각', enabled: true }] },
      { id: 'SETTLE_ITEM', name: '정산 지급항목', values: [{ code: '착수금', enabled: true }, { code: '중도금', enabled: true }, { code: '잔금', enabled: true }, { code: '월정산', enabled: true }] },
    ],
    excelTemplates: [
      { id: 'XT-01', name: '장애보고 취합 양식', docType: '장애보고 상신', version: 3, uploadedAt: '2026-06-10' },
      { id: 'XT-02', name: '인프라변경 작업계획 양식', docType: '변경계획 상신', version: 2, uploadedAt: '2026-05-22' },
      { id: 'XT-03', name: '비용계획 수립 양식', docType: '비용 정산품의', version: 1, uploadedAt: '2026-01-15' },
      { id: 'XT-04', name: '보안성검토 체크리스트', docType: '공통', version: 1, uploadedAt: '2026-02-01' },
    ],
    qna: [
      { id: 'QA-2026-11', title: 'SR 적용요청 후 반영 일정이 궁금합니다', domain: 'IT Request', author: '김현우', dept: '개발1팀', askedAt: '2026-07-30', assignee: '박정호', answer: '적용요청 결재완료 건은 변경관리 편입 후 매주 수요일 반영됩니다.', answeredBy: '박정호', answeredAt: '2026-07-31' },
      { id: 'QA-2026-12', title: '재택근무 체크리스트 제출 주기가 어떻게 되나요?', domain: '임직원 의식제고', author: '정민서', dept: '경영지원팀', askedAt: '2026-08-01' },
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

const g = globalThis as typeof globalThis & {
  __ngvPortalStore?: Store
  __ngvPortalSaveTimer?: NodeJS.Timeout
  __ngvPortalExitHook?: boolean
}

const DATA_FILE = process.env.PORTAL_DATA_FILE

function loadFromFile(): Store | null {
  if (!DATA_FILE || !existsSync(DATA_FILE)) return null
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Partial<Store>
    // 구버전 파일에 새 컬렉션이 없어도 죽지 않도록 시드 위에 얹는다
    return { ...seed(), ...raw }
  } catch {
    return null
  }
}

function saveNow(s: Store) {
  if (!DATA_FILE) return
  try {
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    const tmp = `${DATA_FILE}.tmp`
    writeFileSync(tmp, JSON.stringify(s), 'utf8')
    renameSync(tmp, DATA_FILE)
  } catch { /* 디스크 오류는 데모 흐름을 막지 않는다 */ }
}

/** 디바운스 저장 — 모든 뮤테이션은 getStore() 를 거치므로, 호출 시마다 저장을 예약하면
 *  액션 직후 상태가 파일에 반영된다. 임시 파일 → rename 으로 부분 쓰기를 막는다.
 *  종료 훅이 디바운스 창(300ms) 안의 마지막 뮤테이션을 동기 플러시로 보전한다. */
function scheduleSave(s: Store) {
  if (!DATA_FILE) return
  clearTimeout(g.__ngvPortalSaveTimer)
  g.__ngvPortalSaveTimer = setTimeout(() => saveNow(s), 300)
  if (!g.__ngvPortalExitHook) {
    g.__ngvPortalExitHook = true
    // 'exit' 는 정상 종료·process.exit() 에서 발화한다 (SIGTERM 은 Next 의 graceful shutdown 이
    // process.exit 로 이어진다). 핸들러는 동기만 허용되므로 saveNow 를 그대로 쓴다.
    process.on('exit', () => {
      clearTimeout(g.__ngvPortalSaveTimer)
      if (g.__ngvPortalStore) saveNow(g.__ngvPortalStore)
    })
  }
}

export function getStore(): Store {
  if (!g.__ngvPortalStore) g.__ngvPortalStore = loadFromFile() ?? seed()
  scheduleSave(g.__ngvPortalStore)
  return g.__ngvPortalStore
}

/** 일일 백업 로테이션 — tmp→rename 은 부분 쓰기만 막는다. 논리적 손상(잘못된 상태가
 *  그대로 저장된 경우)의 복구 지점으로 일자별 스냅샷을 남기고 오래된 것부터 지운다.
 *  같은 날 반복 호출은 같은 파일을 덮어써 멱등이다. 스케줄러 틱에서 호출된다. */
export function backupDataFile(keep = 7): string | null {
  if (!DATA_FILE || !existsSync(DATA_FILE)) return null
  try {
    const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10) // KST 일자
    const dst = `${DATA_FILE}.${stamp}.bak`
    copyFileSync(DATA_FILE, dst)
    const dir = dirname(DATA_FILE)
    const prefix = `${basename(DATA_FILE)}.`
    const baks = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.bak')).sort()
    for (const old of baks.slice(0, Math.max(0, baks.length - keep))) unlinkSync(join(dir, old))
    return dst
  } catch {
    return null // 디스크 오류는 데모 흐름을 막지 않는다
  }
}

/** 배치 실행 기록 — 상태바 '마지막 배치'의 원천. 이력 상한으로 영속 파일 비대를 막는다. */
export function recordBatch(job: string, ranAt: string, result: '성공' | '실패'): void {
  const s = getStore()
  s.batchRuns.unshift({ job, ranAt, result })
  if (s.batchRuns.length > 200) s.batchRuns.length = 200
}

/** 채번 — 'PREFIX-YYYY-NNNN' 형식에서 연도 내 최대 시퀀스 + 1 */
export function nextNo(prefix: string, year: string, existing: string[]): string {
  const head = `${prefix}-${year}-`
  const max = existing
    .filter((n) => n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0)
  return `${head}${String(max + 1).padStart(4, '0')}`
}
