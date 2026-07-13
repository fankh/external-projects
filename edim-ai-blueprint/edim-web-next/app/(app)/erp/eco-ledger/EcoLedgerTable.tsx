'use client'

import { useMemo, useState } from 'react'

export interface EcoRow {
  ecoNo: string; title: string; targetType: 'DRAWING' | 'CODE'; targetNo: string
  status: string; reason: string; createdBy: string; createdAt: string; appliedAt: string
  changeType: string; revTransition: string
}

const STATUS = ['전체', 'SUBMITTED', 'APPROVED', 'APPLIED', 'REJECTED', 'DRAFT']
const TTYPE = ['전체', 'DRAWING', 'CODE']

/** SSR 초기 rows 를 받아 클라이언트에서 필터(상호작용 아일랜드). */
export function EcoLedgerTable({ rows }: { rows: EcoRow[] }) {
  const [status, setStatus] = useState('전체')
  const [ttype, setTtype] = useState('전체')

  const shown = useMemo(() => rows.filter((r) =>
    (status === '전체' || r.status === status) && (ttype === '전체' || r.targetType === ttype)), [rows, status, ttype])

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 4px 6px' }}>
        <label style={{ fontSize: 11 }}>상태</label>
        <select className="in" value={status} onChange={(e) => setStatus(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ fontSize: 11 }}>대상</label>
        <select className="in" value={ttype} onChange={(e) => setTtype(e.target.value)} style={{ height: 22, fontSize: 11 }}>
          {TTYPE.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 10.5, color: 'var(--txt-mute)' }}>{shown.length} / {rows.length}건</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--line)' }}>
        <table className="g" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>ECO 번호</th><th>제목</th><th>대상유형</th><th>대상</th>
              <th>변경유형</th><th>Rev 전이</th><th>상태</th><th>등록자</th><th>등록일시</th><th>적용일시</th>
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
