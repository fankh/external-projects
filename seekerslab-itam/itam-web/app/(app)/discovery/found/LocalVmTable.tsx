'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { LOCALVM_POLICY, type LocalVmFinding } from '@/lib/types'
import { respondToLocalVm, respondToLocalVmMany, revokeVmException } from '../actions'

const KIND_TONE = { 'EOL·미패치 게스트': 'err', '미인가 하이퍼바이저': 'warn', '미관리 VM': 'warn' } as const

export function LocalVmTable({ items, canAct, openOnly: openOnlyParam }: { items: LocalVmFinding[]; canAct: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 '로컬 VM 위반 미조치' 큐의 드릴다운 대상. 조치가 끝난 건까지 함께 쌓이는 표라,
  //  큐가 말한 건수를 화면에서 다시 세어야 했다. 큐 링크는 이 필터를 켠 채 화면을 연다.
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = items.filter((x) => !x.action).length
  const shown = openOnly ? items.filter((x) => !x.action) : items

  // 미조치 건만 선택 대상 — 하이퍼바이저 금지 정책 스윕으로 다수 단말의 로컬 VM 을 선택해 한 번에 조치한다
  const selectable = items.filter((v) => !v.action)
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((v) => checked.has(v.id))

  const act = (id: string, kind: '회수' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToLocalVm(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const bulkAct = (kind: '회수' | '예외 승인') => startTransition(async () => {
    const r = await respondToLocalVmMany([...checked], kind)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const revoke = (id: string) => { setBusy(id); startTransition(async () => { const r = await revokeVmException(id); setMsg(r.message); setBusy(null) }) }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '로컬 VM 위반 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {items.length}건</span>
      </div>
      {canAct && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 조치:</span>
          <button className="btn sm danger" disabled={pending} onClick={() => bulkAct('회수')}>회수 ({checked.size})</button>
          <button className="btn sm" disabled={pending} onClick={() => bulkAct('예외 승인')}>예외 승인 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canAct && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 로컬 VM 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((v) => v.id)) : new Set())} />
              </th>}
              <th>가상머신</th><th>게스트 OS</th><th>실행 자산</th><th>사용자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => (
              <tr key={v.id}>
                {canAct && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {!v.action && <input type="checkbox" checked={checked.has(v.id)} disabled={pending} aria-label={`${v.vm} 선택`} onChange={() => toggle(v.id)} />}
                </td>}
                <td className="strong">
                  {v.vm}
                  {v.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{v.note}</div>}
                </td>
                <td>{v.guestOs}</td>
                <td><Link className="code" href={`/assets/register?q=${encodeURIComponent(v.assetNo)}`} title="자산 대장에서 열기">{v.assetNo}</Link></td>
                <td>{v.owner} <span className="dim">· {v.dept}</span></td>
                <td>
                  <Chip tone={KIND_TONE[v.kind]} bare>{v.kind}</Chip>
                  <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{LOCALVM_POLICY[v.kind]}</div>
                </td>
                <td className="c"><Chip tone="neutral" bare>{v.detectedBy}</Chip></td>
                <td className="tnum">{v.firstSeen}</td>
                <td className="c"><RiskChip risk={v.risk} /></td>
                {canAct && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {v.action === '예외 승인' ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone="info">예외 승인</Chip>
                        <button className="btn sm ghost" disabled={pending} onClick={() => revoke(v.id)} title="예외 승인 해제 — 다시 정책(회수/예외 판정) 대상으로">예외 해제</button>
                      </span>
                    ) : v.action ? (
                      <Chip tone={v.action.startsWith('회수') ? 'err' : 'info'}>{v.action}</Chip>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(v.id, '회수')}>{busy === v.id ? '…' : '회수'}</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(v.id, '예외 승인')}>예외 승인</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={canAct ? 10 : 8}><div className="empty">{items.length === 0 ? '검출된 로컬 VM 정책 위반이 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>엔드포인트 내 로컬 가상머신 통제.</b> EDR·백신 콘솔이 미인가 하이퍼바이저·EOL 게스트·미관리 VM 을 검출해
        실행 자산에 연결합니다. <b>보안담당</b>이 <b>회수</b>(하이퍼바이저 제거·VM 삭제) 또는 <b>예외 승인</b>(업무용 VM 등록)으로
        조치하며, 요청 사실은 담당 채널 통지와 감사 로그에 남습니다. 미패치 게스트 OS 는 관리 사각지대의 취약점 노출원입니다.
      </div>
    </>
  )
}
