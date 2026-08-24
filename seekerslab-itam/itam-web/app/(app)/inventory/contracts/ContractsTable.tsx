'use client'
import { Fragment, useMemo, useState, useTransition } from 'react'
import { Chip } from '@/components/ui'
import { missingContractDocs } from '@/lib/contract'
import { fmtAmount } from '@/lib/dates'
import { CONTRACT_DOC_TYPES, type Contract, type ContractDocType } from '@/lib/types'
import { addContract, addContractCost, addContractDoc, removeContractCost, removeContractDoc, renewContract, setContractSla, terminateContract } from './actions'

// assetCount 는 저장 필드가 아니라 화면이 넘겨주는 실측 파생값(store contractAssetCount) — '표시 수 = 드릴다운(?q=) 결과' 불변식.
type Row = Contract & { d: number | null; assetCount: number }

export function AddContract() {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'구매' | '유지보수'>('구매')
  const [name, setName] = useState('')
  const [vendor, setVendor] = useState('')
  const [ownerDept, setOwnerDept] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [amount, setAmount] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => startTransition(async () => {
    const r = await addContract({ kind, name, vendor, ownerDept, start, end, amount })
    setMsg(r.message)
    if (r.ok) { setName(''); setVendor(''); setOwnerDept(''); setStart(''); setEnd(''); setAmount(0); setOpen(false) }
  })

  return (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
      <div className="hstack" style={{ gap: 8 }}>
        <button className="btn sm pri" onClick={() => { setOpen((o) => !o); setMsg(null) }}>{open ? '취소' : '＋ 계약 등록'}</button>
        {msg && <span className="dim" style={{ fontSize: 11.5 }}>{msg}</span>}
      </div>
      {open && (
        <div className="hstack" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <select aria-label="계약 종류 필터" className="input" value={kind} onChange={(e) => setKind(e.target.value as '구매' | '유지보수')}>
            <option value="구매">구매</option><option value="유지보수">유지보수</option>
          </select>
          <input className="input" style={{ width: 190 }} placeholder="계약명" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" style={{ width: 130 }} placeholder="공급사" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          <input className="input" style={{ width: 110 }} placeholder="주관부서" value={ownerDept} onChange={(e) => setOwnerDept(e.target.value)} />
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>시작
            <input className="input" style={{ width: 120 }} placeholder="YYYY-MM-DD" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>만료
            <input className="input" style={{ width: 120 }} placeholder="YYYY-MM-DD" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <label className="hstack" style={{ gap: 4, fontSize: 12 }}>금액
            <input className="input" type="number" min={0} style={{ width: 120 }} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />원
          </label>
          <button className="btn pri" disabled={pending || !name.trim() || !vendor.trim() || !ownerDept.trim()} onClick={submit}>등록</button>
        </div>
      )}
    </div>
  )
}

function StatusChip({ d, win }: { d: number | null; win: number }) {
  if (d === null) return <Chip tone="ok">정상</Chip>
  if (d < 0) return <Chip tone="err">만료됨</Chip>
  // 긴급(red)은 창의 절반 또는 35일 중 짧은 쪽 이내, 임박(warn)은 운영 정책 만료창 이내 — 창을 좁히면 색 경계도 함께 좁아진다
  if (d <= Math.min(35, win)) return <Chip tone="err">D-{d}</Chip>
  if (d <= win) return <Chip tone="warn">D-{d}</Chip>
  return <Chip tone="ok">정상</Chip>
}

