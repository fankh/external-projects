import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { HolidayGrid, type HolidayRow } from './HolidayGrid'
import { HolidayForm } from './HolidayForm'
import { WorkdayCalc } from './WorkdayCalc'

export const dynamic = 'force-dynamic'

export default async function HolidaysPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: HolidayRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<HolidayRow[]>('/calendar/holidays')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('cal.title', '근무일·휴일 캘린더')} (M-8-6)`} count={err ? undefined : rows.length} source="/calendar/holidays" />
      <HolidayForm />
      <WorkdayCalc />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <HolidayGrid rows={rows} />}
      </div>
    </div>
  )
}
