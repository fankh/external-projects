import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { SubWorkPlace } from '@/components/panels/SubWorkPlace'
import { listHeads, getHead, type HeadDetail } from '@/lib/headActions'
import { HeadAdmin } from './HeadAdmin'

export const dynamic = 'force-dynamic'

export default async function HeadsPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const bundle = bundleFor(await getLocale())
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const sp = await searchParams
  const rows = await listHeads(true)
  const selId = Number(sp.sel ?? 0) || (rows[0]?.headId ?? 0)
  let detail: HeadDetail | null = null
  if (selId) detail = await getHead(selId)
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('head.adminTitle', 'Head 관리')} (M-14-6E)`} count={rows.length}
        countLabel="head" source="/heads" />
      <div style={{ flex: 1, minHeight: 0, padding: 6, display: 'flex', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <HeadAdmin rows={rows} detail={detail} selId={selId} />
        </div>
        <SubWorkPlace />
      </div>
    </div>
  )
}
