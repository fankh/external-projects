'use client'

/** 문서함 — 등록·PDF 미리보기·메타 수정·상세 드릴다운 (N5 복구). */
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { createDocument, updateDocMeta, type ActState } from './actions'

export interface DocRow {
  docNo: string; title: string; person: string; date: string; status: string
  approver: string; appDate: string; version: string; grade: string; docType: string
}

const GRADES = ['GENERAL', 'S-2', 'S-1']

export function DocGrid({ rows }: { rows: DocRow[] }) {
  const router = useRouter()
  const { t } = useI18n()
  const cols: GridColumn<DocRow>[] = [
    { key: 'no', header: t('docmgmt.docNo', '문서번호'), width: 120, code: true, render: (r) => r.docNo },
    { key: 'title', header: t('docmgmt.title', '제목'), render: (r) => r.title },
    { key: 'type', header: t('docmgmt.type', '유형'), width: 84, align: 'center', sortValue: (r) => r.docType, render: (r) => r.docType || '—' },
    { key: 'ver', header: 'Ver', width: 52, align: 'center', render: (r) => r.version || '—' },
    { key: 'grade', header: 'Grade', width: 64, align: 'center', sortValue: (r) => r.grade, render: (r) => r.grade ? <Chip tone="warn">{r.grade}</Chip> : '—' },
    { key: 'status', header: t('docmgmt.status', '상태'), width: 90, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={r.status === 'ACCEPTED' ? 'ok' : 'info'}>{r.status}</Chip> },
    { key: 'approver', header: t('docmgmt.approver', '승인자'), width: 80, align: 'center', render: (r) => r.approver || '—' },
    { key: 'appdate', header: t('docmgmt.appDate', '승인일'), width: 96, align: 'center', render: (r) => r.appDate || '—' },
  ]
  const [regSt, regAction, regPending] = useActionState(createDocument, {} as ActState)
  const [selNo, setSelNo] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.docNo === selNo) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in req" name="docNo" placeholder={t('docmgmt.docNoPh', '문서번호 (DOC-…)')} style={{ width: 116 }} />
        <input className="in req" name="title" placeholder={t('docmgmt.title', '제목')} style={{ width: 160 }} />
        <input className="in" name="docType" placeholder={t('docmgmt.typePh', '유형 (DWG/QUO…)')} style={{ width: 96 }} />
        <select className="in" name="grade" defaultValue="GENERAL" style={{ width: 84 }}>
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
        <button className="b run" type="submit" disabled={regPending}>{t('docmgmt.addDoc', '＋ 문서 등록')}</button>
        {regSt.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error}</span> : null}
        {regSt.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok}</span> : null}
      </form>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
        <span style={{ color: 'var(--txt-dim)' }}>{sel ? `${t('docmgmt.selected', '선택')} ${sel.docNo}` : t('docmgmt.rowHint', '행 클릭=선택 · 더블클릭=상세')}</span>
        <button className="b" disabled={!sel} onClick={() => sel && window.open(`/api/next/bin?kind=docpdf&id=${encodeURIComponent(sel.docNo)}`, '_blank')}>
          {t('docmgmt.pdfPreview', 'PDF 미리보기')} {sel?.grade && sel.grade !== 'GENERAL' ? `(${t('printsetup.watermark', '워터마크')})` : ''}</button>
        <span className="sep" />
        <input className="in" style={{ width: 140 }} placeholder={t('docmgmt.newTitlePh', '새 제목 (메타 수정)')} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
        <select className="in" style={{ width: 90 }} value={newGrade} onChange={(e) => setNewGrade(e.target.value)}>
          <option value="">{t('docmgmt.keepGrade', 'Grade 유지')}</option>
          {GRADES.map((g) => <option key={g}>{g}</option>)}
        </select>
        <button className="b" disabled={pending || !sel || (!newTitle.trim() && !newGrade)} onClick={() => {
          if (!sel) return
          start(async () => {
            setSt(await updateDocMeta(sel.docNo, {
              ...(newTitle.trim() ? { title: newTitle.trim() } : {}),
              ...(newGrade ? { grade: newGrade } : {}),
            }))
            setNewTitle(''); setNewGrade('')
          })
        }}>{t('docmgmt.editMeta', '메타 수정')}</button>
        {st.error ? <span style={{ color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-docs" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.docNo} selectedKey={selNo ?? undefined}
          onRowClick={(r) => setSelNo(r.docNo)}
          onRowDoubleClick={(r) => router.push(`/detail/output?file=${encodeURIComponent(r.title)}&folder=${encodeURIComponent(r.docType || 'DOC')}&fileType=PDF`)}
          emptyText={t('docmgmt.noDocs', '문서가 없습니다')} />
      </div>
    </div>
  )
}
