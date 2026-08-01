'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { Approval, Role } from '@/lib/types'
import { answerOwnerConfirm, decide } from './actions'

export function ApprovalList({ approvals, role, dept }: { approvals: Approval[]; role: Role; dept: string }) {
  const [tab, setTab] = useState<'대기' | '전체'>('대기')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const rows = tab === '대기' ? approvals.filter((a) => a.status === '대기') : approvals

  // 소유자 확인은 결재가 아니라 '응답'이다 — 요청받은 부서 본인이 답한다
  const canAnswer = (a: Approval) =>
    a.status === '대기' && a.kind === '소유자 확인' &&
    (['ASSET_MGR', 'ADMIN'].includes(role) || dept === a.dept)

  const canDecide = (a: Approval) =>
    a.status === '대기' && a.kind !== '소유자 확인' &&
    (role === 'ADMIN' || (a.kind === '격리 요청' ? role === 'SEC_MGR' : role === 'ASSET_MGR'))

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
              <th>현재 단계</th><th className="c">상태</th><th className="c">처리</th>
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
                <td className="mute">{a.currentStep}{a.decidedBy ? ` (${a.decidedBy})` : ''}</td>
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
                        onClick={() => startTransition(() => decide(a.id, '승인'))}>승인</button>
                      <button className="btn sm danger" disabled={pending}
                        onClick={() => startTransition(() => decide(a.id, '반려'))}>반려</button>
                    </span>
                  ) : (
                    <span className="mut">{a.status === '대기' ? (a.kind === '소유자 확인' ? '부서 응답 대기' : '권한 없음') : a.decidedAt}</span>
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
