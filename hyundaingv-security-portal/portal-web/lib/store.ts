/** 데이터 스토어 — globalThis 싱글턴으로 HMR·서버액션 간 상태 유지.
 *  PORTAL_DATA_FILE 이 설정되면 파일 기반으로 영속화되어 서버 재시작 후에도 유지된다
 *  (itam-web DATA_FILE 패턴). 미설정(로컬 개발·스모크)이면 순수 인메모리라 매 기동 시 시드로 초기화된다.
 *  실서비스에서는 MS-SQL 업무 데이터베이스로 대체된다(제품안내서 §02). */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { CHANNELS } from '@/portal.config'
import { nowStamp, today } from './dates'
import type { Approval, ApprovalLine, Attachment, AuditLog, BatchJob, BatchRun, ChangeWork, CiSr, CodeGroup, Hardware, CompanyPledge, Deliverable, EducationCourse, EducationRecord, ExcelTemplate, ExpenseFlash, Incident, InspectionItem, InspectionPlan, InterfaceDef, InvestContract, InvestPlan, Notice, Person, PledgeForm, PledgeSign, PrintoutRecord, Project, ProjectIssue, ProjectNote, QnaPost, ComplianceSnapshot, RiskItem, RiskSnapshot, SecurityPolicy, DrPlan, Rack, RemoteCheck, RemoteCycle, RemoteTarget, Role, SecurityReview, SendLogEntry, ServerInfo, Settlement, SrRequest, SystemInfo, TodoItem, UserGroup, Violation } from './types'

