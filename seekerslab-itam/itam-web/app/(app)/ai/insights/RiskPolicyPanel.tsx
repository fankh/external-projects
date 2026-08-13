'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { RiskPolicy } from '@/lib/types'
import { setRiskPolicy } from './actions'

/** 위험도 기준 관리 — 보안담당이 취약점 우선순위 P1/P2 컷오프를 설정한다(제품안내서 §01 역할: 보안담당 위험도 기준 관리).
 *  취약점 우선순위 화면·리포트가 같은 스토어 정책을 참조하므로 여기서 바꾸면 P1/P2/P3 분류가 전 화면에 즉시 반영된다.
 *  자산담당은 조회만(canEdit=false) — 편집 액션은 서버가 SEC_MGR·ADMIN 으로 다시 강제한다. */
export function RiskPolicyPanel({ policy, canEdit }: { policy: RiskPolicy; canEdit: boolean }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [p1, setP1] = useState(String(policy.p1MinScore))
  const [p2, setP2] = useState(String(policy.p2MinScore))
  const [msg, setMsg] = useState<string | null>(null)

  const open = () => { setP1(String(policy.p1MinScore)); setP2(String(policy.p2MinScore)); setMsg(null); setEditing(true) }
  const save = () => startTransition(async () => {
    const r = await setRiskPolicy({ p1MinScore: Number(p1), p2MinScore: Number(p2) })
    setMsg(r.message)
    if (r.ok) setEditing(false)
  })

  return (
    <Card kicker="Risk Criteria · 보안담당 관리" title="위험도 기준 — 취약점 우선순위 판정 컷오프"
      actions={canEdit
        ? (!editing
            ? <button className="btn sm" disabled={pending} onClick={open}>기준 변경</button>
            : <span className="hstack" style={{ gap: 6 }}>
                <button className="btn sm pri" disabled={pending} onClick={save}>저장</button>
                <button className="btn sm ghost" disabled={pending} onClick={() => { setEditing(false); setMsg(null) }}>취소</button>
              </span>)
        : <span className="dim" style={{ fontSize: 11.5 }}>보안담당·Admin 이 관리</span>}>
      <div className="vstack" style={{ gap: 10 }}>
        <div className="dim" style={{ fontSize: 11.5 }}>
          점수 = 노출도(심각도) × 자산 중요도, 0~100 정규화. 기준을 바꾸면 아래 표와 취약점 조치 우선순위 리포트의 P1/P2/P3 분류가 즉시 재계산됩니다.
        </div>
        {!editing ? (
          <div className="hstack" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="hstack" style={{ gap: 6 }}><Chip tone="err">P1</Chip> 점수 <b className="mono">{`${policy.p1MinScore} 이상`}</b> — 즉시 조치</span>
            <span className="hstack" style={{ gap: 6 }}><Chip tone="warn">P2</Chip> 점수 <b className="mono">{`${policy.p2MinScore}~${policy.p1MinScore - 1}`}</b> — 우선 조치</span>
            <span className="hstack" style={{ gap: 6 }}><Chip tone="neutral">P3</Chip> 점수 <b className="mono">{`${policy.p2MinScore - 1} 이하`}</b> — 계획 조치</span>
          </div>
        ) : (
          <div className="hstack" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="vstack" style={{ gap: 3 }}>
              <span className="kicker mute">P1 최소 점수 <span className="mut" style={{ fontWeight: 400 }}>(1~100)</span></span>
              <input className="input" type="number" min={1} max={100} style={{ width: 100, height: 28, fontSize: 12 }}
                value={p1} disabled={pending} onChange={(e) => setP1(e.target.value)} />
            </label>
            <label className="vstack" style={{ gap: 3 }}>
              <span className="kicker mute">P2 최소 점수 <span className="mut" style={{ fontWeight: 400 }}>(P1 미만)</span></span>
              <input className="input" type="number" min={1} max={100} style={{ width: 100, height: 28, fontSize: 12 }}
                value={p2} disabled={pending} onChange={(e) => setP2(e.target.value)} />
            </label>
          </div>
        )}
        {msg && <div className="mut" style={{ fontSize: 11 }}>{msg}</div>}
      </div>
    </Card>
  )
}
