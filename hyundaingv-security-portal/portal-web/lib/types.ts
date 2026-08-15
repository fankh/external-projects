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
export type SrStatus = '작성중' | '결재중' | 'CI배정' | '개발중' | '테스트' | '적용요청결재중' | '적용요청' | '완료' | '반려' | '중지'

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
  /** 공수(MD) — SR 관리 진행 처리 시 입력 (요구사항 26행) */
  manHours?: number
  /** 중지 직전 진행상태 — 중지(BA030014, 결재 시트) 해제 시 복원용. 중지 중엔 진행·지연·결재 반영에서 제외 */
  suspendedFrom?: SrStatus
}

/** SR 진행 단계 순서 — 시스템개발 SR 파이프라인 (제품안내서 §03) */
export const SR_FLOW: SrStatus[] = ['작성중', '결재중', 'CI배정', '개발중', '테스트', '적용요청결재중', '적용요청', '완료']

/** CI 직접 접수 SR — 결재 없이 CI 가 접수·처리하는 건 (요구사항 25행: 보안/업무 구분·처리 이력 관리) */
export interface CiSr {
  id: string
  category: '보안' | '업무'
  title: string
  /** 요청자 — 전화·메일 등 경로로 들어온 수기 기록 (사외·관제 포함) */
  requester: string
  system?: string
  status: '접수' | '처리중' | '완료'
  receivedBy: string
  receivedAt: string
  completedAt?: string
  /** 처리 내용 — 완료 시 기록 */
  result?: string
}

export type ApprovalStatus = '대기' | '승인' | '반려' | '회수'

/** 기본 결재선 — 문서 유형별 결재자 (환경설정 > 결재선 관리에서 유지보수) */
export interface ApprovalLine {
  docType: ApprovalDocType
  approver: string
  /** 2차 결재자 (선택) — 지정 시 1차 승인 후 2차로 회부되는 다단 결재 (제품안내서 IV장: 부서장 → 담당부서장) */
  secondApprover?: string
}

export type ApprovalDocType = '투자 정산품의' | '비용 정산품의' | 'SR 신청' | '적용요청 상신' | '변경계획 상신' | '변경결과 상신' | '서약 현황 상신' | '부서서약 현황 상신' | '장애보고 상신' | '점검결과 상신' | '출력물폐기 상신' | '보안위반 확인서'

/** 출력물 개인정보관리 — 보안·출력물 시스템(DB 연계)에서 전일자 일배치 이관 → 본인 폐기 등록 → 결재 (결재 시트 13번) */
export interface PrintoutRecord {
  id: string
  printedAt: string
  name: string
  dept: string
  document: string
  pages: number
  personalInfo: boolean
  method?: '세단' | '소각'
  discardedAt?: string
  /** approval_code — 미등록(이관 직후) → 등록(폐기 정보 입력) → 결재중 → 폐기확정 */
  status: '미등록' | '등록' | '결재중' | '폐기확정'
  approvalRef?: string
}

/** 재택근무 체크리스트 — 등록 주기(매일·월·분기·반기, RemoteCycle) 단위 자가점검 제출 */
/** 재택근무 대상자 — 일자별 명단 (요구사항 54행: 시작일자 있으면 추가, 종료일자만 있으면 수정) */
export interface RemoteTarget {
  name: string
  dept: string
  startDate: string
  /** 종료일(포함) — 없으면 계속 재택 대상 */
  endDate?: string
}

export interface RemoteCheck {
  name: string
  dept: string
  period: string
  submittedAt: string
}

/** 재택 체크리스트 등록 주기 (요구사항 54행 '등록 주기 변경 - 반기, 분기, 매일') — 기본 월. */
export type RemoteCycle = '매일' | '월' | '분기' | '반기'
export const REMOTE_CYCLES: RemoteCycle[] = ['매일', '월', '분기', '반기']

/** 보안위반 — 업무담당 등록·확인서 요청(메일) → 위반자 본인 확인서 작성·결재 (결재 시트 14번) */
export type ViolationType = '출력물 방치' | '화면 미잠금' | '인가되지 않은 USB 사용'

export interface Violation {
  id: string
  name: string
  dept: string
  type: ViolationType
  detail: string
  occurredAt: string
  /** EA130001 징구중 → 결재중 → 완료 */
  status: '징구중' | '결재중' | '완료'
  statement?: string
}

/** 보안점검 (ISMS) — 기준(Template) → 연간 점검계획 → 결과 등록·결재 → 완료 (요구사항 결재 시트 3번) */
export type InspectionCycle = '월' | '분기' | '반기' | '년'

export interface InspectionItem {
  id: string
  /** ISMS 항목 코드 관리 — 대분류 · 통제항목 */
  category: string
  /** ISMS 중분류 (요구사항 62행 서브) */
  subCategory?: string
  control: string
  cycle: InspectionCycle
  source: 'ISMS' | '외부기관'
}

