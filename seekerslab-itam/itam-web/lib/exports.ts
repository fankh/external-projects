import { daysUntil } from './dates'
import { can } from './perm'
import { getStore } from './store'
import type { PermMenu, Role } from './types'
import type { Sheet } from './xlsx'

/** 엑셀 내보내기 대상 — 권한 매트릭스의 '엑셀' 기능이 걸리는 화면과 1:1 대응한다.
 *  (제품안내서 §02: 권한은 메뉴(화면) × 기능(버튼) 단위로 부여) */
export const EXPORT_KINDS = ['assets', 'stock', 'discovered', 'contracts', 'approvals', 'disposals', 'loans'] as const
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
}

export function canExport(kind: ExportKind, role: Role): boolean {
  return can(EXPORT_META[kind].menu, '엑셀', role)
}

/** 내보내기 데이터 — 화면에 보이는 것과 같은 권한 필터를 통과시킨다.
 *  화면에서 못 보는 자산이 엑셀로 새어 나가면 권한 모델이 무의미해진다. */
export function buildSheets(kind: ExportKind, role: Role, userName: string, filter?: { q?: string; cat?: string }): Sheet[] {
  const s = getStore()

  if (kind === 'assets') {
    // 화면(자산 대장)의 검색·유형 필터를 그대로 반영 — 좁혀 본 그 집합을 반출한다
    const q = (filter?.q ?? '').trim().toLowerCase()
    const cat = filter?.cat ?? '전체'
    const rows = (role === 'USER' ? s.assets.filter((a) => a.owner === userName) : s.assets)
      .filter((a) => {
        if (cat !== '전체' && a.category !== cat) return false
        if (!q) return true
        return [a.assetNo, a.model, a.owner, a.dept, a.ip, a.serial, a.location].some((f) => f?.toLowerCase().includes(q))
      })
      .map((a) => [
        a.assetNo, a.category, a.model, a.serial, a.status, a.owner, a.dept, a.location,
        a.os ?? '', a.cpu ?? '', a.memory ?? '', a.ip ?? '', a.mac ?? '',
        a.purchaseDate, a.warrantyEnd, a.contractId ?? '', a.discoveredVia ?? '', a.history.length,
      ])
    return [{
      name: '자산 대장',
      header: ['자산번호', '유형', '모델', 'S/N', '상태', '소유자', '부서', '위치', 'OS', 'CPU', '메모리', 'IP', 'MAC', '구매일', '보증만료', '계약', '발견채널', '이력건수'],
      rows,
    }]
  }

  if (kind === 'stock') {
    // 재고는 집계가 본질이므로 유형별·부서별·위치별 3장으로 나눈다
    const live = s.assets.filter((a) => a.status !== '폐기완료')
    const agg = (key: (a: (typeof live)[number]) => string) => {
      const m = new Map<string, { total: number; inUse: number; idle: number }>()
      for (const a of live) {
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
    return [
      { name: '유형별', header, rows: agg((a) => a.category) },
      { name: '부서별', header, rows: agg((a) => a.dept) },
      { name: '위치별', header, rows: agg((a) => a.location) },
    ]
  }

  if (kind === 'discovered') {
    const obsBy = new Map<string, number>()
    for (const o of s.observations) obsBy.set(o.discoveredId, (obsBy.get(o.discoveredId) ?? 0) + 1)
    return [
      {
        name: '발견 자산',
        header: ['발견ID', '지문', '호스트명', '유형', 'IP', 'MAC', '최초발견채널', '관측건수', '최초발견', '최근실측', '대사상태', '위험도', '대사자산', '소유자후보', '처리', '비고'],
        rows: s.discovered.map((d) => [
          d.id, d.fingerprint ?? '', d.hostname, d.type, d.ip, d.mac, d.channel, obsBy.get(d.id) ?? 0,
          d.firstSeen, d.lastSeen, d.state, d.risk, d.matchedAssetNo ?? '', d.ownerCandidate ?? '',
          d.action ?? '', d.note ?? '',
        ]),
      },
      {
        name: '채널별 관측',
        header: ['관측ID', '발견ID', '채널', '호스트명', 'IP', 'MAC', '관측시각', '내용'],
        rows: s.observations.map((o) => [o.id, o.discoveredId, o.channel, o.hostname, o.ip, o.mac, o.seenAt, o.detail]),
      },
    ]
  }

  if (kind === 'contracts') {
    return [
      {
        name: '계약',
        header: ['계약번호', '구분', '계약명', '공급사', '주관부서', '금액', '자산수', '시작일', '만료일', '잔여일'],
        rows: s.contracts.map((c) => [c.id, c.kind, c.name, c.vendor, c.ownerDept, c.amount, c.assetCount, c.start, c.end, daysUntil(c.end) ?? '']),
      },
      {
        name: 'SW 라이선스',
        header: ['ID', '라이선스', '공급사', '보유', '사용', '차이', '단가', '만료일', '판정'],
        rows: s.licenses.map((l) => {
          const gap = l.used - l.purchased
          return [
            l.id, l.name, l.vendor, l.purchased, l.used, gap, l.unitCost, l.expiry,
            gap > 0 ? '초과 사용' : l.used / l.purchased < 0.6 ? '미사용 보유' : '적정',
          ]
        }),
      },
    ]
  }

  if (kind === 'disposals') {
    // 폐기 증적 대장 — 감사 대응용. 대상 선정~완료 전 단계와 소거 방식·확인서 번호를 한 장에 남긴다.
    return [{
      name: '폐기 증적 대장',
      header: ['폐기번호', '자산번호', '모델', '폐기 사유', '상태', '소거 방식', '소거일', '처리자', '확인서 번호', '증적', '증적 사진 수'],
      rows: s.disposals.map((d) => [
        d.id, d.assetNo, d.model, d.reason, d.status,
        d.wipeMethod ?? '', d.wipedAt ?? '', d.wipedBy ?? '', d.certNo ?? '', d.evidence ?? '', d.photos?.length ?? 0,
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

  // approvals
  return [{
    name: '결재 이력',
    header: ['문서번호', '구분', '제목', '기안자', '부서', '기안일', '상태', '현재단계', '결재자', '결재일', '연결', '집행'],
    rows: s.approvals.map((a) => [
      a.id, a.kind, a.title, a.requester, a.dept, a.requestedAt, a.status, a.currentStep,
      a.decidedBy ?? '', a.decidedAt ?? '', a.refId ?? '', a.fulfilled ? '집행완료' : '',
    ]),
  }]
}
