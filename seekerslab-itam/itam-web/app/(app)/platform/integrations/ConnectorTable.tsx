'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { Integration } from '@/lib/types'
import { testConnector } from './actions'

const STATUS_TONE = { 정상: 'ok', 지연: 'warn', 오류: 'err', 미연동: 'neutral' } as const

export function ConnectorTable({ integrations, canManage }: { integrations: Integration[]; canManage: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const test = (id: string) => {
    setBusy(id)
    startTransition(async () => {
      const r = await testConnector(id)
      setMsg(r.message)
      setBusy(null)
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>연동 대상</th><th>방식</th><th>용도</th><th className="c">역할</th><th className="c">상태</th>
              <th>최근 수집</th><th className="num">24h 건수</th>{canManage && <th className="c">관리</th>}
            </tr>
          </thead>
          <tbody>
            {integrations.map((i) => (
              <tr key={i.id}>
                <td className="strong">{i.system}</td>
                <td className="mute">{i.method}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 420 }}>{i.purpose}</td>
                <td className="c"><Chip tone={i.role === '수집' ? 'neutral' : 'info'} bare>{i.role}</Chip></td>
                <td className="c"><Chip tone={STATUS_TONE[i.status]}>{i.status}</Chip></td>
                <td className="tnum mute">{i.lastSync}</td>
                <td className="num tnum">{i.volume24h.toLocaleString()}</td>
                {canManage && (
                  <td className="c">
                    <button className={`btn sm ${i.status === '정상' ? 'ghost' : ''}`} disabled={pending}
                      onClick={() => test(i.id)}
                      title={i.status === '미연동' ? '연동 활성화' : '연결 테스트 · 재연동'}>
                      {busy === i.id ? '…' : i.status === '미연동' ? '연동' : '연결 테스트'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="callout" style={{ margin: 14 }}>
        <b>발견과 조치의 양방향 연동.</b> NAC에서 자산 정보를 수집하고, 판정 결과를 다시 NAC 격리로 되돌려
        보내는 폐쇄 루프로 연동합니다. 이미 보유한 시스템의 API·로그를 커넥터로 연결하며, 신규 에이전트 배포는 필요 없습니다.
        {canManage && <><br /><b>연결 테스트</b>는 지연·오류·미연동 커넥터를 재연동하고 최근 수집 시각을 갱신하며, 그 사실은 아래 감사 로그에 남습니다.</>}
      </div>
    </>
  )
}
