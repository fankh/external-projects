import { ScreenHeader } from '@/components/ScreenHeader'
import { RunPanel } from './RunPanel'

export const dynamic = 'force-dynamic'

// CPQ Run — 비동기 파이프라인. 서버 액션 startRun(202)→pollRun 폴링(클라 아일랜드).
export default async function RunPage({ searchParams }: { searchParams: Promise<{ selectionId?: string }> }) {
  const sp = await searchParams
  const selectionId = sp.selectionId ? Number(sp.selectionId) : undefined
  return (
    <div className="fill-col" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <ScreenHeader title="Run 파이프라인 (C-1)" source="POST /cpq/runs → /cpq/runs/{id}" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <RunPanel selectionId={Number.isFinite(selectionId) ? selectionId : undefined} />
      </div>
    </div>
  )
}
