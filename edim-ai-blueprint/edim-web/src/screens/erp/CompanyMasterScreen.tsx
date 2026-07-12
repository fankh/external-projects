/** M-14-2 공급처·거래처 대장 (B14) — com_company 실 CRUD.
 *  단가(cst_price.supplier_id)·발주 공급처의 마스터 원천. */
import { useEffect, useMemo, useState } from 'react'
import { companyService, xlsxService, type CompanyRow, type SupplierEval, type SupplierMetrics } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { QuickEditDialog } from '../../components/QuickEditDialog'
import { usePermission } from '../../shell/PermissionContext'
import { useEscapeClose } from '../../shell/useEscapeClose'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const TYPE_TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  SUPPLIER: 'info', CUSTOMER: 'ok', PARTNER: 'warn', BANK: 'warn',
}

export function CompanyMasterScreen({ active }: ScreenProps) {
  const shell = useShell()
  const perm = usePermission()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [offline, setOffline] = useState(false)
  const [typeFilter, setTypeFilter] = useState('전체')
  const [showReg, setShowReg] = useState(false)
  const [editRow, setEditRow] = useState<CompanyRow | null>(null)   // F5 — 더블클릭 수정
  useEscapeClose(showReg, () => setShowReg(false))
  const [reg, setReg] = useState<CompanyRow>({
    name: '', companyType: 'SUPPLIER', nation: 'KR', grade: '', terms: '',
  })
  // G3 공급처 평가 스코어카드
  const [selected, setSelected] = useState<CompanyRow | null>(null)
  const [metrics, setMetrics] = useState<SupplierMetrics | null>(null)
  const [evals, setEvals] = useState<SupplierEval[]>([])
  const [ev, setEv] = useState({ period: '', delivery: '', quality: '', price: '', note: '' })

  const selectSupplier = (r: CompanyRow) => {
    setSelected(r)
    setMetrics(null); setEvals([])
    if (!r.companyId) return
    setEv({ period: new Date().toISOString().slice(0, 7), delivery: '', quality: '', price: '', note: '' })
    void companyService.metrics(r.companyId).then((m) => setMetrics(m))
    void companyService.evals(r.companyId).then((e) => setEvals(e ?? []))
  }
  const saveEval = () => {
    if (!selected?.companyId) return
    const d = Number(ev.delivery), q = Number(ev.quality), pr = Number(ev.price)
    if (!ev.period.trim() || [d, q, pr].some((x) => !(x >= 0 && x <= 100))) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수 — 기간(YYYY-MM)·점수 0~100</span>); return
    }
    void companyService.addEval({ supplierId: selected.companyId, period: ev.period.trim(), delivery: d, quality: q, price: pr, note: ev.note })
      .then((r) => {
        setStatusMsg(`평가 저장 ✓ — ${selected.name} ${ev.period} 총점 ${r.total} · 등급 ${r.grade}`)
        void companyService.evals(selected.companyId!).then((e) => setEvals(e ?? []))
        void load()
      })
      .catch((e: Error) => setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }
  const evCols: GridColumn<SupplierEval>[] = [
    { key: 'period', header: '기간', width: 66, align: 'center', render: (r) => r.period },
    { key: 'd', header: '납기', width: 44, align: 'right', render: (r) => r.delivery },
    { key: 'q', header: '품질', width: 44, align: 'right', render: (r) => r.quality },
    { key: 'p', header: '단가', width: 44, align: 'right', render: (r) => r.price },
    { key: 'total', header: '총점', width: 48, align: 'right', sortValue: (r) => r.total, render: (r) => <b>{r.total}</b> },
    { key: 'grade', header: '등급', width: 44, align: 'center', render: (r) => <Chip tone={r.grade === 'A' ? 'ok' : r.grade === 'D' ? 'warn' : 'info'}>{r.grade}</Chip> },
  ]

  const load = async () => {
    const r = await companyService.list()
    if (r === null) { setOffline(true); return }
    setOffline(false)
    setRows(r)
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = rows.filter((r) => typeFilter === '전체' || r.companyType === typeFilter)

  const register = () => {
    if (!reg.name.trim()) {
      setStatusMsg(<span style={{ color: 'var(--err)' }}>필수(노란 셀) — 업체명</span>)
      return
    }
    void (async () => {
      try {
        if (!await companyService.create(reg)) {
          setStatusMsg(<span style={{ color: 'var(--err)' }}>등록 불가 — 백엔드 연결 필요</span>)
          return
        }
        setShowReg(false)
        await load()
        setStatusMsg(`업체 등록 ✓ — ${reg.name} (com_company)`)
        setReg({ name: '', companyType: 'SUPPLIER', nation: 'KR', grade: '', terms: '' })
      } catch (e) {
        setStatusMsg(<span style={{ color: 'var(--err)' }}>
          {e instanceof Error ? e.message : '등록 실패'}</span>)
      }
    })()
  }

  useFKeys(active, useMemo(() => ({
    F2: () => {
      if (!perm.canWrite('erp-company-master')) { shell.setStatusMsg(perm.denyWrite); return }
      setShowReg(true)
    },
    F8: () => { void load(); setStatusMsg('업체 대장 재조회 (com_company)') },
  }), [])) // eslint-disable-line react-hooks/exhaustive-deps

  const cols: GridColumn<CompanyRow>[] = [
    { key: 'name', header: '업체명', render: (r) => r.name },
    {
      key: 'type', header: '유형', width: 76, align: 'center',
      render: (r) => <Chip tone={TYPE_TONE[r.companyType] ?? 'info'}>{r.companyType}</Chip>,
    },
    { key: 'nation', header: '국가', width: 42, align: 'center', render: (r) => r.nation || '—' },
    { key: 'grade', header: '평가', width: 42, align: 'center', render: (r) => r.grade || '—' },
    { key: 'terms', header: '결제 조건', render: (r) => r.terms || '—' },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>유형</label>
        <Combo width={100} value={typeFilter} options={['전체', 'SUPPLIER', 'CUSTOMER', 'PARTNER', 'BANK']}
          onChange={setTypeFilter} />
        <span style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
          단가 대장(cst_price)·발주 공급처의 마스터 원천 — 단가 등록 시 신규 업체는 자동 생성됨
        </span>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => void xlsxService.download('/companies/export.xlsx', 'companies')
          .then((n) => shell.setStatusMsg(n < 0 ? <span style={{ color: 'var(--err)' }}>내보내기 불가</span> : `거래처 XLSX ✓ — ${n}건`))}>⬇ XLSX</Btn>
        <Btn variant="pri" disabled={!perm.canWrite('erp-company-master')}
          title={perm.canWrite('erp-company-master') ? undefined : perm.denyWrite}
          onClick={() => setShowReg(true)}>＋ 등록 F2</Btn>
      </div>
      {showReg ? (
        <div data-com-reg style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(20,26,40,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowReg(false)}>
          <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 330, boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5 }}>
              <b>업체 등록 — com_company</b><span className="sp" />
              <span style={{ cursor: 'pointer' }} onClick={() => setShowReg(false)}>✕</span>
            </div>
            <div className="frm c2" style={{ padding: 10 }}>
              <label>업체명 *</label>
              <input className="in req" value={reg.name} aria-label="업체명"
                onChange={(e) => setReg({ ...reg, name: e.target.value })} />
              <label>유형</label>
              <Combo width={130} value={reg.companyType} options={['SUPPLIER', 'CUSTOMER', 'PARTNER', 'BANK']}
                onChange={(v) => setReg({ ...reg, companyType: v })} />
              <label>국가</label>
              <input className="in" value={reg.nation} aria-label="국가"
                onChange={(e) => setReg({ ...reg, nation: e.target.value })} />
              <label>평가 등급</label>
              <input className="in" value={reg.grade} aria-label="평가 등급" placeholder="A"
                onChange={(e) => setReg({ ...reg, grade: e.target.value })} />
              <label>결제 조건</label>
              <input className="in" value={reg.terms} aria-label="결제 조건" placeholder="월말 현금 60일"
                onChange={(e) => setReg({ ...reg, terms: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <Btn onClick={() => setShowReg(false)}>취소</Btn>
              <Btn variant="pri" onClick={register}>등록 F12</Btn>
            </div>
          </div>
        </div>
      ) : null}
      {editRow ? (
        <QuickEditDialog dataAttr="com-edit" title={`업체 수정 — ${editRow.name}`}
          fields={[
            { key: 'name', label: '업체명', value: editRow.name, required: true },
            { key: 'companyType', label: '유형', value: editRow.companyType, type: 'combo',
              options: ['SUPPLIER', 'CUSTOMER', 'PARTNER', 'BANK'] },
            { key: 'nation', label: '국가', value: editRow.nation },
            { key: 'grade', label: '평가 등급', value: editRow.grade },
            { key: 'terms', label: '결제 조건', value: editRow.terms },
            { key: 'remarks', label: '비고', value: editRow.remarks ?? '' },
          ]}
          onClose={() => setEditRow(null)}
          onSubmit={async (v) => {
            if (!editRow.companyId) return '백엔드 연결 필요 (mock 모드)'
            const ok = await companyService.update(editRow.companyId, {
              name: v.name, companyType: v.companyType, nation: v.nation,
              grade: v.grade, terms: v.terms, remarks: v.remarks,
            })
            if (!ok) return '백엔드 연결 필요 (mock 모드)'
            setEditRow(null)
            await load()
            setStatusMsg(`업체 수정 ✓ — ${v.name} (com_company · COMPANY_UPDATE 감사)`)
            return null
          }} />
      ) : null}
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        <GroupBox title={`업체 대장 — ${visible.length}건`} noPad style={{ flex: 1, minHeight: 0 }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — 업체 대장은 실DB(com_company)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid prefKey="companies" columns={cols} rows={visible} rowKey={(r) => r.name}
              selectedKey={selected?.name ?? null}
              onRowClick={selectSupplier}
              onRowDoubleClick={(r) => {
                if (!perm.canWrite('erp-company-master')) { setStatusMsg(perm.denyWrite); return }
                setEditRow(r)
              }} />
          )}
        </GroupBox>
        {selected ? (
          <div data-supplier-eval style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
            <GroupBox noPad title={`공급처 평가 — ${selected.name}`}
              right={selected.grade ? <Chip tone={selected.grade === 'A' ? 'ok' : 'info'}>등급 {selected.grade}</Chip> : null}>
              <div style={{ padding: 8, fontSize: 10.5, lineHeight: 1.9 }}>
                {metrics ? (
                  <div style={{ color: 'var(--txt-dim)' }}>
                    발주 {metrics.poCount}건 (완료 {metrics.closedCount}) · 발주 {metrics.orderedQty} / 입고 {metrics.receivedQty}<br />
                    이행률 <b style={{ color: 'var(--title-navy)' }}>{metrics.fulfillmentPct}%</b> → 납기 점수 제안 {metrics.suggestedDelivery}
                  </div>
                ) : <span style={{ color: 'var(--txt-mute)' }}>지표 로드 중…</span>}
                <div className="frm c2" style={{ marginTop: 6 }}>
                  <label>기간</label>
                  <input className="in" value={ev.period} placeholder="YYYY-MM" aria-label="평가 기간"
                    onChange={(e) => setEv({ ...ev, period: e.target.value })} />
                  <label>납기(0~100)</label>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <input className="in" value={ev.delivery} aria-label="납기 점수"
                      onChange={(e) => setEv({ ...ev, delivery: e.target.value })} />
                    <Btn style={{ fontSize: 9.5 }} disabled={!metrics}
                      onClick={() => setEv((v) => ({ ...v, delivery: String(metrics?.suggestedDelivery ?? '') }))}>자동</Btn>
                  </div>
                  <label>품질(0~100)</label>
                  <input className="in" value={ev.quality} aria-label="품질 점수"
                    onChange={(e) => setEv({ ...ev, quality: e.target.value })} />
                  <label>단가(0~100)</label>
                  <input className="in" value={ev.price} aria-label="단가 점수"
                    onChange={(e) => setEv({ ...ev, price: e.target.value })} />
                  <label>비고</label>
                  <input className="in" value={ev.note} aria-label="비고"
                    onChange={(e) => setEv({ ...ev, note: e.target.value })} />
                </div>
                <div style={{ textAlign: 'right', marginTop: 6 }}>
                  <Btn variant="pri" disabled={!perm.canWrite('erp-company-master')}
                    onClick={saveEval}>평가 저장</Btn>
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 3 }}>
                  총점 = 납기×0.4 + 품질×0.4 + 단가×0.2 · A≥90 B≥80 C≥70 D
                </div>
              </div>
            </GroupBox>
            <GroupBox noPad style={{ flex: 1, minHeight: 0 }} title={`평가 이력 — ${evals.length}건`}>
              {evals.length ? (
                <DenseGrid columns={evCols} rows={evals} rowKey={(r) => r.evalId} />
              ) : (
                <div style={{ padding: 10, fontSize: 10.5, color: 'var(--txt-mute)' }}>평가 이력 없음</div>
              )}
            </GroupBox>
          </div>
        ) : null}
      </div>
    </div>
  )
}
