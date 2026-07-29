/** 인메모리 데이터 스토어 — 데모용. globalThis 싱글턴으로 HMR·서버액션 간 상태 유지.
 *  실서비스에서는 자산 대장 RDB(CMDB) + 발견 저장소 분리 구조로 대체된다(제품안내서 §02). */
import type {
  AiInsight, AiPolicy, Approval, ApprovalLine, Asset, AuditLog, CodeGroup, CodeValue, Contract,
  DiscoveredAsset, ExternalAsset, Integration, InventoryRound, LeakFinding, Notice,
  SaasCatalogEntry, SaasUsage, ScanPolicy, SwLicense, UserAccount,
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
  contracts: Contract[]
  licenses: SwLicense[]
  approvals: Approval[]
  saas: SaasUsage[]
  insights: AiInsight[]
  inventoryRounds: InventoryRound[]
  notices: Notice[]
  seq: number
}

function seedAssets(): Asset[] {
  const mk = (a: Partial<Asset> & Pick<Asset, 'assetNo' | 'category' | 'model' | 'status' | 'owner' | 'dept'>): Asset => ({
    serial: `SN-${a.assetNo.slice(-6)}`,
    location: '본사 8F',
    purchaseDate: '2023-03-15',
    warrantyEnd: '2026-03-14',
    history: [{ date: a.purchaseDate ?? '2023-03-15', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' }],
    ...a,
  })
  return [
    mk({ assetNo: 'AST-2023-000112', category: '단말', model: 'ThinkPad T14 Gen4', status: '사용중', owner: '김민준', dept: '플랫폼개발팀', os: 'Windows 11 Pro', cpu: 'i7-1355U', memory: '32GB', ip: '10.20.31.45', mac: 'A4:BB:6D:11:22:33', contractId: 'CT-2023-014',
      history: [
        { date: '2023-03-15', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2023-03-20', kind: '불출', detail: '플랫폼개발팀 김민준 불출', actor: '박자산' },
        { date: '2024-11-02', kind: '구성변경', detail: '메모리 16GB → 32GB 증설', actor: '박자산' },
      ] }),
    mk({ assetNo: 'AST-2023-000113', category: '단말', model: 'ThinkPad T14 Gen4', status: '사용중', owner: '이서연', dept: '플랫폼개발팀', os: 'Windows 11 Pro', cpu: 'i7-1355U', memory: '16GB', ip: '10.20.31.46', mac: 'A4:BB:6D:11:22:34', contractId: 'CT-2023-014' }),
    mk({ assetNo: 'AST-2022-000871', category: '단말', model: 'MacBook Pro 14 M2', status: '사용중', owner: '정하윤', dept: '디자인팀', os: 'macOS 14', cpu: 'M2 Pro', memory: '32GB', ip: '10.20.44.12', mac: 'F0:2F:4B:9A:31:07', purchaseDate: '2022-08-01', warrantyEnd: '2025-07-31' }),
    mk({ assetNo: 'AST-2021-000432', category: '단말', model: 'LG gram 17', status: '유휴', owner: '-', dept: '자산관리팀', location: '본사 3F 자산창고', os: 'Windows 10 Pro', purchaseDate: '2021-05-10', warrantyEnd: '2024-05-09',
      history: [
        { date: '2021-05-10', kind: '등록', detail: '구매 검수 후 대장 등록', actor: '박자산' },
        { date: '2025-06-11', kind: '반납', detail: '퇴사자 반납 접수 · 상태 점검 완료', actor: '박자산' },
      ] }),
    mk({ assetNo: 'AST-2019-000218', category: '단말', model: 'Dell Latitude 5400', status: '폐기예정', owner: '-', dept: '자산관리팀', location: '본사 3F 자산창고', os: 'Windows 10 Pro', purchaseDate: '2019-04-22', warrantyEnd: '2022-04-21' }),
    mk({ assetNo: 'AST-2023-000561', category: '서버', model: 'PowerEdge R760', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-A Rack 12', os: 'RHEL 9.3', cpu: 'Xeon Gold 6430 ×2', memory: '512GB', ip: '10.10.8.21', mac: 'B8:CA:3A:55:01:11', contractId: 'CT-2023-021' }),
    mk({ assetNo: 'AST-2023-000562', category: '서버', model: 'PowerEdge R760', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-A Rack 12', os: 'RHEL 9.3', cpu: 'Xeon Gold 6430 ×2', memory: '512GB', ip: '10.10.8.22', mac: 'B8:CA:3A:55:01:12', contractId: 'CT-2023-021' }),
    mk({ assetNo: 'AST-2020-000883', category: '서버', model: 'HPE DL380 Gen10', status: '사용중', owner: '인프라운영팀', dept: '인프라운영팀', location: 'IDC-B Rack 3', os: 'CentOS 7.9', cpu: 'Xeon Silver 4210', memory: '128GB', ip: '10.10.9.14', mac: 'D0:67:E5:21:44:90', purchaseDate: '2020-02-14', warrantyEnd: '2025-02-13' }),
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
  ]
}

function seedDiscovered(): DiscoveredAsset[] {
  return [
    { id: 'DSC-2607-0041', hostname: 'ip-10-20-31-88', ip: '10.20.31.88', mac: '00:1A:2B:77:F0:12', channel: '네트워크 능동 스캔', type: '단말 (Windows)', firstSeen: '2026-07-24', lastSeen: '2026-07-28', state: '미등록', risk: '높음', ownerCandidate: '플랫폼개발팀 추정 (스위치 포트 기준)', note: 'SMB·RDP 오픈, OS 핑거프린트 Windows 10' },
    { id: 'DSC-2607-0042', hostname: 'nas-dev-team', ip: '10.20.31.90', mac: '28:C6:8E:31:44:AA', channel: '패시브 트래픽', type: 'NAS', firstSeen: '2026-07-22', lastSeen: '2026-07-28', state: '미등록', risk: '높음', ownerCandidate: '플랫폼개발팀', note: 'DHCP 리스·ARP 관측, SMB 트래픽 다량' },
    { id: 'DSC-2607-0038', hostname: 'ESP-9F31A2', ip: '10.20.60.41', mac: '84:F3:EB:9F:31:A2', channel: '패시브 트래픽', type: 'IoT 장비', firstSeen: '2026-07-19', lastSeen: '2026-07-27', state: '미등록', risk: '중간', note: 'ESP32 계열 — 사내망 IoT, 외부 MQTT 접속 시도' },
    { id: 'DSC-2607-0035', hostname: 'i-0f3a91c2d8', ip: '10.30.2.91', mac: '-', channel: '클라우드 API', type: 'AWS EC2 (t3.large)', firstSeen: '2026-07-15', lastSeen: '2026-07-28', state: '미등록', risk: '중간', ownerCandidate: '데이터플랫폼팀 (계정 태그)', note: '태그 미부착 인스턴스 · 개발 VPC' },
    { id: 'DSC-2607-0029', hostname: 'DESKTOP-KJM45', ip: '10.20.52.77', mac: '5C:60:BA:12:88:31', channel: 'EDR·엔드포인트', type: '단말 (Windows)', firstSeen: '2026-07-10', lastSeen: '2026-07-28', state: '등록·불일치', risk: '중간', matchedAssetNo: 'AST-2025-000512', mismatch: '위치 상이 — 대장 본사 8F / 실측 판교 사무소', note: 'EDR 콘솔 위치 정보와 대장 불일치' },
    { id: 'DSC-2607-0027', hostname: 'was-prod-03', ip: '10.10.20.33', mac: '-', channel: '네트워크 능동 스캔', type: '가상자원 (VM)', firstSeen: '2026-07-08', lastSeen: '2026-07-28', state: '등록·일치', risk: '낮음', matchedAssetNo: 'AST-2024-000618' },
    { id: 'DSC-2606-0102', hostname: 'printer-3f-old', ip: '10.20.35.60', mac: '00:80:92:44:1C:55', channel: '네트워크 능동 스캔', type: '주변기기 (프린터)', firstSeen: '2026-06-02', lastSeen: '2026-06-05', state: '미확인', risk: '낮음', note: '최근 40일 실측 없음 — 유휴·분실 후보, 재물조사 대상 편성' },
    { id: 'DSC-2607-0044', hostname: 'oauth-app:notion-sync', ip: '-', mac: '-', channel: 'AD/IdP·SSO 로그', type: 'OAuth 앱', firstSeen: '2026-07-26', lastSeen: '2026-07-28', state: '미등록', risk: '중간', ownerCandidate: '마케팅팀 (연동 계정 부서)', note: '미인가 OAuth 연동 — Drive 전체 읽기 권한 요청' },
    { id: 'DSC-2607-0031', hostname: 'ip-10-31-4-70', ip: '10.31.4.70', mac: '-', channel: '클라우드 API', type: 'Azure VM (B2s)', firstSeen: '2026-07-12', lastSeen: '2026-07-25', state: '미등록', risk: '낮음', ownerCandidate: '데이터플랫폼팀', note: '개인 구독으로 생성 — 조직 정책 위반 후보', action: '격리요청' },
    { id: 'DSC-2607-0018', hostname: 'ubnt-ap-guest', ip: '10.20.61.2', mac: '78:8A:20:0B:CC:41', channel: 'DNS·프록시 로그', type: '네트워크 (AP)', firstSeen: '2026-07-03', lastSeen: '2026-07-28', state: '등록·불일치', risk: '높음', matchedAssetNo: 'AST-2022-000640', mismatch: '구성 상이 — 대장에 없는 게스트 SSID 브로드캐스트', note: '방화벽 로그에 미인가 아웃바운드 도메인 다수' },
  ]
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
    { id: 'LOCATION', name: '위치', desc: '사업장·IDC 랙 단위 위치 코드', values: v(['HQ_8F', '본사 8F'], ['HQ_3F_WH', '본사 3F 자산창고'], ['IDC_A', 'IDC-A'], ['IDC_B', 'IDC-B'], ['PANGYO', '판교 사무소']) },
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
    contracts: [
      { id: 'CT-2023-014', kind: '구매', name: '2023 개발용 노트북 60대', vendor: '(주)한빛INT', start: '2023-03-01', end: '2026-03-14', amount: 132_000_000, assetCount: 60, ownerDept: '자산관리팀' },
      { id: 'CT-2023-021', kind: '구매', name: 'IDC-A 서버 증설 (R760 8식)', vendor: '델테크놀로지스', start: '2023-09-01', end: '2026-08-31', amount: 384_000_000, assetCount: 8, ownerDept: '인프라운영팀' },
      { id: 'CT-2022-007', kind: '유지보수', name: '네트워크 장비 통합 유지보수', vendor: '세종네트웍스', start: '2026-01-01', end: '2026-08-31', amount: 48_000_000, assetCount: 34, ownerDept: '네트워크팀' },
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
      { id: 'APR-2607-118', kind: '자산 신청', title: '노트북 신규 신청 (신입 온보딩 3명)', requester: '오세훈', dept: '인사팀', requestedAt: '2026-07-27', status: '대기', currentStep: '자산담당 검토' },
      { id: 'APR-2607-117', kind: '반납', title: 'AST-2025-000513 Galaxy Book4 Pro 반납', requester: '한도윤', dept: '영업1팀', requestedAt: '2026-07-18', status: '대기', currentStep: '자산담당 검토', refId: 'AST-2025-000513' },
      { id: 'APR-2607-114', kind: '소유자 확인', title: 'DSC-2607-0041 (ip-10-20-31-88) 소유자 확인', requester: 'Discovery 엔진', dept: '플랫폼개발팀', requestedAt: '2026-07-25', status: '대기', currentStep: '부서장 확인', refId: 'DSC-2607-0041' },
      { id: 'APR-2607-112', kind: '격리 요청', title: 'DSC-2607-0031 (개인 구독 Azure VM) NAC 격리', requester: '윤보안', dept: '보안운영팀', requestedAt: '2026-07-24', status: '대기', currentStep: '보안담당 승인', refId: 'DSC-2607-0031' },
      { id: 'APR-2607-109', kind: '폐기', title: 'AST-2019-000218 외 11대 노후 단말 일괄 폐기', requester: '박자산', dept: '자산관리팀', requestedAt: '2026-07-21', status: '대기', currentStep: 'IT기획팀장 결재', refId: 'AST-2019-000218' },
      { id: 'APR-2607-101', kind: '이동', title: 'AST-2023-000112 좌석 이동 (8F → 9F)', requester: '김민준', dept: '플랫폼개발팀', requestedAt: '2026-07-15', status: '승인', currentStep: '완료', refId: 'AST-2023-000112', decidedAt: '2026-07-16', decidedBy: '박자산' },
      { id: 'APR-2606-092', kind: '차이 조정', title: '2026 상반기 재물조사 차이 4건 조정', requester: '박자산', dept: '자산관리팀', requestedAt: '2026-06-30', status: '승인', currentStep: '완료', decidedAt: '2026-07-02', decidedBy: '이기획' },
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
      { id: 'INS-2607-19', kind: '취약점 우선순위', severity: '높음', title: 'EOL OS 서버 1대 — CVE-2024-6387 노출', detail: 'AST-2020-000883 (CentOS 7.9, EOL) 이 외부 연동 세그먼트에 위치. 자산 중요도 상·노출도 상 → 조치 1순위.', evidence: '취약점 스캐너 연계 · CVSS 8.1', createdAt: '2026-07-26', status: '제안' },
      { id: 'INS-2607-15', kind: '라이선스 최적화', severity: '중간', title: 'JetBrains 11석 초과 사용 — 감사 리스크', detail: '보유 120석 대비 사용 131석. EDR SW 인벤토리 기준. 추가 구매 품의 또는 미사용자 회수 필요.', evidence: 'SW 인벤토리 대사 07-25', createdAt: '2026-07-25', status: '제안' },
      { id: 'INS-2607-12', kind: '라이선스 최적화', severity: '낮음', title: 'Adobe CC 18석 장기 미사용 — 연 1,425만원 절감 가능', detail: '90일 이상 미실행 18석 회수 후보. 갱신 협상 근거 데이터 첨부.', evidence: '사용 패턴 분석 · 90일 윈도우', createdAt: '2026-07-24', status: '제안' },
      { id: 'INS-2607-08', kind: '수명예측', severity: '중간', title: '2027 1분기 단말 교체 수요 64대 예측', detail: '장애 이력·사용 연한·성능 데이터 기반 생존 분석. 예산 추정 1.6억. 연간 교체 계획 리포트 생성 가능.', evidence: '회귀 모델 v3 · 신뢰구간 90%', createdAt: '2026-07-20', status: '제안' },
      { id: 'INS-2607-05', kind: '자동분류', severity: '낮음', title: '발견 자산 9건 자동분류 완료 — 확인 대기', detail: '스캔 배너·설치 SW 문자열을 표준 유형·제조사·모델로 매핑. 신뢰도 0.92 이상 9건.', evidence: 'LLM 분류 · 규칙 하이브리드', createdAt: '2026-07-19', status: '승인' },
    ],
    inventoryRounds: [
      { id: 'INV-2026-H2', name: '2026 하반기 정기 재물조사', scope: '본사 전층 + IDC-A', planned: 1_240, scanned: 312, mismatched: 9, dueDate: '2026-08-29', assignee: '박자산', status: '진행중' },
      { id: 'INV-2026-H1', name: '2026 상반기 정기 재물조사', scope: '전사', planned: 1_198, scanned: 1_198, mismatched: 14, dueDate: '2026-02-27', assignee: '박자산', status: '완료' },
      { id: 'INV-2026-SP1', name: '판교 사무소 수시 조사', scope: '판교 사무소', planned: 86, scanned: 0, mismatched: 0, dueDate: '2026-08-08', assignee: '최지원', status: '계획' },
    ],
    notices: [
      { id: 'NTC-01', title: '[필독] 2026 하반기 재물조사 — 8/29까지 부서별 협조 요청', date: '2026-07-21', pinned: true },
      { id: 'NTC-02', title: '미인가 SaaS(스토리지류) 차단 정책 8/1 시행 안내', date: '2026-07-18' },
      { id: 'NTC-03', title: '노후 단말 일괄 교체 신청 접수 (영업조직 대상)', date: '2026-07-10' },
    ],
    seq: 200,
  }
}

const g = globalThis as unknown as { __itamStore?: Store }

export function getStore(): Store {
  if (!g.__itamStore) g.__itamStore = seed()
  return g.__itamStore
}

export function nextId(prefix: string): string {
  const s = getStore()
  s.seq += 1
  return `${prefix}-${s.seq}`
}
