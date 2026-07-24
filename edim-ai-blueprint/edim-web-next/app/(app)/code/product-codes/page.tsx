import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SearchBox } from '@/components/SearchBox'
import { SubWorkPlace } from '@/components/panels/SubWorkPlace'
import { PcGrid, type PcRow } from './PcGrid'

export const dynamic = 'force-dynamic'

export default async function ProductCodesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const q = ((await searchParams).q ?? '').trim()
  let rows: PcRow[] = []
  let err: string | null = null
  // #28 — Slot 이 정의된 그룹은 조합 생성만, 없는 그룹은 수동 등록만 가능하다.
  let composeGroups: string[] = []
  let manualGroups: string[] = []
  try {
    rows = await apiServer<PcRow[]>(`/codes/products${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    const groups = await apiServer<{ groupCode: string; slotCount: number }[]>('/codes/groups')
    composeGroups = groups.filter((g) => g.slotCount > 0).map((g) => g.groupCode)
    manualGroups = groups.filter((g) => g.slotCount === 0).map((g) => g.groupCode)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('master.title', '제품 코드 마스터')} (M-3-8)`} count={err ? undefined : rows.length} source="/codes/products" />
      <div style={{ padding: '4px 6px 0' }}><SearchBox placeholder={t('products.searchPlaceholder', '제품코드·품명 검색')} /></div>
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <div style={{ flex: 1, minWidth: 0 }}><PcGrid rows={rows} composeGroups={composeGroups} manualGroups={manualGroups} /></div>}
        <SubWorkPlace />
      </div>
    </div>
  )
}
