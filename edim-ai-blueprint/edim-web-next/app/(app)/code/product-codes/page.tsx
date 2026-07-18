import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SubWorkPlace } from '@/components/panels/SubWorkPlace'
import { PcGrid, type PcRow } from './PcGrid'

export const dynamic = 'force-dynamic'

export default async function ProductCodesPage() {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  let rows: PcRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<PcRow[]>('/codes/products')
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('master.title', '제품 코드 마스터')} (M-3-8)`} count={err ? undefined : rows.length} source="/codes/products" />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <div style={{ flex: 1, minWidth: 0 }}><PcGrid rows={rows} /></div>}
        <SubWorkPlace />
      </div>
    </div>
  )
}
