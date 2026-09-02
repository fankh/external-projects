'use client'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { INTENSITY_ORDER } from '@/lib/scan-policy'
import type { Channel, ScanPolicy } from '@/lib/types'
import { runScan } from './actions'

type Pol = { channel: Channel; enabled: boolean; kind: ScanPolicy['kind']; targets: string; window: string; intensity: ScanPolicy['intensity']; interval: string; inWindow: boolean }

export function ScanConsole(props: { policies: Pol[]; clock: string; defaultScope: string }) {
  const enabled = props.policies.filter((p) => p.enabled)
  const [picked, setPicked] = useState<Channel[]>(enabled.map((p) => p.channel))
  const [scope, setScope] = useState(props.defaultScope)
  const [intensity, setIntensity] = useState<ScanPolicy['intensity']>('보통')
  const [override, setOverride] = useState('')
  const [needOverride, setNeedOverride] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const toggle = (c: Channel) =>
    setPicked((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))

  // 창 밖 능동 채널이 선택돼 있으면 미리 알린다 — 실행하고 나서 막히는 것보다 낫다
  const risky = props.policies.filter((p) => picked.includes(p.channel) && p.kind === '능동' && !p.inWindow)
  const blockedByIntensity = risky.length > 0 && intensity === '높음'

  //  정책 강도는 상한이다(서버 runScan 과 같은 규칙) — 선택한 능동 채널 중 가장 낮은 정책 강도가
  //   이 실행의 상한이 된다. 넘는 선택지를 남겨 두면 고를 수는 있는데 늘 거부되는 막다른 길이 되므로
  //   여기서 아예 내주지 않고, 상한이 어디서 왔는지(어느 채널) 함께 밝힌다.
  const LEVELS = INTENSITY_ORDER
  const activePicked = props.policies.filter((p) => picked.includes(p.channel) && p.kind === '능동')
  const capIdx = activePicked.length === 0 ? LEVELS.length - 1
    : Math.min(...activePicked.map((p) => LEVELS.indexOf(p.intensity)))
  const capIntensity = LEVELS[capIdx]
  const capFrom = activePicked.filter((p) => LEVELS.indexOf(p.intensity) === capIdx).map((p) => p.channel)

  //  채널 선택이 바뀌면 상한도 바뀐다 — 이미 고른 값이 새 상한을 넘으면 상한으로 내린다.
  //   내리지 않으면 select 가 목록에 없는 값을 들고 있어 화면은 예전 강도를 보여 주는데 서버는 거부한다.
  if (LEVELS.indexOf(intensity) > capIdx) setIntensity(capIntensity)

  const submit = () => {
    startTransition(async () => {
      const r = await runScan({ channels: picked, scope, intensity, override })
      setMsg({ ok: r.ok, text: r.message })
      setNeedOverride(Boolean((r as { needOverride?: boolean }).needOverride))
      if (r.ok) setOverride('')
    })
  }

  return (
    <Card kicker="Collection" title="스캔 실행" >
      <div className="vstack" style={{ gap: 10 }}>
        <div>
          <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>수집 채널 — 정책에서 중지된 채널은 선택할 수 없습니다</div>
          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
            {props.policies.map((p) => (
              <button
                key={p.channel}
                className={`btn sm ${picked.includes(p.channel) ? 'pri' : ''}`}
                disabled={!p.enabled || pending}
                title={p.enabled ? `${p.targets} · ${p.window}` : '정책에서 중지됨'}
                onClick={() => toggle(p.channel)}
              >
                {p.channel}
                {!p.enabled && ' (중지)'}
                {p.enabled && p.kind === '능동' && !p.inWindow && ' ⚠'}
              </button>
            ))}
          </div>
        </div>

        <div className="hstack" style={{ gap: 8 }}>
          <input className="input" style={{ flex: 1 }} value={scope} onChange={(e) => setScope(e.target.value)}
            placeholder="대상 대역 — 예: 10.20.0.0/16" />
          <select aria-label="스캔 강도" className="select" value={intensity} onChange={(e) => setIntensity(e.target.value as ScanPolicy['intensity'])}>
            {LEVELS.slice(0, capIdx + 1).map((x) => <option key={x} value={x}>강도 — {x}</option>)}
          </select>
          <button className="btn pri" disabled={pending || picked.length === 0 || blockedByIntensity} onClick={submit}>
            {pending ? '수집 중…' : '스캔 실행'}
          </button>
        </div>

        {activePicked.length > 0 && capIdx < LEVELS.length - 1 && (
          <div className="dim" style={{ fontSize: 11.5 }}>
            강도 상한 <b>{capIntensity}</b> — {capFrom.join(', ')} 의 정책 강도입니다. 더 높은 강도로 돌리려면 탐지 채널·정책에서 상향하세요.
          </div>
        )}

        {risky.length > 0 && (
          <div className="callout warn">
            <b>정책 시간대 밖입니다 (현재 {props.clock}).</b>{' '}
            {risky.map((p) => `${p.channel} ${p.window}`).join(' · ')} — 능동 스캔은 운영망에 부하를 주므로
            창 밖 실행은 사유가 남습니다. 강도 <b>높음</b>은 창 밖에서 실행할 수 없습니다.
          </div>
        )}

        {(needOverride || (risky.length > 0 && !blockedByIntensity)) && (
          <input className="input" value={override} onChange={(e) => setOverride(e.target.value)}
            placeholder="시간대 밖 실행 사유 (감사 로그에 기록됩니다)" />
        )}

        {msg && (
          <div className="callout">
            {msg.text}
            {msg.ok && <> <Link className="btn sm ghost" href="/discovery/found">발견 자산 보기</Link></>}
          </div>
        )}
      </div>
    </Card>
  )
}