export interface Store {
  inspectionItems: InspectionItem[]
  inspectionPlans: InspectionPlan[]
  securityReviews: SecurityReview[]
  securityPolicies: SecurityPolicy[]
  drPlans: DrPlan[]
  riskItems: RiskItem[]
  riskSnapshots: RiskSnapshot[]
  complianceSnapshots: ComplianceSnapshot[]
  educationCourses: EducationCourse[]
  educationRecords: EducationRecord[]
  printouts: PrintoutRecord[]
  remoteChecks: RemoteCheck[]
  remoteTargets: RemoteTarget[]
  /** 재택 체크리스트 등록 주기 (요구사항 54행) — 매일·월·분기·반기. 제출·대상·통계·알림 기간 키의 단일 원천. */
  remoteCycle: RemoteCycle
  ciSrs: CiSr[]
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
  racks: Rack[]
  hardware: Hardware[]
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
  /** 메뉴권한 런타임 제한 (href → 허용 권한그룹 부분집합) — menus.ts 기본 권한의 축소만 가능,
   *  권한 상승 불가·ADMIN 제한 불가 (요구사항 72행 메뉴권한 할당) */
  menuOverrides: Record<string, Role[]>
  /** 기능(Action) 단위 런타임 제한 — 키 `${href}#${action}`, 값 허용 역할(축소만). menuOverrides 의 기능 버전. */
  actionOverrides: Record<string, Role[]>
  /** 사용자 그룹 (구성 가능한 열람 위임) — 4 고정 역할 위에 얹는 가법 부여. 구성원은 부여 메뉴를 추가 열람.
   *  쓰기는 역할 게이트 유지, 부여 대상은 운영 화면뿐(ADMIN 전용 제외). authz.groupGrantsMenu 가 해석한다. */
  userGroups: UserGroup[]
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
      { id: 'IP-2026-06', kind: '투자', year: '2026', title: '테스트 장비 증설', owner: '한지원', dept: 'IT운영팀', amount: 1500, status: '효율화' },
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
      { id: 'EF-2026-31', month: '2026-07', vendor: '씨클라우드', planId: 'IP-2026-04', expected: 2000, history: [] },
      { id: 'EF-2026-32', month: '2026-08', vendor: '씨클라우드', planId: 'IP-2026-04', expected: 2000 },
      { id: 'EF-2026-33', month: '2026-08', vendor: '유지보수파트너', planId: 'IP-2026-05', expected: 750 },
    ],
    projects: [
      { id: 'PJ-2026-01', title: 'ERP 리포트 모듈 구축', contractId: 'CT-2026-01', manager: '박정호', headcount: 4, members: ['김현우', '최은영', '박정호', '한지원'], start: '2026-07-01', end: '2026-10-31', progress: 35, status: '진행중' },
      { id: 'PJ-2026-02', title: '보안관제 증설 구축', contractId: 'CT-2026-02', manager: '한지원', headcount: 2, members: ['한지원', '강도윤'], start: '2026-07-20', end: '2026-09-30', progress: 15, status: '진행중' },
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
    // 재택근무 대상자 명단 (요구사항 54행) — 강도윤은 6월로 종료된 이력
    remoteTargets: [
      { name: '김현우', dept: '개발1팀', startDate: '2026-07-01' },
      { name: '한지원', dept: 'IT운영팀', startDate: '2026-07-15' },
      { name: '정민서', dept: '경영지원팀', startDate: '2026-08-01' },
      { name: '이수진', dept: '경영지원팀', startDate: '2026-08-03' },
      { name: '강도윤', dept: '정보기획팀', startDate: '2026-06-01', endDate: '2026-06-30' },
    ],
    remoteCycle: '월',
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
      { id: 'CK-01', category: '접근통제', subCategory: '계정관리', control: '중요 시스템 계정·권한 정기 검토', cycle: '분기', source: 'ISMS' },
      { id: 'CK-02', category: '접근통제', control: '퇴직·전보자 계정 회수 점검', cycle: '월', source: 'ISMS' },
      { id: 'CK-03', category: '운영보안', control: '보안패치 적용 현황 점검', cycle: '분기', source: 'ISMS' },
      { id: 'CK-04', category: '개인정보', control: '개인정보 취급 화면 접근이력 점검', cycle: '반기', source: 'ISMS' },
      { id: 'CK-05', category: '물리보안', control: '전산실 출입기록 대사', cycle: '분기', source: '외부기관' },
    ],
    inspectionPlans: [
      { id: 'IS-2026-21', itemId: 'CK-01', month: '2026-07', inspector: '박정호', teamLead: '시스템관리자', status: '완료', result: '전 시스템 계정 검토 완료, 미사용 계정 3건 회수' },
      { id: 'IS-2026-22', itemId: 'CK-02', month: '2026-07', inspector: '박정호', teamLead: '시스템관리자', status: '결과미등록' },
      { id: 'IS-2026-23', itemId: 'CK-03', month: '2026-08', inspector: '박정호', teamLead: '시스템관리자', status: '계획' },
      { id: 'IS-2026-24', itemId: 'CK-04', month: '2026-08', inspector: '한지원', teamLead: '박정호', status: '계획' },
    ],
    securityReviews: [
      { id: 'SEC-2026-01', title: '영업정보시스템 시큐어코딩 점검', kind: '시큐어코딩', target: '영업정보시스템', reviewer: '한지원', status: '완료', findings: 8, fixed: 8, critFound: 1, critFixed: 1, highFound: 2, highFixed: 2, medFound: 3, medFixed: 3, lowFound: 2, lowFixed: 2, plannedAt: '2026-06-10', completedAt: '2026-06-28' },
      { id: 'SEC-2026-02', title: '그룹웨어 웹 취약점 점검', kind: '취약점점검', target: '그룹웨어', reviewer: '박정호', status: '조치중', findings: 5, fixed: 2, critFound: 1, critFixed: 0, highFound: 2, highFixed: 1, medFound: 1, medFixed: 1, lowFound: 1, lowFixed: 0, plannedAt: '2026-07-15' },
      { id: 'SEC-2026-03', title: 'ERP 모의해킹', kind: '모의해킹', target: 'ERP', reviewer: '한지원', status: '계획', findings: 0, fixed: 0, critFound: 0, critFixed: 0, highFound: 0, highFixed: 0, medFound: 0, medFixed: 0, lowFound: 0, lowFixed: 0, plannedAt: '2026-09-01' },
    ],
    securityPolicies: [
      { id: 'PL-2026-01', title: '정보보호 기본정책', category: '정책', version: 'v2.0', owner: '한지원', status: '시행', effectiveAt: '2026-01-01', reviewCycleMonths: 12, lastReviewedAt: '2026-01-05' },
      { id: 'PL-2026-02', title: '접근통제 지침', category: '지침', version: 'v1.3', owner: '박정호', status: '시행', effectiveAt: '2024-03-01', reviewCycleMonths: 12, lastReviewedAt: '2025-07-10' },
      { id: 'PL-2026-03', title: '정보자산 관리 절차', category: '절차', version: 'v1.0', owner: '박정호', status: '개정중', effectiveAt: '2025-02-01', reviewCycleMonths: 12, lastReviewedAt: '2025-02-01' },
      { id: 'PL-2026-04', title: '개인정보 처리방침', category: '정책', version: 'v3.1', owner: '이수진', status: '시행', effectiveAt: '2026-06-01', reviewCycleMonths: 6, lastReviewedAt: '2026-06-01' },
    ],
    drPlans: [
      { id: 'DR-2026-01', system: 'ERP', title: 'ERP 재해복구 계획', tier: '핵심', rtoHours: 4, rpoHours: 1, owner: '박정호', testCycleMonths: 12, lastTestedAt: '2026-03-15', lastResult: '성공' },
      { id: 'DR-2026-02', system: '영업정보시스템', title: '영업정보 DR', tier: '중요', rtoHours: 24, rpoHours: 12, owner: '한지원', testCycleMonths: 12, lastTestedAt: '2025-05-20', lastResult: '부분성공' },
      { id: 'DR-2026-03', system: '그룹웨어', title: '그룹웨어 복구 절차', tier: '일반', rtoHours: 48, rpoHours: 24, owner: '박정호', testCycleMonths: 12, lastTestedAt: '2026-06-01', lastResult: '미실시' },
    ],
    riskItems: [
      { id: 'RK-2026-01', title: '개인정보 대량 조회 권한 오남용', area: '영업정보시스템', threat: '내부자 정보유출', vulnerability: '접근권한 최소화 미흡·조회이력 미점검', likelihood: 3, impact: 5, treatment: '완화', owner: '한지원', plan: '조회권한 재점검·이상조회 모니터링 룰 적용', dueDate: '2026-09-30', status: '조치중', identifiedAt: '2026-07-01' },
      { id: 'RK-2026-02', title: '레거시 서버 OS 지원종료(EOL)', area: 'IT 인프라', threat: '알려진 취약점 악용', vulnerability: '보안패치 미적용 구형 OS 운영', likelihood: 4, impact: 4, treatment: '완화', owner: '박정호', plan: 'OS 업그레이드·격리 네트워크 이전', dueDate: '2026-08-15', status: '식별', identifiedAt: '2026-07-10' },
      { id: 'RK-2026-03', title: '협력업체 원격접속 경로 통제 미흡', area: '외주·협력', threat: '외부 경유 침입', vulnerability: 'VPN 계정 공유·접속기간 미제한', likelihood: 2, impact: 4, treatment: '전가', owner: '한지원', plan: '보안관리약정·접속기간 한정·계정 개별화', dueDate: '2026-10-31', status: '식별', identifiedAt: '2026-07-15' },
      { id: 'RK-2026-04', title: '재해복구(DR) 체계 부재', area: 'IT 인프라', threat: '재해·장애 시 업무중단', vulnerability: '백업 소산·복구절차 미검증', likelihood: 2, impact: 5, treatment: '수용', owner: '박정호', plan: '연 1회 복구훈련 계획 수립 전까지 리스크 수용', dueDate: '2026-12-31', status: '식별', identifiedAt: '2026-06-20' },
    ],
    riskSnapshots: [
      { id: 'RS-2026-06', period: '2026-06', at: '2026-06-30 18:00', by: '한지원', total: 5, open: 5, highOpen: 5, overdue: 2, treatedRate: 0 },
      { id: 'RS-2026-07', period: '2026-07', at: '2026-07-31 18:00', by: '한지원', total: 5, open: 4, highOpen: 4, overdue: 1, treatedRate: 20 },
    ],
    complianceSnapshots: [
      { id: 'CS-2026-06', period: '2026-06', at: '2026-06-30 18:00', by: '한지원', score: 56, pledgeRate: 50, eduRate: 80, fixRate: 70, inspDone: 1, inspTotal: 4, highVulns: 4, openVulns: 6, vDone: 0, vTotal: 1 },
      { id: 'CS-2026-07', period: '2026-07', at: '2026-07-31 18:00', by: '한지원', score: 65, pledgeRate: 62, eduRate: 90, fixRate: 80, inspDone: 1, inspTotal: 4, highVulns: 3, openVulns: 4, vDone: 1, vTotal: 1 },
    ],
    incidents: [
      { id: 'FL-2026-11', system: 'ERP', title: 'DB 커넥션 풀 고갈로 응답 지연', grade: '2등급', occurredAt: '2026-07-18', status: '조치완료', action: '커넥션 풀 확대 및 누수 쿼리 수정', countermeasure: '커넥션 사용량 임계 알림 구축', reportStatus: '미상신' },
      { id: 'FL-2026-12', system: '그룹웨어', title: '대용량 첨부 업로드 실패', grade: '3등급', occurredAt: '2026-07-25', status: '조치완료', action: '스토리지 용량 증설', reportStatus: '미상신' },
      { id: 'FL-2026-13', system: '영업정보시스템', title: '야간 집계 배치 지연', grade: '3등급', occurredAt: '2026-08-01', status: '조치중', reportStatus: '미상신' },
    ],
    changes: [
      { id: 'CW-2026-05', kind: '인프라', title: 'WAS 보안패치 적용', status: '작업등록승인', registeredAt: '2026-07-24', plan: '패치 적용 후 순차 재기동, 서비스 점검', rollbackPlan: '적용 전 스냅샷으로 원복, 이전 빌드 재배포' },
    ],
    srRequests: [
      { srNo: 'SR-2026-0141', kind: '시스템개발', title: '판매 실적 리포트 화면 개선', system: '영업정보시스템', requester: '김현우', dept: '개발1팀', status: '개발중', requestedAt: '2026-07-21', ci: '박정호', dueDate: '2026-08-14', manHours: 12 },
      { srNo: 'SR-2026-0145', kind: '데이터', title: '월별 정산 데이터 추출 요청', system: 'ERP', requester: '김현우', dept: '개발1팀', status: '결재중', requestedAt: '2026-07-29' },
      { srNo: 'SR-2026-0146', kind: '계정/권한', title: '신규 입사자 그룹웨어 권한 부여', system: '그룹웨어', requester: '이수진', dept: '경영지원팀', status: 'CI배정', requestedAt: '2026-07-30' },
      { srNo: 'SR-2026-0132', kind: '시스템개발', title: '구매 발주 승인 프로세스 변경', system: '구매시스템', requester: '박정호', dept: 'IT운영팀', status: '적용요청', requestedAt: '2026-07-08', ci: '박정호', dueDate: '2026-07-31' },
    ],
    // 결재 없는 CI 직접 접수 SR (요구사항 25행) — 보안/업무 구분·처리 이력
    ciSrs: [
      { id: 'CS-2026-0001', category: '보안', title: '방화벽 정책 오탐 확인 요청', requester: '보안관제(외부)', system: '방화벽', status: '완료', receivedBy: '박정호', receivedAt: '2026-08-05', completedAt: '2026-08-06', result: '오탐 확인 — 정책 예외 등록' },
      { id: 'CS-2026-0002', category: '업무', title: '월마감 배치 수동 재실행 요청', requester: '정민서', system: 'ERP', status: '접수', receivedBy: '박정호', receivedAt: '2026-08-11' },
    ],
    approvalLines: [
      { docType: 'SR 신청', approver: '박정호' },
      { docType: '적용요청 상신', approver: '박정호' },
      { docType: '투자 정산품의', approver: '박정호' },
      { docType: '비용 정산품의', approver: '박정호' },
      { docType: '변경계획 상신', approver: '시스템관리자' },
      { docType: '변경결과 상신', approver: '시스템관리자' },
      { docType: '장애보고 상신', approver: '시스템관리자' },
      { docType: '점검결과 상신', approver: '이수진', secondApprover: '시스템관리자' },
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
      { kind: '프로젝트', revisedAt: '2026-01-02' },
    ],
    securityOfficers: ['박정호'],
    companyPledges: [
      { id: 'CP-2026-01', company: '에이원정보', personName: '오세훈', registeredAt: '2026-07-03', status: '완료' },
      { id: 'CP-2026-02', company: '비솔루션', personName: '임가람', registeredAt: '2026-07-28', status: '등록' },
    ],
    servers: [
      { id: 'SV-01', hostname: 'ngv-web-01', ip: '10.10.1.11', purpose: 'Web', os: 'Windows Server 2022', rack: 'A-01', hwId: 'HW-01', cpu: '8C 16T', memoryGb: 32, diskUsedPct: 42 },
      { id: 'SV-02', hostname: 'ngv-was-01', ip: '10.10.1.21', purpose: 'WAS', os: 'Windows Server 2022', rack: 'A-01', hwId: 'HW-01', cpu: '16C 32T', memoryGb: 64, diskUsedPct: 63 },
      { id: 'SV-03', hostname: 'ngv-db-01', ip: '10.10.1.31', purpose: 'DB', os: 'Windows Server 2022 · MS-SQL', rack: 'A-02', hwId: 'HW-02', cpu: '16C 32T', memoryGb: 128, diskUsedPct: 91 },
      { id: 'SV-04', hostname: 'ngv-bat-01', ip: '10.10.1.41', purpose: '배치', os: 'Windows Server 2019', rack: 'B-01', hwId: 'HW-05', cpu: '8C 16T', memoryGb: 32, diskUsedPct: 55 },
    ],
    // 랙·H/W (요구사항 28·30행) — 랙구성도의 랙 → H/W → 서버 사슬
    racks: [
      { id: 'A-01', location: '본사 전산실 A열 1번', sizeU: 42, assetNo: 'AST-RK-0001' },
      { id: 'A-02', location: '본사 전산실 A열 2번', sizeU: 42, assetNo: 'AST-RK-0002' },
      { id: 'B-01', location: '본사 전산실 B열 1번', sizeU: 24, assetNo: 'AST-RK-0003' },
    ],
    hardware: [
      { id: 'HW-01', kind: '물리서버', model: 'PowerEdge R750', rackId: 'A-01', assetNo: 'AST-HW-0011' },
      { id: 'HW-02', kind: '물리서버', model: 'PowerEdge R750xs', rackId: 'A-02', assetNo: 'AST-HW-0012' },
      { id: 'HW-03', kind: '네트워크장비', model: 'Catalyst 9300 (코어 스위치)', rackId: 'A-01', assetNo: 'AST-HW-0013' },
      { id: 'HW-04', kind: '스토리지', model: 'Unity XT 480', rackId: 'A-02', assetNo: 'AST-HW-0014' },
      { id: 'HW-05', kind: '물리서버', model: 'ProLiant DL380', rackId: 'B-01', assetNo: 'AST-HW-0015' },
    ],
    systems: [
      { id: 'SYS-01', name: 'ERP', url: 'https://erp.internal', env: '운영계', serverIds: ['SV-02', 'SV-03'], owner: '박정호' },
      { id: 'SYS-02', name: '그룹웨어', url: 'https://gw.internal', env: '운영계', serverIds: ['SV-01'], owner: '한지원' },
      { id: 'SYS-03', name: '영업정보시스템', url: 'https://sales.internal', env: '운영계', serverIds: ['SV-02', 'SV-04'], owner: '박정호' },
      { id: 'SYS-04', name: 'ERP (개발계)', url: 'https://erp-dev.internal', env: '개발계', serverIds: ['SV-04'], owner: '김현우' },
      // 보안·출력물 시스템 — 출력물 자료 이관 배치(BJ-02)·수신 인터페이스(IF-04)·secdata 어댑터의 원천 시스템.
      // 등록 누락 시 이름-기준 토폴로지 조인(랙→…→시스템→배치)에서 BJ-02 가 매핑 실패로 누락돼 배치 수가
      // 과소 집계됐다(v1.5.88 IO-3). 실재하는 원천이므로 정식 등록해 토폴로지를 완결한다.
      { id: 'SYS-05', name: '보안·출력물 시스템', url: 'https://secprint.internal', env: '운영계', serverIds: ['SV-04'], owner: '한지원' },
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
      { id: 'FAULT_ITEM', name: '장애항목', values: [{ code: '시스템 다운', enabled: true }, { code: '성능 저하', enabled: true }, { code: '데이터 오류', enabled: true }, { code: '네트워크 장애', enabled: true }] },
      { id: 'ACTION_CRITERIA', name: '조치기준', values: [{ code: '1등급: 즉시 보고 · 1시간 내 조치 착수', enabled: true }, { code: '2등급: 4시간 내 조치 착수', enabled: true }, { code: '3등급: 익일 조치 계획 보고', enabled: true }] },
      { id: 'SR_KIND', name: 'SR 유형', values: [{ code: '시스템개발', enabled: true }, { code: '데이터', enabled: true }, { code: '계정/권한', enabled: true }] },
      { id: 'INSPECT_CYCLE', name: '점검 주기', values: [{ code: '월', enabled: true }, { code: '분기', enabled: true }, { code: '반기', enabled: true }, { code: '년', enabled: true }] },
      { id: 'VIOLATION_TYPE', name: '보안위반 유형', values: [{ code: '출력물 방치', enabled: true }, { code: '화면 미잠금', enabled: true }, { code: '인가되지 않은 USB 사용', enabled: true }] },
      { id: 'DISCARD_METHOD', name: '출력물 폐기방법', values: [{ code: '세단', enabled: true }, { code: '소각', enabled: true }] },
      { id: 'SETTLE_ITEM', name: '정산 지급항목', values: [{ code: '착수금', enabled: true }, { code: '중도금', enabled: true }, { code: '잔금', enabled: true }, { code: '월정산', enabled: true }] },
    ],
    excelTemplates: [
      { id: 'XT-01', name: '장애보고 취합 양식', docType: '장애보고 상신', version: 3, uploadedAt: '2026-06-10' },
      { id: 'XT-02', name: '인프라변경 작업계획 양식', docType: '변경계획 상신', version: 2, uploadedAt: '2026-05-22' },
      { id: 'XT-05', name: '인프라변경 작업결과 양식', docType: '변경결과 상신', version: 1, uploadedAt: '2026-05-22' },
      { id: 'XT-03', name: '비용계획 수립 양식', docType: '비용 정산품의', version: 1, uploadedAt: '2026-01-15' },
      { id: 'XT-04', name: '보안성검토 체크리스트', docType: '공통', version: 1, uploadedAt: '2026-02-01' },
    ],
    qna: [
      { id: 'QA-2026-11', title: 'SR 적용요청 후 반영 일정이 궁금합니다', domain: 'IT Request', author: '김현우', dept: '개발1팀', askedAt: '2026-07-30', assignee: '박정호', answer: '적용요청서 결재완료 건은 변경관리 편입 후 매주 수요일 마감, 목요일 반영됩니다.', answeredBy: '박정호', answeredAt: '2026-07-31' },
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
    menuOverrides: {},
    actionOverrides: {},
    // 예시 그룹 — 구성원이 비어 있어 아무 접근도 넓히지 않는다(기존 동작 불변). 관리자가 구성원·부여 메뉴를
    // 지정해 열람 위임을 시작하는 출발점. 부여 대상은 운영 화면만(ADMIN 전용 제외, isGrantableMenu).
    userGroups: [
      { id: 'GRP-2026-01', label: '인프라 열람 위임', description: '지정 구성원에게 인프라 운영 화면 열람 권한을 위임하는 예시 그룹', members: [], menuGrants: ['/infra/systems'] },
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
  __ngvPortalLastSaved?: string
  /** 손상 파일 격리 실패 시 저장 비활성화 — 원본을 빈 시드로 덮어쓰지 않게 이번 부팅은 읽기전용 인메모리 */
  __ngvPortalNoSave?: boolean
  /** 이번 부팅이 손상 파일 격리 후 시드 폴백인가 — 시드 상태로 백업/저장이 복구지점을 훼손하지 않게 표시 */
  __ngvPortalQuarantined?: boolean
}

const DATA_FILE = process.env.PORTAL_DATA_FILE

function loadFromFile(): Store | null {
  if (!DATA_FILE || !existsSync(DATA_FILE)) return null
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Record<string, unknown>
    // 타입 안전 머지 — 손상·수기편집·부분저장 파일이 컬렉션 타입을 어겨도 서버를 죽이지 않는다.
    // (예: srRequests 가 문자열이면 .filter() 가 전 화면 500 을 낸다) 시드와 타입이 맞는 키만 수용,
    // 어긋나면 그 키만 시드 기본값을 유지한다. 구버전 부분 파일 머지(누락 키=시드)는 그대로 보존된다.
    const base = seed() as unknown as Record<string, unknown>
    const merged = { ...base } as unknown as Store
    const mergedRec = merged as unknown as Record<string, unknown>
    for (const [k, v] of Object.entries(raw)) {
      // 시드에 없는 키(오타·구정크)는 무시 — `k in base` 는 프로토타입 체인을 봐 '__proto__'·'constructor' 를
      // 통과시켜 mergedRec['__proto__']=v 가 스토어 프로토타입을 조작한다(CWE-1321). 시드의 '자기' 키만 수용.
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue
      const expected = base[k]
      if (Array.isArray(expected)) {
        if (Array.isArray(v)) {
          // 요소 수준 방어 — 상위 타입(배열)이 맞아도 요소가 오염되면(예: 객체 배열에 원시값이
          // 섞이면) 화면의 `.field` 접근이 전 화면 500 을 낸다. 시드 요소 타입 기준으로 어긋난
          // 요소만 걸러 정상 요소는 보존한다(v1.5.14 상위 타입 방어의 요소 수준 확장). 빈 시드
          // 컬렉션(printouts·assetAcquisitions 등)은 요소 타입을 알 수 없어 형판 기반 필드 정규화(아래 356행
          // 루프)를 못 돌린다 — 그래서 null/undefined 원소 제거(v1.5.75)에 더해, 순수 객체·객체담은배열
          // '필드값'도 여기서 제거한다(형판 없이도 적용). 이 값들은 어느 타입이든 {a.field} 직접 렌더 시 React
          // 'Objects are not valid as a React child' 로 500(예: assetAcquisitions.at={$date} → /finance/asset-reg).
          // securityOfficers 는 유일한 문자열 배열이라 원시 타입 일치로 걸러 객체 필터에 전량 탈락하지 않게 한다.
          const sample = expected[0]
          mergedRec[k] = sample === undefined
            ? (v as unknown[]).filter((e) => e != null).map((e) => {
              if (e && typeof e === 'object' && !Array.isArray(e)) {
                const el = e as Record<string, unknown>
                for (const f of Object.keys(el)) {
                  const val = el[f]
                  if ((val !== null && typeof val === 'object' && !Array.isArray(val))
                    || (Array.isArray(val) && val.some((x) => x !== null && typeof x === 'object'))) delete el[f]
                }
              }
              return e
            })
            : (sample !== null && typeof sample === 'object')
              ? v.filter((e) => e !== null && typeof e === 'object' && !Array.isArray(e))
              : v.filter((e) => typeof e === typeof sample)
        }
      }
      else if (expected && typeof expected === 'object') { if (v && typeof v === 'object' && !Array.isArray(v)) mergedRec[k] = v }
      // 스칼라 필드(현재 Store 엔 없음, 향후 추가 대비) — 시드와 원시 타입이 같을 때만 수용
      else if (typeof v === typeof expected) mergedRec[k] = v
    }
    // 요소 필드 정규화 — 요소가 객체여도 시드에서 배열/숫자인 중첩 필드가 손상 파일에서 어긋나면
    // (예: codeGroups[].values 누락·문자열, systems[].serverIds 문자열, investPlan[].amount 누락)
    // 소비처의 .map/.filter/.length/.toLocaleString 가 전 화면 500 을 낸다. 시드 첫 요소를 형판으로
    // 배열 필드는 [], 숫자 필드는 0 으로 보정한다(요소를 버리지 않고 크래시 유발 필드만 정규화).
    for (const [k, expected] of Object.entries(base)) {
      if (!Array.isArray(expected) || expected.length === 0) continue
      const tmpl = expected[0] as Record<string, unknown>
      if (!tmpl || typeof tmpl !== 'object') continue
      const arrFields = Object.keys(tmpl).filter((f) => Array.isArray(tmpl[f]))
      const numFields = Object.keys(tmpl).filter((f) => typeof tmpl[f] === 'number')
      // 문자열 필드는 시드 첫 요소가 아니라 전 시드 요소의 합집합으로 잡는다 — 첫 행에 없는 옵셔널 필드
      // (decidedAt·rejectReason 등, 반려/처리 완료 행에만 있음)가 정규화에서 빠지면 손상 파일의 객체값이
      // 살아남아 {a.decidedAt ?? '-'} 가 React child 로 렌더돼 500(평문 GET) 난다(v1.5.63 사각 마감).
      const strFields = new Set<string>()
      const strRows = (expected as Record<string, unknown>[]).filter((row) => row && typeof row === 'object')
      for (const row of strRows) for (const f of Object.keys(row)) if (typeof row[f] === 'string') strFields.add(f)
      // 전 시드 행에 문자열로 존재하는 필드는 '필수' 필드다 — 손상 파일이 이 필드를 통째로 누락하면(값 오염이
      // 아니라 키 부재) 위 undefined-보존 규칙에 걸려 그대로 undefined 로 남고, 소비처의 .includes/.slice 가
      // undefined 에서 전 화면 500 을 낸다(예: person.dept 누락 → eligibleForCourse '개발자' 렌더 크래시).
      // 일부 행에만 있는 옵셔널 필드와 달리, 전 행 공통 필수 필드는 누락도 ''로 채운다(정상 데이터엔 영향 없음).
      const reqStrFields = [...strFields].filter((f) => strRows.length > 0 && strRows.every((row) => typeof row[f] === 'string'))
      if (arrFields.length === 0 && numFields.length === 0 && strFields.size === 0) continue
      for (const el of mergedRec[k] as Record<string, unknown>[]) {
        if (!el || typeof el !== 'object') continue
        for (const f of arrFields) {
          if (!Array.isArray(el[f])) { el[f] = []; continue }
          // 중첩 배열의 '원소'도 방어 — 상위 요소 필터(위 line ~342)는 codeGroups[] 만 걸러 values[] 안의
          // null·원시값은 통과시켜 isCodeActive(null) 등 소비처가 500 난다. 시드 형판의 원소 타입에 맞춰
          // 손상 원소를 제거한다(객체 배열=null·원시 제거, 문자열 배열=문자열만). 빈 시드 배열은 판별 불가라 그대로.
          const sample = (tmpl[f] as unknown[])[0]
          if (sample !== null && typeof sample === 'object') el[f] = (el[f] as unknown[]).filter((e) => e !== null && typeof e === 'object' && !Array.isArray(e))
          else if (typeof sample === 'string') el[f] = (el[f] as unknown[]).filter((e) => typeof e === 'string')
        }
        for (const f of numFields) if (typeof el[f] !== 'number') el[f] = 0
        // 문자열이어야 할 필드가 손상 파일에서 숫자·객체 등(정의된 비문자열 값)으로 오면 소비처의
        // .slice/.includes/.localeCompare 가 렌더에서 500 을 낸다(array→[]·number→0 정규화의 문자열 짝).
        // 존재하는 비문자열 값만 문자열로 강제한다 — 누락(undefined)은 옵셔널 필드 의미 보존을 위해 그대로
        // 둔다(정상 데이터의 옵셔널 미존재 필드가 ''로 바뀌지 않도록).
        for (const f of strFields) if (el[f] !== undefined && typeof el[f] !== 'string') el[f] = String(el[f])
        for (const f of reqStrFields) if (el[f] === undefined) el[f] = ''
        // 요소 필드는 순수 객체값을 가질 수 없다(문자열·숫자·불리언·배열뿐) — 손상 파일의 객체값은 {a.x ?? '-'}
        // 처럼 JSX child 로 렌더될 때 React 'Objects are not valid as a React child' 로 500 낸다. 시드 어느
        // 행에도 없어 strFields 로 못 잡는 필드(rejectReason 등)까지 포함해, 순수 객체 필드는 제거(undefined)한다.
        // 배열도 동일 사각 — 시드에 없어 arrFields 로 못 잡는 스칼라 필드(srNo·completedAt 등)가 손상 파일에서
        // 객체를 담은 배열([{}])이면 {c.srNo} 직접 렌더가 같은 React child 500 을 낸다. 정상 배열 필드(arrFields,
        // 원소 정규화 완료)만 예외로 두고, 그 외 '객체 담은 배열'은 제거한다(문자열·숫자 배열은 렌더 가능해 보존).
        for (const f of Object.keys(el)) {
          const v = el[f]
          if (v !== null && typeof v === 'object' && !Array.isArray(v)) delete el[f]
          else if (Array.isArray(v) && !arrFields.includes(f) && v.some((e) => e !== null && typeof e === 'object')) delete el[f]
        }
      }
    }
    // 파일 변조·손상 방어 — menuOverrides 는 형태 검증을 통과한 엔트리만 보존한다
    // (설계상 축소 전용이라 권한 상승은 불가하지만, 비배열 값은 가드에서 500 을 유발한다)
    const ROLES = ['USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN']
    merged.menuOverrides = Object.fromEntries(
      Object.entries(merged.menuOverrides ?? {}).filter(([, v]) =>
        Array.isArray(v) && v.every((r) => ROLES.includes(r))),
    ) as Store['menuOverrides']
    // 기능 단위 제한도 동일 형태 검증 — 비배열 값은 effectiveActionRoles 가드에서 500 을 유발한다(menuOverrides 와 동일 계열)
    merged.actionOverrides = Object.fromEntries(
      Object.entries(merged.actionOverrides ?? {}).filter(([, v]) =>
        Array.isArray(v) && v.every((r) => ROLES.includes(r))),
    ) as Store['actionOverrides']
    // 다단 결재 큐도 형태 검증 — 비배열·비문자열 큐는 결재함 상세 렌더·decide() 를 깨뜨린다 (F2)
    for (const a of merged.approvals ?? []) {
      if (a.queue !== undefined && (!Array.isArray(a.queue) || !a.queue.every((n) => typeof n === 'string'))) a.queue = undefined
    }
    // channelStates 값 검증 — 비불리언 값(객체·문자열·숫자)은 isEnabled 의 `st[id] ?? default` 를 통과한다
    // (?? 는 null/undefined 만 폴백). {} 같은 truthy 값은 중지 채널을 가동으로 오판해 발송·연동이 돌고,
    // '0'·0 같은 falsy 비불리언은 기본 가동 채널을 오중지시킨다. menuOverrides·queue 와 동일하게 불리언만 보존.
    merged.channelStates = Object.fromEntries(
      Object.entries(merged.channelStates ?? {}).filter(([, v]) => typeof v === 'boolean'),
    ) as Store['channelStates']
    // remoteCycle 검증 — 손상 파일의 정의되지 않은 값(비-주기 문자열·객체)이 UI select·기간 키 산정에 새지 않게
    // 기본 '월'로 보정한다(remotePeriodKey 자체도 미지값은 월로 처리하나, 저장값 자체를 정규화해 화면 정합).
    if (!(['매일', '월', '분기', '반기'] as string[]).includes(merged.remoteCycle as string)) merged.remoteCycle = '월'
    // 프로필 격리 (AD-7) — 파일 스탬프가 현재 PORTAL_PROFILE 과 다르면(한 데이터파일을 프로필 전환에
    // 재사용), 프로필 스코프 런타임 설정(채널 가동상태·메뉴권한 오버레이)을 활성 프로필 시드 기본으로
    // 되돌린다(도메인 데이터는 보존). A 프로필 채널 토글·메뉴제한이 B 로 새어 운영 통제가 어긋나는 것을 막는다.
    // 스탬프 없는 파일(구버전·테스트)은 undefined 라 리셋하지 않는다(무회귀).
    const activeProfile = process.env.PORTAL_PROFILE || 'default'
    const fileProfile = typeof raw.__profileStamp === 'string' ? raw.__profileStamp : undefined
    if (fileProfile !== undefined && fileProfile !== activeProfile) {
      const fresh = seed()
      merged.channelStates = fresh.channelStates
      merged.menuOverrides = fresh.menuOverrides
    }
    return merged
  } catch {
    // 파싱·머지 실패 = 손상 파일(외부 편집기·백업 도구·디스크 풀 0바이트·비트로트). 그대로 두면
    // getStore 가 seed 로 폴백하고, 읽기 트리거 저장(scheduleSave)이 300ms 뒤 원본을 빈 시드로
    // 덮어써 복구 불가능한 손실이 된다(스케줄러 off 배포는 .bak 조차 없어 전손). 원본을
    // .corrupt.<시각> 으로 격리 보존한 뒤 seed 로 기동해, 운영자가 복구할 지점을 남긴다.
    // 손상 감지 — 이번 부팅은 시드 폴백이다. 백업/저장이 시드 상태로 복구지점(양호한 .bak·원본)을
    // 훼손하지 않도록 표시한다(backupDataFile 이 이 플래그면 백업을 보류해 기존 복구지점을 지킨다).
    g.__ngvPortalQuarantined = true
    try {
      if (DATA_FILE && existsSync(DATA_FILE)) {
        const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace(/[:T]/g, '')
        renameSync(DATA_FILE, `${DATA_FILE}.corrupt.${stamp}`)
      }
    } catch {
      // 격리 실패(파일락·권한 EPERM 등) — 원본이 그대로 남아있다. 이 상태로 시드 기동 후 저장하면 saveNow 가
      // 원본을 빈 시드로 덮어써, 격리 사본조차 없는 유일한(수기복구 가능) 손상 원본까지 파괴한다(HIGH).
      // 저장을 비활성화해 원본을 보존한다 — 이번 부팅은 읽기전용 인메모리(운영자가 원본 복구·격리할 때까지).
      g.__ngvPortalNoSave = true
    }
    return null
  }
}

