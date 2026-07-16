import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { GroupGrid, type GroupRow } from './GroupGrid'
import { HierarchyPanel, type HierarchyNode } from './HierarchyPanel'

export const dynamic = 'force-dynamic'

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ tree?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const treeType = (sp.tree ?? 'PRODUCT').trim() || 'PRODUCT'
  let rows: GroupRow[] = []
  let nodes: HierarchyNode[] = []
  let err: string | null = null
  try {
    ;[rows, nodes] = await Promise.all([
      apiServer<GroupRow[]>('/codes/groups'),
      apiServer<HierarchyNode[]>(`/hierarchy?treeType=${encodeURIComponent(treeType)}`).catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('hier.title', '코드 그룹 · Hierarchy (S-1 / M-3-1)')} count={err ? undefined : rows.length} countLabel={t('hier.groupUnit', '그룹')} source="/codes/groups · /hierarchy" />
      {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : (
        <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}><GroupGrid rows={rows} /></div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            <HierarchyPanel nodes={nodes} treeType={treeType} />
          </div>
        </div>
      )}
    </div>
  )
}
