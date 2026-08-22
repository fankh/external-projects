import { Card, ScreenHeader, Stat } from '@/components/ui'
import { today } from '@/lib/dates'
import { canExport } from '@/lib/exports'
import { can } from '@/lib/perm'
import { getSession } from '@/lib/session'
import { getStore } from '@/lib/store'
import { ApprovalList } from './ApprovalList'
import { RequestForm } from './RequestForm'

export const dynamic = 'force-dynamic'

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const session = (await getSession())!
  const { sel } = await searchParams
  const s = getStore()
  // USER 는 본인 상신분만 조회 — 권한 매트릭스 '신청·결재' 조회='p'(own-scope)를 화면이 강제한다(전역 검색·AI 어시스턴트·대장과 동일 규약).
  // 예외: 소유자 확인은 사람이 아니라 부서 앞으로 온 요청이라(answerOwnerConfirm 은 session.dept===a.dept 로 응답), 대상 부서 USER 는 응답하려면 봐야 한다.
  // 담당자·Admin 은 전체. (누락 시 USER 결재함에 전사 결재 id·제목·요청자·사유가 그대로 노출됐다.)
  const visibleApprovals = session.role === 'USER'
    ? s.approvals.filter((a) => a.requester === session.name || (a.kind === '소유자 확인' && a.dept === session.dept))
    : s.approvals
  // KPI 도 목록과 같은 조회 스코프를 쓴다 — 목록만 스코핑하고 타일이 전사 집계를 쓰면 USER 결재함 머리에
  //  전사 대기 건수와 격리 요청 건수(보안 운영 지표)가 그대로 드러난다(목록에서 막은 것과 같은 누출).
  const pending = visibleApprovals.filter((a) => a.status === '대기')

  // 반납·이동 신청 대상 — 사용자는 본인 명의 자산만, 관리자는 운영 중인 자산 전체
  const myAssets = s.assets
    .filter((a) => !['폐기예정', '폐기완료'].includes(a.status))
    .filter((a) => (session.role === 'USER' ? a.owner === session.name : true))
    .map((a) => ({ assetNo: a.assetNo, model: a.model, location: a.location }))

  // 대여 신청 대상 — 대여 가능한 유휴 재고 (전 권한그룹이 임시 반출을 신청할 수 있다).
  // 폐기 절차에 들어간 자산(대상 선정 등)은 유휴여도 제외한다 — 반납·유휴 화면의 재배치 풀과 동일 기준(폐기 예정분을 다시 배정하지 않는다).
  const inDisposal = new Set(s.disposals.map((d) => d.assetNo))
  const loanable = s.assets
    .filter((a) => a.status === '유휴' && !inDisposal.has(a.assetNo))
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
        {/* 격리 요청은 보안 운영 지표 — USER 에게는 본인이 응답해야 할 소유자 확인 요청을 대신 보여준다(같은 자리, 역할에 맞는 할 일) */}
        {session.role === 'USER'
          ? <Stat value={pending.filter((a) => a.kind === '소유자 확인').length} label="소유자 확인 요청 (우리 부서)" tone="accent" />
          : <Stat value={pending.filter((a) => a.kind === '격리 요청').length} label="격리 요청 (보안담당)" tone="err" />}
        <Stat value={pending.filter((a) => a.requester === session.name).length} label="내가 상신한 건" />
        <Stat value={visibleApprovals.filter((a) => a.status !== '대기').length} label="처리 완료 (누적)" tone="ok" />
      </div>

      <RequestForm myAssets={myAssets} locations={locations} loanable={loanable} />

      <Card pad={false}>
        <ApprovalList approvals={visibleApprovals} role={session.role} dept={session.dept} viewer={session.name} linesByKind={linesByKind} requiredKinds={[...requiredKinds]} canExport={canExport('approvals', session.role)} canApprove={can('신청 · 결재', '결재', session.role)} initialSel={sel} today={today()} slaDays={s.opsPolicy.approvalSlaDays} />
      </Card>

      <div className="callout">
        <b>편입도 결재로.</b> 발견 자산의 대장 편입은 자산 등록 결재를 통과해야 하며, 승인 시 발견 이력(최초 발견
        채널·일시)이 자산 이력에 승계되어 대장으로 환류됩니다. 격리 요청 승인은 NAC 조치 채널로 전달됩니다.
      </div>
    </>
  )
}
