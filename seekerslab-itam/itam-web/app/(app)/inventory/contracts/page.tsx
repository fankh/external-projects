import Link from 'next/link'
import { ExportButton } from '@/components/ExportButton'
import { Card, Chip, ScreenHeader, Stat } from '@/components/ui'
import { requireView } from '@/lib/authz'
import { missingContractDocs } from '@/lib/contract'
import { ratioPct, daysUntil, fmtAmount } from '@/lib/dates'
import { expiryNoticeTargets } from '@/lib/expiry'
import { buildLicenseUsage } from '@/lib/license-usage'
import { buildMaintenance } from '@/lib/maintenance'
import { buildProcurement } from '@/lib/procurement'
import { contractAssetCount, getStore } from '@/lib/store'
import { contractDocsTargets, maintenanceBudgetTargets, maintenanceExecTargets, maintenanceSlaTargets, procurementRemindTargets } from '@/lib/reminders'
import { AddContract, ContractsTable } from './ContractsTable'
import { AddLicense, ContractDocsButton, ExpiryNoticeButton } from './LicenseActions'
import { LicenseTable } from './LicenseTable'
import { MaintenanceBudgetButton, MaintenanceExecButton, MaintenanceSlaButton } from './MaintenanceActions'
import { ProcurementRemindButton, ProcurementSettleButton } from './ProcurementRemindButton'
import { SeatResolveCell } from './SeatResolveCell'
import { UsageCollect } from './UsageCollect'

