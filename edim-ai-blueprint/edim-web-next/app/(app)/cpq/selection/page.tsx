import { apiServer } from '@/lib/api'
import { getLocale } from '@/lib/session'
import { bundleFor, translate } from '@/lib/i18n'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { CanvasBlock } from '@/lib/cadTypes'
import { SelectionView } from './SelectionView'
import { approvedProducts } from './actions'
import type { BomItem, ExpandResult, SelectionRow } from './actions'

export const dynamic = 'force-dynamic'

interface ArrangementComponent { position: string; code: string; name: string; quantity: number; componentId?: number; x?: number; y?: number; w?: number; h?: number }

const DEFAULT_SLOTS: Record<string, string> = { B: '13', C: '32', E: '15' }
const PROJECT = 'PS-61313-5'
const ARR_CODE = 'ARR-DD2'
const FALLBACK_ROOT = 'KDCR 3-13'   // 승인 제품이 하나도 없을 때만 쓰는 마지막 폴백

export default async function SelectionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams
  const locale = await getLocale()
  const bundle = bundleFor(locale)
  const t = (k: string, ko: string) => translate(bundle, k, ko)
  interface ArrRow { code: string; name: string; family: string; components: number; common?: boolean; familyGroup?: string | null }
  // 규격 CPQ-001 — 승인된 제품 중에서 선택한다. 종전에는 ROOT 가 상수라 다른 제품을
  // 견적할 수 없었고, 저장되는 견적안도 전부 데모 제품이었다.
  const products = await approvedProducts()
  const ROOT = (sp.code ?? '').trim()
    || (products.find((p) => p.mainCode === FALLBACK_ROOT)?.mainCode)
    || products[0]?.mainCode
    || FALLBACK_ROOT

  const [expand, selections, comps, arrangements] = await Promise.all([
    apiServer<ExpandResult>('/codes/products/expand', { method: 'POST', body: JSON.stringify({ rootCode: ROOT, slotValues: DEFAULT_SLOTS }) }).catch(() => null),
    apiServer<SelectionRow[]>(`/cpq/selections?projectNo=${encodeURIComponent(PROJECT)}`).catch(() => []),
    apiServer<ArrangementComponent[]>(`/arrangements/${ARR_CODE}/components`).catch(() => []),
    // #31 — 현재 구성 중인 코드의 제품군으로 Arrangement 를 좁힌다(공통 Arrangement 는 항상 포함)
    apiServer<ArrRow[]>(`/arrangements?forCode=${encodeURIComponent(ROOT)}`).catch(() => []),
  ])
  const bom: BomItem[] = expand?.items ?? []
  const finished = expand?.finishedGoodsCode ?? ''
  const arrBlocks: CanvasBlock[] | null = comps.length
    ? comps.map((c) => ({ id: String(c.componentId ?? c.code), name: c.code, sub: c.position || `×${c.quantity}`, x: c.x ?? 20, y: c.y ?? 20, w: c.w ?? 130, h: c.h ?? 56 }))
    : null

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`${t('menu.cpq-selection', '제품 선정 (C-1)')} — ${ROOT}`} source="/codes/products/expand · /cpq/selections · /arrangements" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <SelectionView projectNo={PROJECT} initialFinished={finished} initialBom={bom} initialSlots={DEFAULT_SLOTS}
          selections={selections} arrBlocks={arrBlocks} arrangements={arrangements} initialArr={ARR_CODE}
          root={ROOT} products={products} />
      </div>
    </div>
  )
}
