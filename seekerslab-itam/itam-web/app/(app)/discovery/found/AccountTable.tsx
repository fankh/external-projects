'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { dormantDaysOf } from '@/lib/dates'
import type { AccountFinding } from '@/lib/types'
import { resolveAccountReview, respondToAccount, respondToAccountMany } from '../actions'

const KIND_TONE = { '휴면 관리자 계정': 'err', '미사용 서비스 계정': 'warn', '휴면 사용자 계정': 'neutral' } as const

export function AccountTable({ accounts, canAct, openOnly: openOnlyParam }: { accounts: AccountFinding[]; canAct: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 '휴면 계정 미처리' 큐의 드릴다운 대상. 조치가 끝난 건까지 함께 쌓이는 표라,
  //  큐가 말한 건수를 화면에서 다시 세어야 했다. 큐 링크는 이 필터를 켠 채 화면을 연다.
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = accounts.filter((x) => !x.action).length
  const shown = openOnly ? accounts.filter((x) => !x.action) : accounts

  // 미조치 계정만 선택 대상 — 분기 접근 재인증 스윕에서 미로그인 계정을 한 번에 비활성화/소유자 확인
  const selectable = accounts.filter((a) => !a.action)
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((a) => checked.has(a.id))

  const act = (id: string, kind: '비활성화' | '소유자 확인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToAccount(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const bulkAct = (kind: '비활성화' | '소유자 확인') => startTransition(async () => {
    const r = await respondToAccountMany([...checked], kind)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const resolve = (id: string, keep: boolean) => { setBusy(id); startTransition(async () => { const r = await resolveAccountReview(id, keep); setMsg(r.message); setBusy(null) }) }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '휴면 계정 미처리' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {accounts.length}건</span>
      </div>
      {canAct && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 조치:</span>
          <button className="btn sm danger" disabled={pending} onClick={() => bulkAct('비활성화')}>비활성화 ({checked.size})</button>
          <button className="btn sm" disabled={pending} onClick={() => bulkAct('소유자 확인')}>소유자 확인 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canAct && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 휴면 계정 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((a) => a.id)) : new Set())} />
              </th>}
              <th>계정</th><th>표시명 · 부서</th><th>구분</th><th className="c">소스</th>
              <th>마지막 로그인</th><th className="num">휴면일</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                {canAct && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {!a.action && <input type="checkbox" checked={checked.has(a.id)} disabled={pending} aria-label={`${a.account} 선택`} onChange={() => toggle(a.id)} />}
                </td>}
                <td className="code strong">{a.account}</td>
                <td>
                  {a.displayName} <span className="dim">· {a.dept}</span>
                  {a.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{a.note}</div>}
                </td>
                <td><Chip tone={KIND_TONE[a.kind]} bare>{a.kind}</Chip></td>
                <td className="c"><Chip tone="neutral" bare>{a.source}</Chip></td>
                <td className="tnum">{a.lastLogin === '-' ? <span className="mut">이력 없음</span> : a.lastLogin}</td>
                {/* 휴면 경과일은 마지막 로그인에서 파생한다(lib/dates dormantDaysOf) — 저장 카운터는 시간이 지나면 어긋난다.
                    로그인 이력이 없는 계정은 셀 수 없지만 휴면 위험이 가장 큰 쪽이라 함께 강조한다. */}
                {(() => {
                  const dd = dormantDaysOf(a)
                  return (
                    <td className="num tnum" style={dd === null || dd >= 180 ? { color: 'var(--err)', fontWeight: 700 } : undefined}>
                      {dd === null ? '이력 없음' : dd}
                    </td>
                  )
                })()}
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
            {accounts.length === 0 && <tr><td colSpan={canAct ? 9 : 7}><div className="empty">발견된 휴면 계정이 없습니다</div></td></tr>}
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
