'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { actOnLicense, addLicense, assignLicenseSeat, renewLicense, retireLicense, sendExpiryNotices, unassignLicenseSeat } from './actions'
import type { LicenseSeat } from '@/lib/types'

/** 라이선스 해지 — 도구 이관·구독 중단 시 컴플라이언스에서 내린다(계약 해지와 동형). 자산담당·Admin. */
export function LicenseRetire({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const go = () => startTransition(async () => { const r = await retireLicense(id, reason); setMsg(r.message); if (r.ok) setOpen(false) })
  return open ? (
    <span className="hstack" style={{ gap: 4 }}>
      <input className="input" style={{ width: 120, height: 26 }} autoFocus placeholder="해지 사유" value={reason}
        disabled={pending} onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) go() }} />
      <button className="btn sm danger" disabled={pending || !reason.trim()} onClick={go}>해지 확정</button>
      <button className="btn sm ghost" disabled={pending} onClick={() => { setOpen(false); setReason('') }}>취소</button>
      {msg && <span className="dim" style={{ fontSize: 11 }}>{msg}</span>}
    </span>
  ) : (
    <button className="btn sm danger" disabled={pending} title="라이선스 해지 (구독 중단·도구 이관)" onClick={() => { setOpen(true); setMsg(null) }}>해지</button>
  )
}

type Row = { id: string; over: boolean; low: boolean; seats: number; pendingApproval?: string }

/** 라이선스 갱신 — 만료일 옆에서 구독 기간을 연장한다(계약 갱신과 동형). 영구(-) 라이선스는 갱신 컨트롤을 숨긴다. */
export function LicenseRenew({ id, expiry, renewals, canEdit }: { id: string; expiry: string; renewals: number; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const renew = (y: number) => startTransition(async () => { const r = await renewLicense(id, y); setMsg(r.message); if (r.ok) setOpen(false) })
  return (
    <span className="hstack" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <span className="tnum">{expiry}</span>
      {renewals > 0 && <span title="갱신 이력"><Chip tone="ok" bare>갱신 {renewals}회</Chip></span>}
      {canEdit && expiry !== '-' && (open ? (
        <span className="hstack" style={{ gap: 4 }}>
          {[1, 2, 3].map((y) => <button key={y} className="btn sm pri" disabled={pending} onClick={() => renew(y)}>{y}년</button>)}
          <button className="btn sm ghost" disabled={pending} onClick={() => setOpen(false)}>취소</button>
        </span>
      ) : (
        <button className="btn sm" disabled={pending} title="구독 기간 연장 (1·2·3년)" onClick={() => { setOpen(true); setMsg(null) }}>갱신</button>
      ))}
      {msg && <span className="dim" style={{ fontSize: 11, flexBasis: '100%', textAlign: 'right' }}>{msg}</span>}
    </span>
  )
}

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

/** 라이선스 좌석 배정 대장 — 누가 어느 석을 쓰는지 명명형으로 관리하고, 탐지 사용량(used)과 대사해
 *  배정 밖 사용(추적 안 된 설치)을 드러낸다. 배정/회수는 자산담당·Admin, 그 외는 조회만(canEdit). */
export function LicenseSeats({ id, name, purchased, used, seats, canEdit }: { id: string; name: string; purchased: number; used: number; seats: LicenseSeat[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false)
  const [assetNo, setAssetNo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const assigned = seats.length
  const untracked = Math.max(0, used - assigned) // 배정 밖 사용 — 탐지됐으나 좌석 배정이 없는 설치(추적 공백)
  const add = () => startTransition(async () => { const r = await assignLicenseSeat(id, assetNo); setMsg(r.message); if (r.ok) setAssetNo('') })
  const remove = (no: string) => startTransition(async () => setMsg((await unassignLicenseSeat(id, no)).message))
  return (
    <div className="vstack" style={{ gap: 4, alignItems: 'flex-start' }}>
      <button className="btn sm ghost" onClick={() => { setOpen((v) => !v); setMsg(null) }}
        title="라이선스 좌석 배정 대장 — 누가 어느 석을 쓰는지 관리(SAM 감사 증빙)">
        {`${open ? '▾' : '▸'} 배정 ${assigned}/${purchased}석`}
      </button>
      {untracked > 0 && <span title={`탐지 사용 ${used} - 배정 ${assigned} = 좌석 배정이 없는 설치(추적 공백)`}><Chip tone="warn" bare>{`미배정 사용 ${untracked}`}</Chip></span>}
      {open && (
        <div className="vstack" style={{ gap: 6, padding: '6px 0' }}>
          {seats.length > 0 ? seats.map((st) => (
            <div key={st.assetNo} className="hstack" style={{ gap: 6, fontSize: 12 }}>
              <span className="tnum">{st.assetNo}</span>
              <span className="dim">· {st.user} ({st.dept})</span>
              {canEdit && <button className="btn sm ghost" disabled={pending} onClick={() => remove(st.assetNo)} title="좌석 회수(배정 해제)">회수</button>}
            </div>
          )) : <span className="mut" style={{ fontSize: 12 }}>배정된 좌석이 없습니다.</span>}
          {canEdit && (
            <div className="hstack" style={{ gap: 4 }}>
              <input className="input" style={{ width: 150, height: 26 }} placeholder="자산번호 (AST-...)" value={assetNo}
                disabled={pending} onChange={(e) => setAssetNo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && assetNo.trim()) add() }} />
              <button className="btn sm pri" disabled={pending || !assetNo.trim()} onClick={add} title={`${name} 좌석을 자산에 배정`}>좌석 배정</button>
            </div>
          )}
          {msg && <span className="dim" style={{ fontSize: 11 }}>{msg}</span>}
        </div>
      )}
    </div>
  )
}
