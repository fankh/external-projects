import { blockedSaasServices } from './saas'
import { missingContractDocs } from './contract'
import { acquisitionCostOf, assetTco, bookValueOf, repairTotalOf } from './cost'
import { buildLicenseUsage } from './license-usage'
import { lowStockCategories } from './stock'
import { ratioPct, approvalAgeDays, daysUntil, isApprovalOverdue, isLoanOverdue, isMaintenanceDue, isMaintenanceOverdue, isStaleVerify, roundProgressPct, today, warrantyState, isWarrantyExpiring } from './dates'
import { ACTION_DEF, PERM_ACTIONS, can } from './perm'
import { contractAssetCount, getStore } from './store'
import { ASSET_CATEGORIES, CLOUD_POLICY, IDLE_POOL_STATUSES, LOCALVM_POLICY, UNAUTH_SW_POLICY, USB_POLICY, type PermMenu, type Role } from './types'
import type { Sheet } from './xlsx'

/** 엑셀 내보내기 대상 — 권한 매트릭스의 '엑셀' 기능이 걸리는 화면과 1:1 대응한다.
 *  (제품안내서 §02: 권한은 메뉴(화면) × 기능(버튼) 단위로 부여) */
export const EXPORT_KINDS = ['assets', 'stock', 'discovered', 'contracts', 'approvals', 'disposals', 'loans', 'menus', 'saas', 'saasCatalog'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

/** 내보내기 대상 ↔ 권한 매트릭스의 메뉴. 허용 여부는 매트릭스의 '엑셀' 칸이 정한다 —
 *  역할 목록을 여기 따로 두면 화면에서 권한을 바꿔도 반영되지 않는다. */
export const EXPORT_META: Record<ExportKind, { label: string; file: string; menu: PermMenu }> = {
  assets: { label: '자산 대장', file: '자산대장', menu: '자산 대장' },
  stock: { label: '재고 현황', file: '재고현황', menu: '재고 · 재물조사' },
  discovered: { label: '발견 자산', file: '발견자산', menu: '발견 자산 · CMDB 대사' },
  contracts: { label: '계약 · 라이선스', file: '계약라이선스', menu: '계약 · 라이선스' },
  approvals: { label: '결재 이력', file: '결재이력', menu: '신청 · 결재' },
  disposals: { label: '폐기 증적 대장', file: '폐기증적대장', menu: '수명주기' },
  loans: { label: '대여 대장', file: '대여대장', menu: '수명주기' },
  menus: { label: '메뉴 · 기능 정의', file: '메뉴기능정의', menu: '권한 · 정책' },
  saas: { label: 'Shadow SaaS 현황', file: '미인가SaaS현황', menu: 'Shadow SaaS' },
  saasCatalog: { label: 'SaaS 정책 대장', file: 'SaaS정책대장', menu: 'Shadow SaaS' },
}

export function canExport(kind: ExportKind, role: Role): boolean {
  return can(EXPORT_META[kind].menu, '엑셀', role)
}

/** 내보내기 데이터 — 화면에 보이는 것과 같은 권한 필터를 통과시킨다.
 *  화면에서 못 보는 자산이 엑셀로 새어 나가면 권한 모델이 무의미해진다. */
export interface ExportFilter {
  q?: string; cat?: string; nos?: string[]; status?: string; stale?: boolean; warranty?: boolean
  channel?: string; state?: string; risk?: string; akind?: string; mine?: boolean
  /** 화면이 실제로 보여 준 행의 ID — 서버가 같은 조건을 다시 계산할 수 없는 화면(계약·폐기·SaaS)에서 쓴다.
   *  자산 대장이 이미 쓰던 nos 와 같은 수법을 종류 전체로 넓힌 것이다. */
  ids?: string[]
  /** 사람이 읽는 필터 설명 — 반출본 첫 시트에 적어, 받는 사람이 부분 반출임을 알 수 있게 한다 */
  scope?: string
}

/** 반출 시트 — 필터가 걸렸으면 '반출 범위' 시트를 앞에 붙인다.
 *  부분 반출을 전체 대장으로 착각하면 감사에서 '누락'으로 읽힌다(감사 로그 반출이 이미 감사 기록에 범위를 적는 규약).
 *  화면과 같은 집합을 반출한다는 약속은 자산 대장·발견 자산·결재함만 지키고 있었다 — 계약·폐기·SaaS 는
 *  필터를 무시하고 전체를 내보내면서 그 사실을 어디에도 적지 않았다. */
export function buildSheets(kind: ExportKind, role: Role, userName: string, filter?: ExportFilter): Sheet[] {
  const sheets = buildKindSheets(kind, role, userName, filter)
  if (!filter?.scope) return sheets
  return [
    {
      name: '반출 범위',
      header: ['항목', '값'],
      rows: [
        ['반출 종류', EXPORT_META[kind].label],
        ['반출자', userName],
        ['반출일', today()],
        ['적용 필터', filter.scope],
        ...sheets.map((sh) => [`시트 '${sh.name}' 행수`, sh.rows.length] as (string | number)[]),
        ['안내', '화면 필터가 걸린 부분 반출입니다 — 전체 대장이 아닙니다.'],
      ],
    },
    ...sheets,
  ]
}

function buildKindSheets(kind: ExportKind, role: Role, userName: string, filter?: ExportFilter): Sheet[] {
  const s = getStore()
  // 화면이 보여 준 행만 — 서버가 같은 필터를 다시 계산할 수 없는 종류에 쓴다(자산 대장의 nos 와 같은 수법)
  const idSet = filter?.ids?.length ? new Set(filter.ids) : null
  const keep = (id: string) => !idSet || idSet.has(id)

  if (kind === 'assets') {
    // 진행 중인 폐기 절차(완료 제외) 단계 — 화면 상세는 대여·재불출을 막으며 사유를 밝히는데 반출본에는 흔적이
    //  없어, 엑셀만 보면 파기 예정 자산이 평범한 '유휴' 재고로 읽힌다(가용 재고·불출 가드는 이미 제외한다).
    const disposalStage = new Map(s.disposals.filter((d) => d.status !== '완료').map((d) => [d.assetNo, d.status]))
    // 화면(자산 대장)의 검색·유형·상태·장기 미실측·보증 임박 필터를 그대로 반영 — 좁혀 본 그 집합을 반출한다.
    // nos(선택 자산번호)가 주어지면 그 선택분만 반출한다(다중 선택 → 선택 내보내기).
    const q = (filter?.q ?? '').trim().toLowerCase()
    const cat = filter?.cat ?? '전체'
    const status = filter?.status ?? '전체'
    const nos = filter?.nos && filter.nos.length ? new Set(filter.nos) : null
    // 보증 임박 — 운영 중 자산 중 보증 만료가 운영 정책 만료창 안(경과 포함). 대장 화면의 warrantySet 과 같은 lib/dates 판정.
    const warrantySoon = (a: (typeof s.assets)[number]) => isWarrantyExpiring(a, s.opsPolicy.expiryWindowDays)
    const rows = (role === 'USER' ? s.assets.filter((a) => a.owner === userName) : s.assets)
      .filter((a) => {
        if (nos) return nos.has(a.assetNo)
        if (cat !== '전체' && a.category !== cat) return false
        if (status !== '전체' && a.status !== status) return false
        if (filter?.stale && !isStaleVerify(a, s.opsPolicy.staleVerifyDays)) return false
        if (filter?.warranty && !warrantySoon(a)) return false
        if (!q) return true
        return [a.assetNo, a.model, a.owner, a.dept, a.ip, a.serial, a.location, a.contractId].some((f) => f?.toLowerCase().includes(q))
      })
      .map((a) => [
        a.assetNo, a.category, a.model, a.serial, a.status,
        // NAC 격리 — 화면(대장 목록·상세)은 상태 칩 옆에 '격리' 칩을 세우는데 반출본에는 없어, 엑셀만 보면
        //  망이 끊긴 자산이 '사용중' 정상 자산으로 읽혔다(재고 가용·재배정·대여는 이미 격리를 빼는데 반출만 몰랐다).
        a.quarantinedAt ? `격리 ${a.quarantinedAt}` : '',
        disposalStage.get(a.assetNo) ?? '',
        a.criticality ?? '일반', a.owner, a.dept, a.location,
        a.os ?? '', a.cpu ?? '', a.memory ?? '', a.ip ?? '', a.mac ?? '',
        a.purchaseDate, a.warrantyEnd,
        ({ covered: '보증 내', soon: '만료 임박', expired: '보증 만료', none: '' })[warrantyState(a.warrantyEnd, today())],
        a.lastVerifiedAt ?? '',
        // 정기 점검 예정도 날짜만 반출하면 이 자산이 이미 점검을 넘긴 건지 알 수 없다 — 대여 반환 기한이 연체를
        //  함께 밝히는 것과 같은 규약으로 화면·큐와 같은 lib/dates 판정을 붙인다.
        a.maintenanceDue
          ? `${a.maintenanceDue}${isMaintenanceOverdue(a) ? ' (점검 경과)' : isMaintenanceDue(a, s.opsPolicy.maintenanceWindowDays) ? ' (도래)' : ''}`
          : '',
        a.contractId ?? '', a.discoveredVia ?? '',
        // 대여 반환 기한 — 수리 의뢰 열과 짝. 반출본만 보면 대여중 자산이 언제 돌아오는지·연체인지 알 수 없어
        //  결재 첨부·감사 대응에서 화면을 다시 열어야 했다(연체 판정은 화면·큐와 같은 lib/dates 판정).
        a.status === '대여중' && a.loanDueDate ? `${a.loanDueDate}${isLoanOverdue(a) ? ' (연체)' : ''}` : '',
        a.repair ? `${a.repair.vendor}${a.repair.eta ? ` (예상반환 ${a.repair.eta})` : ''}` : '',
        repairTotalOf(a) > 0 ? repairTotalOf(a) : '',
        acquisitionCostOf(a) > 0 ? acquisitionCostOf(a) : '', acquisitionCostOf(a) > 0 ? assetTco(a) : '',
        acquisitionCostOf(a) > 0 ? bookValueOf(a, today()) : '', a.history.length,
      ])
    return [{
      name: '자산 대장',
      header: ['자산번호', '유형', '모델', 'S/N', '상태', 'NAC 격리', '폐기 절차', '업무 중요도', '소유자', '부서', '위치', 'OS', 'CPU', '메모리', 'IP', 'MAC', '구매일', '보증만료', '보증상태', '최근 실측', '정기 점검 예정', '계약', '발견채널', '대여 반환 기한', '수리 의뢰', '누적 수리비', '취득가', 'TCO', '잔존가치', '이력건수'],
      rows,
    }]
  }

  if (kind === 'stock') {
    // 재고는 집계가 본질이므로 유형별·부서별·위치별 3장으로 나눈다.
    // 대수 집계는 화면(StockPage.aggBy)과 동일하게 전 자산을 센다 — 폐기완료를 빼면 합계가 화면 '총 보유'와 어긋나 반출본이 화면과 불일치한다(화면 불변식: 집계 합계 = 총 보유 수).
    // 열 구성도 화면(StockBreakdown)과 같다 — '기타'(검수중·대여중·수리중·분실·폐기 등 나머지 상태)를 빼면
    //  보유 ≠ 사용중 + 유휴·반납대기 가 되어 반출본만으로는 차이가 어디로 갔는지 대사할 수 없다(결재 첨부·감사 대응 자료).
    // 화면 tfoot 과 같은 합계 행을 각 시트 끝에 둔다 — 회계·감사가 엑셀 안에서 바로 검산한다(리포트 금액 표 합계 행과 동일 규약).
    const live = s.assets.filter((a) => a.status !== '폐기완료')
    const agg = (key: (a: (typeof s.assets)[number]) => string) => {
      const m = new Map<string, { total: number; inUse: number; idle: number }>()
      for (const a of s.assets) {
        const k = key(a) || '-'
        const cur = m.get(k) ?? { total: 0, inUse: 0, idle: 0 }
        cur.total += 1
        if (a.status === '사용중') cur.inUse += 1
        if (IDLE_POOL_STATUSES.includes(a.status)) cur.idle += 1
        m.set(k, cur)
      }
      const rows: (string | number)[][] = [...m.entries()]
        .sort((x, y) => y[1].total - x[1].total)
        .map(([k, v]) => [k, v.total, v.inUse, v.idle, v.total - v.inUse - v.idle, ratioPct(v.idle, v.total)])
      const sum = (i: number) => rows.reduce((n, r) => n + (r[i] as number), 0)
      const total = sum(1), idle = sum(3)
      return [...rows, ['합계', total, sum(2), idle, sum(4), ratioPct(idle, total)]]
    }
    const header = ['구분', '보유', '사용중', '유휴·반납대기', '기타', '유휴율(%)']
    // 유형별 자산 가치 — 취득가·잔존가치(정액법 감가상각). SW·가상자원은 자산 단위 취득가 없어 제외.
    // 행 순서는 화면과 같은 표준 유형 순서(ASSET_CATEGORIES) — 자산 배열 등장 순서로 뽑으면 화면과 행 순서가 어긋난다.
    const t = today()
    const valued = live.filter((a) => acquisitionCostOf(a) > 0)
    const valueRows: (string | number)[][] = ASSET_CATEGORIES
      .map((cat) => {
        const list = valued.filter((a) => a.category === cat)
        const acq = list.reduce((n, a) => n + acquisitionCostOf(a), 0)
        const book = list.reduce((n, a) => n + bookValueOf(a, t), 0)
        return [cat, list.length, acq, book, ratioPct(acq - book, acq)]
      })
      .filter((r) => (r[1] as number) > 0)
    const vSum = (i: number) => valueRows.reduce((n, r) => n + (r[i] as number), 0)
    const vAcq = vSum(2), vBook = vSum(3)
    const valueTotal = ['합계', vSum(1), vAcq, vBook, ratioPct(vAcq - vBook, vAcq)]
    // 이 반출은 권한 매트릭스의 '재고 · 재물조사' 메뉴에 걸리는데 재물조사 쪽 실적이 한 장도 없었다 —
    //  계획 화면이 '완료 회차의 대상·실사·차이 실적을 보존합니다(감사 추적)'라고 말해 놓고, 그 실적을 반출할
    //  경로가 없었다. 회차 실적과 차이 조정 내역, 그리고 화면이 경보로 띄우는 안전재고 미달 판정을 함께 담는다.
    const roundRows: (string | number)[][] = s.inventoryRounds.map((r) => [
      r.id, r.name, r.kind, r.scope, r.assignee, r.dueDate, r.status,
      r.planned, r.scanned, r.mismatched, roundProgressPct(r),
      r.status !== '완료' && r.dueDate < t ? '기한 경과' : '-',
    ])
    const roundName = new Map(s.inventoryRounds.map((r) => [r.id, r.name]))
    // 차이는 '무엇이 어긋났고 어떻게 조정했는지'가 감사 근거다 — 미조치도 값으로 적는다(빈 칸은 조치 안 함인지
    //  데이터 없음인지 갈리지 않는다 · 발견 자산 반출과 같은 규약).
    const diffRows: (string | number)[][] = s.surveyDiffs.map((d) => [
      d.id, d.roundId, roundName.get(d.roundId) ?? '-', d.kind, d.assetNo, d.model,
      d.expected, d.actual, d.status, d.resolution ?? '미적용',
    ])
    // 안전재고 판정은 화면 경보·대시보드 큐와 같은 lib/stock 단일 소스 — 반출본만 따로 세면 세 수가 갈린다.
    const low = lowStockCategories(s.assets, s.disposals, s.opsPolicy.safetyStock)
    const lowRows: (string | number)[][] = low.map((r) => [r.category, r.available, r.safetyStock, r.short, '미달'])
    return [
      { name: '유형별', header, rows: agg((a) => a.category) },
      { name: '부서별', header, rows: agg((a) => a.dept) },
      { name: '위치별', header, rows: agg((a) => a.location) },
      { name: '유형별 가치', header: ['유형', '대수', '총 취득가', '총 잔존가치', '감가상각률(%)'], rows: [...valueRows, valueTotal] },
      {
        name: '재물조사 회차',
        header: ['회차ID', '회차명', '구분', '대상 범위', '담당자', '기준일', '상태', '대상', '실사', '차이', '진행률(%)', '기한'],
        rows: roundRows,
      },
      {
        name: '재물조사 차이',
        header: ['차이ID', '회차ID', '회차명', '차이 유형', '자산번호', '모델', '대장(기대)', '실사(실제)', '조정 상태', '조정 방식'],
        rows: diffRows,
      },
      {
        name: '안전재고 미달',
        header: ['유형', '가용', '안전재고', '부족', '판정'],
        rows: lowRows,
      },
    ]
  }

  if (kind === 'discovered') {
    // 발견 자산 화면(FoundView)의 채널·대사상태·위험도·검색 필터를 그대로 반영한다.
    const obsCountBy = new Map<string, number>()
    const obsByAsset = new Map<string, typeof s.observations>()
    for (const o of s.observations) {
      obsCountBy.set(o.discoveredId, (obsCountBy.get(o.discoveredId) ?? 0) + 1)
      const arr = obsByAsset.get(o.discoveredId) ?? []
      arr.push(o); obsByAsset.set(o.discoveredId, arr)
    }
    const dq = (filter?.q ?? '').trim().toLowerCase()
    const dchan = filter?.channel ?? '전체'
    const dstate = filter?.state ?? '전체'
    const drisk = filter?.risk ?? '전체'
    const disc = s.discovered.filter((d) => {
      if (dchan !== '전체') {
        const obs = obsByAsset.get(d.id) ?? []
        if (!(d.channel === dchan || obs.some((o) => o.channel === dchan))) return false
      }
      if (dstate !== '전체' && d.state !== dstate) return false
      if (drisk !== '전체' && d.risk !== drisk) return false
      if (!dq) return true
      return [d.id, d.hostname, d.ip, d.mac, d.type].some((f) => f?.toLowerCase().includes(dq))
    })
    const discIds = new Set(disc.map((d) => d.id))
    return [
      {
        name: '발견 자산',
        header: ['발견ID', '지문', '호스트명', '유형', 'IP', 'MAC', '최초발견채널', '관측건수', '최초발견', '최근실측', '대사상태', '위험도', '대사자산', '불일치 내용', '소유자후보', '처리', '비고'],
        rows: disc.map((d) => [
          d.id, d.fingerprint ?? '', d.hostname, d.type, d.ip, d.mac, d.channel, obsCountBy.get(d.id) ?? 0,
          d.firstSeen, d.lastSeen, d.state, d.risk, d.matchedAssetNo ?? '', d.mismatch ?? '', d.ownerCandidate ?? '',
          d.action ?? '', d.note ?? '',
        ]),
      },
      {
        name: '채널별 관측',
        header: ['관측ID', '발견ID', '채널', '호스트명', 'IP', 'MAC', '관측시각', '내용'],
        // 필터된 발견 자산의 관측만 (반출이 화면과 일치)
        rows: s.observations.filter((o) => discIds.has(o.discoveredId)).map((o) => [o.id, o.discoveredId, o.channel, o.hostname, o.ip, o.mac, o.seenAt, o.detail]),
      },
      // 발견 화면의 다섯 조치 표도 함께 반출한다 — 그동안 이 엑셀은 CMDB 대사 표 하나만 담아,
      //  화면에서 판정한 계정 위생·미인가 SW·USB·로컬 VM·클라우드 거버넌스 위반이 감사 제출본에서 통째로 빠졌다.
      //  (이 다섯 표는 화면에서도 채널·대사상태·위험도 필터를 받지 않으므로 전량을 담아 화면과 일치한다.)
      {
        name: '계정 위생 — 휴면 계정',
        header: ['검출ID', '계정', '표시명', '부서', '유형', '최근 로그인', '소스', '위험도', '조치', '조치자', '조치일', '비고'],
        rows: s.accounts.map((a) => [a.id, a.account, a.displayName, a.dept, a.kind, a.lastLogin, a.source, a.risk, a.action ?? '미조치', a.actedBy ?? '', a.actedAt ?? '', a.note ?? '']),
      },
      {
        name: '미인가 SW',
        header: ['검출ID', 'SW', '버전', '자산번호', '보유자', '부서', '유형', '정책 근거', '검출', '최초검출', '위험도', '조치', '조치자', '조치일', '비고'],
        rows: s.unauthorizedSw.map((w) => [w.id, w.name, w.version ?? '', w.assetNo, w.owner, w.dept, w.kind, UNAUTH_SW_POLICY[w.kind], w.detectedBy, w.firstSeen, w.risk, w.action ?? '미조치', w.actedBy ?? '', w.actedAt ?? '', w.note ?? '']),
      },
      {
        name: 'USB 정책 위반',
        header: ['검출ID', '매체', '자산번호', '보유자', '부서', '유형', '정책 근거', '검출', '최초검출', '위험도', '조치', '조치자', '조치일', '비고'],
        rows: s.usbFindings.map((u) => [u.id, u.device, u.assetNo, u.owner, u.dept, u.kind, USB_POLICY[u.kind], u.detectedBy, u.firstSeen, u.risk, u.action ?? '미조치', u.actedBy ?? '', u.actedAt ?? '', u.note ?? '']),
      },
      {
        name: '로컬 VM 위반',
        header: ['검출ID', 'VM', '게스트 OS', '실행 자산', '보유자', '부서', '유형', '정책 근거', '검출', '최초검출', '위험도', '조치', '조치자', '조치일', '비고'],
        rows: s.localVms.map((v) => [v.id, v.vm, v.guestOs, v.assetNo, v.owner, v.dept, v.kind, LOCALVM_POLICY[v.kind], v.detectedBy, v.firstSeen, v.risk, v.action ?? '미조치', v.actedBy ?? '', v.actedAt ?? '', v.note ?? '']),
      },
      {
        name: '미관리 클라우드 리소스',
        header: ['검출ID', '리소스', 'CSP · 리전', '계정 · 구독', '소유자', '부서', '유형', '정책 근거', '검출', '최초검출', '위험도', '조치', '조치자', '조치일', '비고'],
        rows: s.cloudFindings.map((c) => [c.id, c.resource, c.provider, c.account, c.owner, c.dept, c.kind, CLOUD_POLICY[c.kind], c.detectedBy, c.firstSeen, c.risk, c.action ?? '미조치', c.actedBy ?? '', c.actedAt ?? '', c.note ?? '']),
      },
    ]
  }

  if (kind === 'contracts') {
    return [
      {
        name: '계약',
        // 화면(ContractsTable)이 보여주는 SLA·집행(비용 이력 누계)을 감사 반출에도 담는다 — 벤더 SLA 검토·예산 집행 대사 증적.
        header: ['계약번호', '구분', '계약명', '공급사', '주관부서', '금액', '집행(누계)', '연계 자산 수', '시작일', '만료일', '잔여일', '상태', '해지 사유', 'SLA', '부속서류 미비'],
        rows: s.contracts.filter((c) => keep(c.id)).map((c) => {
          const miss = missingContractDocs(c)
          const spent = (c.costs ?? []).reduce((n, x) => n + x.amount, 0)
          return [c.id, c.kind, c.name, c.vendor, c.ownerDept, c.amount, (c.costs?.length ?? 0) > 0 ? spent : '', contractAssetCount(c.id), c.start, c.end, daysUntil(c.end) ?? '', c.status ?? '유효', c.status === '해지' ? (c.terminateReason ?? '미기재') : '-', c.sla ?? '', miss.length > 0 ? miss.join('·') : '완비']
        }),
      },
      {
        name: 'SW 라이선스',
        header: ['ID', '라이선스', '공급사', '근거 계약', '보유', '사용', '차이', '단가', '만료일', '판정', '해지 사유'],
        rows: s.licenses.filter((l) => keep(l.id)).map((l) => {
          const gap = l.used - l.purchased
          return [
            l.id, l.name, l.vendor, l.contractId ?? '미연계', l.purchased, l.used, gap, l.unitCost, l.expiry,
            l.status === '해지' ? '해지' : gap > 0 ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정',
            l.status === '해지' ? (l.terminateReason ?? '미기재') : '-',
          ]
        }),
      },
      {
        // 라이선스 좌석 대사(STEP2) — EDR 설치 인벤토리와 배정 좌석 대사 결과. SAM 감사 증적(배정 밖 설치=무단 사용, 미설치 좌석=회수 후보).
        name: '라이선스 좌석 대사',
        header: ['ID', '라이선스', '보유', '배정 좌석', '설치 관측', '일치', '배정 밖 설치', '미설치 좌석', '최근 수집'],
        rows: buildLicenseUsage().rows.filter((r) => keep(r.id)).map((r) => [
          r.id, r.name, r.purchased, r.seatCount, r.installCount, r.matched, r.offSeat.length, r.unusedSeat.length, r.collectedAt ?? '-',
        ]),
      },
    ]
  }

  if (kind === 'disposals') {
    // 폐기 증적 대장 — 감사 대응용. 대상 선정~완료 전 단계와 소거 방식·확인서 번호를 한 장에 남긴다.
    // 미기재 칸은 빈 칸이 아니라 사유를 적는다 — 아직 그 단계에 오지 않은 것과 값이 없는 것은 감사에서 다른 뜻이다.
    const notYet = (d: (typeof s.disposals)[number], v?: string | number) =>
      v !== undefined && v !== '' ? v : d.status === '완료' ? '미기재' : '소거 전'
    return [
      {
        name: '폐기 증적 대장',
        header: ['폐기번호', '자산번호', '모델', '폐기 사유', '상태', '결재번호', '소거 방식', '처분 방식', '매각 대금', '소거일', '처리자', '확인서 번호', '증적', '증적 사진 수'],
        rows: s.disposals.filter((d) => keep(d.id)).map((d) => [
          d.id, d.assetNo, d.model, d.reason, d.status, d.approvalId ?? '미상신',
          notYet(d, d.wipeMethod), notYet(d, d.disposition), d.disposition === '매각' ? (d.proceeds ?? '미기재') : '-',
          notYet(d, d.wipedAt), notYet(d, d.wipedBy), notYet(d, d.certNo), notYet(d, d.evidence), d.photos?.length ?? 0,
        ]),
      },
      {
        // 증적 사진은 이 대장의 이름이 걸고 있는 바로 그 증적인데 반출본에는 건수만 있었다 — 어떤 장면을
        //  누가 언제 남겼는지가 감사에서 실제로 확인하는 값이다(화면은 구분·설명·등록자·등록일을 모두 보여 준다).
        name: '폐기 증적 사진',
        header: ['사진ID', '폐기번호', '자산번호', '모델', '구분', '설명', '등록자', '등록일'],
        rows: s.disposals.filter((d) => keep(d.id)).flatMap((d) =>
          (d.photos ?? []).map((ph) => [ph.id, d.id, d.assetNo, d.model, ph.label, ph.note ?? '', ph.addedBy, ph.addedAt]),
        ),
      },
    ]
  }

  if (kind === 'loans') {
    // 대여(반출) 대장 — 감사 대응용. 반출 중인 자산이 누구에게·언제까지 나가 있는지, 연체 여부를 한 장에 남긴다.
    const rows = s.assets
      .filter((a) => a.status === '대여중')
      .map((a) => {
        // 최초 대여 이벤트 — kind '대여'는 연장 승인·반려·취소도 재사용하므로 '연장' 든 이벤트를 제외해 최초 대여를 잡는다
        //  (대여 확인서 loan-agreement 라우트와 동일 규약). 양성매칭('대여 —')만 쓰면 결재 경유 대여('대여 신청 승인 —' 표기)를
        //  놓쳐 fallback 이 최신 연장 조치일로 흘러 대여일이 틀어진다(감사 대여 대장 오기).
        const loanEv = [...a.history].reverse().find((h) => h.kind === '대여' && !h.detail.includes('연장'))
          ?? [...a.history].reverse().find((h) => h.kind === '대여')
        const d = a.loanDueDate ? daysUntil(a.loanDueDate) : null
        const state = d === null ? '기한 없음' : d < 0 ? `연체 ${-d}일` : d <= 7 ? `반환 임박 D-${d}` : '정상'
        // 대기 중인 대여자 요청 — 화면(반납·회수 대기열·대시보드 큐)은 연장 요청·반납 신청을 드러내는데 반출본에는
        //  없어, 대여 대장 엑셀로 일하는 담당자는 이미 접수된 요청을 모른 채 독촉을 보내게 된다(같은 자산에 두 소리).
        const pending = a.loanExtendRequest ? `연장 요청 (${a.loanExtendRequest.newDueDate})` : a.returnRequest ? '반납 신청' : ''
        return [a.assetNo, a.category, a.model, a.owner, a.dept, a.location, loanEv?.date ?? '', a.loanDueDate ?? '', d ?? '', state, pending]
      })
      .sort((x, y) => (typeof x[8] === 'number' ? x[8] : 99_999) - (typeof y[8] === 'number' ? y[8] : 99_999))
    return [{
      name: '대여 대장',
      header: ['자산번호', '유형', '모델', '대여자', '부서', '위치', '대여일', '반환 기한', '잔여일', '상태', '대기 중 요청'],
      rows,
    }]
  }

  if (kind === 'menus') {
    // 메뉴·기능 정의(권한 파이프라인 STEP 1·2) 반출 — 화면이 제공하는 기능과 그 강제 지점, 화면별 부여 기능을
    // 감사·거버넌스 문서로 남긴다. 화면 표시(settings/menus)와 같은 정의(ACTION_DEF·menuDefs)를 쓴다.
    const defs = s.menuDefs
    return [
      {
        name: 'STEP1 기능정의',
        header: ['기능', '의미', '강제 지점', '사용 화면 수'],
        rows: PERM_ACTIONS.map((a) => [a, ACTION_DEF[a].desc, ACTION_DEF[a].enforcedBy, defs.filter((d) => d.actions.includes(a)).length]),
      },
      {
        name: 'STEP2 메뉴정의',
        header: ['화면번호', '카테고리', '메뉴', '경로', '부여된 기능', '서버 강제 기능', '기능 수'],
        rows: defs.map((d) => [d.code, d.category, d.menu, d.path, d.actions.join('·'), d.enforced.join('·') || '-', d.actions.length]),
      },
    ]
  }

  if (kind === 'saas') {
    // Shadow SaaS 현황 반출 — 미인가 SaaS 사용(부서별)은 감사·컴플라이언스 증적. 화면(discovery/saas)과 같은 데이터.
    //  차단 판정이 끝난 서비스는 '판정 대기' 갭이 아니다 — sanctioned 는 인가/미인가 두 값뿐이라 차단을 담지 못한다.
    //  화면 KPI·부서별 요약과 주간 브리핑이 쓰는 기준(카탈로그 차단 목록)을 반출본도 그대로 쓴다. 사용 현황 시트는
    //  전 서비스를 담되 인가 여부 칸에 '차단 판정'을 구분해 적어, 판정 이력이 반출본에서 사라지지 않게 한다.
    const blockedSaas = blockedSaasServices()
    const saasRows = s.saas.filter((x) => keep(x.id))
    const shadow = saasRows.filter((x) => !x.sanctioned && !blockedSaas.has(x.service))
    const deptAgg = Object.values(
      shadow.reduce<Record<string, { dept: string; count: number; users: number }>>((acc, x) => {
        const r = (acc[x.dept] ??= { dept: x.dept, count: 0, users: 0 })
        r.count += 1; r.users += x.users
        return acc
      }, {}),
    ).sort((a, b) => b.users - a.users)
    return [
      {
        name: 'SaaS 사용 현황',
        header: ['서비스', '기능 분류', '주 사용 부서', '추정 사용자', '인가 여부', '위험도', '월 접속'],
        rows: saasRows.map((x) => [x.service, x.category, x.dept, x.users, x.sanctioned ? '인가' : blockedSaas.has(x.service) ? '차단 판정' : '미인가', x.risk, x.monthlyVisits]),
      },
      {
        name: '부서별 미인가 노출',  // 판정 대기 미인가만 — 차단 판정 완료분 제외(화면 요약과 동일)
        header: ['부서', '미인가 서비스 수', '추정 사용자 합'],
        rows: deptAgg.map((r) => [r.dept, r.count, r.users]),
      },
    ]
  }

  if (kind === 'saasCatalog') {
    // SaaS 정책 대장 — 인가/차단/검토중 판정·데이터 등급·결정자를 거버넌스 감사 증적으로. 검토중(미판정)까지 담아 정책 결정 이력 전체를 남긴다(사용 현황 반출 saas 와 구분).
    return [{
      name: 'SaaS 정책 대장',
      header: ['서비스', '기능 분류', '공급사', '판정', '데이터 등급', '주관', '판정일', '검토 접수일', '판정자'],
      rows: s.saasCatalog.filter((x) => keep(x.id)).map((x) => [x.service, x.category, x.vendor, x.status, x.dataGrade, x.owner, x.decidedAt ?? '-', x.reviewSince ?? '-', x.decidedBy ?? '-']),
    }]
  }

  // approvals — 결재함(ApprovalList)의 상태·구분·검색·내 상신만 필터를 그대로 반영.
  //  여기는 폴백이 아니라 이 종류 전용 구간이다. 위 분기에 걸리지 않은 종류가 그대로 떨어지면 결재 이력
  //  (기안자·반려 사유·연결 문서)이 그 종류의 라벨·파일명으로 반출되고, 권한도 그 종류의 메뉴 '엑셀' 칸으로
  //  판정돼(canExport) 결재를 볼 수 없어야 할 역할에게 나갈 수 있다. 종류 추가 시 분기 누락을 조용히 넘기지 않는다
  //  (라우트가 EXPORT_KINDS 밖 값은 404 로 먼저 막으므로, 이 가드는 목록에 추가하고 분기를 빠뜨린 경우를 잡는다).
  if (kind !== 'approvals') {
    return [{
      name: '정의 없음',
      header: ['항목'],
      rows: [[`'${kind}' 반출은 시트 정의가 없습니다 — EXPORT_KINDS 에 종류를 추가할 때 buildSheets 분기도 함께 등록하세요.`]],
    }]
  }

  const t = today()
  const aq = (filter?.q ?? '').trim().toLowerCase()
  const astatus = filter?.status ?? '전체'
  const akind = filter?.akind ?? '전체'
  const amine = Boolean(filter?.mine)
  // 결재선 정의 — 이 문서가 어느 단계를 거치도록 돼 있는지. 현재단계만으로는 남은 단계도, 필수 결재 여부도
  //  반출본에서 읽을 수 없어 '왜 아직 대기인지'를 감사에서 판단할 수 없었다.
  const lineOf = new Map(s.approvalLines.map((l) => [l.kind, l]))
  // 신청 사유·첨부 근거 문서는 화면이 결재자에게 보여 주는 판단 근거인데 반출본에 없었다 — 결재 이력이라면서
  //  '무엇을 왜 요청했고 무엇을 근거로 결재했는지'가 빠져 있던 셈이다. 대상 상세(이동 목적지·희망 반환 기한 등)도 같다.
  const detailOf = (a: (typeof s.approvals)[number]) => [
    a.targetLocation ? `이동 목적지 ${a.targetLocation}` : '',
    a.loanDueDate ? `희망 반환 ${a.loanDueDate}` : '',
    a.desiredCategory ? `희망 유형 ${a.desiredCategory}` : '',
    a.saasService ? `대상 SaaS ${a.saasService}` : '',
  ].filter(Boolean).join(' · ') || '-'
  return [{
    name: '결재 이력',
    header: ['문서번호', '구분', '제목', '기안자', '부서', '기안일', '상태', '결재선', '현재단계', '대기 경과일', '결재자', '결재일', '신청 사유', '대상 상세', '첨부 근거 문서', '반려 사유', '재상신', '연결', '집행'],
    rows: s.approvals
      .filter((a) => {
        // USER 는 본인 상신분만 — 권한 매트릭스 '엑셀' 셀을 켜도 조회='p'(own-scope) 규칙을 넘지 못한다(자산 반출과 동일 방어선). amine 는 선택 필터일 뿐 보안 스코프가 아니다.
        if (role === 'USER' && a.requester !== userName) return false
        if (astatus !== '전체' && a.status !== astatus) return false
        if (akind !== '전체' && a.kind !== akind) return false
        if (amine && a.requester !== userName) return false
        if (!aq) return true
        return [a.id, a.title, a.requester].some((f) => f?.toLowerCase().includes(aq))
      })
      .map((a) => {
        const line = lineOf.get(a.kind)
        return [
          a.id, a.kind, a.title, a.requester, a.dept, a.requestedAt, a.status,
          line ? `${line.steps.join(' → ')}${line.required ? ' (필수 결재)' : ''}` : '-',
          a.currentStep,
          // 대기 경과일 — 대기 결재의 상신 후 경과일. SLA(3일) 초과면 '지연' 표기로 정체 결재를 감사 반출에 드러낸다.
          a.status === '대기' ? `${approvalAgeDays(a.requestedAt, t)}일${isApprovalOverdue(a, t, s.opsPolicy.approvalSlaDays) ? ' · 지연' : ''}` : '',
          a.decidedBy ?? '', a.decidedAt ?? '',
          a.note ?? '-', detailOf(a), (a.reportRefs ?? []).join(', ') || '-',
          // 반려 사유는 반려일 때만 뜻이 있다 — 다른 상태의 빈 칸과 섞이지 않게 '-' 로 구분한다.
          a.status === '반려' ? (a.rejectReason ?? '미기재') : '-',
          a.status === '반려' ? (a.resubmitted ? '재상신함' : '미재상신') : '-',
          a.refId ?? '-', a.fulfilled ? '집행완료' : a.status === '승인' ? '집행 대기' : '-',
        ]
      }),
  }]
}
