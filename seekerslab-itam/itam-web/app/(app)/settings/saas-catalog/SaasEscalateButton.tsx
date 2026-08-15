'use client'
import { useState, useTransition } from 'react'
import { escalateSaasReview } from '../actions'

/** SaaS 판정 기한 경과 에스컬레이션 버튼 — 판정 기한(SLA)을 넘긴 검토중 SaaS 를 보안담당에게 판정 요청으로 통보한다.
 *  기한 경과 신호(대시보드·화면)에 실제 조치 채널을 붙인다(유지보수 예산 통보 버튼과 동일 패턴). overdue=0 이면 비활성. */
export function SaasEscalateButton({ overdue }: { overdue: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8, marginTop: 8 }}>
      <button className="btn sm pri" disabled={pending || overdue === 0}
        title={overdue === 0 ? '판정 기한 경과 SaaS 가 없습니다' : '기한 경과 검토중 SaaS 를 보안담당에게 판정 요청으로 통보합니다'}
        onClick={() => startTransition(async () => setMsg((await escalateSaasReview()).message))}>
        판정 기한 경과 에스컬레이션 ({overdue})
      </button>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
    </span>
  )
}
