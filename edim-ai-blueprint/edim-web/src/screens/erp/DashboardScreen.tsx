/** M-14-4 ERP Dashboard (W-10, 슬라이드 10) — 프로세스 상태기계 집계 ·
 *  dense 문법: 표·숫자 중심, MES 채도 배제 (b01 조사 결론). */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ALERTS, DEPT_EVENTS, KPIS, PROCESS_FLOW_1, PROCESS_FLOW_2,
} from '../../api/mock/dataErp'
import { analyticsService, dashboardService, eventService, projectService, type AnalyticsData, type DashboardData } from '../../api/services'
import { Chip, Combo, GroupBox } from '../../components/controls'
import { Cvs } from '../../components/Cvs'
import { useI18n } from '../../i18n/I18nContext'
import { SCREEN_BY_NODE } from '../../shell/menus'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

/** 프로세스 흐름 노드 표시 번역 키 — 내부 코드 값(erp_process_event)은 원문 유지 */
export const FLOW_STEP_KEYS: Record<string, string> = {
  'PS 등록': 'dash.flowPs', 'PCR 견적검토': 'dash.flowPcr', 'QCR 견적': 'dash.flowQcr',
  'OR 수주': 'dash.flowOr', 'AP 승인도서': 'dash.flowAp', 'APP 고객승인': 'dash.flowApp',
  'MR 제작의뢰': 'dash.flowMr', 'PR 발주요청': 'dash.flowPr', 'PO 발주': 'dash.flowPo',
  'MI 입고': 'dash.flowMi', 'MP 생산계획': 'dash.flowMp', 'WR 작업지시': 'dash.flowWr',
  'FF 완성': 'dash.flowFf', 'DF 납품': 'dash.flowDf', 'IR 기성청구': 'dash.flowIr',
}

// F10 — KPI 드릴다운 대상 (지표 → 담당 화면)
const KPI_DRILL: Record<string, { node: string; msg: string }> = {
  '진행 Project': { node: 'erp-project', msg: '진행 Project — 프로젝트 대장 (S-3-5)' },
  '승인 대기': { node: 'com-approval', msg: '승인 대기 — 승인함 (M-15-2)' },
  '이번 달 수주': { node: 'erp-project', msg: '수주 — 프로젝트 대장 (수주 관리는 D1 트랙)' },
  '이상 경고 (시간·자금)': { node: 'com-tasks', msg: '이상 경고 — 부서 업무함 (M-15-3, 완료 처리)' },
}

// KPI 타일 라벨 번역 키 (집계 데이터의 label 문자열 기준)
const KPI_LABEL_KEYS: Record<string, string> = {
  '진행 Project': 'dash.kpiRunning', '승인 대기': 'dash.kpiApprovalWait',
  '이번 달 수주': 'dash.kpiMonthOrder', '이상 경고 (시간·자금)': 'dash.kpiAlerts',
}

