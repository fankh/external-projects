import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { CHANNELS } from '@/lib/types'
import { FoundView } from './FoundView'

export const dynamic = 'force-dynamic'

export default async function FoundPage() {
  await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const d = s.discovered
  const unreg = d.filter((x) => x.state === '미등록' && !x.action)

  return (
    <>
      <ScreenHeader
        kicker="Discovery · 6 Channels"
        title="발견 자산"
        desc="신규 발견 목록(채널별) · 자산 지문·중복 병합 · 위험도 분류"
      />

      <div className="stat-row">
        <Stat value={d.length} label="발견 자산 (지문 병합 후)" />
        <Stat value={unreg.length} label="미등록 — 처리 필요" tone="err" />
        <Stat value={d.filter((x) => x.state === '등록·불일치').length} label="등록 · 불일치" tone="warn" />
        <Stat value={CHANNELS.length} label="병렬 수집 채널" tone="accent" delta={{ text: '스캔·로그·API 상시 수집', dir: 'flat' }} />
      </div>

      <div className="callout">
        <b>발견에서 편입까지.</b> 여섯 채널로 수집한 자산은 자산 지문(MAC·호스트명)으로 병합된 뒤 자산 대장과 대사되고,
        소유자 확인·결재를 거친 편입 결과가 다시 대장으로 환류됩니다. 확인되지 않은 자산은 NAC 격리 요청으로 이어집니다.
      </div>

      <Card pad={false}>
        <FoundView items={d} />
      </Card>
    </>
  )
}
