import { Card, ScreenHeader, Stat } from '@/components/ui'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ApprovalList } from './ApprovalList'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const session = (await getSession())!
  const s = getStore()
  const pending = s.approvals.filter((a) => a.status === '대기')

  return (
    <>
      <ScreenHeader
        kicker="워크플로 · Approvals"
        title="신청 · 결재"
        desc="자산 신청/반납/이동/폐기 상신 · 소유자 확인 요청 · 격리 요청 결재 — 화면별 기본 결재선, 폐기·격리는 필수 결재"
      />

      <div className="stat-row">
        <Stat value={pending.length} label="결재 대기" tone="accent" />
        <Stat value={pending.filter((a) => a.kind === '격리 요청').length} label="격리 요청 (보안담당)" tone="err" />
        <Stat value={pending.filter((a) => a.requester === session.name).length} label="내가 상신한 건" />
        <Stat value={s.approvals.filter((a) => a.status !== '대기').length} label="처리 완료 (누적)" tone="ok" />
      </div>

      <Card pad={false}>
        <ApprovalList approvals={s.approvals} role={session.role} />
      </Card>

      <div className="callout">
        <b>편입도 결재로.</b> 발견 자산의 대장 편입은 자산 등록 결재를 통과해야 하며, 승인 시 발견 이력(최초 발견
        채널·일시)이 자산 이력에 승계되어 대장으로 환류됩니다. 격리 요청 승인은 NAC 조치 채널로 전달됩니다.
      </div>
    </>
  )
}
