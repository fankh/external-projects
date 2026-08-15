'use client'
import { useState, useTransition } from 'react'
import { collectLicenseUsage } from './actions'

/** 사용 수집 트리거(§03 라이선스 STEP2) — EDR 설치 SW 인벤토리를 다시 읽어 좌석 대사를 최신화한다. 자산담당·Admin. */
export function UsageCollect({ lastCollectedAt, canEdit }: { lastCollectedAt?: string; canEdit: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const go = () => startTransition(async () => { const r = await collectLicenseUsage(); setMsg(r.message) })
  return (
    <span className="hstack" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {lastCollectedAt && <span className="dim" style={{ fontSize: 11 }}>최근 수집 {lastCollectedAt}</span>}
      {canEdit && (
        <button className="btn sm" disabled={pending} title="EDR·에이전트 설치 SW 인벤토리를 수집해 배정 좌석과 대사" onClick={go}>
          {pending ? '수집 중…' : '사용 수집'}
        </button>
      )}
      {msg && <span className="dim" style={{ fontSize: 11 }}>{msg}</span>}
    </span>
  )
}
