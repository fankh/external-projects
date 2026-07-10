/** M-14-2 공급처·거래처 대장 (B14) — com_company 실 CRUD.
 *  단가(cst_price.supplier_id)·발주 공급처의 마스터 원천. */
import { useEffect, useMemo, useState } from 'react'
import { companyService, type CompanyRow } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const TYPE_TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  SUPPLIER: 'info', CUSTOMER: 'ok', PARTNER: 'warn', BANK: 'warn',
}

export function CompanyMasterScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [offline, setOffline] = useState(false)
  const [typeFilter, setTypeFilter] = useState('전체')
  const [showReg, setShowReg] = useState(false)
  const [reg, setReg] = useState<CompanyRow>({
    name: '', companyType: 'SUPPLIER', nation: 'KR', grade: '', terms: '',
  })

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
    F2: () => setShowReg(true),
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
        <Btn variant="pri" onClick={() => setShowReg(true)}>＋ 등록 F2</Btn>
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
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        <GroupBox title={`업체 대장 — ${visible.length}건`} noPad style={{ height: '100%' }}>
          {offline ? (
            <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>
              백엔드 연결 필요 — 업체 대장은 실DB(com_company)에서만 조회됩니다
            </div>
          ) : (
            <DenseGrid columns={cols} rows={visible} rowKey={(r) => r.name} />
          )}
        </GroupBox>
      </div>
    </div>
  )
}
