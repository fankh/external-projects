'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { reportLostStolen } from '@/app/(app)/assets/register/actions'

type Target = { ref: string; label: string; location: string; note: string; inLedger: boolean }

/** 미실사 남은 대상 — 자동 편성 회차(미확인·장기 미실측)에서 아직 스캔되지 않은 대상. 실사자가 무엇을 더 찾아야 하는지 보여주고,
 *  끝내 찾지 못한 대장 자산은 분실 신고로 이어 회수·폐기 절차(분실 루프 로30)로 넘긴다 — 유령 후보가 회차마다 재편성만 되는 공백을 닫는다. */
export function UnscannedTargets({ targets, roundName }: { targets: Target[]; roundName: string }) {
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const report = (assetNo: string) => {
    setBusy(assetNo)
    startTransition(async () => {
      const r = await reportLostStolen(assetNo, '분실', `재물조사 '${roundName}' 미실사 — 현장 미발견`)
      setMsg(r.message); setBusy(null)
    })
  }

  return (
    <Card kicker="Follow-up · 미실사" title={`미실사 남은 대상 — ${targets.length}건 (유령 자산 후보)`} pad={false}>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>대상</th><th>모델 · 유형</th><th>대장 위치 · IP</th><th>실측 이력</th><th className="c">조치</th></tr></thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.ref}>
                <td className="code">{t.ref}</td>
                <td className="strong">{t.label}</td>
                <td className="dim">{t.location}</td>
                <td className="tnum">{t.note}</td>
                <td className="c">
                  {t.inLedger
                    ? <button className="btn sm danger" disabled={pending}
                        onClick={() => report(t.ref)}
                        title="현장에서 찾지 못한 자산을 분실로 신고 — 회수 시 해제, 미회수 확정 시 폐기">{busy === t.ref ? '…' : '분실 신고'}</button>
                    : <Chip tone="neutral" bare>발견 저장소</Chip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        이 회차 대상 중 아직 실사되지 않은 대장 자산입니다(범위 지정 조사·미확인/장기 미실측 자동 편성 공통).
        현장에서 스캔하면 실측이 확인되고, 끝내 찾지 못한 대장 자산은 <b>분실 신고</b>로 처리하면
        회수·폐기 절차(분실 루프)로 이어집니다.
      </div>
    </Card>
  )
}