function saveNow(s: Store) {
  // __ngvPortalNoSave: 손상 원본 격리 실패 시 저장 금지 — 원본을 시드로 덮어쓰지 않는다(복구지점 보존)
  if (!DATA_FILE || g.__ngvPortalNoSave) return
  try {
    // 프로필 스탬프 — 어느 PORTAL_PROFILE 로 저장됐는지 각인(AD-7). loadFromFile 이 활성 프로필과 대조해
    // 프로필 스코프 런타임 설정 누수를 막는다. 시드에 없는 키라 재로드 머지에서 무시된다(도메인 데이터 무영향).
    const json = JSON.stringify({ ...s, __profileStamp: process.env.PORTAL_PROFILE || 'default' })
    // 변경 없으면 쓰기 생략 — 읽기 부하에서 예약이 반복돼도 동일 상태를 헛쓰지 않는다.
    if (json === g.__ngvPortalLastSaved) return
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    const tmp = `${DATA_FILE}.tmp`
    writeFileSync(tmp, json, 'utf8')
    renameSync(tmp, DATA_FILE)
    g.__ngvPortalLastSaved = json
  } catch { /* 디스크 오류는 데모 흐름을 막지 않는다 */ }
}

/** 종료 플러시 훅 — 디바운스 창 안의 미저장 뮤테이션을 종료 시 동기 저장으로 보전한다.
 *  'exit' 는 정상 종료만 커버하므로 SIGTERM(docker stop)·SIGINT(Ctrl+C)도 잡아 플러시 후 종료한다.
 *  (SIGKILL·OOM 은 동기 훅이 불가능 — 그 창을 좁히는 것은 scheduleSave 의 고정 지연.) */
