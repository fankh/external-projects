import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { HolidayGrid, type HolidayRow } from './HolidayGrid'
import { HolidayForm } from './HolidayForm'

export const dynamic = 'force-dynamic'

export default async function HolidaysPage() {
  let rows: HolidayRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<HolidayRow[]>('/calendar/holidays')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="근무일·휴일 캘린더 (M-8-6)" count={err ? undefined : rows.length} source="/calendar/holidays" />
      <HolidayForm />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <HolidayGrid rows={rows} />}
      </div>
    </div>
  )
}
