'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { USB_POLICY, type UsbFinding } from '@/lib/types'
import { respondToUsb } from '../actions'

const KIND_TONE = { '대용량 반출 의심': 'err', '미등록 저장매체': 'warn', '암호화 미적용': 'warn' } as const

export function UsbTable({ items, canAct }: { items: UsbFinding[]; canAct: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const act = (id: string, kind: '차단' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToUsb(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>저장매체</th><th>사용 자산</th><th>사용자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
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
                    {u.action ? (
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
            {items.length === 0 && <tr><td colSpan={canAct ? 8 : 7}><div className="empty">검출된 USB 정책 위반이 없습니다</div></td></tr>}
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
