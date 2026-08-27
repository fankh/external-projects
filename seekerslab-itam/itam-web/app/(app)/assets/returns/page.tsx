import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { daysUntil, isLoanDueSoon, isLoanOverdue, isRepairEtaMissing, isRepairOverdue, isRepairUnrecorded, today } from '@/lib/dates'
import { canExport } from '@/lib/exports'
import { warrantySavingsOf } from '@/lib/cost'
import { buildRepairVendors } from '@/lib/repair-vendors'
import { availableAssets } from '@/lib/stock'
import { getStore } from '@/lib/store'
import { loanRemindTargets, repairRemindTargets } from '@/lib/reminders'
import { ReturnsView } from './ReturnsView'

export const dynamic = 'force-dynamic'

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ loan?: string; repair?: string }> }) {
  // loan=연체|임박 · repair=overdue — 대시보드 대여·수리 큐의 드릴다운(해당 필터를 켠 채 연다).
  const { loan, repair } = await searchParams
  const session = await requireView('/assets/returns', 'ASSET_MGR', 'ADMIN')
  const s = getStore()

  const pending = s.assets
    .filter((a) => a.status === '반납대기')
    .map((a) => {
      const ap = s.approvals.find((x) => x.kind === '반납' && x.refId === a.assetNo && x.status === '승인')
      return {
        assetNo: a.assetNo, model: a.model, owner: a.owner, dept: a.dept, location: a.location,
        since: ap?.decidedAt ?? ap?.requestedAt ?? '-',
      }
    })

  // 유휴 경과일 — 마지막 반납·점검·수리 이력 기준. 오래 묵을수록 재배치나 폐기 검토 대상이다.
  // 이미 폐기 절차(대상 선정 이후)에 있는 자산은 가용 재고가 아니므로 유휴 풀에서 제외한다 —
  //  판정은 lib/stock availableAssets 단일 소스(재고 안전재고 경보·불출 가드·어시스턴트와 동일).
  const idle = availableAssets(s.assets, s.disposals)
    .map((a) => {
      const last = [...a.history].reverse().find((h) => h.kind === '반납' || h.kind === '점검' || h.kind === '수리')
      const d = last ? daysUntil(last.date) : null
      return {
        assetNo: a.assetNo, model: a.model, category: a.category, location: a.location,
        idleDays: d === null ? null : Math.max(0, -d),
      }
    })
    .sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1))

  // 수리중 자산 — 반납 점검에서 '수리 필요'로 판정돼 수리를 기다리는 자산
  const repairing = s.assets
    .filter((a) => a.status === '수리중')
    .map((a) => {
      const last = [...a.history].reverse().find((h) => h.kind === '반납' || h.kind === '수리')
      // 보증 내 자산은 제조사 보증 수리(무상) 대상 — 유상 수리비를 지불하지 않도록 안내한다
      const warranty = a.warrantyEnd !== '-' && a.warrantyEnd >= today()
      return { assetNo: a.assetNo, model: a.model, category: a.category, location: a.location, note: last?.detail ?? '', faultNote: a.faultNote, repair: a.repair, warranty, repairOverdue: isRepairOverdue(a) }
    })

  // 대여 현황 — 반출(대여중) 자산을 한 곳에 모아 반환 기한·연체를 관리한다. 그동안 대여 반환·연장은
  // 자산 대장 상세에 자산별로 흩어져 있어, 담당자가 "무엇이 언제까지 나가 있는지"를 한눈에 볼 곳이 없었다.
  // 반환이 임박·경과한 순으로 정렬한다(기한 없는 건은 뒤로).
  const loans = s.assets
    .filter((a) => a.status === '대여중')
    .map((a) => ({
      assetNo: a.assetNo, model: a.model, owner: a.owner, dept: a.dept,
      dueDate: a.loanDueDate ?? '-',
      dday: a.loanDueDate ? daysUntil(a.loanDueDate) : null,
      overdue: isLoanOverdue(a),
      returnRequested: !!a.returnRequest,
    }))
    .sort((x, y) => (x.dday ?? 99_999) - (y.dday ?? 99_999))
  const overdueLoans = loans.filter((l) => l.overdue).length
  // 독촉 대상 — 연체 + 반환 임박(D-7). 대여자에게 반환 요청을 보낼 수 있는 건수
  // 독촉 버튼 건수 = 오늘 아직 안 보낸 대상 수(lib/reminders · 액션과 같은 소스). 신호 수를 그대로 쓰면 다 보낸 뒤에도 버튼이 남는다.
  const remindable = loanRemindTargets().length
  // 버튼 건수 = 실제 발송 대상(remindRepairs) — 예상 반환 경과 + 일정 미회신. 어긋나면 눌러도 안 나가는 건수가 생긴다.
  const repairRemindable = repairRemindTargets().length
  // 수리중인데 의뢰 정보가 없는 건 — 업체가 없어 독촉 대상이 아니다(독촉 0건과 구분해 드러내야
  //  담당자가 '독촉할 게 없다'로 읽지 않는다). 해야 할 일은 의뢰 정보 등록이다.
  const repairUnrecorded = s.assets.filter(isRepairUnrecorded).length
  const todayStr = today()

  const locations = (s.codeGroups.find((g) => g.id === 'LOCATION')?.values ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.sort - b.sort)
    .map((v) => v.label)

  const openRequests = s.approvals.filter(
    (a) => a.kind === '자산 신청' && a.status === '승인' && !a.fulfilled && !a.refId?.startsWith('DSC-'),
  ).length

  const longIdle = idle.filter((a) => (a.idleDays ?? 0) >= 90).length
  // 보증 절감 — 무상 보증 청구로 자사가 부담하지 않은 수리비 누계(보증 활용·비용 회피 가시화)
  const warrantySaved = s.assets.reduce((n, a) => n + warrantySavingsOf(a), 0)
  // 수리 업체 성과 — 자산 단위 수리 이력·진행 중 수리를 업체별로 집계(업체 책임성·재계약 근거)
  const repairVendors = buildRepairVendors()

  return (
    <>
      <ScreenHeader
        kicker="자산관리 — Lifecycle Phase 4"
        title="반납 · 유휴"
        desc="반납 접수 · 상태 점검 · 유휴 자산 풀 관리 (재배치 우선 원칙)"
      />

      <div className="stat-row">
        <Stat value={pending.length} label="반납 접수 대기" tone={pending.length ? 'accent' : 'ok'} />
        <Stat value={repairing.length} label="수리중" tone={repairing.length ? 'warn' : 'ok'} />
        <Stat value={loans.length} label="대여중" tone={loans.length ? 'accent' : 'ok'} delta={overdueLoans ? { text: `연체 ${overdueLoans}건`, dir: 'up' } : undefined} />
        <Stat value={idle.length} label="유휴 자산 풀" />
        <Stat value={longIdle} label="90일 이상 장기 유휴" tone={longIdle ? 'warn' : 'ok'} delta={{ text: '재배치·폐기 검토', dir: 'flat' }} />
        <Stat value={openRequests} label="배정 대기 자산 신청" tone={openRequests ? 'accent' : 'ok'} />
        <Stat value={warrantySaved > 0 ? `${warrantySaved.toLocaleString()}원` : '0'} label="보증 절감 (무상 청구)" tone={warrantySaved > 0 ? 'ok' : undefined} delta={{ text: '제조사 보증 수리 비용 회피', dir: 'flat' }} />
      </div>

      <ReturnsView pending={pending} idle={idle} repairing={repairing} loans={loans} remindable={remindable} repairRemindable={repairRemindable} repairUnrecorded={repairUnrecorded} canExportLoans={canExport('loans', session.role)} today={todayStr} locations={locations} openRequests={openRequests} initialLoan={loan === '연체' || loan === '임박' ? loan : undefined} initialRepairOverdue={repair === 'overdue'} />

      {repairVendors.length > 0 && (
        <Card kicker="Vendor Scorecard" title="수리 업체 성과" pad={false}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>수리 업체</th><th className="num">완료</th><th className="num">자사 부담 누계</th><th className="num">자사 부담 평균</th><th>보증 청구</th><th className="num">진행 중</th><th className="c">지연</th><th className="c">정시 반환율</th></tr>
              </thead>
              <tbody>
                {repairVendors.map((v) => (
                  <tr key={v.vendor}>
                    <td className="strong">{v.vendor}</td>
                    <td className="num tnum">{v.completed}</td>
                    <td className="num tnum">{v.selfBorne.toLocaleString()}원</td>
                    <td className="num tnum">{v.avgSelfBorne.toLocaleString()}원</td>
                    <td className="tnum">{v.warrantyClaims > 0 ? `${v.warrantyClaims}건 · 절감 ${v.warrantySaved.toLocaleString()}원` : <span className="mut">-</span>}</td>
                    <td className="num tnum">{v.inFlight}</td>
                    <td className="c">{v.overdue > 0 ? <Chip tone="err">지연 {v.overdue}</Chip> : <span className="mut">-</span>}</td>
                    <td className="c">{v.onTimePct === null ? <span className="mut" title="예상 반환일이 지정된 완료 건이 없어 판정 불가">-</span> : <Chip tone={v.onTimePct >= 80 ? 'ok' : v.onTimePct >= 50 ? 'warn' : 'err'}>{`${v.onTimePct}% (${v.onTimeCount}/${v.slaCount})`}</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="callout" style={{ margin: 14 }}>
            <b>업체 책임성.</b> 자산 단위 수리 이력을 업체별로 집계해 비용·물량·지연을 드러냅니다 — 재계약 협상·업체 조정의 근거이며, 유지보수 계약 관리(계약 단위)의 자산 단위 짝입니다.
          </div>
        </Card>
      )}
    </>
  )
}
