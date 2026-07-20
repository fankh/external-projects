'use client'

/** 견적 lifecycle 패널 (N3) — 발송/수주/실주 전이, 수주 시 계약금액·납기 입력. */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { deleteQuotation, transitionQuotation, type ActState } from './actions'

export interface QuotationRow {
  quotationId: number; quotationNo: string; total: number; currency: string
  status: string; date: string; project: string; customer: string
}

const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = { DRAFT: 'info', SENT: 'warn', ORDERED: 'ok', LOST: 'err' }

export function QuotationPanel({ rows }: { rows: QuotationRow[] }) {
  const { t } = useI18n()
  const [selId, setSelId] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [delivery, setDelivery] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.quotationId === selId) ?? null

  const cols: GridColumn<QuotationRow>[] = [
    { key: 'no', header: t('order.quoteNo', '견적번호'), width: 120, code: true, render: (r) => r.quotationNo },
    { key: 'proj', header: t('so.project', '프로젝트'), width: 100, render: (r) => r.project },
    { key: 'cust', header: t('order.customer', '고객'), width: 110, render: (r) => r.customer },
    { key: 'total', header: t('order.amount', '금액'), width: 100, align: 'right', sortValue: (r) => r.total, render: (r) => `${r.currency} ${Math.round(r.total).toLocaleString()}` },
    { key: 'date', header: t('so.date', '일자'), width: 84, align: 'center', render: (r) => r.date },
    { key: 'status', header: t('order.status', '상태'), width: 76, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={TONE[r.status] ?? 'info'}>{r.status}</Chip> },
  ]

  const run = (status: 'SENT' | 'ORDERED' | 'LOST') => {
    if (!sel) { setSt({ error: '견적을 선택하십시오' }); return }
    start(async () => {
      const r = await transitionQuotation(sel.quotationId, status,
        status === 'ORDERED' && amount ? Number(amount) : undefined,
        status === 'ORDERED' && delivery ? delivery : undefined)
      setSt(r)
      if (r.ok) { setSelId(null); setAmount(''); setDelivery('') }
    })
  }

  return (
    <div className="gb" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px' }}>{t('so.lifecycleTitle', '견적 Lifecycle — DRAFT→SENT→ORDERED/LOST')}</div>
      <div style={{ display: 'flex', gap: 4, padding: '0 6px 4px', alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `${t('so.selected', '선택')} ${sel.quotationNo} (${sel.status})` : t('so.clickSelect', '행 클릭=선택')}</span>
        <button className="b" disabled={pending || !sel || sel.status !== 'DRAFT'} onClick={() => run('SENT')}>{t('so.send', '발송')}</button>
        <input className="in" style={{ width: 110 }} placeholder={t('so.contractPh', '계약금액 (수주)')} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="in" style={{ width: 100 }} placeholder={t('so.deliveryPh', '납기 YYYY-MM-DD')} value={delivery} onChange={(e) => setDelivery(e.target.value)} />
        <button className="b run" disabled={pending || !sel || sel.status !== 'SENT'} onClick={() => run('ORDERED')}>{t('so.orderConvert', '수주 전환')}</button>
        <button className="b" disabled={pending || !sel || sel.status !== 'SENT'} onClick={() => run('LOST')}>{t('so.lost', '실주')}</button>
        <button className="b" data-quote-del disabled={pending || !sel || sel.status !== 'DRAFT'}
          title={t('so.delHint', 'DRAFT 견적만 삭제 가능 (발행/승인 보호)')}
          onClick={() => sel && start(async () => {
            const r = await deleteQuotation(sel.quotationId)
            setSt(r)
            if (r.ok) setSelId(null)
          })}>{t('common.delete', '삭제')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-quotations" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.quotationId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.quotationId)} emptyText={t('so.emptyQuotes', '견적이 없습니다')} />
      </div>
    </div>
  )
}
