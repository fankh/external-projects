'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { DisposalRecord, WipeMethod } from '@/lib/types'
import { raiseDisposalApproval, recordWipe, selectForDisposal } from './actions'

const METHODS: WipeMethod[] = ['소프트웨어 3-pass', '디가우징', '물리 파쇄']
const TONE = { '대상 선정': 'neutral', '결재 대기': 'info', '소거 대기': 'err', 완료: 'ok' } as const

interface Candidate {
  assetNo: string; model: string; status: string; warrantyEnd: string; overdue: number; reason: string
}

export function DisposalView({ candidates, records }: { candidates: Candidate[]; records: DisposalRecord[] }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [method, setMethod] = useState<Record<string, WipeMethod>>({})
  const selected = records.filter((d) => d.status === '대상 선정')

  return (
    <>
      <Card kicker="Candidates" title="폐기 후보 — 보증 만료 경과" pad={false}>
        <div className="tbl-wrap" style={{ maxHeight: 260 }}>
          <table className="tbl">
            <thead><tr><th>자산번호</th><th>모델</th><th className="c">현재 상태</th><th>보증 만료</th><th className="num">경과</th><th className="c">선정</th></tr></thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.assetNo}>
                  <td className="code">{c.assetNo}</td>
                  <td className="strong">{c.model}</td>
                  <td className="c"><Chip tone="neutral" bare>{c.status}</Chip></td>
                  <td className="tnum">{c.warrantyEnd}</td>
                  <td className="num tnum">{c.overdue}일</td>
                  <td className="c">
                    <button className="btn sm" disabled={pending}
                      onClick={() => startTransition(() => selectForDisposal(c.assetNo, c.reason))}>대상 선정</button>
                  </td>
                </tr>
              ))}
              {candidates.length === 0 && <tr><td colSpan={6}><div className="empty">보증 만료 경과 자산이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Disposal" title="폐기 처리 현황" pad={false}
        actions={
          <button className="btn sm pri" disabled={pending || selected.length === 0}
            onClick={() => startTransition(() => raiseDisposalApproval())}>
            폐기 결재 상신 ({selected.length})
          </button>
        }>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>폐기번호</th><th>자산번호</th><th>모델</th><th>사유</th><th className="c">상태</th><th>소거 방식 · 증적</th><th className="c">소거 처리</th></tr>
            </thead>
            <tbody>
              {records.map((d) => (
                <tr key={d.id}>
                  <td className="code">{d.id}</td>
                  <td className="code">{d.assetNo}</td>
                  <td className="strong">{d.model}</td>
                  <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 240 }}>{d.reason}</td>
                  <td className="c"><Chip tone={TONE[d.status]}>{d.status}</Chip></td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 300 }}>
                    {d.status === '완료' ? (
                      <span>
                        <b>{d.wipeMethod}</b> · {d.wipedAt} {d.wipedBy}
                        <div className="mono" style={{ fontSize: 11, color: 'var(--ok)' }}>{d.evidence}</div>
                        <a className="btn sm ghost" style={{ marginTop: 4 }}
                          href={`/api/wipe-cert/${d.id}`} download>소거 확인서 다운로드</a>
                      </span>
                    ) : <span className="mut">-</span>}
                  </td>
                  <td className="c">
                    {d.status === '소거 대기' ? (
                      <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                        <select className="select" style={{ height: 25, fontSize: 11 }}
                          value={method[d.id] ?? METHODS[0]}
                          onChange={(e) => setMethod((m) => ({ ...m, [d.id]: e.target.value as WipeMethod }))}>
                          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button className="btn sm danger" disabled={pending}
                          onClick={() => startTransition(async () => {
                            const r = await recordWipe(d.id, method[d.id] ?? METHODS[0])
                            setMsg({ ok: r.ok, text: r.message })
                          })}>소거 · 증적 등록</button>
                      </span>
                    ) : (
                      <span className="mut">{d.status === '결재 대기' ? '결재 진행 중' : d.status === '완료' ? '완료' : '상신 대기'}</span>
                    )}
                  </td>
                </tr>
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
