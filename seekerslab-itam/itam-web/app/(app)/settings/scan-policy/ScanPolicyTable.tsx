'use client'
import { useTransition } from 'react'
import { Chip } from '@/components/ui'
import type { ScanPolicy } from '@/lib/types'
import { setScanIntensity, toggleScanChannel } from '../actions'

const LEVELS: ScanPolicy['intensity'][] = ['낮음', '보통', '높음']

export function ScanPolicyTable({ policies }: { policies: ScanPolicy[] }) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>채널</th><th className="c">방식</th><th>대상 대역 · 소스</th><th>수집 시간대</th>
            <th>주기</th><th className="c">강도</th><th>비고</th><th className="c">사용</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p, i) => (
            <tr key={p.channel} style={p.enabled ? undefined : { opacity: 0.55 }}>
              <td className="strong">{String(i + 1).padStart(2, '0')} {p.channel}</td>
              <td className="c"><Chip tone={p.kind === '능동' ? 'warn' : 'neutral'} bare>{p.kind}</Chip></td>
              <td className="mute" style={{ whiteSpace: 'normal', maxWidth: 240 }}>{p.targets}</td>
              <td className="tnum">{p.window}</td>
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
              <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 260 }}>{p.note}</td>
              <td className="c">
                <button className={`btn sm ${p.enabled ? '' : 'pri'}`} disabled={pending}
                  onClick={() => startTransition(() => toggleScanChannel(p.channel))}>
                  {p.enabled ? '중지' : '시작'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
