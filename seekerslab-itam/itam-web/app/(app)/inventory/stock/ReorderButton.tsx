'use client'
import { useState, useTransition } from 'react'
import { requestReorder } from './actions'

/** 발주 요청 버튼 — 안전재고 경보 카드에서 부족 유형에 대한 보충 발주를 구매·IT기획팀에 요청한다(루프 57 조치).
 *  재고 경보(검출)를 발주 요청(조치)으로 잇는다. 자산담당·Admin 만 노출된다(page 에서 게이트). */
export function ReorderButton() {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <div className="vstack" style={{ gap: 6, alignItems: 'flex-start' }}>
      <button className="btn sm pri" disabled={pending}
        onClick={() => startTransition(async () => setMsg((await requestReorder()).message))}
        title="부족 유형의 보충 발주를 구매·IT기획팀에 요청 — 당일 중복 발송은 차단됩니다">발주 요청 발송</button>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
    </div>
  )
}
