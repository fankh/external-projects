import { ExportButton } from '@/components/ExportButton'
import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { missingContractDocs } from '@/lib/contract'
import { daysUntil } from '@/lib/dates'
import { contractHref } from '@/lib/reflink'
import { contractAssetCount, getStore } from '@/lib/store'
import { AddContract, ContractsTable } from './ContractsTable'
import { AddLicense, ExpiryNoticeButton, LicenseAction, LicenseRenew, LicenseRetire, LicenseSeats } from './LicenseActions'

export const dynamic = 'force-dynamic'

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const session = await requireRole('ASSET_MGR', 'ADMIN')
  const { sel } = await searchParams
  const s = getStore()
  const contracts = [...s.contracts].sort((a, b) => a.end.localeCompare(b.end))

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
          <ExportButton kind="contracts" role={session.role} label="계약·라이선스 엑셀" />
          <ExpiryNoticeButton due={dueCount} />
        </span>}>
        <AddContract />
        <ContractsTable rows={contracts.map((c) => ({ ...c, assetCount: contractAssetCount(c.id), d: daysUntil(c.end) }))} sel={sel} canEdit={['ASSET_MGR', 'ADMIN'].includes(session.role)} expiryWindowDays={s.opsPolicy.expiryWindowDays} />
      </Card>

      <Card kicker="License Compliance" title="SW 라이선스 보유 – 사용 대사" pad={false}>
        <AddLicense />
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>라이선스</th><th>공급사</th><th>근거 계약</th><th className="num">보유</th><th className="num">사용</th>
                <th style={{ width: 220 }}>보유–사용 대사</th><th>만료일</th><th className="c">판정</th><th className="c">조치</th>
              </tr>
            </thead>
            <tbody>
              {s.licenses.map((l) => {
                const ratio = Math.min((l.used / l.purchased) * 100, 100)
                const retired = l.status === '해지'
                // 근거 계약이 해지된 라이선스 — 구독 근거가 사라진 상태(계약 해지 연계 영향 v1.272 의 역방향). 이관·재계약 검토 필요.
                const baseTerminated = !!l.contractId && s.contracts.some((c) => c.id === l.contractId && c.status === '해지')
                // 만료 경과 — 유효 상태인데 만료일이 지난 라이선스(미갱신). 만료 라이선스 사용은 그 자체가 컴플라이언스 위반이므로
                // 초과·미사용과 별개로 갱신 필요를 명시한다. 만료 임박(창 안)과 달리 이미 지난 건이라 알림에서 누락되던 공백.
                const expired = !retired && l.expiry !== '-' && (daysUntil(l.expiry) ?? 0) < 0
                const over = !retired && l.used > l.purchased
                const low = !retired && !over && l.used / l.purchased < 0.6
                const canEditLic = ['ASSET_MGR', 'ADMIN'].includes(session.role)
                return (
                  <tr key={l.id} className={`${l.id === sel ? 'sel' : ''}`} style={retired ? { opacity: 0.6 } : undefined}>
                    <td className="strong">{l.name}</td>
                    <td className="mute">{l.vendor}</td>
                    <td className="code">{l.contractId
                      ? <span className="hstack" style={{ gap: 4, flexWrap: 'wrap' }}>
                          <a href={contractHref(l.contractId)} style={{ color: 'var(--accent-deep)' }} title="근거 계약으로 이동">{l.contractId}</a>
                          {baseTerminated && <Chip tone="err" bare>근거 해지</Chip>}
                        </span>
                      : <Chip tone="warn" bare>미연계</Chip>}</td>
                    <td className="num tnum">{l.purchased.toLocaleString()}</td>
                    <td className="num tnum" style={over ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{l.used.toLocaleString()}</td>
                    <td>
                      <div className="meter">
                        <div className="bar"><i className={over ? 'over' : low ? 'low' : ''} style={{ width: `${ratio}%` }} /></div>
                        <div className="lbl"><span>{Math.round((l.used / l.purchased) * 100)}%</span><span>{over ? `${l.used - l.purchased}석 초과` : `${l.purchased - l.used}석 여유`}</span></div>
                      </div>
                      {!retired && <LicenseSeats id={l.id} name={l.name} purchased={l.purchased} used={l.used} seats={l.seats ?? []} canEdit={canEditLic} />}
                    </td>
                    <td><LicenseRenew id={l.id} expiry={l.expiry} renewals={l.renewals?.length ?? 0} canEdit={!retired && canEditLic} /></td>
                    <td className="c">
                      <span className="hstack" style={{ gap: 3, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {expired && <Chip tone="err" bare>만료</Chip>}
                        {retired ? <Chip tone="neutral">해지</Chip> : over ? <Chip tone="err">초과 사용</Chip> : low ? <Chip tone="warn">미사용 보유</Chip> : <Chip tone="ok">적정</Chip>}
                      </span>
                    </td>
                    <td className="c" style={{ minWidth: 120 }}>
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                        {retired ? (
                          <span className="mut" style={{ fontSize: 11 }} title={`${l.terminatedAt ?? ''} 해지`}>해지됨</span>
                        ) : (
                          <>
                            <LicenseAction row={{
                              id: l.id, over, low, seats: Math.abs(l.used - l.purchased),
                              pendingApproval: s.approvals.find((a) => a.status === '대기' && a.refId === l.id)?.id,
                            }} />
                            {canEditLic && <LicenseRetire id={l.id} />}
                          </>
                        )}
                        <a className="btn sm ghost" href={`/api/license-card/${l.id}`} target="_blank" rel="noopener" title="라이선스 컴플라이언스 카드(SAM 감사용) 인쇄">🖨</a>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>검출에서 조치까지.</b> 초과 사용(감사 리스크)은 추가 구매 품의로, 미사용 보유(비용 낭비)는 회수로
          이어지며 두 조치 모두 결재를 거칩니다.
          사용 수집은 EDR·에이전트 설치 SW 인벤토리 기준이며, 미인가 SW 설치는 Discovery 모듈의 정책 위반 항목으로
          연계되어 보안담당에게 통보됩니다.
        </div>
      </Card>
    </>
  )
}
