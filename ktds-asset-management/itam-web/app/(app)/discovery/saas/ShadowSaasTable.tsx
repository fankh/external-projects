'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { SaasUsage } from '@/lib/types'
import { classifyShadowSaas } from './actions'

export function ShadowSaasTable({ rows, canDecide }: { rows: SaasUsage[]; canDecide: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const decide = (service: string, status: '인가' | '차단' | '검토중') => {
    setBusy(service)
    startTransition(async () => {
      const r = await classifyShadowSaas(service, status)
      setMsg(r.message || null)
      setBusy(null)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>서비스</th><th>분류</th><th>주 사용 부서</th><th className="num">추정 사용자</th>
              <th className="num">월 접속</th><th className="c">인가 여부</th><th className="c">위험도</th>
              {canDecide && <th className="c">판정</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id}>
                <td className="strong">{x.service}</td>
                <td className="mute">{x.category}</td>
                <td>{x.dept}</td>
                <td className="num tnum">{x.users.toLocaleString()}</td>
                <td className="num tnum">{x.monthlyVisits.toLocaleString()}</td>
                <td className="c">{x.sanctioned ? <Chip tone="ok">인가</Chip> : <Chip tone="err">미인가</Chip>}</td>
                <td className="c"><RiskChip risk={x.risk} /></td>
                {canDecide && (
                  <td className="c">
                    <span style={{ display: 'inline-flex', gap: 5, justifyContent: 'center' }}>
                      {!x.sanctioned && (
                        <button className="btn sm" disabled={pending} onClick={() => decide(x.service, '인가')}>
                          {busy === x.service ? '…' : '인가'}
                        </button>
                      )}
                      <button className="btn sm danger" disabled={pending} onClick={() => decide(x.service, '차단')}>차단</button>
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
