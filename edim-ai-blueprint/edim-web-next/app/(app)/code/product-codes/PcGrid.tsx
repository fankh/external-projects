'use client'

/** 제품 코드 마스터 — 등록·상태 전이·삭제 (N4 복구). */
import { useActionState, useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { createProductCode, deleteProductCode, setProductStatus, type ActState } from './actions'

export interface PcRow {
  productCodeId: number; mainCode: string; codeName: string; groupCode: string
  status: string; createdAt: string; refs: number
}

const TONE: Record<string, 'ok' | 'warn' | 'info'> = { APPROVED: 'ok', DRAFT: 'info', INACTIVE: 'warn' }

export function PcGrid({ rows }: { rows: PcRow[] }) {
  const { t } = useI18n()
  const cols: GridColumn<PcRow>[] = [
    { key: 'code', header: t('master.codeCol', '코드'), width: 130, code: true, render: (r) => r.mainCode },
    { key: 'name', header: t('master.name', '코드명'), render: (r) => r.codeName },
    { key: 'group', header: t('master.group', '그룹'), width: 90, align: 'center', render: (r) => r.groupCode },
    { key: 'status', header: t('master.status', '상태'), width: 84, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={TONE[r.status] ?? 'info'}>{r.status}</Chip> },
    { key: 'refs', header: t('master.refs', '참조'), width: 50, align: 'right', sortValue: (r) => r.refs, render: (r) => r.refs },
    { key: 'at', header: t('master.createdAt', '등록일'), width: 96, align: 'center', render: (r) => r.createdAt },
  ]
  const [regSt, regAction, regPending] = useActionState(createProductCode, {} as ActState)
  const [selId, setSelId] = useState<number | null>(null)
  const [st, setSt] = useState<ActState>({})
  const [pending, start] = useTransition()
  const sel = rows.find((r) => r.productCodeId === selId) ?? null

  const transition = (status: string) => sel && start(async () => setSt(await setProductStatus(sel.productCodeId, status)))

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <form action={regAction} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="in req" name="mainCode" placeholder={t('master.codePh', '코드 (KDP …)')} style={{ width: 120 }} />
        <input className="in req" name="codeName" placeholder={t('master.name', '코드명')} style={{ width: 140 }} />
        <input className="in req" name="groupCode" placeholder={t('master.groupPh', '그룹 (KOF 등)')} style={{ width: 90 }} />
        <button className="b run" type="submit" disabled={regPending}>{t('master.addBtn', '＋ 코드 등록')}</button>
        <span className="sep" />
        <span style={{ fontSize: 11, color: 'var(--txt-dim)' }}>{sel ? `${t('master.selected', '선택')} ${sel.mainCode} (${sel.status})` : t('master.clickSelect', '행 클릭=선택')}</span>
        <button className="b" disabled={pending || !sel || sel.status === 'APPROVED'} onClick={() => transition('APPROVED')}>{t('master.approve', '승인')}</button>
        <button className="b" disabled={pending || !sel || sel.status === 'INACTIVE'} onClick={() => transition('INACTIVE')}>{t('master.inactive', '비활성')}</button>
        <button className="b" disabled={pending || !sel || sel.status === 'DRAFT'} onClick={() => transition('DRAFT')}>{t('master.restore', '복원(DRAFT)')}</button>
        <button className="b" disabled={pending || !sel} onClick={() => {
          if (sel && confirm(`${sel.mainCode} 를 삭제하시겠습니까? (참조 시 거부)`))
            start(async () => { setSt(await deleteProductCode(sel.productCodeId)); setSelId(null) })
        }}>{t('master.delete', '삭제')}</button>
        {(regSt.error || st.error) ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{regSt.error || st.error}</span> : null}
        {(regSt.ok || st.ok) ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{regSt.ok || st.ok}</span> : null}
      </form>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-pc" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.productCodeId} selectedKey={selId ?? undefined}
          onRowClick={(r) => setSelId(r.productCodeId)} emptyText={t('master.empty', '제품 코드가 없습니다')} />
      </div>
    </div>
  )
}
