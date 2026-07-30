import { daysUntil } from './dates'
import { getStore } from './store'
import type { Role } from './types'
import type { Sheet } from './xlsx'

/** 엑셀 내보내기 대상 — 권한 매트릭스의 '엑셀' 기능이 걸리는 화면과 1:1 대응한다.
 *  (제품안내서 §02: 권한은 메뉴(화면) × 기능(버튼) 단위로 부여) */
export const EXPORT_KINDS = ['assets', 'stock', 'discovered', 'contracts', 'approvals'] as const
export type ExportKind = (typeof EXPORT_KINDS)[number]

export const EXPORT_META: Record<ExportKind, { label: string; file: string; roles: Role[] }> = {
  assets: { label: '자산 대장', file: '자산대장', roles: ['ASSET_MGR', 'SEC_MGR', 'ADMIN'] },
  stock: { label: '재고 현황', file: '재고현황', roles: ['ASSET_MGR', 'ADMIN'] },
  discovered: { label: '발견 자산', file: '발견자산', roles: ['ASSET_MGR', 'SEC_MGR', 'ADMIN'] },
  contracts: { label: '계약 · 라이선스', file: '계약라이선스', roles: ['ASSET_MGR', 'SEC_MGR', 'ADMIN'] },
  approvals: { label: '결재 이력', file: '결재이력', roles: ['ASSET_MGR', 'SEC_MGR', 'ADMIN'] },
}

export function canExport(kind: ExportKind, role: Role): boolean {
  return EXPORT_META[kind].roles.includes(role)
}

/** 내보내기 데이터 — 화면에 보이는 것과 같은 권한 필터를 통과시킨다.
 *  화면에서 못 보는 자산이 엑셀로 새어 나가면 권한 모델이 무의미해진다. */
export function buildSheets(kind: ExportKind, role: Role, userName: string): Sheet[] {
  const s = getStore()

  if (kind === 'assets') {
    const rows = (role === 'USER' ? s.assets.filter((a) => a.owner === userName) : s.assets)
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