export type InspectionStatus = '계획' | '결과미등록' | '결재중' | '완료'

export interface InspectionPlan {
  id: string
  itemId: string
  /** 점검 대상 (조직·시스템) — 제품안내서 IV장 */
  target?: string
  /** 점검 예정월 (YYYY-MM) — 경과 시 지연으로 드러난다 */
  month: string
  inspector: string
  status: InspectionStatus
  result?: string
}

/** 보안성 검토 — 시큐어코딩·취약점 점검·모의해킹의 계획→발견→조치→완료 추적 (제품안내서 VI장:
 *  시큐어코딩·취약점 점검·자료 제출). 발견/조치 건수로 조치율을 집계하고 증적을 첨부한다. */
export type SecurityReviewKind = '시큐어코딩' | '취약점점검' | '모의해킹'
export type SecurityReviewStatus = '계획' | '진행' | '조치중' | '완료'
export type SecurityReviewSeverity = '심각' | '높음' | '보통' | '낮음'
export const SECURITY_REVIEW_KINDS: SecurityReviewKind[] = ['시큐어코딩', '취약점점검', '모의해킹']
/** 심각도 등급 — 고위험(심각+높음)이 우선 조치 대상 (거버넌스 신호) */
export const SECURITY_REVIEW_SEVERITIES: SecurityReviewSeverity[] = ['심각', '높음', '보통', '낮음']

export interface SecurityReview {
  id: string
  title: string
  kind: SecurityReviewKind
  /** 검토 대상 — 시스템·프로젝트 */
  target: string
  reviewer: string
  status: SecurityReviewStatus
  /** 발견 취약점 수 (= 등급별 발견 합) */
  findings: number
  /** 조치 완료 수 (findings 이하, = 등급별 조치 합) */
  fixed: number
  // 등급별 발견/조치 — 손상 내성 위해 중첩 객체 대신 평면 numField(스토어 정규화가 숫자 강제).
  // 고위험 미조치 = (critFound+highFound) − (critFixed+highFixed). findings/fixed 는 이 합의 유지된 총계.
  critFound: number; critFixed: number
  highFound: number; highFixed: number
  medFound: number; medFixed: number
  lowFound: number; lowFixed: number
  plannedAt: string
  completedAt?: string
}

/** 컴플라이언스 포스처 추세 스냅샷 — 주기(월)별 KPI 를 저장해 전기 대비 개선 추이(ISMS 감사 근거)를 본다.
 *  값은 lib/compliance computeComplianceKpis 기준 기록 시점 산출(rate 는 complianceKpiPct). */
export interface ComplianceSnapshot {
  id: string
  /** 대상 기간 (YYYY-MM) — 같은 기간 재기록 시 갱신(upsert) */
  period: string
  at: string
  by: string
  pledgeRate: number
  eduRate: number
  fixRate: number
  inspDone: number
  inspTotal: number
  highVulns: number
  openVulns: number
  vDone: number
  vTotal: number
}

/** 장애 관리 — 등록·조치 → 주기별 통계 결재상신 → 향후대책 결과 등록 (요구사항 결재 시트 8번) */
export type IncidentGrade = '1등급' | '2등급' | '3등급'

export interface Incident {
  id: string
  system: string
  title: string
  /** 장애등급 — 공통코드화 대상 (요구사항: 장애항목·등급·조치기준) */
  grade: IncidentGrade
  /** 장애항목 — 공통코드 FAULT_ITEM 소비 (요구사항 36행: 항목·등급·조치기준 공통코드화) */
  category?: string
  occurredAt: string
  status: '조치중' | '조치완료'
  action?: string
  /** 향후대책 — 등록돼 있으면 결과(cmResult) 등록 전까지 '대책 미완료'로 추적된다 */
  countermeasure?: string
  cmResult?: string
  /** 장애보고 결재 참조·상태 (approved_status) — 결재진행·완료 건은 재상신 불가 */
  reportRef?: string
  reportStatus: '미상신' | '결재중' | '결재완료'
}

/** 변경 관리 — 계획 상신과 결과 상신을 각 1회씩 거친다 (요구사항 결재 시트 9·10번).
 *  시스템개발 변경은 SR 적용요청 결재완료 건과 매칭되고, 최종완료 시 SR이 완료로 전파된다. */
export type ChangeStatus = '작업등록' | '계획결재중' | '작업등록승인' | '작업완료결재중' | '최종완료'

