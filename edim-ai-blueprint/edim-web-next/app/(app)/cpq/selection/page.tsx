import { apiServer } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { CanvasBlock } from '@/lib/cadTypes'
import { SelectionView } from './SelectionView'
import type { BomItem, ExpandResult, SelectionRow } from './actions'

export const dynamic = 'force-dynamic'

interface ArrangementComponent { position: string; code: string; name: string; quantity: number; componentId?: number; x?: number; y?: number; w?: number; h?: number }

const DEFAULT_SLOTS: Record<string, string> = { B: '13', C: '32', E: '15' }
const PROJECT = 'PS-61313-5'
const ARR_CODE = 'ARR-DD2'

export default async function SelectionPage() {
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  const [expand, selections, comps] = await Promise.all([
    apiServer<ExpandResult>('/codes/products/expand', { method: 'POST', body: JSON.stringify({ rootCode: 'KDCR 3-13', slotValues: DEFAULT_SLOTS }) }).catch(() => null),
    apiServer<SelectionRow[]>(`/cpq/selections?projectNo=${encodeURIComponent(PROJECT)}`).catch(() => []),
    apiServer<ArrangementComponent[]>(`/arrangements/${ARR_CODE}/components`).catch(() => []),
  ])
  const bom: BomItem[] = expand?.items ?? []
  const finished = expand?.finishedGoodsCode ?? ''
  const arrBlocks: CanvasBlock[] | null = comps.length
    ? comps.map((c) => ({ id: String(c.componentId ?? c.code), name: c.code, sub: c.position || `×${c.quantity}`, x: c.x ?? 20, y: c.y ?? 20, w: c.w ?? 130, h: c.h ?? 56 }))
    : null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('menu.cpq-selection', '제품 선정 (C-1)')} — KDCR 3-13`} source="/codes/products/expand · /cpq/selections · /arrangements" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <SelectionView projectNo={PROJECT} initialFinished={finished} initialBom={bom} initialSlots={DEFAULT_SLOTS} selections={selections} arrBlocks={arrBlocks} />
      </div>
    </div>
  )
}
