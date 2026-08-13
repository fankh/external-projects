'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { SwAllowEntry } from '@/lib/types'
import { removeSwAllow } from '../actions'

/** SW 예외 승인 목록(화이트리스트) — 보안담당이 관리하는 미인가 SW 정책의 허용 축(제품안내서 §01 보안담당: 미인가 SW 정책 관리).
 *  예외 승인 시 이 목록에 등재되어 같은 SW 재검출 시 참조되고, 해제하면 다시 정책 대상이 된다. 자산담당은 조회만. */
export function SwAllowlistPanel({ entries, canManage }: { entries: SwAllowEntry[]; canManage: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const remove = (name: string) => {
    setBusy(name)
    startTransition(async () => {
      const r = await removeSwAllow(name)
      setMsg(r.message); setBusy(null)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>소프트웨어</th><th>승인 근거</th><th>승인자</th><th>승인일</th>
              {canManage && <th className="c">정책</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name}>
                <td className="strong">{e.name} <Chip tone="info" bare>업무 허용</Chip></td>
                <td className="dim" style={{ whiteSpace: 'normal' }}>{e.note ?? '-'}</td>
                <td>{e.approvedBy}</td>
                <td className="tnum">{e.approvedAt}</td>
                {canManage && (
                  <td className="c">
                    <button className="btn sm ghost" disabled={pending} onClick={() => remove(e.name)}
                      title="화이트리스트에서 제거 — 다시 미인가 SW 정책 대상이 됩니다">{busy === e.name ? '…' : '해제'}</button>
                  </td>
                )}
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={canManage ? 5 : 4}><div className="empty">예외 승인된 SW가 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>미인가 SW 정책의 허용 축.</b> 예외 승인한 SW는 여기 화이트리스트에 등재되어 같은 SW가 다른 자산에서 재검출돼도
        이미 허용된 정책으로 참조됩니다. <b>해제</b>하면 그 SW는 다시 미인가 SW 정책 대상으로 전환됩니다 — 금지 축(제거 요청)과
        함께 <b>보안담당</b>이 관리하는 설치 SW 정책입니다.
      </div>
    </>
  )
}