export interface ChangeWork {
  id: string
  kind: '인프라' | '시스템개발'
  title: string
  /** 시스템개발 변경 — 매칭된 SR (적용요청 상태에서 편입) */
  srNo?: string
  status: ChangeStatus
  registeredAt: string
  plan?: string
  result?: string
}

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
  /** 반려 시 필수 — 기안자가 보완·재상신할 수 있도록 사유를 남긴다 */
  rejectReason?: string
  /** 다단 결재 잔여 결재자 큐 — 승인마다 하나씩 회부되고, 비면 최종 승인으로 전파된다 */
  queue?: string[]
}

export interface TodoItem {
  id: string
  owner: string
  kind: '보안서약서' | '보안교육' | '재택 체크리스트' | '출력물 폐기확인' | 'SR 처리' | '결재' | '재상신'
  title: string
  dueDate: string
  done: boolean
  /** 회전참조 묶음 문서(장애보고·출력물폐기·서약현황) 반려로 생긴 '재상신' 할일에만 채워진다 —
   *  반려된 묶음의 항목 id 목록. 재상신(같은 항목 재제출)이 이 항목을 재포함할 때만 할일을 닫아,
   *  무관한 신규 묶음 상신이 오래된 재상신 할일을 과다 마감하는 것을 막는다(AP3-3). */
  batchItems?: string[]
}

export interface Notice {
  id: string
  title: string
  category: '공지' | '보안' | '시스템' | '교육'
  author: string
  postedAt: string
  pinned?: boolean
}

/** 임직원 디렉터리 — 인사정보 연동 목업 (부서 현황 집계 기준) */
export interface Person {
  name: string
  dept: string
}

export type PledgeKind = '일반' | '관리책임자' | '재택근무' | '특별' | '프로젝트'

/** 보안서약 제출 기록 — 연도·양식 개정일자 기준 */
export interface PledgeSign {
  name: string
  dept: string
  year: string
  kind: PledgeKind
  signedAt: string
  method: '온라인' | '서면(스캔)'
  /** 특별서약(보안담당자) 전용 — 담당업무·세부업무내용 (요구사항: 본문 외 추가입력) */
  duty?: string
  /** 프로젝트 참여 서약 전용 — 대상 프로젝트 번호 (요구사항 46행) */
  projectRef?: string
}

/** 협력업체 서약 — 담당자가 징구·첨부해 결재 상신, 업체별 진행현황 관리 (결재 시트 12번) */
export interface CompanyPledge {
  id: string
  company: string
  personName: string
  registeredAt: string
  status: '등록' | '결재중' | '완료'
  approvalRef?: string
}

/** IT 투자/비용 — 경영계획 → 시행(계약) → 정산품의 → 계획대비실적 (제품안내서 §03).
 *  투자·비용은 같은 골격을 쓰고, 계약내역은 요구사항대로 "전체 투자/비용 계약 리스트"를 공유한다. */
export type FinKind = '투자' | '비용'

export interface InvestPlan {
  id: string
  kind: FinKind
  year: string
  title: string
  owner: string
  dept: string
  /** 계획 금액 (만원) */
  amount: number
  /** 작성중(본인) → 취합(담당 검토) → 효율화(금액 조정) → 확정 (제품안내서 III장 단계) */
  status: '작성중' | '취합' | '효율화' | '확정'
}

export interface InvestContract {
  id: string
  kind: FinKind
  /** 경영계획 과제 참조 — 계획외 건은 미지정 (요구사항: 계획 미반영건 추가 가능) */
  planId?: string
  vendor: string
  title: string
  amount: number
  signedAt: string
}

export type SettlementItem = '착수금' | '중도금' | '잔금' | '월정산'

/** 비용 속보 — 경영계획 기초 월별 거래처별 지불 예상액. 표시 기준금액은 정산>계약>계획 우선순위. */
export interface ExpenseFlash {
  id: string
  month: string
  vendor: string
  planId?: string
  expected: number
  /** 수정 이력 (제품안내서 III장: 등록·조회·수정·이력관리) */
  history?: { at: string; by: string; expected: number }[]
}

export interface Settlement {
  id: string
  contractId: string
  item: SettlementItem
  amount: number
  status: '작성중' | '결재중' | '지급완료' | '반려'
  requestedBy: string
  requestedAt: string
  /** 지급 예정일 — 지급 목록 일정 관리 (제품안내서 III장) */
  dueDate?: string
}

/** 보안교육 — 연간계획 → 과정별 결과·명단 등록 → 이수현황 집계 */
export interface EducationCourse {
  id: string
  year: string
  title: string
  target: '전임직원' | '개발자' | '보안담당자'
  plannedMonth: string
  status: '계획' | '완료'
}

export interface EducationRecord {
  courseId: string
  name: string
  dept: string
  completedAt: string
}

/** 인프라 — 랙·서버·시스템(애플리케이션)·배치·인터페이스 현황 (제품안내서 §03) */
/** 랙 — 위치·사이즈(U)·자산번호 관리 (요구사항 28행) */
export interface Rack {
  id: string
  location: string
  sizeU: number
  assetNo: string
}