function registerExitFlush() {
  if (g.__ngvPortalExitHook) return
  g.__ngvPortalExitHook = true
  const flush = () => {
    clearTimeout(g.__ngvPortalSaveTimer)
    g.__ngvPortalSaveTimer = undefined
    if (g.__ngvPortalStore) saveNow(g.__ngvPortalStore)
  }
  process.on('exit', flush)
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => { flush(); process.exit(0) })
  }
}

/** 저장 예약 — 모든 뮤테이션은 getStore() 를 거치므로 호출 시 저장을 예약해 상태를 파일에 반영한다.
 *  이미 예약돼 있으면 재예약하지 않는다(리셋 금지): getStore 는 읽기 렌더에서도 호출되므로
 *  매번 타이머를 밀면 바쁜 서버에서 저장이 무한정 굶는다. 첫 예약 후 고정 300ms 에 반드시 발화해
 *  최신 상태를 저장한다(저장 지연 상한 = 300ms). 임시 파일 → rename 으로 부분 쓰기를 막는다. */
function scheduleSave(s: Store) {
  if (!DATA_FILE) return
  if (!g.__ngvPortalSaveTimer) {
    g.__ngvPortalSaveTimer = setTimeout(() => { g.__ngvPortalSaveTimer = undefined; saveNow(s) }, 300)
  }
  registerExitFlush()
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
  if (!DATA_FILE) return null
  // 손상 격리 후 시드 폴백 부팅에서는 백업을 보류한다 — 메모리 상태가 시드(실데이터 아님)라, 같은 날짜
  // 스탬프의 양호한 기존 .bak 을 시드 스냅샷으로 덮어쓰면 그날의 유일한 복구지점을 파괴한다. 실패로 기록해
  // 운영자가 복구지점 보존 상태를 인지하게 한다(원본은 .corrupt 에 격리돼 있거나 NoSave 로 보존됨).
  if (g.__ngvPortalQuarantined) {
    recordBatch('데이터 파일 일일 백업 — 손상 격리·시드 기동으로 보류(기존 복구지점 보존)', nowStamp(), '실패')
    return null
  }
  // 백업이 메모리 최신 상태를 담도록 먼저 플러시한다 — 틱(알림 배치)이 스토어를 변경한 뒤
  // 디스크 반영 전에 복사하면 스냅샷이 뒤처진다(복구 지점 신뢰성).
  if (g.__ngvPortalStore) saveNow(g.__ngvPortalStore)
  if (!existsSync(DATA_FILE)) return null
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
    // 디스크 오류(권한·용량)는 데모 흐름을 막지 않되, 조용히 사라지지 않도록 실패로 기록한다 —
    // 백업이 '복구 지점'을 광고하므로, 지속 실패가 배치 이력에 안 보이면 운영자가 백업 부재를
    // 모른다. null(스킵: 인메모리·파일없음)과 달리 실패는 배치 이력에 남긴다.
    recordBatch('데이터 파일 일일 백업 — 디스크 오류', nowStamp(), '실패')
    return null
  }
}

