'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { actOnLicense, addLicense, sendExpiryNotices } from './actions'

type Row = { id: string; over: boolean; low: boolean; seats: number; pendingApproval?: string }

export function AddLicense() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [purchased, setPurchased] = useState(10)
  const [expiry, setExpiry] = useState('')
  const [unitCost, setUnitCost] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => startTransition(async () => {
    const r = await addLicense({ name, vendor, purchased, expiry, unitCost })
    setMsg(r.message)
    if (r.ok) { setName(''); setVendor(''); setPurchased(10); setExpiry(''); setUnitCost(0); setOpen(false) }
  })

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
      <div className="hstack" style={{ gap: 8 }}>
        <button className="btn sm pri" onClick={() => { setOpen((o) => !o); setMsg(null) }}>{open ? '취소' : '＋ 라이선스 등록'}</button>
        {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      </div>
      {open && (
        <div className="hstack" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 200 }} placeholder="라이선스명" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" style={{ width: 140 }} placeholder="공급사" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>보유
            <input className="input" type="number" min={1} style={{ width: 80 }} value={purchased} onChange={(e) => setPurchased(Number(e.target.value))} />석
          </label>
          <input className="input" style={{ width: 130 }} placeholder="만료 YYYY-MM-DD (또는 -)" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>단가
            <input className="input" type="number" min={0} style={{ width: 110 }} value={unitCost} onChange={(e) => setUnitCost(Number(e.target.value))} />원
          </label>
          <button className="btn pri" disabled={pending || !name.trim() || !vendor.trim()} onClick={submit}>등록</button>
        </div>
      )}
    </div>
  )
}

export function ExpiryNoticeButton({ due }: { due: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8 }}>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      <button className="btn sm pri" disabled={pending || due === 0}
        onClick={() => startTransition(async () => setMsg((await sendExpiryNotices()).message))}>
        만료 임박 알림 발송 ({due})
      </button>
    </span>
  )
}

export function LicenseAction({ row }: { row: Row }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (row.pendingApproval) {
    return <Chip tone="info">조치 상신됨 · {row.pendingApproval}</Chip>
  }
  if (!row.over && !row.low) return <span className="mut">—</span>

  const kind = row.over ? '추가 구매' : '회수'
  return (
    <>
      <button className={`btn sm ${row.over ? 'pri' : ''}`} disabled={pending}
        onClick={() => startTransition(async () => setMsg((await actOnLicense(row.id, kind)).message))}>
        {kind} {row.seats}석
      </button>
      {msg && <div className="dim" style={{ fontSize: 11, marginTop: 4, whiteSpace: 'normal' }}>{msg}</div>}
    </>
  )
}