export const dynamic = 'force-dynamic'

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ sel?: string; lic?: string; maint?: string; seat?: string; proc?: string; expiry?: string }> }) {
  const session = await requireView('/inventory/contracts', 'ASSET_MGR', 'ADMIN')
  const { sel, lic, maint: maintFilter, seat: seatFilter, proc: procFilter, expiry: expiryFilter } = await searchParams
  // ?expiry=soon — 대시보드 '만료 임박' KPI 의 드릴다운. 이 KPI 는 계약과 라이선스를 한 수로 합쳐 세는데
  //  화면엔 그 합집합을 여는 필터가 없어(계약 표·라이선스 표가 따로다) KPI 를 눌러도 전체 두 표가 열렸다.
  //  두 표를 같은 창(운영 정책 expiryWindowDays)으로 함께 좁히고, 합계를 KPI 와 맞댈 수 있게 적는다.
  const expiryPick = expiryFilter === 'soon'
  const inWindow = (end: string | undefined) => {
    const d = end ? daysUntil(end) : null
    return d !== null && d <= s.opsPolicy.expiryWindowDays
  }
  const s = getStore()
  const contractsAll = [...s.contracts].sort((a, b) => a.end.localeCompare(b.end))
  const contracts = expiryPick ? contractsAll.filter((c) => c.status !== '해지' && inWindow(c.end)) : contractsAll
  const usage = buildLicenseUsage()
  const maint = buildMaintenance()
  // 대시보드 유지보수·좌석 큐의 드릴다운 — 큐가 "SLA 위반 1건"이라 말하면 링크가 여는 화면도 그 1건을 보여야 한다.
  //  그동안 이 네 큐(예산 초과·소진 임박 / 미집행 / SLA 위반 / 미설치 좌석)만 필터 없이 계약 화면 맨 위로 보내,
  //  담당자가 긴 표에서 해당 계약을 눈으로 찾아야 했다(라이선스 큐는 ?lic= 로 이미 좁혀서 연다).
  const MAINT_FILTER: Record<string, { label: string; hit: (r: (typeof maint.rows)[number]) => boolean }> = {
    budget: { label: '예산 초과 · 소진 임박', hit: (r) => r.status === '예산 초과' || r.status === '소진 임박' },
    exec: { label: '미집행 (이행 확인)', hit: (r) => r.status === '미집행' },
    sla: { label: 'SLA 위반 (대응 시한 초과)', hit: (r) => r.slaBreach > 0 },
  }
  const maintPick = maintFilter ? MAINT_FILTER[maintFilter] : undefined
  const maintRows = maintPick ? maint.rows.filter(maintPick.hit) : maint.rows
  const seatPick = seatFilter === 'unused'
  // ?seat=off / ?proc=risk — 계약 화면에 남아 있던 마지막 두 큐의 드릴다운. '배정 밖 설치'와 '발주 미이행'은
  //  필터 없이 화면 맨 위로만 보내, 큐가 말한 건을 담당자가 긴 표에서 눈으로 찾아야 했다(유지보수·좌석 큐와 같은 규약).
  const offSeatPick = seatFilter === 'off'
  const usageRows = seatPick
    ? usage.rows.filter((r) => r.unusedSeat.length > 0)
    : offSeatPick
      ? usage.rows.filter((r) => r.offSeat.length > 0)
      : usage.rows
  // 라이선스도 같은 창으로 좁힌다 — 합계 문구가 두 표를 함께 세므로 목록도 함께 좁혀야 수와 목록이 맞는다.
  const expiringLicenses = s.licenses.filter((l) => l.status !== '해지' && inWindow(l.expiry))
  const shownLicenses = expiryPick ? expiringLicenses : s.licenses
  const proc = buildProcurement()
  const procPick = procFilter === 'risk'
  const procRows = procPick ? proc.rows.filter((r) => r.atRisk) : proc.rows
  const canEditLicense = ['ASSET_MGR', 'ADMIN'].includes(session.role)

  // 만료 임박 신규 통지 대상 — 발송 액션과 같은 lib/expiry 단일 소스(오늘 이미 보낸 대상 제외).
  //  화면이 창 안 대상 전부를 세고 액션만 당일 발송분을 빼면, 다 보낸 뒤에도 버튼이 전체 건수로 활성인 채
  //  눌러야 '신규 알림 대상이 없습니다'로 끝나는 드리프트가 된다(시드에도 당일 발송분이 있다).
  const dueCount = expiryNoticeTargets().count
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
          {docGap > 0 && ['ASSET_MGR', 'ADMIN'].includes(session.role) && <ContractDocsButton gap={contractDocsTargets().length} />}
          <ExportButton kind="contracts" role={session.role} label="계약·라이선스 엑셀" />
          <ExpiryNoticeButton due={dueCount} />
        </span>}>
        <AddContract />
        {expiryPick && (
          <div className="callout" style={{ margin: 14 }}>
            <b>만료 임박 필터({s.opsPolicy.expiryWindowDays}일 · 경과 포함)</b> — 계약 {contracts.length}건 · 라이선스 {expiringLicenses.length}건 · 합계 {contracts.length + expiringLicenses.length}건 · <Link href="/inventory/contracts">전체 보기</Link>
          </div>
        )}
        <ContractsTable rows={contracts.map((c) => ({ ...c, assetCount: contractAssetCount(c.id), d: daysUntil(c.end) }))} sel={sel} canEdit={['ASSET_MGR', 'ADMIN'].includes(session.role)} expiryWindowDays={s.opsPolicy.expiryWindowDays} />
      </Card>

      <Card
        kicker="Maintenance"
        title="유지보수 계약 관리 — 예산 집행 · SLA"
        pad={false}
        actions={<span className="hstack" style={{ gap: 10 }}>
          <span className="dim" style={{ fontSize: 11.5 }}>계약 {maint.rows.length}건 · 집행 {fmtAmount(maint.totalSpent)}/{fmtAmount(maint.totalAmount)}원</span>
          <MaintenanceBudgetButton alert={maintenanceBudgetTargets().length} />
          <MaintenanceExecButton alert={maintenanceExecTargets().length} />
          <MaintenanceSlaButton alert={maintenanceSlaTargets().length} />
        </span>}
      >
        {maintPick && (
          <div className="callout" style={{ margin: 14 }}>
            <b>{maintPick.label} 필터</b> — {maintRows.length}건 표시 (전체 {maint.rows.length}건) · <Link href="/inventory/contracts">전체 보기</Link>
          </div>
        )}
        <div className="stat-row" style={{ margin: 14 }}>
          <Stat value={`${ratioPct(maint.totalSpent, maint.totalAmount)}%`} label="전체 집행률" delta={{ text: `잔여 ${fmtAmount(maint.totalAmount - maint.totalSpent)}원`, dir: 'flat' }} />
          <Stat value={maint.rows.length} label="유지보수 계약" />
          <Stat value={maint.overBudget} label="예산 초과" tone={maint.overBudget ? 'err' : 'ok'} />
          <Stat value={maint.execAlert} label="미집행 (이행 확인)" tone={maint.execAlert ? 'warn' : 'ok'} />
          <Stat value={maint.noSla} label="SLA 미설정" tone={maint.noSla ? 'warn' : 'ok'} />
          <Stat value={maint.slaBreachAlert} label="SLA 위반 (대응 시한 초과)" tone={maint.slaBreachAlert ? 'err' : 'ok'} />
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
              {maintRows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td>
                  <td className="mute">{r.vendor}</td>
                  <td className="num tnum">{fmtAmount(r.amount)}원</td>
                  <td className="num tnum">{fmtAmount(r.spent)}원</td>
                  <td className="num tnum" style={{ fontWeight: 700 }}>{r.rate}%</td>
                  <td className="num tnum">{fmtAmount(r.remaining)}원</td>
                  <td className="c tnum">{r.covered}</td>
                  <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>
                    {r.sla ? <span className="dim" style={{ fontSize: 11 }}>{r.sla}</span> : <Chip tone="warn" bare>미설정</Chip>}
                    {r.slaBreach > 0 && <><br /><Chip tone="err">SLA 위반 — 대응 {r.slaResponseDays}일 초과 {r.slaBreach}건 ({r.breachAssetNos.join(', ')})</Chip></>}
                  </td>
                  <td className="tnum">{r.end}</td>
                  <td className="c"><Chip tone={r.status === '예산 초과' ? 'err' : r.status === '소진 임박' || r.status === '미집행' ? 'warn' : 'ok'}>{r.status}</Chip></td>
                </tr>
              ))}
              {maintRows.length === 0 && <tr><td colSpan={10}><div className="empty">{maintPick ? `${maintPick.label} 대상 계약이 없습니다` : '유지보수 계약이 없습니다'}</div></td></tr>}
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
          <span className="dim" style={{ fontSize: 11.5 }}>구매 계약 {proc.rows.length}건 · 발주 {fmtAmount(proc.totalOrdered)}/{fmtAmount(proc.totalAmount)}원{proc.atRisk.length > 0 ? ` · 미이행 위험 ${proc.atRisk.length}` : ''}</span>
          <ProcurementRemindButton atRisk={procurementRemindTargets().length} />
          <ProcurementSettleButton settleable={proc.settleable.length} />
        </span>}
      >
        {procPick && (
          <div className="callout" style={{ margin: 14 }}>
            <b>발주 미이행 · 만료 임박 필터</b> — 구매 계약 {procRows.length}건 표시 · 전체 {proc.rows.length}건 · <Link href="/inventory/contracts">전체 보기</Link>
          </div>
        )}
        <div className="stat-row" style={{ margin: 14 }}>
          <Stat value={`${ratioPct(proc.totalOrdered, proc.totalAmount)}%`} label="전체 발주 소진률" delta={{ text: `발주 여력 ${fmtAmount(proc.totalAmount - proc.totalOrdered)}원`, dir: 'flat' }} />
          <Stat value={proc.rows.length} label="구매 계약 (발주 대상)" />
          <Stat value={proc.atRisk.length} label="발주 미이행 · 만료 임박" tone={proc.atRisk.length ? 'err' : 'ok'} />
          <Stat value={fmtAmount(proc.totalInspected)} label="검수 완료액 (정산 근거)" />
          <Stat value={proc.settleable.length} label="정산 종결 가능 (전량 검수 완료)" tone={proc.settleable.length ? 'warn' : 'ok'} />
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
              {procRows.map((r) => (
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
                  <td className="c">{r.settled ? <Chip tone="neutral">정산 완료 {r.settledAt}</Chip> : r.atRisk ? <Chip tone="err">발주 미이행</Chip> : r.settleable ? <Chip tone="warn">정산 종결 가능</Chip> : r.pendingInspection > 0 ? <Chip tone="warn">검수 진행</Chip> : <Chip tone="ok">정상</Chip>}</td>
                </tr>
              ))}
              {procRows.length === 0 && <tr><td colSpan={10}><div className="empty">{procPick ? '발주 미이행 · 만료 임박 계약이 없습니다 — 필터를 해제하면 전체가 보입니다' : '등록된 구매 계약이 없습니다'}</div></td></tr>}
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
          rows={shownLicenses.map((l) => ({
            ...l,
            d: daysUntil(l.expiry),
            // 근거 계약이 해지된 라이선스 — 구독 근거가 사라진 상태(계약 해지 연계 영향 v1.272 의 역방향). 이관·재계약 검토 필요.
            baseTerminated: !!l.contractId && s.contracts.some((c) => c.id === l.contractId && c.status === '해지'),
            pendingApproval: s.approvals.find((a) => a.status === '대기' && a.refId === l.id)?.id,
            // 잔여 설치 대수 — 해지해도 좌석·설치는 남는데 해지 라이선스는 사용 수집 대사에서 빠져 시야에서 사라진다.
            //  해지 행에 남은 규모를 그대로 보여 제거(언인스톨) 대상을 놓치지 않게 한다(해지 응답·통보와 같은 수치).
            installCount: (s.swInstalls ?? []).filter((i) => i.licenseId === l.id).length,
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
        {seatPick && (
          <div className="callout" style={{ margin: 14 }}>
            <b>미설치 좌석(회수 후보) 필터</b> — 라이선스 {usageRows.length}건 표시 · 좌석 {usage.totalUnusedSeat}석 · <Link href="/inventory/contracts">전체 보기</Link>
          </div>
        )}
        {offSeatPick && (
          <div className="callout" style={{ margin: 14 }}>
            <b>배정 밖 설치(무단 사용) 필터</b> — 라이선스 {usageRows.length}건 표시 · 설치 {usage.totalOffSeat}건 · <Link href="/inventory/contracts">전체 보기</Link>
          </div>
        )}
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
              {usageRows.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.name}</td>
                  <td className="num tnum">{r.purchased}</td>
                  <td className="num tnum">{r.seatCount}</td>
                  <td className="num tnum">{r.installCount}</td>
                  <td className="num tnum">{r.matched}</td>
                  <td><SeatResolveCell licenseId={r.id} kind="offSeat" canEdit={canEditLicense} assets={r.offSeat.map((o) => ({ assetNo: o.assetNo, label: o.dept, status: o.status }))} /></td>
                  <td><SeatResolveCell licenseId={r.id} kind="unusedSeat" canEdit={canEditLicense} assets={r.unusedSeat.map((u) => ({ assetNo: u.assetNo, label: u.user }))} /></td>
                  <td className="tnum">{r.collectedAt ?? <span className="dim">미수집</span>}</td>
                </tr>
              ))}
              {usageRows.length === 0 && <tr><td colSpan={8}><div className="empty">{seatPick ? '미설치 좌석(회수 후보)이 있는 라이선스가 없습니다' : offSeatPick ? '배정 밖 설치(무단 사용)가 있는 라이선스가 없습니다' : '대사 대상 라이선스가 없습니다'}</div></td></tr>}
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
