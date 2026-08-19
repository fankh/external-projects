'use client'
import { useState, useTransition } from 'react'
import { notifyReplacement } from './actions'

/** 교체 검토 통보 버튼 — 수명예측 패널에서 교체 대상 자산의 소유 부서에 교체 검토를 요청한다(AI 기능 03 조치 접점).
 *  수명예측(검출)을 교체 검토 통보(조치)로 잇는다 — EOL 업그레이드 통보의 수명예측 판. 자산담당·Admin 만 노출(page 게이트). */
export function ReplacementNotifyButton() {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  return (
    <span className="hstack" style={{ gap: 8, alignItems: 'center' }}>
      <button className="btn sm pri" disabled={pending}
        onClick={() => startTransition(async () => setMsg((await notifyReplacement()).message))}
        title="교체 대상 자산의 소유 부서에 교체 검토를 요청 — 당일 중복 발송은 차단됩니다">교체 검토 통보</button>
      {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
    </span>
  )
}