function FlowRow(props: { items: readonly { code: string; st: string }[] }) {
  const { t } = useI18n()
  return (
    <div className="flow" style={{ marginBottom: 4 }}>
      {props.items.map((f, i) => (
        <span key={f.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span className={`fs ${f.st}`}>
            {FLOW_STEP_KEYS[f.code] ? t(FLOW_STEP_KEYS[f.code], f.code) : f.code}
          </span>
          {i < props.items.length - 1 ? <span className="ar">→</span> : null}
        </span>
      ))}
    </div>
  )
}

export function DashboardScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { setStatusMsg } = shell
  const { t } = useI18n()
  const [project, setProject] = useState(shell.activeProject?.name ?? 'Micron #7')
  const [projectOpts, setProjectOpts] = useState<string[]>([])
  const [alerts, setAlerts] = useState(ALERTS)
  const [data, setData] = useState<DashboardData>({ kpis: KPIS, deptEvents: DEPT_EVENTS })

  const load = useCallback(() => {
    void dashboardService.get().then(setData)
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

  const [anly, setAnly] = useState<AnalyticsData | null>(null)
  useEffect(() => { load() }, [load])
  useEffect(() => { void analyticsService.get().then(setAnly) }, [])
  useEffect(() => { void projectService.list().then((r) => setProjectOpts(r.map((p) => p.projectName))) }, [])

  useFKeys(active, useMemo(() => ({
    F8: () => { load(); setStatusMsg('Dashboard 재집계 (erp_process_event)') },
  }), [load, setStatusMsg]))

  const openEvent = (proj: string) => shell.openTab({
    id: `event-detail:${proj}`, screenId: 'event-detail',
    code: '이벤트', title: proj, params: { project: proj },
  })
  // E4 — 부서별 Event 행 더블클릭 = 부서 업무함 진입 (이상 경고 그리드와 동선 통일)
  const openDept = (dept: string) => {
    shell.openTab(SCREEN_BY_NODE['com-tasks'])
    setStatusMsg(`${dept} — 부서 업무함 (M-15-3) 진입 (부서 이벤트 처리)`)
  }

  return (
    <div className="fill-col">
      <div className="qband">
        <label>Project</label>
        <Combo width={130} value={project}
          options={[{ value: '전체', label: t('enum.all', '전체') },
            ...(projectOpts.length ? projectOpts : [project])]}
          onChange={setProject} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('dash.sourceHint', '집계 원천: erp_process_event 상태기계 (ERP-014) · 권한 ADMIN·경영')}
        </span>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {data.kpis.map((k) => (
            <div key={k.label} className="gb">
              <div className="gc" data-kpi={k.label} role="button"
                style={{ textAlign: 'center', padding: '8px 6px', cursor: 'pointer' }}
                title={t('dash.kpiDrillHint', '클릭 = 해당 화면')}
                onClick={() => {
                  // F10 — KPI 드릴다운: 지표별 담당 화면 탭
                  const target = KPI_DRILL[k.label]
                  if (!target) return
                  shell.openTab(SCREEN_BY_NODE[target.node])
                  shell.setStatusMsg(target.msg)
                }}>
                <div style={{
                  fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  color: k.err ? 'var(--err)' : 'var(--title-navy)',
                }}>{k.value}</div>
                <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>
                  {KPI_LABEL_KEYS[k.label] ? t(KPI_LABEL_KEYS[k.label], k.label) : k.label}
                </div>
              </div>
            </div>
          ))}
        </div>
        <GroupBox title={t('dash.processStatus', 'Project 전후 공정 현황 — {n}')
          .replace('{n}', project === '전체' ? 'Micron #7' : project)}>
          <FlowRow items={PROCESS_FLOW_1} />
          <FlowRow items={PROCESS_FLOW_2} />
          <div style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
            {t('dash.flowHint', '현재 OR 수주 단계 — 자동(☑) 프로세스는 EDIM Run 산출물로 상태 전이')}
          </div>
        </GroupBox>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <GroupBox title={t('dash.profitTitle', '프로젝트별 손익 (수주액·원가·마진)')}>
            <Cvs blocks={[
              { id: 'a', name: t('dash.blkOrder', '수주 23.0'), x: 30, y: 76, w: 60, h: 40 },
              { id: 'b', name: t('dash.blkCost', '원가 18.8'), x: 110, y: 90, w: 60, h: 26 },
              { id: 'c', name: 'EBIT 18.2%', x: 190, y: 84, w: 70, h: 32 },
            ]} style={{ height: 130 }} />
          </GroupBox>
          <GroupBox title={t('dash.cashTitle', '자금 흐름 (매입 출금 · 매출 입금)')}>
            <Cvs blocks={[
              { id: 'o', name: t('dash.blkOut', '출금 -4.2'), sub: t('dash.monAug', '08월'), x: 30, y: 30, w: 70, h: 34 },
              { id: 'i', name: t('dash.blkIn', '입금 +9.1'), sub: t('dash.monSep', '09월'), x: 130, y: 66, w: 70, h: 34 },
            ]} style={{ height: 130 }} />
          </GroupBox>
        </div>
        {anly ? (
          <GroupBox title={t('dash.analytics', 'EDIM Run 분석 — 통계·원가 추이 (cpq_run·cst_calc)')}
            right={<Chip tone="ok">{t('dash.anlyRuns', '실 누적 {n}건').replace('{n}', String(anly.runStats.total))}</Chip>}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { l: t('dash.anlyTotal', '총 Run'), v: String(anly.runStats.total) },
                  { l: t('dash.anlyRate', '성공률'), v: `${anly.runStats.successRate}%` },
                  { l: t('dash.anlyAvg', '평균 소요'), v: `${anly.runStats.avgDurationSec}s` },
                  { l: t('dash.anlyFail', '실패'), v: String(anly.runStats.failed), err: anly.runStats.failed > 0 },
                ].map((s) => (
                  <div key={s.l} style={{ minWidth: 72, textAlign: 'center', padding: '4px 8px', border: '1px solid var(--line)', background: '#fff' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: s.err ? 'var(--err)' : 'var(--title-navy)' }}>{s.v}</div>
                    <div style={{ fontSize: 10, color: 'var(--txt-dim)' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 230 }}>
                {(() => {
                  const c = anly.costByType
                  const rows = [
                    { k: t('dash.costMat', '재료비'), v: c.MATERIAL?.total ?? 0, color: '#2F6FB0' },
                    { k: t('dash.costMfg', '제조비'), v: c.MANUFACTURING?.total ?? 0, color: '#2F9463' },
                    { k: t('dash.costDir', '직접경비'), v: c.DIRECT?.total ?? 0, color: '#B4820B' },
                  ]
                  const max = Math.max(1, ...rows.map((r) => r.v))
                  return rows.map((r) => (
                    <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0', fontSize: 11 }}>
                      <span style={{ width: 52, color: 'var(--txt-dim)' }}>{r.k}</span>
                      <div style={{ flex: 1, background: '#EEF1F5', height: 12 }}>
                        <div style={{ width: `${r.v / max * 100}%`, height: '100%', background: r.color }} />
                      </div>
                      <span style={{ width: 96, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>₩ {Math.round(r.v).toLocaleString()}</span>
                    </div>
                  ))
                })()}
                <div style={{ fontSize: 9.5, color: 'var(--txt-mute)', marginTop: 2 }}>
                  {t('dash.anlyHint', '누적 Run 원가 3분류 합계 — 원천 cst_calc (B18)')}
                </div>
              </div>
            </div>
          </GroupBox>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 6 }}>
          <GroupBox title={t('dash.deptEvents', '부서별 Event 상황 — 더블클릭=부서 업무함')} noPad>
            <table className="g">
              <thead>
                <tr>
                  <th>{t('dash.dept', '부서')}</th>
                  <th>{t('enum.waiting', '대기')}</th>
                  <th>{t('enum.progress', '진행')}</th>
                  <th>{t('dash.doneWeek', '완료(주)')}</th>
                  <th>{t('enum.delayed', '지연')}</th>
                </tr>
              </thead>
              <tbody>
                {data.deptEvents.map((d) => (
                  <tr key={d.dept} onDoubleClick={() => openDept(d.dept)} style={{ cursor: 'pointer' }}>
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
          <GroupBox title={t('dash.alertsTitle', '이상 경고 (시간·자금) — 더블클릭=이벤트 상세')} noPad>
            <table className="g">
              <thead><tr><th>{t('dash.kind', '구분')}</th><th>Project</th><th>{t('dash.content', '내용')}</th></tr></thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.project + a.message} onDoubleClick={() => openEvent(a.project)}
                    style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--err)', fontWeight: 700 }}>
                      {a.kind === '자금' ? t('dash.kindMoney', '자금') : t('dash.kindTime', '시간')}
                    </td>
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
