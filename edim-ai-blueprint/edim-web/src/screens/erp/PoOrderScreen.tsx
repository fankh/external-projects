/** G3 발주 라이프사이클 (ERP-017) — 구조화 PO 헤더+라인 · 승인 · 입고(GR) · 3-way 수량 match.
 *  작성(DRAFT)→승인(APPROVED)→입고중(RECEIVING)→완료(CLOSED). 입고 초과 차단. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { poService, type PoDetail, type PoItem, type PoRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const ST_TONE: Record<string, 'warn' | 'info' | 'ok' | 'err'> = {
  DRAFT: 'warn', APPROVED: 'info', RECEIVING: 'info', CLOSED: 'ok', CANCELLED: 'err',
}
const won = (n: number) => `₩ ${Math.round(n).toLocaleString()}`

export function PoOrderScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<PoRow[]>([])
  const [status, setStatus] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<PoDetail | null>(null)

  const load = useCallback(() => {
    void poService.list(status).then((r) => { if (r) setRows(r) })
  }, [status])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!sel) { setDetail(null); return }
    void poService.detail(sel).then(setDetail)
  }, [sel])

  const create = useCallback(() => {
    const supplier = window.prompt('공급처 (예: 효성)', '')?.trim() || ''
    const itemName = window.prompt('발주 품목명 (예: Casing Φ900)', '')?.trim()
    if (!itemName) return
    const qty = Number((window.prompt('수량', '10') || '').replace(/[^\d.]/g, '')) || 0
    const unitPrice = Number((window.prompt('단가 (₩)', '0') || '').replace(/[^\d.]/g, '')) || 0
    if (qty <= 0) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>수량은 0보다 커야 합니다</span>); return }
    const expectedDate = window.prompt('예상 입고일 (YYYY-MM-DD, 생략 가능)', '')?.trim() || undefined
    void poService.create({ supplier, expectedDate, items: [{ itemName, qty, unitPrice }] })
      .then((no) => {
        if (no === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load(); setSel(no)
        shell.setStatusMsg(`발주 생성 ✓ — ${no} (DRAFT, 승인 후 입고 가능)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [load, shell])

  useFKeys(active, useMemo(() => ({ F8: load, F2: create }), [load, create]))

  const approve = (poNo: string) => {
    void poService.approve(poNo).then((ok) => {
      if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load(); if (sel === poNo) void poService.detail(poNo).then(setDetail)
      shell.setStatusMsg(`발주 승인 ✓ — ${poNo} (입고 가능)`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const receiveLine = (it: PoItem) => {
    const q = Number((window.prompt(`입고 수량 — ${it.itemName} (잔여 ${it.remaining})`, String(it.remaining)) || '').replace(/[^\d.]/g, '')) || 0
    if (q <= 0) return
    void poService.receive(detail!.poNo, [{ poItemId: it.poItemId, qty: q }]).then((r) => {
      if (r === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load(); void poService.detail(detail!.poNo).then(setDetail)
      shell.setStatusMsg(`입고 ✓ — ${it.itemName} +${q} (${r.status === 'CLOSED' ? '발주 완료' : '입고중'}, inv_movement IN)`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cols: GridColumn<PoRow>[] = [
    { key: 'no', header: 'PO No', width: 84, code: true, render: (r) => r.poNo },
    { key: 'sup', header: t('po.supplier', '공급처'), width: 90, render: (r) => r.supplier || '-' },
    { key: 'amt', header: t('po.amount', '금액'), width: 110, align: 'right', render: (r) => won(r.amount) },
    { key: 'st', header: t('po.status', '상태'), width: 72, align: 'center', render: (r) => <Chip tone={ST_TONE[r.status] ?? 'info'}>{r.statusLabel}</Chip> },
    {
      key: 'prog', header: t('po.progress', '입고'), width: 84, align: 'right',
      render: (r) => `${r.receivedQty}/${r.orderQty}${r.matched ? ' ✓' : ''}`,
    },
    { key: 'exp', header: t('po.expected', '예상입고'), width: 96, align: 'center', render: (r) => r.expectedDate ?? '-' },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('po.header', '발주 (PO)')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('po.hint', '작성→승인→입고(GR)→완료 · 입고 초과 차단(3-way 수량 match) (ERP-017)')}
        </span>
        <span style={{ flex: 1 }} />
        <Combo value={status} onChange={setStatus} width={100} options={[
          { value: '', label: '전체 상태' }, { value: 'DRAFT', label: '작성' },
          { value: 'APPROVED', label: '승인' }, { value: 'RECEIVING', label: '입고중' },
          { value: 'CLOSED', label: '완료' },
        ]} />
        <Btn onClick={create}>{t('po.createF2', '발주 생성 F2')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div className="fill-col" style={{ flex: 1.3, padding: 6, gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('po.listTitle', '발주 목록 — erp_po')} noPad>
            {rows.length ? (
              <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.poNo} prefKey="po"
                selectedKey={sel} onRowClick={(r) => setSel(r.poNo)} />
            ) : (
              <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
                {t('po.empty', '발주 없음 — F2 로 생성')}
              </div>
            )}
          </GroupBox>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 6, padding: 6 }}>
          {detail ? (
            <>
              <GroupBox title={`${detail.poNo} — ${detail.statusLabel}`}
                right={detail.status === 'DRAFT'
                  ? <Btn variant="pri" style={{ height: 18, fontSize: 10 }} onClick={() => approve(detail.poNo)}>승인</Btn>
                  : <Chip tone={ST_TONE[detail.status] ?? 'info'}>{detail.statusLabel}</Chip>}>
                <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                  {t('po.supplier', '공급처')}: {detail.supplier || '-'}<br />
                  {t('po.orderDate', '발주일')}: {detail.orderDate} · {t('po.expected', '예상입고')}: {detail.expectedDate ?? '-'}
                </div>
              </GroupBox>
              <GroupBox title={t('po.lines', '발주 라인 — 발주/입고/잔여')} noPad>
                <table className="g">
                  <thead><tr><th>{t('po.item', '품목')}</th><th>{t('po.order', '발주')}</th><th>{t('po.recv', '입고')}</th><th>{t('po.rem', '잔여')}</th><th></th></tr></thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.poItemId}>
                        <td>{it.itemName}</td>
                        <td className="num">{it.orderQty}</td>
                        <td className="num">{it.receivedQty}</td>
                        <td className="num" style={it.remaining > 0 ? { color: 'var(--err)' } : { color: 'var(--ok)' }}>{it.remaining}</td>
                        <td className="c">
                          {(detail.status === 'APPROVED' || detail.status === 'RECEIVING') && it.remaining > 0
                            ? <Btn style={{ height: 16, fontSize: 9 }} onClick={() => receiveLine(it)}>입고</Btn>
                            : it.remaining <= 0 ? <Chip tone="ok">완료</Chip> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GroupBox>
              <div style={{ fontSize: 10, color: 'var(--txt-mute)', padding: '0 2px' }}>
                {t('po.matchNote', '※ 입고는 발주 수량 초과 불가(3-way 수량 match) · 입고 시 inv_movement(IN) 기록 · 전 라인 완료 시 CLOSED')}
              </div>
            </>
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>{t('po.selectHint', '발주를 선택하면 라인·입고 처리')}</div>
          )}
        </div>
      </div>
    </div>
  )
}
