'use client'

/** MRP 자재 소요 계획 그리드 (U4·M-8-5) — 소요·보유·부족·발주 권장일 + 리드타임 조정. */
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface MrpRow {
  code: string; name: string; required: number; onHand: number; shortage: number
  dueDate: string; orderBy: string; orders: string[]; status: 'OK' | 'SHORT'
}
export interface MrpData { rows: MrpRow[]; orderCount: number; shortCount: number; leadDays: number }

export function MrpGrid({ data }: { data: MrpData }) {
  const { t } = useI18n()
  const router = useRouter()
  const [lead, setLead] = useState(data.leadDays)

  const cols: GridColumn<MrpRow>[] = [
    { key: 'code', header: t('mrp.code', '자재 코드'), width: 170, code: true, render: (r) => r.code },
    { key: 'name', header: t('mrp.name', '품명'), render: (r) => r.name || '—' },
    { key: 'required', header: t('mrp.required', '소요량'), width: 70, align: 'right', sortValue: (r) => r.required, render: (r) => r.required },
    { key: 'onHand', header: t('mrp.onHand', '보유'), width: 64, align: 'right', sortValue: (r) => r.onHand, render: (r) => r.onHand },
    { key: 'shortage', header: t('mrp.shortage', '부족'), width: 64, align: 'right', sortValue: (r) => r.shortage,
      render: (r) => r.shortage > 0 ? <b style={{ color: 'var(--err)' }}>{r.shortage}</b> : 0 },
    { key: 'status', header: t('common.status', '상태'), width: 62, align: 'center', sortValue: (r) => r.status,
      render: (r) => <Chip tone={r.status === 'SHORT' ? 'err' : 'ok'}>{r.status}</Chip> },
    { key: 'dueDate', header: t('mrp.dueDate', '최단 납기'), width: 84, align: 'center', render: (r) => r.dueDate || '—' },
    { key: 'orderBy', header: t('mrp.orderBy', '발주 권장일'), width: 88, align: 'center',
      render: (r) => r.shortage > 0 && r.orderBy ? <b>{r.orderBy}</b> : (r.orderBy || '—') },
    { key: 'orders', header: t('mrp.orders', '관련 수주'), width: 120, noSort: true,
      render: (r) => <span style={{ fontSize: 9.5 }}>{r.orders.join(', ')}</span> },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11 }}>
        <Chip tone="info">{t('mrp.orderCount', '수주')} {data.orderCount}</Chip>
        <Chip tone={data.shortCount > 0 ? 'err' : 'ok'}>{t('mrp.shortCount', '부족 품목')} {data.shortCount}</Chip>
        <span style={{ flex: 1 }} />
        <label>{t('mrp.leadDays', '리드타임(일)')}</label>
        <input className="in" type="number" min={0} max={90} value={lead} style={{ width: 56, height: 20, fontSize: 10.5, textAlign: 'right' }}
          onChange={(e) => setLead(Number(e.target.value) || 0)} />
        <button className="b" data-mrp-recalc style={{ height: 20, fontSize: 10.5 }}
          onClick={() => router.push(`/erp/mrp?lead=${lead}`)}>{t('mrp.recalc', '재산출')}</button>
        <button className="b" style={{ height: 20, fontSize: 10.5 }}
          onClick={() => router.push('/erp/purchase')}>{t('mrp.toPurchase', '발주 화면')}</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-mrp" colFilter columns={cols} rows={data.rows} rowKey={(r) => r.code}
          emptyText={t('mrp.empty', '수주(ORDERED) 자재 라인이 없습니다 — 수주 관리에서 견적을 수주 전환하십시오')} />
      </div>
    </div>
  )
}
