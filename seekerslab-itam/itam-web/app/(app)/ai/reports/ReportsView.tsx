'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { ApprovalKind, ApprovalStatus, GeneratedReport, ReportKind } from '@/lib/types'
import { attachReportToApproval, deleteReport, detachReportFromApproval, generateReport } from './actions'

type ApprovalRef = { id: string; kind: ApprovalKind; title: string; status: ApprovalStatus; reportRefs: string[] }

export function ReportsView(props: {
  kinds: { kind: ReportKind; period: string; desc: string }[]
  reports: GeneratedReport[]
  approvals: ApprovalRef[]
}) {
  const [pending, startTransition] = useTransition()
  const [attMsg, setAttMsg] = useState<string | null>(null)
  // 삭제 결과·거부 사유 — 그전엔 액션이 아무것도 반환하지 않아 이미 지워진 리포트를 눌러도 무반응이었다.
  const [delMsg, setDelMsg] = useState<string | null>(null)
  const [pickApr, setPickApr] = useState('')
  // 선택이 없으면 항상 최신 리포트를 펼친다 — 생성 직후 결과가 바로 보이도록
  const [selId, setSelId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const open = collapsed ? null : (props.reports.find((r) => r.id === selId) ?? props.reports[0] ?? null)
  const openId = open?.id ?? null
  const setOpenId = (id: string | null) => {
    if (id === null) setCollapsed(true)
    else { setSelId(id); setCollapsed(false) }
  }

  return (
    <>
      <Card kicker="Templates" title="리포트 유형" pad={false}>
          {delMsg && <div className="callout" style={{ margin: 14 }}>{delMsg}</div>}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>리포트</th><th className="c">주기</th><th>내용</th><th className="c">생성</th></tr></thead>
            <tbody>
              {props.kinds.map((k) => (
                <tr key={k.kind}>
                  <td className="strong">{k.kind}</td>
                  <td className="c"><Chip tone="neutral" bare>{k.period}</Chip></td>
                  <td className="dim" style={{ whiteSpace: 'normal', maxWidth: 520 }}>{k.desc}</td>
                  <td className="c">
                    <button className="btn sm pri" disabled={pending}
                      onClick={() => { setSelId(null); setCollapsed(false); startTransition(async () => { const r = await generateReport(k.kind); if (!r.ok) setAttMsg(r.message) }) }}>
                      {pending ? '생성 중…' : '생성'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="Generated" title="생성된 리포트" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>ID</th><th>리포트</th><th>생성 일시</th><th>생성자</th><th className="c">서술</th><th className="c">첨부 다운로드</th><th className="c">보기</th></tr>
            </thead>
            <tbody>
              {props.reports.map((r) => (
                <tr key={r.id} className={r.id === openId ? 'sel' : ''}>
                  <td className="code">{r.id}</td>
                  <td className="strong">{r.kind}</td>
                  <td className="tnum">{r.generatedAt}</td>
                  <td>{r.generatedBy}</td>
                  <td className="c"><Chip tone={r.mode === 'AI' ? 'ok' : 'neutral'} bare>{r.mode}</Chip></td>
                  <td className="c">
                    <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                      <a className="btn sm" href={`/api/reports/${r.id}?format=xlsx`}>엑셀</a>
                      <a className="btn sm" href={`/api/reports/${r.id}?format=md`}>문서</a>
                    </span>
                  </td>
                  <td className="c">
                    <span className="hstack" style={{ justifyContent: 'center', gap: 5 }}>
                      <button className="btn sm" onClick={() => setOpenId(r.id === openId ? null : r.id)}>
                        {r.id === openId ? '접기' : '펼치기'}
                      </button>
                      <button className="btn sm danger" disabled={pending}
                        onClick={() => startTransition(async () => setDelMsg((await deleteReport(r.id)).message))}>삭제</button>
                    </span>
                  </td>
                </tr>
              ))}
              {props.reports.length === 0 && (
                <tr><td colSpan={7}><div className="empty">생성된 리포트가 없습니다 — 위에서 유형을 선택해 생성하세요</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card kicker={`${open.id} · ${open.mode} 생성`} title={open.title}
          actions={<a className="btn sm pri" href={`/api/reports/${open.id}?format=md`}>결재 첨부용 문서</a>}>
          <div className="callout" style={{ marginBottom: 16 }}>{open.headline}</div>

          {(() => {
            const pendingAprs = props.approvals.filter((a) => a.status === '대기')
            const attachedTo = props.approvals.filter((a) => a.reportRefs.includes(open.id))
            return (
              <div className="hstack" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
                <span className="kicker mute">결재 첨부</span>
                <select aria-label="리포트 선택" className="select" style={{ minWidth: 260 }} value={pickApr} disabled={pending || pendingAprs.length === 0}
                  onChange={(e) => setPickApr(e.target.value)}>
                  <option value="">{pendingAprs.length ? '대기 결재 선택 —' : '대기 중 결재 없음'}</option>
                  {pendingAprs.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.kind} · {a.title.slice(0, 24)}</option>)}
                </select>
                <button className="btn sm pri" disabled={pending || !pickApr}
                  onClick={() => startTransition(async () => {
                    const r = await attachReportToApproval(pickApr, open.id)
                    setAttMsg(r.message); if (r.ok) setPickApr('')
                  })}>첨부</button>
                {attachedTo.length > 0 && (
                  <span className="hstack" style={{ gap: 6, fontSize: 11.5, flexWrap: 'wrap' }}>
                    <span className="mut">첨부된 결재:</span>
                    {attachedTo.map((a) => (
                      <span key={a.id} className="hstack" style={{ gap: 3 }}>
                        <Chip tone="info" bare>{a.id}</Chip>
                        {a.status === '대기' && (
                          <button className="btn sm ghost" style={{ padding: '1px 6px' }} disabled={pending} title="첨부 해제"
                            onClick={() => startTransition(async () => setAttMsg((await detachReportFromApproval(a.id, open.id)).message))}>✕</button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                {attMsg && <span className="dim" style={{ fontSize: 11.5, width: '100%' }}>{attMsg}</span>}
              </div>
            )
          })()}
          <div className="vstack" style={{ gap: 18 }}>
            {open.sections.map((sec) => (
              <div key={sec.title}>
                <div className="hstack" style={{ gap: 8, marginBottom: 7 }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5 }}>{sec.title}</span>
                  {sec.note && <span className="dim" style={{ fontSize: 11.5 }}>{sec.note}</span>}
                </div>
                {sec.columns && (
                  <div className="tbl-wrap" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
                    <table className="tbl">
                      <thead><tr>{sec.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                      <tbody>
                        {(sec.rows ?? []).map((row, i) => (
                          <tr key={i}>{row.map((cell, j) => <td key={j} className={j === 0 ? 'strong' : ''}>{cell}</td>)}</tr>
                        ))}
                        {(sec.rows ?? []).length === 0 && (
                          <tr><td colSpan={sec.columns.length}><div className="empty">해당 항목 없음</div></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {sec.bullets && (
                  <ul style={{ paddingLeft: 18, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.8 }}>
                    {sec.bullets.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
