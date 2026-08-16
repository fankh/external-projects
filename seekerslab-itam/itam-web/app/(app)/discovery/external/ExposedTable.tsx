'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { ExternalAsset, ReconcileState } from '@/lib/types'
import { acceptExternalRisk, requestExternalAction, requestExternalActionMany, revokeExternalRisk } from './actions'

const STATE_TONE: Record<ReconcileState, 'ok' | 'warn' | 'err' | 'neutral'> = {
  '등록·일치': 'ok', '등록·불일치': 'warn', 미등록: 'err', 미확인: 'neutral',
}

export function ExposedTable({ externals, canAct }: { externals: ExternalAsset[]; canAct: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [acceptId, setAcceptId] = useState<string | null>(null)
  const [acceptReason, setAcceptReason] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  // 미조치·생존 확인된 건만 선택 대상 — 재탐지·CVE 스윕으로 다수 노출 호스트가 잡히면 선택해 한 번에 편입/차단한다(미확인은 생존 확인이 먼저)
  const selectable = externals.filter((e) => !e.action && e.alive)
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((e) => checked.has(e.id))

  const act = (id: string, kind: '편입' | '차단') => {
    setBusy(id)
    startTransition(async () => {
      const r = await requestExternalAction(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const bulkAct = (kind: '편입' | '차단') => startTransition(async () => {
    const r = await requestExternalActionMany([...checked], kind)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const accept = (id: string) => startTransition(async () => {
    const r = await acceptExternalRisk(id, acceptReason)
    setMsg(r.message); if (r.ok) { setAcceptId(null); setAcceptReason('') }
  })
  const revoke = (id: string) => startTransition(async () => setMsg((await revokeExternalRisk(id)).message))

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      {canAct && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 조치:</span>
          <button className="btn sm" disabled={pending} onClick={() => bulkAct('편입')}>편입 요청 ({checked.size})</button>
          <button className="btn sm danger" disabled={pending} onClick={() => bulkAct('차단')}>차단 요청 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canAct && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 외부 노출 전체 선택"
                  onChange={(ev) => setChecked(ev.target.checked ? new Set(selectable.map((e) => e.id)) : new Set())} />
              </th>}
              <th>ID</th><th>호스트</th><th>IP</th><th>발견 방법</th><th className="c">방식</th>
              <th className="c">생존</th><th>노출 서비스</th><th>CVE</th><th className="c">대사</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {externals.map((e) => (
              <tr key={e.id}>
                {canAct && <td className="c" onClick={(ev) => ev.stopPropagation()}>
                  {!e.action && e.alive && <input type="checkbox" checked={checked.has(e.id)} disabled={pending} aria-label={`${e.host} 선택`} onChange={() => toggle(e.id)} />}
                </td>}
                <td className="code">{e.id}</td>
                <td className="strong">{e.host}</td>
                <td className="tnum">{e.ip ?? '-'}</td>
                <td className="mute">{e.method}</td>
                <td className="c"><Chip tone={e.mode === 'Active' ? 'info' : 'neutral'} bare>{e.mode}</Chip></td>
                <td className="c">{e.alive ? <Chip tone="ok" bare>확인</Chip> : <span className="mut">미확인</span>}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{e.services ?? '-'}</td>
                <td>{e.cve ? <span className="code" style={{ color: 'var(--err)' }}>{e.cve} ({e.cvss})</span> : <span className="mut">-</span>}</td>
                <td className="c"><Chip tone={STATE_TONE[e.state]}>{e.state}</Chip></td>
                <td className="c"><RiskChip risk={e.risk} /></td>
                {canAct && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {e.action === '위험 수용' ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }} title={e.note}>
                        <Chip tone="warn">위험 수용</Chip>
                        <button className="btn sm ghost" disabled={pending} onClick={() => revoke(e.id)} title="위험 수용 해제 — 미조치(편입/차단 대상)로 복귀">해제</button>
                      </span>
                    ) : e.action ? (
                      <Chip tone={e.action.startsWith('차단') ? 'err' : 'info'}>{e.action}</Chip>
                    ) : !e.alive ? (
                      <span className="mut">생존 확인 필요</span>
                    ) : acceptId === e.id ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <input className="input" style={{ height: 26, width: 150 }} placeholder="수용 사유" value={acceptReason} disabled={pending} autoFocus
                          onChange={(ev) => setAcceptReason(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter' && acceptReason.trim()) accept(e.id); if (ev.key === 'Escape') setAcceptId(null) }} />
                        <button className="btn sm pri" disabled={pending || !acceptReason.trim()} onClick={() => accept(e.id)}>확정</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => { setAcceptId(null); setAcceptReason('') }}>취소</button>
                      </span>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm" disabled={pending} onClick={() => act(e.id, '편입')}>{busy === e.id ? '…' : '편입 요청'}</button>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(e.id, '차단')}>차단 요청</button>
                        <button className="btn sm" disabled={pending} onClick={() => { setAcceptId(e.id); setAcceptReason(''); setMsg(null) }} title="편입/차단이 아닌 인지된 노출로 공식 수용(사유 필수)">위험 수용</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>발견에서 조치까지.</b> 외부 노출 자산은 자산 지문으로 내부 6채널 결과와 통합·대사되며, 우리 자산이면
        <b> 편입 요청</b>으로 대장에, 노출 위험이면 <b>차단 요청</b>으로 NAC 격리·노출 차단으로 이어집니다.
        조치 요청은 담당팀 통지와 감사 로그에 남고, 재탐지는 도메인별 주기로 자동 반복됩니다.
      </div>
    </>
  )
}
