/** M-8-2 구매·발주 PR→PO (W-21, 슬라이드 53) — BOM 발주 대상 선별 ·
 *  Stock Check 재고 충족 제외 · 단가 resolve · 공급자 코드 매핑. */
import { useEffect, useMemo, useState } from 'react'
import type { PriceRow, PrItem } from '../../api/mock/dataErp'
import { erpService, partService, purchaseService, warehouseService, type SupplierCodeRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'
import { SOURCE_KEYS } from './PriceScreen'

export function PurchaseScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [items, setItems] = useState<PrItem[]>([])
  const [filter, setFilter] = useState('발주 대기 (PR 3)')
  const [poCreated, setPoCreated] = useState(false)

  useEffect(() => {
    void purchaseService.items().then(setItems)
  }, [])

  const stockCheck = () => {
    setItems((prev) => prev.map((r) => (r.stockOk ? { ...r, checked: false } : r)))
    shell.setStatusMsg('Stock list Check — 재고 충족 1건 발주 대상 제외 (ERP-007)')
  }

  // B19 — PO 조건 다이얼로그 (ERP-017) → doc_control PO 문서 영속
  const [showPo, setShowPo] = useState(false)
  useEscapeClose(showPo, () => setShowPo(false))
  const [poNo, setPoNo] = useState<string | null>(null)
  const [poForm, setPoForm] = useState({
    deliveryTerms: 'EXW 창원공장', transport: '육로 (트럭)', minOrderQty: '1', certRequired: false,
  })

  const createPo = () => {
    const n = items.filter((r) => r.checked).length
    if (!n) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>선택된 품목 없음</span>)
      return
    }
    setShowPo(true)
  }

  const confirmPo = () => {
    const selItems = items.filter((r) => r.checked)
    void warehouseService.createPo({
      codes: selItems.map((r) => r.code), totalK: totalSel,
      deliveryTerms: poForm.deliveryTerms, transport: poForm.transport,
      minOrderQty: Number(poForm.minOrderQty) || 1, certRequired: poForm.certRequired,
    })
      .then((r) => {
        setShowPo(false)
        setPoCreated(true)
        setPoNo(r.poNo)
        shell.setStatusMsg(`${r.poNo} 생성 ✓ (${selItems.length}품목) — doc_control PO 문서 등록 (조건·공급자 코드 병기)`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const issueQcr = () => {
    const codes = items.filter((r) => r.checked).map((r) => r.code)
    if (!codes.length) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>선택된 품목 없음 — QCR 대상 선택</span>)
      return
    }
    void warehouseService.issueQcr(codes)
      .then((no) => shell.setStatusMsg(`${no} 발행 ✓ (${codes.length}품목) — 감사 기록·구매 담당 알림 (공급자 회신 대기)`))
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  useFKeys(active, useMemo(() => ({ F8: stockCheck, F12: createPo }), [items])) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (code: string) => {
    setItems((prev) => prev.map((r) => (r.code === code ? { ...r, checked: !r.checked } : r)))
    setPoCreated(false)
  }

  const totalSel = items.filter((r) => r.checked)
    .reduce((s, r) => s + (r.price ?? 0) * r.qty, 0)

  const cols: GridColumn<PrItem>[] = [
    {
      key: 'chk', header: '☑', width: 26, align: 'center',
      render: (r) => (
        <input type="checkbox" checked={r.checked} aria-label={`선택 ${r.code}`}
          onChange={() => toggle(r.code)} />
      ),
    },
    { key: 'code', header: 'Code', width: 66, code: true, render: (r) => r.code },
    { key: 'name', header: t('cpq.name', '품명'), render: (r) => r.name },
    { key: 'scode', header: t('purch.supplierCode', '공급자 코드'), width: 72, align: 'center', code: true, render: (r) => r.supplierCode },
    {
      key: 'sup', header: 'Supplier', width: 76, align: 'center',
      render: (r) => (r.stockOk ? <Chip tone="warn">{t('purch.stockOk', '재고 충족')}</Chip> : r.supplier),
    },
    { key: 'qty', header: t('cpq.qty', '수량'), width: 36, align: 'right', render: (r) => r.qty },
    {
      key: 'price', header: 'Price', width: 70, align: 'right',
      render: (r) => (r.price == null ? '-' : r.price.toLocaleString()),
    },
    { key: 'req', header: 'Required', width: 60, align: 'center', render: (r) => r.requiredDate },
    { key: 'del', header: 'Delivery', width: 66, align: 'center', render: (r) => r.delivery },
  ]

  const [resolved, setResolved] = useState<PriceRow | null>(null)
  useEffect(() => {
    void erpService.resolvePrice('FDV-480', '2026-07-09').then(setResolved)
  }, [])

  // 공급자 코드 매핑 실데이터 (B17 ERP-018) — PR 품목 + 대표 제품코드
  const [supMaps, setSupMaps] = useState<(SupplierCodeRow & { code: string })[]>([])
  useEffect(() => {
    if (!items.length) return
    const codes = [...new Set([...items.map((r) => r.code), 'KDCR 3-13'])]
    void (async () => {
      const out: (SupplierCodeRow & { code: string })[] = []
      for (const c of codes) {
        const maps = await partService.codeSupplierCodes(c)
        if (maps === null) return   // 백엔드 불가 → mock 유지
        out.push(...maps.map((m) => ({ ...m, code: c })))
      }
      setSupMaps(out)
    })()
  }, [items])

  return (
    <div className="fill-col">
      {showPo ? (
        <div data-po-dialog style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowPo(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 340, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>{t('purch.poDialog', 'PO 조건 (ERP-017)')}</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowPo(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>{t('purch.delivery', '납품조건')}</label>
              <Combo width={160} value={poForm.deliveryTerms}
                options={['EXW 창원공장', 'FOB 부산', 'CIP 지정장소']}
                onChange={(v) => setPoForm({ ...poForm, deliveryTerms: v })} />
              <label>{t('purch.transport', '운송수단')}</label>
              <Combo width={160} value={poForm.transport}
                options={['육로 (트럭)', '해상 (컨테이너)', '항공']}
                onChange={(v) => setPoForm({ ...poForm, transport: v })} />
              <label>{t('purch.minQty', '최소구매수량')}</label>
              <input className="in" value={poForm.minOrderQty} aria-label="최소구매수량"
                onChange={(e) => setPoForm({ ...poForm, minOrderQty: e.target.value })} />
              <label>{t('purch.cert', '인증서 요구')}</label>
              <span>
                <input type="checkbox" checked={poForm.certRequired} aria-label="인증서 요구"
                  onChange={(e) => setPoForm({ ...poForm, certRequired: e.target.checked })} />
                {' '}Mill Sheet·성적서
              </span>
            </div>
            <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'var(--txt-mute)' }}>
              발주서는 doc_control PO 문서로 영속 — 공급자 코드(ERP-018)가 품목에 병기됩니다.
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowPo(false)}>{t('dwg.cancel', '취소')}</Btn>
              <Btn variant="pri" onClick={confirmPo}>{t('purch.poConfirm', '발주 확정')}</Btn>
            </div>
          </div>
        </div>
      ) : null}
      <div className="qband">
        <label>Project</label>
        <Combo width={110} value={shell.activeProject?.name ?? 'Micron #7'}
          options={[shell.activeProject?.name ?? 'Micron #7']} />
        <label>{t('dash.kind', '구분')}</label>
        <Combo width={124} value={filter}
          options={[
            { value: '발주 대기 (PR 3)', label: t('purch.filterPrWait', '발주 대기 (PR 3)') },
            { value: '발주 완료 (PO 12)', label: t('purch.filterPoDone', '발주 완료 (PO 12)') },
            { value: '입고 예정 (5)', label: t('purch.filterIncoming', '입고 예정 (5)') },
            { value: '일반 발주', label: t('purch.filterGeneral', '일반 발주') },
          ]}
          onChange={setFilter} />
        <label>BOM List</label>
        <Combo width={94} value="BM 21456" options={['BM 21456', 'BM 21388']} />
        <span className="sep" />
        <span className="flow">
          <span className="fs done">{t('purch.flowQuoteReq', '견적 요청')}</span><span className="ar">→</span>
          <span className="fs now">{t('purch.flowOrder', '발주')}</span>
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={stockCheck}>Stock list Check F8</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox style={{ flex: 1 }} noPad
            title={<span>{t('purch.prTitle', '발주 요청')} — <b style={{ color: 'var(--err)' }}>PR-61313-2</b>
              <span style={{ fontWeight: 400, color: 'var(--txt-dim)' }}> (Project OR-61313-5 · BOM BM 21456)</span></span>}>
            <DenseGrid columns={cols} rows={items} rowKey={(r) => r.code}
              onRowDoubleClick={(r) => shell.openTab({
                id: `code-detail:${r.code}`, screenId: 'code-detail',
                code: '상세', title: r.code, params: { code: r.code, name: r.name },
              })}
              footer={<>
                <td colSpan={6}>
                  {t('purch.selectedCount', '선택 {n}건')
                    .replace('{n}', String(items.filter((r) => r.checked).length))}
                </td>
                <td className="num">{totalSel.toLocaleString()}</td>
                <td colSpan={2}></td>
              </>} />
          </GroupBox>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
            {poCreated ? <Chip tone="ok">{poNo ?? 'PO'} {t('purch.poCreatedSuffix', '생성 — RA 승인 대기')}</Chip> : null}
            <Btn onClick={issueQcr}>{t('purch.qcrBtn', '견적 요청 (QCR)')}</Btn>
            <Btn variant="pri" onClick={createPo}>{t('purch.createPoF12Short', '발주 생성 (조건 입력) F12')}</Btn>
          </div>
        </div>
        <div className="split-h" />
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('purch.priceResolve', '단가 Resolve (CST-001)')}>
            <div style={{ fontSize: 10.5, lineHeight: 1.8 }}>
              FDV-480 → <b>{resolved ? resolved.price.toLocaleString() : '—'}</b>
              {resolved ? <> <Chip tone="info">{t(SOURCE_KEYS[resolved.source], resolved.source)}·{resolved.supplier}</Chip></> : null}<br />
              <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>
                {t('purch.priorityHint', '우선순위: 견적적용→구매→재고→견적 (단가 관리 M-12-5)')}
              </span>
            </div>
          </GroupBox>
          <GroupBox title={t('purch.supplierMap', '공급자 코드 매핑 (ERP-018)')} noPad
            right={supMaps.length ? <Chip tone="ok">prt_supplier_code_map</Chip> : <Chip tone="warn">MOCK</Chip>}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8, padding: 6 }}>
              {t('purch.supplierMapHint', '발주서에 공급자측 코드 표기')}
            </div>
            {supMaps.length ? (
              <table className="g" data-supmap-live>
                <thead><tr><th>Code</th><th>{t('purch.supplierCode', '공급자 코드')}</th><th>Supplier</th></tr></thead>
                <tbody>
                  {supMaps.map((m) => (
                    <tr key={m.mapId} title={m.supplierName}>
                      <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{m.code}</td>
                      <td className="c" style={{ fontFamily: 'Consolas, monospace' }}>{m.supplierCode}</td>
                      <td className="c">{m.supplier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '0 6px 6px' }}>
                <code style={{ fontSize: 10.5 }}>FDV-480 ↔ HS-M480 (효성)</code>
              </div>
            )}
          </GroupBox>
          <GroupBox title={t('purch.purchaseTerms', '구매 조건 (ERP-017)')}>
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', lineHeight: 1.8 }}>
              {t('purch.termsDelivery', '납품: EXW / FOB / CIP · 지정장소')}<br />
              {t('purch.termsPayment', '지불·화폐·최소수량·인증서 요구')}
            </div>
          </GroupBox>
          <GroupBox title={t('purch.processTitle', '프로세스 (W-14 정의 준수)')}>
            <div className="flow">
              <span className="fs done">BOM</span><span className="ar">→</span>
              <span className="fs now">PR</span><span className="ar">→</span>
              <span className="fs">PO</span><span className="ar">→</span>
              <span className="fs">{t('dash.flowMi', 'MI 입고')}</span>
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
