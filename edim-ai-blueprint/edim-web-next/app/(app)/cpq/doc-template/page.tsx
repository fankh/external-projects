import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import { DocTemplate } from './DocTemplate'

export const dynamic = 'force-dynamic'

export default async function DocTemplatePage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`Document Templet (C-3) — ${t('doctpl.densityCalcDoc', '밀도 계산서')}`} source="/render/pdf (client)" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <DocTemplate />
      </div>
    </div>
  )
}
