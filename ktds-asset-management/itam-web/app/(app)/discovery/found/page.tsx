import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { daysUntil } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { CHANNELS, CONFIRM_DEADLINE_DAYS } from '@/lib/types'
import { EscalateBar } from './EscalateBar'
import { FoundView } from './FoundView'

export const dynamic = 'force-dynamic'

export default async function FoundPage() {
  await requireRole('ASSET_MGR', 'SEC_MGR', 'ADMIN')
  const s = getStore()
  const d = s.discovered
  const unreg = d.filter((x) => x.state === '미등록' && !x.action)

  // 지문이 다른데 호스트명·IP 가 겹치는 쌍 = 자동 병합이 잡지 못한 중복 후보.
  // 자동 병합은 지문 일치에만 적용되므로(MAC 교체·클라우드 리소스 등) 담당자 확인이 필요하다.
  const mergeCandidates: { primary: typeof d[number]; duplicate: typeof d[number]; reason: string }[] = []
  for (let i = 0; i < d.length; i += 1) {
    for (let j = i + 1; j < d.length; j += 1) {
      const a = d[i]
      const b = d[j]
      if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint) continue
      if (a.action || b.action) continue
      const sameHost = a.hostname !== '-' && a.hostname.toLowerCase() === b.hostname.toLowerCase()
      const sameIp = a.ip !== '-' && a.ip === b.ip
      if (!sameHost && !sameIp) continue
      // 관측이 더 많은 쪽을 대표로 삼는다 — 근거가 많은 건에 합치는 편이 이력 손실이 적다
      const cnt = (x: string) => s.observations.filter((o) => o.discoveredId === x).length
      const [primary, duplicate] = cnt(a.id) >= cnt(b.id) ? [a, b] : [b, a]
      mergeCandidates.push({
        primary,
        duplicate,
        reason: sameHost
          ? `호스트명 동일(${a.hostname}) · MAC 상이 — NIC 교체 또는 별도 장비`
          : `IP 동일(${a.ip}) · 지문 상이 — DHCP 재할당 가능성`,
      })
    }
  }

  const awaiting = d.filter((x) => x.action === '확인요청')
  const overdue = awaiting.filter(
    (x) => x.confirmRequestedAt && -(daysUntil(x.confirmRequestedAt) ?? 0) >= CONFIRM_DEADLINE_DAYS,
  )

  return (
    <>
      <ScreenHeader
        kicker="Discovery · 6 Channels"
        title="발견 자산"
        desc="신규 발견 목록(채널별) · 자산 지문·중복 병합 · 위험도 분류"
      />

      <div className="stat-row">
        <Stat
          value={d.length}
          label={`발견 자산 (지문 병합 후) — 원시 관측 ${s.observations.length}건`}
          delta={{ text: `중복 ${Math.max(0, s.observations.length - d.length)}건 제거`, dir: 'down' }}
        />
        <Stat value={unreg.length} label="미등록 — 처리 필요" tone="err" />
        <Stat value={d.filter((x) => x.state === '등록·불일치').length} label="등록 · 불일치" tone="warn" />
        <Stat value={CHANNELS.length} label="병렬 수집 채널" tone="accent" delta={{ text: '스캔·로그·API 상시 수집', dir: 'flat' }} />
      </div>

      <div className="callout">
        <b>발견에서 편입까지.</b> 여섯 채널로 수집한 자산은 자산 지문(MAC·호스트명)으로 병합된 뒤 자산 대장과 대사되고,
        소유자 확인·결재를 거친 편입 결과가 다시 대장으로 환류됩니다. 확인되지 않은 자산은 NAC 격리 요청으로 이어집니다.
      </div>

      <EscalateBar waiting={awaiting.length} overdue={overdue.length} deadlineDays={CONFIRM_DEADLINE_DAYS} />

      <Card pad={false}>
        <FoundView items={d} observations={s.observations} mergeCandidates={mergeCandidates} />
      </Card>
    </>
  )
}
