'use client'

/** U4 생산 스케줄·Capacity 패널 (ERP-023, 슬라이드 46) — 작업장 부하 바 + 미완료 WO 공수.
 *  공수 = Work Process(U3) MAKE work_time 합 · Capacity = 인원×480분/일 근사(명시). */
import { GroupBox, Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'

export interface ScheduleData {
  orders: { woNo: string; title: string; drawingNo: string; projectNo: string; status: string; assignee: string; issuedAt: string; ageDays: number; workMin: number }[]
  workshops: { workshop: string; loadMin: number; persons: number; capMinPerDay: number; loadPct: number; daysNeeded: number }[]
  openCount: number
  totalWorkMin: number
}

export function SchedulePanel({ data }: { data: ScheduleData }) {
  const { t } = useI18n()
  const barColor = (pct: number) => pct > 100 ? 'var(--err)' : pct > 70 ? 'var(--warn, #B4820B)' : 'var(--run)'
  return (
    <div data-schedule-panel style={{ width: 320, flexShrink: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <GroupBox title={`${t('wo.capTitle', '작업장 Capacity')} — ${data.workshops.length}`} noPad>
        <div style={{ padding: 6, fontSize: 10.5, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {data.workshops.length ? data.workshops.map((w) => (
            <div key={w.workshop}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <b style={{ flex: 1 }}>{w.workshop}</b>
                <span style={{ fontSize: 9.5, color: 'var(--txt-mute)' }}>{w.persons}{t('wo.persons', '명')} · {Math.round(w.loadMin)}{t('wo.min', '분')}</span>
                <b style={{ color: barColor(w.loadPct), fontSize: 10 }}>{w.loadPct}%</b>
              </div>
              <div style={{ height: 6, background: 'var(--line-soft, #E1E5EB)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, w.loadPct)}%`, height: '100%', background: barColor(w.loadPct) }} />
              </div>
              <div style={{ fontSize: 9, color: 'var(--txt-mute)' }}>{t('wo.daysNeeded', '소요')} {w.daysNeeded}{t('wo.days', '일')} ({t('wo.capBasis', '인원×480분/일 근사')})</div>
            </div>
          )) : <div style={{ color: 'var(--txt-mute)' }}>{t('wo.noCap', '부하 없음 — Work Process 공수(U3) 입력 시 집계')}</div>}
        </div>
      </GroupBox>
      <GroupBox title={`${t('wo.schedTitle', '미완료 WO 스케줄')} — ${data.openCount} · ${Math.round(data.totalWorkMin)}${t('wo.min', '분')}`} noPad>
        <table className="g" style={{ width: '100%', fontSize: 10 }}>
          <thead><tr><th>WO</th><th>{t('wo.drawing', '도면')}</th><th>{t('common.status', '상태')}</th><th>{t('wo.workMin', '공수')}</th><th>{t('wo.age', '경과')}</th></tr></thead>
          <tbody>{data.orders.length ? data.orders.map((o) => (
            <tr key={o.woNo}>
              <td className="code">{o.woNo}</td><td className="c">{o.drawingNo}</td>
              <td className="c"><Chip tone={o.status === 'STARTED' ? 'info' : 'warn'}>{o.status}</Chip></td>
              <td className="c">{o.workMin ? `${Math.round(o.workMin)}분` : '—'}</td>
              <td className="c" style={{ color: o.ageDays > 7 ? 'var(--err)' : undefined }}>{o.ageDays}{t('wo.days', '일')}</td>
            </tr>
          )) : <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt-mute)' }}>{t('wo.noOpen', '미완료 작업지시 없음')}</td></tr>}</tbody>
        </table>
      </GroupBox>
    </div>
  )
}
