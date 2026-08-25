'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { ReportKind } from '@/lib/types'
import { createSchedule, editSchedule, runDueSchedules, toggleSchedule } from './actions'

const DAYS = ['월', '화', '수', '목', '금', '토', '일']

type Row = {
  kind: ReportKind; period: '주간' | '월간'; enabled: boolean
  hour: number; dayOfWeek?: number; dayOfMonth?: number; dayLabel: string; recipients: string[]
  lastRunAt?: string; nextRun: string | null; overdue: boolean
}

export function ScheduleCard({ rows, adhoc, dueOnly: dueOnlyParam }: { rows: Row[]; adhoc: { kind: ReportKind; desc: string; period: '주간' | '월간' | '수시' }[]; dueOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<ReportKind | null>(null)
  const [er, setEr] = useState('')
  const [eh, setEh] = useState(9)
  const [ed, setEd] = useState(1)
  const [pending, startTransition] = useTransition()
  const dueCount = rows.filter((r) => r.enabled && r.overdue).length
  // 기한 도래만 보기 — 대시보드 '정례 리포트 배포 기한 경과' 큐의 드릴다운. 스케줄 표는 정상 주기 항목까지 함께
  //  보여 주므로, 큐가 말한 건수를 화면에서 다시 세어야 했다. 큐 링크는 이 필터를 켠 채 화면을 연다.
  const [dueOnly, setDueOnly] = useState(Boolean(dueOnlyParam))
  const shown = dueOnly ? rows.filter((r) => r.enabled && r.overdue) : rows
  const editRow = rows.find((r) => r.kind === editing) ?? null

  const openEdit = (r: Row) => {
    setEditing(r.kind); setMsg(null)
    setEr(r.recipients.join(', ')); setEh(r.hour)
    setEd(r.period === '주간' ? (r.dayOfWeek ?? 1) : (r.dayOfMonth ?? 1))
  }
  const saveEdit = () => startTransition(async () => {
    if (!editRow) return
    const input = {
      recipients: er.split(',').map((x) => x.trim()).filter(Boolean),
      hour: eh,
      ...(editRow.period === '주간' ? { dayOfWeek: ed } : { dayOfMonth: ed }),
    }
    const r = await editSchedule(editRow.kind, input)
    setMsg(r.message)
    if (r.ok) setEditing(null)
  })

  return (
    <Card
      kicker="Scheduler"
      title="자동 생성 스케줄"
      pad={false}
      actions={
        <button className="btn sm pri" disabled={pending || dueCount === 0}
          onClick={() => startTransition(async () => setMsg((await runDueSchedules()).message))}>
          예약 실행 ({dueCount})
        </button>
      }
    >
      {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
      <div className="hstack" style={{ gap: 8, padding: '10px 14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={`btn sm ${dueOnly ? 'pri' : 'ghost'}`} disabled={dueCount === 0} onClick={() => setDueOnly((d) => !d)}
          title="배포 기한이 도래했는데 아직 생성되지 않은 정례 리포트만 — 대시보드 큐와 같은 집합">
          {dueOnly ? '✓ ' : ''}기한 도래만 {dueCount}
        </button>
        <span className="mut" style={{ fontSize: 12 }}>{shown.length} / {rows.length}건</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>리포트</th><th className="c">주기</th><th>실행 시점</th><th className="c">마지막 실행</th><th className="c">다음 실행</th><th>수신자</th><th className="c">상태</th><th className="c">가동</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.kind}>
                <td className="strong">{r.kind}</td>
                <td className="c"><Chip tone={r.period === '주간' ? 'info' : 'neutral'}>{r.period}</Chip></td>
                <td className="dim">{r.dayLabel} {String(r.hour).padStart(2, '0')}:00</td>
                <td className="c tnum">{r.lastRunAt ?? <span className="dim">-</span>}</td>
                <td className="c tnum">
                  {r.nextRun ?? <span className="dim">-</span>}
                  {r.enabled && r.overdue && <div><Chip tone="warn">기한 도래</Chip></div>}
                </td>
                <td className="dim">{r.recipients.join(' · ')}</td>
                <td className="c">{r.enabled ? <Chip tone="ok">가동</Chip> : <Chip tone="err">중지</Chip>}</td>
                <td className="c" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm" disabled={pending} onClick={() => openEdit(r)}>수정</button>{' '}
                  <button className="btn sm" disabled={pending}
                    onClick={() => startTransition(async () => setMsg((await toggleSchedule(r.kind)).message))}>
                    {r.enabled ? '중지' : '가동'}
                  </button>
                </td>
              </tr>
            ))}
            {adhoc.filter((a) => a.period !== '수시').map((a) => (
              <tr key={a.kind}>
                <td className="strong">{a.kind}</td>
                <td className="c"><Chip tone={a.period === '주간' ? 'info' : 'neutral'}>{a.period}</Chip></td>
                <td className="dim" colSpan={5}>{a.desc} — 스케줄 미등록(현재 수동 생성)</td>
                <td className="c" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm pri" disabled={pending}
                    onClick={() => startTransition(async () => setMsg((await createSchedule(a.kind)).message))}
                    title="정기(월간·주간) 리포트를 자동 생성 대상으로 등록 — 기본값 등록 후 '수정'에서 시점·수신자 조정">스케줄 등록</button>
                </td>
              </tr>
            ))}
            {adhoc.filter((a) => a.period === '수시').map((a) => (
              <tr key={a.kind}>
                <td className="strong">{a.kind}</td>
                <td className="c"><Chip tone="neutral">수시</Chip></td>
                <td className="dim" colSpan={5}>{a.desc} — 사유 발생 시 수동 생성</td>
                <td className="c"><span className="mut">—</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editRow && (
        <div className="vstack" style={{ gap: 8, padding: 14, borderTop: '1px solid var(--line)', background: 'var(--canvas)' }}>
          <div className="kicker mute">스케줄 수정 — {editRow.kind} ({editRow.period})</div>
          <label className="vstack" style={{ gap: 4 }}>
            <span className="dim" style={{ fontSize: 11.5 }}>수신자 (쉼표로 구분)</span>
            <input className="input" value={er} onChange={(e) => setEr(e.target.value)} placeholder="예: it-team, security-team" />
          </label>
          <div className="hstack" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="hstack" style={{ gap: 6, fontSize: 12.5 }}>
              {editRow.period === '주간' ? '요일' : '일자'}
              {editRow.period === '주간' ? (
                <select aria-label="정례 리포트 선택" className="input" value={ed} onChange={(e) => setEd(Number(e.target.value))} style={{ width: 90 }}>
                  {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}요일</option>)}
                </select>
              ) : (
                <input className="input" type="number" min={1} max={31} value={ed}
                  onChange={(e) => setEd(Number(e.target.value))} style={{ width: 80 }} />
              )}
            </label>
            <label className="hstack" style={{ gap: 6, fontSize: 12.5 }}>
              시각
              <input className="input" type="number" min={0} max={23} value={eh}
                onChange={(e) => setEh(Number(e.target.value))} style={{ width: 70 }} /> 시
            </label>
            <span className="right" />
            <button className="btn" disabled={pending} onClick={() => setEditing(null)}>취소</button>
            <button className="btn pri" disabled={pending || !er.trim()} onClick={saveEdit}>저장</button>
          </div>
        </div>
      )}
      <div className="callout" style={{ margin: 14 }}>
        <b>예약 실행은 기한이 도래한 가동 스케줄만 돌립니다.</b> 생성된 리포트는 수신자에게 배포되고
        발송 이력이 남아, 배포 사실 자체가 증적이 됩니다. 중지된 스케줄은 기한이 지나도 실행되지 않습니다.
      </div>
    </Card>
  )
}
