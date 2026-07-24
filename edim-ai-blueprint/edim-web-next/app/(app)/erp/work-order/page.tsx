import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { WoGrid, type WoRow } from './WoGrid'
import { SchedulePanel, type ScheduleData } from './SchedulePanel'

export const dynamic = 'force-dynamic'

export default async function WorkOrderPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: WoRow[] = []
  let schedule: ScheduleData | null = null
  let err: string | null = null
  try {
    // 정정: 기존에 /erp/work-process(MAKE/BUY 행) 를 불러 WO 그리드가 빈 상태였음 (잠복 버그)
    ;[rows, schedule] = await Promise.all([
      apiServer<WoRow[]>('/erp/work-orders'),
      apiServer<ScheduleData>('/erp/production/schedule').catch(() => null),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('wo.header', '작업지시')} (D-3)`} count={err ? undefined : rows.length} cap={2000} source="/erp/work-orders · production/schedule" />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
          <>
            <div style={{ flex: 1, minWidth: 0 }}><WoGrid rows={rows} /></div>
            {schedule ? <SchedulePanel data={schedule} /> : null}
          </>
        )}
      </div>
    </div>
  )
}
