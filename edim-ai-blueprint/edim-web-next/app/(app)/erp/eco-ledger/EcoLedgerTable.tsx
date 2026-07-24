'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/components/I18nProvider'

export interface EcoRow {
  ecoNo: string; title: string; targetType: 'DRAWING' | 'CODE'; targetNo: string
  status: string; reason: string; createdBy: string; createdAt: string; appliedAt: string
  changeType: string; revTransition: string
}

const STATUS = ['전체', 'SUBMITTED', 'APPROVED', 'APPLIED', 'REJECTED', 'DRAFT']
const TTYPE = ['전체', 'DRAWING', 'CODE']

/** SSR 초기 rows 를 받아 클라이언트에서 필터(상호작용 아일랜드). */
export function EcoLedgerTable({ rows }: { rows: EcoRow[] }) {
  const { t } = useI18n()
  const [status, setStatus] = useState('전체')
  const [ttype, setTtype] = useState('전체')
  const optLabel = (s: string) => (s === '전체' ? t('common.all', '전체') : s)

  const shown = useMemo(() => rows.filter((r) =>
    (status === '전체' || r.status === status) && (ttype === '전체' || r.targetType === ttype)), [rows, status, ttype])

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 4px 6px' }}>
        <label style={{ fontSize: 11 }}>{t('common.status', '상태')}</label>
        <select className="in" value={status} onChange={(e) => setStatus(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {STATUS.map((s) => <option key={s} value={s}>{optLabel(s)}</option>)}
        </select>
        <label style={{ fontSize: 11 }}>{t('common.target', '대상')}</label>
        <select className="in" value={ttype} onChange={(e) => setTtype(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {TTYPE.map((s) => <option key={s} value={s}>{optLabel(s)}</option>)}
        </select>
        <span style={{ fontSize: 10.5, color: 'var(--txt-mute)' }}>{shown.length} / {rows.length}{t('common.countSuffix', '건')}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--line)' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>{t('ecoL.colNo', 'ECO 번호')}</th><th>{t('common.title', '제목')}</th><th>{t('ecoL.colTargetType', '대상유형')}</th><th>{t('common.target', '대상')}</th>
              <th>{t('ecoL.colChangeType', '변경유형')}</th><th>{t('ecoL.colRevTransition', 'Rev 전이')}</th><th>{t('common.status', '상태')}</th><th>{t('ecoL.colCreatedBy', '등록자')}</th><th>{t('ecoL.colCreatedAt', '등록일시')}</th><th>{t('ecoL.colAppliedAt', '적용일시')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.ecoNo}>
                <td className="code">{r.ecoNo}</td>
                <td>{r.title}</td>
                <td className="c">{r.targetType === 'DRAWING' ? '도면' : '코드'}</td>
                <td className="code">{r.targetNo}</td>
                <td className="c">{r.changeType}</td>
                <td className="c">{r.revTransition}</td>
                <td className="c">{r.status}</td>
                <td className="c">{r.createdBy}</td>
                <td className="c">{r.createdAt}</td>
                <td className="c">{r.appliedAt || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
