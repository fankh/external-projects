import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { daysUntil, fmtAmount } from '@/lib/dates'
import { getStore } from '@/lib/store'

export const dynamic = 'force-dynamic'

export default async function ContractsPage() {
  await requireRole('ASSET_MGR', 'ADMIN')
  const s = getStore()
  const contracts = [...s.contracts].sort((a, b) => a.end.localeCompare(b.end))

  return (
    <>
      <ScreenHeader
        kicker="재고 · 계약 — Contracts · Licenses"
        title="계약 · 라이선스"
        desc="구매·유지보수 계약, SW 라이선스 보유/사용 대사, 만료·갱신 알림"
      />

      <Card kicker="Contracts" title="구매 · 유지보수 계약" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>계약번호</th><th>구분</th><th>계약명</th><th>공급사</th><th>주관부서</th>
                <th className="num">금액</th><th className="num">자산</th><th>만료일</th><th className="c">상태</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const d = daysUntil(c.end)
                return (
                  <tr key={c.id}>
                    <td className="code">{c.id}</td>
                    <td>{c.kind}</td>
                    <td className="strong">{c.name}</td>
                    <td>{c.vendor}</td>
                    <td className="mute">{c.ownerDept}</td>
                    <td className="num tnum">{fmtAmount(c.amount)}원</td>
                    <td className="num tnum">{c.assetCount}</td>
                    <td className="tnum">{c.end}</td>
                    <td className="c">
                      {d !== null && d < 0 ? <Chip tone="err">만료됨</Chip>
                        : d !== null && d <= 35 ? <Chip tone="err">D-{d}</Chip>
                        : d !== null && d <= 90 ? <Chip tone="warn">D-{d}</Chip>
                        : <Chip tone="ok">정상</Chip>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card kicker="License Compliance" title="SW 라이선스 보유 – 사용 대사" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>라이선스</th><th>공급사</th><th className="num">보유</th><th className="num">사용</th>
                <th style={{ width: 220 }}>보유–사용 대사</th><th>만료일</th><th className="c">판정</th>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>라이선스 리스크 양방향 관리.</b> 초과 사용(감사 리스크)과 미사용 보유(비용 낭비)를 동시에 검출합니다.
          사용 수집은 EDR·에이전트 설치 SW 인벤토리 기준이며, 미인가 SW 설치는 Discovery 모듈의 정책 위반 항목으로
          연계되어 보안담당에게 통보됩니다.
        </div>
      </Card>
    </>
  )
}
