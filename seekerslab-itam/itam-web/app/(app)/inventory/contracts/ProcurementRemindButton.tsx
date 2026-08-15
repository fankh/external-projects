'use client'
import { useState, useTransition } from 'react'
import { remindProcurement } from './actions'

/** 발주 이행 독촉 버튼 — 발주 미이행(발주율 저조·만료 임박) 구매 계약의 주관부서·공급사·구매팀에 발주·검수 이행을 재촉한다.
 *  발주 미이행 위험 판정(화면·대시보드)에 실제 조치 채널을 붙인다(유지보수 예산 통보 버튼과 동일 패턴). atRisk=0 이면 비활성. */
export function ProcurementRemindButton({ atRisk }: { atRisk: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8 }}>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      <button className="btn sm pri" disabled={pending || atRisk === 0}
        title={atRisk === 0 ? '발주 미이행 위험 계약이 없습니다' : '발주 미이행·만료 임박 계약의 주관부서·공급사·구매팀에 만료 전 발주·검수 이행을 요청합니다'}
        onClick={() => startTransition(async () => setMsg((await remindProcurement()).message))}>
        발주 이행 독촉 ({atRisk})
      </button>
    </span>
  )
}
