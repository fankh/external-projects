'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { APPROVAL_STEP_ROLE, approvalRoute, approvalStepLabel } from '@/lib/types'
import type { Approval, Role } from '@/lib/types'
import { answerOwnerConfirm, decide } from './actions'

export function ApprovalList({ approvals, role, dept, linesByKind, requiredKinds }: {
  approvals: Approval[]; role: Role; dept: string
  linesByKind: Record<string, string[]>; requiredKinds: string[]
}) {
  const [tab, setTab] = useState<'대기' | '전체'>('대기')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const rows = tab === '대기' ? approvals.filter((a) => a.status === '대기') : approvals

  // 소유자 확인은 결재가 아니라 '응답'이다 — 요청받은 부서 본인이 답한다
  const canAnswer = (a: Approval) =>
    a.status === '대기' && a.kind === '소유자 확인' &&
    (['ASSET_MGR', 'ADMIN'].includes(role) || dept === a.dept)

  // 현재 단계의 결재 역할 — 다단계 결재선에서 지금 처리할 수 있는 권한그룹
  const stepRoleOf = (a: Approval): Role | undefined => {
    const route = approvalRoute(linesByKind[a.kind] ?? [])
    const idx = route.indexOf(approvalStepLabel(a.currentStep))
    return idx >= 0 ? APPROVAL_STEP_ROLE[route[idx]] : undefined
  }

  const canDecide = (a: Approval) => {
    if (a.status !== '대기' || a.kind === '소유자 확인') return false
    if (role === 'ADMIN') return true
    const sr = stepRoleOf(a)
    // 매핑되면 현재 단계 역할만, 아니면 레거시(격리=보안담당·그 외=자산담당)
    return sr ? role === sr : a.kind === '격리 요청' ? role === 'SEC_MGR' : role === 'ASSET_MGR'
  }

  return (
    <div>
      <div className="qbar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div className="seg">
          <button className={tab === '대기' ? 'on' : ''} onClick={() => setTab('대기')}>대기</button>
          <button className={tab === '전체' ? 'on' : ''} onClick={() => setTab('전체')}>전체</button>
        </div>
        <span className="cnt">{rows.length}건</span>
      </div>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>문서번호</th><th>구분</th><th>제목</th><th>기안자</th><th>기안일</th>
              <th>결재선</th><th className="c">상태</th><th className="c">처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="code">{a.id}</td>
                <td>
                  <Chip tone={a.kind === '격리 요청' ? 'err' : a.kind === '폐기' ? 'warn' : 'neutral'} bare>{a.kind}</Chip>
                </td>
                <td className="strong" style={{ maxWidth: 380 }}>{a.title}</td>
                <td>{a.requester}<span className="mut"> · {a.dept}</span></td>
                <td className="tnum">{a.requestedAt}</td>
                <td style={{ minWidth: 210 }}>
                  {(() => {
                    const steps = linesByKind[a.kind] ?? []
                    const cur = a.currentStep.replace(/ 결재$/, '')
                    return steps.length > 0 ? (
                      <span className="flow">
                        {steps.map((st, i) => (
                          <span key={st} style={{ display: 'contents' }}>
                            {i > 0 && <span className="ar">→</span>}
                            <span className="fs" style={a.status === '대기' && st === cur
                              ? { background: 'var(--accent-soft)', color: 'var(--accent-deep)', fontWeight: 700 }
                              : undefined}>{st}</span>
                          </span>
                        ))}
                        {requiredKinds.includes(a.kind) && <Chip tone="err" bare>필수</Chip>}
                      </span>
                    ) : <span className="mute">{a.currentStep}</span>
                  })()}
                  <div className="mut" style={{ fontSize: 10.5, marginTop: 3 }}>
                    {a.status === '대기' ? `현재: ${a.currentStep}` : `${a.status} · ${a.decidedBy ?? ''} ${a.decidedAt ?? ''}`}
                  </div>
                </td>
                <td className="c">
                  <Chip tone={a.status === '승인' ? 'ok' : a.status === '반려' ? 'err' : 'info'}>{a.status}</Chip>
                </td>
                <td className="c" style={{ whiteSpace: 'nowrap' }}>
                  {canAnswer(a) ? (
                    <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                      <button className="btn sm pri" disabled={pending}
                        onClick={() => startTransition(async () => setMsg((await answerOwnerConfirm(a.id, true)).message))}>본인 자산</button>
                      <button className="btn sm" disabled={pending}
                        onClick={() => startTransition(async () => setMsg((await answerOwnerConfirm(a.id, false)).message))}>아님</button>
                    </span>
                  ) : canDecide(a) ? (
                    <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                      <button className="btn sm pri" disabled={pending}
                        onClick={() => startTransition(async () => setMsg((await decide(a.id, '승인')).message))}>승인</button>
                      <button className="btn sm danger" disabled={pending}
                        onClick={() => startTransition(async () => setMsg((await decide(a.id, '반려')).message))}>반려</button>
                    </span>
                  ) : (
                    <span className="mut">{a.status === '대기'
                      ? (a.kind === '소유자 확인' ? '부서 응답 대기' : `${a.currentStep} 대기`)
                      : a.decidedAt}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}><div className="empty">결재 대기 건이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
