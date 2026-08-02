'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Card } from '@/components/ui'

export type StockRow = { key: string; total: number; inUse: number; idle: number; etc: number }
type Dim = 'cat' | 'dept' | 'loc'

/** 재고 보유 현황 — 제품안내서 §03 "유형·부서·위치별 보유 현황". 세 기준을 세그먼트로 전환한다.
 *  각 셀은 자산 대장으로 드릴다운(유형=cat 파라미터, 부서·위치=검색 q — 대장 검색이 부서·위치를 매칭). */
export function StockBreakdown(props: { byCat: StockRow[]; byDept: StockRow[]; byLoc: StockRow[]; total: number; canExportStock: boolean }) {
  const [dim, setDim] = useState<Dim>('cat')
  const data = dim === 'cat' ? props.byCat : dim === 'dept' ? props.byDept : props.byLoc
  const colLabel = dim === 'cat' ? '유형' : dim === 'dept' ? '부서' : '위치'

  // 드릴 링크 — 유형은 cat 파라미터로 정확 필터, 부서·위치는 대장 검색(q)으로 매칭
  const drill = (key: string, status?: string) => {
    const sp = new URLSearchParams()
    if (dim === 'cat') sp.set('cat', key)
    else sp.set('q', key)
    if (status) sp.set('status', status)
    return `/assets/register?${sp.toString()}`
  }

  return (
    <Card kicker="Stock" title="보유 현황 — 유형·부서·위치별" pad={false}
      actions={
        <span className="hstack" style={{ gap: 8 }}>
          <div className="seg">
            {([['cat', '유형별'], ['dept', '부서별'], ['loc', '위치별']] as const).map(([id, label]) => (
              <button key={id} className={dim === id ? 'on' : ''} onClick={() => setDim(id)}>{label}</button>
            ))}
          </div>
          {props.canExportStock && <a className="btn sm" href="/api/export/stock" download>⤓ 재고 엑셀</a>}
        </span>
      }>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>{colLabel}</th><th className="num">보유</th><th className="num">사용중</th><th className="num">유휴·반납</th><th className="num">기타</th></tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.key}>
                <td className="strong"><Link href={drill(r.key)} title={`${r.key} 자산 대장에서 보기`}>{r.key}</Link></td>
                <td className="num"><Link href={drill(r.key)}>{r.total}</Link></td>
                <td className="num">{r.inUse > 0 ? <Link href={drill(r.key, '사용중')}>{r.inUse}</Link> : r.inUse}</td>
                <td className="num">{r.idle > 0 ? <Link href={drill(r.key, '유휴')}>{r.idle}</Link> : r.idle}</td>
                <td className="num mute">{r.etc}</td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={5}><div className="empty">집계할 자산이 없습니다.</div></td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td>합계</td>
              <td className="num">{props.total}</td>
              <td className="num">{data.reduce((n, r) => n + r.inUse, 0)}</td>
              <td className="num">{data.reduce((n, r) => n + r.idle, 0)}</td>
              <td className="num">{data.reduce((n, r) => n + r.etc, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}
