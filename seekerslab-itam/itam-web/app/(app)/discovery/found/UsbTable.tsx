'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { USB_POLICY, type UsbFinding } from '@/lib/types'
import { respondToUsb, respondToUsbMany, revokeUsbException } from '../actions'

const KIND_TONE = { '대용량 반출 의심': 'err', '미등록 저장매체': 'warn', '암호화 미적용': 'warn' } as const

export function UsbTable({ items, canAct, openOnly: openOnlyParam }: { items: UsbFinding[]; canAct: boolean; openOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  // 미조치만 보기 — 대시보드 'USB 정책 위반 미조치' 큐의 드릴다운. 조치가 끝난 건까지 함께 쌓이는 표라,
  //  큐가 말한 건수를 화면에서 다시 세어야 했다(휴면 계정·로컬 VM 표와 같은 규약).
  const [openOnly, setOpenOnly] = useState(Boolean(openOnlyParam))
  const openCount = items.filter((x) => !x.action).length
  const shown = openOnly ? items.filter((x) => !x.action) : items

  // 미조치 건만 선택 대상 — 매체통제 정책·EDR 스윕으로 같은 위반이 여러 대에 잡히면 선택해 한 번에 조치한다
  const selectable = items.filter((u) => !u.action)
  const toggle = (id: string) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = selectable.length > 0 && selectable.every((u) => checked.has(u.id))

  const act = (id: string, kind: '차단' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToUsb(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const bulkAct = (kind: '차단' | '예외 승인') => startTransition(async () => {
    const r = await respondToUsbMany([...checked], kind)
    setMsg(r.message); if (r.ok) setChecked(new Set())
  })
  const revoke = (id: string) => { setBusy(id); startTransition(async () => { const r = await revokeUsbException(id); setMsg(r.message); setBusy(null) }) }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${openOnly ? 'pri' : 'ghost'}`} onClick={() => setOpenOnly((v) => !v)}
          title="조치가 끝나지 않은 건만 — 대시보드 'USB 정책 위반 미조치' 큐와 같은 집합">
          {openOnly ? '✓ ' : ''}미조치만 {openCount}
        </button>
        <span className="mut" data-queue="open=usb" style={{ fontSize: 12 }}>{shown.length} / {items.length}건</span>
      </div>
      {canAct && checked.size > 0 && (
        <div className="hstack" style={{ margin: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="mut" style={{ fontSize: 12.5 }}>선택 {checked.size}건 일괄 조치:</span>
          <button className="btn sm danger" disabled={pending} onClick={() => bulkAct('차단')}>차단 ({checked.size})</button>
          <button className="btn sm" disabled={pending} onClick={() => bulkAct('예외 승인')}>예외 승인 ({checked.size})</button>
          <button className="btn sm ghost" disabled={pending} onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {canAct && <th className="c" style={{ width: 32 }}>
                <input type="checkbox" checked={allSel} disabled={pending || selectable.length === 0} aria-label="미조치 USB 검출 전체 선택"
                  onChange={(e) => setChecked(e.target.checked ? new Set(selectable.map((u) => u.id)) : new Set())} />
              </th>}
              <th>저장매체</th><th>사용 자산</th><th>사용자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                {canAct && <td className="c" onClick={(e) => e.stopPropagation()}>
                  {!u.action && <input type="checkbox" checked={checked.has(u.id)} disabled={pending} aria-label={`${u.device} 선택`} onChange={() => toggle(u.id)} />}
                </td>}
                <td className="strong">
                  {u.device}
                  {u.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{u.note}</div>}
                </td>
                <td><Link className="code" href={`/assets/register?q=${encodeURIComponent(u.assetNo)}`} title="자산 대장에서 열기">{u.assetNo}</Link></td>
                <td>{u.owner} <span className="dim">· {u.dept}</span></td>
                <td>
                  <Chip tone={KIND_TONE[u.kind]} bare>{u.kind}</Chip>
                  <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{USB_POLICY[u.kind]}</div>
                </td>
                <td className="c"><Chip tone="neutral" bare>{u.detectedBy}</Chip></td>
                <td className="tnum">{u.firstSeen}</td>
                <td className="c"><RiskChip risk={u.risk} /></td>
                {canAct && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {u.action === '예외 승인' ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone="info">예외 승인</Chip>
                        <button className="btn sm ghost" disabled={pending} onClick={() => revoke(u.id)} title="예외 승인 해제 — 다시 정책(차단/예외 판정) 대상으로">예외 해제</button>
                      </span>
                    ) : u.action ? (
                      <Chip tone={u.action.startsWith('차단') ? 'err' : 'info'}>{u.action}</Chip>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(u.id, '차단')}>{busy === u.id ? '…' : '차단'}</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(u.id, '예외 승인')}>예외 승인</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={canAct ? 9 : 7}><div className="empty">{items.length === 0 ? '검출된 USB 정책 위반이 없습니다' : '필터에 맞는 항목이 없습니다 — 필터를 해제하면 전체가 보입니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>이동식 매체 데이터 유출(DLP) 통제.</b> EDR·백신 콘솔의 장치 제어 로그에서 미등록 매체·대용량 반출·암호화 미적용을
        검출해 사용 자산에 연결합니다. <b>보안담당</b>이 <b>차단</b>(EDR 장치 제어) 또는 <b>예외 승인</b>(업무용 매체 등록)으로
        조치하며, 요청 사실은 담당 채널 통지와 감사 로그에 남습니다.
      </div>
    </>
  )
}
