/** D1 수주 관리 (Sales Order) — 견적 lifecycle(DRAFT→SENT→ORDERED/LOST) + 수주 잔고.
 *  견적이 수주(ORDERED)로 전환되면 계약금액·납기 확정 + 프로젝트 영업단계 CONTRACT 자동 전이. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { costService, orderService, type OrdersData, type QuotationRow } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'info' | 'err'> = {
  DRAFT: 'warn', SENT: 'info', ORDERED: 'ok', LOST: 'err',
}

export function SalesOrderScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [quotes, setQuotes] = useState<QuotationRow[]>([])
  const [orders, setOrders] = useState<OrdersData | null>(null)
  const [sel, setSel] = useState<number | null>(null)

  const load = useCallback(() => {
    void costService.quotationList().then((r) => { if (r) setQuotes(r) })
    void orderService.list().then(setOrders)
  }, [])
  useEffect(() => { load() }, [load])
  useFKeys(active, useMemo(() => ({ F8: load }), [load]))

  const won = (amt: number) => `₩ ${Math.round(amt).toLocaleString()}`

  const transition = (q: QuotationRow, status: string) => {
    let contractAmount: number | undefined
    let expectedDelivery: string | undefined
    if (status === 'ORDERED') {
      const a = window.prompt(`계약금액 (기본 견적액 ${won(q.total)})`, String(Math.round(q.total)))
      if (a === null) return
      contractAmount = Number(a.replace(/[^\d.]/g, '')) || q.total
      const d = window.prompt('예상 납기 (YYYY-MM-DD, 생략 가능)', '')
      expectedDelivery = d?.trim() || undefined
    }
    void orderService.transition(q.quotationId, status, contractAmount, expectedDelivery)
      .then((res) => {
        if (!res) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        if (status === 'ORDERED') {
          const fu = res.followupEvents ?? []
          const fuTxt = fu.length ? ` · 후속 착수 TODO ${fu.length}건 자동 생성(${fu.map((f) => f.name).join('·')})` : ''
          shell.setStatusMsg(`수주 전환 ✓ — ${q.quotationNo} → ORDERED (계약 ${won(contractAmount ?? q.total)}, 프로젝트 CONTRACT 전이${fuTxt})`)
        } else {
          shell.setStatusMsg(`상태 전이 ✓ — ${q.quotationNo} → ${status}`)
        }
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const qCols: GridColumn<QuotationRow>[] = [
    { key: 'no', header: t('order.quoteNo', '견적번호'), width: 130, code: true, render: (r) => r.quotationNo },
    { key: 'proj', header: 'Project', width: 100, render: (r) => r.project },
    { key: 'cust', header: t('order.customer', '고객'), width: 90, render: (r) => r.customer },
    { key: 'amt', header: t('order.amount', '금액'), width: 110, align: 'right', render: (r) => won(r.total) },
    {
      key: 'st', header: t('order.status', '상태'), width: 70, align: 'center',
      render: (r) => <Chip tone={STATUS_TONE[r.status] ?? 'info'}>{r.status}</Chip>,
    },
    {
      key: 'act', header: t('order.action', '전환'), width: 150, align: 'center',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 3 }}>
          {r.status === 'DRAFT' ? <Btn style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'SENT')}>발송</Btn> : null}
          {r.status === 'SENT' ? <>
            <Btn variant="pri" style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'ORDERED')}>수주</Btn>
            <Btn style={{ height: 18, fontSize: 10 }} onClick={() => transition(r, 'LOST')}>실주</Btn>
          </> : null}
          {r.status === 'ORDERED' ? <Chip tone="ok">계약</Chip> : null}
          {r.status === 'LOST' ? <Chip tone="err">실주</Chip> : null}
        </span>
      ),
    },
  ]

  const oCols: GridColumn<OrdersData['orders'][number]>[] = [
    { key: 'proj', header: 'Project', width: 100, code: true, render: (r) => r.project },
    { key: 'name', header: t('order.projectName', '프로젝트명'), render: (r) => r.projectName },
    { key: 'amt', header: t('order.contract', '계약금액'), width: 120, align: 'right', render: (r) => won(r.contractAmount) },
    { key: 'ord', header: t('order.orderDate', '수주일'), width: 90, align: 'center', render: (r) => r.orderDate ?? '-' },
    { key: 'del', header: t('order.delivery', '납기'), width: 90, align: 'center', render: (r) => r.expectedDelivery ?? '-' },
    { key: 'stage', header: t('order.stage', '단계'), width: 90, align: 'center', render: (r) => <Chip tone="ok">{r.stage}</Chip> },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('order.title', '수주 관리')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('order.hint', '견적 발송→수주/실주 · 수주 시 프로젝트 CONTRACT 자동 전이 (D1)')}
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('order.kpiCount', '수주 건수'), v: String(orders?.orderCount ?? 0) },
            { l: t('order.kpiRate', '수주율'), v: `${Math.round((orders?.orderRate ?? 0) * 100)}%` },
            { l: t('order.kpiAmount', '총 수주액'), v: won(orders?.totalAmount ?? 0) },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--title-navy)' }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        <GroupBox title={t('order.quoteList', '견적 목록 — 발송·수주 전환')} noPad>
          <DenseGrid columns={qCols} rows={quotes} rowKey={(r) => r.quotationId}
            selectedKey={sel} onRowClick={(r) => setSel(r.quotationId)} />
        </GroupBox>
        <GroupBox title={t('order.backlog', '수주 잔고 — ORDERED (프로젝트별 계약·납기)')} noPad>
          {orders && orders.orders.length ? (
            <DenseGrid columns={oCols} rows={orders.orders} rowKey={(r) => r.quotationNo} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('order.noOrders', '수주 건 없음 — 견적을 발송→수주 전환하면 표시됩니다')}
            </div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
