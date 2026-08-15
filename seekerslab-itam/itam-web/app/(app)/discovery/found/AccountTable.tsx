'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { AccountFinding } from '@/lib/types'
import { resolveAccountReview, respondToAccount } from '../actions'

const KIND_TONE = { '휴면 관리자 계정': 'err', '미사용 서비스 계정': 'warn', '휴면 사용자 계정': 'neutral' } as const

export function AccountTable({ accounts, canAct }: { accounts: AccountFinding[]; canAct: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const act = (id: string, kind: '비활성화' | '소유자 확인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToAccount(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const resolve = (id: string, keep: boolean) => { setBusy(id); startTransition(async () => { const r = await resolveAccountReview(id, keep); setMsg(r.message); setBusy(null) }) }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>계정</th><th>표시명 · 부서</th><th>구분</th><th className="c">소스</th>
              <th>마지막 로그인</th><th className="num">휴면일</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className="code strong">{a.account}</td>
                <td>
                  {a.displayName} <span className="dim">· {a.dept}</span>
                  {a.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{a.note}</div>}
                </td>
                <td><Chip tone={KIND_TONE[a.kind]} bare>{a.kind}</Chip></td>
                <td className="c"><Chip tone="neutral" bare>{a.source}</Chip></td>
                <td className="tnum">{a.lastLogin === '-' ? <span className="mut">이력 없음</span> : a.lastLogin}</td>
                <td className="num tnum" style={a.dormantDays >= 180 ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{a.dormantDays}</td>
                <td className="c"><RiskChip risk={a.risk} /></td>
                {canAct && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {a.action === '소유자 확인 요청' ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }} title="소유자 확인 요청에 대한 결과 처리">
                        <Chip tone="info" bare>확인 대기</Chip>
                        <button className="btn sm" disabled={pending} onClick={() => resolve(a.id, true)} title="유효 계정으로 확인 — 휴면 리스크에서 정리">사용 확인</button>
                        <button className="btn sm danger" disabled={pending} onClick={() => resolve(a.id, false)} title="미사용 확정 — 비활성화 집행 요청">비활성화</button>
                      </span>
                    ) : a.action ? (
                      <Chip tone={a.action.startsWith('비활성화') ? 'err' : a.action === '사용 확인' ? 'ok' : 'info'}>{a.action}</Chip>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(a.id, '비활성화')}>{busy === a.id ? '…' : '비활성화'}</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(a.id, '소유자 확인')}>소유자 확인</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {accounts.length === 0 && <tr><td colSpan={canAct ? 8 : 7}><div className="empty">발견된 휴면 계정이 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>계정 위생 — 방치된 접근 경로.</b> AD/IdP·SSO 로그 대조로 일정 기간 로그인 없는 계정을 드러냅니다.
        <b> 보안담당</b>이 확인 후 <b>비활성화</b>(보안운영팀 집행) 또는 <b>소유자 확인</b>(부서 사용 여부 조회)으로
        조치하며, 요청 사실은 담당 채널 통지와 감사 로그에 남습니다. 관리자·서비스 계정의 잔존 권한이 우선 대상입니다.
      </div>
    </>
  )
}
