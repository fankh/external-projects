/** M-15-3 부서 업무함 (W-22) — Schedule 위젯의 전체 화면 버전.
 *  선행 DONE 검사 + 기한 규칙 (W-14 정의) · 완료 처리 실동작. */
import { useState } from 'react'
import { DEPT_TASKS, type TaskRow } from '../../api/mock/dataMore'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

const FILTERS = ['내 업무', '부서 전체', '지연', '완료']

export function TaskBoxScreen(_props: ScreenProps) {
  const shell = useShell()
  const [tasks, setTasks] = useState<TaskRow[]>(DEPT_TASKS)
  const [filter, setFilter] = useState('내 업무')
  const [selCode, setSelCode] = useState<string | null>('PL')

  const rows = tasks.filter((t) => filter === '지연' ? t.delayed
    : filter === '완료' ? t.status === 'DONE'
      : filter === '내 업무' ? t.status !== 'DONE' : true)
  const sel = tasks.find((t) => t.code === selCode) ?? null

  const complete = () => {
    if (!sel) return
    setTasks((prev) => prev.map((t) => (t.code === sel.code
      ? { ...t, status: 'DONE', delayed: false } : t)))
    shell.setStatusMsg(`${sel.code} 완료 처리 (DONE) — 후행 이벤트 생성·이상 경고 해제`)
  }

  const cols: GridColumn<TaskRow>[] = [
    { key: 'code', header: '코드', width: 40, align: 'center', code: true, render: (r) => r.code },
    { key: 'p', header: 'Project', width: 84, code: true, render: (r) => r.project },
    { key: 't', header: '건명', render: (r) => r.title },
    { key: 'o', header: '담당', width: 58, align: 'center', render: (r) => r.owner },
    {
      key: 'd', header: '기한', width: 48, align: 'center',
      render: (r) => (
        <span style={r.delayed ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{r.deadline}</span>
      ),
    },
    {
      key: 'st', header: '상태', width: 52, align: 'center',
      render: (r) => (
        <Chip tone={r.status === 'DONE' ? 'ok' : r.status === '지연' ? 'err' : 'info'}>{r.status}</Chip>
      ),
    },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title="필터" noPad>
            <div className="tree2">
              {FILTERS.map((f) => (
                <div key={f} className={`tn ${filter === f ? 'sel' : ''}`} onClick={() => setFilter(f)}>
                  <span className="pm">·</span>{f}
                  <span style={{ flex: 1 }} />
                  {f === '지연' ? <Chip tone="err">{tasks.filter((t) => t.delayed).length}</Chip> : null}
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title="프로세스" noPad>
            <div className="tree2" style={{ fontSize: 11 }}>
              <div className="tn"><span className="pm">·</span>☑ MR 제작의뢰</div>
              <div className="tn"><span className="pm">·</span>☑ PL·BOM</div>
              <div className="tn"><span className="pm">·</span>☐ PSU·PLM</div>
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={`업무 — ${rows.length}건`} noPad>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => r.code}
              selectedKey={selCode} onRowClick={(r) => setSelCode(r.code)} />
          </GroupBox>
          {sel ? (
            <GroupBox title={`상세 — ${sel.code} ${sel.title}`}>
              <div className="flow">
                <span className="fs done">OR 수주 DONE</span>
                <span className="ar">→</span>
                <span className={`fs ${sel.status === 'DONE' ? 'done' : 'now'}`}>{sel.code}</span>
                <span className="ar">→</span>
                <span className="fs">{sel.code === 'PL' ? 'BOM' : sel.code === 'MR' ? 'BOM' : 'PR'}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', margin: '6px 0' }}>
                기한 규칙: OR+7일 (W-14 정의)
                {sel.delayed
                  ? <b style={{ color: 'var(--err)' }}> — 2일 초과, Dashboard 이상 경고 발생</b>
                  : null}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <Btn onClick={() => shell.setStatusMsg('처리 Form 열기 — erp_process_def.form_id (Toolbox)')}>
                  처리 Form 열기 (Toolbox)
                </Btn>
                <Btn variant="run" disabled={sel.status === 'DONE'} onClick={complete}>
                  완료 처리 (DONE)
                </Btn>
              </div>
            </GroupBox>
          ) : null}
        </div>
        <div className="split-h" />
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title="이상 경고" noPad>
            <table className="g">
              <thead><tr><th>구분</th><th>내용</th></tr></thead>
              <tbody>
                {tasks.some((t) => t.delayed) ? (
                  <tr>
                    <td style={{ color: 'var(--err)', fontWeight: 700 }}>시간</td>
                    <td>PL 기한 초과 2일</td>
                  </tr>
                ) : (
                  <tr><td colSpan={2} style={{ color: 'var(--txt-mute)' }}>경고 없음</td></tr>
                )}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="내 일정 (주간)">
            <div className="cvs" style={{ height: 76 }}>
              {['월', '화', '수', '목', '금'].map((d, i) => (
                <div key={d} className={`m2 ${i === 2 ? 'sel' : ''}`}
                  style={{ left: 8 + i * 46, top: 10, width: 40, height: 52 }}>
                  {d}<small>{i === 1 ? 'MR' : i === 2 ? 'PL!' : ''}</small>
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title="승인 요청함" right={<Chip tone="warn">4</Chip>}>
            <Btn onClick={() => shell.openTab({
              id: 'com-approval', screenId: 'com-approval', code: 'M-15-2', title: '승인함',
            })}>→ 승인함으로 이동</Btn>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
