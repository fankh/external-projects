'use client'
import { useState, useTransition } from 'react'
import { notifyMaintenanceBudget } from './actions'

/** 유지보수 예산 통보 버튼 — 예산 초과·소진 임박 계약의 주관부서·공급사에 재협상·집행 점검을 요청한다.
 *  집행률 판정 신호(대시보드·화면)에 실제 조치 채널을 붙인다(만료 임박 알림 버튼과 동일 패턴). alert=0 이면 비활성. */
export function MaintenanceBudgetButton({ alert }: { alert: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8 }}>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      <button className="btn sm pri" disabled={pending || alert === 0}
        title={alert === 0 ? '예산 초과·소진 임박 계약이 없습니다' : '예산 초과·소진 임박 계약의 주관부서·공급사에 재협상·집행 점검을 요청합니다'}
        onClick={() => startTransition(async () => setMsg((await notifyMaintenanceBudget()).message))}>
        예산 재협상·집행 점검 통보 ({alert})
      </button>
    </span>
  )
}
