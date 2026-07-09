/** 프로세스 이벤트 상세 (드릴다운) — Dashboard 이상 경고 더블클릭으로 진입.
 *  erp_process_event: 선행→현재→후행 · 기한 · 처리 이력 · 완료/에스컬레이션. */
import { useState } from 'react'
import { EVENT_DETAILS } from '../../api/mock/dataDetail'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function EventDetailScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const project = String(tab.params?.project ?? 'PS-612')
  const ev = EVENT_DETAILS[project] ?? EVENT_DETAILS['PS-612']
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)

  const complete = () => {
    if (!comment.trim()) {
      shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>처리 코멘트를 입력하십시오</span>)
      return
    }
    setDone(true)
    shell.setStatusMsg(`${ev.processCode} 완료 처리 — 후행 [${ev.next}] 이벤트 생성`)
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project</label>
        <input className="in ro" style={{ width: 90, fontFamily: 'Consolas, monospace' }}
          value={ev.project} readOnly aria-label="Project" />
        <label>프로세스</label>
        <span style={{ fontWeight: 700 }}>{ev.processCode} {ev.processName}</span>
        {done ? <Chip tone="ok">완료</Chip> : <Chip tone="err">지연</Chip>}
        <span style={{ flex: 1 }} />
        <Btn onClick={() => shell.setStatusMsg(`재배정 — 부서장 승인 필요`)}>재배정</Btn>
        <Btn onClick={() => shell.setStatusMsg('에스컬레이션 — 이상 경고 유지·상위 보고')}>에스컬레이션</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1, overflow: 'auto' }}>
          <GroupBox title="이벤트 정보 (erp_process_event)">
            <div className="frm">
              <label>담당</label>
              <input className="in ro" value={ev.owner} readOnly aria-label="담당" />
              <label>기한</label>
              <input className="in ro" value={ev.deadline} readOnly
                style={{ color: 'var(--err)' }} aria-label="기한" />
              <label>상태</label>
              <input className="in ro" value={done ? 'DONE' : ev.status} readOnly aria-label="상태" />
              <label>처리 Form</label>
              <input className="in ro" value={`${ev.processName} Form (Toolbox)`} readOnly aria-label="Form" />
            </div>
          </GroupBox>
          <GroupBox title="전후 공정">
            <div className="flow">
              <span className="fs done">{ev.prev}</span>
              <span className="ar">→</span>
              <span className={`fs ${done ? 'done' : 'now'}`}>{ev.processCode} {ev.processName}</span>
              <span className="ar">→</span>
              <span className="fs">{ev.next}</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>
              완료 시 후행 이벤트 자동 생성 — 기한 규칙은 Process Set-up (M-14-7)
            </div>
          </GroupBox>
          <GroupBox title="처리" >
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="in req" style={{ flex: 1 }} value={comment} aria-label="처리 코멘트"
                placeholder="처리 코멘트 (필수)"
                onChange={(e) => setComment(e.target.value)} />
              <Btn variant="run" disabled={done} onClick={complete}>완료 처리</Btn>
            </div>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="처리 이력" noPad>
            <table className="g">
              <thead><tr><th>일자</th><th>행위</th><th>주체</th></tr></thead>
              <tbody>
                {ev.history.map((h, i) => (
                  <tr key={i}>
                    <td className="c">{h.date}</td>
                    <td>{h.action}</td>
                    <td className="c">{h.by}</td>
                  </tr>
                ))}
                {done ? (
                  <tr className="sel">
                    <td className="c">지금</td>
                    <td>완료 처리 — {comment}</td>
                    <td className="c">YS.Gang</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="알림">
            <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
              기한 D-1 · 초과 시 이상 경고 (SVC-13 → Dashboard)<br />
              완료 시 후행 담당자에게 알림 발송
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
