/** 산출물 문서 상세 (드릴다운) — Run 산출물 그리드 더블클릭으로 진입.
 *  doc_control: Doc No 채번 · Set-up→Check→Approve→Accepted 상태 · Grade 통제. */
import { useState } from 'react'
import { DOC_HIST, DOC_STAGES } from '../../api/mock/dataDetail'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

export function OutputDocScreen({ tab }: ScreenProps) {
  const shell = useShell()
  const file = String(tab.params?.file ?? '문서')
  const folder = String(tab.params?.folder ?? 'DWG')
  const fileType = String(tab.params?.fileType ?? 'PDF')
  const initStage = String(tab.params?.status ?? '').includes('승인') ? 1 : 1
  const [stageIdx, setStageIdx] = useState(initStage)

  const requestApproval = () => {
    setStageIdx((i) => Math.min(i + 1, DOC_STAGES.length - 1))
    shell.setStatusMsg(`승인 요청 — ${file} (다음 단계: ${DOC_STAGES[Math.min(stageIdx + 1, 3)]})`)
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Doc No</label>
        <input className="in ro" style={{ width: 130, fontFamily: 'Consolas, monospace' }}
          value="DOC-61313-DWG-07" readOnly aria-label="Doc No" />
        <Chip tone="info">자동 채번</Chip>
        <label>Grade</label>
        <Chip tone="warn">M — Management</Chip>
        <span style={{ flex: 1 }} />
        <Btn onClick={() => shell.setStatusMsg('미리보기 — 워터마크 적용 렌더')}>미리보기</Btn>
        <Btn onClick={() => shell.setStatusMsg('Print — Grade M: 워터마크 강제·이력 기록')}>🖨 Print</Btn>
        <Btn variant="pri" onClick={requestApproval}>승인 요청</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div className="fill-col" style={{ gap: 6, flex: 1.3, overflow: 'auto' }}>
          <GroupBox title={`미리보기 — ${file}`} right={<Chip tone="info">{fileType}</Chip>}>
            <div className="cvs" style={{ height: 320, position: 'relative' }}>
              <div className="m2" style={{ left: 40, top: 30, width: 220, height: 140 }}>
                {folder} 렌더
              </div>
              <div style={{
                position: 'absolute', left: '50%', top: '50%',
                transform: 'translate(-50%,-50%) rotate(-28deg)',
                fontSize: 34, fontWeight: 800, color: 'rgba(179,55,47,.14)',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                CONFIDENTIAL — NOVA
              </div>
              <div style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 9.5, color: 'var(--txt-mute)' }}>
                Rev.B · A4 · EDIM Run #7 산출
              </div>
            </div>
          </GroupBox>
        </div>
        <div className="split-h" />
        <div style={{ width: 330, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="문서 정보">
            <div className="frm c2">
              <label>파일</label>
              <input className="in ro" value={file} readOnly aria-label="파일" />
              <label>폴더</label>
              <input className="in ro" value={`Project Folder / ${folder}`} readOnly aria-label="폴더" />
              <label>버전</label>
              <input className="in ro" value="Rev.B" readOnly aria-label="버전" />
              <label>생성</label>
              <input className="in ro" value="EDIM Run #7 (자동)" readOnly aria-label="생성" />
            </div>
          </GroupBox>
          <GroupBox title="상태 (doc_control)">
            <div className="flow">
              {DOC_STAGES.map((s, i) => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className={`fs ${i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''}`}>{s}</span>
                  {i < DOC_STAGES.length - 1 ? <span className="ar">→</span> : null}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 4 }}>
              승인 게이트: PENDING 중복 차단 (uq_approval_pending)
            </div>
          </GroupBox>
          <GroupBox title="이력" noPad>
            <table className="g">
              <thead><tr><th>시각</th><th>행위</th><th>주체</th></tr></thead>
              <tbody>
                {DOC_HIST.map((h, i) => (
                  <tr key={i}>
                    <td className="c">{h.date}</td>
                    <td>{h.action}</td>
                    <td className="c">{h.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="Grade 통제 (Management)">
            <div style={{ fontSize: 10.5, lineHeight: 1.8, color: 'var(--txt-dim)' }}>
              · 열람: 부서 + 승인자 · 다운로드 이력 기록<br />
              · 인쇄 시 워터마크 강제 · 외부 공유 차단
            </div>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
