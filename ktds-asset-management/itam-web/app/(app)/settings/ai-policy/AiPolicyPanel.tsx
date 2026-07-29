'use client'
import { useTransition } from 'react'
import { Card } from '@/components/ui'
import type { AiPolicy } from '@/lib/types'
import { setAiDeployment, toggleAiPolicy } from '../actions'

const DEPLOYMENTS: AiPolicy['deployment'][] = ['온프레미스 LLM', '외부 API 연계', '하이브리드']

const TOGGLES: { field: 'scopeFilter' | 'autoApprove' | 'feedbackLearning'; label: string; desc: string; safeWhen: boolean }[] = [
  { field: 'scopeFilter', label: '권한 범위 필터', desc: '질의 컨텍스트에서 사용자 권한 밖 데이터를 원천 배제', safeWhen: true },
  { field: 'autoApprove', label: 'AI 제안 자동 승인', desc: '담당자 확인·결재 없이 AI 제안을 대장에 반영 (권장하지 않음)', safeWhen: false },
  { field: 'feedbackLearning', label: '판정 결과 재학습', desc: '승인·반려 결과를 환류해 분류 정확도 개선', safeWhen: true },
]

export function AiPolicyPanel({ policy }: { policy: AiPolicy }) {
  const [pending, startTransition] = useTransition()

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
          <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
            현재 모델 <span className="mono">{policy.modelId}</span> · 프롬프트 {policy.promptVersion}
          </div>
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
