/** D2 재고 관리 (Inventory) — 발주가 재고가 되는 고리(PO→MI).
 *  재고 조회(품목×위치)·입고 처리·입출고 이력. Stock Check 는 이 재고를 기반으로 판정. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { inventoryService, type MovementRow, type StockRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

export function InventoryScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [stock, setStock] = useState<StockRow[]>([])
  const [moves, setMoves] = useState<MovementRow[]>([])
  const [item, setItem] = useState('')
  const [loc, setLoc] = useState('GEN-A01')
  const [qty, setQty] = useState('1')

  const load = useCallback(() => {
    void inventoryService.stock().then((r) => { if (r) setStock(r) })
    void inventoryService.movements().then((r) => { if (r) setMoves(r) })
  }, [])
  useEffect(() => { load() }, [load])

  const inbound = useCallback(() => {
    const q = Number(qty)
    if (!item.trim() || !loc.trim() || !(q > 0)) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수 — 품목·위치·수량(&gt;0)</span>)
      return
    }
    void inventoryService.inbound({ itemCode: item.trim(), locationCode: loc.trim(), quantity: q, refNo: 'MI' })
      .then((onHand) => {
        if (onHand === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        shell.setStatusMsg(`입고 처리 ✓ — ${item.trim()} +${q} @ ${loc.trim()} (재고 ${onHand}, inv_movement IN)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [item, loc, qty, load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F12: inbound }), [load, inbound]))

  const sCols: GridColumn<StockRow>[] = [
    { key: 'code', header: t('inv.item', '품목'), width: 100, code: true, render: (r) => r.itemCode },
    { key: 'name', header: t('inv.name', '품명'), render: (r) => r.itemName },
    { key: 'loc', header: t('inv.location', '위치'), width: 110, render: (r) => r.locationName },
    { key: 'qty', header: t('inv.qty', '수량'), width: 70, align: 'right', render: (r) => `${r.quantity} ${r.unit}` },
    { key: 'upd', header: t('inv.updated', '갱신'), width: 120, align: 'center', render: (r) => r.updatedAt },
  ]
  const mCols: GridColumn<MovementRow>[] = [
    { key: 'at', header: t('inv.at', '일시'), width: 90, align: 'center', render: (r) => r.at },
    { key: 'code', header: t('inv.item', '품목'), width: 100, code: true, render: (r) => r.itemCode },
    { key: 'loc', header: t('inv.location', '위치'), width: 90, render: (r) => r.locationCode },
    { key: 'type', header: t('inv.type', '구분'), width: 50, align: 'center', render: (r) => <Chip tone={r.type === 'IN' ? 'ok' : 'warn'}>{r.type}</Chip> },
    { key: 'qty', header: t('inv.qty', '수량'), width: 60, align: 'right', render: (r) => r.quantity },
    { key: 'ref', header: 'Ref', width: 70, align: 'center', render: (r) => r.refNo ?? r.refType ?? '-' },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('inv.inbound', '입고 처리')}</label>
        <input className="in req" style={{ width: 90 }} value={item} placeholder="품목코드" aria-label="품목"
          onChange={(e) => setItem(e.target.value)} />
        <label>{t('inv.location', '위치')}</label>
        <input className="in" style={{ width: 90 }} value={loc} aria-label="위치"
          onChange={(e) => setLoc(e.target.value)} />
        <label>{t('inv.qty', '수량')}</label>
        <input className="in req" style={{ width: 56 }} value={qty} aria-label="수량"
          onChange={(e) => setQty(e.target.value)} />
        <Btn variant="pri" onClick={inbound}>{t('inv.inboundF12', '입고 F12')}</Btn>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 6, gap: 6 }}>
        <GroupBox style={{ flex: 1.3 }} noPad
          title={t('inv.stockTitle', '재고 현황 — 품목×위치 (inv_stock)')}
          right={<span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{stock.length}종</span>}>
          {stock.length ? (
            <DenseGrid columns={sCols} rows={stock} rowKey={(r) => `${r.itemCode}@${r.locationCode}`}
              onRowClick={(r) => { setItem(r.itemCode); setLoc(r.locationCode) }} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('inv.noStock', '재고 없음 — 입고 처리하면 표시됩니다 (발주→입고 MI)')}
            </div>
          )}
        </GroupBox>
        <GroupBox style={{ width: 400 }} noPad title={t('inv.moveTitle', '입출고 이력 (inv_movement)')}>
          <DenseGrid columns={mCols} rows={moves} rowKey={(_, i) => i} />
        </GroupBox>
      </div>
    </div>
  )
}
