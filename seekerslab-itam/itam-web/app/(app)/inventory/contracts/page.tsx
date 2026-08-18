import { ExportButton } from '@/components/ExportButton'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { missingContractDocs } from '@/lib/contract'
import { daysUntil, fmtAmount } from '@/lib/dates'
import { buildLicenseUsage } from '@/lib/license-usage'
import { buildMaintenance } from '@/lib/maintenance'
import { buildProcurement } from '@/lib/procurement'
import { contractAssetCount, getStore } from '@/lib/store'
import { AddContract, ContractsTable } from './ContractsTable'
import { AddLicense, ContractDocsButton, ExpiryNoticeButton } from './LicenseActions'
import { LicenseTable } from './LicenseTable'
import { MaintenanceBudgetButton, MaintenanceExecButton } from './MaintenanceActions'
import { ProcurementRemindButton } from './ProcurementRemindButton'
import { SeatResolveCell } from './SeatResolveCell'
import { UsageCollect } from './UsageCollect'

export const dynamic = 'force-dynamic'

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ sel?: string; lic?: string }> }) {
  const session = await requireRole('ASSET_MGR', 'ADMIN')
  const { sel, lic } = await searchParams
  const s = getStore()
  const contracts = [...s.contracts].sort((a, b) => a.end.localeCompare(b.end))
  const usage = buildLicenseUsage()
  const maint = buildMaintenance()
  const proc = buildProcurement()
  const canEditLicense = ['ASSET_MGR', 'ADMIN'].includes(session.role)

  // 만료 임박 대상 — 계약·라이선스·보증(부서 단위 묶음)을 합친 발송 예정 건수
  const within = (end: string) => {
    const d = daysUntil(end)
    return d !== null && d <= s.opsPolicy.expiryWindowDays
  }
  const warrantyDepts = new Set(
    s.assets
      .filter((a) => a.warrantyEnd !== '-' && !['폐기완료', '폐기예정'].includes(a.status) && within(a.warrantyEnd))
      .map((a) => a.dept),
  )
  const dueCount =
    contracts.filter((c) => c.status !== '해지' && within(c.end)).length +
    s.licenses.filter((l) => l.status !== '해지' && l.expiry !== '-' && within(l.expiry)).length +
    warrantyDepts.size
  // 필수 부속서류(계약서·세금계산서 등) 미비 진행 중 계약 — 감사 리스크
  const docGap = contracts.filter((c) => missingContractDocs(c).length > 0).length

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Contracts · Licenses"
        title="계약 · 라이선스"
        desc="구매·유지보수 계약, SW 라이선스 보유/사용 대사, 만료·갱신 알림"
      />

      <Card kicker="Contracts" title="구매 · 유지보수 계약" pad={false}
        actions={<span className="hstack" style={{ gap: 8 }}>
          {docGap > 0 && <Chip tone="warn">📎 부속서류 미비 {docGap}건</Chip>}
          {docGap > 0 && ['ASSET_MGR', 'ADMIN'].includes(session.role) && <ContractDocsButton gap={docGap} />}
          <ExportButton kind="contracts" role={session.role} label="계약·라이선스 엑셀" />
          <ExpiryNoticeButton due={dueCount} />
        </span>}>
        <AddContract />
        <ContractsTable rows={contracts.map((c) => ({ ...c, assetCount: contractAssetCount(c.id), d: daysUntil(c.end) }))} sel={sel} canEdit={['ASSET_MGR', 'ADMIN'].includes(session.role)} expiryWindowDays={s.opsPolicy.expiryWindowDays} />
      </Card>

      <Card
        kicker="Maintenance"
        title="유지보수 계약 관리 — 예산 집행 · SLA"
        pad={false}
        actions={<span className="hstack" style={{ gap: 10 }}>
          <span className="dim" style={{ fontSize: 11.5 }}>계약 {maint.rows.length}건 · 집행 {fmtAmount(maint.totalSpent)}/{fmtAmount(maint.totalAmount)}원</span>
          <MaintenanceBudgetButton alert={maint.budgetAlert} />
          <MaintenanceExecButton alert={maint.execAlert} />
        </span>}
      >
        <div className="stat-row" style={{ margin: 14 }}>
          <Stat value={`${maint.totalAmount ? Math.round((maint.totalSpent / maint.totalAmount) * 100) : 0}%`} label="전체 집행률" delta={{ text: `잔여 ${fmtAmount(maint.totalAmount - maint.totalSpent)}원`, dir: 'flat' }} />
          <Stat value={maint.rows.length} label="유지보수 계약" />
          <Stat value={maint.overBudget} label="예산 초과" tone={maint.overBudget ? 'err' : 'ok'} />
          <Stat value={maint.execAlert} label="미집행 (이행 확인)" tone={maint.execAlert ? 'warn' : 'ok'} />
          <Stat value={maint.noSla} label="SLA 미설정" tone={maint.noSla ? 'warn' : 'ok'} />
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>계약</th><th>공급사</th><th className="num">계약액</th><th className="num">누계 지출</th><th className="num">집행률</th>
                <th className="num">잔여 예산</th><th className="c">연계 자산</th><th>SLA</th><th>만료</th><th className="c">판정</th>
              </tr>
            </thead>
            <tbody>
              {maint.rows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td>
                  <td className="mute">{r.vendor}</td>
                  <td className="num tnum">{fmtAmount(r.amount)}원</td>
                  <td className="num tnum">{fmtAmount(r.spent)}원</td>
                  <td className="num tnum" style={{ fontWeight: 700 }}>{r.rate}%</td>
                  <td className="num tnum">{fmtAmount(r.remaining)}원</td>
                  <td className="c tnum">{r.covered}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{r.sla ? <span className="dim" style={{ fontSize: 11 }}>{r.sla}</span> : <Chip tone="warn" bare>미설정</Chip>}</td>
                  <td className="tnum">{r.end}</td>
                  <td className="c"><Chip tone={r.status === '예산 초과' ? 'err' : r.status === '소진 임박' || r.status === '미집행' ? 'warn' : 'ok'}>{r.status}</Chip></td>
                </tr>
              ))}
              {maint.rows.length === 0 && <tr><td colSpan={10}><div className="empty">유지보수 계약이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>비용 이력 → 예산 관리.</b> 유지보수 계약의 누계 지출을 계약액과 대사해 집행률·잔여 예산·판정을 산출합니다.
          <b>예산 초과</b>는 추가 예산·재협상, <b>소진 임박</b>은 잔여 집행 계획 점검, <b>미집행</b>은 계약 이행 확인 대상입니다.
          SLA 미설정 유지보수 계약은 서비스 수준 협약(장애 대응·가동률)을 기록하세요.
        </div>
      </Card>

      <Card
        kicker="Procurement"
        title="구매 계약 발주·검수 이행 현황"
        pad={false}
        actions={<span className="hstack" style={{ gap: 10 }}>
          <span className="dim" style={{ fontSize: 11.5 }}>연계 계약 {proc.rows.length}건 · 발주 {fmtAmount(proc.totalOrdered)}/{fmtAmount(proc.totalAmount)}원{proc.atRisk.length > 0 ? ` · 미이행 위험 ${proc.atRisk.length}` : ''}</span>
          <ProcurementRemindButton atRisk={proc.atRisk.length} />
        </span>}
      >
        <div className="stat-row" style={{ margin: 14 }}>
          <Stat value={`${proc.totalAmount ? Math.round((proc.totalOrdered / proc.totalAmount) * 100) : 0}%`} label="전체 발주 소진률" delta={{ text: `발주 여력 ${fmtAmount(proc.totalAmount - proc.totalOrdered)}원`, dir: 'flat' }} />
          <Stat value={proc.rows.length} label="입고 연계 구매 계약" />
          <Stat value={proc.atRisk.length} label="발주 미이행 · 만료 임박" tone={proc.atRisk.length ? 'err' : 'ok'} />
          <Stat value={fmtAmount(proc.totalInspected)} label="검수 완료액 (정산 근거)" />
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>구매 계약</th><th>공급사</th><th className="num">계약액</th><th className="num">발주 입고액</th><th className="num">발주율</th>
                <th className="num">검수 완료액</th><th className="c">입고 로트</th><th className="c">검수 대기</th><th>만료</th><th className="c">이행 판정</th>
              </tr>
            </thead>
            <tbody>
              {proc.rows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td>
                  <td className="mute">{r.vendor}</td>
                  <td className="num tnum">{fmtAmount(r.amount)}원</td>
                  <td className="num tnum">{fmtAmount(r.orderedValue)}원</td>
                  <td className="num tnum" style={{ fontWeight: 700 }}>{r.rate}%</td>
                  <td className="num tnum">{r.inspectedValue > 0 ? `${fmtAmount(r.inspectedValue)}원` : '-'}</td>
                  <td className="c tnum">{r.lots}{r.rejected > 0 && <span className="dim" style={{ fontSize: 11 }}> (반려 {r.rejected})</span>}</td>
                  <td className="c tnum">{r.pendingInspection || <span className="dim">-</span>}</td>
                  <td className="tnum">{r.end}{r.dday !== null && r.dday <= 90 && <span className="dim" style={{ fontSize: 11 }}> (D{r.dday >= 0 ? `-${r.dday}` : `+${-r.dday}`})</span>}</td>
                  <td className="c">{r.atRisk ? <Chip tone="err">발주 미이행</Chip> : r.pendingInspection > 0 ? <Chip tone="warn">검수 진행</Chip> : <Chip tone="ok">정상</Chip>}</td>
                </tr>
              ))}
              {proc.rows.length === 0 && <tr><td colSpan={10}><div className="empty">입고 로트가 연계된 구매 계약이 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>계약 ↔ 입고 이행 추적.</b> 구매 계약의 입고 로트를 대사해 발주 소진률·검수 완료액(정산 근거)을 산출합니다.
          <b>발주 미이행</b>은 발주율이 저조한데 만료가 임박한 계약으로, 잔여 발주 집행 또는 계약 연장·정산 종결이 필요합니다.
          검수 완료 로트의 금액이 대금 정산의 근거가 됩니다.
        </div>
      </Card>

      <Card kicker="License Compliance" title="SW 라이선스 보유 – 사용 대사" pad={false}>
        <AddLicense />
        <LicenseTable
          rows={s.licenses.map((l) => ({
            ...l,
            d: daysUntil(l.expiry),
            // 근거 계약이 해지된 라이선스 — 구독 근거가 사라진 상태(계약 해지 연계 영향 v1.272 의 역방향). 이관·재계약 검토 필요.
            baseTerminated: !!l.contractId && s.contracts.some((c) => c.id === l.contractId && c.status === '해지'),
            pendingApproval: s.approvals.find((a) => a.status === '대기' && a.refId === l.id)?.id,
          }))}
          sel={sel}
          canEdit={['ASSET_MGR', 'ADMIN'].includes(session.role)}
          expiryWindowDays={s.opsPolicy.expiryWindowDays}
          lic={lic}
        />
        <div className="callout" style={{ margin: 14 }}>
          <b>검출에서 조치까지.</b> 초과 사용(감사 리스크)은 추가 구매 품의로, 미사용 보유(비용 낭비)는 회수로
          이어지며 두 조치 모두 결재를 거칩니다.
          사용 수집은 EDR·에이전트 설치 SW 인벤토리 기준이며, 미인가 SW 설치는 Discovery 모듈의 정책 위반 항목으로
          연계되어 보안담당에게 통보됩니다.
        </div>
      </Card>

      <Card
        kicker="License Compliance · STEP2"
        title="사용 수집 — EDR 설치 SW 인벤토리 대사"
        pad={false}
        actions={<UsageCollect lastCollectedAt={usage.lastCollectedAt} canEdit={canEditLicense} />}
      >
        <div className="stat-row" style={{ margin: 14 }}>
          <Stat value={usage.totalInstalls} label="설치 관측 (EDR 인벤토리)" />
          <Stat value={usage.totalOffSeat} label="배정 밖 설치 — 무단 사용" tone={usage.totalOffSeat ? 'err' : 'ok'} />
          <Stat value={usage.totalUnusedSeat} label="미설치 좌석 — 회수 후보" tone={usage.totalUnusedSeat ? 'warn' : 'ok'} />
          <Stat value={usage.collectedLicenses} label="수집 완료 라이선스" />
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>라이선스</th><th className="num">보유</th><th className="num">배정 좌석</th><th className="num">설치 관측</th>
                <th className="num">일치</th><th>배정 밖 설치 (무단 사용)</th><th>미설치 좌석 (회수 후보)</th><th>최근 수집</th>
              </tr>
            </thead>
            <tbody>
              {usage.rows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td>
                  <td className="num tnum">{r.purchased}</td>
                  <td className="num tnum">{r.seatCount}</td>
                  <td className="num tnum">{r.installCount}</td>
                  <td className="num tnum">{r.matched}</td>
                  <td><SeatResolveCell licenseId={r.id} kind="offSeat" canEdit={canEditLicense} assets={r.offSeat.map((o) => ({ assetNo: o.assetNo, label: o.dept }))} /></td>
                  <td><SeatResolveCell licenseId={r.id} kind="unusedSeat" canEdit={canEditLicense} assets={r.unusedSeat.map((u) => ({ assetNo: u.assetNo, label: u.user }))} /></td>
                  <td className="tnum">{r.collectedAt ?? <span className="dim">미수집</span>}</td>
                </tr>
              ))}
              {usage.rows.length === 0 && <tr><td colSpan={8}><div className="empty">대사 대상 라이선스가 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>사용 수집 → 대사.</b> EDR·에이전트가 수집한 설치 SW 인벤토리를 배정 좌석과 대사합니다.
          <b>배정 밖 설치</b>는 좌석 없이 설치된 무단 사용(추가 배정 또는 제거 대상), <b>미설치 좌석</b>은 배정됐으나
          설치가 관측되지 않은 회수 후보입니다. 수집 결과는 보유–사용 대사(STEP3)와 조치(STEP4)의 근거가 됩니다.
        </div>
      </Card>
    </>
  )
}
