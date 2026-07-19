'use client'

/** 발주 라이프사이클 패널 (N3b) — 생성 폼 + 상세(라인·승인·입고 GR). */
import { useActionState, useState, useTransition } from 'react'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { approvePo, createPoOrder, receivePo, type ActState } from './actions'

export interface PoItem {
  poItemId: number; itemCode: string; itemName: string; orderQty: number
  unitPrice: number; receivedQty: number; remaining: number
}
export interface PoDetail {
  poNo: string; supplier: string; status: string; statusLabel: string
  orderDate: string; expectedDate: string | null; note: string; items: PoItem[]
}

export function PoCreateForm() {
  const { t } = useI18n()
  const perm = usePermission()
  const [st, action, pending] = useActionState(createPoOrder, {} as ActState)
  return (
    <RegisterModal disabled={!perm.canWrite('erp-po')} disabledTitle={perm.denyWrite}
          trigger={t('po.createBtn', '＋ 발주 생성')} title={t('po.createTitle', '발주 생성')} ok={st.ok} width={440}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('po.supplier', '공급처')}</label>
          <input className="in" name="supplier" autoFocus />
          <label>{t('po.expected', '예정일')}</label>
          <input className="in" name="expectedDate" placeholder={t('po.expectedPh', '예정일 YYYY-MM-DD')} />
          <label>{t('po.note', '비고')}</label>
          <input className="in" name="note" />
          <label style={{ alignSelf: 'start', marginTop: 4 }}>{t('po.item', '품목')}</label>
          <textarea className="in" name="items" placeholder={t('po.itemsPh', '품명,수량,단가 (줄당 1건)\n예: 임펠러 #450,2,120000')}
            style={{ height: 60, fontSize: 10.5, resize: 'vertical' }} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
            {st.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{st.error}</span> : null}
            <button className="b run" type="submit" disabled={pending}>{t('common.register', '등록')}</button>
          </div>
        </form>
      )}
    </RegisterModal>
  )
}

export function PoDetailPanel({ detail }: { detail: PoDetail }) {
  const { t } = useI18n()
  const [qty, setQty] = useState<Record<number, string>>({})
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const receivable = detail.status === 'APPROVED' || detail.status === 'PARTIAL'

  return (
    <div className="gb" style={{ padding: 6, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <b style={{ color: 'var(--title-navy)' }}>{detail.poNo}</b>
        <Chip tone={detail.status === 'DONE' ? 'ok' : detail.status === 'DRAFT' ? 'info' : 'warn'}>{detail.statusLabel || detail.status}</Chip>
        <span style={{ color: 'var(--txt-dim)' }}>{detail.supplier || '—'} · {t('po.order', '발주')} {detail.orderDate}</span>
        {detail.status === 'DRAFT' ? (
          <button className="b run" disabled={pending}
            onClick={() => start(async () => setSt(await approvePo(detail.poNo)))}>{t('common.approve', '승인')}</button>
        ) : null}
      </div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>{t('po.item', '품목')}</th><th>{t('po.order', '발주')}</th><th>{t('po.receivedQty', '기입고')}</th><th>{t('po.rem', '잔여')}</th><th>{t('po.recvQty', '입고 수량')}</th></tr></thead>
        <tbody>{detail.items.map((it) => (
          <tr key={it.poItemId}>
            <td>{it.itemName}</td>
            <td className="c">{it.orderQty}</td>
            <td className="c">{it.receivedQty}</td>
            <td className="c">{it.remaining}</td>
            <td className="c">
              <input className="in" style={{ width: 52, textAlign: 'right' }} disabled={!receivable || it.remaining <= 0}
                value={qty[it.poItemId] ?? ''} placeholder={it.remaining > 0 ? String(it.remaining) : '—'}
                onChange={(e) => setQty((q) => ({ ...q, [it.poItemId]: e.target.value }))} />
            </td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="b run" disabled={pending || !receivable} onClick={() => start(async () => {
          const items = detail.items.map((it) => ({ poItemId: it.poItemId, qty: Number(qty[it.poItemId]) || 0 }))
          const r = await receivePo(detail.poNo, items)
          setSt(r); if (r.ok) setQty({})
        })}>{t('po.receiveBtn', '입고 처리 (GR)')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
    </div>
  )
}
