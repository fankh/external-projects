/** M-12-5 단가 관리 (W-13, 슬라이드 74·75) — 4종 단가 Table 단일 관리(CST-001) ·
 *  재고단가 4값(ERP-021) · Resolve 시뮬레이션 = Pricing Run 규칙. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { STOCK_PRICE, type PriceRow } from '../../api/mock/dataErp'
import { erpService, priceService, priceWriteService, xlsxService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const SOURCE_TONE: Record<PriceRow['source'], 'ok' | 'warn' | 'info'> = {
  '견적적용': 'ok', '구매': 'info', '재고': 'warn', '견적': 'info',
}

// 단가 Table 원천(enum) 표시 번역 키 — 내부 값(cst_price source)은 원문 유지
export const SOURCE_KEYS: Record<PriceRow['source'], string> = {
  '견적적용': 'enum.quoteApplied', '구매': 'enum.purchase', '재고': 'enum.stock', '견적': 'enum.quote',
}

export function PriceScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { t } = useI18n()
  const [supplier, setSupplier] = useState('전체')
  const [table, setTable] = useState('전체 (4종)')
  const [showReg, setShowReg] = useState(false)
  const [reg, setReg] = useState({
    code: 'FDV-480', supplier: '효성', price: '', source: '견적', validFrom: '2026-07-09', validTo: '',
  })
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const [showClose, setShowClose] = useState(false)   // F5 — 적용 종료 마감
  useEscapeClose(showReg, () => setShowReg(false))
  const [simCode, setSimCode] = useState('FDV-480')
  const [simDate, setSimDate] = useState('2026-07-09')
  const [simResult, setSimResult] = useState<PriceRow | null | undefined>(undefined)

  const [prices, setPrices] = useState<PriceRow[]>([])

  const load = async () => { await priceService.list().then(setPrices) }

  useEffect(() => {
    void load()
  }, [])

  // 단가 Table 콤보 실필터 (B3)
  const TABLE_SOURCE: Record<string, string | null> = {
    '전체 (4종)': null, '1. 견적': '견적', '2. 구매 이력': '구매',
    '3. 재고 단가': '재고', '4. 견적 적용': '견적적용',
  }
  const rows = useMemo(
    () => prices.filter((p) => (supplier === '전체' || p.supplier === supplier)
      && (TABLE_SOURCE[table] == null || p.source === TABLE_SOURCE[table])),
    [prices, supplier, table], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const xlsInput = useRef<HTMLInputElement>(null)

  const importXls = (f: globalThis.File) => {
    void (async () => {
      try {
        const report = await priceWriteService.importExcel(f)
        if (!report) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>Import 불가 — 백엔드 연결 필요</span>)
          return
        }
        await priceService.list().then(setPrices)
        shell.setStatusMsg(`단가 Excel Import — 등록 ${report.inserted}건`
          + (report.rejected.length ? ` · 거부 ${report.rejected.length} (${report.rejected[0]} …)` : ''))
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : 'Import 실패'}</span>)
      }
    })()
  }

  const register = () => {
    const priceNum = Number(reg.price)
    if (!reg.code.trim() || !priceNum || priceNum <= 0) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — Code·단가 입력</span>)
      return
    }
    void (async () => {
      try {
        const ok = await priceWriteService.create({
          code: reg.code.trim(), supplier: reg.supplier.trim(), price: priceNum,
          source: reg.source, validFrom: reg.validFrom.trim(), validTo: reg.validTo.trim() || null,
        })
        if (!ok) {
          shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        await priceService.list().then(setPrices)
        shell.setStatusMsg(`단가 등록 ✓ — ${reg.code} ${priceNum.toLocaleString()} KRW (${reg.source}·cst_price)`)
      } catch (e) {
        shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  // 재고 단가 4값 — cst_price 재고 이력에서 실산출 (백엔드 불가 시 mock)
  const stock = useMemo(() => {
    const stockRows = prices.filter((p) => p.source === '재고')
    if (stockRows.length === 0) return STOCK_PRICE
    const code = stockRows[0].code
    const vals = stockRows.filter((r) => r.code === code).map((r) => r.price)
    return {
      code,
      max: Math.max(...vals), min: Math.min(...vals),
      avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length),
      last: vals[0],   // valid_from DESC 정렬 — 첫 행 = 최근
    }
  }, [prices])

  const simulate = () => {
    void (async () => {
      const r = await erpService.resolvePrice(simCode.trim(), simDate.trim())
      setSimResult(r)
      shell.setStatusMsg(r
        ? `Resolve — ${simCode} → ${r.price.toLocaleString()} KRW (${r.source}·${r.supplier})`
        : <span style={{ color: 'var(--warn)' }}>단가 없음 — Pricing Run 시 warn (③→④ 대체 불가)</span>)
    })()
  }

  useFKeys(active, useMemo(() => ({ F8: simulate }), [simCode, simDate])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<PriceRow>[] = [
    { key: 'code', header: 'Code No.', width: 70, code: true, render: (r) => r.code },
    { key: 'name', header: t('cpq.name', '품명'), render: (r) => r.name },
    { key: 'sup', header: 'Supplier', width: 60, align: 'center', render: (r) => r.supplier },
    { key: 'price', header: 'Price', width: 74, align: 'right', render: (r) => r.price.toLocaleString() },
    {
      key: 'src', header: 'Price table', width: 66, align: 'center',
      render: (r) => <Chip tone={SOURCE_TONE[r.source]}>{t(SOURCE_KEYS[r.source], r.source)}</Chip>,
    },
    { key: 'from', header: t('price.validFrom', '적용 시작'), width: 78, align: 'center', render: (r) => r.from },
    { key: 'to', header: t('price.validTo', '적용 종료'), width: 78, align: 'center', render: (r) => r.to ?? '-' },
    {
      key: 'st', header: t('prj.status', '상태'), width: 56, align: 'center',
      render: (r) => (r.active
        ? <Chip tone="ok">{t('enum.active', '적용중')}</Chip>
        : <Chip tone="warn">{t('enum.expired', '만료')}</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('price.priceTable', '단가 Table')}</label>
        <Combo width={120} value={table} onChange={setTable}
          options={[
            { value: '전체 (4종)', label: t('price.tableAll', '전체 (4종)') },
            { value: '1. 견적', label: t('price.tableQuote', '1. 견적') },
            { value: '2. 구매 이력', label: t('price.tablePurchase', '2. 구매 이력') },
            { value: '3. 재고 단가', label: t('price.tableStock', '3. 재고 단가') },
            { value: '4. 견적 적용', label: t('price.tableApplied', '4. 견적 적용') },
          ]} />
        <label>{t('price.supplier', '공급처')}</label>
        <Combo width={80} value={supplier}
          options={[{ value: '전체', label: t('enum.all', '전체') }, '효성', 'LG', '중원', '대신금속']}
          onChange={setSupplier} />
        <label>{t('price.currency', '통화')}</label>
        <Combo width={64} value="KRW" options={['KRW', 'USD', 'JPY']} />
        <label>{t('price.applyDate', '적용일')}</label>
        <Combo width={84} value="2026-07" options={['2026-07', '2026-06', '2026-05']} />
        <span style={{ flex: 1 }} />
        <input ref={xlsInput} type="file" accept=".xlsx" style={{ display: 'none' }}
          aria-label="단가 Excel"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importXls(f)
            e.target.value = ''
          }} />
        <Btn onClick={() => void xlsxService.download('/prices/export.xlsx', 'prices')
          .then((n) => shell.setStatusMsg(n < 0 ? <span style={{ color: 'var(--err)' }}>내보내기 불가</span> : `단가 XLSX ✓ — ${n}건`))}>⬇ XLSX</Btn>
        <Btn onClick={() => xlsInput.current?.click()}>⬇ Excel Import</Btn>
        <Btn disabled={!perm.canWrite('erp-price') || selIdx === null}
          title={perm.canWrite('erp-price') ? undefined : perm.denyWrite}
          onClick={() => setShowClose(true)}>{t('price.closeBtn', '적용 종료')}</Btn>
        <Btn variant="pri" disabled={!perm.canWrite('erp-price')}
          title={perm.canWrite('erp-price') ? undefined : perm.denyWrite}
          onClick={() => setShowReg(true)}>{t('price.addPrice', '＋ 단가 등록')}</Btn>
      </div>
      {showClose && selIdx !== null && rows[selIdx] ? (
        <QuickEditDialog dataAttr="price-close"
          title={`적용 종료 마감 — ${rows[selIdx].code} (${rows[selIdx].supplier})`}
          submitLabel={t('price.closeSubmit', '마감 F12')}
          fields={[
            { key: 'price', label: t('price.priceLbl', '단가'), value: rows[selIdx].price.toLocaleString(), readOnly: true },
            { key: 'from', label: t('price.validFrom', '적용 시작'), value: rows[selIdx].from, readOnly: true },
            { key: 'validTo', label: t('price.validTo', '적용 종료'), value: rows[selIdx].to ?? '', required: true },
          ]}
          onClose={() => setShowClose(false)}
          onSubmit={async (v) => {
            const row = rows[selIdx]
            if (!row.priceId) return t('common.needBackend', '백엔드 연결 필요 (mock 모드)')
            const ok = await priceWriteService.close(row.priceId, v.validTo.trim())
            if (!ok) return t('common.needBackend', '백엔드 연결 필요 (mock 모드)')
            setShowClose(false)
            void load()
            shell.setStatusMsg(`적용 종료 마감 ✓ — ${row.code} → ${v.validTo} (cst_price · PRICE_CLOSE 감사)`)
            return null
          }} />
      ) : null}
      {showReg ? (
        <div data-price-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>{t('price.regTitle', '단가 등록 — cst_price')}</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>Code *</label>
              <input className="in req" value={reg.code} aria-label="등록 Code"
                onChange={(e) => setReg({ ...reg, code: e.target.value })} />
              <label>{t('price.supplier', '공급처')}</label>
              <input className="in" value={reg.supplier} aria-label="등록 공급처"
                onChange={(e) => setReg({ ...reg, supplier: e.target.value })} />
              <label>{t('price.priceLbl', '단가')} *</label>
              <input className="in req" value={reg.price} aria-label="등록 단가" placeholder="KRW"
                onChange={(e) => setReg({ ...reg, price: e.target.value })} />
              <label>Table</label>
              <Combo width={120} value={reg.source}
                options={[
                  { value: '견적', label: t('enum.quote', '견적') },
                  { value: '구매', label: t('enum.purchase', '구매') },
                  { value: '재고', label: t('enum.stock', '재고') },
                  { value: '견적적용', label: t('enum.quoteApplied', '견적적용') },
                ]}
                onChange={(v) => setReg({ ...reg, source: v })} />
              <label>{t('price.validFrom', '적용 시작')} *</label>
              <input className="in req" value={reg.validFrom} aria-label="적용 시작"
                onChange={(e) => setReg({ ...reg, validFrom: e.target.value })} />
              <label>{t('price.validTo', '적용 종료')}</label>
              <input className="in" value={reg.validTo} aria-label="적용 종료"
                placeholder={t('price.noExpiry', '(무기한)')}
                onChange={(e) => setReg({ ...reg, validTo: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>{t('price.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={register}>{t('price.registerF12', '등록 F12')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={t('price.ledger', '단가 대장 — {n}건 (더블클릭=코드 상세)')
            .replace('{n}', String(rows.length))} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={rows} rowKey={(_, i) => i}
              selectedKey={selIdx} onRowClick={(_, i) => setSelIdx(i)}
              onRowDoubleClick={(r) => shell.openTab({
                id: `code-detail:${r.code}`, screenId: 'code-detail',
                code: '상세', title: r.code, params: { code: r.code, name: r.name },
              })} />
          </GroupBox>
          <GroupBox title={t('price.stockCalc', '재고 단가 산출 — {n} (입출고 기반 자동, ERP-021)')
            .replace('{n}', stock.code)} noPad>
            <table className="g">
              <thead><tr>
                <th>{t('price.max', '최고')}</th><th>{t('price.min', '최저')}</th>
                <th>{t('price.avg', '평균')}</th><th>{t('price.last', '최근')}</th>
              </tr></thead>
              <tbody>
                <tr>
                  <td className="num">{stock.max.toLocaleString()}</td>
                  <td className="num">{stock.min.toLocaleString()}</td>
                  <td className="num">{stock.avg.toLocaleString()}</td>
                  <td className="num">{stock.last.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div className="side-scroll" style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GroupBox title={t('price.priority', '적용 우선순위 (Pricing Run resolve)')}>
            <div className="flow">
              <span className="fs now">{t('price.prio1', '① 견적적용')}</span><span className="ar">→</span>
              <span className="fs">{t('price.prio2', '② 구매이력')}</span><span className="ar">→</span>
              <span className="fs">{t('price.prio3', '③ 재고단가')}</span><span className="ar">→</span>
              <span className="fs">{t('price.prio4', '④ 견적')}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>
              {t('price.priorityHint', 'Code·기간 일치 우선 — EXCLUDE 제약으로 기간 중복 차단 (DB v0.5)')}
            </div>
          </GroupBox>
          <GroupBox title={t('price.resolveSim', 'Resolve 시뮬레이션')}>
            <div className="frm c2">
              <label>Code</label>
              <input className="in" value={simCode} aria-label="Sim Code"
                onChange={(e) => setSimCode(e.target.value)} />
              <label>{t('price.baseDate', '기준일')}</label>
              <input className="in" value={simDate} aria-label="Sim Date"
                onChange={(e) => setSimDate(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Btn variant="run" onClick={simulate}>{t('price.queryF8', '조회 F8')}</Btn>
            </div>
            {simResult !== undefined ? (
              <div style={{ marginTop: 6, fontSize: 11.5 }}>
                {simResult
                  ? <>→ <b>{simResult.price.toLocaleString()} KRW</b>
                    <Chip tone={SOURCE_TONE[simResult.source]}>{t(SOURCE_KEYS[simResult.source], simResult.source)}</Chip>
                    <span style={{ color: 'var(--txt-dim)' }}> {simResult.supplier} · {simResult.from}~{simResult.to ?? ''}</span></>
                  : <Chip tone="err">{t('price.noPrice', '단가 없음')}</Chip>}
              </div>
            ) : null}
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
