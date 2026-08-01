'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { ExternalAsset, ReconcileState } from '@/lib/types'
import { requestExternalAction } from './actions'

const STATE_TONE: Record<ReconcileState, 'ok' | 'warn' | 'err' | 'neutral'> = {
  '등록·일치': 'ok', '등록·불일치': 'warn', 미등록: 'err', 미확인: 'neutral',
}

export function ExposedTable({ externals, canAct }: { externals: ExternalAsset[]; canAct: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const act = (id: string, kind: '편입' | '차단') => {
    setBusy(id)
    startTransition(async () => {
      const r = await requestExternalAction(id, kind)
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
              <th>ID</th><th>호스트</th><th>IP</th><th>발견 방법</th><th className="c">방식</th>
              <th className="c">생존</th><th>노출 서비스</th><th>CVE</th><th className="c">대사</th><th className="c">위험도</th>
              {canAct && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {externals.map((e) => (
              <tr key={e.id}>
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
                    {e.action ? (
                      <Chip tone={e.action.startsWith('차단') ? 'err' : 'info'}>{e.action}</Chip>
                    ) : !e.alive ? (
                      <span className="mut">생존 확인 필요</span>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm" disabled={pending} onClick={() => act(e.id, '편입')}>{busy === e.id ? '…' : '편입 요청'}</button>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(e.id, '차단')}>차단 요청</button>
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
