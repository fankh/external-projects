import { ExportButton } from '@/components/ExportButton'
import { Card, ScreenHeader, Stat } from '@/components/ui'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ApprovalList } from './ApprovalList'
import { RequestForm } from './RequestForm'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage() {
  const session = (await getSession())!
  const s = getStore()
  const pending = s.approvals.filter((a) => a.status === '대기')

  // 반납·이동 신청 대상 — 사용자는 본인 명의 자산만, 관리자는 운영 중인 자산 전체
  const myAssets = s.assets
    .filter((a) => !['폐기예정', '폐기완료'].includes(a.status))
    .filter((a) => (session.role === 'USER' ? a.owner === session.name : true))
    .map((a) => ({ assetNo: a.assetNo, model: a.model, location: a.location }))

  const locations = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  // 결재 종류별 기본 결재선(단계 순서) — 결재함에서 각 건의 라우팅을 보여준다.
  // 설정: 환경설정 › 사용자·결재선. 폐기·격리·편입·차이 조정은 필수 결재.
  const linesByKind = Object.fromEntries(s.approvalLines.map((l) => [l.kind, l.steps])) as Record<string, string[]>
  const requiredKinds = new Set(s.approvalLines.filter((l) => l.required).map((l) => l.kind))

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

      <RequestForm myAssets={myAssets} locations={locations} />

      <Card pad={false} actions={<ExportButton kind="approvals" role={session.role} label="결재 이력 엑셀" />}>
        <ApprovalList approvals={s.approvals} role={session.role} dept={session.dept} linesByKind={linesByKind} requiredKinds={[...requiredKinds]} />
      </Card>

      <div className="callout">
        <b>편입도 결재로.</b> 발견 자산의 대장 편입은 자산 등록 결재를 통과해야 하며, 승인 시 발견 이력(최초 발견
        채널·일시)이 자산 이력에 승계되어 대장으로 환류됩니다. 격리 요청 승인은 NAC 조치 채널로 전달됩니다.
      </div>
    </>
  )
}
