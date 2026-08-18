'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { assignLicenseSeat, requestOffSeatRemoval, unassignLicenseSeat } from './actions'

/** SAM 좌석 대사 인라인 처리 — STEP2 대사에서 검출한 좌석 불일치를 화면 이탈 없이 처리한다(그동안 라이선스 좌석 관리로 이동해야 했다).
 *  배정 밖 설치(무단 사용)는 좌석 배정(합법화) 또는 제거 요청(무단 설치 소거), 미설치 좌석(회수 후보)은 좌석 회수로 여유석을 확보한다. 자산담당·Admin. */
export function SeatResolveCell({ licenseId, assets, kind, canEdit }: { licenseId: string; assets: { assetNo: string; label: string }[]; kind: 'offSeat' | 'unusedSeat'; canEdit: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (assets.length === 0) return <span className="dim">-</span>
  const act = (assetNo: string) => {
    setBusy(assetNo)
    startTransition(async () => {
      const r = kind === 'offSeat' ? await assignLicenseSeat(licenseId, assetNo) : await unassignLicenseSeat(licenseId, assetNo)
      setMsg(r.message); setBusy(null)
    })
  }
  const remove = (assetNo: string) => {
    setBusy(assetNo)
    startTransition(async () => {
      const r = await requestOffSeatRemoval(licenseId, assetNo)
      setMsg(r.message); setBusy(null)
    })
  }
  return (
    <span className="vstack" style={{ gap: 3 }}>
      <Chip tone={kind === 'offSeat' ? 'err' : 'warn'} bare>{assets.length}건</Chip>
      {assets.map((a) => (
        <span key={a.assetNo} className="hstack" style={{ gap: 4, fontSize: 11 }}>
          <span className="dim">{a.assetNo} ({a.label})</span>
          {canEdit && <button className="btn sm ghost" disabled={pending}
            title={kind === 'offSeat' ? '이 자산에 라이선스 좌석 배정 — 무단 사용 합법화' : '미설치 좌석 회수 — 여유석 확보'}
            onClick={() => act(a.assetNo)}>{busy === a.assetNo ? '…' : kind === 'offSeat' ? '좌석 배정' : '좌석 회수'}</button>}
          {canEdit && kind === 'offSeat' && <button className="btn sm ghost" disabled={pending}
            title="배정 밖 설치 제거 요청 — 좌석 배정(구매) 대신 무단 설치를 소거하도록 소유 부서에 통지"
            onClick={() => remove(a.assetNo)}>제거 요청</button>}
        </span>
      ))}
      {msg && <span className="dim" style={{ fontSize: 10.5 }}>{msg}</span>}
    </span>
  )
}
