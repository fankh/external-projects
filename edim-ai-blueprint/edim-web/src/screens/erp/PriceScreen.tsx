/** M-12-5 단가 관리 (W-13, 슬라이드 74·75) — 4종 단가 Table 단일 관리(CST-001) ·
 *  재고단가 4값(ERP-021) · Resolve 시뮬레이션 = Pricing Run 규칙. */
import { useEffect, useMemo, useState } from 'react'
import { STOCK_PRICE, type PriceRow } from '../../api/mock/dataErp'
import { erpService, priceService } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const SOURCE_TONE: Record<PriceRow['source'], 'ok' | 'warn' | 'info'> = {
  '견적적용': 'ok', '구매': 'info', '재고': 'warn', '견적': 'info',
}

export function PriceScreen({ active }: ScreenProps) {
  const shell = useShell()
  const [supplier, setSupplier] = useState('전체')
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const [simCode, setSimCode] = useState('FDV-480')
  const [simDate, setSimDate] = useState('2026-07-09')
  const [simResult, setSimResult] = useState<PriceRow | null | undefined>(undefined)

  const [prices, setPrices] = useState<PriceRow[]>([])

  useEffect(() => {
    void priceService.list().then(setPrices)
  }, [])

  const rows = useMemo(
    () => prices.filter((p) => supplier === '전체' || p.supplier === supplier),
    [prices, supplier],
  )

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
    { key: 'name', header: '품명', render: (r) => r.name },
    { key: 'sup', header: 'Supplier', width: 60, align: 'center', render: (r) => r.supplier },
    { key: 'price', header: 'Price', width: 74, align: 'right', render: (r) => r.price.toLocaleString() },
    {
      key: 'src', header: 'Price table', width: 66, align: 'center',
      render: (r) => <Chip tone={SOURCE_TONE[r.source]}>{r.source}</Chip>,
    },
    { key: 'from', header: '적용 시작', width: 78, align: 'center', render: (r) => r.from },
    { key: 'to', header: '적용 종료', width: 78, align: 'center', render: (r) => r.to ?? '-' },
    {
      key: 'st', header: '상태', width: 56, align: 'center',
      render: (r) => (r.active ? <Chip tone="ok">적용중</Chip> : <Chip tone="warn">만료</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>단가 Table</label>
        <Combo width={120} value="전체 (4종)" options={['전체 (4종)', '1. 견적', '2. 구매 이력', '3. 재고 단가', '4. 견적 적용']} />
        <label>공급처</label>
        <Combo width={80} value={supplier} options={['전체', '효성', 'LG', '중원', '대신금속']}
          onChange={setSupplier} />
        <label>통화</label>
        <Combo width={64} value="KRW" options={['KRW', 'USD', 'JPY']} />
        <label>적용일</label>
        <Combo width={84} value="2026-07" options={['2026-07', '2026-06', '2026-05']} />
        <span style={{ flex: 1 }} />
        <Btn>⬇ Excel Import</Btn>
        <Btn variant="pri">＋ 단가 등록</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title={`단가 대장 — ${rows.length}건 (더블클릭=코드 상세)`} noPad style={{ flex: 1 }}>
            <DenseGrid columns={cols} rows={rows} rowKey={(_, i) => i}
              selectedKey={selIdx} onRowClick={(_, i) => setSelIdx(i)}
              onRowDoubleClick={(r) => shell.openTab({
                id: `code-detail:${r.code}`, screenId: 'code-detail',
                code: '상세', title: r.code, params: { code: r.code, name: r.name },
              })} />
          </GroupBox>
          <GroupBox title={`재고 단가 산출 — ${STOCK_PRICE.code} (입출고 기반 자동, ERP-021)`} noPad>
            <table className="g">
              <thead><tr><th>최고</th><th>최저</th><th>평균</th><th>최근</th></tr></thead>
              <tbody>
                <tr>
                  <td className="num">{STOCK_PRICE.max.toLocaleString()}</td>
                  <td className="num">{STOCK_PRICE.min.toLocaleString()}</td>
                  <td className="num">{STOCK_PRICE.avg.toLocaleString()}</td>
                  <td className="num">{STOCK_PRICE.last.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="적용 우선순위 (Pricing Run resolve)">
            <div className="flow">
              <span className="fs now">① 견적적용</span><span className="ar">→</span>
              <span className="fs">② 구매이력</span><span className="ar">→</span>
              <span className="fs">③ 재고단가</span><span className="ar">→</span>
              <span className="fs">④ 견적</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>
              Code·기간 일치 우선 — EXCLUDE 제약으로 기간 중복 차단 (DB v0.5)
            </div>
          </GroupBox>
          <GroupBox title="Resolve 시뮬레이션">
            <div className="frm c2">
              <label>Code</label>
              <input className="in" value={simCode} aria-label="Sim Code"
                onChange={(e) => setSimCode(e.target.value)} />
              <label>기준일</label>
              <input className="in" value={simDate} aria-label="Sim Date"
                onChange={(e) => setSimDate(e.target.value)} />
            </div>
            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <Btn variant="run" onClick={simulate}>조회 F8</Btn>
            </div>
            {simResult !== undefined ? (
              <div style={{ marginTop: 6, fontSize: 11.5 }}>
                {simResult
                  ? <>→ <b>{simResult.price.toLocaleString()} KRW</b>
                    <Chip tone={SOURCE_TONE[simResult.source]}>{simResult.source}</Chip>
                    <span style={{ color: 'var(--txt-dim)' }}> {simResult.supplier} · {simResult.from}~{simResult.to ?? ''}</span></>
                  : <Chip tone="err">단가 없음</Chip>}
              </div>
            ) : null}
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
