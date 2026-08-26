import { Card, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { canExport } from '@/lib/exports'
import { daysUntil } from '@/lib/dates'
import { getStore } from '@/lib/store'
import { DisposalView } from './DisposalView'

export const dynamic = 'force-dynamic'

export default async function DisposalPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireView('/assets/disposal', 'ASSET_MGR', 'ADMIN')
  // status=wipe — 대시보드 '데이터 소거 대기' 큐의 드릴다운. 화면의 상태 필터에는 '진행중'까지만 있어
  //  결재를 받고 소거를 기다리는 건(집행 대상)을 좁힐 수단이 없었다.
  const { status: statusParam } = await searchParams
  const s = getStore()

  // 폐기 후보 — 보증 만료 경과 + 현재 폐기 절차에 없는 자산
  const candidates = s.assets
    .filter((a) => !s.disposals.some((d) => d.assetNo === a.assetNo))
    .filter((a) => a.status !== '폐기완료' && a.warrantyEnd !== '-')
    .map((a) => ({ asset: a, over: daysUntil(a.warrantyEnd) ?? 0 }))
    .filter((x) => x.over < 0)
    .sort((a, b) => a.over - b.over)
    .map((x) => ({
      assetNo: x.asset.assetNo,
      model: x.asset.model,
      status: x.asset.status,
      warrantyEnd: x.asset.warrantyEnd,
      overdue: Math.abs(x.over),
      reason: `보증 만료 ${Math.abs(x.over)}일 경과${x.asset.status === '유휴' ? ' · 유휴 상태' : ''}`,
    }))

  return (
    <>
      <ScreenHeader
        kicker="자산관리 · Disposal"
        title="폐기 처리"
        desc="폐기 대상 선정 → 결재 상신 → 데이터 소거 · 불용 처리 → 증적(확인서 · 사진) 보존"
      />

      <div className="stat-row">
        <Stat value={candidates.length} label="폐기 후보 (보증 만료)" tone="warn" />
        <Stat value={s.disposals.filter((d) => d.status === '대상 선정').length} label="대상 선정 — 상신 대기" tone="accent" />
        <Stat value={s.disposals.filter((d) => d.status === '소거 대기').length} label="소거 대기 (결재 승인)" tone="err" />
        <Stat value={s.disposals.filter((d) => d.status === '완료').length} label="폐기 완료 · 증적 보존" tone="ok" />
      </div>

      <div className="callout warn">
        <b>폐기는 필수 결재 · 증적 보존.</b> 대상 선정 후 결재 승인을 받아야 데이터 소거를 진행할 수 있으며,
        소거 완료 시 방식과 확인서 번호가 자산 이력에 영구 기록됩니다. 소거 전 자산은 대장에서 폐기예정으로
        표시되어 재사용·불출 대상에서 제외됩니다.
      </div>

      <DisposalView candidates={candidates} records={s.disposals} initialStatus={statusParam === 'wipe' ? '소거 대기' : undefined} canExport={canExport('disposals', session.role)} />
    </>
  )
}
