/** M-14-4 ERP Dashboard (W-10, 슬라이드 10) — 프로세스 상태기계 집계 ·
 *  dense 문법: 표·숫자 중심, MES 채도 배제 (b01 조사 결론). */
import { useEffect, useState } from 'react'
import {
  ALERTS, DEPT_EVENTS, KPIS, PROCESS_FLOW_1, PROCESS_FLOW_2,
} from '../../api/mock/dataErp'
import { eventService } from '../../api/services'
import { Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

function FlowRow(props: { items: readonly { code: string; st: string }[] }) {
  return (
    <div className="flow" style={{ marginBottom: 4 }}>
      {props.items.map((f, i) => (
        <span key={f.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className={`fs ${f.st}`}>{f.code}</span>
          {i < props.items.length - 1 ? <span className="ar">→</span> : null}
        </span>
      ))}
    </div>
  )
}

export function DashboardScreen(_props: ScreenProps) {
  const shell = useShell()
  const [project, setProject] = useState('Micron #7')
  const [alerts, setAlerts] = useState(ALERTS)

  useEffect(() => {
    // 이상 경고 = erp_process_event 지연 집계 (ERP-014)
    void eventService.list().then((rows) => {
      const delayed = rows.filter((r) => r.delayed)
      if (delayed.length) {
        setAlerts(delayed.map((r) => ({
          kind: r.code === 'IR' ? '자금' : '시간',
          project: r.project,
          message: `${r.code} ${r.title.replace(`${r.project} `, '')} 기한 초과 (${r.deadline})`,
        })))
      }
    })
  }, [])

  const openEvent = (proj: string) => shell.openTab({
    id: `event-detail:${proj}`, screenId: 'event-detail',
    code: '이벤트', title: proj, params: { project: proj },
  })

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project</label>
        <Combo width={130} value={project} options={['전체', 'Micron #7', 'PS-598', 'PS-612']}
          onChange={setProject} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          집계 원천: erp_process_event 상태기계 (ERP-014) · 권한 ADMIN·경영
        </span>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {KPIS.map((k) => (
            <div key={k.label} className="gb">
              <div className="gc" style={{ textAlign: 'center', padding: '8px 6px' }}>
                <div style={{
                  fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: k.err ? 'var(--err)' : 'var(--title-navy)',
                }}>{k.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.label}</div>
              </div>
            </div>
          ))}
        </div>
        <GroupBox title={`Project 전후 공정 현황 — ${project === '전체' ? 'Micron #7' : project}`}>
          <FlowRow items={PROCESS_FLOW_1} />
          <FlowRow items={PROCESS_FLOW_2} />
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            현재 OR 수주 단계 — 자동(☑) 프로세스는 EDIM Run 산출물로 상태 전이
          </div>
        </GroupBox>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <GroupBox title="프로젝트별 손익 (수주액·원가·마진)">
            <Cvs blocks={[
              { id: 'a', name: '수주 23.0', x: 30, y: 76, w: 60, h: 40 },
              { id: 'b', name: '원가 18.8', x: 110, y: 90, w: 60, h: 26 },
              { id: 'c', name: 'EBIT 18.2%', x: 190, y: 84, w: 70, h: 32 },
            ]} style={{ height: 130 }} />
          </GroupBox>
          <GroupBox title="자금 흐름 (매입 출금 · 매출 입금)">
            <Cvs blocks={[
              { id: 'o', name: '출금 -4.2', sub: '08월', x: 30, y: 30, w: 70, h: 34 },
              { id: 'i', name: '입금 +9.1', sub: '09월', x: 130, y: 66, w: 70, h: 34 },
            ]} style={{ height: 130 }} />
          </GroupBox>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 6 }}>
          <GroupBox title="부서별 Event 상황" noPad>
            <table className="g">
              <thead>
                <tr><th>부서</th><th>대기</th><th>진행</th><th>완료(주)</th><th>지연</th></tr>
              </thead>
              <tbody>
                {DEPT_EVENTS.map((d) => (
                  <tr key={d.dept}>
                    <td>{d.dept}</td>
                    <td className="num">{d.waiting}</td>
                    <td className="num">{d.running}</td>
                    <td className="num">{d.doneWeek}</td>
                    <td className="num" style={d.delayed ? { color: 'var(--err)', fontWeight: 700 } : undefined}>
                      {d.delayed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title="이상 경고 (시간·자금) — 더블클릭=이벤트 상세" noPad>
            <table className="g">
              <thead><tr><th>구분</th><th>Project</th><th>내용</th></tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.project + a.message} onDoubleClick={() => openEvent(a.project)}
                    style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--err)', fontWeight: 700 }}>{a.kind}</td>
                    <td className="code">{a.project}</td>
                    <td>{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
