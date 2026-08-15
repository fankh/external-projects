'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { LOCALVM_POLICY, type LocalVmFinding } from '@/lib/types'
import { respondToLocalVm, revokeVmException } from '../actions'

const KIND_TONE = { 'EOL·미패치 게스트': 'err', '미인가 하이퍼바이저': 'warn', '미관리 VM': 'warn' } as const

export function LocalVmTable({ items, canAct }: { items: LocalVmFinding[]; canAct: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const act = (id: string, kind: '회수' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToLocalVm(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const revoke = (id: string) => { setBusy(id); startTransition(async () => { const r = await revokeVmException(id); setMsg(r.message); setBusy(null) }) }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>가상머신</th><th>게스트 OS</th><th>실행 자산</th><th>사용자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id}>
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
            {items.length === 0 && <tr><td colSpan={canAct ? 9 : 8}><div className="empty">검출된 로컬 VM 정책 위반이 없습니다</div></td></tr>}
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
