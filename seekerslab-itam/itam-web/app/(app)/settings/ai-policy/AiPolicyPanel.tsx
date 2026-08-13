'use client'
import { useState, useTransition } from 'react'
import { Card } from '@/components/ui'
import type { AiPolicy } from '@/lib/types'
import { setAiDeployment, setAiModel, toggleAiPolicy } from '../actions'

const DEPLOYMENTS: AiPolicy['deployment'][] = ['온프레미스 LLM', '외부 API 연계', '하이브리드']

const TOGGLES: { field: 'scopeFilter' | 'autoApprove' | 'feedbackLearning'; label: string; desc: string; safeWhen: boolean }[] = [
  { field: 'scopeFilter', label: '권한 범위 필터', desc: '질의 컨텍스트에서 사용자 권한 밖 데이터를 원천 배제', safeWhen: true },
  { field: 'autoApprove', label: 'AI 제안 자동 승인', desc: '담당자 확인·결재 없이 AI 제안을 대장에 반영 (권장하지 않음)', safeWhen: false },
  { field: 'feedbackLearning', label: '판정 결과 재학습', desc: '승인·반려 결과를 환류해 분류 정확도 개선', safeWhen: true },
]

export function AiPolicyPanel({ policy }: { policy: AiPolicy }) {
  const [pending, startTransition] = useTransition()
  const [verOpen, setVerOpen] = useState(false)
  const [em, setEm] = useState(policy.modelId)
  const [ep, setEp] = useState(policy.promptVersion)
  const [verMsg, setVerMsg] = useState<string | null>(null)
  const saveVer = () => startTransition(async () => {
    const r = await setAiModel(em, ep)
    setVerMsg(r.message); if (r.ok) setVerOpen(false)
  })

  return (
    <Card kicker="Policy" title="AI 실행 · 거버넌스 설정">
      <div className="vstack" style={{ gap: 16 }}>
        <div>
          <div className="kicker mute" style={{ marginBottom: 7 }}>실행 환경</div>
          <div className="seg">
            {DEPLOYMENTS.map((d) => (
              <button key={d} className={policy.deployment === d ? 'on' : ''} disabled={pending}
                onClick={() => startTransition(() => setAiDeployment(d))}>{d}</button>
            ))}
          </div>
          <div className="kicker mute" style={{ margin: '14px 0 7px' }}>모델 · 프롬프트 버전 관리</div>
          {!verOpen ? (
            <div className="hstack" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span className="dim" style={{ fontSize: 11.5 }}>모델 <span className="mono">{policy.modelId}</span> · 프롬프트 {policy.promptVersion}</span>
              <button className="btn sm ghost" disabled={pending} title="배포된 모델·프롬프트 버전 변경 관리 기록 (거버넌스 원장 — AI 거버넌스·성능 리포트 근거)"
                onClick={() => { setEm(policy.modelId); setEp(policy.promptVersion); setVerMsg(null); setVerOpen(true) }}>버전 관리</button>
            </div>
          ) : (
            <div className="vstack" style={{ gap: 6 }}>
              <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                <input className="input" style={{ minWidth: 180, height: 27, fontSize: 12 }} value={em} disabled={pending}
                  placeholder="모델 ID (예: claude-opus-5)" onChange={(e) => setEm(e.target.value)} />
                <input className="input" style={{ minWidth: 160, height: 27, fontSize: 12 }} value={ep} disabled={pending}
                  placeholder="프롬프트 버전 (예: v3.3 (2026-08-13))" onChange={(e) => setEp(e.target.value)} />
                <button className="btn sm pri" disabled={pending} onClick={saveVer}>저장</button>
                <button className="btn sm ghost" disabled={pending} onClick={() => { setVerOpen(false); setVerMsg(null) }}>취소</button>
              </div>
            </div>
          )}
          {verMsg && <div className="mut" style={{ fontSize: 11, marginTop: 4 }}>{verMsg}</div>}
        </div>

        <div>
          <div className="kicker mute" style={{ marginBottom: 7 }}>거버넌스 스위치</div>
          <div className="vstack" style={{ gap: 8 }}>
            {TOGGLES.map((t) => {
              const on = policy[t.field]
              const risky = on !== t.safeWhen
              return (
                <div key={t.field} className="hstack" style={{ justifyContent: 'space-between', gap: 14, padding: '9px 12px', border: '1px solid var(--line)', borderRadius: 8, background: risky ? 'var(--err-bg)' : '#fff' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t.label}</div>
                    <div className="dim" style={{ fontSize: 11.5 }}>{t.desc}</div>
                  </div>
                  <button className={`btn sm ${on ? 'pri' : ''}`} disabled={pending} style={{ flex: 'none' }}
                    onClick={() => startTransition(() => toggleAiPolicy(t.field))}>
                    {on ? 'ON' : 'OFF'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
