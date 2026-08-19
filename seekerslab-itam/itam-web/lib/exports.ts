import { missingContractDocs } from './contract'
import { acquisitionCostOf, assetTco, bookValueOf } from './cost'
import { buildLicenseUsage } from './license-usage'
import { approvalAgeDays, daysUntil, isApprovalOverdue, isStaleVerify, today, warrantyState } from './dates'
import { ACTION_DEF, PERM_ACTIONS, can } from './perm'
import { getStore } from './store'
import type { PermMenu, Role } from './types'
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
export function buildSheets(kind: ExportKind, role: Role, userName: string, filter?: { q?: string; cat?: string; nos?: string[]; status?: string; stale?: boolean; warranty?: boolean; channel?: string; state?: string; risk?: string; akind?: string; mine?: boolean }): Sheet[] {
  const s = getStore()

  if (kind === 'assets') {
    // 화면(자산 대장)의 검색·유형·상태·장기 미실측·보증 임박 필터를 그대로 반영 — 좁혀 본 그 집합을 반출한다.
    // nos(선택 자산번호)가 주어지면 그 선택분만 반출한다(다중 선택 → 선택 내보내기).
    const q = (filter?.q ?? '').trim().toLowerCase()
    const cat = filter?.cat ?? '전체'
    const status = filter?.status ?? '전체'
    const nos = filter?.nos && filter.nos.length ? new Set(filter.nos) : null
    // 보증 임박 — 운영 중 자산 중 보증 90일 이내(경과 포함). 대장 화면의 warrantySet 과 같은 기준.
    const warrantySoon = (a: (typeof s.assets)[number]) =>
      !['폐기완료', '폐기예정'].includes(a.status) && a.warrantyEnd !== '-' && (daysUntil(a.warrantyEnd) ?? 999) <= 90
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
        a.assetNo, a.category, a.model, a.serial, a.status, a.criticality ?? '일반', a.owner, a.dept, a.location,
        a.os ?? '', a.cpu ?? '', a.memory ?? '', a.ip ?? '', a.mac ?? '',
        a.purchaseDate, a.warrantyEnd,
        ({ covered: '보증 내', soon: '만료 임박', expired: '보증 만료', none: '' })[warrantyState(a.warrantyEnd, today())],
        a.lastVerifiedAt ?? '', a.maintenanceDue ?? '', a.contractId ?? '', a.discoveredVia ?? '',
        a.repair ? `${a.repair.vendor}${a.repair.eta ? ` (예상반환 ${a.repair.eta})` : ''}` : '',
        (a.repairCosts?.length ?? 0) > 0 ? a.repairCosts!.reduce((n, c) => n + c.amount, 0) : '',
        acquisitionCostOf(a) > 0 ? acquisitionCostOf(a) : '', acquisitionCostOf(a) > 0 ? assetTco(a) : '',
        acquisitionCostOf(a) > 0 ? bookValueOf(a, today()) : '', a.history.length,
      ])
    return [{
      name: '자산 대장',
      header: ['자산번호', '유형', '모델', 'S/N', '상태', '업무 중요도', '소유자', '부서', '위치', 'OS', 'CPU', '메모리', 'IP', 'MAC', '구매일', '보증만료', '보증상태', '최근 실측', '정기 점검 예정', '계약', '발견채널', '수리 의뢰', '누적 수리비', '취득가', 'TCO', '잔존가치', '이력건수'],
      rows,
    }]
  }

  if (kind === 'stock') {
    // 재고는 집계가 본질이므로 유형별·부서별·위치별 3장으로 나눈다.
    // 대수 집계는 화면(StockPage.aggBy)과 동일하게 전 자산을 센다 — 폐기완료를 빼면 합계가 화면 '총 보유'와 어긋나 반출본이 화면과 불일치한다(화면 불변식: 집계 합계 = 총 보유 수).
    const live = s.assets.filter((a) => a.status !== '폐기완료')
    const agg = (key: (a: (typeof s.assets)[number]) => string) => {
      const m = new Map<string, { total: number; inUse: number; idle: number }>()
      for (const a of s.assets) {
        const k = key(a) || '-'
        const cur = m.get(k) ?? { total: 0, inUse: 0, idle: 0 }
        cur.total += 1
        if (a.status === '사용중') cur.inUse += 1
        if (['유휴', '반납대기'].includes(a.status)) cur.idle += 1
        m.set(k, cur)
      }
      return [...m.entries()]
        .sort((x, y) => y[1].total - x[1].total)
        .map(([k, v]) => [k, v.total, v.inUse, v.idle, v.total ? Math.round((v.idle / v.total) * 100) : 0])
    }
    const header = ['구분', '보유', '사용중', '유휴·반납대기', '유휴율(%)']
    // 유형별 자산 가치 — 취득가·잔존가치(정액법 감가상각). SW·가상자원은 자산 단위 취득가 없어 제외.
    const t = today()
    const valued = live.filter((a) => acquisitionCostOf(a) > 0)
    const valueRows = [...new Set(valued.map((a) => a.category))].map((cat) => {
      const list = valued.filter((a) => a.category === cat)
      const acq = list.reduce((n, a) => n + acquisitionCostOf(a), 0)
      const book = list.reduce((n, a) => n + bookValueOf(a, t), 0)
      return [cat, list.length, acq, book, acq > 0 ? Math.round((1 - book / acq) * 100) : 0]
    })
    return [
      { name: '유형별', header, rows: agg((a) => a.category) },
      { name: '부서별', header, rows: agg((a) => a.dept) },
      { name: '위치별', header, rows: agg((a) => a.location) },
      { name: '유형별 가치', header: ['유형', '대수', '총 취득가', '총 잔존가치', '감가상각률(%)'], rows: valueRows },
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
    ]
  }

  if (kind === 'contracts') {
    return [
      {
        name: '계약',
        // 화면(ContractsTable)이 보여주는 SLA·집행(비용 이력 누계)을 감사 반출에도 담는다 — 벤더 SLA 검토·예산 집행 대사 증적.
        header: ['계약번호', '구분', '계약명', '공급사', '주관부서', '금액', '집행(누계)', '연계 자산 수', '시작일', '만료일', '잔여일', '상태', 'SLA', '부속서류 미비'],
        rows: s.contracts.map((c) => {
          const miss = missingContractDocs(c)
          const spent = (c.costs ?? []).reduce((n, x) => n + x.amount, 0)
          return [c.id, c.kind, c.name, c.vendor, c.ownerDept, c.amount, (c.costs?.length ?? 0) > 0 ? spent : '', s.assets.filter((a) => a.contractId === c.id).length, c.start, c.end, daysUntil(c.end) ?? '', c.status ?? '유효', c.sla ?? '', miss.length > 0 ? miss.join('·') : '완비']
        }),
      },
      {
        name: 'SW 라이선스',
        header: ['ID', '라이선스', '공급사', '근거 계약', '보유', '사용', '차이', '단가', '만료일', '판정'],
        rows: s.licenses.map((l) => {
          const gap = l.used - l.purchased
          return [
            l.id, l.name, l.vendor, l.contractId ?? '미연계', l.purchased, l.used, gap, l.unitCost, l.expiry,
            l.status === '해지' ? '해지' : gap > 0 ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정',
          ]
        }),
      },
      {
        // 라이선스 좌석 대사(STEP2) — EDR 설치 인벤토리와 배정 좌석 대사 결과. SAM 감사 증적(배정 밖 설치=무단 사용, 미설치 좌석=회수 후보).
        name: '라이선스 좌석 대사',
        header: ['ID', '라이선스', '보유', '배정 좌석', '설치 관측', '일치', '배정 밖 설치', '미설치 좌석', '최근 수집'],
        rows: buildLicenseUsage().rows.map((r) => [
          r.id, r.name, r.purchased, r.seatCount, r.installCount, r.matched, r.offSeat.length, r.unusedSeat.length, r.collectedAt ?? '-',
        ]),
      },
    ]
  }

  if (kind === 'disposals') {
    // 폐기 증적 대장 — 감사 대응용. 대상 선정~완료 전 단계와 소거 방식·확인서 번호를 한 장에 남긴다.
    return [{
      name: '폐기 증적 대장',
      header: ['폐기번호', '자산번호', '모델', '폐기 사유', '상태', '소거 방식', '처분 방식', '매각 대금', '소거일', '처리자', '확인서 번호', '증적', '증적 사진 수'],
      rows: s.disposals.map((d) => [
        d.id, d.assetNo, d.model, d.reason, d.status,
        d.wipeMethod ?? '', d.disposition ?? '', d.proceeds ?? '', d.wipedAt ?? '', d.wipedBy ?? '', d.certNo ?? '', d.evidence ?? '', d.photos?.length ?? 0,
      ]),
    }]
  }

  if (kind === 'loans') {
    // 대여(반출) 대장 — 감사 대응용. 반출 중인 자산이 누구에게·언제까지 나가 있는지, 연체 여부를 한 장에 남긴다.
    const rows = s.assets
      .filter((a) => a.status === '대여중')
      .map((a) => {
        const loanEv = [...a.history].reverse().find((h) => h.kind === '대여' && h.detail.includes('대여 —'))
          ?? [...a.history].reverse().find((h) => h.kind === '대여')
        const d = a.loanDueDate ? daysUntil(a.loanDueDate) : null
        const state = d === null ? '기한 없음' : d < 0 ? `연체 ${-d}일` : d <= 7 ? `반환 임박 D-${d}` : '정상'
        return [a.assetNo, a.category, a.model, a.owner, a.dept, a.location, loanEv?.date ?? '', a.loanDueDate ?? '', d ?? '', state]
      })
      .sort((x, y) => (typeof x[8] === 'number' ? x[8] : 99_999) - (typeof y[8] === 'number' ? y[8] : 99_999))
    return [{
      name: '대여 대장',
      header: ['자산번호', '유형', '모델', '대여자', '부서', '위치', '대여일', '반환 기한', '잔여일', '상태'],
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
    const shadow = s.saas.filter((x) => !x.sanctioned)
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
        rows: s.saas.map((x) => [x.service, x.category, x.dept, x.users, x.sanctioned ? '인가' : '미인가', x.risk, x.monthlyVisits]),
      },
      {
        name: '부서별 미인가 노출',
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
      rows: s.saasCatalog.map((x) => [x.service, x.category, x.vendor, x.status, x.dataGrade, x.owner, x.decidedAt ?? '-', x.reviewSince ?? '-', x.decidedBy ?? '-']),
    }]
  }

  // approvals — 결재함(ApprovalList)의 상태·구분·검색·내 상신만 필터를 그대로 반영
  const t = today()
  const aq = (filter?.q ?? '').trim().toLowerCase()
  const astatus = filter?.status ?? '전체'
  const akind = filter?.akind ?? '전체'
  const amine = Boolean(filter?.mine)
  return [{
    name: '결재 이력',
    header: ['문서번호', '구분', '제목', '기안자', '부서', '기안일', '상태', '현재단계', '대기 경과일', '결재자', '결재일', '반려 사유', '연결', '집행'],
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
      .map((a) => [
        a.id, a.kind, a.title, a.requester, a.dept, a.requestedAt, a.status, a.currentStep,
        // 대기 경과일 — 대기 결재의 상신 후 경과일. SLA(3일) 초과면 '지연' 표기로 정체 결재를 감사 반출에 드러낸다.
        a.status === '대기' ? `${approvalAgeDays(a.requestedAt, t)}일${isApprovalOverdue(a, t, s.opsPolicy.approvalSlaDays) ? ' · 지연' : ''}` : '',
        a.decidedBy ?? '', a.decidedAt ?? '', a.rejectReason ?? '', a.refId ?? '', a.fulfilled ? '집행완료' : '',
      ]),
  }]
}