/** 배치 실행 기록 — 상태바 '마지막 배치'의 원천. 이력 상한으로 영속 파일 비대를 막는다. */
export function recordBatch(job: string, ranAt: string, result: '성공' | '실패'): void {
  const s = getStore()
  s.batchRuns.unshift({ job, ranAt, result })
  if (s.batchRuns.length > 200) s.batchRuns.length = 200
}

/** 재택근무 대상 판정 — 해당 월에 재택 기간이 겹치는지 (요구사항 54행 기간별 조회의 단일 원천).
 *  month 는 'YYYY-MM' — 시작일이 월말 이전이고 종료일이 없거나 월초 이후면 그 달의 대상이다. */
/** 재택 등록 주기별 현 시점 기간 키 — 매일=YYYY-MM-DD, 월=YYYY-MM, 분기=YYYY-Qn, 반기=YYYY-Hn.
 *  제출·대상·통계·알림이 이 단일 키로 한 주기를 식별한다(주기 변경 시 기존 제출 이력은 옛 키로 남아 무해). */
export function remotePeriodKey(cycle: RemoteCycle, d: string = today()): string {
  const y = d.slice(0, 4)
  const m = Number(d.slice(5, 7))
  if (cycle === '매일') return d
  if (cycle === '분기') return `${y}-Q${Math.ceil(m / 3)}`
  if (cycle === '반기') return `${y}-H${m <= 6 ? 1 : 2}`
  return d.slice(0, 7)
}

