'use client'

/** 재고 심화 패널 (N3b) — ATP·예약(등록/해제)·입출고 이력. */
import { useState, useTransition } from 'react'
import { GroupBox } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { releaseReservation, reserveStock, setLotExpiry, type ActState } from './stockActions'

export interface AtpRow { itemCode: string; itemName: string; onHand: number; reserved: number; available: number }
export interface ReservationRow { reservationId: number; itemCode: string; quantity: number; refType: string | null; refNo: string | null; status: string; createdAt: string }
export interface MovementRow { moveId: number; itemCode: string; moveType: string; quantity: number; lotNo: string | null; refNo: string | null; movedAt: string }
export interface LotRow { itemCode: string; lotNo: string; serialNo: string; locationCode: string; balance: number; lastAt: string; expiry: string; expiryStatus: '' | 'OK' | 'EXPIRING' | 'EXPIRED' }

export function StockPanels({ atp, reservations, movements, lots }: {
  atp: AtpRow[]; reservations: ReservationRow[]; movements: MovementRow[]; lots: LotRow[]
}) {
  const { t } = useI18n()
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('')
  const [ref, setRef] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  return (
    <div style={{ display: 'flex', gap: 6, minHeight: 0, flex: 1 }}>
      <GroupBox title={`${t('inv.atpPanel', '가용재고 ATP')} — ${atp.length}종`} noPad style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>{t('inv.item', '품목')}</th><th>{t('inv.onHand', '보유')}</th><th>{t('inv.reserved', '예약')}</th><th>{t('inv.available', '가용')}</th></tr></thead>
          <tbody>{atp.map((r) => (
            <tr key={r.itemCode}><td className="code">{r.itemCode}</td><td className="c">{r.onHand}</td>
              <td className="c">{r.reserved}</td><td className="c"><b style={{ color: r.available > 0 ? 'var(--run)' : 'var(--err)' }}>{r.available}</b></td></tr>
          ))}</tbody>
        </table>
      </GroupBox>
      <GroupBox title={`${t('inv.resvPanel', '재고 예약')} — ${reservations.length}건 (ACTIVE)`} noPad style={{ flex: 1.2, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <table className="g" style={{ width: '100%' }}>
            <thead><tr><th>#</th><th>{t('inv.item', '품목')}</th><th>{t('inv.qty', '수량')}</th><th>{t('inv.refCol', '참조')}</th><th></th></tr></thead>
            <tbody>{reservations.length ? reservations.map((r) => (
              <tr key={r.reservationId}>
                <td className="c">{r.reservationId}</td><td className="code">{r.itemCode}</td>
                <td className="c">{r.quantity}</td><td className="c">{r.refNo || '—'}</td>
                <td className="c"><button className="b" disabled={pending} style={{ height: 17, fontSize: 10 }}
                  onClick={() => start(async () => setSt(await releaseReservation(r.reservationId)))}>{t('inv.release', '해제')}</button></td>
              </tr>
            )) : <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('inv.noResvShort', '예약 없음')}</td></tr>}</tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: 4, borderTop: '1px solid var(--line)', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="in" style={{ width: 90 }} placeholder={t('inv.itemPh', '품목 코드')} value={item} onChange={(e) => setItem(e.target.value)} />
          <input className="in" style={{ width: 48, textAlign: 'right' }} placeholder={t('inv.qty', '수량')} value={qty} onChange={(e) => setQty(e.target.value)} />
          <input className="in" style={{ width: 84 }} placeholder={t('inv.refPh', '참조 (WO 등)')} value={ref} onChange={(e) => setRef(e.target.value)} />
          <button className="b run" disabled={pending} onClick={() => start(async () => {
            const r = await reserveStock(item, Number(qty) || 0, ref)
            setSt(r); if (r.ok) { setItem(''); setQty(''); setRef('') }
          })}>{t('inv.addResv', '＋ 예약')}</button>
          {st.error ? <span style={{ fontSize: 10.5, color: 'var(--err)' }}>{st.error}</span> : null}
          {st.ok ? <span style={{ fontSize: 10.5, color: 'var(--run)' }}>{st.ok}</span> : null}
        </div>
      </GroupBox>
      <LotExpiryPanel lots={lots} />
      <GroupBox title={`${t('inv.movePanel', '입출고 이력 (Lot 추적)')} — ${t('inv.recent', '최근')} ${movements.length}건`} noPad style={{ flex: 1.2, minHeight: 0, overflow: 'auto' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>{t('inv.item', '품목')}</th><th>{t('inv.type', '구분')}</th><th>{t('inv.qty', '수량')}</th><th>Lot</th><th>{t('inv.refCol', '참조')}</th><th>{t('inv.at', '일시')}</th></tr></thead>
          <tbody>{movements.length ? movements.map((m) => (
            <tr key={m.moveId}><td className="code">{m.itemCode}</td><td className="c">{m.moveType}</td>
              <td className="c">{m.quantity}</td><td className="c">{m.lotNo || '—'}</td>
              <td className="c">{m.refNo || '—'}</td><td className="c">{m.movedAt}</td></tr>
          )) : <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('inv.noTrace', '이력 없음')}</td></tr>}</tbody>
        </table>
      </GroupBox>
    </div>
  )
}

/** U5 로트 유통기한 패널 — 만료(EXPIRED)/임박(EXPIRING 30일) 경고 + 기한 설정. */
function LotExpiryPanel({ lots }: { lots: LotRow[] }) {
  const { t } = useI18n()
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const key = (r: LotRow) => `${r.itemCode}|${r.lotNo}`
  const tone = (s: string) => s === 'EXPIRED' ? 'var(--err)' : s === 'EXPIRING' ? 'var(--warn, #B4820B)' : 'var(--run)'
  const withLot = lots.filter((r) => r.lotNo)
  return (
    <GroupBox title={`${t('inv.lotPanel', 'Lot 유통기한')} — ${withLot.length}건`} noPad style={{ flex: 1.2, minHeight: 0, overflow: 'auto' }} data-lot-panel>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>{t('inv.item', '품목')}</th><th>Lot</th><th>{t('inv.balance', '잔량')}</th><th>{t('inv.expiry', '유통기한')}</th><th></th></tr></thead>
        <tbody>{withLot.length ? withLot.map((r) => (
          <tr key={key(r)}>
            <td className="code">{r.itemCode}</td><td className="c">{r.lotNo}</td><td className="c">{r.balance}</td>
            <td className="c">
              {r.expiry ? <span style={{ color: tone(r.expiryStatus), fontWeight: r.expiryStatus !== 'OK' ? 700 : 400 }}>{r.expiry}{r.expiryStatus === 'EXPIRED' ? ' ⚠' : r.expiryStatus === 'EXPIRING' ? ' !' : ''}</span> : '—'}
            </td>
            <td className="c" style={{ whiteSpace: 'nowrap' }}>
              <input className="in" type="date" value={edit[key(r)] ?? r.expiry} style={{ width: 108, height: 17, fontSize: 9.5 }}
                onChange={(e) => setEdit((m) => ({ ...m, [key(r)]: e.target.value }))} />
              <button className="b" data-lot-save disabled={pending} style={{ height: 17, fontSize: 9.5, marginLeft: 2 }}
                onClick={() => start(async () => setSt(await setLotExpiry(r.itemCode, r.lotNo, edit[key(r)] ?? r.expiry)))}>{t('common.save', '저장')}</button>
            </td>
          </tr>
        )) : <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('inv.noLots', 'Lot 재고 없음')}</td></tr>}</tbody>
      </table>
      {st.error ? <div style={{ padding: 4, fontSize: 10, color: 'var(--err)' }}>{st.error}</div> : null}
      {st.ok ? <div style={{ padding: 4, fontSize: 10, color: 'var(--run)' }}>{st.ok}</div> : null}
    </GroupBox>
  )
}
