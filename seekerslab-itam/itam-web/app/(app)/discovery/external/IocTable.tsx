'use client'
import { useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { IocMatch } from '@/lib/types'
import { reopenIoc, respondToIoc } from './actions'

const CONF_TONE = { 높음: 'err', 중간: 'warn', 낮음: 'neutral' } as const

export function IocTable({ iocs, canRespond }: { iocs: IocMatch[]; canRespond: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const act = (id: string, kind: '차단' | '조사') => {
    setBusy(id)
    startTransition(async () => {
      const r = await respondToIoc(id, kind)
      setMsg(r.message); setBusy(null)
    })
  }
  const reopen = (id: string) => {
    startTransition(async () => {
      const r = await reopenIoc(id)
      setMsg(r.message)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th className="c">IOC 유형</th><th>지표값</th><th>위협 행위자 귀속</th><th>관측·상관</th>
              <th>상관 자산</th><th className="c">신뢰도</th><th className="c">심각도</th>
              {canRespond && <th className="c">조치</th>}
            </tr>
          </thead>
          <tbody>
            {iocs.map((i) => (
              <tr key={i.id}>
                <td className="c"><Chip tone="neutral" bare>{i.iocType}</Chip></td>
                <td className="code" style={{ whiteSpace: 'normal', maxWidth: 220 }}>
                  {i.iocValue}
                  {i.note && <div className="mut" style={{ fontSize: 10.5, whiteSpace: 'normal' }}>{i.note}</div>}
                </td>
                <td className="strong">{i.threatActor}</td>
                <td><Chip tone="info" bare>{i.matchType}</Chip> <span className="mut" style={{ fontSize: 10.5 }}>{i.source}</span></td>
                <td>{i.matchedAsset} <span className="dim">· {i.dept}</span></td>
                <td className="c"><Chip tone={CONF_TONE[i.confidence]}>{i.confidence}</Chip></td>
                <td className="c"><RiskChip risk={i.severity} /></td>
                {canRespond && (
                  <td className="c" style={{ whiteSpace: 'nowrap' }}>
                    {i.action ? (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <Chip tone={i.action.startsWith('차단') ? 'err' : 'info'}>{i.action}</Chip>
                        <button className="btn sm ghost" disabled={pending} onClick={() => reopen(i.id)} title="오조치였다면 조치를 취소하고 미조치로 되돌립니다">재개</button>
                      </span>
                    ) : (
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <button className="btn sm danger" disabled={pending} onClick={() => act(i.id, '차단')}>{busy === i.id ? '…' : '차단'}</button>
                        <button className="btn sm" disabled={pending} onClick={() => act(i.id, '조사')}>조사 착수</button>
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {iocs.length === 0 && <tr><td colSpan={canRespond ? 8 : 7}><div className="empty">상관된 IOC 가 없습니다</div></td></tr>}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>알려진 자산에 위협 맥락 부여.</b> 외부 위협 인텔 피드의 IOC(IP·도메인·파일 해시)를 조직 자산·관측(프록시·EDR 로그)과
        상관해 위협 행위자를 귀속합니다. 신규 자산 발견이 아니라 <b>아는 자산의 악성 통신·감염 징후</b>를 드러냅니다.
        <b> 보안담당</b>이 <b>차단</b>(프록시·방화벽·EDR) 또는 <b>조사 착수</b>(침해 대응)로 조치하며, 사실은 보안운영팀 통지·감사에 남습니다.
      </div>
    </>
  )
}
