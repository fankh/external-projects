/** 데이터 스토어 — globalThis 싱글턴으로 HMR·서버액션 간 상태 유지.
 *  ITAM_DATA_FILE 이 설정되면 파일 기반으로 영속화되어 컨테이너 재시작·재생성 후에도 유지된다.
 *  미설정(로컬 개발·스모크)이면 순수 인메모리라 매 기동 시 시드로 초기화된다.
 *  실서비스에서는 자산 대장 RDB(CMDB) + 발견 저장소 분리 구조로 대체된다(제품안내서 §02). */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { today } from './dates'
import { fingerprintOf } from './types'
import type {
  AiCallRecord, AiInsight, AiPolicy, Approval, ApprovalLine, Asset, AuditLog, BoardPost, ChannelObservation, CodeGroup, CodeValue, Contract,
  Dispatch, DisposalRecord, MenuDef, DiscoveredAsset, EasmRun, EasmTarget, ExternalAsset, GeneratedReport, IntakeLot, Integration, InventoryRound, LeakFinding, MenuPermission,
  ReportSchedule, SaasCatalogEntry, SaasUsage, ScanPolicy, ScanRun, SurveyDiff, SurveyScan, SwLicense, UndiscoveredDevice, UnseenExternal, UserAccount,
} from './types'

export interface Store {
  assets: Asset[]
  discovered: DiscoveredAsset[]
  external: ExternalAsset[]
  leaks: LeakFinding[]
  integrations: Integration[]
  auditLogs: AuditLog[]
  codeGroups: CodeGroup[]
  scanPolicies: ScanPolicy[]
  saasCatalog: SaasCatalogEntry[]
  aiPolicy: AiPolicy
  users: UserAccount[]
  approvalLines: ApprovalLine[]
  reports: GeneratedReport[]
  surveyScans: SurveyScan[]
  surveyDiffs: SurveyDiff[]
  intakeLots: IntakeLot[]
  disposals: DisposalRecord[]
  contracts: Contract[]
  licenses: SwLicense[]
  approvals: Approval[]
  saas: SaasUsage[]
  insights: AiInsight[]
  inventoryRounds: InventoryRound[]
  posts: BoardPost[]
  dispatches: Dispatch[]
  observations: ChannelObservation[]
  scanRuns: ScanRun[]
  menuDefs: MenuDef[]
  menuPermissions: MenuPermission[]
  reportSchedules: ReportSchedule[]
  /** 마지막 AI 호출 결과 — 미호출이면 undefined */
  aiLastCall?: AiCallRecord
  easmTargets: EasmTarget[]
  easmRuns: EasmRun[]
  /** 아직 외부에서 관측되지 않은 노출 자산 — 재탐지로 드러난다 */
  unseenExternal: UnseenExternal[]
  /** 아직 발견되지 않은 장비 — 스캔이 돌면 여기서 발견 저장소로 옮겨간다 */
  undiscovered: UndiscoveredDevice[]
  seq: number
}

