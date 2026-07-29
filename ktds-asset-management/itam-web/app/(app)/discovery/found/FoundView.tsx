'use client'
import { useMemo, useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { Channel, DiscoveredAsset, ReconcileState } from '@/lib/types'
import { CHANNELS } from '@/lib/types'
import { requestOnboard, requestOwnerConfirm, requestQuarantine } from '../actions'

const STATE_TONE: Record<ReconcileState, 'ok' | 'warn' | 'err' | 'neutral'> = {
  '등록·일치': 'ok', '등록·불일치': 'warn', 미등록: 'err', 미확인: 'neutral',
}

export function FoundView({ items }: { items: DiscoveredAsset[] }) {
  const [channel, setChannel] = useState<Channel | '전체'>('전체')
  const [selId, setSelId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const rows = useMemo(
    () => items.filter((d) => channel === '전체' || d.channel === channel),
    [items, channel],
  )
  const sel = items.find((d) => d.id === selId) ?? null

  return (
    <div>
      <div className="qbar" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <div className="seg" style={{ flexWrap: 'wrap' }}>
          <button className={channel === '전체' ? 'on' : ''} onClick={() => setChannel('전체')}>전체</button>
          {CHANNELS.map((c, i) => (
            <button key={c} className={channel === c ? 'on' : ''} onClick={() => setChannel(c)}>
              {String(i + 1).padStart(2, '0')} {c}
            </button>
          ))}
        </div>
        <span className="cnt">{rows.length}건</span>
      </div>

      <div className={sel ? 'cols main-side' : ''} style={sel ? { gap: 0 } : undefined}>
        <div className="tbl-wrap" style={{ maxHeight: 480 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>발견 ID</th><th>호스트명</th><th>유형</th><th>IP</th><th>채널</th>
                <th>최근 실측</th><th className="c">대사 상태</th><th className="c">위험도</th><th className="c">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={`clickable ${selId === d.id ? 'sel' : ''}`}
                  onClick={() => setSelId(selId === d.id ? null : d.id)}>
                  <td className="code">{d.id}</td>
                  <td className="strong">{d.hostname}</td>
                  <td>{d.type}</td>
                  <td className="tnum">{d.ip}</td>
                  <td className="mute">{d.channel}</td>
                  <td className="tnum">{d.lastSeen}</td>
                  <td className="c"><Chip tone={STATE_TONE[d.state]}>{d.state}</Chip></td>
                  <td className="c"><RiskChip risk={d.risk} /></td>
                  <td className="c">{d.action ? <Chip tone="info" bare>{d.action}</Chip> : <span className="mut">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sel && (
          <aside style={{ borderLeft: '1px solid var(--line)', padding: 16, maxHeight: 480, overflowY: 'auto' }}>
            <div className="kicker mute">Discovered Asset</div>
            <div style={{ fontSize: 15, fontWeight: 800, margin: '4px 0 2px' }}>{sel.hostname}</div>
            <div className="mono" style={{ color: 'var(--accent-deep)', fontSize: 12 }}>{sel.id}</div>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>유형</dt><dd>{sel.type}</dd>
              <dt>대사 상태</dt><dd><Chip tone={STATE_TONE[sel.state]}>{sel.state}</Chip></dd>
              <dt>발견 채널</dt><dd>{sel.channel}</dd>
              <dt>IP / MAC</dt><dd className="code">{sel.ip} · {sel.mac}</dd>
              <dt>최초 발견</dt><dd className="tnum">{sel.firstSeen}</dd>
              <dt>최근 실측</dt><dd className="tnum">{sel.lastSeen}</dd>
              {sel.matchedAssetNo && <><dt>대사 자산</dt><dd className="code">{sel.matchedAssetNo}</dd></>}
              {sel.mismatch && <><dt>불일치</dt><dd>{sel.mismatch}</dd></>}
              {sel.ownerCandidate && <><dt>소유자 후보</dt><dd>{sel.ownerCandidate}</dd></>}
            </dl>
            {sel.note && (
              <div className="callout warn" style={{ marginTop: 12, padding: '8px 11px' }}>{sel.note}</div>
            )}
            {sel.ownerAnswer && (
              <div className="callout" style={{ marginTop: 12, padding: '8px 11px' }}>
                소유자 확인 응답 — <b>{sel.ownerAnswer}</b>
              </div>
            )}
            {!sel.action && sel.state !== '등록·일치' && (
              <div className="vstack" style={{ marginTop: 14, gap: 8 }}>
                {/* 확인 요청은 편입·격리 앞단의 단계 — 이미 응답을 받았으면 다시 물을 필요가 없다 */}
                {!sel.ownerAnswer && (
                  <button className="btn" disabled={pending}
                    onClick={() => startTransition(async () => setMsg((await requestOwnerConfirm(sel.id)).message))}>
                    소유자 확인 요청 (메일 발송)
                  </button>
                )}
                <div className="hstack" style={{ gap: 8 }}>
                  <button className="btn pri" disabled={pending}
                    onClick={() => startTransition(() => requestOnboard(sel.id))}>
                    편입 요청 (결재)
                  </button>
                  <button className="btn danger" disabled={pending}
                    onClick={() => startTransition(() => requestQuarantine(sel.id))}>
                    NAC 격리 요청
                  </button>
                </div>
              </div>
            )}
            {sel.action && <div className="callout" style={{ marginTop: 14 }}>처리 진행 중 — <b>{sel.action}</b>. 결재함에서 진행 상태를 확인하세요.</div>}
            {msg && <div className="callout" style={{ marginTop: 10 }}>{msg}</div>}
          </aside>
        )}
      </div>
    </div>
  )
}
