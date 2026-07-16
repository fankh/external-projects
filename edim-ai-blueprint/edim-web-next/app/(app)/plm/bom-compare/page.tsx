import { apiServer, ApiError } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { BomCompareView, type BomCompare } from './BomCompareView'

export const dynamic = 'force-dynamic'

export default async function BomComparePage({ searchParams }: { searchParams: Promise<{ base?: string; target?: string }> }) {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)

  const sp = await searchParams
  const base = (sp.base ?? '').trim()
  const target = (sp.target ?? '').trim()
  let data: BomCompare | null = null
  let err: string | null = null
  if (base && target) {
    try {
      data = await apiServer<BomCompare>(`/codes/bom-compare?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`)
    } catch (e) {
      err = e instanceof ApiError ? e.message : '조회 실패'
    }
  }
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={t('bomcmp.title', 'BOM 비교 (M-4-8)')} source="/codes/bom-compare" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>{t('common.backendError', '백엔드 오류')} — {err}</div>
          : <BomCompareView data={data} base={base} target={target} />}
      </div>
    </div>
  )
}
