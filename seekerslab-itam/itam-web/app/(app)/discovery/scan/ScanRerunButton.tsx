'use client'
import { useState, useTransition } from 'react'
import { rerunScan } from './actions'

/** 스캔 이력 원클릭 재실행 — 과거 회차의 채널·범위·강도 그대로 다시 돌린다(runScan 안전장치·기록을 그대로 탄다). */
export function ScanRerunButton({ runId }: { runId: string }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <span className="vstack" style={{ gap: 3, alignItems: 'center' }}>
      <button className="btn sm ghost" disabled={pending}
        title="이 회차의 채널·범위·강도 그대로 다시 스캔"
        onClick={() => startTransition(async () => setMsg((await rerunScan(runId)).message))}>
        {pending ? '…' : '재실행'}
      </button>
      {msg && <span className="dim" style={{ fontSize: 10.5, whiteSpace: 'normal', maxWidth: 180, textAlign: 'center' }}>{msg}</span>}
    </span>
  )
}
