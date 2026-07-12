/** D7 프로젝트 일정·마일스톤 — 단계별 납기(수주→설계→구매→제작→출하) 등록·진척.
 *  지연 임박(D-7)/초과 자동 판정 + 프로젝트별 진척 요약. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { milestoneService, type Milestone, type MilestoneSummary } from '../../api/services'
import { Btn, Chip, Combo, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import { useFKeys } from '../../shell/useFKeys'
import type { ScreenProps } from '../../shell/Shell'

const DELAY_TONE: Record<string, 'ok' | 'warn' | 'err' | 'info'> = {
  DONE: 'ok', OVERDUE: 'err', DUE_SOON: 'warn', PENDING: 'info',
}
const DELAY_LABEL: Record<string, string> = {
  DONE: '완료', OVERDUE: '지연', DUE_SOON: '임박', PENDING: '예정',
}
const STAGE_OPTS = [
  { value: 'ORDER', label: '수주' }, { value: 'DESIGN', label: '설계' },
  { value: 'PURCHASE', label: '구매' }, { value: 'PRODUCTION', label: '제작' },
  { value: 'SHIPMENT', label: '출하' },
]

export function MilestoneScreen({ active }: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [rows, setRows] = useState<Milestone[]>([])
  const [sum, setSum] = useState<MilestoneSummary | null>(null)
  const [stage, setStage] = useState('ORDER')

  const load = useCallback(() => {
    void milestoneService.list().then((r) => { if (r) setRows(r) })
    void milestoneService.summary().then(setSum)
  }, [])
  useEffect(() => { load() }, [load])

  const add = useCallback(() => {
    const projectNo = (shell.activeProject?.no
      || window.prompt('프로젝트 번호 (예: PS-612)', '')?.trim() || '').trim()
    if (!projectNo) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>프로젝트를 선택하거나 입력하십시오</span>); return }
    const plannedDate = window.prompt(`${STAGE_OPTS.find((s) => s.value === stage)?.label} 단계 계획 납기일 (YYYY-MM-DD)`, '')?.trim()
    if (!plannedDate) return
    const note = window.prompt('비고 (생략 가능)', '')?.trim() || undefined
    void milestoneService.create({ projectNo, stage, plannedDate, note })
      .then((id) => {
        if (id === false) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
        load()
        shell.setStatusMsg(`마일스톤 등록 ✓ — ${projectNo} ${STAGE_OPTS.find((s) => s.value === stage)?.label} ${plannedDate}`)
      })
      .catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }, [stage, shell, load])

  useFKeys(active, useMemo(() => ({ F8: load, F2: add }), [load, add]))

  const complete = (m: Milestone) => {
    void milestoneService.done(m.milestoneId).then((ok) => {
      if (!ok) { shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>백엔드 연결 필요</span>); return }
      load()
      shell.setStatusMsg(`완료 처리 ✓ — ${m.projectNo} ${m.stageLabel}`)
    }).catch((e: Error) => shell.setStatusMsg(<span style={{ color: 'var(--err)' }}>{e.message}</span>))
  }

  const cols: GridColumn<Milestone>[] = [
    { key: 'proj', header: 'Project', width: 90, code: true, render: (r) => r.projectNo },
    { key: 'stage', header: t('ms.stage', '단계'), width: 64, align: 'center', render: (r) => r.stageLabel },
    { key: 'plan', header: t('ms.planned', '계획 납기'), width: 100, align: 'center', render: (r) => r.plannedDate },
    { key: 'act', header: t('ms.actual', '실제 완료'), width: 100, align: 'center', render: (r) => r.actualDate ?? '-' },
    {
      key: 'delay', header: t('ms.delay', '상태'), width: 90, align: 'center',
      render: (r) => (
        <Chip tone={DELAY_TONE[r.delayStatus] ?? 'info'}>
          {DELAY_LABEL[r.delayStatus] ?? r.delayStatus}
          {r.delayStatus === 'OVERDUE' ? ` ${-r.daysLeft}일` : ''}
          {r.delayStatus === 'DUE_SOON' ? ` D-${r.daysLeft}` : ''}
        </Chip>
      ),
    },
    {
      key: 'wd', header: t('ms.workdays', '영업일'), width: 74, align: 'right',
      sortValue: (r) => r.workdaysLeft,
      render: (r) => (r.status === 'DONE' ? '-'
        : <span style={{ color: r.workdaysLeft < 0 ? 'var(--err)' : r.workdaysLeft <= 3 ? 'var(--warn)' : 'var(--txt)' }}>
          {r.workdaysLeft < 0 ? `${-r.workdaysLeft}d 초과` : `${r.workdaysLeft}d`}</span>),
    },
    { key: 'note', header: t('ms.note', '비고'), render: (r) => r.note || '-' },
    {
      key: 'do', header: t('ms.action', '진행'), width: 66, align: 'center',
      render: (r) => (r.status === 'DONE'
        ? <Chip tone="ok">완료</Chip>
        : <Btn style={{ height: 18, fontSize: 10 }} onClick={() => complete(r)}>완료</Btn>),
    },
  ]

  return (
    <div className="fill-col">
      <div className="qband">
        <label>{t('ms.header', '일정·마일스톤')}</label>
        <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>
          {t('ms.hint', '단계별 납기(수주→설계→구매→제작→출하)·진척 · 지연 임박(D-7)/초과 자동 판정 (D7)')}
        </span>
        <span style={{ flex: 1 }} />
        <Combo value={stage} onChange={setStage} width={90} options={STAGE_OPTS} />
        <Btn onClick={add}>{t('ms.addF2', '납기 등록 F2')}</Btn>
        <Btn onClick={load}>{t('common.query', '조회')} F8</Btn>
      </div>
      <div className="fill-col" style={{ padding: 6, gap: 6, overflow: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {[
            { l: t('ms.kpiOverdue', '지연 초과'), v: sum?.totalOverdue ?? 0, c: 'var(--err)' },
            { l: t('ms.kpiDueSoon', '납기 임박'), v: sum?.totalDueSoon ?? 0, c: 'var(--warn)' },
            { l: t('ms.kpiProjects', '관리 프로젝트'), v: sum?.projectCount ?? 0, c: 'var(--title-navy)' },
          ].map((k) => (
            <div key={k.l} className="gb" style={{ textAlign: 'center', padding: '8px 6px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.c }}>{k.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)' }}>{k.l}</div>
            </div>
          ))}
        </div>
        {sum && sum.projects.length ? (
          <GroupBox title={t('ms.rollup', '프로젝트별 진척 롤업')} noPad>
            <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {sum.projects.map((p) => (
                <div key={p.projectNo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span style={{ width: 80, fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{p.projectNo}</span>
                  <div style={{ flex: 1, height: 12, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${p.progress}%`, height: '100%', background: p.overdue ? 'var(--err)' : 'var(--ok)' }} />
                  </div>
                  <span style={{ width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.progress}%</span>
                  <span style={{ width: 130, color: 'var(--txt-dim)' }}>
                    {p.done}/{p.total} 완료{p.overdue ? ` · 지연 ${p.overdue}` : ''}{p.dueSoon ? ` · 임박 ${p.dueSoon}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </GroupBox>
        ) : null}
        <GroupBox title={t('ms.listTitle', '마일스톤 — 단계별 납기·진척 (prj_milestone)')} noPad>
          {rows.length ? (
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => String(r.milestoneId)} />
          ) : (
            <div style={{ padding: 10, fontSize: 11, color: 'var(--txt-mute)' }}>
              {t('ms.empty', '마일스톤 없음 — 단계 선택 후 F2 로 납기 등록')}
            </div>
          )}
        </GroupBox>
      </div>
    </div>
  )
}
