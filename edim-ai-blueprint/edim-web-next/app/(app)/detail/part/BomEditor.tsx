'use client'

/** 도면 BOM 편집 (G3-b) — 라인 추가(부품번호·수량·조립순서·비고)·삭제. SETUP 게이트. */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { addBomLine, deleteBomLine, type BomActState } from './bomActions'

export interface BomRow {
  bomId: number; itemNo: number; partNo: string; partName: string; qty: number
  assemblySeq: number | null; assemblyNote: string; unit: string; isStandard: boolean
}

export function BomEditor({ drawing, rows }: { drawing: string; rows: BomRow[] }) {
  const { t } = useI18n()
  const perm = usePermission()
  const router = useRouter()
  const canW = perm.canWrite('plm-drawings')
  const [partNo, setPartNo] = useState('')
  const [qty, setQty] = useState('1')
  const [seq, setSeq] = useState('')
  const [note, setNote] = useState('')
  const [st, setSt] = useState<BomActState>({})
  const [pending, start] = useTransition()

  const doAdd = () => start(async () => {
    const r = await addBomLine(drawing, partNo, Number(qty) || 1, seq.trim() ? Number(seq) : null, note)
    setSt(r)
    if (r.ok) { setPartNo(''); setQty('1'); setSeq(''); setNote(''); router.refresh() }
  })
  const doDel = (bomId: number) => start(async () => {
    setSt(await deleteBomLine(drawing, bomId))
    router.refresh()
  })

  return (
    <div className="gb" data-bom-editor style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 600, padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
        {t('detail.drawingBom', '도면 BOM')} ({rows.length})
        {st.error ? <span style={{ color: 'var(--err)', fontWeight: 400 }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)', fontWeight: 400 }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead><tr><th>No</th><th>{t('detail.partNo', '부품번호')}</th><th>{t('detail.name', '이름')}</th>
            <th style={{ textAlign: 'right' }}>{t('detail.qty', '수량')}</th><th>{t('detail.unit', '단위')}</th>
            <th>{t('detail.assemblySeq', '조립순서')}</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.bomId}>
              <td className="c">{r.itemNo}</td><td className="code">{r.partNo}</td><td>{r.partName}</td>
              <td className="num">{r.qty}</td><td className="c">{r.unit}</td><td className="c">{r.assemblySeq ?? '—'}</td>
              <td className="c">
                <button className="b" data-bom-del disabled={pending || !canW} style={{ height: 17, fontSize: 9.5 }}
                  title={canW ? t('detail.bomDelHint', 'BOM 라인 삭제') : perm.denyWrite}
                  onClick={() => doDel(r.bomId)}>✕</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {/* 라인 추가 (POST /drawings/{no}/bom) — 부품 대장 등록 부품만 (422), 중복 409 */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderTop: '1px solid var(--line)', alignItems: 'center', flexWrap: 'wrap', fontSize: 10.5 }}>
        <input className="in" style={{ width: 110 }} placeholder={t('detail.bomPartPh', '부품번호 (대장 등록분)')}
          aria-label="BOM 부품번호" value={partNo} onChange={(e) => setPartNo(e.target.value)} />
        <input className="in" style={{ width: 44, textAlign: 'right' }} aria-label="BOM 수량" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="in" style={{ width: 56 }} placeholder={t('detail.assemblySeq', '조립순서')} aria-label="BOM 조립순서" value={seq} onChange={(e) => setSeq(e.target.value)} />
        <input className="in" style={{ flex: 1, minWidth: 90 }} placeholder={t('detail.bomNotePh', '조립 비고')} aria-label="BOM 비고" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="b run" data-bom-add disabled={pending || !canW}
          title={canW ? undefined : perm.denyWrite}
          onClick={doAdd}>＋ {t('detail.bomAdd', 'BOM 추가')}</button>
      </div>
    </div>
  )
}
