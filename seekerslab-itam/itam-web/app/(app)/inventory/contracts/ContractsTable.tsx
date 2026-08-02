'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { fmtAmount } from '@/lib/dates'
import type { Contract } from '@/lib/types'
import { addContract, renewContract, terminateContract } from './actions'

type Row = Contract & { d: number | null }

export function AddContract() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'구매' | '유지보수'>('구매')
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [ownerDept, setOwnerDept] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [amount, setAmount] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => startTransition(async () => {
    const r = await addContract({ kind, name, vendor, ownerDept, start, end, amount })
    setMsg(r.message)
    if (r.ok) { setName(''); setVendor(''); setOwnerDept(''); setStart(''); setEnd(''); setAmount(0); setOpen(false) }
  })

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
      <div className="hstack" style={{ gap: 8 }}>
        <button className="btn sm pri" onClick={() => { setOpen((o) => !o); setMsg(null) }}>{open ? '취소' : '＋ 계약 등록'}</button>
        {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      </div>
      {open && (
        <div className="hstack" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as '구매' | '유지보수')}>
            <option value="구매">구매</option><option value="유지보수">유지보수</option>
          </select>
          <input className="input" style={{ width: 190 }} placeholder="계약명" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" style={{ width: 130 }} placeholder="공급사" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <input className="input" style={{ width: 110 }} placeholder="주관부서" value={ownerDept} onChange={(e) => setOwnerDept(e.target.value)} />
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>시작
            <input className="input" style={{ width: 120 }} placeholder="YYYY-MM-DD" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>만료
            <input className="input" style={{ width: 120 }} placeholder="YYYY-MM-DD" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>금액
            <input className="input" type="number" min={0} style={{ width: 120 }} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />원
          </label>
          <button className="btn pri" disabled={pending || !name.trim() || !vendor.trim() || !ownerDept.trim()} onClick={submit}>등록</button>
        </div>
      )}
    </div>
  )
}

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
  const [termId, setTermId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const renew = (id: string, term: number) => {
    startTransition(async () => {
      const r = await renewContract(id, term)
      setMsg(r.message)
      setOpenId(null)
    })
  }
  const terminate = (id: string) => {
    startTransition(async () => {
      const r = await terminateContract(id, reason)
      setMsg(r.message)
      if (r.ok) { setTermId(null); setReason('') }
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
              <th className="num">금액</th><th className="num">자산</th><th>만료일</th><th className="c">상태</th><th className="c">관리</th>
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
                <td className="c">{c.status === '해지' ? <Chip tone="neutral">해지</Chip> : <StatusChip d={c.d} />}</td>
                <td className="c">
                  {c.status === '해지' ? (
                    <span className="mut" title={`${c.terminatedAt ?? ''} 해지`}>—</span>
                  ) : openId === c.id ? (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      {[1, 2, 3].map((y) => (
                        <button key={y} className="btn sm pri" disabled={pending} onClick={() => renew(c.id, y)}>{y}년</button>
                      ))}
                      <button className="btn sm ghost" disabled={pending} onClick={() => setOpenId(null)}>취소</button>
                    </span>
                  ) : termId === c.id ? (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      <input className="input" style={{ width: 130, height: 26 }} autoFocus placeholder="해지 사유"
                        value={reason} disabled={pending} onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) terminate(c.id) }} />
                      <button className="btn sm danger" disabled={pending || !reason.trim()} onClick={() => terminate(c.id)}>해지</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setTermId(null); setReason('') }}>취소</button>
                    </span>
                  ) : (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      <button className="btn sm" disabled={pending}
                        onClick={() => { setOpenId(c.id); setTermId(null); setMsg(null) }}
                        title="계약 기간 연장 (1·2·3년)">갱신</button>
                      <button className="btn sm danger" disabled={pending}
                        onClick={() => { setTermId(c.id); setReason(''); setOpenId(null); setMsg(null) }}
                        title="계약 조기 해지">해지</button>
                    </span>
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
