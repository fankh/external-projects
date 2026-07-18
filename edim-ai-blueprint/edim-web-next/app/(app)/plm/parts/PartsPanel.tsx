'use client'

/** 부품 대장 액션 패널 (N2) — 등록 폼 + 선택 부품의 공급자 코드 매핑(ERP-018). */
import { useActionState, useState, useTransition } from 'react'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { addSubstitute, addSupplierCode, createPart, deleteSubstitute, type ActState } from './actions'

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

export interface SubstituteRow { id: number; partNo: string; partName: string; note: string; at: string }

/** U5 대체 자재 패널 — 선택 부품의 대체 관계 목록·연결·해제. */
export function SubstitutePanel({ partNo, rows }: { partNo: string; rows: SubstituteRow[] }) {
  const { t } = useI18n()
  const [subNo, setSubNo] = useState('')
  const [note, setNote] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  return (
    <div className="gb" data-substitute-panel style={{ padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('parts.substTitle', '대체 자재')} — {partNo} ({rows.length})</div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>{t('parts.substNo', '대체 부품')}</th><th>{t('parts.partName', '부품명')}</th><th>{t('parts.note', '비고')}</th><th></th></tr></thead>
        <tbody>{rows.length ? rows.map((r) => (
          <tr key={r.id}><td className="code">{r.partNo}</td><td>{r.partName}</td><td>{r.note || '—'}</td>
            <td className="c"><button className="b" disabled={pending} style={{ height: 17, fontSize: 9.5 }}
              onClick={() => start(async () => setSt(await deleteSubstitute(r.id)))}>✕</button></td></tr>
        )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('parts.noSubst', '대체 관계 없음')}</td></tr>}</tbody>
      </table>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ width: 110 }} placeholder={t('parts.substPh', '대체 부품번호')} value={subNo} onChange={(e) => setSubNo(e.target.value)} />
        <input className="in" style={{ width: 90 }} placeholder={t('parts.note', '비고')} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="b run" data-subst-add disabled={pending} onClick={() => start(async () => {
          const r = await addSubstitute(partNo, subNo, note)
          setSt(r); if (r.ok) { setSubNo(''); setNote('') }
        })}>＋ {t('parts.substLink', '연결')}</button>
        {st.error ? <span style={{ color: 'var(--err)', fontSize: 10.5 }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)', fontSize: 10.5 }}>{st.ok}</span> : null}
      </div>
    </div>
  )
}
