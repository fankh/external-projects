'use client'

/** 검사·품질 — 검사 등록 + 성적서 PDF (N3b 복구). */
import { useActionState, useState } from 'react'
import { DenseGrid, type GridColumn } from '@/components/DenseGrid'
import { Chip } from '@/components/controls'
import { createInspection, type ActState } from './actions'

export interface QcRow {
  inspNo: string; inspType: string; refNo: string; itemCode: string; itemName: string
  result: string; measured: string; inspector: string; inspectedAt: string
}

const cols: GridColumn<QcRow>[] = [
  { key: 'no', header: '검사번호', width: 110, code: true, render: (r) => r.inspNo },
  { key: 'type', header: '유형', width: 90, align: 'center', sortValue: (r) => r.inspType, render: (r) => r.inspType },
  { key: 'ref', header: '대상', width: 110, code: true, render: (r) => r.refNo || '—' },
  { key: 'item', header: '품목', render: (r) => r.itemName || r.itemCode || '—' },
  { key: 'result', header: '판정', width: 72, align: 'center', sortValue: (r) => r.result, render: (r) => <Chip tone={r.result === 'PASS' ? 'ok' : r.result === 'FAIL' ? 'err' : 'info'}>{r.result}</Chip> },
  { key: 'measured', header: '측정', width: 100, align: 'right', render: (r) => r.measured || '—' },
  { key: 'by', header: '검사자', width: 80, align: 'center', render: (r) => r.inspector || '—' },
  { key: 'at', header: '검사일시', width: 116, align: 'center', render: (r) => r.inspectedAt },
]

export function QcGrid({ rows }: { rows: QcRow[] }) {
  const [st, action, pending] = useActionState(createInspection, {} as ActState)
  const [selNo, setSelNo] = useState<string | null>(null)
  const sel = rows.find((r) => r.inspNo === selNo) ?? null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <form action={action} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="in" name="inspType" defaultValue="INCOMING" style={{ width: 100 }}>
          <option value="INCOMING">수입검사</option><option value="PROCESS">공정검사</option><option value="OUTGOING">출하검사</option>
        </select>
        <input className="in req" name="itemCode" placeholder="품목 코드" style={{ width: 100 }} />
        <input className="in" name="itemName" placeholder="품명" style={{ width: 110 }} />
        <input className="in" name="refNo" placeholder="참조 (PO/WO)" style={{ width: 96 }} />
        <input className="in" name="measured" placeholder="측정값" style={{ width: 80 }} />
        <select className="in" name="result" defaultValue="PASS" style={{ width: 84 }}>
          <option value="PASS">합격</option><option value="COND">조건부</option><option value="FAIL">불합격</option>
        </select>
        <button className="b run" type="submit" disabled={pending}>＋ 검사 등록</button>
        <span className="sep" />
        <button className="b" type="button" title="선택 검사(또는 전체) 성적서 PDF"
          onClick={() => window.open(`/api/qc/certificate${sel ? `?refNo=${encodeURIComponent(sel.refNo || '')}&item=${encodeURIComponent(sel.itemCode || '')}` : ''}`, '_blank')}>
          🖶 성적서 PDF{sel ? ` (${sel.inspNo})` : ''}
        </button>
        {st.error ? <span style={{ fontSize: 11, color: 'var(--err)' }}>{st.error}</span> : null}
        {st.ok ? <span style={{ fontSize: 11, color: 'var(--run)' }}>{st.ok}</span> : null}
      </form>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DenseGrid prefKey="next-qc" colFilter columns={cols} rows={rows}
          rowKey={(r) => r.inspNo} selectedKey={selNo ?? undefined}
          onRowClick={(r) => setSelNo(r.inspNo)} emptyText="검사 기록이 없습니다" />
      </div>
    </div>
  )
}
