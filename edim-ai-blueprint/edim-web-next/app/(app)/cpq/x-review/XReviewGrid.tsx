'use client'

/** X-code 검토 — 행 선택 + 승인/반려 결재 아일랜드 (N1 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { xReview, type XReviewState } from './actions'

export interface XRow {
  selectionId: number; finishedGoodsCode: string; slotValues: Record<string, string>
  projectNo: string; projectName: string; createdAt: string; createdBy: string
}

const cols: GridColumn<XRow>[] = [
  { key: 'code', header: 'X-code', width: 130, code: true, render: (r) => r.finishedGoodsCode },
  { key: 'proj', header: '프로젝트', width: 110, render: (r) => r.projectNo },
  { key: 'pname', header: '프로젝트명', render: (r) => r.projectName || '—' },
  { key: 'slots', header: '구성(슬롯)', render: (r) => Object.entries(r.slotValues || {}).map(([k, v]) => `${k}=${v}`).join(' · ') || '—' },
  { key: 'by', header: '요청자', width: 70, align: 'center', render: (r) => r.createdBy },
  { key: 'at', header: '요청일시', width: 130, align: 'center', render: (r) => r.createdAt },
]

export function XReviewGrid({ rows }: { rows: XRow[] }) {
  const [selId, setSelId] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [st, setSt] = useState<XReviewState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.selectionId === selId) ?? null

  const run = (approve: boolean) => {
    if (!sel) { setSt({ error: '검토할 X-code 견적안을 선택하십시오' }); return }
    start(async () => {
      const r = await xReview(sel.selectionId, approve, comment)
      setSt(r)
      if (r.ok) { setSelId(null); setComment('') }
    })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>
          {sel ? <>대상 <b className="code">{sel.finishedGoodsCode}</b> (#{sel.selectionId})</> : '행을 클릭해 검토 대상을 선택하십시오'}
        </span>
        <input className="in" style={{ width: 260 }} placeholder="검토 의견 (반려 시 필수)"
          value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="b run" disabled={pending || !sel} onClick={() => run(true)}>승인</button>
        <button className="b" disabled={pending || !sel} onClick={() => run(false)}>반려</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-xreview" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.selectionId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.selectionId)}
          emptyText="검토 대기 중인 X-code 가 없습니다" />
      </div>
    </div>
  )
}
