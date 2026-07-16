'use client'

/** 부품 대장 액션 패널 (N2) — 등록 폼 + 선택 부품의 공급자 코드 매핑(ERP-018). */
import { useActionState, useState, useTransition } from 'react'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { addSupplierCode, createPart, type ActState } from './actions'

export interface SupplierCodeRow { supplier: string; supplierCode: string; supplierName: string }

export function PartRegForm() {
  const { t } = useI18n()
  const [st, action, pending] = useActionState(createPart, {} as ActState)
  return (
    <RegisterModal trigger={t('parts.registerBtn', '＋ 부품 등록')} title={t('parts.regTitle', '부품 등록')} ok={st.ok}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('parts.partNo', '부품번호')}</label>
          <input className="in req" name="partNo" autoFocus />
          <label>{t('parts.partName', '부품명')}</label>
          <input className="in req" name="name" />
          <label>{t('parts.specCol', '사양')}</label>
          <input className="in" name="spec" />
          <label>{t('parts.materialCol', '재질')}</label>
          <input className="in" name="materialCode" />
          <label>{t('parts.supplierCol', '공급처')}</label>
          <input className="in" name="supplier" />
          <label>{t('parts.unitCol', '단위')}</label>
          <input className="in" name="unit" defaultValue="EA" />
          <label>{t('parts.weightCol', '중량')}</label>
          <input className="in" name="weight" />
          <label>{t('parts.stdChip', '표준')}</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <input type="checkbox" name="isStandard" />
          </label>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
            {st.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{st.error}</span> : null}
            <button className="b run" type="submit" disabled={pending}>{t('common.register', '등록')}</button>
          </div>
        </form>
      )}
    </RegisterModal>
  )
}

export function SupplierCodePanel({ partNo, rows }: { partNo: string; rows: SupplierCodeRow[] }) {
  const { t } = useI18n()
  const [supplier, setSupplier] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  return (
    <div className="gb" style={{ padding: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('parts.supCodes', '공급자 코드 매핑 (ERP-018)')} — {partNo}</div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>{t('parts.supplierCol', '공급처')}</th><th>{t('purchase.supCode', '공급자 코드')}</th><th>{t('parts.supNameCol', '공급자 품명')}</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => (
            <tr key={i}><td>{r.supplier}</td><td className="code">{r.supplierCode}</td><td>{r.supplierName || '—'}</td></tr>
          )) : <tr><td colSpan={3} style={{ color: 'var(--txt-mute)', textAlign: 'center' }}>{t('parts.noSupCodes', '매핑 없음')}</td></tr>}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ width: 90 }} placeholder={t('parts.supplierCol', '공급처')} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        <input className="in" style={{ width: 90 }} placeholder={t('purchase.supCode', '공급자 코드')} value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="in" style={{ flex: 1, minWidth: 80 }} placeholder={t('parts.supNameCol', '공급자 품명')} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await addSupplierCode(partNo, supplier, code, name)
          setSt(r)
          if (r.ok) { setSupplier(''); setCode(''); setName('') }
        })}>{t('parts.supCodeAdd', '＋ 매핑')}</button>
      </div>
      {st.error ? <div style={{ color: 'var(--err)', marginTop: 3 }}>{st.error}</div> : null}
      {st.ok ? <div style={{ color: 'var(--run)', marginTop: 3 }}>{st.ok}</div> : null}
    </div>
  )
}
