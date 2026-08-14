'use client'
import { useState, useTransition } from 'react'
import { Card } from '@/components/ui'
import type { OpsPolicy } from '@/lib/types'
import { setOpsPolicy } from '../actions'

/** 운영 정책(임계값) 관리 — 코드 상수로 고정돼 표시만 되던 기한·SLA·판정 기준을 운영자가 설정한다.
 *  화면·리포트·스케줄러가 모두 스토어 opsPolicy 를 참조하므로 여기서 바꾸면 전 화면에 반영된다. */
const FIELDS: { key: keyof OpsPolicy; label: string; desc: string; min: number; max: number; unit: string }[] = [
  { key: 'confirmDeadlineDays', label: '소유자 확인 기한', desc: '발견 자산 소유자 확인 요청 응답 기한 — 경과 시 격리 에스컬레이션', min: 3, max: 30, unit: '일' },
  { key: 'approvalSlaDays', label: '결재 SLA', desc: '결재 대기 SLA — 초과 시 대시보드·결재함에 지연 표기', min: 1, max: 14, unit: '일' },
  { key: 'staleVerifyDays', label: '장기 미실측 기준', desc: '최근 실측 경과 기준 — 초과·미실측 시 유령 자산 후보(재물조사 편성)', min: 30, max: 730, unit: '일' },
  { key: 'expiryWindowDays', label: '만료 알림 창', desc: '계약·보증·라이선스 만료 임박 알림 대상 기준', min: 30, max: 365, unit: '일' },
  { key: 'safetyStock', label: '안전재고 기준', desc: '불출형 유형(단말·주변기기) 가용 재고 최소 보유 — 미만 시 재고 부족(발주 검토) 경보', min: 0, max: 50, unit: '대' },
]

export function OpsPolicyPanel({ policy }: { policy: OpsPolicy }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [vals, setVals] = useState<Record<keyof OpsPolicy, string>>({
    confirmDeadlineDays: String(policy.confirmDeadlineDays),
    approvalSlaDays: String(policy.approvalSlaDays),
    staleVerifyDays: String(policy.staleVerifyDays),
    expiryWindowDays: String(policy.expiryWindowDays),
    safetyStock: String(policy.safetyStock),
  })
  const [msg, setMsg] = useState<string | null>(null)

  const open = () => {
    setVals({
      confirmDeadlineDays: String(policy.confirmDeadlineDays),
      approvalSlaDays: String(policy.approvalSlaDays),
      staleVerifyDays: String(policy.staleVerifyDays),
      expiryWindowDays: String(policy.expiryWindowDays),
      safetyStock: String(policy.safetyStock),
    })
    setMsg(null); setEditing(true)
  }
  const save = () => startTransition(async () => {
    const r = await setOpsPolicy({
      confirmDeadlineDays: Number(vals.confirmDeadlineDays),
      approvalSlaDays: Number(vals.approvalSlaDays),
      staleVerifyDays: Number(vals.staleVerifyDays),
      expiryWindowDays: Number(vals.expiryWindowDays),
      safetyStock: Number(vals.safetyStock),
    })
    setMsg(r.message); if (r.ok) setEditing(false)
  })

  return (
    <Card kicker="Policy" title="운영 정책 — 기한 · SLA · 판정 기준"
      actions={!editing
        ? <button className="btn sm" disabled={pending} onClick={open}>정책 편집</button>
        : <span className="hstack" style={{ gap: 6 }}>
            <button className="btn sm pri" disabled={pending} onClick={save}>저장</button>
            <button className="btn sm ghost" disabled={pending} onClick={() => { setEditing(false); setMsg(null) }}>취소</button>
          </span>}>
      <div className="vstack" style={{ gap: 10 }}>
        <div className="dim" style={{ fontSize: 11.5 }}>
          화면·리포트·스케줄러가 공유하는 운영 임계값입니다. 여기서 바꾸면 대시보드 큐·에스컬레이션·만료 알림·재물조사 편성 기준이 함께 반영됩니다.
        </div>
        {FIELDS.map((f) => (
          <div key={f.key} className="hstack" style={{ justifyContent: 'space-between', gap: 14, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{f.label} <span className="mut" style={{ fontWeight: 400, fontSize: 11 }}>({f.min}~{f.max}{f.unit})</span></div>
              <div className="dim" style={{ fontSize: 11.5 }}>{f.desc}</div>
            </div>
            {editing ? (
              <span className="hstack" style={{ gap: 4, flex: 'none' }}>
                <input className="input" type="number" min={f.min} max={f.max} style={{ width: 90, height: 28, fontSize: 12 }}
                  value={vals[f.key]} disabled={pending} onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))} />
                <span className="dim" style={{ fontSize: 11 }}>{f.unit}</span>
              </span>
            ) : (
              <span className="mono" style={{ flex: 'none' }}>{policy[f.key]}{f.unit}</span>
            )}
          </div>
        ))}
        {msg && <div className="mut" style={{ fontSize: 11 }}>{msg}</div>}
      </div>
    </Card>
  )
}
