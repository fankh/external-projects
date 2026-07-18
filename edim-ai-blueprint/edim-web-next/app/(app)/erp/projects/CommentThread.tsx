'use client'

/** U9 Project 중심 대화 (SYS-018·M-15-5, 슬라이드 57·77) — 코멘트 스레드 + QR 진입. */
import { useState, useTransition } from 'react'
import { QrBadge } from '@/components/QrBadge'
import { useI18n } from '@/components/I18nProvider'
import { addComment, deleteComment, type CommentRow } from './commentActions'

export function CommentThread({ projectNo, initial, myLogin }: { projectNo: string; initial: CommentRow[]; myLogin: string }) {
  const { t } = useI18n()
  const [rows, setRows] = useState<CommentRow[]>(initial)
  const [body, setBody] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => start(async () => {
    const r = await addComment(projectNo, body)
    if (r.error) { setErr(r.error); return }
    setErr(null); setBody('')
    if (r.rows) setRows(r.rows)
  })
  const remove = (id: number) => start(async () => {
    const r = await deleteComment(projectNo, id)
    if (r.error) { setErr(r.error); return }
    if (r.rows) setRows(r.rows)
  })

  return (
    <div className="gb" data-comment-thread style={{ padding: 8, fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('prj.commentTitle', '업무 소통')} — {rows.length}</span>
        <span style={{ flex: 1 }} />
        <QrBadge path={`/erp/projects?no=${encodeURIComponent(projectNo)}`} label={projectNo} />
      </div>
      <div style={{ maxHeight: 190, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.length ? rows.map((c) => (
          <div key={c.id} style={{ borderBottom: '1px solid var(--line-soft, #EEF1F6)', paddingBottom: 3 }}>
            <div style={{ display: 'flex', gap: 6, fontSize: 9.5, color: 'var(--txt-mute)' }}>
              <b style={{ color: 'var(--txt-dim)' }}>{c.author}</b><span>{c.at}</span><span style={{ flex: 1 }} />
              {c.author === myLogin ? (
                <span style={{ cursor: 'pointer' }} title={t('common.delete', '삭제')} onClick={() => remove(c.id)}>✕</span>
              ) : null}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
          </div>
        )) : <div style={{ color: 'var(--txt-mute)' }}>{t('prj.noComments', '대화 없음 — 첫 코멘트를 남기십시오')}</div>}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input className="in" style={{ flex: 1 }} placeholder={t('prj.commentPh', '코멘트 입력 (Enter)')}
          value={body} onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !pending) submit() }} />
        <button className="b run" data-comment-send disabled={pending || !body.trim()} onClick={submit}>{t('prj.send', '등록')}</button>
      </div>
      {err ? <div style={{ fontSize: 10, color: 'var(--err)' }}>{err}</div> : null}
    </div>
  )
}
