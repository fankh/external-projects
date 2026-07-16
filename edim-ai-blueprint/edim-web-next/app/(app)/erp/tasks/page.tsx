import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { TaskGrid, type TaskRow } from './TaskGrid'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: TaskRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<TaskRow[]>('/erp/events')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('task.title', '업무함')} (M-15-3)`} count={err ? undefined : rows.length} source="/erp/events" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <TaskGrid rows={rows} />}
      </div>
    </div>
  )
}
