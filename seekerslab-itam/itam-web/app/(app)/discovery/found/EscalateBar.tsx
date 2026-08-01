'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { escalateUnanswered } from '../actions'

export function EscalateBar(props: { waiting: number; overdue: number; deadlineDays: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="callout">
      <div className="hstack" style={{ gap: 10 }}>
        <div style={{ flex: 1 }}>
          <b>미확인 소유자 정책.</b> 확인 요청에 기한({props.deadlineDays}일) 내 응답이 없는 발견 자산은
          보안담당 검토 → NAC 격리 요청으로 에스컬레이션됩니다.
          <div className="hstack" style={{ gap: 6, marginTop: 6 }}>
            <Chip tone={props.waiting ? 'info' : 'ok'}>응답 대기 {props.waiting}건</Chip>
            <Chip tone={props.overdue ? 'err' : 'ok'}>기한 경과 {props.overdue}건</Chip>
          </div>
        </div>
        <button className="btn danger" disabled={pending || props.overdue === 0}
          onClick={() => startTransition(async () => setMsg((await escalateUnanswered()).message))}>
          미응답 에스컬레이션
        </button>
      </div>
      {msg && <div style={{ marginTop: 10, fontSize: 12 }}>{msg}</div>}
    </div>
  )
}