function seedAssets(): Asset[] {
  const mk = (a: Partial<Asset> & Pick<Asset, 'assetNo' | 'category' | 'model' | 'status' | 'owner' | 'dept'>): Asset => ({
    serial: `SN-${a.assetNo.slice(-6)}`,
    location: '본사 8F',
    purchaseDate: '2023-03-15',
    warrantyEnd: '2026-03-14',
    // 대부분 상반기 정기 재물조사(INV-2026-H1, 2026-02 완료)에서 실측된 상태. 일부는 아래에서 장기 미실측으로 덮어쓴다.
    lastVerifiedAt: '2026-05-20',
    history: [{ date: a.purchaseDate ?? '2023-03-15', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' }],
    ...a,
  })
  return [
    mk({ assetNo: 'AST-2023-000112', category: '단말', model: 'ThinkPad T14 Gen4', status: '사용중', owner: '김민준', dept: '플랫폼개발팀', os: 'Windows 11 Pro', cpu: 'i7-1355U', memory: '32GB', ip: '10.20.31.45', mac: 'A4:BB:6D:11:22:33', contractId: 'CT-2023-014',
      // 과거 두 차례 수리 이력 — 자산 단위 수리 비용 누계(TCO) 시연용
      repairCosts: [
        { id: 'ARC-0001', date: '2024-06-18', vendor: '중부IT서비스', item: '키보드 교체', amount: 95_000, by: '박자산' },
        { id: 'ARC-0002', date: '2025-09-05', vendor: '중부IT서비스', item: '배터리 교체', amount: 148_000, by: '박자산' },
      ],
      history: [
        { date: '2023-03-15', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2023-03-20', kind: '불출', detail: '플랫폼개발팀 김민준 불출', actor: '박자산' },
        { date: '2024-06-18', kind: '수리', detail: '수리 처리 수리 완료 · 중부IT서비스 · 실비 95,000원 — 키보드 교체', actor: '박자산' },
        { date: '2024-11-02', kind: '구성변경', detail: '메모리 16GB → 32GB 증설', actor: '박자산' },
        { date: '2025-09-05', kind: '수리', detail: '수리 처리 수리 완료 · 중부IT서비스 · 실비 148,000원 — 배터리 교체', actor: '박자산' },
      ] }),
    mk({ assetNo: 'AST-2023-000113', category: '단말', model: 'ThinkPad T14 Gen4', status: '사용중', owner: '이서연', dept: '플랫폼개발팀', os: 'Windows 11 Pro', cpu: 'i7-1355U', memory: '16GB', ip: '10.20.31.46', mac: 'A4:BB:6D:11:22:34', contractId: 'CT-2023-014' }),
    // 장기 미실측 후보 ① — 실측 이력 없음(원격 근무자 단말, 재물조사 방문 시 부재 반복)
    mk({ assetNo: 'AST-2022-000871', category: '단말', model: 'MacBook Pro 14 M2', status: '사용중', owner: '정하윤', dept: '디자인팀', os: 'macOS 14', cpu: 'M2 Pro', memory: '32GB', ip: '10.20.44.12', mac: 'F0:2F:4B:9A:31:07', purchaseDate: '2022-08-01', warrantyEnd: '2025-07-31', lastVerifiedAt: undefined }),
    mk({ assetNo: 'AST-2021-000432', category: '단말', model: 'LG gram 17', status: '유휴', owner: '-', dept: '자산관리팀', location: '본사 3F 자산창고', os: 'Windows 10 Pro', purchaseDate: '2021-05-10', warrantyEnd: '2024-05-09',
      history: [
        { date: '2021-05-10', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2025-06-11', kind: '반납', detail: '퇴사자 반납 접수 · 상태 점검 완료', actor: '박자산' },
      ] }),
    mk({ assetNo: 'AST-2019-000218', category: '단말', model: 'Dell Latitude 5400', status: '폐기예정', owner: '-', dept: '자산관리팀', location: '본사 3F 자산창고', os: 'Windows 10 Pro', purchaseDate: '2019-04-22', warrantyEnd: '2022-04-21' }),
    // 유휴 주변기기 — 불출 배정 시 유형 다양성(단말 신청에 대한 유형 불일치 시연·재배치 우선 원칙)
    mk({ assetNo: 'AST-2023-000704', category: '주변기기', model: 'Dell UltraSharp U2723QE 27"', status: '유휴', owner: '-', dept: '자산관리팀', location: '본사 3F 자산창고', purchaseDate: '2023-06-15', warrantyEnd: '2026-06-14',
      history: [
        { date: '2023-06-15', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2026-05-02', kind: '반납', detail: '조직 개편 회수 · 상태 점검 완료', actor: '박자산' },
      ] }),
    mk({ assetNo: 'AST-2023-000561', category: '서버', model: 'PowerEdge R760', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-A Rack 12', os: 'RHEL 9.3', cpu: 'Xeon Gold 6430 ×2', memory: '512GB', ip: '10.10.8.21', mac: 'B8:CA:3A:55:01:11', contractId: 'CT-2023-021' }),
    mk({ assetNo: 'AST-2023-000562', category: '서버', model: 'PowerEdge R760', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-A Rack 12', os: 'RHEL 9.3', cpu: 'Xeon Gold 6430 ×2', memory: '512GB', ip: '10.10.8.22', mac: 'B8:CA:3A:55:01:12', contractId: 'CT-2023-021' }),
    // 장기 미실측 후보 ② — 보조 IDC(IDC-B) 노후 서버, 최근 실측 9개월 경과
    mk({ assetNo: 'AST-2020-000883', category: '서버', model: 'HPE DL380 Gen10', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-B Rack 3', os: 'CentOS 7.9', cpu: 'Xeon Silver 4210', memory: '128GB', ip: '10.10.9.14', mac: 'D0:67:E5:21:44:90', purchaseDate: '2020-02-14', warrantyEnd: '2025-02-13', lastVerifiedAt: '2025-10-15' }),
    mk({ assetNo: 'AST-2022-000640', category: '네트워크', model: 'Catalyst 9300-48P', status: '사용중', owner: '네트워크팀', dept: '네트워크팀', location: '본사 8F 통신실', ip: '10.20.0.2', mac: '4C:71:0D:88:12:01', purchaseDate: '2022-01-20', warrantyEnd: '2027-01-19', contractId: 'CT-2022-007' }),
    mk({ assetNo: 'AST-2022-000641', category: '네트워크', model: 'FortiGate 200F', status: '사용중', owner: '네트워크팀', dept: '보안운영팀', location: '본사 8F 통신실', ip: '10.20.0.1', mac: '4C:71:0D:88:12:02', purchaseDate: '2022-01-20', warrantyEnd: '2026-09-30', contractId: 'CT-2022-007' }),
    mk({ assetNo: 'AST-2024-000091', category: '가상자원', model: 'AWS EC2 m6i.2xlarge', status: '사용중', owner: '데이터플랫폼팀', dept: '데이터플랫폼팀', location: 'ap-northeast-2', os: 'Amazon Linux 2023', ip: '10.30.2.55', purchaseDate: '2024-02-01', warrantyEnd: '-' }),
    mk({ assetNo: 'AST-2024-000092', category: '가상자원', model: 'Azure D8s v5', status: '사용중', owner: '데이터플랫폼팀', dept: '데이터플랫폼팀', location: 'koreacentral', os: 'Ubuntu 22.04', ip: '10.31.4.12', purchaseDate: '2024-02-01', warrantyEnd: '-' }),
    mk({ assetNo: 'AST-2023-000720', category: 'SW', model: 'Microsoft 365 E3', status: '사용중', owner: '전사', dept: 'IT기획팀', location: '-', purchaseDate: '2023-01-01', warrantyEnd: '2026-12-31', contractId: 'CT-2023-002' }),
    mk({ assetNo: 'AST-2023-000721', category: 'SW', model: 'JetBrains All Products', status: '사용중', owner: '개발본부', dept: 'IT기획팀', location: '-', purchaseDate: '2023-06-01', warrantyEnd: '2026-05-31' }),
    mk({ assetNo: 'AST-2024-000015', category: '주변기기', model: 'Dell U2723QE 모니터', status: '사용중', owner: '김민준', dept: '플랫폼개발팀', purchaseDate: '2024-01-08', warrantyEnd: '2027-01-07' }),
    mk({ assetNo: 'AST-2025-000033', category: '단말', model: 'ThinkPad X1 Carbon G12', status: '검수중', owner: '-', dept: '자산관리팀', location: '본사 3F 검수실', os: 'Windows 11 Pro', purchaseDate: '2026-07-21', warrantyEnd: '2029-07-20', contractId: 'CT-2026-009',
      history: [{ date: '2026-07-21', kind: '등록', detail: '발주 연계 입고 · 검수 체크리스트 진행 중', actor: '박자산' }] }),
    mk({ assetNo: 'AST-2024-000377', category: '서버', model: 'Supermicro GPU A100 ×4', status: '사용중', owner: 'AI플랫폼팀', dept: 'AI플랫폼팀', location: 'IDC-A Rack 20', os: 'Ubuntu 22.04', cpu: 'EPYC 7543 ×2', memory: '1TB', ip: '10.10.12.5', mac: '7C:8A:E1:40:77:21', purchaseDate: '2024-05-13', warrantyEnd: '2027-05-12' }),
    mk({ assetNo: 'AST-2025-000512', category: '단말', model: 'Galaxy Book4 Pro', status: '사용중', owner: '최지우', dept: '영업1팀', os: 'Windows 11 Pro', cpu: 'Ultra 7 155H', memory: '16GB', ip: '10.20.52.31', mac: '9C:2D:CD:73:08:44', purchaseDate: '2025-03-02', warrantyEnd: '2028-03-01' }),
    mk({ assetNo: 'AST-2025-000513', category: '단말', model: 'Galaxy Book4 Pro', status: '반납대기', owner: '한도윤', dept: '영업1팀', os: 'Windows 11 Pro', purchaseDate: '2025-03-02', warrantyEnd: '2028-03-01',
      history: [
        { date: '2025-03-02', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2026-07-18', kind: '반납', detail: '부서 이동에 따른 반납 신청 (결재 진행 중)', actor: '한도윤' },
      ] }),
    mk({ assetNo: 'AST-2024-000618', category: '가상자원', model: 'vSphere VM (was-prod-03)', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-A vCluster1', os: 'RHEL 8.9', ip: '10.10.20.33', purchaseDate: '2024-03-11', warrantyEnd: '-' }),
    mk({ assetNo: 'AST-2026-000108', category: '단말', model: 'Raspberry Pi 5 (키오스크)', status: '사용중', owner: '총무팀', dept: '총무팀', location: '본사 1F 로비', os: 'Raspberry Pi OS', ip: '10.20.60.9', mac: 'E4:5F:01:99:AB:10', purchaseDate: '2026-04-15', warrantyEnd: '2027-04-14', discoveredVia: '네트워크 능동 스캔',
      history: [
        { date: '2026-04-02', kind: '편입', detail: '네트워크 능동 스캔 발견(2026-03-28) → 소유자 확인 → 결재 편입', actor: '박자산' },
      ] }),
    // 반납 점검에서 '수리 필요' 판정 → 수리중 (반납·유휴 화면의 수리 대기 카드에 표시)
    mk({ assetNo: 'AST-2025-000377', category: '단말', model: 'ThinkPad X1 Carbon G12', status: '수리중', owner: '미지정', dept: '자산관리팀', location: '본사 3F 자산창고', os: 'Windows 11 Pro', cpu: 'Ultra 7 155H', memory: '16GB', purchaseDate: '2025-01-20', warrantyEnd: '2028-01-19',
      history: [
        { date: '2025-01-20', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2025-01-24', kind: '불출', detail: '영업1팀 불출', actor: '박자산' },
        { date: '2026-07-28', kind: '반납', detail: '반납 접수 · 상태 점검 수리 필요 — 디스플레이 힌지 파손·좌측 USB-C 불량 (반납자 오세훈)', actor: '박자산' },
      ] }),
    // 수리 의뢰 접수됐으나 예상 반환일 경과(업체 지연) — 수리 예상 반환 경과 신호 시연
    mk({ assetNo: 'AST-2024-000512', category: '단말', model: 'Galaxy Book3 Ultra', status: '수리중', owner: '미지정', dept: '자산관리팀', location: '본사 3F 자산창고', os: 'Windows 11 Pro', cpu: 'i9-13900H', memory: '32GB', purchaseDate: '2024-05-10', warrantyEnd: '2027-05-09',
      repair: { vendor: '중부IT서비스', sentAt: '2026-07-18', eta: '2026-07-28', estCost: 420_000 },
      history: [
        { date: '2024-05-10', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2026-07-15', kind: '반납', detail: '반납 접수 · 상태 점검 수리 필요 — GPU 발열 셧다운 (반납자 김민준)', actor: '박자산' },
        { date: '2026-07-18', kind: '수리', detail: '수리 의뢰 — 중부IT서비스 · 예상 반환 2026-07-28 · 견적 420,000원', actor: '박자산' },
      ] }),
    // 폐기 완료 + 데이터 소거 증적 (폐기 처리 화면의 소거 확인서 다운로드에 표시)
    mk({ assetNo: 'AST-2018-000090', category: '단말', model: 'Dell Latitude 5290', status: '폐기완료', owner: '미지정', dept: '자산관리팀', location: '폐기 처리 완료', purchaseDate: '2018-05-02', warrantyEnd: '2021-05-01',
      history: [
        { date: '2018-05-02', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2026-07-20', kind: '폐기', detail: '폐기 결재 승인 · 데이터 소거 대기', actor: '박자산' },
        { date: '2026-07-22', kind: '폐기', detail: '데이터 소거 완료 (디가우징) · 증적 WIPE-20260722-050 보존', actor: '박자산' },
      ] }),
    // 대여(반출) 자산 ① — 기한 내 대여 중 (출장용 대여 노트북) · 대여자=목업 사용자(김민준) → 대시보드 My Work 에 반환 기한 노출
    mk({ assetNo: 'AST-2024-000230', category: '단말', model: 'ThinkPad L14 (대여용)', status: '대여중', owner: '김민준', dept: '플랫폼개발팀', location: '판교 사무소', os: 'Windows 11 Pro', purchaseDate: '2024-06-10', warrantyEnd: '2027-06-09', loanDueDate: '2026-08-20',
      history: [
        { date: '2024-06-10', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2026-07-28', kind: '대여', detail: '플랫폼개발팀 김민준 출장 대여 — 반환 기한 2026-08-20', actor: '박자산' },
      ] }),
    // 대여(반출) 자산 ② — 반환 기한 경과(연체) — 행사용 프로젝터 미반납
    mk({ assetNo: 'AST-2023-000450', category: '주변기기', model: 'Epson EB-2250U 프로젝터 (대여용)', status: '대여중', owner: '한지민', dept: '총무팀', location: '본사 2F 대회의실', purchaseDate: '2023-04-18', warrantyEnd: '2026-04-17', loanDueDate: '2026-07-15',
      history: [
        { date: '2023-04-18', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2026-07-08', kind: '대여', detail: '총무팀 한지민 사내 행사 대여 — 반환 기한 2026-07-15', actor: '박자산' },
      ] }),
  ]
}

/** 채널별 원시 관측 — 같은 장비를 여러 채널이 본다. 발견 목록은 이것을 지문으로 병합한 결과다.
 *  (단일 채널만 본 자산도 있으므로 관측 1건짜리 발견 자산이 정상이다) */
/** 최근 스캔 이력 — 야간 정책 창(23:00~05:00) 안에서 도는 정기 수집 */
/** 재탐지 대상 도메인 — 능동 탐지는 사전 협의된 도메인에서만 돈다 */
/** 권한 매트릭스 초기값 — 화면 하드코딩이던 것을 스토어로 옮겨 편집·강제 가능하게 했다.
 *  순서는 PERM_ACTIONS(조회·저장·삭제·엑셀·편입·격리요청·결재)와 일치해야 한다. */
/** 리포트 스케줄 — 주간은 월요일 08:00, 월간은 1일 08:00 기준 */
function seedReportSchedules(): ReportSchedule[] {
  return [
    // 스케줄러가 한 주 밀린 상태 — '기한 도래'가 화면에서 드러나야 밀린 사실을 알 수 있다
    { kind: '주간 Shadow IT 브리핑', period: '주간', enabled: true, dayOfWeek: 1, hour: 8, recipients: ['보안운영팀', 'IT기획팀'], lastRunAt: '2026-07-20' },
    { kind: '월간 자산 현황', period: '월간', enabled: true, dayOfMonth: 1, hour: 8, recipients: ['IT기획팀', '자산관리팀'], lastRunAt: '2026-07-01' },
    { kind: '라이선스 컴플라이언스', period: '월간', enabled: false, dayOfMonth: 1, hour: 8, recipients: ['IT기획팀'], lastRunAt: '2026-06-01' },
  ]
}

/** 메뉴 정의 (STEP 1·2) — 화면번호·카테고리와 각 화면이 제공하는 기능.
 *  enforced 는 서버 액션/API 가 실제로 검사하는 기능이며, 나머지는 선언된 정책이다. */
function seedMenuDefs(): MenuDef[] {
  return [
    { code: 'MAIN-010', category: 'Main',      menu: '대시보드',            path: '/dashboard',            actions: ['조회', '엑셀'],                                  enforced: [] },
    { code: 'AST-010',  category: '자산관리',   menu: '자산 대장',           path: '/assets/register',      actions: ['조회', '저장', '삭제', '엑셀', '편입', '결재'],    enforced: ['엑셀'] },
    { code: 'AST-020',  category: '자산관리',   menu: '수명주기',            path: '/assets/lifecycle',     actions: ['조회', '저장', '삭제', '엑셀', '결재'],            enforced: [] },
    { code: 'INV-010',  category: '재고·계약',  menu: '재고 · 재물조사',      path: '/inventory/stock',      actions: ['조회', '저장', '삭제', '엑셀', '결재'],            enforced: ['엑셀'] },
    { code: 'INV-020',  category: '재고·계약',  menu: '계약 · 라이선스',      path: '/inventory/contracts',  actions: ['조회', '저장', '삭제', '엑셀', '결재'],            enforced: ['엑셀'] },
    { code: 'DSC-010',  category: 'Discovery', menu: '발견 자산 · CMDB 대사', path: '/discovery/found',      actions: ['조회', '저장', '엑셀', '편입', '격리요청', '결재'], enforced: ['엑셀', '편입', '격리요청'] },
    { code: 'DSC-030',  category: 'Discovery', menu: 'Shadow SaaS',        path: '/discovery/saas',       actions: ['조회', '저장', '엑셀', '격리요청', '결재'],        enforced: [] },
    { code: 'AI-010',   category: 'AI',        menu: 'AI 어시스턴트',        path: '/ai/assistant',         actions: ['조회', '엑셀'],                                  enforced: [] },
    { code: 'WFL-010',  category: '워크플로',   menu: '신청 · 결재',          path: '/workflow/approvals',   actions: ['조회', '저장', '엑셀', '격리요청', '결재'],        enforced: ['엑셀', '결재'] },
    { code: 'CFG-010',  category: '환경설정',   menu: '권한 · 정책',          path: '/settings/permissions', actions: ['조회', '저장', '삭제', '엑셀'],                   enforced: [] },
  ]
}

function seedMenuPermissions(): MenuPermission[] {
  return [
    { menu: '대시보드', cells: { USER: ['y','n','n','n','n','n','n'], ASSET_MGR: ['y','n','n','y','n','n','n'], SEC_MGR: ['y','n','n','y','n','n','n'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: '자산 대장', cells: { USER: ['p','n','n','n','n','n','n'], ASSET_MGR: ['y','y','y','y','y','n','y'], SEC_MGR: ['y','n','n','y','n','y','n'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: '수명주기', cells: { USER: ['n','n','n','n','n','n','n'], ASSET_MGR: ['y','y','y','y','n','n','y'], SEC_MGR: ['n','n','n','n','n','n','n'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: '재고 · 재물조사', cells: { USER: ['n','n','n','n','n','n','n'], ASSET_MGR: ['y','y','y','y','n','n','y'], SEC_MGR: ['n','n','n','n','n','n','n'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: '계약 · 라이선스', cells: { USER: ['n','n','n','n','n','n','n'], ASSET_MGR: ['y','y','y','y','n','n','y'], SEC_MGR: ['y','n','n','y','n','n','n'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: '발견 자산 · CMDB 대사', cells: { USER: ['n','n','n','n','n','n','n'], ASSET_MGR: ['y','y','n','y','y','y','y'], SEC_MGR: ['y','y','n','y','y','y','y'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: 'Shadow SaaS', cells: { USER: ['n','n','n','n','n','n','n'], ASSET_MGR: ['y','n','n','y','n','n','n'], SEC_MGR: ['y','y','n','y','n','y','y'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: 'AI 어시스턴트', cells: { USER: ['p','n','n','n','n','n','n'], ASSET_MGR: ['y','n','n','y','n','n','n'], SEC_MGR: ['y','n','n','y','n','n','n'], ADMIN: ['y','y','n','y','n','n','n'] } },
    { menu: '신청 · 결재', cells: { USER: ['p','y','n','n','n','n','n'], ASSET_MGR: ['y','y','n','y','n','n','y'], SEC_MGR: ['y','y','n','y','n','y','y'], ADMIN: ['y','y','y','y','y','y','y'] } },
    { menu: '권한 · 정책', cells: { USER: ['n','n','n','n','n','n','n'], ASSET_MGR: ['n','n','n','n','n','n','n'], SEC_MGR: ['n','n','n','n','n','n','n'], ADMIN: ['y','y','y','y','y','y','y'] } },
  ]
}

function seedEasmTargets(): EasmTarget[] {
  return [
    { domain: 'seekerslab.co.kr', intervalDays: 7, lastRunAt: '2026-07-26', activeApproved: true, note: '주력 도메인 — 능동 탐지 협의 완료' },
    { domain: 'seekerslab.com', intervalDays: 14, lastRunAt: '2026-07-19', activeApproved: true },
    { domain: 'skl-dev.io', intervalDays: 30, lastRunAt: '2026-07-02', activeApproved: false, note: '개발용 도메인 — 능동 탐지 미협의 (수동 수집만)' },
  ]
}

function seedEasmRuns(): EasmRun[] {
  return [
    { id: 'EASM-2607-26', startedAt: '2026-07-26 02:00', finishedAt: '2026-07-26 02:47', domains: ['seekerslab.co.kr'], mode: 'Passive+Active', status: '완료', candidates: 34, confirmed: 6, newFound: 1, by: '스케줄러 (주간)' },
    { id: 'EASM-2607-19', startedAt: '2026-07-19 02:00', finishedAt: '2026-07-19 02:31', domains: ['seekerslab.com'], mode: 'Passive', status: '완료', candidates: 12, confirmed: 0, newFound: 0, by: '스케줄러 (격주)' },
  ]
}

/** 재탐지가 돌면 드러날 외부 노출 자산 — 수동 수집으로 후보가 잡히고 능동으로 생존이 확인된다 */
function seedUnseenExternal(): UnseenExternal[] {
  return [
    { host: 'staging-api.seekerslab.co.kr', ip: '203.0.113.44', method: '인증서 투명성 (CT)', mode: 'Passive', domain: 'seekerslab.co.kr', risk: '중간', note: 'CT 로그 신규 발급 인증서 — 스테이징 API 외부 노출 후보' },
    { host: 'grafana.seekerslab.co.kr', ip: '203.0.113.51', method: '서브도메인 브루트포스', mode: 'Active', domain: 'seekerslab.co.kr', services: '3000/http (Grafana 9.3)', cve: 'CVE-2022-39307', cvss: 5.3, risk: '높음', note: '인증 없이 노출된 대시보드 — 기본 크리덴셜 점검 필요' },
    { host: 'old-jenkins.skl-dev.io', ip: '198.51.100.7', method: '웹 아카이브', mode: 'Passive', domain: 'skl-dev.io', risk: '중간', note: '과거 관측 호스트 — 생존 확인 전까지 비활성 표기' },
  ]
}

function seedScanRuns(): ScanRun[] {
  return [
    { id: 'SCN-RUN-2607-28', startedAt: '2026-07-28 23:00', finishedAt: '2026-07-28 23:41', channels: ['네트워크 능동 스캔', '패시브 트래픽', 'EDR·엔드포인트', 'DNS·프록시 로그', '클라우드 API', 'AD/IdP·SSO 로그'], scope: '10.20.0.0/16 · 10.10.0.0/16', intensity: '보통', status: '완료', observed: 16, reobserved: 14, newFound: 2, by: '스케줄러 (야간 정책)' },
    { id: 'SCN-RUN-2607-27', startedAt: '2026-07-27 23:00', finishedAt: '2026-07-27 23:38', channels: ['네트워크 능동 스캔', '패시브 트래픽', 'EDR·엔드포인트', 'DNS·프록시 로그', '클라우드 API', 'AD/IdP·SSO 로그'], scope: '10.20.0.0/16 · 10.10.0.0/16', intensity: '보통', status: '완료', observed: 14, reobserved: 13, newFound: 1, by: '스케줄러 (야간 정책)' },
    { id: 'SCN-RUN-2607-26', startedAt: '2026-07-26 23:00', finishedAt: '2026-07-26 23:12', channels: ['네트워크 능동 스캔'], scope: '10.20.60.0/24 (IoT 세그먼트)', intensity: '낮음', status: '중단', observed: 3, reobserved: 3, newFound: 0, by: '윤보안', override: '민원 대응 — 세그먼트 한정 확인' },
  ]
}

/** 스캔이 돌면 드러날 장비들 — 채널별 사각지대를 보여주기 위해 발견 채널을 다르게 뒀다 */
function seedUndiscovered(): UndiscoveredDevice[] {
  return [
    { hostname: 'rpi-lab-01', ip: '10.20.33.114', mac: 'DC:A6:32:41:9B:07', type: '단말 (Raspberry Pi)', by: ['네트워크 능동 스캔', '패시브 트래픽'], risk: '중간', note: '사내망 개인 장비 추정 — SSH 오픈', ownerCandidate: '연구개발팀 추정 (스위치 포트 기준)' },
    { hostname: 'sw-lab-tplink', ip: '10.20.33.2', mac: 'B0:BE:76:22:10:55', type: '네트워크 (미인가 스위치)', by: ['네트워크 능동 스캔'], risk: '높음', note: '미신고 스위치 — 세그먼트 확장 흔적' },
    { hostname: 'i-0b77e2aa41', ip: '10.30.5.18', mac: '-', type: 'AWS EC2 (t3.micro)', by: ['클라우드 API'], risk: '중간', note: '태그 미부착 인스턴스 — 개인 액세스키로 생성', ownerCandidate: '데이터플랫폼팀 (계정 태그)' },
    { hostname: 'oauth-app:zapier', ip: '-', mac: '-', type: 'OAuth 앱', by: ['AD/IdP·SSO 로그'], risk: '중간', note: '미인가 OAuth 연동 — 메일·드라이브 스코프', ownerCandidate: '영업1팀 (연동 계정 부서)' },
  ]
}

function seedObservations(): ChannelObservation[] {
  const o = (
    id: string, discoveredId: string, channel: ChannelObservation['channel'],
    hostname: string, ip: string, mac: string, seenAt: string, detail: string,
  ): ChannelObservation => ({ id, discoveredId, channel, hostname, ip, mac, seenAt, detail })
  return [
    // 3채널이 본 미등록 단말 — 능동 스캔·패시브·EDR 가 각각 다른 근거로 같은 MAC 을 관측
    o('OBS-4101', 'DSC-2607-0041', '네트워크 능동 스캔', 'ip-10-20-31-88', '10.20.31.88', '00:1A:2B:77:F0:12', '2026-07-24 02:14', '포트 스윕 — 445/3389 오픈, OS 핑거프린트 Windows 10'),
    o('OBS-4102', 'DSC-2607-0041', '패시브 트래픽', '-', '10.20.31.88', '00:1A:2B:77:F0:12', '2026-07-26 11:03', 'DHCP 리스 관측 — 스위치 3번 포트'),
    o('OBS-4103', 'DSC-2607-0041', 'AD/IdP·SSO 로그', 'WS-KJM-02', '10.20.31.88', '-', '2026-07-28 09:41', 'AD 미가입 단말에서 SSO 로그인 시도'),
    // 2채널
    o('OBS-4201', 'DSC-2607-0042', '패시브 트래픽', 'nas-dev-team', '10.20.31.90', '28:C6:8E:31:44:AA', '2026-07-22 16:20', 'ARP·DHCP 리스 관측, SMB 트래픽 다량'),
    o('OBS-4601', 'DSC-2607-0046', '네트워크 능동 스캔', 'DESKTOP-UNK09', '10.10.8.77', '9C:2A:70:55:AB:19', '2026-07-28 02:22', 'IDC 서버 대역 포트 스윕 — 445/3389 오픈, Windows 핑거프린트'),
    o('OBS-4202', 'DSC-2607-0042', '네트워크 능동 스캔', 'nas-dev-team', '10.20.31.90', '28:C6:8E:31:44:AA', '2026-07-28 02:31', '445/5000 오픈 — Synology DSM 배너'),
    o('OBS-3801', 'DSC-2607-0038', '패시브 트래픽', 'ESP-9F31A2', '10.20.60.41', '84:F3:EB:9F:31:A2', '2026-07-19 08:55', 'ESP32 OUI — 외부 MQTT(1883) 아웃바운드'),
    o('OBS-3501', 'DSC-2607-0035', '클라우드 API', 'i-0f3a91c2d8', '10.30.2.91', '-', '2026-07-15 03:00', 'AWS Config — 태그 미부착 인스턴스, 개발 VPC'),
    o('OBS-3502', 'DSC-2607-0035', '네트워크 능동 스캔', 'i-0f3a91c2d8', '10.30.2.91', '-', '2026-07-28 02:40', 'VPN 경유 스캔 — 22 오픈'),
    o('OBS-2901', 'DSC-2607-0029', 'EDR·엔드포인트', 'DESKTOP-KJM45', '10.20.52.77', '5C:60:BA:12:88:31', '2026-07-28 07:12', 'EDR 콘솔 — 최근 로그온 위치 판교 사무소'),
    o('OBS-2701', 'DSC-2607-0027', '네트워크 능동 스캔', 'was-prod-03', '10.10.20.33', '-', '2026-07-28 02:20', '대장 자산과 일치 — 생존 확인'),
    o('OBS-1021', 'DSC-2606-0102', '네트워크 능동 스캔', 'printer-3f-old', '10.20.35.60', '00:80:92:44:1C:55', '2026-06-05 02:10', '마지막 응답 — 이후 40일 무응답'),
    o('OBS-4401', 'DSC-2607-0044', 'AD/IdP·SSO 로그', 'oauth-app:notion-sync', '-', '-', '2026-07-26 14:02', 'OAuth 앱 승인 — Drive 전체 읽기 스코프'),
    o('OBS-3101', 'DSC-2607-0031', '클라우드 API', 'ip-10-31-4-70', '10.31.4.70', '-', '2026-07-25 03:10', 'Azure Resource Graph — 개인 구독 태그'),
    o('OBS-1801', 'DSC-2607-0018', 'DNS·프록시 로그', 'ubnt-ap-guest', '10.20.61.2', '78:8A:20:0B:CC:41', '2026-07-28 22:40', '미인가 아웃바운드 도메인 다수'),
    o('OBS-1802', 'DSC-2607-0018', '네트워크 능동 스캔', 'ubnt-ap-guest', '10.20.61.2', '78:8A:20:0B:CC:41', '2026-07-27 02:05', '게스트 SSID 브로드캐스트 확인'),
    // 병합되지 않은 중복 후보 — 같은 호스트명이지만 MAC 이 달라 지문이 갈렸다(NIC 교체 추정).
    // 자동 병합은 지문 일치에만 적용되므로, 이런 건은 담당자가 확인해 수동 병합한다.
    o('OBS-4501', 'DSC-2607-0045', '패시브 트래픽', 'nas-dev-team', '10.20.31.91', 'AA:BB:CC:00:11:22', '2026-07-27 09:15', '동일 호스트명·다른 MAC — NIC 교체 또는 별도 장비'),
  ]
}

function seedDiscovered(): DiscoveredAsset[] {
  // 지문은 관측에서 산출된다 — 시드도 같은 규칙(fingerprintOf)으로 채워 일관성을 유지한다
  const fp = (d: Omit<DiscoveredAsset, 'fingerprint'>): DiscoveredAsset => ({ ...d, fingerprint: fingerprintOf(d) })
  return ([
    // 확인 요청을 보낸 상태 — 대응하는 결재(APR-2607-114)와 발송 이력(MSG-4001)이 함께 있다
    { id: 'DSC-2607-0041', hostname: 'ip-10-20-31-88', ip: '10.20.31.88', mac: '00:1A:2B:77:F0:12', channel: '네트워크 능동 스캔', type: '단말 (Windows)', firstSeen: '2026-07-24', lastSeen: '2026-07-28', state: '미등록', risk: '높음', ownerCandidate: '플랫폼개발팀 추정 (스위치 포트 기준)', note: 'SMB·RDP 오픈, OS 핑거프린트 Windows 10', action: '확인요청', confirmRequestedAt: '2026-07-25' },
    { id: 'DSC-2607-0042', hostname: 'nas-dev-team', ip: '10.20.31.90', mac: '28:C6:8E:31:44:AA', channel: '패시브 트래픽', type: 'NAS', firstSeen: '2026-07-22', lastSeen: '2026-07-28', state: '미등록', risk: '높음', ownerCandidate: '플랫폼개발팀', note: 'DHCP 리스·ARP 관측, SMB 트래픽 다량' },
    // 서버·IDC망(10.10.x)에 나타난 미등록 단말 — 서버 VLAN 침입 의심(최우선 격리 대상)
    { id: 'DSC-2607-0046', hostname: 'DESKTOP-UNK09', ip: '10.10.8.77', mac: '9C:2A:70:55:AB:19', channel: '네트워크 능동 스캔', type: '단말 (Windows)', firstSeen: '2026-07-28', lastSeen: '2026-07-29', state: '미등록', risk: '높음', note: 'IDC 서버 대역에서 관측된 미인가 Windows 단말 — 445/3389 오픈, AD 미가입' },
    // 소유자 미상 IoT — 확인 요청을 전사 공지로 보냈으나 기한(7일)을 넘겨 무응답. 에스컬레이션 대상.
    { id: 'DSC-2607-0038', hostname: 'ESP-9F31A2', ip: '10.20.60.41', mac: '84:F3:EB:9F:31:A2', channel: '패시브 트래픽', type: 'IoT 장비', firstSeen: '2026-07-19', lastSeen: '2026-07-27', state: '미등록', risk: '중간', note: 'ESP32 계열 — 사내망 IoT, 외부 MQTT 접속 시도', action: '확인요청', confirmRequestedAt: '2026-07-20' },
    { id: 'DSC-2607-0035', hostname: 'i-0f3a91c2d8', ip: '10.30.2.91', mac: '-', channel: '클라우드 API', type: 'AWS EC2 (t3.large)', firstSeen: '2026-07-15', lastSeen: '2026-07-28', state: '미등록', risk: '중간', ownerCandidate: '데이터플랫폼팀 (계정 태그)', note: '태그 미부착 인스턴스 · 개발 VPC' },
    { id: 'DSC-2607-0029', hostname: 'DESKTOP-KJM45', ip: '10.20.52.77', mac: '5C:60:BA:12:88:31', channel: 'EDR·엔드포인트', type: '단말 (Windows)', firstSeen: '2026-07-10', lastSeen: '2026-07-28', state: '등록·불일치', risk: '중간', matchedAssetNo: 'AST-2025-000512', mismatch: '위치 상이 — 대장 본사 8F / 실측 판교 사무소', note: 'EDR 콘솔 위치 정보와 대장 불일치' },
    { id: 'DSC-2607-0027', hostname: 'was-prod-03', ip: '10.10.20.33', mac: '-', channel: '네트워크 능동 스캔', type: '가상자원 (VM)', firstSeen: '2026-07-08', lastSeen: '2026-07-28', state: '등록·일치', risk: '낮음', matchedAssetNo: 'AST-2024-000618' },
    { id: 'DSC-2606-0102', hostname: 'printer-3f-old', ip: '10.20.35.60', mac: '00:80:92:44:1C:55', channel: '네트워크 능동 스캔', type: '주변기기 (프린터)', firstSeen: '2026-06-02', lastSeen: '2026-06-05', state: '미확인', risk: '낮음', note: '최근 40일 실측 없음 — 유휴·분실 후보, 재물조사 대상 편성' },
    { id: 'DSC-2607-0044', hostname: 'oauth-app:notion-sync', ip: '-', mac: '-', channel: 'AD/IdP·SSO 로그', type: 'OAuth 앱', firstSeen: '2026-07-26', lastSeen: '2026-07-28', state: '미등록', risk: '중간', ownerCandidate: '마케팅팀 (연동 계정 부서)', note: '미인가 OAuth 연동 — Drive 전체 읽기 권한 요청' },
    { id: 'DSC-2607-0031', hostname: 'ip-10-31-4-70', ip: '10.31.4.70', mac: '-', channel: '클라우드 API', type: 'Azure VM (B2s)', firstSeen: '2026-07-12', lastSeen: '2026-07-25', state: '미등록', risk: '낮음', ownerCandidate: '데이터플랫폼팀', note: '개인 구독으로 생성 — 조직 정책 위반 후보', action: '격리요청' },
    { id: 'DSC-2607-0045', hostname: 'nas-dev-team', ip: '10.20.31.91', mac: 'AA:BB:CC:00:11:22', channel: '패시브 트래픽', type: 'NAS', firstSeen: '2026-07-27', lastSeen: '2026-07-27', state: '미등록', risk: '중간', ownerCandidate: '플랫폼개발팀', note: '동일 호스트명(nas-dev-team)·다른 MAC — 병합 후보' },
    { id: 'DSC-2607-0018', hostname: 'ubnt-ap-guest', ip: '10.20.61.2', mac: '78:8A:20:0B:CC:41', channel: 'DNS·프록시 로그', type: '네트워크 (AP)', firstSeen: '2026-07-03', lastSeen: '2026-07-28', state: '등록·불일치', risk: '높음', matchedAssetNo: 'AST-2022-000640', mismatch: '구성 상이 — 대장에 없는 게스트 SSID 브로드캐스트', note: '방화벽 로그에 미인가 아웃바운드 도메인 다수' },
  ] as Omit<DiscoveredAsset, 'fingerprint'>[]).map(fp)
}

/** 외부 공격표면 — 수동(무접촉) 수집으로 후보 확보 → 능동 탐지로 생존·서비스·취약점 확인 */
function seedExternal(): ExternalAsset[] {
  return [
    { id: 'EXT-2607-01', host: 'legacy-vpn.seekerslab.co.kr', ip: '203.0.113.44', method: '인증서 투명성 (CT)', mode: 'Passive', alive: true, services: 'HTTPS 443 (Fortinet SSL-VPN 6.0.4)', cve: 'CVE-2018-13379', cvss: 9.8, risk: '높음', firstSeen: '2026-07-22', state: '미등록', note: '만료 임박 인증서 · 대장에 없는 잊힌 VPN 게이트웨이' },
    { id: 'EXT-2607-02', host: 'dev-api.seekerslab.co.kr', ip: '203.0.113.51', method: '서브도메인 브루트포스', mode: 'Active', alive: true, services: 'HTTP 8080 (Swagger UI 노출)', risk: '높음', firstSeen: '2026-07-24', state: '미등록', note: '개발 API 문서가 인증 없이 외부 공개' },
    { id: 'EXT-2607-03', host: 'old-portal.seekerslab.co.kr', ip: '203.0.113.12', method: '웹 아카이브', mode: 'Passive', alive: false, risk: '낮음', firstSeen: '2026-07-19', state: '미확인', note: '과거 관측 호스트 — 생존 확인 전까지 비활성 표기' },
    { id: 'EXT-2607-04', host: 'mail.seekerslab.co.kr', ip: '203.0.113.25', method: '역DNS · CIDR 스캔', mode: 'Active', alive: true, services: 'SMTP 25 · IMAPS 993', risk: '낮음', firstSeen: '2026-07-15', state: '등록·일치', note: '대장 등록 자산 — 정상 노출' },
    { id: 'EXT-2607-05', host: 'stg.seekerslab.co.kr', ip: '203.0.113.77', method: '순열 생성 (환경 접두)', mode: 'Active', alive: true, services: 'HTTPS 443 (Basic 인증)', risk: '중간', firstSeen: '2026-07-25', state: '미등록', note: '기본 크리덴셜 점검 대상 — stg/dev/uat 순열에서 발견' },
    { id: 'EXT-2607-06', host: 'db-backup.seekerslab.co.kr', ip: '203.0.113.90', method: '존 트랜스퍼 (AXFR)', mode: 'Active', alive: true, services: 'PostgreSQL 5432 (외부 노출)', cve: 'CVE-2024-10977', cvss: 8.1, risk: '높음', firstSeen: '2026-07-26', state: '미등록', note: 'DB 포트가 인터넷에 직접 노출 — 즉시 차단 필요', action: '차단요청' },
    { id: 'EXT-2607-07', host: 'kiosk-cam.seekerslab.co.kr', ip: '203.0.113.101', method: '검색엔진 도킹', mode: 'Passive', alive: true, services: 'HTTP 80 (관리 콘솔)', risk: '중간', firstSeen: '2026-07-20', state: '미등록', note: '공개 색인된 관리 콘솔 — site: 도크로 발견' },
    { id: 'EXT-2607-08', host: 'cdn-assets.seekerslab.co.kr', ip: '203.0.113.66', method: 'DNS 인텔리전스', mode: 'Passive', alive: true, services: 'HTTPS 443', risk: '낮음', firstSeen: '2026-07-11', state: '등록·일치' },
  ]
}

function seedLeaks(): LeakFinding[] {
  return [
    { id: 'LEAK-01', kind: '유출 계정', detail: 'seekerslab.co.kr 도메인 계정 14건 — 외부 유출 데이터셋에서 매칭', source: '유출 자격증명 피드', confidence: '높음', foundAt: '2026-07-27' },
    { id: 'LEAK-02', kind: '스틸러 로그', detail: '사내 포털 세션 쿠키 포함 스틸러 로그 2건 (감염 단말 추정)', source: '다크웹 마켓 모니터링', confidence: '중간', foundAt: '2026-07-25' },
    { id: 'LEAK-03', kind: '코드 저장소 시크릿', detail: '공개 저장소 커밋에 AWS 액세스 키 형태 문자열 1건', source: '코드 저장소 스캔', confidence: '높음', foundAt: '2026-07-23' },
    { id: 'LEAK-04', kind: '랜섬웨어 유출 사이트', detail: '협력사 명의 게시글에 당사 도메인 언급 — 직접 피해 여부 확인 중', source: 'Tor .onion 크롤', confidence: '낮음', foundAt: '2026-07-18' },
  ]
}

function seedIntegrations(): Integration[] {
  return [
    { id: 'INT-NAC', system: 'NAC', method: 'REST API', purpose: '단말 인증·미인증 목록 수집, 미확인 자산 격리 요청', role: '수집 · 조치', status: '정상', lastSync: '2026-07-29 09:40', volume24h: 1_284 },
    { id: 'INT-EDR', system: 'EDR · 백신 콘솔', method: 'REST API', purpose: '단말·설치 SW 인벤토리 — 라이선스 대사·미인가 SW 검출 원천', role: '수집', status: '정상', lastSync: '2026-07-29 09:35', volume24h: 3_910 },
    { id: 'INT-AD', system: 'AD / Entra ID', method: 'API · 로그', purpose: '계정-단말-부서 매핑, OAuth 앱·휴면 계정 발견', role: '수집', status: '정상', lastSync: '2026-07-29 09:30', volume24h: 8_442 },
    { id: 'INT-PRX', system: '프록시 · 방화벽 · DNS', method: '로그 수집', purpose: '아웃바운드 도메인 → SaaS 카탈로그 매칭 (Shadow SaaS)', role: '수집', status: '지연', lastSync: '2026-07-29 06:10', volume24h: 41_770 },
    { id: 'INT-CSP', system: 'CSP (AWS · Azure)', method: 'CSP API', purpose: '클라우드 리소스·계정 인벤토리, 미관리 리소스 발견', role: '수집', status: '정상', lastSync: '2026-07-29 09:00', volume24h: 612 },
    { id: 'INT-GW', system: '그룹웨어 · 인사', method: 'SAML · API', purpose: 'SSO 인증, 결재 연동, 조직·인사 정보 (소유자 확인 메일 기준)', role: '수집 · 조치', status: '정상', lastSync: '2026-07-29 09:45', volume24h: 226 },
    { id: 'INT-ITSM', system: 'ITSM · 구매', method: 'REST API', purpose: 'SR·발주 정보 연계 — 도입 예정 자산 사전 등록', role: '수집', status: '미연동', lastSync: '-', volume24h: 0 },
  ]
}

function seedAuditLogs(): AuditLog[] {
  return [
    { id: 'AUD-9001', at: '2026-07-29 09:42:11', actor: '박자산', action: '발견 자산 편입 요청', target: 'DSC-2607-0041', result: '성공', ip: '10.20.31.45' },
    { id: 'AUD-9000', at: '2026-07-29 09:31:05', actor: '윤보안', action: 'NAC 격리 요청 결재', target: 'DSC-2607-0031', result: '성공', ip: '10.20.44.9' },
    { id: 'AUD-8999', at: '2026-07-29 09:12:47', actor: 'AI 서비스', action: 'AI 질의 (권한 필터 적용)', target: '라이선스 초과 사용 현황', result: '성공', ip: '127.0.0.1' },
    { id: 'AUD-8998', at: '2026-07-29 08:58:20', actor: '김민준', action: '권한 밖 화면 접근 시도', target: '/settings/permissions', result: '실패', ip: '10.20.31.45' },
    { id: 'AUD-8997', at: '2026-07-29 08:40:03', actor: 'Discovery 엔진', action: '외부 공격표면 스캔 완료', target: 'seekerslab.co.kr', result: '성공', ip: '10.10.12.5' },
    { id: 'AUD-8996', at: '2026-07-29 08:00:00', actor: '시스템관리자', action: '탐지 채널 정책 변경 (능동 스캔 시간대)', target: '01 네트워크 능동 스캔', result: '성공', ip: '10.20.60.2' },
  ]
}

function seedCodeGroups(): CodeGroup[] {
  const v = (...items: [string, string][]): CodeValue[] =>
    items.map(([code, label], i) => ({ code, label, sort: (i + 1) * 10, active: true }))
  return [
    { id: 'ASSET_CATEGORY', name: '자산 유형', desc: '자산 대장 대분류 — H/W · S/W · 가상자원', values: v(['HW_TERMINAL', '단말'], ['HW_SERVER', '서버'], ['HW_NETWORK', '네트워크'], ['HW_PERIPHERAL', '주변기기'], ['SW', 'SW'], ['VIRTUAL', '가상자원']) },
    { id: 'ASSET_STATUS', name: '자산 상태', desc: '수명주기 5단계 연동 상태값', values: v(['INSPECT', '검수중'], ['IN_USE', '사용중'], ['IDLE', '유휴'], ['RETURN_WAIT', '반납대기'], ['DISPOSE_PLAN', '폐기예정'], ['DISPOSED', '폐기완료']) },
    { id: 'RECONCILE', name: '대사 결과', desc: 'CMDB 대사 4상태 — 상태별 후속 처리 자동 연결', values: v(['MATCH', '등록·일치'], ['MISMATCH', '등록·불일치'], ['UNREGISTERED', '미등록'], ['UNCONFIRMED', '미확인']) },
    { id: 'RISK', name: '위험도', desc: '발견 자산·SaaS·AI 제안 공통 등급', values: v(['HIGH', '높음'], ['MEDIUM', '중간'], ['LOW', '낮음']) },
    { id: 'DATA_GRADE', name: '데이터 등급', desc: 'SaaS 카탈로그·자산 중요도 산정 기준', values: v(['GENERAL', '일반'], ['SENSITIVE', '민감'], ['CONFIDENTIAL', '기밀']) },
    {
      id: 'LOCATION',
      name: '위치',
      desc: '사업장·IDC 랙 단위 위치 코드 — 재물조사 실사 위치 목록의 원천. 클라우드 리전은 물리 실사 대상이 아니므로 제외한다.',
      values: v(
        ['HQ_8F', '본사 8F'],
        ['HQ_8F_NET', '본사 8F 통신실'],
        ['HQ_9F', '본사 9F'],
        ['HQ_3F_WH', '본사 3F 자산창고'],
        ['HQ_3F_INSP', '본사 3F 검수실'],
        ['HQ_1F_LOBBY', '본사 1F 로비'],
        ['IDC_A_R12', 'IDC-A Rack 12'],
        ['IDC_A_R20', 'IDC-A Rack 20'],
        ['IDC_A_VC1', 'IDC-A vCluster1'],
        ['IDC_B_R3', 'IDC-B Rack 3'],
        ['PANGYO', '판교 사무소'],
      ),
    },
  ]
}

function seedScanPolicies(): ScanPolicy[] {
  return [
    { channel: '네트워크 능동 스캔', enabled: true, kind: '능동', targets: '10.20.0.0/16 · 10.10.0.0/16', window: '23:00 ~ 05:00', intensity: '보통', interval: '매일', note: '운영망 영향 최소화 — 시간대·강도 정책 협의 완료' },
    { channel: '패시브 트래픽', enabled: true, kind: '패시브', targets: '코어 스위치 미러링 · NetFlow', window: '상시', intensity: '낮음', interval: '실시간', note: '무중단 — 능동 스캔 사각지대 보완' },
    { channel: 'DNS·프록시 로그', enabled: true, kind: '로그 수집', targets: '프록시·방화벽·DNS 로그', window: '상시', intensity: '낮음', interval: '5분', note: 'Shadow SaaS 발견 원천' },
    { channel: 'EDR·엔드포인트', enabled: true, kind: 'API 연동', targets: 'EDR 콘솔 API', window: '상시', intensity: '낮음', interval: '1시간', note: '신규 에이전트 배포 없이 수집' },
    { channel: '클라우드 API', enabled: true, kind: 'API 연동', targets: 'AWS Config · Azure Resource Graph', window: '상시', intensity: '낮음', interval: '6시간', note: 'TLS 아웃바운드 한정 (선택 구성)' },
    { channel: 'AD/IdP·SSO 로그', enabled: true, kind: '로그 수집', targets: 'AD · Entra ID 로그', window: '상시', intensity: '낮음', interval: '1시간', note: '계정 기반 Shadow IT — OAuth 앱·휴면 계정' },
  ]
}

function seedSaasCatalog(): SaasCatalogEntry[] {
  return [
    { id: 'CAT-01', service: 'Notion', category: '협업', vendor: 'Notion Labs', status: '검토중', dataGrade: '민감', owner: '마케팅팀' },
    { id: 'CAT-02', service: 'Figma', category: '디자인', vendor: 'Figma Inc.', status: '인가', dataGrade: '일반', owner: '디자인팀', decidedAt: '2026-03-11', decidedBy: '시스템관리자' },
    { id: 'CAT-03', service: 'ChatGPT', category: 'AI', vendor: 'OpenAI', status: '검토중', dataGrade: '기밀', owner: '전사' },
    { id: 'CAT-04', service: 'Miro', category: '협업', vendor: 'Miro', status: '검토중', dataGrade: '일반', owner: '플랫폼개발팀' },
    { id: 'CAT-05', service: 'Dropbox', category: '스토리지', vendor: 'Dropbox', status: '차단', dataGrade: '기밀', owner: '영업1팀', decidedAt: '2026-07-18', decidedBy: '윤보안' },
    { id: 'CAT-06', service: 'GitHub', category: '개발', vendor: 'GitHub', status: '인가', dataGrade: '민감', owner: '개발본부', decidedAt: '2025-11-02', decidedBy: '시스템관리자' },
  ]
}

function seedUsers(): UserAccount[] {
  return [
    { login: 'mj.kim', name: '김민준', dept: '플랫폼개발팀', role: 'USER', group: '일반 사용자', lastLogin: '2026-07-29 08:58', mfa: false },
    { login: 'js.park', name: '박자산', dept: '자산관리팀', role: 'ASSET_MGR', group: '자산 운영', lastLogin: '2026-07-29 09:42', mfa: true },
    { login: 'ba.yoon', name: '윤보안', dept: '보안운영팀', role: 'SEC_MGR', group: '보안 운영', lastLogin: '2026-07-29 09:31', mfa: true },
    { login: 'admin', name: '시스템관리자', dept: 'IT기획팀', role: 'ADMIN', group: '시스템 관리', lastLogin: '2026-07-29 08:00', mfa: true },
    { login: 'jw.choi', name: '최지원', dept: '자산관리팀', role: 'ASSET_MGR', group: '자산 운영', lastLogin: '2026-07-28 17:22', mfa: true },
    { login: 'sh.oh', name: '오세훈', dept: '인사팀', role: 'USER', group: '일반 사용자', lastLogin: '2026-07-27 14:05', mfa: false },
  ]
}

function seedApprovalLines(): ApprovalLine[] {
  return [
    { id: 'AL-01', screen: '자산 대장 · 신청', kind: '자산 신청', steps: ['신청자', '부서장', '자산담당'], required: false },
    { id: 'AL-02', screen: '수명주기 · 반납', kind: '반납', steps: ['신청자', '자산담당'], required: false },
    { id: 'AL-03', screen: '수명주기 · 이동', kind: '이동', steps: ['신청자', '자산담당'], required: false },
    { id: 'AL-04', screen: '수명주기 · 폐기', kind: '폐기', steps: ['자산담당', 'IT기획팀장'], required: true },
    { id: 'AL-05', screen: 'Discovery · 편입', kind: '소유자 확인', steps: ['Discovery 엔진', '부서장', '자산담당'], required: true },
    { id: 'AL-06', screen: 'Discovery · 격리', kind: '격리 요청', steps: ['보안담당', 'IT기획팀장'], required: true },
    { id: 'AL-07', screen: '재물조사 · 차이 조정', kind: '차이 조정', steps: ['자산담당', 'IT기획팀장'], required: true },
    { id: 'AL-08', screen: 'Shadow SaaS · 인가 요청', kind: 'SaaS 인가', steps: ['신청자', '보안담당'], required: false },
  ]
}

function seed(): Store {
  return {
    assets: seedAssets(),
    discovered: seedDiscovered(),
    external: seedExternal(),
    leaks: seedLeaks(),
    integrations: seedIntegrations(),
    auditLogs: seedAuditLogs(),
    codeGroups: seedCodeGroups(),
    scanPolicies: seedScanPolicies(),
    saasCatalog: seedSaasCatalog(),
    aiPolicy: {
      deployment: '온프레미스 LLM',
      modelId: 'claude-opus-5',
      promptVersion: 'v3.2 (2026-07-19)',
      classifyAccuracy: 92.4,
      auditRetentionDays: 365,
      scopeFilter: true,
      autoApprove: false,
      feedbackLearning: true,
    },
    users: seedUsers(),
    approvalLines: seedApprovalLines(),
    reports: [],
    // 최근 스캔 이력 (누적 312건 중 최근 분) — 실사 위치가 대장과 다르면 차이로 기록된다
    surveyScans: [
      { id: 'SCN-0312', roundId: 'INV-2026-H2', code: 'AST-2023-000112', assetNo: 'AST-2023-000112', scannedAt: '2026-07-28 16:41', location: '본사 8F', by: '박자산', result: '일치' },
      { id: 'SCN-0311', roundId: 'INV-2026-H2', code: 'AST-2025-000512', assetNo: 'AST-2025-000512', scannedAt: '2026-07-28 16:38', location: '판교 사무소', by: '박자산', result: '차이' },
      { id: 'SCN-0310', roundId: 'INV-2026-H2', code: 'AST-2023-000113', assetNo: 'AST-2023-000113', scannedAt: '2026-07-28 16:35', location: '본사 8F', by: '박자산', result: '일치' },
      { id: 'SCN-0309', roundId: 'INV-2026-H2', code: 'UNKNOWN-77213', scannedAt: '2026-07-28 16:30', location: '본사 3F 자산창고', by: '박자산', result: '대장 미등록' },
      { id: 'SCN-0308', roundId: 'INV-2026-H2', code: 'AST-2022-000871', assetNo: 'AST-2022-000871', scannedAt: '2026-07-28 16:22', location: '본사 8F', by: '박자산', result: '일치' },
    ],
    intakeLots: [
      {
        id: 'IN-2607-01', contractId: 'CT-2026-009', model: 'ThinkPad X1 Carbon G12', category: '단말',
        qty: 40, arrivedAt: '2026-07-21', vendor: '(주)한빛INT', status: '검수 중', inspector: '박자산',
        checklist: [
          { item: '외관 손상·스크래치 확인', checked: true },
          { item: '발주 사양 일치 (CPU·메모리·SSD)', checked: true },
          { item: '전원·부팅 정상 동작', checked: true },
          { item: '부속품 구성 (어댑터·케이블·매뉴얼)', checked: false },
          { item: 'OS·보안 SW 설치 상태', checked: false },
          { item: '자산 라벨 부착 위치 확인', checked: false },
        ],
        issued: ['AST-2025-000033'],
      },
      {
        id: 'IN-2607-02', contractId: 'CT-2023-021', model: 'PowerEdge R760', category: '서버',
        qty: 2, arrivedAt: '2026-07-27', vendor: '델테크놀로지스', status: '입고 대기',
        checklist: [
          { item: '외관 손상·랙 마운트 부속 확인', checked: false },
          { item: '발주 사양 일치 (CPU·메모리·디스크)', checked: false },
          { item: '전원 이중화·팬 정상 동작', checked: false },
          { item: 'iDRAC·펌웨어 버전 확인', checked: false },
          { item: 'OS·보안 SW 설치 상태', checked: false },
          { item: '자산 라벨 부착 위치 확인', checked: false },
        ],
        issued: [],
      },
      {
        // 도입 예정 — ITSM SR·발주로 사전 등록된, 아직 도착 전 자산 (제품안내서 §06 ITSM·구매 연동)
        id: 'IN-2607-03', contractId: 'CT-2026-009', model: 'ThinkPad X1 Carbon G12', category: '단말',
        qty: 15, arrivedAt: '', vendor: '(주)한빛INT', status: '도입 예정', srNo: 'SR-2607-041', expectedDate: '2026-08-14',
        checklist: [], issued: [],
      },
    ],
    disposals: [
      { id: 'DSP-01', assetNo: 'AST-2019-000218', model: 'Dell Latitude 5400', reason: '사용 연한 초과 (7년) · 보증 만료', status: '결재 대기', approvalId: 'APR-2607-119' },
      { id: 'DSP-02', assetNo: 'AST-2021-000432', model: 'LG gram 17', reason: '보증 만료 · 성능 저하', status: '대상 선정' },
      // 폐기 완료 — 데이터 소거·증적 보존 완료. 소거 확인서 다운로드 대상.
      { id: 'DSP-00', assetNo: 'AST-2018-000090', model: 'Dell Latitude 5290', reason: '사용 연한 초과 (8년) · 보증 만료', status: '완료', approvalId: 'APR-2606-088', wipeMethod: '디가우징', wipedAt: '2026-07-22', wipedBy: '박자산', certNo: 'WIPE-20260722-050', evidence: '소거 확인서 WIPE-20260722-050',
        photos: [
          { id: 'PHO-0001', label: '처리 전', note: '디가우징 전 자산 라벨·시리얼 근접 촬영', addedAt: '2026-07-22', addedBy: '박자산' },
          { id: 'PHO-0002', label: '처리 후', note: '디가우징 완료 후 저장매체 상태', addedAt: '2026-07-22', addedBy: '박자산' },
        ] },
    ],
    surveyDiffs: [
      { id: 'DIF-01', roundId: 'INV-2026-H2', kind: '위치 불일치', assetNo: 'AST-2025-000512', model: 'Galaxy Book4 Pro', expected: '본사 8F', actual: '판교 사무소', status: '미조치' },
      { id: 'DIF-02', roundId: 'INV-2026-H2', kind: '대장 미등록', assetNo: 'UNKNOWN-77213', model: '미상 (라벨만 확인)', expected: '-', actual: '본사 3F 자산창고', status: '미조치' },
      { id: 'DIF-03', roundId: 'INV-2026-H2', kind: '미확인 (실사 없음)', assetNo: 'AST-2019-000218', model: 'Dell Latitude 5400', expected: '본사 3F 자산창고', actual: '실사 미확인', status: '미조치' },
      { id: 'DIF-04', roundId: 'INV-2026-H2', kind: '상태 불일치', assetNo: 'AST-2021-000432', model: 'LG gram 17', expected: '유휴 (창고 보관)', actual: '사용 중 — 미승인 불출 추정', status: '미조치' },
    ],
    contracts: [
      { id: 'CT-2023-014', kind: '구매', name: '2023 개발용 노트북 60대', vendor: '(주)한빛INT', start: '2023-03-01', end: '2026-03-14', amount: 132_000_000, assetCount: 60, ownerDept: '자산관리팀',
        documents: [
          { id: 'DOC-0001', name: '2023 노트북 구매계약서_체결본.pdf', docType: '계약서', addedAt: '2023-03-02', addedBy: '박자산' },
          { id: 'DOC-0002', name: '한빛INT 견적서_60대.pdf', docType: '견적서', addedAt: '2023-02-20', addedBy: '박자산' },
          { id: 'DOC-0003', name: '세금계산서_2023-03.pdf', docType: '세금계산서', addedAt: '2023-03-31', addedBy: '이경리' },
        ] },
      { id: 'CT-2023-021', kind: '구매', name: 'IDC-A 서버 증설 (R760 8식)', vendor: '델테크놀로지스', start: '2023-09-01', end: '2026-08-31', amount: 384_000_000, assetCount: 8, ownerDept: '인프라운영팀' },
      { id: 'CT-2022-007', kind: '유지보수', name: '네트워크 장비 통합 유지보수', vendor: '세종네트웍스', start: '2026-01-01', end: '2026-08-31', amount: 48_000_000, assetCount: 34, ownerDept: '네트워크팀',
        sla: '장애 접수 후 4시간 내 온사이트 대응, 월 가동률 99.9% 보장, 24×7 헬프데스크',
        costs: [
          { id: 'CST-0001', date: '2026-01-15', item: '정기 유지보수료 1Q', amount: 12_000_000, addedBy: '박자산' },
          { id: 'CST-0002', date: '2026-04-15', item: '정기 유지보수료 2Q', amount: 12_000_000, addedBy: '박자산' },
          { id: 'CST-0003', date: '2026-05-22', item: '긴급 출동 — 8F 스위치 SFP 교체', amount: 1_800_000, addedBy: '박자산' },
        ] },
      { id: 'CT-2023-002', kind: '구매', name: 'Microsoft 365 E3 800석', vendor: '한국MS 파트너', start: '2026-01-01', end: '2026-12-31', amount: 268_000_000, assetCount: 800, ownerDept: 'IT기획팀' },
      { id: 'CT-2026-009', kind: '구매', name: '2026 상반기 노트북 교체분', vendor: '(주)한빛INT', start: '2026-07-01', end: '2029-07-20', amount: 96_000_000, assetCount: 40, ownerDept: '자산관리팀' },
      { id: 'CT-2024-011', kind: '유지보수', name: '스토리지·백업 유지보수', vendor: '효성인포', start: '2025-09-01', end: '2026-08-20', amount: 36_000_000, assetCount: 6, ownerDept: '인프라운영팀' },
    ],
    licenses: [
      { id: 'LIC-001', name: 'Microsoft 365 E3', vendor: 'Microsoft', purchased: 800, used: 743, expiry: '2026-12-31', unitCost: 335_000 },
      { id: 'LIC-002', name: 'JetBrains All Products', vendor: 'JetBrains', purchased: 120, used: 131, expiry: '2026-05-31', unitCost: 289_000 },
      { id: 'LIC-003', name: 'Adobe Creative Cloud', vendor: 'Adobe', purchased: 40, used: 22, expiry: '2026-10-15', unitCost: 792_000 },
      { id: 'LIC-004', name: 'AutoCAD LT', vendor: 'Autodesk', purchased: 15, used: 6, expiry: '2027-02-28', unitCost: 610_000 },
      { id: 'LIC-005', name: 'Slack Business+', vendor: 'Salesforce', purchased: 500, used: 488, expiry: '2026-09-30', unitCost: 162_000 },
    ],
    approvals: [
      // 다단계 결재선 진행 중 — 부서장(ADMIN) 결재 대기. 승인하면 자산담당 단계로 넘어간다.
      { id: 'APR-2607-120', kind: '자산 신청', title: '개발 워크스테이션 신규 신청 (AI팀 증원 2명)', requester: '오세훈', dept: '인사팀', requestedAt: '2026-07-28', status: '대기', currentStep: '부서장 결재', note: 'AI팀 증원 2명 — GPU 워크스테이션 지급 요청', desiredCategory: '단말' },
      { id: 'APR-2607-121', kind: '자산 신청', title: '개발용 모니터 추가 신청 (듀얼 구성)', requester: '김민준', dept: '플랫폼개발팀', requestedAt: '2026-07-28', status: '대기', currentStep: '부서장 결재', note: '재택·사무 듀얼 모니터 구성 요청', desiredCategory: '주변기기' },
      // 불출 대기 시연 — 승인됐으나 미집행(재배치 우선 원칙: 희망 유형 단말에 맞는 유휴 재고 우선 추천)
      { id: 'APR-2607-116', kind: '자산 신청', title: '노트북 지급 신청 (경력 입사자)', requester: '오세훈', dept: '인사팀', requestedAt: '2026-07-22', status: '승인', currentStep: '완료', decidedAt: '2026-07-24', decidedBy: '박자산', note: '9월 경력 입사자 온보딩 단말', desiredCategory: '단말' },
      { id: 'APR-2607-096', kind: '자산 신청', title: '휴대용 모니터 신청 (재택 근무)', requester: '김민준', dept: '플랫폼개발팀', requestedAt: '2026-07-26', status: '반려', currentStep: '완료', decidedAt: '2026-07-27', decidedBy: '박자산', rejectReason: '재택 지원 품목은 부서 예산 승인 후 재신청 바랍니다.', note: '재택 근무용 휴대 모니터' },
      // 반려 사유가 남은 건 — 신청자 재상신 근거이자 감사 기록
      { id: 'APR-2607-095', kind: '자산 신청', title: '개인용 태블릿 신규 신청', requester: '오세훈', dept: '인사팀', requestedAt: '2026-07-19', status: '반려', currentStep: '완료', decidedAt: '2026-07-21', decidedBy: '박자산', note: '외근 시 개인 용도', rejectReason: '개인 용도로 판단 — 업무 필요성 소명 후 재상신 요망' },
      { id: 'APR-2607-118', kind: '자산 신청', title: '노트북 신규 신청 (신입 온보딩 3명)', requester: '오세훈', dept: '인사팀', requestedAt: '2026-07-27', status: '대기', currentStep: '자산담당 검토', desiredCategory: '단말' },
      { id: 'APR-2607-117', kind: '반납', title: 'AST-2025-000513 Galaxy Book4 Pro 반납', requester: '한도윤', dept: '영업1팀', requestedAt: '2026-07-18', status: '대기', currentStep: '자산담당 검토', refId: 'AST-2025-000513' },
      { id: 'APR-2607-114', kind: '소유자 확인', title: 'DSC-2607-0041 (ip-10-20-31-88) 소유자 확인', requester: 'Discovery 엔진', dept: '플랫폼개발팀', requestedAt: '2026-07-25', status: '대기', currentStep: '부서장 확인', refId: 'DSC-2607-0041' },
      { id: 'APR-2607-109', kind: '소유자 확인', title: 'DSC-2607-0038 (ESP-9F31A2) 소유자 확인 — 전사 공지', requester: 'Discovery 엔진', dept: '미지정', requestedAt: '2026-07-20', status: '대기', currentStep: '부서장 확인', refId: 'DSC-2607-0038', note: '소유자 미상 IoT — 기한 내 무응답 시 격리 검토' },
      { id: 'APR-2607-112', kind: '격리 요청', title: 'DSC-2607-0031 (개인 구독 Azure VM) NAC 격리', requester: '윤보안', dept: '보안운영팀', requestedAt: '2026-07-24', status: '대기', currentStep: '보안담당 승인', refId: 'DSC-2607-0031' },
      { id: 'APR-2607-119', kind: '폐기', title: 'AST-2019-000218 외 11대 노후 단말 일괄 폐기', requester: '박자산', dept: '자산관리팀', requestedAt: '2026-07-21', status: '대기', currentStep: 'IT기획팀장 결재', refId: 'AST-2019-000218' },
      // 승인은 났으나 아직 집행되지 않은 이동 — 불출·이동 처리 화면의 대기열에 잡힌다.
      // targetLocation 은 공통코드 LOCATION 의 값이어야 대장에 그대로 반영할 수 있다.
      { id: 'APR-2607-101', kind: '이동', title: 'AST-2023-000112 좌석 이동 (본사 8F → 본사 9F)', requester: '김민준', dept: '플랫폼개발팀', requestedAt: '2026-07-15', status: '승인', currentStep: '완료', refId: 'AST-2023-000112', decidedAt: '2026-07-16', decidedBy: '박자산', targetLocation: '본사 9F', note: '팀 좌석 재배치' },
      { id: 'APR-2606-092', kind: '차이 조정', title: '2026 상반기 재물조사 차이 4건 조정', requester: '박자산', dept: '자산관리팀', requestedAt: '2026-06-30', status: '승인', currentStep: '완료', decidedAt: '2026-07-02', decidedBy: '이기획' },
      { id: 'APR-2607-125', kind: 'SaaS 인가', title: 'SaaS 인가 요청 — Linear', requester: '오세훈', dept: '인사팀', requestedAt: '2026-07-28', status: '대기', currentStep: '보안담당 결재', saasService: 'Linear', note: '이슈 트래킹 협업 — 인가 카탈로그 사전 등재 요청' },
    ],
    saas: [
      { id: 'SAS-01', service: 'Notion', category: '협업', dept: '마케팅팀', users: 28, sanctioned: false, monthlyVisits: 8_412, risk: '중간' },
      { id: 'SAS-02', service: 'Figma', category: '디자인', dept: '디자인팀', users: 14, sanctioned: true, monthlyVisits: 12_030, risk: '낮음' },
      { id: 'SAS-03', service: 'ChatGPT', category: 'AI', dept: '전사', users: 212, sanctioned: false, monthlyVisits: 45_770, risk: '높음' },
      { id: 'SAS-04', service: 'Miro', category: '협업', dept: '플랫폼개발팀', users: 9, sanctioned: false, monthlyVisits: 1_204, risk: '낮음' },
      { id: 'SAS-05', service: 'Dropbox', category: '스토리지', dept: '영업1팀', users: 6, sanctioned: false, monthlyVisits: 3_318, risk: '높음' },
      { id: 'SAS-06', service: 'GitHub', category: '개발', dept: '개발본부', users: 180, sanctioned: true, monthlyVisits: 88_400, risk: '낮음' },
    ],
    insights: [
      { id: 'INS-2607-21', kind: '이상탐지', severity: '높음', title: '휴면 자산의 갑작스런 외부 통신 — printer-3f-old', detail: '40일간 무통신이던 장비가 07-27 22:14 외부 IP(불가리아)로 아웃바운드 시도. 평시 프로파일 이탈.', evidence: '프록시 로그 07-27 22:14~22:31 · 47건', createdAt: '2026-07-28', status: '제안' },
      { id: 'INS-2607-19', kind: '취약점 우선순위', severity: '높음', title: 'EOL OS 서버 1대 — CVE-2024-6387 노출', detail: 'AST-2020-000883 (CentOS 7.9, EOL) 이 외부 연동 세그먼트에 위치. 자산 중요도 상·노출도 상 → 조치 1순위.', evidence: '취약점 스캐너 연계 · CVSS 8.1', createdAt: '2026-07-26', status: '제안', refId: 'AST-2020-000883' },
      { id: 'INS-2607-15', kind: '라이선스 최적화', severity: '중간', title: 'JetBrains 11석 초과 사용 — 감사 리스크', detail: '보유 120석 대비 사용 131석. EDR SW 인벤토리 기준. 추가 구매 품의 또는 미사용자 회수 필요.', evidence: 'SW 인벤토리 대사 07-25', createdAt: '2026-07-25', status: '제안', refId: 'LIC-002' },
      { id: 'INS-2607-12', kind: '라이선스 최적화', severity: '낮음', title: 'Adobe CC 18석 장기 미사용 — 연 1,425만원 절감 가능', detail: '90일 이상 미실행 18석 회수 후보. 갱신 협상 근거 데이터 첨부.', evidence: '사용 패턴 분석 · 90일 윈도우', createdAt: '2026-07-24', status: '제안', refId: 'LIC-003' },
      { id: 'INS-2607-08', kind: '수명예측', severity: '중간', title: '2027 1분기 단말 교체 수요 64대 예측', detail: '장애 이력·사용 연한·성능 데이터 기반 생존 분석. 예산 추정 1.6억. 연간 교체 계획 리포트 생성 가능.', evidence: '회귀 모델 v3 · 신뢰구간 90%', createdAt: '2026-07-20', status: '제안' },
      { id: 'INS-2607-05', kind: '자동분류', severity: '낮음', title: '발견 자산 9건 자동분류 완료 — 확인 대기', detail: '스캔 배너·설치 SW 문자열을 표준 유형·제조사·모델로 매핑. 신뢰도 0.92 이상 9건.', evidence: 'LLM 분류 · 규칙 하이브리드', createdAt: '2026-07-19', status: '승인', decidedAt: '2026-07-19', decidedBy: '박자산', action: '분류 결과 대장 반영 — 9건' },
    ],
    inventoryRounds: [
      { id: 'INV-2026-H2', name: '2026 하반기 정기 재물조사', kind: '연간', scope: '본사 전층 + IDC-A', planned: 1_240, scanned: 312, mismatched: 4, dueDate: '2026-08-29', assignee: '박자산', status: '진행중' },
      { id: 'INV-2026-H1', name: '2026 상반기 정기 재물조사', kind: '연간', scope: '전사', planned: 1_198, scanned: 1_198, mismatched: 14, dueDate: '2026-02-27', assignee: '박자산', status: '완료' },
      { id: 'INV-2026-SP1', name: '판교 사무소 수시 조사', kind: '수시', scope: '판교 사무소', planned: 86, scanned: 0, mismatched: 0, dueDate: '2026-08-08', assignee: '최지원', status: '계획' },
    ],
    observations: seedObservations(),
    scanRuns: seedScanRuns(),
    menuDefs: seedMenuDefs(),
    menuPermissions: seedMenuPermissions(),
    reportSchedules: seedReportSchedules(),
    easmTargets: seedEasmTargets(),
    easmRuns: seedEasmRuns(),
    unseenExternal: seedUnseenExternal(),
    undiscovered: seedUndiscovered(),
    dispatches: [
      { id: 'MSG-4001', at: `${today()} 09:12`, channel: '이메일', to: '플랫폼개발팀 (부서장)', subject: 'DSC-2607-0041 소유자 확인 요청', kind: '소유자 확인', ref: 'APR-2607-114' },
      { id: 'MSG-4000', at: '2026-07-20 10:05', channel: '이메일', to: '전사 공지', subject: 'DSC-2607-0038 소유자 확인 요청', kind: '소유자 확인', ref: 'APR-2607-109' },
      { id: 'MSG-4002', at: `${today()} 08:30`, channel: '이메일', to: '자산관리팀', subject: 'CT-2023-014 유지보수 계약 만료 임박 (D-21)', kind: '만료 임박', ref: 'CT-2023-014' },
      { id: 'MSG-4003', at: `${today()} 08:30`, channel: '문자', to: '박자산', subject: 'JetBrains 라이선스 만료 임박 안내', kind: '만료 임박', ref: 'LIC-002' },
    ],
    posts: [
      {
        id: 'NTC-01', kind: '공지', pinned: true, views: 412,
        title: '[필독] 2026 하반기 재물조사 — 8/29까지 부서별 협조 요청',
        body: '2026 하반기 정기 재물조사를 8월 29일까지 진행합니다. 조사 담당자가 부서를 방문해 자산 라벨의 바코드/QR을 스캔합니다.\n\n' +
          '· 대상: 본사 전층 + IDC-A (총 1,240대)\n· 협조 사항: 방문 시 보유 단말·주변기기를 책상 위에 비치해 주세요.\n' +
          '· 미확인 자산은 유휴·분실 후보로 분류되어 차이 조정 결재 대상이 됩니다.\n· 라벨이 훼손된 자산은 자산관리팀으로 재발행을 요청해 주세요.',
        author: '박자산', dept: '자산관리팀', createdAt: '2026-07-21',
      },
      {
        id: 'NTC-02', kind: '공지', views: 287,
        title: '미인가 SaaS(스토리지류) 차단 정책 8/1 시행 안내',
        body: '8월 1일부터 미인가 클라우드 스토리지 서비스에 대한 프록시 차단 정책이 시행됩니다.\n\n' +
          '· 업무상 필요한 서비스는 SaaS 카탈로그 인가 요청을 통해 사전 등재해 주세요.\n' +
          '· 기밀 등급 데이터를 취급하는 서비스는 데이터 반출 범위 확인 후 판정됩니다.\n· 문의: 보안운영팀',
        author: '윤보안', dept: '보안운영팀', createdAt: '2026-07-18',
      },
      {
        id: 'NTC-03', kind: '공지', views: 156,
        title: '노후 단말 일괄 교체 신청 접수 (영업조직 대상)',
        body: '보증 만료 3년 경과 단말을 대상으로 일괄 교체를 진행합니다. 대상자는 워크플로 › 신청·결재에서 자산 신청을 상신해 주세요.\n\n' +
          '· 접수 기한: 8월 15일\n· 교체 모델: 2026 상반기 계약분 (CT-2026-009)\n· 기존 단말은 반납 후 데이터 소거를 거쳐 폐기됩니다.',
        author: '박자산', dept: '자산관리팀', createdAt: '2026-07-10',
      },
      {
        id: 'QNA-04', kind: 'QnA', views: 23, category: '자산 신청·반납',
        title: '퇴사자 단말 반납은 어느 시점에 처리하나요?',
        body: '팀원이 다음 주 퇴사 예정인데 노트북 반납 처리를 언제, 어떻게 진행해야 하는지 문의드립니다.',
        author: '오세훈', dept: '인사팀', createdAt: '2026-07-27',
        answer: {
          body: '퇴사일 전일까지 워크플로 › 신청·결재에서 반납 상신을 부탁드립니다. 자산담당이 상태 점검 후 승인하면 대장에서 유휴로 전환되어 재배치 대상이 됩니다. 데이터가 남아 있는 경우 소거 후 유휴 편성됩니다.',
          by: '박자산', at: '2026-07-27',
        },
      },
      {
        id: 'QNA-03', kind: 'QnA', views: 41, category: '라이선스',
        title: 'JetBrains 라이선스 추가 발급이 가능한가요?',
        body: '신규 입사자 2명에게 JetBrains 라이선스가 필요한데 발급 요청 절차가 궁금합니다.',
        author: '김민준', dept: '플랫폼개발팀', createdAt: '2026-07-26',
        answer: {
          body: '현재 JetBrains는 보유 120석 대비 사용 131석으로 이미 초과 사용 상태라 즉시 발급이 어렵습니다. 추가 구매 품의를 진행 중이며, 그 전까지는 장기 미사용자 회수분으로 우선 배정할 예정입니다. 급한 경우 자산관리팀으로 개별 문의 주세요.',
          by: '박자산', at: '2026-07-26',
        },
      },
      {
        id: 'QNA-02', kind: 'QnA', views: 12, category: '보안·Discovery',
        title: '부서에서 쓰던 NAS가 미등록 자산으로 잡혔습니다',
        body: '개발팀에서 테스트용으로 쓰던 NAS가 Discovery에서 미등록으로 표시되었다고 연락받았습니다. 어떻게 처리하면 되나요?',
        author: '이서연', dept: '플랫폼개발팀', createdAt: '2026-07-24',
      },
      {
        id: 'QNA-01', kind: 'QnA', views: 8, category: '장애·수리',
        title: '모니터 불량 교체는 어디로 신청하나요?',
        body: '지급받은 모니터에 화면 잔상이 있습니다. 보증 기간 내인 것 같은데 교체 절차를 알려주세요.',
        author: '최지우', dept: '영업1팀', createdAt: '2026-07-22',
      },
    ],
    seq: 200,
  }
}

const g = globalThis as unknown as { __itamStore?: Store; __itamSaveTimer?: ReturnType<typeof setInterval> }

// ── 파일 기반 영속화 ──────────────────────────────────────────────────
// ITAM_DATA_FILE 이 있을 때만 활성. 스키마가 바뀌면 낡은 파일을 버리고 시드로 시작한다(마이그레이션 없음).
const DATA_FILE = process.env.ITAM_DATA_FILE || ''
const SCHEMA_VERSION = 18

function loadStore(): Store | null {
  if (!DATA_FILE || !existsSync(DATA_FILE)) return null
  try {
    const parsed = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
    if (parsed.__v !== SCHEMA_VERSION) return null
    const { __v: _v, ...store } = parsed
    // 최소 정합성 검사 — 깨진 파일이면 시드로 폴백
    if (!Array.isArray(store.assets) || !Array.isArray(store.approvals) || typeof store.seq !== 'number') return null
    return store as Store
  } catch {
    return null
  }
}

let lastSaved = ''
function saveStore(): void {
  if (!DATA_FILE || !g.__itamStore) return
  try {
    const json = JSON.stringify({ __v: SCHEMA_VERSION, ...g.__itamStore })
    if (json === lastSaved) return // 변경 없으면 쓰지 않는다
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    const tmp = `${DATA_FILE}.tmp`
    writeFileSync(tmp, json) // 원자적 쓰기 — 임시 파일 → rename
    renameSync(tmp, DATA_FILE)
    lastSaved = json
  } catch {
    // 저장 실패해도 인메모리로 계속 동작한다 (영속화는 부가 기능)
  }
}

function startAutosave(): void {
  if (!DATA_FILE || g.__itamSaveTimer) return
  // 2초 주기 dirty-비교 저장. SIGKILL(예: docker rm -f)로 죽어도 최대 2초분만 유실된다.
  const timer = setInterval(saveStore, 2000)
  ;(timer as { unref?: () => void }).unref?.() // 인터벌이 프로세스 종료를 막지 않게
  g.__itamSaveTimer = timer
  // 정상 종료(SIGTERM·SIGINT) 시 마지막 상태를 동기 저장
  process.once('SIGTERM', saveStore)
  process.once('SIGINT', saveStore)
  process.once('beforeExit', saveStore)
}

export function getStore(): Store {
  if (!g.__itamStore) {
    g.__itamStore = loadStore() ?? seed()
    startAutosave()
  }
  return g.__itamStore
}

export function nextId(prefix: string): string {
  const s = getStore()
  s.seq += 1
  return `${prefix}-${s.seq}`
}

/** 다음 자산번호 — 올해 채번분 번호의 **최댓값+1**을 6자리로 채운다(AST-YYYY-NNNNNN).
 *  자산번호는 대장 기본키라 중복이 치명적인데, 기존 3경로(입고 채번·CSV 일괄·발견 편입)가
 *  count(개수) 기반이라 시드(AST-2026-000108)·상호간 충돌·번호 건너뜀이 있었다. max 기반 단일 채번으로
 *  충돌·포맷 불일치를 원천 차단한다. 호출 후 push 하면 다음 호출이 새 max 를 본다(순차 채번 안전). */
export function nextAssetNo(): string {
  const s = getStore()
  const year = today().slice(0, 4)
  const re = new RegExp(`^AST-${year}-(\\d+)$`)
  const max = s.assets.reduce((m, a) => {
    const mt = a.assetNo.match(re)
    return mt ? Math.max(m, parseInt(mt[1], 10)) : m
  }, 0)
  return `AST-${year}-${String(max + 1).padStart(6, '0')}`
}

/** 계약에 연계된 대장 자산 수 — 실측 파생값. Contract.assetCount 는 등록 시 0 으로 시작하고 이후
 *  갱신되지 않아 대장 실체와 어긋난다(시드도 계약 수량으로 박혀 있어 드릴다운 결과와 불일치). 표·카드·엑셀이
 *  모두 이 함수를 써서 '표시 수 = 드릴다운(?q=) 결과' 불변식을 지킨다. */
export function contractAssetCount(contractId: string): number {
  return getStore().assets.filter((a) => a.contractId === contractId).length
}

/** 결재 문서번호 — 접두사에 연·월(YYMM)이 들어가므로 기준일에서 파생시킨다.
 *  상수로 박아두면 달이 바뀐 뒤 생성한 문서에 지난 달 번호가 찍힌다. */
export function nextApprovalId(): string {
  return nextId(`APR-${today().slice(2, 4)}${today().slice(5, 7)}`)
}
