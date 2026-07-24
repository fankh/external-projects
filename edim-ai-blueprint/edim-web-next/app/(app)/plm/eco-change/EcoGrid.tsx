'use client'

import { useState, useTransition } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { getEcoDetail, type EcoDetail } from './actions'

export interface EcoChange {
  ecoNo: string; title: string; targetType: 'DRAWING' | 'CODE'; targetNo: string
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'APPLIED'
  revFrom: string; revTo: string; impactCount: number; createdAt: string; reason: string
}

const STATUS_TONE: Record<EcoChange['status'], 'ok' | 'warn' | 'info' | 'err'> = {
  DRAFT: 'info', SUBMITTED: 'warn', APPROVED: 'ok', REJECTED: 'err', APPLIED: 'ok',
}

export function EcoGrid({ rows, searchActive }: { rows: EcoChange[]; searchActive?: boolean }) {
  const { t } = useI18n()
  // ECO 상세 다이얼로그 (GET /eco/changes/{no}) — 더블클릭 = 영향 분석 포함 상세
  const [detail, setDetail] = useState<EcoDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [, start] = useTransition()
  const openDetail = (r: EcoChange) => start(async () => {
    const res = await getEcoDetail(r.ecoNo)
    if (res.error) { setErr(res.error); return }
    setErr(null); setDetail(res.detail!)
  })
  const cols: GridColumn<EcoChange>[] = [
    { key: 'ecoNo', header: 'ECO No', width: 108, code: true, render: (r) => r.ecoNo },
    { key: 'title', header: t('eco.colTitle', '제목'), render: (r) => r.title },
    { key: 'target', header: t('eco.target', '대상'), width: 120, render: (r) => `${r.targetType === 'DRAWING' ? t('eco.typeDrawing', '도면') : t('eco.typeCode', '코드')} ${r.targetNo}` },
    { key: 'rev', header: 'Rev', width: 78, align: 'center', render: (r) => `${r.revFrom}→${r.revTo}` },
    { key: 'impact', header: t('eco.impact', '영향'), width: 52, align: 'right', sortValue: (r) => r.impactCount, render: (r) => r.impactCount },
    { key: 'status', header: t('eco.status', '상태'), width: 88, align: 'center', sortValue: (r) => r.status, render: (r) => <Chip tone={STATUS_TONE[r.status]}>{r.status}</Chip> },
    { key: 'createdAt', header: t('eco.at', '등록'), width: 88, align: 'center', render: (r) => r.createdAt },
  ]
  const impactEntries = detail?.impact ? Object.entries(detail.impact) : []
  return (
    <>
      {err ? <div style={{ padding: '2px 6px', fontSize: 11, color: 'var(--err)' }}>{err}</div> : null}
      <DenseGrid prefKey="next-eco-change" colFilter columns={cols} rows={rows} rowKey={(r) => r.ecoNo}
        onRowDoubleClick={openDetail} emptyText={searchActive ? t('grid.noSearchResults', '검색 결과가 없습니다 — 검색어를 확인하십시오') : t('eco.gridEmpty', '변경 요청(ECR)이 없습니다')} />
      {detail ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(20,26,40,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDetail(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setDetail(null) }}>
          <div className="gb" data-eco-detail style={{ width: 420, maxHeight: '80vh', overflow: 'auto', padding: 12, background: '#fff', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, color: 'var(--title-navy)', display: 'flex', alignItems: 'center' }}>
              {t('eco.detailTitle', 'ECO 상세')} — {detail.ecoNo}
              <span style={{ flex: 1 }} />
              <Chip tone={STATUS_TONE[detail.status as EcoChange['status']] ?? 'info'}>{detail.status}</Chip>
            </div>
            <table className="g" style={{ width: '100%' }}>
              <tbody>
                <tr><td style={{ width: 80, fontWeight: 600 }}>{t('eco.colTitle', '제목')}</td><td>{detail.title}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>{t('eco.reason', '사유')}</td><td>{detail.reason || '—'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>{t('eco.target', '대상')}</td><td className="code">{detail.targetType} {detail.targetNo}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>Rev</td><td>{detail.revFrom || '—'} → {detail.revTo || '—'}</td></tr>
                <tr><td style={{ fontWeight: 600 }}>{t('eco.at', '등록')}</td><td>{detail.createdAt}{detail.appliedAt ? ` · ${t('eco.appliedAt', '적용')} ${detail.appliedAt}` : ''}</td></tr>
              </tbody>
            </table>
            <div style={{ fontWeight: 600, color: 'var(--title-navy)' }}>{t('eco.impactTitle', '영향 분석 (impact_data)')}</div>
            {impactEntries.length ? (
              <table className="g" style={{ width: '100%' }}>
                <tbody>{impactEntries.map(([k, v]) => (
                  <tr key={k}>
                    <td style={{ width: 110, fontWeight: 600 }}>{k}</td>
                    <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {Array.isArray(v) ? v.map((x) => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div style={{ color: 'var(--txt-mute)' }}>{t('eco.noImpact', '영향 분석 데이터 없음')}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="b" onClick={() => setDetail(null)}>{t('common.close', '닫기')}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
