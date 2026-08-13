'use client'
import { useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { ScanPolicy } from '@/lib/types'
import { setScanIntensity, setScanScope, toggleScanChannel } from '../actions'

const LEVELS: ScanPolicy['intensity'][] = ['낮음', '보통', '높음']

export function ScanPolicyTable({ policies }: { policies: ScanPolicy[] }) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<string | null>(null)
  const [et, setEt] = useState('')
  const [ew, setEw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const open = (p: ScanPolicy) => { setEditing(p.channel); setEt(p.targets); setEw(p.window); setMsg(null) }
  const save = (channel: string) => startTransition(async () => {
    const r = await setScanScope(channel as ScanPolicy['channel'], et, ew)
    setMsg(r.message); if (r.ok) setEditing(null)
  })

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>채널</th><th className="c">방식</th><th>대상 대역 · 소스</th><th>수집 시간대</th>
              <th>주기</th><th className="c">강도</th><th>비고 · 정책 편집</th><th className="c">사용</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p, i) => {
              const ed = editing === p.channel
              return (
                <tr key={p.channel} style={p.enabled ? undefined : { opacity: 0.55 }}>
                  <td className="strong">{String(i + 1).padStart(2, '0')} {p.channel}</td>
                  <td className="c"><Chip tone={p.kind === '능동' ? 'warn' : 'neutral'} bare>{p.kind}</Chip></td>
                  <td className="mute" style={{ whiteSpace: 'normal', maxWidth: 240 }}>
                    {ed ? <input className="input" style={{ width: '100%', height: 25, fontSize: 11 }} value={et} disabled={pending}
                      placeholder="대상 대역 (예: 10.20.0.0/16)" onChange={(e) => setEt(e.target.value)} /> : p.targets}
                  </td>
                  <td className="tnum">
                    {ed ? <input className="input" style={{ width: 120, height: 25, fontSize: 11 }} value={ew} disabled={pending}
                      placeholder="23:00 ~ 05:00" onChange={(e) => setEw(e.target.value)} /> : p.window}
                  </td>
                  <td className="tnum mute">{p.interval}</td>
                  <td className="c">
                    {p.kind === '능동' ? (
                      <span className="seg" style={{ transform: 'scale(.92)' }}>
                        {LEVELS.map((lv) => (
                          <button key={lv} className={p.intensity === lv ? 'on' : ''} disabled={pending || !p.enabled}
                            onClick={() => startTransition(() => setScanIntensity(p.channel, lv))}>{lv}</button>
                        ))}
                      </span>
                    ) : (
                      <span className="mut">{p.intensity}</span>
                    )}
                  </td>
                  <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                    {!ed && p.note}
                    {p.kind === '능동' && (ed ? (
                      <span className="hstack" style={{ gap: 4, marginTop: 4 }}>
                        <button className="btn sm pri" disabled={pending} onClick={() => save(p.channel)}>저장</button>
                        <button className="btn sm ghost" disabled={pending} onClick={() => { setEditing(null); setMsg(null) }}>취소</button>
                      </span>
                    ) : (
                      <button className="btn sm ghost" style={{ marginTop: 4 }} disabled={pending}
                        title="대역·시간대 정책 편집 (스캔 안전장치 — 시간대 밖 능동 스캔은 사유 필요)" onClick={() => open(p)}>정책 편집</button>
                    ))}
                  </td>
                  <td className="c">
                    <button className={`btn sm ${p.enabled ? '' : 'pri'}`} disabled={pending}
                      onClick={() => startTransition(() => toggleScanChannel(p.channel))}>
                      {p.enabled ? '중지' : '시작'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
