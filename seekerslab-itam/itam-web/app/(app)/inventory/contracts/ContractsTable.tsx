'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { fmtAmount } from '@/lib/dates'
import type { Contract } from '@/lib/types'
import { renewContract } from './actions'

type Row = Contract & { d: number | null }

function StatusChip({ d }: { d: number | null }) {
  if (d === null) return <Chip tone="ok">정상</Chip>
  if (d < 0) return <Chip tone="err">만료됨</Chip>
  if (d <= 35) return <Chip tone="err">D-{d}</Chip>
  if (d <= 90) return <Chip tone="warn">D-{d}</Chip>
  return <Chip tone="ok">정상</Chip>
}

export function ContractsTable({ rows }: { rows: Row[] }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const renew = (id: string, term: number) => {
    startTransition(async () => {
      const r = await renewContract(id, term)
      setMsg(r.message)
      setOpenId(null)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>계약번호</th><th>구분</th><th>계약명</th><th>공급사</th><th>주관부서</th>
              <th className="num">금액</th><th className="num">자산</th><th>만료일</th><th className="c">상태</th><th className="c">갱신</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="code">{c.id}</td>
                <td>{c.kind}</td>
                <td className="strong">{c.name}</td>
                <td>{c.vendor}</td>
                <td className="mute">{c.ownerDept}</td>
                <td className="num tnum">{fmtAmount(c.amount)}원</td>
                <td className="num tnum">{c.assetCount}</td>
                <td className="tnum">{c.end}</td>
                <td className="c"><StatusChip d={c.d} /></td>
                <td className="c">
                  {openId === c.id ? (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      {[1, 2, 3].map((y) => (
                        <button key={y} className="btn sm pri" disabled={pending} onClick={() => renew(c.id, y)}>{y}년</button>
                      ))}
                      <button className="btn sm ghost" disabled={pending} onClick={() => setOpenId(null)}>취소</button>
                    </span>
                  ) : (
                    <button className="btn sm" disabled={pending}
                      onClick={() => { setOpenId(c.id); setMsg(null) }}
                      title="계약 기간 연장 (1·2·3년)">갱신</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
