'use client'
import { useState, useTransition } from 'react'
import { escalateSlaBreach, notifyMaintenanceBudget, remindMaintenanceExecution } from './actions'

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

/** 유지보수 이행 독촉 버튼 — 계약액이 있는데 집행이 전혀 없는 미집행 계약의 주관부서·공급사에 이행 확인·점검 시행을 요청한다.
 *  예산 통보(초과·소진 임박)의 반대편 신호 = 미집행(0%). alert=0 이면 비활성. */
export function MaintenanceExecButton({ alert }: { alert: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8 }}>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      <button className="btn sm" disabled={pending || alert === 0}
        title={alert === 0 ? '미집행(집행률 0%) 유지보수 계약이 없습니다' : '계약액이 있는데 집행이 없는 미집행 계약의 주관부서·공급사에 이행 확인·점검 시행을 요청합니다'}
        onClick={() => startTransition(async () => setMsg((await remindMaintenanceExecution()).message))}>
        미집행 이행 독촉 ({alert})
      </button>
    </span>
  )
}

/** 유지보수 SLA 위반 독촉 버튼 — 계약이 덮는 자산의 열린 수리가 SLA 대응 시한을 넘긴 계약의 주관부서·공급사에 SLA 이행을 촉구한다.
 *  SLA 편집기는 있으나 준수 감시·조치가 없던 공백을 닫는다(로71). alert=0 이면 비활성. */
export function MaintenanceSlaButton({ alert }: { alert: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8 }}>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      <button className="btn sm danger" disabled={pending || alert === 0}
        title={alert === 0 ? 'SLA 위반(대응 시한 초과 열린 수리) 유지보수 계약이 없습니다' : 'SLA 대응 시한을 넘긴 열린 수리를 가진 계약의 주관부서·공급사에 SLA 이행을 촉구합니다'}
        onClick={() => startTransition(async () => setMsg((await escalateSlaBreach()).message))}>
        SLA 위반 독촉 ({alert})
      </button>
    </span>
  )
}
