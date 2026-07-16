'use client'

/** 승인함 — 다중선택 결재(승인/반려·코멘트) 아일랜드 (N1 복구). */
import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { decide, decideBatch, type DecideState } from './actions'

export interface ApprovalRow {
  id: number; assetType: string; target: string; reqKind: string
  requester: string; reqDate: string; stage: string; tested: boolean; requesterLogin: string
}

export function ApprovalGrid({ rows }: { rows: ApprovalRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<ApprovalRow>[] = [
    { key: 'asset', header: t('appr.assetType', '자산유형'), width: 90, align: 'center', sortValue: (r) => r.assetType, render: (r) => r.assetType },
    { key: 'target', header: t('appr.target', '대상'), width: 130, code: true, render: (r) => r.target },
    { key: 'kind', header: t('appr.reqKind', '구분'), width: 90, align: 'center', render: (r) => r.reqKind },
    { key: 'stage', header: t('appr.stage', '단계'), width: 80, align: 'center', render: (r) => r.stage },
    { key: 'requester', header: t('appr.requester', '요청자'), width: 90, align: 'center', render: (r) => r.requester },
    { key: 'date', header: t('appr.reqDate', '요청일'), width: 96, align: 'center', render: (r) => r.reqDate },
    { key: 'tested', header: 'Test', width: 60, align: 'center', sortValue: (r) => (r.tested ? 1 : 0), render: (r) => r.tested ? <Chip tone="ok">{t('approval.testPass', '통과')}</Chip> : <Chip tone="warn">{t('approval.testFail', '미통과')}</Chip> },
  ]
  const [selected, setSelected] = useState<Set<string | number>>(new Set())
  const [comment, setComment] = useState('')
  const [st, setSt] = useState<DecideState>({})
  const [pending, start] = useTransition()

  const run = (approve: boolean) => {
    const ids = [...selected].map(Number)
    if (ids.length === 0) { setSt({ error: t('approval.selectFirst', '결재할 요청을 선택하십시오') }); return }
    start(async () => {
      const r = ids.length === 1
        ? await decide(ids[0], approve, comment)
        : await decideBatch(ids, approve, comment)
      setSt(r)
      if (r.ok) { setSelected(new Set()); setComment('') }
    })
  }

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{t('approval.selectedN', '선택 {n}건').replace('{n}', String(selected.size))}</span>
        <input className="in" style={{ width: 260 }} placeholder={t('approval.commentPh', '결재 의견 (반려 시 필수)')}
          value={comment} onChange={(e) => setComment(e.target.value)} />
        <button className="b run" disabled={pending} onClick={() => run(true)}>{t('common.approve', '승인')}</button>
        <button className="b" disabled={pending} onClick={() => run(false)}>{t('common.reject', '반려')}</button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-approval" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.id} multiSelect selectedKeys={selected} onSelectionChange={setSelected}
          emptyText={t('approval.empty', '대기 중인 승인 요청이 없습니다')} />
      </div>
    </div>
  )
}
