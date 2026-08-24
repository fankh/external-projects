'use client'
import { Fragment, useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { DISPOSAL_PHOTO_LABELS, DISPOSITIONS, HELD_STATUSES, type Disposition, type DisposalPhotoLabel, type DisposalRecord, type WipeMethod } from '@/lib/types'
import { addDisposalPhoto, cancelDisposalCandidate, raiseDisposalApproval, recordWipe, recordWipeMany, removeDisposalPhoto, selectForDisposal, selectForDisposalMany } from './actions'

const METHODS: WipeMethod[] = ['소프트웨어 3-pass', '디가우징', '물리 파쇄']
const TONE = { '대상 선정': 'neutral', '결재 대기': 'info', '소거 대기': 'err', 완료: 'ok' } as const

interface Candidate {
  assetNo: string; model: string; status: string; warrantyEnd: string; overdue: number; reason: string
}

export function DisposalView({ candidates, records }: { candidates: Candidate[]; records: DisposalRecord[] }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [method, setMethod] = useState<Record<string, WipeMethod>>({})
  const [disp, setDisp] = useState<Record<string, Disposition>>({})
  const [proceeds, setProceeds] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  // 소거 대기 일괄 처리 — EOL 배치 폐기에서 같은 소거 방식·처분으로 다수 건을 한 번에(대상 선정 일괄 상신과 대칭). 매각 대금은 건별이라 단건 소거로 개별 입력.
  const [wipeSel, setWipeSel] = useState<Set<string>>(new Set())
  const [bulkWipeMethod, setBulkWipeMethod] = useState<WipeMethod>(METHODS[0])
  const [bulkWipeDisp, setBulkWipeDisp] = useState<Disposition>('폐기(파쇄)')
  const [photoOpen, setPhotoOpen] = useState<string | null>(null)
  const [photoLabel, setPhotoLabel] = useState<DisposalPhotoLabel>(DISPOSAL_PHOTO_LABELS[0])
  const [photoNote, setPhotoNote] = useState('')
  const selected = records.filter((d) => d.status === '대상 선정')
  // 폐기 처리 현황 필터 — 완료분이 쌓이면 진행 중 건을 훑기 어렵다(다른 목록 화면과 동일한 상태·검색 필터 패턴).
  const [fstatus, setFstatus] = useState<'전체' | '진행중' | '완료'>('전체')
  const [fq, setFq] = useState('')
  const shown = records.filter((d) => {
    if (fstatus === '완료' && d.status !== '완료') return false
    if (fstatus === '진행중' && d.status === '완료') return false
    const n = fq.trim().toLowerCase()
    if (!n) return true
    return [d.id, d.assetNo, d.model, d.reason].some((f) => (f ?? '').toLowerCase().includes(n))
  })

  const addPhoto = (id: string) => startTransition(async () => {
    const r = await addDisposalPhoto(id, photoLabel, photoNote)
    setMsg({ ok: r.ok, text: r.message })
    if (r.ok) setPhotoNote('')
  })
  const removePhoto = (id: string, pId: string) => startTransition(async () => {
    const r = await removeDisposalPhoto(id, pId)
    setMsg({ ok: r.ok, text: r.message })
  })

  const toggle = (no: string) => setSel((prev) => {
    const n = new Set(prev)
    n.has(no) ? n.delete(no) : n.add(no)
    return n
  })
  const allChecked = candidates.length > 0 && sel.size === candidates.length
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(candidates.map((c) => c.assetNo)))
  // 단건 대상 선정 — 서버 응답을 그대로 보여 준다(권한·이미 폐기 절차·보유 상태 거절이 조용히 사라지지 않게).
  const selectOne = (assetNo: string, reason: string) => startTransition(async () => {
    const r = await selectForDisposal(assetNo, reason)
    setMsg({ ok: r.ok, text: r.message })
  })
  const held = (status: string) => (HELD_STATUSES as readonly string[]).includes(status)
  const bulkSelect = () => startTransition(async () => {
    const items = candidates.filter((c) => sel.has(c.assetNo)).map((c) => ({ assetNo: c.assetNo, reason: c.reason }))
    const r = await selectForDisposalMany(items)
    setMsg({ ok: r.ok, text: r.message })
    if (r.ok) setSel(new Set())
  })
  const wipeReady = records.filter((d) => d.status === '소거 대기')
  const toggleWipe = (id: string) => setWipeSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulkWipe = () => startTransition(async () => {
    const r = await recordWipeMany([...wipeSel], bulkWipeMethod, bulkWipeDisp)
    setMsg({ ok: r.ok, text: r.message })
    if (r.ok) setWipeSel(new Set())
  })

  return (
    <>
      <Card kicker="Candidates" title="폐기 후보 — 보증 만료 경과" pad={false}
        actions={<button className="btn sm pri" disabled={pending || sel.size === 0} onClick={bulkSelect}>
          선택 일괄 대상 선정 ({sel.size})
        </button>}>
        {msg && <div className={`callout${msg.ok ? '' : ' warn'}`} style={{ margin: 14 }}>{msg.text}</div>}
        <div className="tbl-wrap" style={{ maxHeight: 260 }}>
          <table className="tbl">
            <thead><tr>
              <th className="c" style={{ width: 34 }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="전체 선택" disabled={candidates.length === 0} />
              </th>
              <th>자산번호</th><th>모델</th><th className="c">현재 상태</th><th>보증 만료</th><th className="num">경과</th><th className="c">선정</th>
            </tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.assetNo} className={sel.has(c.assetNo) ? 'sel' : undefined}>
                  <td className="c"><input type="checkbox" checked={sel.has(c.assetNo)} onChange={() => toggle(c.assetNo)} aria-label={`${c.assetNo} 선택`} /></td>
                  <td className="code">{c.assetNo}</td>
                  <td className="strong">{c.model}</td>
                  <td className="c"><Chip tone="neutral" bare>{c.status}</Chip></td>
                  <td className="tnum">{c.warrantyEnd}</td>
                  <td className="num tnum">{c.overdue}일</td>
                  <td className="c">
                    {/* 보유자가 쥔·파이프라인 상태는 서버(selectForDisposal)가 거절한다 — 버튼을 그대로 내주면 눌러야 막히는
                        막다른 컨트롤이 되고, 그전에는 결과 메시지마저 버려서 눌러도 아무 일이 없는 것처럼 보였다. */}
                    {held(c.status) ? (
                      <span className="mut" style={{ fontSize: 11 }} title={`${c.status} 자산은 회수·반환·검수 완료 후 유휴 상태에서 선정하세요`}>회수 후 선정</span>
                    ) : (
                      <button className="btn sm" disabled={pending}
                        onClick={() => selectOne(c.assetNo, c.reason)}>대상 선정</button>
                    )}
                  </td>
                </tr>
              ))}
              {candidates.length === 0 && <tr><td colSpan={7}><div className="empty">보증 만료 경과 자산이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Disposal" title="폐기 처리 현황" pad={false}
        actions={
          <button className="btn sm pri" disabled={pending || selected.length === 0}
            onClick={() => startTransition(async () => { const x = await raiseDisposalApproval(); setMsg({ ok: x.ok, text: x.message }) })}>
            폐기 결재 상신 ({selected.length})
          </button>
        }>
        <div className="hstack" style={{ gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center' }}>
          {(['전체', '진행중', '완료'] as const).map((st) => (
            <button key={st} className={`btn sm ${fstatus === st ? 'pri' : 'ghost'}`} onClick={() => setFstatus(st)}>{st}</button>
          ))}
          <input className="input" style={{ flex: 1, minWidth: 180, height: 30 }}
            placeholder="폐기번호·자산번호·모델·사유 검색"
            value={fq} onChange={(e) => setFq(e.target.value)} />
          <span className="mut" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{shown.length} / {records.length}건</span>
        </div>
        {wipeSel.size > 0 && (
          <div className="hstack" style={{ gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', alignItems: 'center', background: 'var(--canvas)' }}>
            <span className="mut" style={{ fontSize: 12.5 }}>선택 {wipeSel.size}건 일괄 소거:</span>
            <select className="select" style={{ height: 28, fontSize: 12 }} value={bulkWipeMethod} disabled={pending} onChange={(e) => setBulkWipeMethod(e.target.value as WipeMethod)} title="일괄 데이터 소거 방식">
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="select" style={{ height: 28, fontSize: 12 }} value={bulkWipeDisp} disabled={pending} onChange={(e) => setBulkWipeDisp(e.target.value as Disposition)} title="일괄 물리 처분 방식(매각 대금은 건별이라 일괄 제외)">
              {DISPOSITIONS.filter((x) => x !== '매각').map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <button className="btn sm danger" disabled={pending} onClick={bulkWipe}>일괄 소거·처분 ({wipeSel.size})</button>
            <button className="btn sm ghost" disabled={pending} onClick={() => setWipeSel(new Set())}>선택 해제</button>
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>폐기번호</th><th>자산번호</th><th>모델</th><th>사유</th><th className="c">상태</th><th>소거 방식 · 증적</th><th className="c">소거 처리</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={7} className="dim c" style={{ padding: 18 }}>조건에 맞는 폐기 건이 없습니다.</td></tr>
              )}
              {shown.map((d) => (
                <Fragment key={d.id}>
                <tr>
                  <td className="code">{d.id}</td>
                  <td className="code">{d.assetNo}</td>
                  <td className="strong">{d.model}</td>
                  <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 240 }}>{d.reason}</td>
                  <td className="c"><Chip tone={TONE[d.status]}>{d.status}</Chip></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 300 }}>
                    {d.status === '완료' ? (
                      <span>
                        <b>{d.wipeMethod}</b> · {d.wipedAt} {d.wipedBy}
                        {d.disposition && <div style={{ fontSize: 11.5 }}>처분: <b>{d.disposition}</b>{d.proceeds ? ` · 대금 ${d.proceeds.toLocaleString()}원` : ''}</div>}
                        <div className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>{d.evidence}</div>
                        <span className="hstack" style={{ gap: 5, marginTop: 4 }}>
                          <a className="btn sm ghost" href={`/api/wipe-cert/${d.id}`} download>소거 확인서 다운로드</a>
                          <button className={`btn sm ${photoOpen === d.id ? 'pri' : 'ghost'}`}
                            onClick={() => { setPhotoOpen(photoOpen === d.id ? null : d.id); setPhotoNote(''); setMsg(null) }}
                            title="처리 전·후·폐기물 인계 등 증적 사진 관리">
                            🖼 증적 사진 {(d.photos?.length ?? 0) > 0 ? d.photos!.length : ''}
                          </button>
                        </span>
                      </span>
                    ) : <span className="mut">-</span>}
                  </td>
                  <td className="c">
                    {d.status === '소거 대기' ? (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <input type="checkbox" checked={wipeSel.has(d.id)} disabled={pending} aria-label={`${d.assetNo} 일괄 소거 선택`} onChange={() => toggleWipe(d.id)} title="같은 소거 방식·처분으로 일괄 소거" />
                        <select className="select" style={{ height: 25, fontSize: 11 }} title="데이터 소거 방식"
                          value={method[d.id] ?? METHODS[0]}
                          onChange={(e) => setMethod((m) => ({ ...m, [d.id]: e.target.value as WipeMethod }))}>
                          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select className="select" style={{ height: 25, fontSize: 11 }} title="물리 처분(불용 처리) 방식"
                          value={disp[d.id] ?? DISPOSITIONS[0]}
                          onChange={(e) => setDisp((m) => ({ ...m, [d.id]: e.target.value as Disposition }))}>
                          {DISPOSITIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                        {(disp[d.id] ?? DISPOSITIONS[0]) === '매각' && (
                          <input className="input" type="number" min={0} style={{ width: 90, height: 25, fontSize: 11 }} placeholder="매각 대금"
                            value={proceeds[d.id] ?? ''} onChange={(e) => setProceeds((m) => ({ ...m, [d.id]: e.target.value }))} />
                        )}
                        <button className="btn sm danger" disabled={pending}
                          onClick={() => startTransition(async () => {
                            const r = await recordWipe(d.id, method[d.id] ?? METHODS[0], disp[d.id] ?? DISPOSITIONS[0], Number(proceeds[d.id] ?? 0))
                            setMsg({ ok: r.ok, text: r.message })
                          })}>소거 · 처분 등록</button>
                      </span>
                    ) : d.status === '대상 선정' ? (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                        <span className="mut" style={{ fontSize: 11 }}>상신 대기</span>
                        <button className="btn sm ghost" disabled={pending}
                          onClick={() => startTransition(async () => {
                            const r = await cancelDisposalCandidate(d.id)
                            setMsg({ ok: r.ok, text: r.message })
                          })}>선정 취소</button>
                      </span>
                    ) : (
                      <span className="mut">{d.status === '결재 대기' ? '결재 진행 중' : '완료'}</span>
                    )}
                  </td>
                </tr>
                {photoOpen === d.id && d.status === '완료' && (
                  <tr className="sub">
                    <td colSpan={7} style={{ background: 'var(--canvas)', padding: '12px 16px' }}>
                      <div className="kicker mute" style={{ marginBottom: 8 }}>증적 사진 — {d.id} · {d.assetNo} ({d.model})</div>
                      {(d.photos?.length ?? 0) === 0 ? (
                        <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>등록된 증적 사진이 없습니다 — 처리 전·후·폐기물 인계 등 촬영 증적을 등록하세요.</div>
                      ) : (
                        <div className="vstack" style={{ gap: 5, marginBottom: 12 }}>
                          {d.photos!.map((p) => (
                            <div key={p.id} className="hstack" style={{ gap: 10, fontSize: 12.5 }}>
                              <Chip tone="info">{p.label}</Chip>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note ?? <span className="dim">설명 없음</span>}</span>
                              <span className="mut tnum" style={{ fontSize: 11 }}>{p.addedBy} · {p.addedAt}</span>
                              <button className="btn sm ghost" disabled={pending} onClick={() => removePhoto(d.id, p.id)} title="증적 사진 삭제">삭제</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <select aria-label="폐기 처리 선택" className="select" value={photoLabel} disabled={pending} onChange={(e) => setPhotoLabel(e.target.value as DisposalPhotoLabel)}>
                          {DISPOSAL_PHOTO_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <input className="input" style={{ width: 260 }} placeholder="설명 (예: 저장매체 라벨·시리얼 근접 촬영)"
                          value={photoNote} disabled={pending} onChange={(e) => setPhotoNote(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') addPhoto(d.id) }} />
                        <button className="btn sm pri" disabled={pending} onClick={() => addPhoto(d.id)}>＋ 증적 사진 등록</button>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {records.length === 0 && <tr><td colSpan={7}><div className="empty">폐기 처리 건이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
        {msg?.text && <div className={`callout ${msg.ok ? '' : 'warn'}`} style={{ margin: 14 }}>{msg.text}</div>}
      </Card>
    </>
  )
}