/** H/W — 물리서버·네트워크장비·스토리지 (요구사항 30행). 랙에 장착되고, 물리서버는 논리 서버를 올린다 */
export interface Hardware {
  id: string
  kind: '물리서버' | '네트워크장비' | '스토리지'
  model: string
  rackId: string
  assetNo: string
}

export interface ServerInfo {
  id: string
  hostname: string
  ip: string
  purpose: 'Web' | 'WAS' | 'DB' | '배치'
  os: string
  rack: string
  /** 장착 H/W(물리서버) — 랙구성도 도식화의 랙→H/W→서버 연결 (요구사항 29행) */
  hwId?: string
  /** CPU · 메모리 (요구사항 31행) */
  cpu?: string
  memoryGb?: number
  /** 디스크 사용률(%) — 85% 초과는 경고로 드러난다 */
  diskUsedPct: number
}

export interface SystemInfo {
  id: string
  name: string
  url: string
  env: '운영계' | '개발계'
  serverIds: string[]
  owner: string
}

export interface BatchJob {
  id: string
  name: string
  system: string
  schedule: '일' | '주' | '월'
  lastRun?: string
  lastResult?: '성공' | '실패'
}

export interface InterfaceDef {
  id: string
  name: string
  from: string
  to: string
  method: 'REST API' | 'DB 연계' | '파일'
  status: '정상' | '오류'
}

/** 서약서 양식 — 개정일자 기준. 개정 이전 서약은 무효가 되어 재서약 대상이 된다. */
export interface PledgeForm {
  kind: PledgeKind
  revisedAt: string
}

/** 공통 첨부파일 — 결재·게시·SR·계약·장애·변경·서약·교육 등 전 모듈 공통 (제품안내서 §V).
 *  refId(업무 문서 번호) 하나로 묶이며, 결재 상신 시 결재 문서에서도 같은 참조로 조회된다.
 *  데모에서는 메타데이터만 저장하고, 실서비스에서는 파일 저장소 연동으로 대체된다. */
export interface Attachment {
  id: string
  refId: string
  name: string
  sizeKb: number
  uploadedBy: string
  at: string
  /** 결재 자동생성 양식 여부 — 자동첨부 중복 방지(registerGenerated)가 '이전에 생성한 양식'만 대상으로
   *  판정하기 위한 출처 구분자. 사용자 업로드(registerUpload)는 미설정이라, 업로드 파일명이 양식 접두와
   *  같아도 필수 자동양식 생성을 가로막지 못한다(첨부파일자동생성 통제 우회 방지). */
  gen?: boolean
}

/** 감사 이력 — 통제 행위 append-only 기록 */
export interface AuditLog {
  at: string
  actor: string
  action: string
  detail: string
}

/** 공통코드 — 장애등급·SR유형·주기 등 업무 코드의 단일 원천 (사용여부 토글) */
export interface CodeGroup {
  id: string
  name: string
  /** until — 사용기간 종료일(포함). 지나면 사용중지와 동일하게 신규 선택지에서 제외 (요구사항 73행) */
  values: { code: string; enabled: boolean; until?: string }[]
}

/** 엑셀양식 — 결재 자동첨부·출력에 쓰는 양식 (버전 관리) */
export interface ExcelTemplate {
  id: string
  name: string
  docType: ApprovalDocType | '공통'
  version: number
  uploadedAt: string
}

/** QnA — 질문 등록·담당 지정·답변 (요구사항: 담당자 지정, 답변완료 상태 추적) */
export interface QnaPost {
  id: string
  title: string
  domain: string
  author: string
  dept: string
  askedAt: string
  /** 답변 담당자 — 지정 후 답변완료까지 추적된다 */
  assignee?: string
  answer?: string
  answeredBy?: string
  answeredAt?: string
}

/** 프로젝트 — 계약정보 연동, 진행현황·인력·일정/산출물·이슈·회의록·주간보고 (제품안내서 §03) */
export interface Project {
  id: string
  title: string
  /** 투자 계약 연동 — 계약내역에서 업체·계약액을 가져온다 */
  contractId?: string
  manager: string
  headcount: number
  /** 투입 인력 명단 (제품안내서 III장) — 프로젝트 참여 서약 대상의 기준 */
  members?: string[]
  start: string
  end: string
  progress: number
  status: '진행중' | '완료'
}

export interface Deliverable {
  id: string
  projectId: string
  name: string
  due: string
  done: boolean
}

export interface ProjectIssue {
  id: string
  projectId: string
  title: string
  risk: '높음' | '중간' | '낮음'
  status: '오픈' | '해결'
  raisedAt: string
}

export interface ProjectNote {
  id: string
  projectId: string
  kind: '회의록' | '주간보고'
  title: string
  author: string
  writtenAt: string
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
