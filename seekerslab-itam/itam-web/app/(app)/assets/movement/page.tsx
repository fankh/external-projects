import { ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { assignableAssets } from '@/lib/stock'
import { getStore } from '@/lib/store'
import { GONE_STATUSES } from '@/lib/types'
import { MovementView } from './MovementView'

export const dynamic = 'force-dynamic'

export default async function MovementPage() {
  await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()

  // 승인됐지만 아직 집행되지 않은 건 = 실제 처리 대기열.
  // 결재 승인과 실물 처리를 분리해야 대장이 '승인만 되고 움직이지 않은' 상태를 드러낸다.
  const issues = s.approvals
    .filter((a) => a.kind === '자산 신청' && a.status === '승인' && !a.fulfilled && !a.refId?.startsWith('DSC-'))
    .map((a) => ({ id: a.id, title: a.title, requester: a.requester, dept: a.dept, requestedAt: a.decidedAt ?? a.requestedAt, note: a.note, desiredCategory: a.desiredCategory }))

  const moves = s.approvals
    .filter((a) => a.kind === '이동' && a.status === '승인' && !a.fulfilled)
    .map((a) => {
      const asset = s.assets.find((x) => x.assetNo === a.refId)
      return {
        id: a.id, title: a.title, requester: a.requester, requestedAt: a.decidedAt ?? a.requestedAt,
        assetNo: a.refId, model: asset?.model ?? '-', from: asset?.location ?? '-', to: a.targetLocation,
        // 서버가 거부할 건은 버튼을 잠그고 이유를 적는다(같은 목록 STALE_MOVE_STATUSES 공유) — 신청은 남겨 둔다.
        blocked: asset && GONE_STATUSES.includes(asset.status) ? asset.status : undefined,
      }
    })

  // 재배치 우선 원칙 — 신규 구매 전에 유휴 재고부터 배정한다 (검수중은 도입 직후 미배정분).
  //  폐기 절차(대상 선정~소거 대기) 중인 자산은 제외한다 — lib/stock 단일 소스로 불출 가드(dispatchAsset)와 같은 판정이다.
  //  그전엔 화면이 폐기 선정된 유휴 자산을 '배정 가능 재고'로 세고 희망 유형 일치(✓)로 우선 추천까지 했는데,
  //  담당자가 그대로 불출하면 서버가 '폐기 절차 중인 자산은 불출할 수 없습니다'로 거부하는 막다른 길이었다.
  const pool = assignableAssets(s.assets, s.disposals)
    .map((a) => ({ assetNo: a.assetNo, model: a.model, category: a.category, location: a.location, status: a.status }))

  const locations = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  const done = s.approvals
    .filter((a) => a.fulfilled)
    .map((a) => ({ id: a.id, kind: a.kind === '이동' ? '이동' : '불출', title: a.title, requester: a.requester }))

  return (
    <>
      <ScreenHeader
        kicker="자산관리 — Lifecycle Phase 3"
        title="불출 · 이동 처리"
        desc="사용자 신청 → 결재 → 불출 처리 · 부서·위치·사용자 변경 이력 자동 축적"
      />

      <div className="stat-row">
        <Stat value={issues.length} label="불출 대기 — 승인 후 미집행" tone={issues.length ? 'accent' : 'ok'} />
        <Stat value={moves.length} label="이동 대기 — 승인 후 미집행" tone={moves.length ? 'warn' : 'ok'} />
        <Stat value={pool.length} label="배정 가능 재고 (유휴·검수중)" delta={{ text: '재배치 우선 원칙', dir: 'flat' }} />
        <Stat value={done.length} label="처리 완료 (누적)" tone="ok" />
      </div>

      <MovementView issues={issues} moves={moves} pool={pool} locations={locations} done={done} />

      <div className="callout">
        <b>승인과 집행은 다르다.</b> 결재 승인은 이동을 허가할 뿐이며, 여기서 집행해야 대장의 소유자·부서·위치가
        갱신되고 이력이 남습니다. 집행되지 않은 승인 건은 재물조사에서 위치 불일치로 잡힙니다.
        <br />
        <b>불출·이동 처리 시 신청자에게 자동 통보됩니다</b> — 결재 승인 통보(신청 접수)와 별개로, 불출은 실물 배정·수령
        위치가, 이동 처리 시에도 신청자에게 변경된 위치가 발송되어 신청자가 결재함을 확인하지 않아도 집행 완료를 알 수 있습니다.
      </div>
    </>
  )
}
