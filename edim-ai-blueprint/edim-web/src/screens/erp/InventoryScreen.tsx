/** D2 재고 관리 (Inventory) — 발주가 재고가 되는 고리(PO→MI).
 *  재고 조회(품목×위치)·입고 처리·입출고 이력. Stock Check 는 이 재고를 기반으로 판정. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { inventoryService, type AtpRow, type LotRow, type MovementRow, type ReservationRow, type StockRow } from '../../api/services'
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
  const [atp, setAtp] = useState<AtpRow[]>([])
  const [resv, setResv] = useState<ReservationRow[]>([])
  const [item, setItem] = useState('')
  const [loc, setLoc] = useState('GEN-A01')
  const [qty, setQty] = useState('1')
  const [lotNo, setLotNo] = useState('')
  const [serialNo, setSerialNo] = useState('')
  const [lots, setLots] = useState<LotRow[]>([])
  const [trace, setTrace] = useState<MovementRow[]>([])
  const [traceKey, setTraceKey] = useState<string | null>(null)

  const load = useCallback(() => {
    void inventoryService.stock().then((r) => { if (r) setStock(r) })
    void inventoryService.movements().then((r) => { if (r) setMoves(r) })
    void inventoryService.atp().then((r) => { if (r) setAtp(r) })
    void inventoryService.reservations('ACTIVE').then((r) => { if (r) setResv(r) })
    void inventoryService.lots().then((r) => { if (r) setLots(r) })
  }, [])
  useEffect(() => { load() }, [load])

  const showTrace = useCallback((r: LotRow) => {
    const key = `${r.itemCode}|${r.lotNo}|${r.serialNo}`
    setTraceKey(key)
    void inventoryService.trace({ item: r.itemCode, lot: r.lotNo || undefined, serial: r.serialNo || undefined })
      .then((m) => setTrace(m ?? []))
  }, [])

  const inbound = useCallback(() => {
    const q = Number(qty)
    if (!item.trim() || !loc.trim() || !(q > 0)) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수 — 품목·위치·수량(&gt;0)</span>)
      return
    }
    void inventoryService.inbound({
      itemCode: item.trim(), locationCode: loc.trim(), quantity: q, refNo: 'MI',
      lotNo: lotNo.trim() || undefined, serialNo: serialNo.trim() || undefined,
    })
      .then((onHand) => {
        if (onHand === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        const tr = [lotNo.trim() && `Lot ${lotNo.trim()}`, serialNo.trim() && `S/N ${serialNo.trim()}`].filter(Boolean).join(' · ')
        shell.setStatusMsg(`입고 처리 ✓ — ${item.trim()} +${q} @ ${loc.trim()}${tr ? ` (${tr})` : ''} (재고 ${onHand}, inv_movement IN)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [item, loc, qty, lotNo, serialNo, load, shell])

  const reserve = useCallback(() => {
    const q = Number(qty)
    if (!item.trim() || !(q > 0)) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수 — 품목·수량(&gt;0)</span>)
      return
    }
    void inventoryService.reserve({ itemCode: item.trim(), quantity: q, refType: 'SO', refNo: 'MI-RES' })
      .then((r) => { load(); shell.setStatusMsg(`예약 ✓ — ${item.trim()} ${q} (가용 ${r.available})`) })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [item, qty, load, shell])

  const releaseResv = useCallback((id: number) => {
    void inventoryService.release(id)
      .then((r) => { load(); shell.setStatusMsg(`예약 해제 ✓ — #${id} (가용 ${r.available})`) })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F12: inbound }), [load, inbound]))

  const aCols: GridColumn<AtpRow>[] = [
    { key: 'code', header: t('inv.item', '품목'), width: 110, code: true, render: (r) => r.itemCode },
    { key: 'name', header: t('inv.name', '품명'), render: (r) => r.itemName },
    { key: 'onHand', header: t('inv.onHand', '보유'), width: 64, align: 'right', render: (r) => r.onHand },
    { key: 'reserved', header: t('inv.reserved', '예약'), width: 64, align: 'right', render: (r) => r.reserved },
    { key: 'available', header: t('inv.available', '가용'), width: 64, align: 'right', sortValue: (r) => r.available, render: (r) => <b style={{ color: r.available > 0 ? 'var(--run)' : 'var(--err)' }}>{r.available}</b> },
  ]
  const rCols: GridColumn<ReservationRow>[] = [
    { key: 'code', header: t('inv.item', '품목'), width: 100, code: true, render: (r) => r.itemCode },
    { key: 'qty', header: t('inv.qty', '수량'), width: 56, align: 'right', render: (r) => r.quantity },
    { key: 'ref', header: 'Ref', width: 70, align: 'center', render: (r) => r.refNo ?? r.refType ?? '-' },
    { key: 'at', header: t('inv.at', '일시'), width: 86, align: 'center', render: (r) => r.at },
    { key: 'act', header: '', width: 52, align: 'center', noSort: true, render: (r) => <Btn style={{ height: 18, fontSize: 9.5 }} onClick={() => releaseResv(r.reservationId)}>{t('inv.release', '해제')}</Btn> },
  ]

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
    { key: 'lot', header: 'Lot/SN', width: 84, render: (r) => r.lotNo || r.serialNo || '—' },
    { key: 'ref', header: 'Ref', width: 60, align: 'center', render: (r) => r.refNo ?? r.refType ?? '-' },
  ]
  const lCols: GridColumn<LotRow>[] = [
    { key: 'code', header: t('inv.item', '품목'), width: 96, code: true, render: (r) => r.itemCode },
    { key: 'lot', header: 'Lot', width: 84, render: (r) => r.lotNo || '—' },
    { key: 'sn', header: 'Serial', width: 96, render: (r) => r.serialNo || '—' },
    { key: 'loc', header: t('inv.location', '위치'), width: 80, render: (r) => r.locationCode },
    { key: 'bal', header: t('inv.balance', '잔량'), width: 60, align: 'right', sortValue: (r) => r.balance, render: (r) => <b style={{ color: r.balance > 0 ? 'var(--run)' : 'var(--txt-mute)' }}>{r.balance}</b> },
  ]
  const tCols: GridColumn<MovementRow>[] = [
    { key: 'at', header: t('inv.at', '일시'), width: 118, align: 'center', render: (r) => r.at },
    { key: 'loc', header: t('inv.location', '위치'), width: 84, render: (r) => r.locationCode },
    { key: 'type', header: t('inv.type', '구분'), width: 46, align: 'center', render: (r) => <Chip tone={r.type === 'IN' ? 'ok' : 'warn'}>{r.type}</Chip> },
    { key: 'qty', header: t('inv.qty', '수량'), width: 54, align: 'right', render: (r) => r.quantity },
    { key: 'ref', header: 'Ref', width: 64, align: 'center', render: (r) => r.refNo ?? r.refType ?? '-' },
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
        <label>Lot</label>
        <input className="in" style={{ width: 74 }} value={lotNo} placeholder={t('inv.lotPh', '로트(선택)')} aria-label="Lot"
          onChange={(e) => setLotNo(e.target.value)} />
        <label>S/N</label>
        <input className="in" style={{ width: 74 }} value={serialNo} placeholder={t('inv.serialPh', '시리얼(선택)')} aria-label="Serial"
          onChange={(e) => setSerialNo(e.target.value)} />
        <Btn variant="pri" onClick={inbound}>{t('inv.inboundF12', '입고 F12')}</Btn>
        <Btn onClick={reserve}>{t('inv.reserve', '예약')}</Btn>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 6, gap: 6 }}>
        <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          <GroupBox style={{ flex: 1, minHeight: 0 }} noPad
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
          <GroupBox style={{ flex: 1, minHeight: 0 }} noPad
            title={t('inv.lotTitle', 'Lot/Serial 추적 — 로트별 잔량 (규제·직번 부품)')}
            right={<span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{lots.length}건</span>}>
            {lots.length ? (
              <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'auto', borderRight: '1px solid var(--line)' }}>
                  <DenseGrid columns={lCols} rows={lots}
                    rowKey={(r) => `${r.itemCode}|${r.lotNo}|${r.serialNo}`}
                    selectedKey={traceKey ?? undefined} onRowClick={showTrace} />
                </div>
                <div style={{ width: 300, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--title-navy)', padding: '3px 6px', borderBottom: '1px solid var(--line)' }}>
                    {traceKey ? t('inv.traceOf', '추적 이력(genealogy)') : t('inv.traceHint', '← 로트/시리얼 선택 시 이력 추적')}
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    {traceKey && trace.length ? (
                      <DenseGrid columns={tCols} rows={trace} rowKey={(_, i) => i} />
                    ) : (
                      <div style={{ padding: 8, fontSize: 10.5, color: 'var(--txt-mute)' }}>
                        {traceKey ? t('inv.noTrace', '이력 없음') : t('inv.traceHint2', '로트/시리얼을 지정해 입고하면 여기서 이력을 추적합니다')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                {t('inv.noLot', '로트/시리얼 추적 대상 없음 — 입고 시 Lot 또는 S/N 지정하면 표시됩니다')}
              </div>
            )}
          </GroupBox>
        </div>
        <div style={{ width: 430, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          <GroupBox noPad style={{ flex: 1, minHeight: 0 }}
            title={t('inv.atpTitle', '가용재고 ATP — 보유·예약·가용')}
            right={<span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>{atp.length}종</span>}>
            {atp.length ? (
              <DenseGrid columns={aCols} rows={atp} rowKey={(r) => r.itemCode}
                onRowClick={(r) => setItem(r.itemCode)} />
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                {t('inv.noAtp', '재고 없음')}
              </div>
            )}
          </GroupBox>
          <GroupBox noPad style={{ flex: 1, minHeight: 0 }}
            title={t('inv.resvTitle', '활성 예약 (inv_reservation)')}
            right={<Chip tone={resv.length ? 'info' : 'ok'}>{resv.length}</Chip>}>
            {resv.length ? (
              <DenseGrid columns={rCols} rows={resv} rowKey={(r) => r.reservationId} />
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                {t('inv.noResv', '활성 예약 없음 — 품목·수량 입력 후 예약')}
              </div>
            )}
          </GroupBox>
          <GroupBox noPad style={{ flex: 1, minHeight: 0 }} title={t('inv.moveTitle', '입출고 이력 (inv_movement)')}>
            <DenseGrid columns={mCols} rows={moves} rowKey={(_, i) => i} />
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