export function ContractsTable({ rows, sel, canEdit, expiryWindowDays }: { rows: Row[]; sel?: string; canEdit: boolean; expiryWindowDays: number }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [termId, setTermId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [docId, setDocId] = useState<string | null>(null)
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState<ContractDocType>(CONTRACT_DOC_TYPES[0])
  const [slaText, setSlaText] = useState<string | null>(null)  // null = 편집 안 함
  const [costDate, setCostDate] = useState('')
  const [costItem, setCostItem] = useState('')
  const [costAmount, setCostAmount] = useState(0)
  // 계약 목록 필터 — 구분·상태·만료 임박·검색 (계약이 쌓이면 필수)
  const [fkind, setFkind] = useState<'전체' | '구매' | '유지보수'>('전체')
  const [fstatus, setFstatus] = useState<'전체' | '유효' | '해지'>('전체')
  const [fexpiring, setFexpiring] = useState(false)
  const [fq, setFq] = useState('')
  const [pending, startTransition] = useTransition()

  const filteredRows = useMemo(() => {
    const needle = fq.trim().toLowerCase()
    return rows.filter((c) => {
      if (fkind !== '전체' && c.kind !== fkind) return false
      if (fstatus === '해지' && c.status !== '해지') return false
      if (fstatus === '유효' && c.status === '해지') return false
      if (fexpiring && !(c.status !== '해지' && c.d !== null && c.d <= expiryWindowDays)) return false
      if (!needle) return true
      return [c.id, c.name, c.vendor, c.ownerDept].some((f) => f?.toLowerCase().includes(needle))
    })
  }, [rows, fkind, fstatus, fexpiring, fq])
  const filterActive = fkind !== '전체' || fstatus !== '전체' || fexpiring || fq.trim() !== ''
  const expiringCount = rows.filter((c) => c.status !== '해지' && c.d !== null && c.d <= expiryWindowDays).length

  const addDoc = (id: string) => startTransition(async () => {
    const r = await addContractDoc(id, docName, docType)
    setMsg(r.message)
    if (r.ok) { setDocName('') }
  })
  const removeDoc = (id: string, dId: string) => startTransition(async () => {
    setMsg((await removeContractDoc(id, dId)).message)
  })
  const saveSla = (id: string) => startTransition(async () => {
    const r = await setContractSla(id, slaText ?? '')
    setMsg(r.message)
    if (r.ok) setSlaText(null)
  })
  const addCost = (id: string) => startTransition(async () => {
    const r = await addContractCost(id, costDate, costItem, costAmount)
    setMsg(r.message)
    if (r.ok) { setCostItem(''); setCostAmount(0) }
  })
  const removeCost = (id: string, cId: string) => startTransition(async () => {
    setMsg((await removeContractCost(id, cId)).message)
  })

  const renew = (id: string, term: number) => {
    startTransition(async () => {
      const r = await renewContract(id, term)
      setMsg(r.message)
      setOpenId(null)
    })
  }
  const terminate = (id: string) => {
    startTransition(async () => {
      const r = await terminateContract(id, reason)
      setMsg(r.message)
      if (r.ok) { setTermId(null); setReason('') }
    })
  }

  return (
    <>
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="qbar" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
        <div className="seg">
          {(['전체', '구매', '유지보수'] as const).map((k) => (
            <button key={k} className={fkind === k ? 'on' : ''} onClick={() => setFkind(k)}>{k}</button>
          ))}
        </div>
        <select aria-label="계약 상태 필터" className="select" value={fstatus} onChange={(e) => setFstatus(e.target.value as '전체' | '유효' | '해지')} style={{ maxWidth: 130 }}>
          <option value="전체">상태 — 전체</option>
          <option value="유효">유효(진행 중)</option>
          <option value="해지">해지</option>
        </select>
        {expiringCount > 0 && (
          <button className={`btn sm ${fexpiring ? 'warn' : ''}`} onClick={() => setFexpiring((v) => !v)}
            title={`만료 ${expiryWindowDays}일 이내(경과 포함)·해지 제외`}>{fexpiring ? '✓ ' : ''}만료 임박 {expiringCount}</button>
        )}
        <input className="input" style={{ width: 190 }} placeholder="계약번호·계약명·공급사·부서 검색" value={fq} onChange={(e) => setFq(e.target.value)} />
        {filterActive && <button className="btn sm ghost" onClick={() => { setFkind('전체'); setFstatus('전체'); setFexpiring(false); setFq('') }}>필터 해제</button>}
        <span className="cnt">{filteredRows.length}건 / 전체 {rows.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>계약번호</th><th>구분</th><th>계약명</th><th>공급사</th><th>주관부서</th>
              <th className="num">금액</th><th className="num">연계 자산</th><th>만료일</th><th className="c">상태</th><th className="c">부속서류</th><th className="c">관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((c) => (
              <Fragment key={c.id}>
              <tr className={c.id === sel ? 'sel' : ''}>
                <td className="code">{c.id}</td>
                <td>{c.kind}</td>
                <td className="strong">{c.name}</td>
                <td>{c.vendor}</td>
                <td className="mute">{c.ownerDept}</td>
                <td className="num tnum">{fmtAmount(c.amount)}원</td>
                <td className="num tnum">{c.assetCount > 0
                  ? <a href={`/assets/register?q=${encodeURIComponent(c.id)}`} title="이 계약에 연계된 대장 자산 보기 (실측)" style={{ color: 'var(--accent-deep)' }}>{c.assetCount}</a>
                  : c.assetCount}</td>
                <td className="tnum">{c.end}</td>
                <td className="c">{c.status === '해지' ? <Chip tone="neutral">해지</Chip> : <StatusChip d={c.d} win={expiryWindowDays} />}</td>
                <td className="c">
                  <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                    <button className={`btn sm ${docId === c.id ? 'pri' : ''}`} disabled={pending}
                      onClick={() => { setDocId(docId === c.id ? null : c.id); setDocName(''); setSlaText(null); setCostDate(''); setCostItem(''); setCostAmount(0); setMsg(null) }}
                      title={c.kind === '유지보수' ? '부속서류 · SLA · 비용 이력 관리' : '계약서·견적서·세금계산서·보증서 등 근거 문서 관리'}>
                      📎 {(c.documents?.length ?? 0) > 0 ? `${c.documents!.length}` : '문서'}
                    </button>
                    {missingContractDocs(c).length > 0 && (
                      <span title={`필수 부속서류 미비: ${missingContractDocs(c).join('·')}`}>
                        <Chip tone="warn" bare>{`미비 ${missingContractDocs(c).join('·')}`}</Chip>
                      </span>
                    )}
                    <a className="btn sm ghost" href={`/api/contract-card/${c.id}`} target="_blank" rel="noopener" title="계약 요약·부속서류·연계 자산 인쇄용 카드(dossier)">🖨</a>
                  </span>
                </td>
                <td className="c">
                  {c.status === '해지' ? (
                    <span className="mut" title={`${c.terminatedAt ?? ''} 해지`}>—</span>
                  ) : openId === c.id ? (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      {[1, 2, 3].map((y) => (
                        <button key={y} className="btn sm pri" disabled={pending} onClick={() => renew(c.id, y)}>{y}년</button>
                      ))}
                      <button className="btn sm ghost" disabled={pending} onClick={() => setOpenId(null)}>취소</button>
                    </span>
                  ) : termId === c.id ? (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      <input className="input" style={{ width: 130, height: 26 }} autoFocus placeholder="해지 사유"
                        value={reason} disabled={pending} onChange={(e) => setReason(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && reason.trim()) terminate(c.id) }} />
                      <button className="btn sm danger" disabled={pending || !reason.trim()} onClick={() => terminate(c.id)}>해지</button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => { setTermId(null); setReason('') }}>취소</button>
                    </span>
                  ) : (
                    <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                      <button className="btn sm" disabled={pending}
                        onClick={() => { setOpenId(c.id); setTermId(null); setMsg(null) }}
                        title="계약 기간 연장 (1·2·3년)">갱신</button>
                      <button className="btn sm danger" disabled={pending}
                        onClick={() => { setTermId(c.id); setReason(''); setOpenId(null); setMsg(null) }}
                        title="계약 조기 해지">해지</button>
                    </span>
                  )}
                </td>
              </tr>
              {docId === c.id && (
                <tr className="sub">
                  <td colSpan={11} style={{ background: 'var(--canvas)', padding: '12px 16px' }}>
                    {c.kind === '유지보수' && (
                      <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px dashed var(--line)' }}>
                        {/* SLA */}
                        <div className="hstack" style={{ gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                          <span className="kicker mute" style={{ paddingTop: 4, minWidth: 40 }}>SLA</span>
                          {slaText !== null ? (
                            <span className="hstack" style={{ gap: 6, flex: 1 }}>
                              <input className="input" style={{ flex: 1 }} placeholder="예: 장애 접수 후 4시간 내 온사이트, 월 가동률 99.9%"
                                value={slaText} disabled={pending} onChange={(e) => setSlaText(e.target.value)} />
                              <button className="btn sm pri" disabled={pending} onClick={() => saveSla(c.id)}>저장</button>
                              <button className="btn sm ghost" disabled={pending} onClick={() => setSlaText(null)}>취소</button>
                            </span>
                          ) : (
                            <span className="hstack" style={{ gap: 8, flex: 1 }}>
                              <span style={{ flex: 1, fontSize: 12.5 }}>{c.sla ? c.sla : <span className="dim">미설정 — 장애 대응 시간·가동률 등 서비스 수준을 기록하세요.</span>}</span>
                              {canEdit && <button className="btn sm" disabled={pending} onClick={() => { setSlaText(c.sla ?? ''); setMsg(null) }}>{c.sla ? 'SLA 수정' : 'SLA 설정'}</button>}
                            </span>
                          )}
                        </div>
                        {/* 비용 이력 */}
                        <div className="kicker mute" style={{ marginBottom: 6 }}>비용 이력 {(c.costs?.length ?? 0) > 0 && <span className="mut">· 누계 {fmtAmount(c.costs!.reduce((n, x) => n + x.amount, 0))}원</span>}</div>
                        {(c.costs?.length ?? 0) === 0 ? (
                          <div className="dim" style={{ fontSize: 12, marginBottom: canEdit ? 8 : 0 }}>등록된 비용 이력이 없습니다 — 정기 유지보수료·부품 교체·긴급 출동 등을 기록하세요.</div>
                        ) : (
                          <div className="vstack" style={{ gap: 4, marginBottom: canEdit ? 10 : 0 }}>
                            {[...c.costs!].sort((a, b) => b.date.localeCompare(a.date)).map((ct) => (
                              <div key={ct.id} className="hstack" style={{ gap: 10, fontSize: 12.5 }}>
                                <span className="tnum mut" style={{ minWidth: 82 }}>{ct.date}</span>
                                <span className="strong" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.item}</span>
                                <span className="tnum" style={{ minWidth: 90, textAlign: 'right' }}>{ct.amount.toLocaleString()}원</span>
                                <span className="mut" style={{ fontSize: 11 }}>{ct.addedBy}</span>
                                {canEdit && <button className="btn sm ghost" disabled={pending} onClick={() => removeCost(c.id, ct.id)} title="비용 항목 삭제">삭제</button>}
                              </div>
                            ))}
                          </div>
                        )}
                        {canEdit && (
                          <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                            <input className="input" type="date" style={{ width: 150 }} value={costDate} disabled={pending} onChange={(e) => setCostDate(e.target.value)} />
                            <input className="input" style={{ width: 220 }} placeholder="비용 항목 (예: 정기 유지보수료 3Q)" value={costItem} disabled={pending} onChange={(e) => setCostItem(e.target.value)} />
                            <label className="hstack" style={{ gap: 4, fontSize: 12 }}>
                              <input className="input" type="number" min={0} style={{ width: 120 }} value={costAmount} disabled={pending} onChange={(e) => setCostAmount(Number(e.target.value))} />원
                            </label>
                            <button className="btn sm pri" disabled={pending || !costDate || !costItem.trim()} onClick={() => addCost(c.id)}>＋ 비용 등록</button>
                          </div>
                        )}
                      </div>
                    )}
                    {(c.renewals?.length ?? 0) > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div className="kicker mute" style={{ marginBottom: 6 }}>갱신 이력 · {c.renewals!.length}회</div>
                        <div className="vstack" style={{ gap: 4 }}>
                          {[...c.renewals!].reverse().map((rn, i) => (
                            <div key={i} className="hstack" style={{ gap: 10, fontSize: 12.5 }}>
                              <Chip tone="ok" bare>{rn.termYears}년</Chip>
                              <span className="tnum">{rn.from} → <span className="strong">{rn.to}</span></span>
                              <span className="mut tnum" style={{ marginLeft: 'auto', fontSize: 11 }}>{rn.by} · {rn.date}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="kicker mute" style={{ marginBottom: 8 }}>부속서류 — {c.id} {c.name}</div>
                    {(c.documents?.length ?? 0) === 0 ? (
                      <div className="dim" style={{ fontSize: 12, marginBottom: canEdit ? 10 : 0 }}>등록된 부속서류가 없습니다 — 계약서·견적서·세금계산서·보증서 등을 등록하세요.</div>
                    ) : (
                      <div className="vstack" style={{ gap: 6, marginBottom: canEdit ? 12 : 0 }}>
                        {c.documents!.map((d) => (
                          <div key={d.id} className="hstack" style={{ gap: 10, fontSize: 12.5 }}>
                            <Chip tone="info">{d.docType}</Chip>
                            <span className="strong" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                            <span className="mut tnum" style={{ fontSize: 11 }}>{d.addedBy} · {d.addedAt}</span>
                            {canEdit && <button className="btn sm ghost" disabled={pending} onClick={() => removeDoc(c.id, d.id)} title="문서 항목 삭제">삭제</button>}
                          </div>
                        ))}
                      </div>
                    )}
                    {canEdit && (
                      <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                        <select aria-label="부속서류 종류" className="select" value={docType} disabled={pending} onChange={(e) => setDocType(e.target.value as ContractDocType)}>
                          {CONTRACT_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input className="input" style={{ width: 240 }} placeholder="문서명 (예: 2023 노트북 구매계약서_v2.pdf)"
                          value={docName} disabled={pending} onChange={(e) => setDocName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && docName.trim()) addDoc(c.id) }} />
                        <button className="btn sm pri" disabled={pending || !docName.trim()} onClick={() => addDoc(c.id)}>＋ 부속서류 등록</button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {filteredRows.length === 0 && <tr><td colSpan={11}><div className="empty">{rows.length === 0 ? '등록된 계약이 없습니다' : '조건에 맞는 계약이 없습니다'}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
