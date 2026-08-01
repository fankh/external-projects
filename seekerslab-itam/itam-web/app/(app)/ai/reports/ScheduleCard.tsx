'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { ReportKind } from '@/lib/types'
import { runDueSchedules, toggleSchedule } from './actions'

type Row = {
  kind: ReportKind; period: '주간' | '월간'; enabled: boolean
  hour: number; dayLabel: string; recipients: string[]
  lastRunAt?: string; nextRun: string | null; overdue: boolean
}

export function ScheduleCard({ rows, adhoc }: { rows: Row[]; adhoc: { kind: ReportKind; desc: string }[] }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const dueCount = rows.filter((r) => r.enabled && r.overdue).length

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
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>리포트</th><th className="c">주기</th><th>실행 시점</th><th className="c">마지막 실행</th><th className="c">다음 실행</th><th>수신자</th><th className="c">상태</th><th className="c">가동</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td className="c">
                  <button className="btn sm" disabled={pending}
                    onClick={() => startTransition(async () => setMsg((await toggleSchedule(r.kind)).message))}>
                    {r.enabled ? '중지' : '가동'}
                  </button>
                </td>
              </tr>
            ))}
            {adhoc.map((a) => (
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
      <div className="callout" style={{ margin: 14 }}>
        <b>예약 실행은 기한이 도래한 가동 스케줄만 돌립니다.</b> 생성된 리포트는 수신자에게 배포되고
        발송 이력이 남아, 배포 사실 자체가 증적이 됩니다. 중지된 스케줄은 기한이 지나도 실행되지 않습니다.
      </div>
    </Card>
  )
}
