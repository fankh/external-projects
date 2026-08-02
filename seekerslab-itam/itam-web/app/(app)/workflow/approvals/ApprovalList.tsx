'use client'
import { useMemo, useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { APPROVAL_STEP_ROLE, approvalRoute, approvalStepLabel } from '@/lib/types'
import type { Approval, Role } from '@/lib/types'
import { answerOwnerConfirm, decide, resubmitRequest, withdrawRequest } from './actions'

const WITHDRAWABLE = ['자산 신청', '반납', '이동', '대여']

export function ApprovalList({ approvals, role, dept, viewer, linesByKind, requiredKinds }: {
  approvals: Approval[]; role: Role; dept: string; viewer: string
  linesByKind: Record<string, string[]>; requiredKinds: string[]
}) {
  // 결재함 필터 — 상태·구분·검색·내 상신만 (감사 로그·QnA 와 동일 패턴). 결재 이력이 쌓이므로 필수.
  const [fstatus, setFstatus] = useState<'대기' | '승인' | '반려' | '전체'>('대기')
  const [fkind, setFkind] = useState('전체')
  const [fq, setFq] = useState('')
  const [fmine, setFmine] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [resubmitting, setResubmitting] = useState<string | null>(null)
  const [renote, setRenote] = useState('')
  const [pending, startTransition] = useTransition()

  const canResubmit = (a: Approval) => a.status === '반려' && a.requester === viewer && WITHDRAWABLE.includes(a.kind)
  const resubmit = (id: string) => startTransition(async () => {
    const r = await resubmitRequest(id, renote)
    setMsg(r.message)
    if (r.ok) { setResubmitting(null); setRenote('') }
  })

  const reject = (id: string) => {
    startTransition(async () => {
      const r = await decide(id, '반려', reason)
      setMsg(r.message)
      if (r.ok) { setRejecting(null); setReason('') }
    })
  }

  const kinds = useMemo(() => ['전체', ...[...new Set(approvals.map((a) => a.kind))]], [approvals])
  const rows = useMemo(() => {
    const needle = fq.trim().toLowerCase()
    return approvals.filter((a) => {
      if (fstatus !== '전체' && a.status !== fstatus) return false
      if (fkind !== '전체' && a.kind !== fkind) return false
      if (fmine && a.requester !== viewer) return false
      if (needle && ![a.id, a.title, a.requester].some((f) => f?.toLowerCase().includes(needle))) return false
      return true
    })
  }, [approvals, fstatus, fkind, fmine, fq, viewer])

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

  // 상신 취소 — 본인이 올린 대기 중인 신청(자산 신청·반납·이동)만. 상신 시점엔 대장을 바꾸지 않아 되돌릴 상태가 없다
  const canWithdraw = (a: Approval) => a.status === '대기' && a.requester === viewer && WITHDRAWABLE.includes(a.kind)

  const withdraw = (id: string) =>
    startTransition(async () => setMsg((await withdrawRequest(id)).message))

  return (
    <div>
      <div className="qbar" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <div className="seg">
          {(['대기', '승인', '반려', '전체'] as const).map((st) => (
            <button key={st} className={fstatus === st ? 'on' : ''} onClick={() => setFstatus(st)}>{st}</button>
          ))}
        </div>
        <select className="select" value={fkind} onChange={(e) => setFkind(e.target.value)} style={{ maxWidth: 150 }}>
          {kinds.map((k) => <option key={k} value={k}>{k === '전체' ? '구분 — 전체' : k}</option>)}
        </select>
        <input className="input" style={{ width: 190 }} placeholder="문서번호·제목·기안자 검색" value={fq} onChange={(e) => setFq(e.target.value)} />
        <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
          <input type="checkbox" checked={fmine} onChange={(e) => setFmine(e.target.checked)} /> 내 상신만
        </label>
        <span className="cnt">{rows.length}건 / 전체 {approvals.length}건</span>
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
                    {a.status === '반려' && a.rejectReason && (
                      <span style={{ color: 'var(--err)' }}> · 사유: {a.rejectReason}</span>
                    )}
                  </div>
                  {a.reportRefs && a.reportRefs.length > 0 && (
                    <div className="mut" style={{ fontSize: 10.5, marginTop: 3 }}>
                      📎 근거 리포트: {a.reportRefs.map((id) => (
                        <a key={id} href={`/api/reports/${id}?format=md`} target="_blank" rel="noopener" style={{ marginRight: 6, color: 'var(--accent-deep)' }}>{id}</a>
                      ))}
                    </div>
                  )}
                </td>
                <td className="c">
                  <Chip tone={a.status === '승인' ? 'ok' : a.status === '반려' ? 'err' : a.status === '취소' ? 'neutral' : 'info'}>{a.status}</Chip>
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
                    rejecting === a.id ? (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 4 }}>
                        <input className="input" style={{ width: 150, height: 26 }} autoFocus
                          placeholder="반려 사유" value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) reject(a.id) }} />
                        <button className="btn sm danger" disabled={pending || !reason.trim()} onClick={() => reject(a.id)}>반려 확정</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => { setRejecting(null); setReason('') }}>취소</button>
                      </span>
                    ) : (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                        <button className="btn sm pri" disabled={pending}
                          onClick={() => startTransition(async () => setMsg((await decide(a.id, '승인')).message))}>승인</button>
                        <button className="btn sm danger" disabled={pending}
                          onClick={() => { setRejecting(a.id); setReason(''); setMsg(null) }}>반려</button>
                      </span>
                    )
                  ) : canWithdraw(a) ? (
                    <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                      <span className="mut" style={{ fontSize: 11 }}>{a.currentStep} 대기</span>
                      <button className="btn sm ghost" disabled={pending} onClick={() => withdraw(a.id)}>상신 취소</button>
                    </span>
                  ) : canResubmit(a) ? (
                    resubmitting === a.id ? (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 4 }}>
                        <input className="input" style={{ width: 160, height: 26 }} autoFocus
                          placeholder="재상신 사유 (반려 반영)" value={renote}
                          onChange={(e) => setRenote(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && renote.trim()) resubmit(a.id) }} />
                        <button className="btn sm pri" disabled={pending || !renote.trim()} onClick={() => resubmit(a.id)}>재상신</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => { setResubmitting(null); setRenote('') }}>취소</button>
                      </span>
                    ) : (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                        <span className="mut" style={{ fontSize: 11 }}>{a.decidedAt}</span>
                        <button className="btn sm" disabled={pending} onClick={() => { setResubmitting(a.id); setRenote(''); setMsg(null) }}>재상신</button>
                      </span>
                    )
                  ) : (
                    <span className="mut">{a.status === '대기'
                      ? (a.kind === '소유자 확인' ? '부서 응답 대기' : `${a.currentStep} 대기`)
                      : a.decidedAt}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}><div className="empty">{approvals.length === 0 ? '결재 문서가 없습니다' : '조건에 맞는 결재 문서가 없습니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
