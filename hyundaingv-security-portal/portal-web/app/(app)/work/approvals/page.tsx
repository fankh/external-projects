import Link from 'next/link'
import { Fragment } from 'react'
import { Card, Chip, Clip, ScreenHeader, Stat } from '@/components/ui'
import { attachCount } from '@/lib/attachments'
import { requireRole } from '@/lib/authz'
import { getStore, type Store } from '@/lib/store'
import type { Approval, ApprovalStatus } from '@/lib/types'
import { approve, reject } from './actions'

const ST_CHIP: Record<ApprovalStatus, 'warn' | 'ok' | 'err'> = { 대기: 'warn', 승인: 'ok', 반려: 'err' }

/** 결재 문서 상세 — 참조 업무(ref)의 스냅샷을 문서 유형별로 요약한다 (상세페이지 확인 후 처리 요구) */
function refSummary(s: Store, ap: Approval): [string, string][] {
  const ref = ap.ref
  if (!ref) return []
  switch (ap.docType) {
    case 'SR 신청': {
      const sr = s.srRequests.find((r) => r.srNo === ref)
      return sr ? [['SR 유형', sr.kind], ['대상 시스템', sr.system], ['현재 상태', sr.status], ['요청 내용', sr.content || '-']] : []
    }
    case '투자 정산품의':
    case '비용 정산품의': {
      const st = s.settlements.find((x) => x.id === ref)
      const ct = st && s.investContracts.find((c) => c.id === st.contractId)
      return st ? [['계약', ct ? `${ct.title} (${ct.vendor})` : st.contractId], ['지급 항목', st.item], ['금액', `${st.amount.toLocaleString('ko-KR')}만원`], ['지급 상태', st.status]] : []
    }
    case '장애보고 상신': {
      const list = s.incidents.filter((i) => i.reportRef === ref)
      return [['묶인 장애', `${list.length}건`], ...list.map((i): [string, string] => [i.id, `[${i.grade}] ${i.system} — ${i.title}`])]
    }
    case '변경계획 상신':
    case '변경결과 상신': {
      const cw = s.changes.find((c) => c.id === ref)
      return cw ? [['구분', `${cw.kind}변경`], ['작업', cw.title], ['작업계획', cw.plan ?? '-'], ['작업결과', cw.result ?? '-'], ['현재 상태', cw.status]] : []
    }
    case '점검결과 상신': {
      const plan = s.inspectionPlans.find((p) => p.id === ref)
      const item = plan && s.inspectionItems.find((i) => i.id === plan.itemId)
      return plan ? [['점검 항목', item?.control ?? plan.itemId], ['예정월', plan.month], ['점검자', plan.inspector], ['점검 결과', plan.result ?? '-']] : []
    }
    case '출력물폐기 상신': {
      const rows = s.printouts.filter((p) => p.approvalRef === ref)
      return [['묶인 출력물', `${rows.length}건`], ...rows.map((p): [string, string] => [p.id, `${p.document} (${p.method ?? '-'} · ${p.discardedAt ?? '-'})`])]
    }
    case '보안위반 확인서': {
      const v = s.violations.find((x) => x.id === ref)
      return v ? [['위반 유형', v.type], ['위반 내용', v.detail], ['사실확인서', v.statement ?? '-']] : []
    }
    case '서약 현황 상신': {
      const rows = s.companyPledges.filter((c) => c.approvalRef === ref)
      return [['묶인 징구', `${rows.length}건`], ...rows.map((c): [string, string] => [c.id, `${c.company} — ${c.personName}`])]
    }
    default:
      return []
  }
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const { sel } = await searchParams
  const s = getStore()

  const inbox = s.approvals.filter((a) => a.approver === me.name)
  const inboxWaiting = inbox.filter((a) => a.status === '대기')
  const outbox = s.approvals.filter((a) => a.drafter === me.name)
  // 상세는 내가 결재자이거나 기안자인 문서만 — 타인 결재 문서 열람 차단
  const selected = sel ? s.approvals.find((a) => a.id === sel && (a.approver === me.name || a.drafter === me.name)) : undefined
  const selectedFiles = selected?.ref ? s.attachments.filter((x) => x.refId === selected.ref) : []

  return (
    <>
      <ScreenHeader kicker="My Work" title="결재함"
        desc="수신함의 대기 건을 승인·반려하고, 상신함에서 내 기안 문서의 결재 상태를 추적한다." />

      <div className="stat-row">
        <Stat value={inboxWaiting.length} label="수신 대기" tone={inboxWaiting.length > 0 ? 'err' : undefined} note="내가 결재자" />
        <Stat value={outbox.filter((a) => a.status === '대기').length} label="상신 진행중" note="결재 대기" />
        <Stat value={outbox.filter((a) => a.status === '승인').length} label="상신 승인" />
        <Stat value={outbox.filter((a) => a.status === '반려').length} label="상신 반려" />
      </div>

      {selected && (
        <Card title={`문서 상세 — ${selected.id}`} kicker={selected.docType}
          actions={
            <span className="hstack">
              {selected.status === '대기' && selected.approver === me.name && (
                <>
                  <form action={approve}>
                    <input type="hidden" name="id" value={selected.id} />
                    <button type="submit" className="btn sm pri">승인</button>
                  </form>
                  <form action={reject} className="hstack" style={{ gap: 4 }}>
                    <input type="hidden" name="id" value={selected.id} />
                    <input className="input" name="reason" required maxLength={300} placeholder="반려 사유" style={{ height: 25, fontSize: 11.5, width: 150 }} />
                    <button type="submit" className="btn sm danger">반려</button>
                  </form>
                </>
              )}
              <Link className="btn sm" href="/work/approvals">닫기</Link>
            </span>
          }>
          <div className="cols c2">
            <dl className="kv">
              <dt>제목</dt><dd>{selected.title}</dd>
              <dt>기안자</dt><dd>{selected.drafter} · {selected.dept}</dd>
              <dt>결재자</dt><dd>{selected.approver}</dd>
              <dt>상신일</dt><dd>{selected.draftedAt}{selected.decidedAt ? ` (처리 ${selected.decidedAt})` : ''}</dd>
              <dt>상태</dt>
              <dd>
                <Chip tone={ST_CHIP[selected.status]}>{selected.status}</Chip>
                {selected.rejectReason && <span className="dim" style={{ marginLeft: 7 }}>사유: {selected.rejectReason}</span>}
              </dd>
              <dt>첨부</dt>
              <dd>
                {selectedFiles.length === 0 ? '-' : selectedFiles.map((f) => (
                  <div key={f.id} className="mono" style={{ fontSize: 11.5 }}>📎 {f.name} <span className="mut">({f.sizeKb.toLocaleString('ko-KR')}KB · {f.uploadedBy})</span></div>
                ))}
              </dd>
            </dl>
            <dl className="kv">
              {refSummary(s, selected).map(([k, v], i) => (
                <Fragment key={`${k}-${i}`}>
                  <dt>{k}</dt><dd>{v}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        </Card>
      )}

      <Card title="수신함 — 결재 대기" kicker="Inbox" pad={false}>
        {inboxWaiting.length === 0 ? (
          <div className="empty">대기 중인 결재가 없습니다.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>결재번호</th><th>문서</th><th>제목</th><th>기안자</th><th>상신일</th><th className="c">처리</th></tr></thead>
              <tbody>
                {inboxWaiting.map((a) => (
                  <tr key={a.id}>
                    <td className="code">{a.id}</td>
                    <td><Chip tone="info" bare>{a.docType}</Chip></td>
                    <td className="strong">
                      <Link href={`/work/approvals?sel=${a.id}`}>{a.title}</Link>
                      {a.ref && <span className="mut"> · {a.ref}</span>}<Clip count={attachCount(a.ref)} title="업무 문서 첨부" />
                    </td>
                    <td>{a.drafter} <span className="mut">· {a.dept}</span></td>
                    <td className="tnum">{a.draftedAt}</td>
                    <td className="c">
                      <span className="hstack" style={{ justifyContent: 'center' }}>
                        <form action={approve}>
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="btn sm pri">승인</button>
                        </form>
                        <form action={reject} className="hstack" style={{ gap: 4 }}>
                          <input type="hidden" name="id" value={a.id} />
                          <input className="input" name="reason" required maxLength={300} placeholder="반려 사유" style={{ height: 25, fontSize: 11.5, width: 130 }} />
                          <button type="submit" className="btn sm danger">반려</button>
                        </form>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="cols c2">
        <Card title="수신함 — 처리 완료" kicker="Inbox" pad={false}>
          {inbox.filter((a) => a.status !== '대기').length === 0 ? (
            <div className="empty">처리한 결재가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>문서</th><th>제목</th><th>상태</th><th>처리일</th></tr></thead>
                <tbody>
                  {inbox.filter((a) => a.status !== '대기').map((a) => (
                    <tr key={a.id}>
                      <td><Chip tone="neutral" bare>{a.docType}</Chip></td>
                      <td><Link href={`/work/approvals?sel=${a.id}`}>{a.title}</Link></td>
                      <td><Chip tone={ST_CHIP[a.status]}>{a.status}</Chip></td>
                      <td className="tnum">{a.decidedAt ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="상신함 — 내 기안 문서" kicker="Outbox" pad={false}>
          {outbox.length === 0 ? (
            <div className="empty">상신한 문서가 없습니다.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>문서</th><th>제목</th><th>결재자</th><th>상태</th><th>상신일</th></tr></thead>
                <tbody>
                  {outbox.map((a) => (
                    <tr key={a.id}>
                      <td><Chip tone="neutral" bare>{a.docType}</Chip></td>
                      <td className="strong"><Link href={`/work/approvals?sel=${a.id}`}>{a.title}</Link></td>
                      <td>{a.approver}</td>
                      <td>
                        <Chip tone={ST_CHIP[a.status]}>{a.status}</Chip>
                        {a.rejectReason && <span className="dim" style={{ marginLeft: 6, fontSize: 11 }} title={a.rejectReason}>사유: {a.rejectReason}</span>}
                      </td>
                      <td className="tnum">{a.draftedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
