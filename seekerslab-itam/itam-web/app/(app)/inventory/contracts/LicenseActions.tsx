'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { actOnLicense, sendExpiryNotices } from './actions'

type Row = { id: string; over: boolean; low: boolean; seats: number; pendingApproval?: string }

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
