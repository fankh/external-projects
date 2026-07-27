'use client'

/** 구매·발주 요청 — 다중선택 + QCR 발행 / PO 조건 발주 (N3b 복구). */
import { won as wonFmt, sortMoney, type Money } from '@/lib/money'
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { createPo, issueQcr, type ActState } from './actions'

export interface PrRow {
  code: string; name: string; supplierCode: string; supplier: string
  qty: number; onHand: number; reserved: number; available: number
  price: Money; requiredDate: string
}

// 18.65 — 마스킹된 단가는 '100000~' 문자열로도 온다. 숫자로 가정하면 ₩NaN 이 찍힌다.
const won = (v: Money) => wonFmt(v, true)

export function PrGrid({ rows }: { rows: PrRow[] }) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [terms, setTerms] = useState('FOB')
  const [transport, setTransport] = useState('육상')
  const [minQty, setMinQty] = useState('1')
  const [cert, setCert] = useState(false)
  const [note, setNote] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()

  const codes = () => [...selected].map(String)
  const cols: GridColumn<PrRow>[] = [
    { key: 'code', header: t('purch.code', '코드'), width: 110, code: true, render: (r) => r.code },
    { key: 'name', header: t('cpq.name', '품명'), render: (r) => r.name },
    { key: 'supplier', header: t('price.supplier', '공급처'), width: 110, render: (r) => r.supplier || '—' },
    { key: 'qty', header: t('purch.reqQty', '소요'), width: 56, align: 'right', sortValue: (r) => r.qty, render: (r) => r.qty },
    { key: 'onhand', header: t('purch.onHand', '보유'), width: 56, align: 'right', sortValue: (r) => r.onHand, render: (r) => r.onHand },
    { key: 'avail', header: t('purch.available', '가용'), width: 56, align: 'right', sortValue: (r) => r.available, render: (r) => <b style={{ color: r.available >= r.qty ? 'var(--ok)' : 'var(--err)' }}>{r.available}</b> },
    // 18.75 — 이 화면의 `price: null` 은 **재고 충족이라 조달 단가를 조회하지 않았다**는 뜻이다.
    // 18.65 에서 공용 포맷터를 넣으며 null 을 일괄 '가려짐(••••)' 으로 찍게 만든 것은 내 회귀다.
    // 같은 null 이라도 자리마다 뜻이 다르므로, 뜻을 아는 필드(stockOk)로 갈라 쓴다.
    { key: 'price', header: t('price.priceLbl', '단가'), width: 100, align: 'right', sortValue: (r) => sortMoney(r.price),
      render: (r) => r.available >= r.qty ? <span style={{ color: 'var(--txt-mute)' }}>—</span> : won(r.price) },
    { key: 'req', header: t('purch.reqDate', '소요일'), width: 72, align: 'center', render: (r) => r.requiredDate || '—' },
    { key: 'stock', header: t('purch.stockJudge', '재고판정'), width: 76, align: 'center', sortValue: (r) => (r.available >= r.qty ? 1 : 0), render: (r) => r.available >= r.qty ? <Chip tone="ok">{t('purch.stockOk', '충족')}</Chip> : <Chip tone="warn">{t('purch.flowOrder', '발주')}</Chip> },
  ]

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <span style={{ color: 'var(--txt-dim)' }}>{t('purch.selectedItems', '선택 {n}품목').replace('{n}', String(selected.size))}</span>
        <input className="in" style={{ width: 120 }} placeholder={t('purch.qcrNotePh', 'QCR 비고')} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await issueQcr(codes(), note); setSt(r); if (r.ok) setSelected(new Set())
        })}>{t('purch.qcrBtn', 'QCR 발행 (견적 요청)')}</button>
        <span className="sep" />
        <select className="in" style={{ width: 70 }} value={terms} onChange={(e) => setTerms(e.target.value)}>
          {[['FOB', 'FOB'], ['CIF', 'CIF'], ['DDP', 'DDP'], ['착불', t('po.collect', '착불')]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="in" style={{ width: 64 }} value={transport} onChange={(e) => setTransport(e.target.value)}>
          {[['육상', t('po.land', '육상')], ['해상', t('po.sea', '해상')], ['항공', t('po.air', '항공')]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="in" style={{ width: 60 }} title={t('purch.minQty', '최소 발주 수량')} value={minQty} onChange={(e) => setMinQty(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <input type="checkbox" checked={cert} onChange={(e) => setCert(e.target.checked)} />{t('purch.cert', '성적서')}
        </label>
        <button className="b run" disabled={pending} onClick={() => start(async () => {
          const r = await createPo(codes(), {
            deliveryTerms: terms, transport, minOrderQty: Math.max(1, Number(minQty) || 1), certRequired: cert,
          })
          setSt(r); if (r.ok) setSelected(new Set())
        })}>{t('purch.poConfirm', 'PO 발주 확정')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pr" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.code} multiSelect selectedKeys={selected} onSelectionChange={setSelected}
          emptyText={t('purch.empty', '발주 요청 품목이 없습니다')} />
      </div>
    </div>
  )
}
