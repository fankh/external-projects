/** M-15-3 부서 업무함 (W-22) — Schedule 위젯의 전체 화면 버전.
 *  선행 DONE 검사 + 기한 규칙 (W-14 정의) · 완료 처리 실동작. */
import { useEffect, useState } from 'react'
import { eventService, type ErpEvent } from '../../api/services'
import { Btn, Chip, GroupBox } from '../../components/controls'
import { DenseGrid, type GridColumn } from '../../components/DenseGrid'
import { useI18n } from '../../i18n/I18nContext'
import { useShell } from '../../shell/ShellContext'
import type { ScreenProps } from '../../shell/Shell'

// 필터 내부 값 (비교 로직 키) — 표시 라벨은 컴포넌트 내부에서 t() 로 번역
const FILTERS = ['내 업무', '부서 전체', '지연', '완료']

export function TaskBoxScreen(_props: ScreenProps) {
  const shell = useShell()
  const { t } = useI18n()
  const [tasks, setTasks] = useState<ErpEvent[]>([])
  const [filter, setFilter] = useState('내 업무')
  const [selKey, setSelKey] = useState<string | null>(null)

  useEffect(() => {
    void eventService.list().then((rows) => {
      setTasks(rows)
      setSelKey(rows.find((r) => r.delayed)
        ? `${rows.find((r) => r.delayed)!.code}:${rows.find((r) => r.delayed)!.project}` : null)
    })
  }, [])

  const key = (t: ErpEvent) => `${t.code}:${t.project}`
  const rows = tasks.filter((t) => filter === '지연' ? t.delayed
    : filter === '완료' ? t.status === 'DONE'
      : filter === '내 업무' ? t.status !== 'DONE' : true)
  const sel = tasks.find((t) => key(t) === selKey) ?? null

  const complete = () => {
    if (!sel) return
    void (async () => {
      await eventService.complete(sel.eventId, '업무함 완료 처리')
      setTasks((prev) => prev.map((t) => (key(t) === key(sel)
        ? { ...t, status: 'DONE', delayed: false } : t)))
      shell.setStatusMsg(`${sel.code} 완료 처리 (erp_process_event DONE) — 후행 이벤트·경고 해제`)
    })()
  }

  // 필터 내부 값 → 표시 라벨 (값은 비교 로직에 그대로 사용)
  const filterLabels: Record<string, string> = {
    '내 업무': t('taskbox.myTasks', '내 업무'),
    '부서 전체': t('taskbox.deptAll', '부서 전체'),
    '지연': t('enum.delayed', '지연'),
    '완료': t('enum.done', '완료'),
  }

  const cols: GridColumn<ErpEvent>[] = [
    { key: 'code', header: t('taskbox.code', '코드'), width: 40, align: 'center', code: true, render: (r) => r.code },
    { key: 'p', header: 'Project', width: 84, code: true, render: (r) => r.project },
    { key: 't', header: t('taskbox.title', '건명'), render: (r) => r.title },
    { key: 'o', header: t('taskbox.owner', '담당'), width: 58, align: 'center', render: (r) => r.owner },
    {
      key: 'd', header: t('taskbox.deadline', '기한'), width: 48, align: 'center',
      render: (r) => (
        <span style={r.delayed ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{r.deadline}</span>
      ),
    },
    {
      key: 'st', header: t('appr.status', '상태'), width: 52, align: 'center',
      render: (r) => (
        <Chip tone={r.status === 'DONE' ? 'ok' : r.status === '지연' ? 'err' : 'info'}>
          {r.status === '지연' ? t('enum.delayed', '지연')
            : r.status === '진행' ? t('enum.progress', '진행') : r.status}
        </Chip>
      ),
    },
  ]

  return (
    <div className="fill-col">
      <div style={{ display: 'flex', gap: 6, flex: 1, minHeight: 0, padding: 6 }}>
        <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 6, flex: 'none' }}>
          <GroupBox title={t('taskbox.filter', '필터')} noPad>
            <div className="tree2">
              {FILTERS.map((f) => (
                <div key={f} className={`tn ${filter === f ? 'sel' : ''}`} onClick={() => setFilter(f)}>
                  <span className="pm">·</span>{filterLabels[f] ?? f}
                  <span style={{ flex: 1 }} />
                  {f === '지연' ? <Chip tone="err">{tasks.filter((x) => x.delayed).length}</Chip> : null}
                </div>
              ))}
            </div>
          </GroupBox>
          <GroupBox title={t('taskbox.process', '프로세스')} noPad>
            <div className="tree2" style={{ fontSize: 11 }}>
              <div className="tn"><span className="pm">·</span>☑ {t('taskbox.mrProc', 'MR 제작의뢰')}</div>
              <div className="tn"><span className="pm">·</span>☑ PL·BOM</div>
              <div className="tn"><span className="pm">·</span>☐ PSU·PLM</div>
            </div>
          </GroupBox>
        </div>
        <div className="fill-col" style={{ gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('taskbox.tasksN', '업무 — {n}건').replace('{n}', String(rows.length))} noPad>
            <DenseGrid columns={cols} rows={rows} rowKey={(r) => key(r)}
              selectedKey={selKey} onRowClick={(r) => setSelKey(key(r))} />
          </GroupBox>
          {sel ? (
            <GroupBox title={`${t('appr.detail', '상세')} — ${sel.code} ${sel.title}`}>
              <div className="flow">
                <span className="fs done">{t('taskbox.orDone', 'OR 수주 DONE')}</span>
                <span className="ar">→</span>
                <span className={`fs ${sel.status === 'DONE' ? 'done' : 'now'}`}>{sel.code}</span>
                <span className="ar">→</span>
                <span className="fs">{sel.code === 'PL' ? 'BOM' : sel.code === 'MR' ? 'BOM' : 'PR'}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--txt-dim)', margin: '6px 0' }}>
                {t('taskbox.deadlineRule', '기한 규칙: OR+7일 (W-14 정의)')}
                {sel.delayed
                  ? <b style={{ color: 'var(--err)' }}> — {t('taskbox.overdueWarn', '2일 초과, Dashboard 이상 경고 발생')}</b>
                  : null}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <Btn onClick={() => shell.setStatusMsg('처리 Form 열기 — erp_process_def.form_id (Toolbox)')}>
                  {t('taskbox.openForm', '처리 Form 열기 (Toolbox)')}
                </Btn>
                <Btn variant="run" disabled={sel.status === 'DONE'} onClick={complete}>
                  {t('taskbox.completeDone', '완료 처리 (DONE)')}
                </Btn>
              </div>
            </GroupBox>
          ) : null}
        </div>
        <div className="split-h" />
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
          <GroupBox title={t('taskbox.alerts', '이상 경고')} noPad>
            <table className="g">
              <thead><tr><th>{t('taskbox.kind', '구분')}</th><th>{t('taskbox.content', '내용')}</th></tr></thead>
              <tbody>
                {tasks.some((x) => x.delayed) ? (
                  <tr>
                    <td style={{ color: 'var(--err)', fontWeight: 700 }}>{t('taskbox.timeKind', '시간')}</td>
                    <td>{t('taskbox.plOverdue', 'PL 기한 초과 2일')}</td>
                  </tr>
                ) : (
                  <tr><td colSpan={2} style={{ color: 'var(--txt-mute)' }}>{t('taskbox.noAlerts', '경고 없음')}</td></tr>
                )}
              </tbody>
            </table>
          </GroupBox>
          <GroupBox title={t('taskbox.mySchedule', '내 일정 (주간)')}>
            <div className="cvs" style={{ height: 76 }}>
              {[t('taskbox.mon', '월'), t('taskbox.tue', '화'), t('taskbox.wed', '수'),
                t('taskbox.thu', '목'), t('taskbox.fri', '금')].map((d, i) => (
                  <div key={d} className={`m2 ${i === 2 ? 'sel' : ''}`}
                    style={{ left: 8 + i * 46, top: 10, width: 40, height: 52 }}>
                    {d}<small>{i === 1 ? 'MR' : i === 2 ? 'PL!' : ''}</small>
                  </div>
                ))}
            </div>
          </GroupBox>
          <GroupBox title={t('taskbox.apprBox', '승인 요청함')} right={<Chip tone="warn">4</Chip>}>
            <Btn onClick={() => shell.openTab({
              id: 'com-approval', screenId: 'com-approval', code: 'M-15-2', title: '승인함',
            })}>{t('taskbox.gotoInbox', '→ 승인함으로 이동')}</Btn>
          </GroupBox>
        </div>
      </div>
    </div>
  )
}
