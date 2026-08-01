'use client'
import { useMemo, useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import type { Channel, ChannelObservation, DiscoveredAsset, ReconcileState } from '@/lib/types'
import { CHANNELS } from '@/lib/types'
import { mergeDiscovered, requestOnboard, requestOnboardMany, requestOwnerConfirm, requestQuarantine } from '../actions'

const STATE_TONE: Record<ReconcileState, 'ok' | 'warn' | 'err' | 'neutral'> = {
  '등록·일치': 'ok', '등록·불일치': 'warn', 미등록: 'err', 미확인: 'neutral',
}

export function FoundView({ items, observations, mergeCandidates }: {
  items: DiscoveredAsset[]
  observations: ChannelObservation[]
  /** 지문이 갈렸지만 같은 장비로 의심되는 쌍 — 수동 병합 대상 */
  mergeCandidates: { primary: DiscoveredAsset; duplicate: DiscoveredAsset; reason: string }[]
}) {
  const [channel, setChannel] = useState<Channel | '전체'>('전체')
  const [selId, setSelId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // 편입 요청 가능한 건만 일괄 대상 — 미처리·대사 미완
  const onboardable = (d: DiscoveredAsset) => !d.action && d.state !== '등록·일치'
  const toggleCheck = (id: string) => setChecked((prev) => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const bulkOnboard = () => startTransition(async () => {
    const r = await requestOnboardMany([...checked])
    setMsg(r.message)
    if (r.ok) setChecked(new Set())
  })

  // 채널별 관측을 발견 자산에 묶어 둔다 — 필터·상세 패널이 함께 쓴다
  const obsBy = useMemo(() => {
    const m = new Map<string, ChannelObservation[]>()
    for (const o of observations) {
      const list = m.get(o.discoveredId)
      if (list) list.push(o)
      else m.set(o.discoveredId, [o])
    }
    return m
  }, [observations])

  // 병합된 자산은 여러 채널이 봤으므로, 어느 채널로 필터해도 잡혀야 한다
  const rows = useMemo(
    () => items.filter((d) => {
      if (channel === '전체') return true
      const obs = obsBy.get(d.id) ?? []
      return d.channel === channel || obs.some((o) => o.channel === channel)
    }),
    [items, channel, obsBy],
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
        <button className="btn sm pri" style={{ marginLeft: 'auto' }} disabled={pending || checked.size === 0} onClick={bulkOnboard}>
          선택 일괄 편입 요청 ({checked.size})
        </button>
      </div>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}

      <div className={sel ? 'cols main-side' : ''} style={sel ? { gap: 0 } : undefined}>
        <div className="tbl-wrap fill">
          <table className="tbl">
            <thead>
              <tr>
                <th className="c" style={{ width: 30 }} />
                <th>발견 ID</th><th>호스트명</th><th>유형</th><th>IP</th><th>채널</th>
                <th>최근 실측</th><th className="c">대사 상태</th><th className="c">위험도</th><th className="c">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={`clickable ${selId === d.id ? 'sel' : ''}`}
                  onClick={() => setSelId(selId === d.id ? null : d.id)}>
                  <td className="c" onClick={(e) => e.stopPropagation()}>
                    {onboardable(d)
                      ? <input type="checkbox" checked={checked.has(d.id)} onChange={() => toggleCheck(d.id)} aria-label={`${d.id} 편입 선택`} />
                      : null}
                  </td>
                  <td className="code">{d.id}</td>
                  <td className="strong">{d.hostname}</td>
                  <td>{d.type}</td>
                  <td className="tnum">{d.ip}</td>
                  <td className="mute">
                    {d.channel}
                    {(obsBy.get(d.id)?.length ?? 0) > 1 && (
                      <> <Chip tone="info" bare>{obsBy.get(d.id)!.length}채널 병합</Chip></>
                    )}
                  </td>
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
          <aside className="side-fill">
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

            <div className="kicker mute" style={{ marginTop: 16 }}>Fingerprint · Observations</div>
            <div className="mono" style={{ fontSize: 11.5, marginTop: 3 }}>{sel.fingerprint ?? '-'}</div>
            <div className="tbl-wrap" style={{ marginTop: 8 }}>
              <table className="tbl">
                <thead><tr><th>채널</th><th>관측 시각</th><th>내용</th></tr></thead>
                <tbody>
                  {(obsBy.get(sel.id) ?? []).map((o) => (
                    <tr key={o.id}>
                      <td className="mute" style={{ whiteSpace: 'nowrap' }}>{o.channel}</td>
                      <td className="tnum" style={{ whiteSpace: 'nowrap' }}>{o.seenAt}</td>
                      <td style={{ whiteSpace: 'normal', fontSize: 11.5 }}>{o.detail}</td>
                    </tr>
                  ))}
                  {(obsBy.get(sel.id) ?? []).length === 0 && (
                    <tr><td colSpan={3}><div className="empty">관측 이력이 없습니다</div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
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

      {mergeCandidates.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', padding: 14 }}>
          <div className="kicker mute">Merge Candidates</div>
          <div style={{ fontWeight: 700, fontSize: 13, margin: '3px 0 8px' }}>
            병합 후보 {mergeCandidates.length}건 — 지문이 갈렸지만 같은 장비로 의심됨
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>대표 건</th><th>중복 후보</th><th>판단 근거</th><th className="c">병합</th></tr></thead>
              <tbody>
                {mergeCandidates.map((c) => (
                  <tr key={`${c.primary.id}-${c.duplicate.id}`}>
                    <td>
                      <div className="strong">{c.primary.hostname}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{c.primary.id} · {c.primary.mac} · {c.primary.ip}</div>
                    </td>
                    <td>
                      <div className="strong">{c.duplicate.hostname}</div>
                      <div className="dim" style={{ fontSize: 11 }}>{c.duplicate.id} · {c.duplicate.mac} · {c.duplicate.ip}</div>
                    </td>
                    <td className="dim" style={{ whiteSpace: 'normal' }}>{c.reason}</td>
                    <td className="c">
                      <button className="btn sm" disabled={pending}
                        onClick={() => startTransition(async () => setMsg((await mergeDiscovered(c.primary.id, c.duplicate.id)).message))}>
                        병합
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 결과 메시지는 후보 카드 밖에 둔다 — 마지막 후보를 병합하면 카드가 사라지므로
          안쪽에 두면 성공 메시지도 함께 사라진다 */}
      {msg && !sel && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
    </div>
  )
}
