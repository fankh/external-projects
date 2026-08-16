'use client'
import { useMemo, useState, useTransition } from 'react'
import { Chip, RiskChip } from '@/components/ui'
import { classifyDiscoveredType } from '@/lib/classify'
import type { Channel, ChannelObservation, DiscoveredAsset, ReconcileState, RiskLevel } from '@/lib/types'
import { CHANNELS } from '@/lib/types'
import { confirmReconcile, dismissDiscovered, mergeDiscovered, requestOnboard, requestOnboardMany, requestOwnerConfirm, requestOwnerConfirmMany, requestQuarantine, undismissDiscovered } from '../actions'

const STATE_TONE: Record<ReconcileState, 'ok' | 'warn' | 'err' | 'neutral'> = {
  '등록·일치': 'ok', '등록·불일치': 'warn', 미등록: 'err', 미확인: 'neutral',
}
const STATES: ReconcileState[] = ['등록·일치', '등록·불일치', '미등록', '미확인']
const RISKS: RiskLevel[] = ['높음', '중간', '낮음']

export function FoundView({ items, observations, mergeCandidates, canExport, initialState, initialSel }: {
  items: DiscoveredAsset[]
  observations: ChannelObservation[]
  /** 지문이 갈렸지만 같은 장비로 의심되는 쌍 — 수동 병합 대상 */
  mergeCandidates: { primary: DiscoveredAsset; duplicate: DiscoveredAsset; reason: string }[]
  canExport: boolean
  /** CMDB 대사 화면에서 상태별 드릴다운으로 진입할 때 초기 상태 필터 (?state=) */
  initialState?: ReconcileState
  /** 전역 검색·딥링크로 특정 발견 자산 상세를 바로 열 때 (?sel=) */
  initialSel?: string
}) {
  const [channel, setChannel] = useState<Channel | '전체'>('전체')
  const [fstate, setFstate] = useState<ReconcileState | '전체'>(initialState && STATES.includes(initialState) ? initialState : '전체')
  const [frisk, setFrisk] = useState<RiskLevel | '전체'>('전체')
  const [fq, setFq] = useState('')
  const [selId, setSelId] = useState<string | null>(initialSel ?? null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [dismissReason, setDismissReason] = useState('')
  const [pending, startTransition] = useTransition()

  // 편입 요청 가능한 건만 일괄 대상 — 미처리·미등록만. 등록·불일치(이미 매칭된 자산)는 편입하면 대장 중복이 되므로 제외(불일치는 재물조사 차이 조정으로 대사).
  const onboardable = (d: DiscoveredAsset) => !d.action && d.state === '미등록'
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
  // 소유자 확인 일괄 요청 — 편입과 같은 선택(미등록·미처리)에서, 정체 불명 장비의 소유 부서를 한 번에 조회한다(편입 전 조사 트랙)
  const bulkOwnerConfirm = () => startTransition(async () => {
    const r = await requestOwnerConfirmMany([...checked])
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
      if (channel !== '전체') {
        const obs = obsBy.get(d.id) ?? []
        if (!(d.channel === channel || obs.some((o) => o.channel === channel))) return false
      }
      if (fstate !== '전체' && d.state !== fstate) return false
      if (frisk !== '전체' && d.risk !== frisk) return false
      const needle = fq.trim().toLowerCase()
      if (needle && ![d.id, d.hostname, d.ip, d.mac, d.type].some((f) => f?.toLowerCase().includes(needle))) return false
      return true
    }),
    [items, channel, fstate, frisk, fq, obsBy],
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
        <span className="hstack" style={{ marginLeft: 'auto', gap: 6 }}>
          <button className="btn sm" disabled={pending || checked.size === 0} onClick={bulkOwnerConfirm} title="선택한 정체 불명 장비의 소유 부서를 일괄 조회(편입 전 조사)">
            선택 일괄 소유자 확인 ({checked.size})
          </button>
          <button className="btn sm pri" disabled={pending || checked.size === 0} onClick={bulkOnboard}>
            선택 일괄 편입 요청 ({checked.size})
          </button>
        </span>
      </div>
      <div className="qbar" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <select className="select" value={fstate} onChange={(e) => setFstate(e.target.value as ReconcileState | '전체')} style={{ maxWidth: 150 }}>
          <option value="전체">대사 상태 — 전체</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" value={frisk} onChange={(e) => setFrisk(e.target.value as RiskLevel | '전체')} style={{ maxWidth: 130 }}>
          <option value="전체">위험도 — 전체</option>
          {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="input" style={{ width: 200 }} placeholder="호스트명·IP·MAC·발견ID 검색" value={fq} onChange={(e) => setFq(e.target.value)} />
        {(fstate !== '전체' || frisk !== '전체' || fq.trim() !== '') && (
          <button className="btn sm ghost" onClick={() => { setFstate('전체'); setFrisk('전체'); setFq('') }}>필터 해제</button>
        )}
        <span className="cnt">{rows.length}건 / 전체 {items.length}건</span>
        {canExport && (
          <a className="btn sm" style={{ marginLeft: 'auto' }} download
            href={`/api/export/discovered?${new URLSearchParams({ q: fq.trim(), channel, state: fstate, risk: frisk }).toString()}`}>
            ⤓ 발견 자산 엑셀{(fstate !== '전체' || frisk !== '전체' || fq.trim() !== '' || channel !== '전체') ? ` (${rows.length})` : ''}
          </a>
        )}
      </div>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}

      <div className={sel ? 'cols main-side' : ''} style={sel ? { gap: 0 } : undefined}>
        <div className="tbl-wrap fill">
          <table className="tbl">
            <thead>
              <tr>
                <th className="c" style={{ width: 30 }} />
                <th>발견 ID</th><th>호스트명</th><th>유형(관측)</th><th className="c" title="AI 자동분류 — 관측 유형을 표준 자산 유형으로 매핑(편입 시 대장 유형으로 사용)">자동분류</th><th>IP</th><th>채널</th>
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
                  <td className="c"><Chip tone="neutral" bare>{classifyDiscoveredType(d.type)}</Chip></td>
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
              {rows.length === 0 && <tr><td colSpan={11}><div className="empty">조건에 맞는 발견 자산이 없습니다</div></td></tr>}
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
            {!sel.action && sel.state === '미등록' && (
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
                {/* 관리 제외 — 관리 대상이 아닌 알려진 비자산(협력사 장비·게스트 단말·비관리 어플라이언스). 편입도 격리도 아닌 판정으로 미등록 갭에서 뺀다(사유 필수). */}
                <div className="hstack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 2 }}>
                  <input className="input" style={{ flex: 1, height: 30 }} placeholder="관리 제외 사유 (예: 협력사 장비·게스트 단말·비관리 어플라이언스)"
                    value={dismissReason} disabled={pending} onChange={(e) => setDismissReason(e.target.value)} />
                  <button className="btn sm" disabled={pending || !dismissReason.trim()}
                    title="관리 대상이 아닌 발견 건을 관리 제외 — 미등록 갭·Shadow IT 신호에서 빠집니다(오판이면 제외 해제)"
                    onClick={() => startTransition(async () => { const r = await dismissDiscovered(sel.id, dismissReason); setMsg(r.message); if (r.ok) setDismissReason('') })}>관리 제외</button>
                </div>
              </div>
            )}
            {/* 등록·불일치 — 재편입(중복 생성) 대상이 아니라 대장 보정으로 대사한다. 대장을 열어 보정한 뒤 '대사 확인'으로 등록·일치 종결. */}
            {!sel.action && sel.state === '등록·불일치' && (
              <div className="vstack" style={{ marginTop: 14, gap: 8 }}>
                <div className="kicker mute">CMDB 대사 — 등록·불일치</div>
                {sel.matchedAssetNo && (
                  <a className="btn sm" href={`/assets/register?sel=${sel.matchedAssetNo}`}
                    title="대장 자산을 열어 위치·구성 불일치를 보정">대장에서 보정 → {sel.matchedAssetNo}</a>
                )}
                <button className="btn sm pri" disabled={pending}
                  onClick={() => startTransition(async () => setMsg((await confirmReconcile(sel.id)).message))}
                  title="불일치를 검토·정정했으면 대사를 등록·일치로 종결">대사 확인 (등록·일치 처리)</button>
                <span className="mut" style={{ fontSize: 11 }}>대장을 보정한 뒤 대사 확인하면 등록·일치로 종결됩니다.</span>
              </div>
            )}
            {sel.action === '관리 제외' && (
              <div className="callout" style={{ marginTop: 14 }}>
                <b>관리 제외됨</b> — 관리 대상이 아닌 비자산으로 판정되어 미등록 갭·Shadow IT 신호에서 제외됨.{sel.note ? <><br /><span className="mut" style={{ fontSize: 12 }}>{sel.note}</span></> : null}
                <div style={{ marginTop: 8 }}>
                  <button className="btn sm ghost" disabled={pending}
                    title="오판정이면 미등록 처리 대상으로 되돌립니다"
                    onClick={() => startTransition(async () => setMsg((await undismissDiscovered(sel.id)).message))}>제외 해제 (처리 대상 복귀)</button>
                </div>
              </div>
            )}
            {sel.action && sel.action !== '관리 제외' && <div className="callout" style={{ marginTop: 14 }}>처리 진행 중 — <b>{sel.action}</b>. 결재함에서 진행 상태를 확인하세요.</div>}
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
