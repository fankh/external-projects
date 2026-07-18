import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SubWorkPlace } from '@/components/panels/SubWorkPlace'
import { SlotGrid, type SlotRow } from './SlotGrid'

export const dynamic = 'force-dynamic'

export default async function SubCodePage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const group = (sp.group ?? 'KOF').trim() || 'KOF'
  let rows: SlotRow[] = []
  let err: string | null = null
  try {
    rows = await apiServer<SlotRow[]>(`/codes/groups/${encodeURIComponent(group)}/slots`)
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('menu.code-subcode', 'Sub Code 등록 (S-1-1)')} — ${group}`} count={err ? undefined : rows.length} countLabel="slot" source="/codes/groups/{group}/slots" />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <div style={{ flex: 1, minWidth: 0 }}><SlotGrid rows={rows} group={group} /></div>}
        <SubWorkPlace />
      </div>
    </div>
  )
}
