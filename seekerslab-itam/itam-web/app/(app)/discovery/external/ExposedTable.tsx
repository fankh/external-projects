'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { certLiveness } from '@/lib/easm'
import type { ExternalAsset, ReconcileState } from '@/lib/types'
import { acceptExternalRisk, requestExternalAction, requestExternalActionMany, revokeExternalRisk } from './actions'

const STATE_TONE: Record<ReconcileState, 'ok' | 'warn' | 'err' | 'neutral'> = {
  '등록·일치': 'ok', '등록·불일치': 'warn', 미등록: 'err', 미확인: 'neutral',
}

export function ExposedTable({ externals, canAct, openOnly: openOnlyParam }: { externals: ExternalAsset[]; canAct: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [acceptId, setAcceptId] = useState<string | null>(null)
  const [acceptReason, setAcceptReason] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))

  // 미조치·생존 확인된 건만 선택 대상 — 재탐지·CVE 스윕으로 다수 노출 호스트가 잡히면 선택해 한 번에 편입/차단한다(미확인은 생존 확인이 먼저)
  const selectable = externals.filter((e) => !e.action && e.alive)
  // 노출 위험 높은 순 — CVSS 높은 순 → 위험도(높음 먼저) → 미조치·생존 우선(제품안내서 §04 위험도 분류 → 우선 처리). 보안담당이 최고 노출부터 조치.
  const rw = (r: ExternalAsset['risk']) => (r === '높음' ? 0 : r === '중간' ? 1 : 2)
  const sorted = [...externals].sort((a, b) => (b.cvss ?? 0) - (a.cvss ?? 0) || rw(a.risk) - rw(b.risk) || ((!a.action && a.alive ? 0 : 1) - (!b.action && b.alive ? 0 : 1)))
  // 미조치만 보기 — 대시보드 '외부 노출 미조치' 큐의 드릴다운. 조치 완료분까지 함께 쌓이는 표라 큐가 말한 건수를
  //  화면에서 다시 세어야 했다(발견 자산 화면의 네 조치 표와 같은 규약).
  // 미조치 판정은 대시보드 큐와 같다 — 이미 대장과 일치(등록·일치)로 대사된 노출은 조치 대상이 아니다.
  const isOpenExposure = (x: ExternalAsset) => !x.action && x.state !== '등록·일치'
  const openCount = sorted.filter(isOpenExposure).length
  const shown = openOnly ? sorted.filter(isOpenExposure) : sorted
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
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '외부 노출 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {sorted.length}건</span>
      </div>
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
              <th className="c">생존</th><th>노출 서비스</th><th>CVE</th><th>인증서(CA·유효기간)</th><th className="c">대사</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const cl = certLiveness(e.certValidUntil)
              return (
              <tr key={e.id}>
                {canAct && <td className="c" onClick={(ev) => ev.stopPropagation()}>
                  {!e.action && e.alive && <input type="checkbox" checked={checked.has(e.id)} disabled={pending} aria-label={`${e.host} 선택`} onChange={() => toggle(e.id)} />}
                </td>}
                <td className="code">{e.id}</td>
                <td className="strong">{e.host}</td>
                <td className="tnum">{e.ip ?? '-'}</td>
                <td className="mute">{e.method}</td>
                <td className="c"><Chip tone={e.mode === 'Active' ? 'info' : 'neutral'} bare>{e.mode}</Chip></td>
                <td className="c">{e.alive
                  ? <Chip tone="ok" bare>확인</Chip>
                  : cl
                    ? <span title={cl.label}><Chip tone={cl.state === 'valid' ? 'warn' : 'neutral'} bare>{cl.aliveGuess ? '추정 생존' : '만료'}</Chip></span>
                    : <span className="mut">미확인</span>}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{e.services ?? '-'}</td>
                <td>{e.cve ? <span className="code" style={{ color: 'var(--err)' }}>{e.cve} ({e.cvss})</span> : <span className="mut">-</span>}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 210 }}>
                  {e.certIssuer || e.certValidUntil ? (
                    <span className="mut" style={{ fontSize: 12 }}>
                      {e.certIssuer ?? '-'}
                      {e.certValidUntil && <><br />~{e.certValidUntil} · <b style={{ color: cl?.state === 'expired' ? 'var(--err)' : 'var(--warn)' }}>{cl?.label}</b></>}
                    </span>
                  ) : <span className="mut">-</span>}
                </td>
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
            )})}
            {shown.length === 0 && <tr><td colSpan={canAct ? 13 : 11}><div className="empty">{externals.length === 0 ? '외부에서 관측된 노출 자산이 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
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
