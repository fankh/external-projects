'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { UNAUTH_SW_POLICY, type UnauthorizedSw } from '@/lib/types'
import { respondToUnauthorizedSw } from '../actions'

const KIND_TONE = { '금지 SW': 'err', '무단 원격제어': 'err', '미승인 SW': 'warn' } as const

export function UnauthorizedSwTable({ items, canAct }: { items: UnauthorizedSw[]; canAct: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const act = (id: string, kind: '제거' | '예외 승인') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToUnauthorizedSw(id, kind)
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
              <th>소프트웨어</th><th>설치 자산</th><th>사용자 · 부서</th><th>정책 분류</th>
              <th className="c">검출</th><th>최초 검출</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id}>
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
            {items.length === 0 && <tr><td colSpan={canAct ? 8 : 7}><div className="empty">검출된 미인가 SW가 없습니다</div></td></tr>}
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
