import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { CompanyGrid, type CompanyRow } from './CompanyGrid'
import { CompanyForm } from './CompanyForm'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  let rows: CompanyRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<CompanyRow[]>('/companies')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="거래처 대장 (M-14-2)" count={err ? undefined : rows.length} source="/companies" />
      <CompanyForm />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <CompanyGrid rows={rows} />}
      </div>
    </div>
  )
}
