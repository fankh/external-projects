'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { UNAUTH_SW_POLICY, type UnauthorizedSw } from '@/lib/types'
import { respondToUnauthorizedSw, respondToUnauthorizedSwMany } from '../actions'

const KIND_TONE = { '금지 SW': 'err', '무단 원격제어': 'err', '미승인 SW': 'warn' } as const

export function UnauthorizedSwTable({ items, canAct, openOnly: openOnlyParam }: { items: UnauthorizedSw[]; canAct: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 '미인가 SW 미조치' 큐의 드릴다운. 조치가 끝난 건까지 함께 쌓이는 표라,
  //  큐가 말한 건수를 화면에서 다시 세어야 했다(휴면 계정·로컬 VM 표와 같은 규약).
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = items.filter((x) => !x.action).length
  const shown = openOnly ? items.filter((x) => !x.action) : items

  // 미조치 건만 선택 대상 — 새로 금지된 SW·EDR 스윕으로 같은 위반이 여러 대에 잡히면 선택해 한 번에 조치한다
  const selectable = items.filter((w) => !w.action)
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((w) => checked.has(w.id))

  const act = (id: string, kind: '제거' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToUnauthorizedSw(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const bulkAct = (kind: '제거' | '예외 승인') => startTransition(async () => {
    const r = await respondToUnauthorizedSwMany([...checked], kind)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 '미인가 SW 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {items.length}건</span>
      </div>
      {canAct && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 조치:</span>
          <button className="btn sm danger" disabled={pending} onClick={() => bulkAct('제거')}>제거 요청 ({checked.size})</button>
          <button className="btn sm" disabled={pending} onClick={() => bulkAct('예외 승인')}>예외 승인 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canAct && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 미인가 SW 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((w) => w.id)) : new Set())} />
              </th>}
              <th>소프트웨어</th><th>설치 자산</th><th>사용자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((w) => (
              <tr key={w.id}>
                {canAct && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {!w.action && <input type="checkbox" checked={checked.has(w.id)} disabled={pending} aria-label={`${w.name} 선택`} onChange={() => toggle(w.id)} />}
                </td>}
                <td className="strong">
                  {w.name}{w.version && <span className="dim"> {w.version}</span>}
                  {w.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{w.note}</div>}
                </td>
                <td><Link className="code" href={`/assets/register?q=${encodeURIComponent(w.assetNo)}`} title="자산 대장에서 열기">{w.assetNo}</Link></td>
                <td>{w.owner} <span className="dim">· {w.dept}</span></td>
                <td>
                  <Chip tone={KIND_TONE[w.kind]} bare>{w.kind}</Chip>
                  <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{UNAUTH_SW_POLICY[w.kind]}</div>
                </td>
                <td className="c"><Chip tone="neutral" bare>{w.detectedBy}</Chip></td>
                <td className="tnum">{w.firstSeen}</td>
                <td className="c"><RiskChip risk={w.risk} /></td>
                {canAct && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {w.action ? (
                      <Chip tone={w.action.startsWith('제거') ? 'err' : 'info'}>{w.action}</Chip>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(w.id, '제거')}>{busy === w.id ? '…' : '제거 요청'}</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(w.id, '예외 승인')}>예외 승인</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={canAct ? 9 : 7}><div className="empty">{items.length === 0 ? '검출된 미인가 SW가 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>설치 SW 정책 위반.</b> EDR·백신 콘솔의 설치 SW 인벤토리에서 금지·무단 원격제어·미승인 SW를 검출해
        설치 자산에 연결합니다. <b>보안담당</b>이 <b>제거 요청</b>(사용자·보안운영팀 통지) 또는 <b>예외 승인</b>
        (업무상 정당 — 아래 화이트리스트에 등재)으로 조치하며, 요청 사실은 담당 채널 통지와 감사 로그에 남습니다.
      </div>
    </>
  )
}
