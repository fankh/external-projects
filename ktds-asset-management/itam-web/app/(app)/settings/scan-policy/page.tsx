import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { getStore } from '@/lib/store'
import { ScanPolicyTable } from './ScanPolicyTable'

export const dynamic = 'force-dynamic'

export default async function ScanPolicyPage() {
  await requireRole('ADMIN')
  const s = getStore()
  const on = s.scanPolicies.filter((p) => p.enabled)
  const active = s.scanPolicies.filter((p) => p.kind === '능동')

  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Detection Policy"
        title="탐지 채널 · 스캔 정책"
        desc="6종 병렬 수집 채널의 대상 대역 · 시간대 · 강도 통제 — 운영망 영향을 최소화하는 스캔 안전장치"
      />

      <div className="stat-row">
        <Stat value={`${on.length}/${s.scanPolicies.length}`} label="활성 탐지 채널" tone="ok" />
        <Stat value={active.length} label="능동 스캔 채널" tone="warn" delta={{ text: '시간대·강도 정책 적용 대상', dir: 'flat' }} />
        <Stat value={s.scanPolicies.filter((p) => p.enabled && p.kind !== '능동').length} label="무중단 수집 채널" delta={{ text: '패시브 · API · 로그', dir: 'flat' }} />
        <Stat value={s.discovered.length} label="현재 발견 자산" tone="accent" />
      </div>

      <div className="callout warn">
        <b>스캔 안전장치.</b> 능동 스캔은 대역·시간대·강도를 정책으로 통제합니다. 강도를 높이면 발견율은
        올라가지만 운영망 부하와 오탐이 함께 증가하므로, 시간대 협의 없이 &lsquo;높음&rsquo;으로 상향하지 마세요.
        채널을 비활성화하면 해당 소스의 수집이 즉시 중단되고 상태바 커넥터 수에 반영됩니다.
      </div>

      <Card kicker="Channels" title="채널별 수집 정책" pad={false}>
        <ScanPolicyTable policies={s.scanPolicies} />
      </Card>
    </>
  )
}
