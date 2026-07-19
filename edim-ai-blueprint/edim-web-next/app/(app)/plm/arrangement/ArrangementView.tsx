'use client'

/** Arrangement Set-Up (M-4-2) — 구성 코드 대장 + 구성품 CRUD 아일랜드 (N2 복구). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { RegisterModal } from '@/components/Modal'
import { useI18n } from '@/components/I18nProvider'
import { usePermission } from '@/components/PermissionProvider'
import { addComponent, createArrangement, deleteComponent, patchComponentQty, type ActState } from './actions'

export interface ArrangementRow {
  code: string; name: string; family: string
  direction: string; install: string; status: string; components: number
}
export interface ArrangementComponent {
  position: string; code: string; name: string; quantity: number; componentId?: number
}

/** U15 — Fan Direction 8방향 (슬라이드 38 L0~R270) + Installation Code. */
const FAN_DIRECTIONS = ['L0', 'L90', 'L180', 'L270', 'R0', 'R90', 'R180', 'R270']
const INSTALL_CODES = ['Direct Driven', 'Belt In-Line', 'Belt Along']

export function ArrangementRegForm() {
  const { t } = useI18n()
  const perm = usePermission()
  const [st, action, pending] = useActionState(createArrangement, {} as ActState)
  const [direction, setDirection] = useState('')
  return (
    <RegisterModal disabled={!perm.canWrite('plm-arr')} disabledTitle={perm.denyWrite}
          trigger={`＋ ${t('arr.regBtn', '구성 등록')}`} title={t('arr.regTitle', '구성 등록')} ok={st.ok} width={430}>
      {() => (
        <form action={action} className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
          <label>{t('arr.codePh', '구성 Code (ARR-…)')}</label>
          <input className="in req" name="code" autoFocus />
          <label>{t('arr.namePh', '이름')}</label>
          <input className="in req" name="name" />
          <label>Family</label>
          <input className="in" name="family" />
          <label>Fan Direction</label>
          <div data-fan-direction style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <input type="hidden" name="direction" value={direction} />
            {FAN_DIRECTIONS.map((d) => (
              <button key={d} type="button" className="b"
                data-fan-dir={d}
                style={{
                  height: 20, fontSize: 9.5, padding: '0 5px',
                  background: direction === d ? 'var(--title-navy)' : undefined,
                  color: direction === d ? '#fff' : undefined,
                }}
                onClick={() => setDirection(direction === d ? '' : d)}>{d}</button>
            ))}
          </div>
          <label>Installation</label>
          <select className="in" name="install" defaultValue="">
            <option value="">{t('arr.installNone', '— 미지정 —')}</option>
            {INSTALL_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center' }}>
            {st.error ? <span style={{ fontSize: 11, color: 'var(--err)', marginRight: 'auto' }}>{st.error}</span> : null}
            <button className="b run" type="submit" disabled={pending}>{t('common.register', '등록')}</button>
          </div>
        </form>
      )}
    </RegisterModal>
  )
}

export function ArrangementGrid({ rows, selectedCode }: { rows: ArrangementRow[]; selectedCode?: string | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const cols: GridColumn<ArrangementRow>[] = [
    { key: 'code', header: t('arr.codeCol', '구성 Code'), width: 110, code: true, render: (r) => r.code },
    { key: 'name', header: t('arr.nameCol', '이름'), render: (r) => r.name },
    { key: 'family', header: 'Family', width: 80, align: 'center', render: (r) => r.family || '—' },
    { key: 'dir', header: 'Direction', width: 80, align: 'center', render: (r) => r.direction || '—' },
    { key: 'install', header: 'Install', width: 76, align: 'center', render: (r) => r.install || '—' },
    { key: 'status', header: t('arr.statusCol', '상태'), width: 76, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'APPROVED' ? 'ok' : 'info'}>{r.status}</Chip> },
    { key: 'n', header: t('arr.componentsCol', '구성품'), width: 56, align: 'right', sortValue: (r) => r.components, render: (r) => r.components },
  ]
  return <DenseGrid prefKey="next-arrangement" colFilter columns={cols} rows={rows}
    rowKey={(r) => r.code} selectedKey={selectedCode ?? undefined}
    onRowClick={(r) => router.push(`/plm/arrangement?code=${encodeURIComponent(r.code)}`)}
    emptyText={t('arr.emptyList', '구성 코드가 없습니다')} />
}

export function ComponentPanel({ code, rows }: { code: string; rows: ArrangementComponent[] }) {
  const { t } = useI18n()
  const [pcode, setPcode] = useState('')
  const [pos, setPos] = useState('')
  const [qty, setQty] = useState('1')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  return (
    <div className="gb" style={{ padding: 6, fontSize: 11 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('arr.compHeader', '구성품')} — {code} ({rows.length}{t('arr.countUnit', '건')})</div>
      <table className="g" style={{ width: '100%' }}>
        <thead><tr><th>{t('arr.posCol', '위치')}</th><th>{t('arr.compCodeCol', '코드')}</th><th>{t('arr.compNameCol', '이름')}</th><th>{t('arr.qtyCol', '수량')}</th><th></th></tr></thead>
        <tbody>
          {rows.length ? rows.map((c, i) => (
            <tr key={c.componentId ?? i}>
              <td className="c">{c.position || '—'}</td>
              <td className="code">{c.code}</td>
              <td>{c.name || '—'}</td>
              <td className="c">
                <input className="in" style={{ width: 44, textAlign: 'right' }} defaultValue={c.quantity}
                  disabled={c.componentId == null}
                  onBlur={(e) => {
                    const q = Number(e.target.value)
                    if (c.componentId != null && q > 0 && q !== c.quantity)
                      start(async () => setSt(await patchComponentQty(code, c.componentId!, q)))
                  }} />
              </td>
              <td className="c">
                {c.componentId != null ? (
                  <button className="b" disabled={pending} title={t('arr.compDelete', '구성품 삭제')}
                    onClick={() => start(async () => setSt(await deleteComponent(code, c.componentId!)))}>✕</button>
                ) : null}
              </td>
            </tr>
          )) : <tr><td colSpan={5} style={{ color: 'var(--txt-mute)', textAlign: 'center' }}>{t('arr.compEmpty', '구성품 없음')}</td></tr>}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in" style={{ width: 110 }} placeholder={t('arr.compCodePh', '구성품 코드')} value={pcode} onChange={(e) => setPcode(e.target.value)} />
        <input className="in" style={{ width: 60 }} placeholder={t('arr.posCol', '위치')} value={pos} onChange={(e) => setPos(e.target.value)} />
        <input className="in" style={{ width: 44, textAlign: 'right' }} value={qty} onChange={(e) => setQty(e.target.value)} />
        <button className="b" disabled={pending} onClick={() => start(async () => {
          const r = await addComponent(code, pcode, pos, Math.max(1, Number(qty) || 1))
          setSt(r)
          if (r.ok) { setPcode(''); setPos(''); setQty('1') }
        })}>＋ {t('arr.compHeader', '구성품')}</button>
      </div>
      {st.error ? <div style={{ color: 'var(--err)', marginTop: 3 }}>{st.error}</div> : null}
      {st.ok ? <div style={{ color: 'var(--run)', marginTop: 3 }}>{st.ok}</div> : null}
    </div>
  )
}
