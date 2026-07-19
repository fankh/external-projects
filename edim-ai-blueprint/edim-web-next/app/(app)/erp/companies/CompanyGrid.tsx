'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Btn, Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { toggleCompanyActive, updateCompany, type FormState } from './actions'

export interface CompanyRow {
  companyId?: number; name: string; companyType: string; nation: string
  grade: string; terms: string; remarks?: string; isActive?: boolean
}

const TONE: Record<string, 'ok' | 'warn' | 'info'> = { SUPPLIER: 'info', CUSTOMER: 'ok', PARTNER: 'warn', BANK: 'warn' }

export function CompanyGrid({ rows, selectedId }: { rows: CompanyRow[]; selectedId?: number | null }) {
  const { t } = useI18n()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [edit, setEdit] = useState<CompanyRow | null>(null)
  const [editSt, editAction, editPending] = useActionState(updateCompany, {} as FormState)
  const toggle = (r: CompanyRow) => {
    if (r.companyId == null) return
    start(async () => { await toggleCompanyActive(r.companyId!, r.isActive === false); router.refresh() })
  }
  // 수정 성공 → 다이얼로그 닫기 (성공 문구는 그리드 상단에 유지)
  useEffect(() => { if (editSt.ok) setEdit(null) }, [editSt.ok])
  // 클릭/더블클릭 판별 — dblclick 에 딸린 ?sel RSC 네비게이션이 폼 액션을 무효화하므로 지연 네비
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rowClick = (r: CompanyRow) => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      if (r.companyType === 'SUPPLIER' && r.companyId != null) router.push(`/erp/companies?sel=${r.companyId}`)
    }, 260)
  }
  const rowDblClick = (r: CompanyRow) => {
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    if (r.companyId != null) setEdit(r)
  }

  const cols: GridColumn<CompanyRow>[] = [
    { key: 'name', header: t('company.name', '업체명'), render: (r) => r.name },
    { key: 'type', header: t('company.type', '유형'), width: 78, align: 'center', sortValue: (r) => r.companyType, render: (r) => <Chip tone={TONE[r.companyType] ?? 'info'}>{r.companyType}</Chip> },
    { key: 'nation', header: t('company.nation', '국가'), width: 44, align: 'center', render: (r) => r.nation || '—' },
    { key: 'grade', header: t('company.grade', '평가'), width: 44, align: 'center', render: (r) => r.grade || '—' },
    { key: 'terms', header: t('company.terms', '결제 조건'), render: (r) => r.terms || '—' },
    { key: 'active', header: t('company.statusCol', '상태'), width: 58, align: 'center', sortValue: (r) => (r.isActive === false ? 0 : 1), render: (r) => r.isActive === false ? <Chip tone="warn">{t('access.inactivate', '비활성')}</Chip> : <span style={{ color: 'var(--txt-mute)', fontSize: 10 }}>{t('enum.active', '활성')}</span> },
    { key: 'act', header: '', width: 62, align: 'center', noSort: true, noFilter: true, render: (r) => <Btn style={{ height: 18, fontSize: 9 }} disabled={pending} onClick={() => toggle(r)}>{r.isActive === false ? t('access.reactivate', '재활성') : t('access.inactivate', '비활성')}</Btn> },
  ]

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {editSt.ok ? <div style={{ padding: '2px 6px', fontSize: 11, color: 'var(--run)' }}>{editSt.ok}</div> : null}
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-companies" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.companyId ?? r.name} selectedKey={selectedId ?? undefined}
          onRowClick={rowClick}
          onRowDoubleClick={rowDblClick}
          emptyText={t('company.empty', '거래처가 없습니다')} />
      </div>
      {/* F5 이식 — 더블클릭 수정 다이얼로그 (평가등급·결제조건, 폼 액션) */}
      {edit ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setEdit(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEdit(null) }}>
          <form action={editAction} className="gb" data-com-edit key={edit.companyId}
            style={{ width: 320, padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)' }}>{t('company.editTitle', '거래처 수정')} — {edit.name}</div>
            <input type="hidden" name="companyId" value={edit.companyId} />
            <input type="hidden" name="name" value={edit.name} />
            <div className="frm c2" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'center' }}>
              <label>{t('company.grade', '평가')}</label>
              <input className="in" name="grade" aria-label="평가 등급" defaultValue={edit.grade || ''} autoFocus maxLength={8} />
              <label>{t('company.terms', '결제 조건')}</label>
              <input className="in" name="terms" aria-label="결제 조건" defaultValue={edit.terms || ''} maxLength={60} />
            </div>
            {editSt.error ? <div style={{ color: 'var(--err)' }}>{editSt.error}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button className="b" type="button" onClick={() => setEdit(null)}>{t('common.cancel', '취소')}</button>
              <button className="b pri" type="submit" disabled={editPending}>{t('common.save', '저장')}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
