import { ExportButton } from '@/components/ExportButton'
import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { daysUntil } from '@/lib/dates'
import { contractAssetCount, getStore } from '@/lib/store'
import { EXPIRY_WINDOW_DAYS } from '@/lib/types'
import { AddContract, ContractsTable } from './ContractsTable'
import { AddLicense, ExpiryNoticeButton, LicenseAction } from './LicenseActions'

export const dynamic = 'force-dynamic'

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ sel?: string }> }) {
  const session = await requireRole('ASSET_MGR', 'ADMIN')
  const { sel } = await searchParams
  const s = getStore()
  const contracts = [...s.contracts].sort((a, b) => a.end.localeCompare(b.end))

  // 만료 임박 대상 — 계약·라이선스·보증(부서 단위 묶음)을 합친 발송 예정 건수
  const within = (end: string) => {
    const d = daysUntil(end)
    return d !== null && d <= EXPIRY_WINDOW_DAYS
  }
  const warrantyDepts = new Set(
    s.assets
      .filter((a) => a.warrantyEnd !== '-' && !['폐기완료', '폐기예정'].includes(a.status) && within(a.warrantyEnd))
      .map((a) => a.dept),
  )
  const dueCount =
    contracts.filter((c) => c.status !== '해지' && within(c.end)).length +
    s.licenses.filter((l) => l.expiry !== '-' && within(l.expiry)).length +
    warrantyDepts.size

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Contracts · Licenses"
        title="계약 · 라이선스"
        desc="구매·유지보수 계약, SW 라이선스 보유/사용 대사, 만료·갱신 알림"
      />

      <Card kicker="Contracts" title="구매 · 유지보수 계약" pad={false}
        actions={<span className="hstack" style={{ gap: 8 }}>
          <ExportButton kind="contracts" role={session.role} label="계약·라이선스 엑셀" />
          <ExpiryNoticeButton due={dueCount} />
        </span>}>
        <AddContract />
        <ContractsTable rows={contracts.map((c) => ({ ...c, assetCount: contractAssetCount(c.id), d: daysUntil(c.end) }))} sel={sel} canEdit={['ASSET_MGR', 'ADMIN'].includes(session.role)} />
      </Card>

      <Card kicker="License Compliance" title="SW 라이선스 보유 – 사용 대사" pad={false}>
        <AddLicense />
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>라이선스</th><th>공급사</th><th className="num">보유</th><th className="num">사용</th>
                <th style={{ width: 220 }}>보유–사용 대사</th><th>만료일</th><th className="c">판정</th><th className="c">조치</th>
              </tr>
            </thead>
            <tbody>
              {s.licenses.map((l) => {
                const ratio = Math.min((l.used / l.purchased) * 100, 100)
                const over = l.used > l.purchased
                const low = !over && l.used / l.purchased < 0.6
                return (
                  <tr key={l.id}>
                    <td className="strong">{l.name}</td>
                    <td className="mute">{l.vendor}</td>
                    <td className="num tnum">{l.purchased.toLocaleString()}</td>
                    <td className="num tnum" style={over ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{l.used.toLocaleString()}</td>
                    <td>
                      <div className="meter">
                        <div className="bar"><i className={over ? 'over' : low ? 'low' : ''} style={{ width: `${ratio}%` }} /></div>
                        <div className="lbl"><span>{Math.round((l.used / l.purchased) * 100)}%</span><span>{over ? `${l.used - l.purchased}석 초과` : `${l.purchased - l.used}석 여유`}</span></div>
                      </div>
                    </td>
                    <td className="tnum">{l.expiry}</td>
                    <td className="c">
                      {over ? <Chip tone="err">초과 사용</Chip> : low ? <Chip tone="warn">미사용 보유</Chip> : <Chip tone="ok">적정</Chip>}
                    </td>
                    <td className="c" style={{ minWidth: 120 }}>
                      <span className="hstack" style={{ gap: 4, justifyContent: 'center' }}>
                        <LicenseAction row={{
                          id: l.id, over, low, seats: Math.abs(l.used - l.purchased),
                          pendingApproval: s.approvals.find((a) => a.status === '대기' && a.refId === l.id)?.id,
                        }} />
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
