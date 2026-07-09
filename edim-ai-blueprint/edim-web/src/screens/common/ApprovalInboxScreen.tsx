/** M-15-2 승인함 (W-12) — 전 자산 공통 승인 게이트 (DRAFT→PENDING→APPROVED/REJECTED).
 *  Macro 는 변경 전후 수식 비교 + Test 결과 · 승인/반려 실동작. */
import { useState } from 'react'
import {
  APPROVAL_HIST, APPROVAL_REQS, MACRO_BEFORE, type ApprovalReq,
} from '../../api/mock/dataMore'
import { MACRO_FORMULA } from '../../api/mock/dataMore'
import { Btn, Chip, Fx, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function ApprovalInboxScreen(_props: ScreenProps) {
  const shell = useShell()
  const [reqs, setReqs] = useState<ApprovalReq[]>(APPROVAL_REQS)
  const [selId, setSelId] = useState<number | null>(4)
  const [comment, setComment] = useState('')
  const [decided, setDecided] = useState<{ target: string; result: string; date: string }[]>([])

  const sel = reqs.find((r) => r.id === selId) ?? null

  const decide = (approve: boolean) => {
    if (!sel) return
    if (!approve && !comment.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>반려는 코멘트 필수</span>)
      return
    }
    if (approve && sel.assetType === 'Macro' && !sel.tested) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>AI 생성물은 Test 통과 후에만 승인 가능</span>)
      return
    }
    setDecided((prev) => [{ target: sel.target, result: approve ? '승인' : '반려', date: '07-09' }, ...prev])
    setReqs((prev) => prev.filter((r) => r.id !== sel.id))
    setSelId(null)
    setComment('')
    shell.setStatusMsg(approve
      ? `승인 — ${sel.target} → APPROVED 전이`
      : `반려 — ${sel.target} → REJECTED (요청자 알림)`)
  }

  const cols: GridColumn<ApprovalReq>[] = [
    { key: 't', header: '유형', width: 48, align: 'center', render: (r) => r.assetType },
    { key: 'target', header: '대상', render: (r) => r.target },
    { key: 'k', header: '요청 구분', width: 62, align: 'center', code: true, render: (r) => r.reqKind },
    { key: 'req', header: '요청자', width: 58, align: 'center', render: (r) => r.requester },
    { key: 'd', header: '요청일', width: 48, align: 'center', render: (r) => r.reqDate },
    { key: 'stage', header: '단계', width: 40, align: 'center', render: (r) => r.stage },
    {
      key: 'st', header: '상태', width: 72, align: 'center',
      render: (r) => (r.tested ? <Chip tone="info">Tested ✓</Chip> : <Chip tone="warn">Pending</Chip>),
    },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title="승인함" noPad>
            <div className="tree2">
              <div className="tn sel"><span className="pm">·</span>처리할 요청 ({reqs.length})</div>
              <div className="tn"><span className="pm">·</span>내 요청 (2)</div>
              <div className="tn"><span className="pm">·</span>위임받은 요청 (1)</div>
              <div className="tn"><span className="pm">·</span>이력 ({APPROVAL_HIST.length + decided.length})</div>
            </div>
          </GroupBox>
          <GroupBox title="자산 유형" noPad>
            <div className="tree2" style={{ fontSize: 11 }}>
              <div className="tn"><span className="pm">·</span>☑ Code ({reqs.filter((r) => r.assetType === 'Code').length})</div>
              <div className="tn"><span className="pm">·</span>☑ 도면 ({reqs.filter((r) => r.assetType === '도면').length})</div>
              <div className="tn"><span className="pm">·</span>☑ Macro ({reqs.filter((r) => r.assetType === 'Macro').length})</div>
              <div className="tn"><span className="pm">·</span>☐ Table · Form · 문서</div>
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={`처리할 요청 — ${reqs.length}건`} noPad>
            <DenseGrid columns={cols} rows={reqs} rowKey={(r) => r.id}
              selectedKey={selId} onRowClick={(r) => setSelId(r.id)} />
          </GroupBox>
          {sel ? (
            <GroupBox title={`상세 — ${sel.target}`} style={{ flex: 1 }}>
              {sel.assetType === 'Macro' ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginBottom: 3 }}>변경 전 (v0.2)</div>
                      <Fx>{MACRO_BEFORE}</Fx>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginBottom: 3 }}>변경 후 (v0.3)</div>
                      <Fx style={{ borderColor: 'var(--ok)' }}>{MACRO_FORMULA}</Fx>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt-dim)', marginTop: 6 }}>
                    Test Run: 입력 {'{MC:520, FES:15}'} → 결과 <b style={{ color: 'var(--ok)' }}>786</b>
                    · 참조 무결성 ✓ · 순환 참조 없음 ✓
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--txt-dim)', lineHeight: 1.9 }}>
                  {sel.reqKind} — {sel.target}<br />
                  {sel.assetType === '도면' ? 'Rev 비교: Rev.A → Rev.B (치수 B 재검토 반영)' : 'Slot 정의·값 목록 변경 검토'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end' }}>
                <input className="in" style={{ width: 260 }} value={comment} aria-label="코멘트"
                  placeholder="코멘트 (반려 시 필수)" onChange={(e) => setComment(e.target.value)} />
                <Btn style={{ borderColor: 'var(--err)', color: 'var(--err)' }}
                  onClick={() => decide(false)}>반려</Btn>
                <Btn variant="run" onClick={() => decide(true)}>승인</Btn>
              </div>
            </GroupBox>
          ) : (
            <div style={{ padding: 16, color: 'var(--txt-mute)', fontSize: 11 }}>요청을 선택하십시오</div>
          )}
        </div>
        <div className="split-h" />
        <div style={{ width: 290, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="승인 규칙">
            <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
              · 승인 시 approval_status=APPROVED 전이<br />
              · System DB 영향 작업은 Platform 승인 필요<br />
              · AI 생성물은 검증(Test) 통과 후에만 승인 가능
            </div>
          </GroupBox>
          <GroupBox title="이력" noPad>
            <table className="g">
              <thead><tr><th>대상</th><th>결과</th><th>일자</th></tr></thead>
              <tbody>
                {[...decided, ...APPROVAL_HIST].map((h, i) => (
                  <tr key={i}>
                    <td>{h.target}</td>
                    <td className="c">
                      <Chip tone={h.result === '승인' ? 'ok' : 'warn'}>{h.result}</Chip>
                    </td>
                    <td className="c">{h.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="모바일 동기">
            <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
              모바일 승인(M-16)과 동일 데이터·규칙 (APP-002)
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
