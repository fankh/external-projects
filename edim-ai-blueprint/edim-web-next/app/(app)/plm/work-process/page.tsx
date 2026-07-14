import { apiServer, ApiError } from '@/lib/api'
import { ScreenHeader } from '@/components/ScreenHeader'
import { WorkProcessView, type MaterialRow } from './WorkProcessView'

export const dynamic = 'force-dynamic'

export default async function WorkProcessPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams
  const code = (sp.code ?? 'KDCR 3-13').trim() || 'KDCR 3-13'
  let materials: MaterialRow[] = []
  let saved: { item: string; makeOrBuy: 'MAKE' | 'BUY' }[] = []
  let err: string | null = null
  try {
    ;[materials, saved] = await Promise.all([
      apiServer<MaterialRow[]>(`/erp/work-process/materials?code=${encodeURIComponent(code)}`),
      apiServer<{ item: string; makeOrBuy: 'MAKE' | 'BUY' }[]>(`/erp/work-process?code=${encodeURIComponent(code)}`).catch(() => []),
    ])
  } catch (e) {
    err = e instanceof ApiError ? e.message : '조회 실패'
  }
  // 저장된 MAKE/BUY 오버레이
  const overlay = new Map(saved.map((s) => [s.item, s.makeOrBuy]))
  const rows = materials.map((m) => ({ ...m, makeBuy: overlay.get(m.item) ?? m.makeBuy }))

  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title={`작업공정 MAKE/BUY (G3-c) — ${code}`} count={err ? undefined : rows.length} source="/erp/work-process/materials" />
      <div style={{ flex: 1, minHeight: 0, padding: 6 }}>
        {err ? <div style={{ padding: 12, fontSize: 11, color: 'var(--err)' }}>백엔드 오류 — {err}</div> : <WorkProcessView initial={rows} code={code} />}
      </div>
    </div>
  )
}