/** 기간 키 → [시작일, 종료일](YYYY-MM-DD, 종료 포함) — 재택 대상 활성 판정용. 월 키는 기존 동작과 동일. */
export function remotePeriodBounds(key: string): [string, string] {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return [key, key]
  const q = /^(\d{4})-Q([1-4])$/.exec(key)
  if (q) {
    const sm = (Number(q[2]) - 1) * 3 + 1
    const em = Number(q[2]) * 3
    return [`${q[1]}-${String(sm).padStart(2, '0')}-01`, `${q[1]}-${String(em).padStart(2, '0')}-31`]
  }
  const h = /^(\d{4})-H([12])$/.exec(key)
  if (h) return h[2] === '1' ? [`${h[1]}-01-01`, `${h[1]}-06-31`] : [`${h[1]}-07-01`, `${h[1]}-12-31`]
  return [`${key}-01`, `${key}-31`]
}

/** 재택 대상 t 가 기간 키에 해당하는가 — 대상 활성 구간이 기간 구간과 겹치면 참(주기 무관 단일 판정).
 *  월 키(YYYY-MM)에서는 startDate<=말일 && (종료없음||종료>=1일)로 기존 동작과 완전히 동일하다. */
export function isRemoteTargetIn(t: RemoteTarget, key: string): boolean {
  const [s, e] = remotePeriodBounds(key)
  return t.startDate <= e && (!t.endDate || t.endDate >= s)
}

