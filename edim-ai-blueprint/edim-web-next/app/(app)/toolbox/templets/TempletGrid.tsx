'use client'

/** Templet 관리 — JSON 정의 편집기 + upsert DRAFT·삭제 (N5b 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { deleteTemplet, saveTemplet, type ActState } from './actions'

export interface TempletRow { name: string; templetType: string; definition: string | Record<string, unknown>; status: string; system: boolean }

// definition 은 API 가 객체로 반환 — React child 로 직접 렌더 불가(잠복 SSR 500 원인)
const defStr = (d: TempletRow['definition']): string =>
  typeof d === 'string' ? d : d ? JSON.stringify(d) : ''

const TYPES = ['FORM', 'DOC', 'REPORT', 'LABEL', 'ETC']

export function TempletGrid({ rows }: { rows: TempletRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<TempletRow>[] = [
    { key: 'name', header: 'Templet', width: 160, code: true, render: (r) => r.name },
    { key: 'type', header: t('templet.typeCol', '유형'), width: 110, align: 'center', sortValue: (r) => r.templetType, render: (r) => r.templetType },
    { key: 'def', header: t('templet.defCol', '정의'), render: (r) => defStr(r.definition) || '—' },
    { key: 'sys', header: t('templet.sysCol', '시스템'), width: 64, align: 'center', sortValue: (r) => (r.system ? 1 : 0), render: (r) => r.system ? <Chip tone="info">{t('templet.system', '시스템')}</Chip> : <Chip tone="ok">{t('templet.custom', '커스텀')}</Chip> },
    { key: 'status', header: t('templet.statusCol', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'ACTIVE' ? 'ok' : 'info'}>{r.status}</Chip> },
  ]
  const [selName, setSelName] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('FORM')
  const [def, setDef] = useState('{}')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.name === selName) ?? null

  const select = (r: TempletRow) => {
    setSelName(r.name); setName(r.name); setType(r.templetType || 'FORM')
    const s = defStr(r.definition) || '{}'
    try { setDef(JSON.stringify(JSON.parse(s), null, 2)) } catch { setDef(s) }
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', gap: 6 }}>
      <div style={{ flex: 1.3, minWidth: 0 }}>
        <DenseGrid prefKey="next-templets" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.name} selectedKey={selName ?? undefined}
          onRowClick={select} emptyText={t('templet.empty', 'Templet 이 없습니다')} />
      </div>
      <div className="gb" style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 6, padding: 8, fontSize: 11, overflow: 'auto' }}>
        <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('templet.editTitle', 'Templet 편집')} {selName ? `— ${selName}` : t('templet.newHint', '(행 클릭 또는 신규)')}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input className="in req" style={{ flex: 1 }} placeholder={t('templet.namePh', 'Templet 이름')} value={name} onChange={(e) => setName(e.target.value)} />
          <select className="in" style={{ width: 84 }} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <textarea className="in" value={def} onChange={(e) => setDef(e.target.value)}
          style={{ fontFamily: 'Consolas, monospace', fontSize: 10.5, flex: 1, minHeight: 180, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="b run" disabled={pending} onClick={() => start(async () => setSt(await saveTemplet(name, type, def)))}>{t('templet.saveDraft', '저장 (DRAFT)')}</button>
          <button className="b" disabled={pending || !sel || sel.system} title={sel?.system ? t('templet.sysNoDelete', '시스템 Templet 삭제 불가') : undefined}
            onClick={() => {
              if (sel && confirm(`${sel.name} 을 삭제하시겠습니까?`))
                start(async () => { setSt(await deleteTemplet(sel.name)); setSelName(null); setName(''); setDef('{}') })
            }}>{t('common.delete', '삭제')}</button>
        </div>
        {st.error ? <div style={{ color: 'var(--err)' }}>{st.error}</div> : null}
        {st.ok ? <div style={{ color: 'var(--run)' }}>{st.ok}</div> : null}
      </div>
    </div>
  )
}