/** 공통코드 활성 판정 — 사용여부 + 사용기간(until, 종료일 포함) (요구사항 73행).
 *  기간이 지난 코드는 사용중지와 동일하게 신규 선택지에서 빠지고, 기존 데이터는 유지된다. */
export function isCodeActive(v: { enabled: boolean; until?: string }): boolean {
  return v.enabled && (!v.until || v.until >= today())
}

/** 교육 과정 대상별 이수 의무자 — 대상이 한정된 과정(개발자·보안담당자)을 비대상자에게 강제하지
 *  않는다. 이걸 무시하면 개발자 전용 과정 완료 시 비개발자 전원이 '미이수'로 찍히고 전사 이수율이
 *  실제보다 낮게 왜곡된다(거버넌스 지표 오표기). 개발자=부서명에 '개발' 포함, 보안담당자=
 *  securityOfficers, 그 외(전임직원·미지정)=전 재직자. 이수율·개인 상태·엑셀의 단일 원천. */
export function eligibleForCourse(s: Store, target: string | undefined): Person[] {
  if (target === '개발자') return s.people.filter((p) => p.dept.includes('개발'))
  if (target === '보안담당자') return s.people.filter((p) => s.securityOfficers.includes(p.name))
  return s.people
}

/** 공통코드 그룹의 활성 코드값 목록 — 업무 화면 선택지·서버 검증의 단일 원천.
 *  사용중지·기간만료 코드는 빠진다(요구사항 73행: 공통코드가 업무 선택지에 반영). */
/** 고위험(심각+높음) 미조치 취약점 — 보안성 검토의 우선 조치 신호. 화면·대시보드·종합 export 의 단일 원천. */
export function highSevOpen(r: { critFound: number; critFixed: number; highFound: number; highFixed: number }): number {
  return Math.max(0, (r.critFound + r.highFound) - (r.critFixed + r.highFixed))
}

export function activeCodes(s: Store, groupId: string): string[] {
  return s.codeGroups.find((g) => g.id === groupId)?.values.filter(isCodeActive).map((v) => v.code) ?? []
}

/** 채번 — 'PREFIX-YYYY-NNNN' 형식에서 연도 내 최대 시퀀스 + 1 */
export function nextNo(prefix: string, year: string, existing: string[]): string {
  const head = `${prefix}-${year}-`
  const max = existing
    // typeof 가드 — 손상 파일이 id 없는 요소를 남기면 existing 에 undefined 가 섞여
    // undefined.startsWith 가 상신 서버액션을 500 낸다. 문자열 id 만 스캔한다.
    .filter((n) => typeof n === 'string' && n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0)
  return `${head}${String(max + 1).padStart(4, '0')}`
}
